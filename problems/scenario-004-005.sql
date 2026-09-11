-- ステージ4〜5 の場面（scenario）を投入
-- 出典: problems/scenario-004-005.data.mjs / 票: tasks/A4-問題に実務の文脈を足す.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- 入れ直すときは node problems/scenario-update.mjs <データファイル>

begin;

-- ステージ4: コピーされる値・共有される値 ─ プリミティブと参照
update public.problems set scenario = '設定の初期値を作っている部分について、後輩から相談を受けた。
一緒に読んでみることになった。' where "order" = 4;

-- ステージ5: 参照が共有されたまま渡される関数を読む
update public.problems set scenario = '同僚から、この関数のレビューを頼まれた。
上のコメントに書いてあるとおりに動くかを見てほしいとのこと。' where "order" = 5;

commit;
