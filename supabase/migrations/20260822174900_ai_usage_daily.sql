-- AI採点の1日あたりの使用量（D1・2026-08-22）
--
-- 目的は2つ。**どちらも user_attempts を数える方式では満たせない。**
--
--   1. 同時に叩かれても上限を超えさせない
--      `count → 判定 → 採点` は不可分ではない。既存の安全網（route.ts の RATE_LIMITS）は
--      保存済みの行を数えるので、並列リクエストは全部が同じ古い件数を見て通り抜ける。
--      route.ts の `inFlight` はプロセス内の Set なので、サーバーが複数に分かれると効かない。
--      ここでは行ロックを取って +1 するので、並列は必ず直列化される。
--
--   2. 「採点1回」だけを数える
--      行の数は採点の回数ではない。ステージ解放のために入れた行（problems/unlock-seed.mjs）は
--      採点していないのに枠を食い、逆に採点が失敗すると行が作られないので枠を食わない
--      ── つまり**失敗を誘発するループはタダで OpenAI を叩ける**。
--      このテーブルは「OpenAI を呼ぶ直前」にだけ増える。
--
-- 【適用】supabase db push

begin;

-- ============================================================
-- テーブル
-- ============================================================

create table public.ai_usage_daily (
  -- 日付は JST。サーバーの時刻に依存させないため、決めるのは必ず SQL 側（下の関数）。
  -- アプリ側で計算すると「表示は昨日・強制は今日」のようなズレが静かに入る
  jst_date date not null,
  -- **users への外部キーを張らない。** 全体の使用量を同じ表の1行として持つため
  -- （user_id = 全ゼロの UUID）。users に無い id を入れる必要がある。
  -- 退会時の削除は lib/account.ts の DELETE_TARGETS が明示的に行う
  -- （cascade に頼れないので、あちらを消すとこの表だけ残る）
  user_id uuid not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (jst_date, user_id)
);

alter table public.ai_usage_daily enable row level security;

-- ポリシーは意図的に作らない（problems と同じ扱い）。
-- 読み書きともサーバー（service_role）経由のみ。anon に update を許すと
-- 自分の used を 0 に戻せる ── つまり上限がそのまま無効になる。
--
-- ポリシーが無いことは下の関数の安全装置にもなっている。
-- 関数は security invoker（既定）なので、万一 execute 権限が anon まで漏れても
-- RLS で insert が拒否されて例外になり、**通す方向には倒れない**。
-- security definer にすると、その場合に他人の枠を焼ける関数になる

comment on table public.ai_usage_daily is
  'AI採点の1日（JST）あたりの使用量。user_id が全ゼロの行はサービス全体の合計';

-- ============================================================
-- 消費（予約）
-- ============================================================

-- OpenAI を呼ぶ直前に1回だけ呼ぶ。上限に達していれば増やさずに false を返す。
--
-- 上限値を引数で受けるのは、値をアプリ側（lib/ai/quota.ts）の1箇所に置くため。
-- SQL にも定数を書くと、片方だけ変えたときに画面の残数と実際の強制がズレる。
create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_user_limit integer,
  p_global_limit integer
)
returns table (allowed boolean, blocked_by text, user_used integer, global_used integer)
language plpgsql
-- **volatile（既定）のままにすること。** stable / immutable を付けると
-- PostgREST が読み取り専用トランザクションで実行するので、`for update` と update が失敗する。
-- 下の peek_ai_quota は読むだけなので stable にしてある（そちらは読み取り専用で構わない）。
--
-- security definer にしない（上のコメント参照）。
-- search_path は固定する（関数内の参照を呼び出し側の設定で差し替えられないように）
set search_path = public, pg_temp
as $$
declare
  -- 全体の合計を入れる行。users に存在しない id なので、
  -- 個人の行と衝突しない（外部キーを張っていないのはこのため）
  c_global constant uuid := '00000000-0000-0000-0000-000000000000';
  v_date date := (now() at time zone 'Asia/Tokyo')::date;
  v_user_used integer;
  v_global_used integer;
begin
  -- 全体行を本人として渡されたら、全体の枠を個人の枠として使えてしまう
  if p_user_id is null or p_user_id = c_global then
    raise exception 'consume_ai_quota: p_user_id が不正';
  end if;
  if p_user_limit is null or p_global_limit is null then
    raise exception 'consume_ai_quota: 上限が渡されていない';
  end if;

  -- 行が無ければ作る。**この順序（全体 → 本人）は下のロックと必ず揃える。**
  -- 逆順で取る経路が1つでもあると、並列時にデッドロックになる
  insert into public.ai_usage_daily (jst_date, user_id)
    values (v_date, c_global) on conflict do nothing;
  insert into public.ai_usage_daily (jst_date, user_id)
    values (v_date, p_user_id) on conflict do nothing;

  -- for update が並列リクエストを直列化する。**この関数の要点はここだけ。**
  -- 外して素の select にすると、同時に来た2件が同じ used を読んで両方通る
  select used into v_global_used from public.ai_usage_daily
    where jst_date = v_date and user_id = c_global for update;
  select used into v_user_used from public.ai_usage_daily
    where jst_date = v_date and user_id = p_user_id for update;

  -- 行が読めないのは insert が RLS で弾かれたときなど。
  -- NULL のまま下の比較に落とすと `null >= 上限` が NULL になり、
  -- if を素通りして「上限なしで通す」方向に倒れる。**必ず例外にする**
  if v_user_used is null or v_global_used is null then
    raise exception 'consume_ai_quota: 使用量の行が読めない';
  end if;

  -- 本人の上限を先に見る。両方超えていても、本人には本人の事情を返したい
  -- （呼び出し側は本人=判定保留・全体=503 と扱いを分けている）
  if v_user_used >= p_user_limit then
    return query select false, 'user'::text, v_user_used, v_global_used;
    return;
  end if;
  if v_global_used >= p_global_limit then
    return query select false, 'global'::text, v_user_used, v_global_used;
    return;
  end if;

  update public.ai_usage_daily
    set used = used + 1, updated_at = now()
    where jst_date = v_date and user_id in (c_global, p_user_id);

  return query select true, null::text, v_user_used + 1, v_global_used + 1;
end;
$$;

-- ============================================================
-- 返却
-- ============================================================

-- **課金されていないと分かった失敗のときだけ**呼ぶ（OpenAI が 429 / 5xx を返した場合）。
-- 応答が返ってきた失敗（JSON が壊れている等）はトークンが課金済みなので返さない。
-- 全部の失敗で返すと、失敗を誘発するリクエストで実質無制限に OpenAI を叩ける。
create or replace function public.refund_ai_quota(p_user_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c_global constant uuid := '00000000-0000-0000-0000-000000000000';
  v_date date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if p_user_id is null or p_user_id = c_global then
    raise exception 'refund_ai_quota: p_user_id が不正';
  end if;

  -- greatest で 0 止め。返し過ぎ（二重返却など）でマイナスにすると
  -- その日の上限が実質増える。
  --
  -- **2文に分けて「全体 → 本人」の順に更新する。** in (...) の1文だと
  -- ロックを取る順番が Postgres 任せになり、consume 側（全体 → 本人）と
  -- 逆順になった瞬間にデッドロックしうる（片方が abort する）
  update public.ai_usage_daily
    set used = greatest(used - 1, 0), updated_at = now()
    where jst_date = v_date and user_id = c_global;
  update public.ai_usage_daily
    set used = greatest(used - 1, 0), updated_at = now()
    where jst_date = v_date and user_id = p_user_id;
end;
$$;

-- ============================================================
-- 参照（残数の表示）
-- ============================================================

-- 増やさずに読むだけ。ステージ画面の「きょうの AI 採点」がこれを使う。
-- **強制と同じ日付の決め方（SQL 側の JST）を通ることが目的。**
-- 画面が自分で日付を計算すると、日付の境目で残数と実際がズレる
create or replace function public.peek_ai_quota(p_user_id uuid)
returns table (user_used integer, global_used integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    coalesce(max(used) filter (where user_id = p_user_id), 0)::integer,
    coalesce(
      max(used) filter (where user_id = '00000000-0000-0000-0000-000000000000'::uuid),
      0
    )::integer
  from public.ai_usage_daily
  where jst_date = (now() at time zone 'Asia/Tokyo')::date;
$$;

-- ============================================================
-- 権限
-- ============================================================

-- **Postgres は関数の EXECUTE を既定で PUBLIC に配る。**
-- Supabase の既定権限では anon / authenticated にも付く。
-- 消さないと、ブラウザの anon キーから consume_ai_quota(<他人の id>, 1, 1) を叩いて
-- 他人の枠を焼ける（全体行を膨らませれば全員を止められる）。
-- 呼ぶのはサーバーの service_role だけなので、それ以外から取り上げる
revoke execute on function public.consume_ai_quota(uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.refund_ai_quota(uuid) from public, anon, authenticated;
revoke execute on function public.peek_ai_quota(uuid) from public, anon, authenticated;

grant execute on function public.consume_ai_quota(uuid, integer, integer) to service_role;
grant execute on function public.refund_ai_quota(uuid) to service_role;
grant execute on function public.peek_ai_quota(uuid) to service_role;

commit;
