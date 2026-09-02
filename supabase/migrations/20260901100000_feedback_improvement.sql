-- E13: 作者へのメッセージ（改善要望）を problem_feedback に相乗りさせる。
--
-- 3つ目の kind = 'improvement'。既存2種（異議・誤り報告）は
-- 「1問1件・再送は上書き」のままだが、改善要望は思いついたときに
-- 何度でも送るものなので、件数の縛りから外す。
--
-- unique 制約（全 kind 対象）は部分ユニークインデックス（既存2種のみ）に置き換える。
-- ⚠️ 部分インデックスは PostgREST の upsert（ON CONFLICT (cols)）から推論できないため、
-- API 側の書き直しは「insert → 23505 なら update」に変えてある（app/api/feedback/route.ts）。

alter table public.problem_feedback
  drop constraint problem_feedback_user_id_problem_id_kind_key;

alter table public.problem_feedback
  drop constraint problem_feedback_kind_check;

alter table public.problem_feedback
  add constraint problem_feedback_kind_check
  check (kind in ('score_dispute', 'problem_error', 'improvement'));

-- 既存2種の「同じ問題への同種の報告は1人1件」は保つ（連打・スパムの安い歯止め）。
-- 改善要望の連打はアプリ側の1日上限（lib/feedback.ts の IMPROVEMENT_DAILY_LIMIT）で止める
create unique index problem_feedback_one_per_kind
  on public.problem_feedback (user_id, problem_id, kind)
  where kind in ('score_dispute', 'problem_error');
