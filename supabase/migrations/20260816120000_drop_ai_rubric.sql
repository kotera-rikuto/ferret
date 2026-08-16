-- ai_rubric の削除
-- 作成: 2026-08-16
--
-- rubric_items（4観点のルーブリック）に置き換わり、採点経路から外れた。
-- 20260816090000 の時点ではまだ lib/ai/scorer.ts と app/api/score/route.ts から
-- 参照されていたため残していたが、scorer.ts の v3 書き換えで参照がなくなったので削除する。
--
-- 残しておくと「埋めれば採点に効くのだろう」と誤解して記入され、
-- しかし一切読まれない、という最悪の状態になる。読まれない項目は消す。

begin;

alter table public.problems
  drop column ai_rubric;

commit;
