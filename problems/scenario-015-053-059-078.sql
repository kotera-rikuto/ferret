-- ステージ15・53・59・78 の場面（scenario）を投入
-- 出典: problems/scenario-015-053-059-078.data.mjs / 票: tasks/A4-問題に実務の文脈を足す.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- 入れ直すときは node problems/scenario-update.mjs <データファイル>

begin;

-- ステージ15: 関数宣言 ─ 入口（引数）と出口（戻り値）を掴む
update public.problems set scenario = '送料の決まり方について、サポートから問い合わせが来た。
コードを見て説明することになった。' where "order" = 15;

-- ステージ53: 命名とコメントから意図を読む ─ 中身を見ずに責務を答える
update public.problems set scenario = '新しく入ったチームで、記事まわりを担当することになった。
まずファイルを開いて、全体を眺めてみる。' where "order" = 53;

-- ステージ59: スタックトレースを読む ─ ログから原因の行を特定する
update public.problems set scenario = '承認の通知まわりを見てほしいと頼まれた。
手元には、そのときの実行結果が残っている。' where "order" = 59;

-- ステージ78: テストコードを読む① ─ テストから関数の仕様を答える
update public.problems set scenario = '引き継いだコードから、まだ使ったことのない部品を呼ぶことになった。
手元にあるのはテストだけなので、そこから読む。' where "order" = 78;

commit;
