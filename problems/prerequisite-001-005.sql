-- ステージ1〜5に前提知識（problems.prerequisite）を追記する
-- 生成: 2026-08-17 / 出典: tasks/E4-問題データに欄を足す.md ⑤
--
-- 【適用済み】2026-08-17。PostgREST（service_role）経由で同内容を反映済み。
-- 再実行しても同じ値を入れるだけなので何度流しても構わない。
--
-- 書くときの制約（ideas/問題作成ガイド.md「任意の2欄」）:
--   1. 答えを書かない。「const は入れ替えられない」は前提知識、
--      「だからここでエラーになる」は答え
--   2. model_answer から文を写さない（I-816 が落とす）
--   3. 採点キーワードのうち **コードに出てこない語** を書かない（I-817 が落とす）。
--      コードに書かれている語（const / push / typeof など）は隠しても画面から読めるので書いてよい
--
-- context（実行結果）はこの5問には入れない。どれも影響型ではなく、
-- 実行ログを読ませる設問になっていないため。

begin;

-- ステージ1: const と let（トレース）
-- 「再代入」「エラー」はキーワードかつコードに無いので使わない。
update public.problems set prerequisite =
  'const と let はどちらも変数の宣言です。const は最初に入れた値を後から入れ替えられず、let は入れ替えられます。'
where "order" = 1;

-- ステージ2: var が混ざったコードの読み方（ズレ）
-- var / if はコードに出ているので書ける。「ブロックスコープ」はキーワードなので使わない
-- （語の定義だけ置き、var がそれを持たないことは書かない ── それが答え）。
update public.problems set prerequisite =
  'var は let / const より前からある変数の宣言です。いまのコードではあまり書かれませんが、既存のコードには残っています。なお「ブロック」とは、for や if の { } で囲まれた範囲のことです。'
where "order" = 2;

-- ステージ3: 基本型と「無い」の2種類（トレース）
-- 「キー」「undefined」はキーワードかつコードに無いので使わない。
-- typeof の説明だけに絞る（例に出す型は object 以外にする。object もキーワード）。
update public.problems set prerequisite =
  'typeof は、値の種類を文字列で返す演算子です。console.log(typeof x) と書くと "number" や "string" のような文字列が出ます。'
where "order" = 3;

-- ステージ4: コピーされる値・共有される値（トレース）
-- 「参照」「複製」「コピー」「プリミティブ」「オブジェクト」はすべてキーワードなので使わない。
-- 残る前提知識は === の意味（true はコードに出ている）。
update public.problems set prerequisite =
  '=== は、左右が同じかどうかを判定する演算子です。結果は true か false になります。'
where "order" = 4;

-- ステージ5: 参照が共有されたまま渡される関数を読む（ズレ）
-- 「引数」「参照」「別名」「共有」はキーワードかつコードに無いので使わない。
update public.problems set prerequisite =
  'push は、配列の末尾に要素を足すメソッドです。読み方は「プッシュ」。'
where "order" = 5;

commit;

-- 確認（5件とも 400字以内・NULL でないこと）
-- select "order", char_length(prerequisite) from public.problems
-- where prerequisite is not null order by "order";
