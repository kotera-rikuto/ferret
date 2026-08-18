-- user_attempts に「よかったところ」「つぎの一歩」を分けて保存する欄を足す
-- 作成: 2026-08-18（tasks/E2）
--
-- 採点AI はもともと praise / next_focus の2項目で文章を返しており、
-- NGワードの検査も項目ごとに独立して行っている（片方が違反しても、もう片方は残す）。
-- ところが lib/ai/scorer.ts が [praise, next].join(" ") で1本に潰してから
-- ai_feedback に保存していたため、画面で2枠に分けられず、
-- **どちらが差し替えられたのかも後から分からなくなっていた。**
--
-- ai_feedback は消さない。過去の行にはつなげた文章しか入っておらず復元できないため、
-- そちらは今までどおり1枠で表示する。新しい行では3つとも保存する。
--
-- どちらも NULL 可。既存の行があるテーブルに必須の欄は足さない（tasks/README.md）。
-- 文字数の上限は DB 側に置かない。長さの検査は lib/ai/scorer.ts の
-- FEEDBACK_MAX_CHARS が保存前に行っており、両方に書くと2か所で別々に育つ。
--
-- 採点の物差し（grader_version）は上げない。点の付け方は1つも変えていないので、
-- 上げると過去の結果が別扱いになり、ゴールデンセットの実測値と混ざらなくなる。

begin;

alter table public.user_attempts
  add column ai_praise text,
  add column ai_next_focus text;

comment on column public.user_attempts.ai_praise is
  'AI が書いた「よかったところ」（NGワード検査後の本文）。NULL は、この欄が無かった頃の行か、検査で空になった回。表示は空の枠を出さない';

comment on column public.user_attempts.ai_next_focus is
  'AI が書いた「つぎの一歩」（NGワード検査後の本文）。NULL の扱いは ai_praise と同じ';

commit;
