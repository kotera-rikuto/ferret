-- refund_ai_quota を consume と対称にする（D1 の追い直し・2026-08-22）
--
-- 【直したこと】**本人の行が無い（または既に0）ときでも、全体の行だけが減っていた。**
--
-- 全体の行はサービス全体の使用量なので、これが減ると
-- **その日に流せる採点の総数が実際の消費より増える** ── 天井が静かに上へずれる。
-- 二重に返却した場合、返却だけを何度も呼べた場合、いずれも同じ向きに崩れる。
--
-- 実DBのテスト（I-685）で踏んだ。行が無い相手に2回返却したら全体が 1 → 0 になった。
--
-- 【直し方】本人の行を先に1つ減らし、**実際に減ったときだけ**全体を減らす。
-- これで「返せるのは、その人が本当に取ったぶんだけ」になる。
--
-- ロックの順番は consume_ai_quota と同じ「全体 → 本人」に揃えてある。
-- 逆順で取ると、並列時に consume とデッドロックする（片方が abort する）。

begin;

create or replace function public.refund_ai_quota(p_user_id uuid)
returns void
language plpgsql
-- volatile（既定）のまま。stable を付けると読み取り専用トランザクションで動いて update が失敗する
set search_path = public, pg_temp
as $$
declare
  c_global constant uuid := '00000000-0000-0000-0000-000000000000';
  v_date date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if p_user_id is null or p_user_id = c_global then
    raise exception 'refund_ai_quota: p_user_id が不正';
  end if;

  -- 先に全体行のロックだけ取る（consume と同じ順序にするため。値はまだ変えない）
  perform 1 from public.ai_usage_daily
    where jst_date = v_date and user_id = c_global for update;

  -- 本人のぶんを1つ戻す。`used > 0` を条件に入れてあるので、
  -- 行が無い・既に0のときは1行も更新されない
  update public.ai_usage_daily
    set used = used - 1, updated_at = now()
    where jst_date = v_date and user_id = p_user_id and used > 0;

  -- **本人のぶんが戻らなかったのなら、全体も触らない。** ここが今回の修正点
  if not found then
    return;
  end if;

  update public.ai_usage_daily
    set used = greatest(used - 1, 0), updated_at = now()
    where jst_date = v_date and user_id = c_global;
end;
$$;

-- 関数を作り直すと権限は既定に戻る。取り上げ直す
-- （Postgres は EXECUTE を既定で PUBLIC に配り、Supabase では anon / authenticated にも付く）
revoke execute on function public.refund_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(uuid) to service_role;

commit;
