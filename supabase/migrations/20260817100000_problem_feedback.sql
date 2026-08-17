-- 異議申し立て（採点に納得できない）と問題の誤り報告を貯める箱。
--
-- 「本当に正しいのに低得点」は自由記述の採点では必ず起きる
-- （ideas/採点システム_残課題.md「異議申し立ての導線」）。
-- 押された回答はゴールデンセット（採点精度の検証データ）の材料になる。

create table public.problem_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  problem_id integer not null references public.problems (id) on delete cascade,
  -- どの採点への申し立てか。回答の行が消えても報告自体は残す
  attempt_id uuid references public.user_attempts (id) on delete set null,
  kind text not null check (kind in ('score_dispute', 'problem_error')),
  -- コメントUIは未実装だが、後からカラムを足すとNULLの意味が2通りになるので先に切っておく
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  -- 連打・スパムの安い歯止め。同じ問題への同種の報告は1人1件
  unique (user_id, problem_id, kind)
);

alter table public.problem_feedback enable row level security;

-- ポリシーは意図的に作らない。読み書きともサーバー（service_role）経由のみ。
-- anon に insert を許すと kind や problem_id を偽装した行を無制限に作れる
