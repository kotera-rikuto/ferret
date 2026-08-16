-- problems の後片付け
-- 作成: 2026-08-16
--
-- 【前提】problems が 0件の状態で適用する。
--   title を NOT NULL にするため、title が空の行があると失敗する。

begin;

-- title を必須にする。
--
-- v2 で後から追加したカラムのため NULL 許容のままだった。
-- 画面側は `problem.title ?? ` + `Stage ${order}` でフォールバックしているため
-- （app/stages/page.tsx:45, app/problems/[id]/page.tsx:34,51）、
-- タイトルを入れ忘れた問題があっても見た目には正常に見えてしまい気づけない。
-- 100問を投入する前に締めておく。
alter table public.problems
  alter column title set not null;

-- 未使用カラムを削除。
--
-- v2 では「将来ユーザー回答をベクトル化してつまずき傾向を分析する」用途で
-- 保留するとしていたが、その分析で必要になるのは user_attempts.answer の
-- ベクトルであって、problems.model_answer のベクトルではない。
-- つまりこのカラムは、残す理由として挙げられていた用途にも使えない。
--
-- コードからの参照もゼロ（grep 済み）。必要になれば1行で戻せる:
--   alter table public.problems add column model_answer_embedding vector(1536);
alter table public.problems
  drop column model_answer_embedding;

commit;

-- ============================================================
-- 未着手: ai_rubric の削除
-- ============================================================
-- rubric_items に置き換わったが、まだ以下から参照されているため残してある。
--   lib/ai/scorer.ts:28   ProblemForScoring.ai_rubric
--   lib/ai/scorer.ts:86   プロンプトへの差し込み
--   app/api/score/route.ts:41
-- scorer.ts の v3 書き換えと同じタイミングで、コードと一緒に消すこと。
--
--   alter table public.problems drop column ai_rubric;
--
-- ============================================================
-- 備考: pgvector 拡張
-- ============================================================
-- vector 型を使うカラムは無くなったが、拡張自体は残す。
-- 有効なままでもコストは無く、将来 user_attempts 側で使う可能性があるため。
