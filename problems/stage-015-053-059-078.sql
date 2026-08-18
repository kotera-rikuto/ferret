-- ステージ15 / 53 / 59 / 78 投入（読解型 意図・命名・影響・仕様 の検証セット）
-- 生成: 2026-08-17 / 出典: problems/stage-015-053-059-078.md
-- 出したもの: tasks/A1-読解型の検証.md
--
-- 【適用済み】2026-08-17。PostgREST（service_role）経由で同内容を反映済み。
-- id は書かない（GENERATED ALWAYS AS IDENTITY。指定すると 428C9）。
-- "order" は予約語なので引用符が必要。
--
-- context（実行結果）が入るのはステージ59（影響型）だけ。他の3問は NULL。
-- 空文字列を入れると画面に枠が出ないまま気づけないので、使わない問題は NULL にする（I-814）。

begin;

-- ステージ15: 関数宣言 ─ 入口（引数）と出口（戻り値）を掴む（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, context, prerequisite, question, model_answer, keywords, rubric_items)
values (
  15,
  '関数宣言 ─ 入口（引数）と出口（戻り値）を掴む',
  'js',
  2,
  '意図',
  '// カートの小計から送料を決める
function calcShipping(subtotal, region) {
  if (subtotal >= 5000) return 0;

  if (region === "okinawa" || region === "hokkaido") {
    return 1200;
  }

  return 700;
}',
  null,
  '`||` は「または」を表す演算子で、左右のどちらかが成り立てば全体が成り立ちます。`===` は左右が同じかどうかを判定します。`return` はその場で関数を終わらせ、書かれた値を呼び出し側に返す文です。',
  'この関数には、書いた人が実現しようとしたルールが表れています。どういうルールなのかを、コードのどこからそう読み取れるのかを添えて説明してください。',
  'この関数は、カートの小計 subtotal と届け先の region を受け取り、送料の金額を数値で返します。

実現しようとしているのは、購入額が 5000 円以上なら送料を無料にするというルールです。その判定を関数の先頭の if に置いているため、沖縄や北海道でも 5000 円以上なら送料はかかりません。

5000 円未満のときだけ region を見て、okinawa と hokkaido なら 1200 円、それ以外は 700 円を返します。',
  '[{"match":["送料","subtotal","小計"]},{"match":["無料","0円","取らな","かからな"]},{"match":["5000","先頭","最初","return 0"]},{"match":["沖縄","北海道","okinawa","hokkaido","地域"]}]'::jsonb,
  '{"core":"購入額が 5000 円以上なら送料を無料にするというルールを実現しようとしているという結論を指していれば満たす","ground":"無料にする判定が関数の先頭の if にある点、または 5000 円という基準に触れていれば満たす","depth":"無料の判定を先に置いているため沖縄や北海道でも 5000 円以上なら無料になる、という書き方の狙いに触れていれば満たす","core_reject":["5000 円以上でも沖縄や北海道は 1200 円かかると読んでいる","送料は届け先だけで決まり購入額は関係しないと読んでいる","5000 円未満はすべて 700 円になると読んでいる"]}'::jsonb
);

-- ステージ53: 命名とコメントから意図を読む ─ 中身を見ずに責務を答える（命名）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, context, prerequisite, question, model_answer, keywords, rubric_items)
values (
  53,
  '命名とコメントから意図を読む ─ 中身を見ずに責務を答える',
  'js',
  3,
  '命名',
  '// articles.js ── 記事の公開まわり

/** 下書き記事を公開状態に切り替える。すでに公開済みなら何もしない */
async function publishArticle(articleId) { /* …… */ }

function isPublishable(article) { /* …… */ }

function formatPublishedAt(date) { /* …… */ }',
  null,
  '`/** … */` は JSDoc と呼ばれる形式の注釈で、直後の関数の説明を書きます。`async` が付いた関数は、中で保存や通信の完了を待てます。`/* …… */` の部分は、この問題のために中身を隠してあります。',
  'このファイルは中身を伏せてあります。isPublishable がどういう役目を担う関数だと読めますか。何を受け取って何を返すのかと、そう判断した手がかりがどこにあるのかを説明してください。',
  'isPublishable は、記事1件を表す article を受け取り、その記事を公開してよい状態かどうかを true か false で返す判定の関数だと読めます。

手がかりは2つあります。ひとつは is で始まる命名で、真偽値を返す判定の関数にはこの付け方をする習わしがあります。もうひとつは publishArticle に付いている「すでに公開済みなら何もしない」という説明で、公開状態に切り替える前に切り替えてよいかを確かめる場所が必要になるため、その判定を担うのが isPublishable だと読めます。

記事の状態を実際に書き換えるのは publishArticle 側で、isPublishable は判定だけを担い、状態は変えないと読むのが自然です。formatPublishedAt は日付を表示用の文字列に整える関数なので役目が別です。',
  '[{"match":["article","記事"]},{"match":["true","false","真偽","boolean"]},{"match":["命名","コメント","名前の付け方"]},{"match":["何もしない","すでに公開","publishArticle","切り替え"]}]'::jsonb,
  '{"core":"isPublishable が公開してよい状態かどうかを真偽値で返す判定の関数だと読み取れていれば満たす","ground":"is で始まる命名、または publishArticle に付いている説明を手がかりとして挙げていれば満たす","depth":"判定だけを担い記事の状態を変えるのは publishArticle 側だという役目の切り分けに触れていれば満たす","core_reject":["isPublishable が記事を公開状態に切り替える関数だと読んでいる","isPublishable が公開日時を文字列に整える関数だと読んでいる","isPublishable が公開済みの記事の一覧を返す関数だと読んでいる"]}'::jsonb
);

-- ステージ59: スタックトレースを読む ─ ログから原因の行を特定する（影響）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, context, prerequisite, question, model_answer, keywords, rubric_items)
values (
  59,
  'スタックトレースを読む ─ ログから原因の行を特定する',
  'js',
  3,
  '影響',
  'function buildMessage(user) {
  return `${user.name} さんの申請が承認されました`;
}

function notifyApproval(userId) {
  const user = findUser(userId); // 見つからないと undefined を返す
  return buildMessage(user);
}',
  'TypeError: Cannot read properties of undefined (reading ''name'')
    at buildMessage (notify.js:2:14)
    at notifyApproval (notify.js:7:10)
    at approve (approval.js:12:5)',
  'スタックトレースは、エラーが起きたときにどの関数からどの関数へ呼ばれてきたかを並べたものです。上の行が新しく、下へ行くほど呼び出した側になります。各行の `ファイル名:行:桁` は、その関数のどの位置で止まったかを表します。`${...}` はテンプレートリテラルで、文字列の中に値を差し込む書き方です。',
  'エラーが発生した箇所と、根本の原因がある箇所はそれぞれどこだと読めますか。実行結果のどの行を手がかりにしたかも添えて説明してください。',
  'エラーが発生したのは buildMessage の中、notify.js の2行目で user.name を読もうとした箇所です。実行結果の1行目に Cannot read properties of undefined (reading ''name'') と出ていて、2行目が at buildMessage (notify.js:2:14) になっているのが手がかりです。

ただし根本の原因は notifyApproval 側、notify.js の6〜7行目にあります。findUser は見つからないと undefined を返すのに、その戻り値を確かめないまま buildMessage に渡しているためです。buildMessage は user が必ずある前提で書かれているので、直すべきなのは呼び出す側です。

実行結果の4行目に at approve (approval.js:12:5) とあるので、この失敗は approve まで伝わり、承認の処理全体が止まります。',
  '[{"match":["buildMessage","2行目","user.name"]},{"match":["notifyApproval","findUser","6行目","7行目"]},{"match":["undefined","確かめ","チェック","見つからな"]},{"match":["approve","approval.js","波及","伝わ"]}]'::jsonb,
  '{"core":"根本の原因は notifyApproval で findUser の戻り値を確かめていない点にあるという結論を指していれば満たす","ground":"実行結果の at buildMessage (notify.js:2:14) や at notifyApproval (notify.js:7:10) の行を手がかりとして挙げていれば満たす","depth":"この失敗が approval.js の approve まで伝わっている点、または buildMessage を直しても他の呼び出し箇所で同じことが起きる点に触れていれば満たす","core_reject":["buildMessage の書き方そのものが原因だと読んでいる","findUser の中に原因があると読んでいる","approval.js の approve に原因があると読んでいる"]}'::jsonb
);

-- ステージ78: テストコードを読む① ─ テストから関数の仕様を答える（仕様）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, context, prerequisite, question, model_answer, keywords, rubric_items)
values (
  78,
  'テストコードを読む① ─ テストから関数の仕様を答える',
  'js',
  3,
  '仕様',
  '// zipCode.test.js
import { describe, it, expect } from "vitest";
import { normalizeZip } from "./zipCode";

describe("normalizeZip", () => {
  it("ハイフンなしで渡したとき", () => {
    expect(normalizeZip("1500001")).toBe("150-0001");
  });

  it("ハイフンありで渡したとき", () => {
    expect(normalizeZip("150-0001")).toBe("150-0001");
  });

  it("桁が足りないとき", () => {
    expect(normalizeZip("15000")).toBe(null);
    expect(normalizeZip("")).toBe(null);
  });
});',
  null,
  'Vitest はテストを書くための道具です。`describe` はまとめの見出し、`it` は1つの場合を表し、`expect(値).toBe(期待値)` で「この値はこうなるはず」と書きます。実際の値が期待値と違えば、そのテストは失敗します。',
  'このテストだけを根拠に、normalizeZip がどういう約束（入力と出力のきまり）を持つ関数なのか説明してください。',
  'normalizeZip は郵便番号を表す文字列を受け取り、150-0001 のようにハイフン入りの形にそろえて返す関数です。

1つ目のテストでは 1500001 のようにハイフンなしの7桁を渡すと 150-0001 が返り、2つ目のテストでは最初からハイフンが入っている 150-0001 を渡しても同じ 150-0001 が返ります。つまりどちらの渡し方でも出力は1つの形にそろいます。3つ目のテストからは、桁が足りないものと空のものには null が返ると読めます。根拠は expect と toBe が期待している値です。

一方で、このテストが保証しているのはここまでです。8桁以上のものや全角の数字、ハイフンの位置が違うものをどう扱うかはテストに無いため、決まっていないと考えるべきです。',
  '[{"match":["郵便番号","文字列","7桁","zipCode"]},{"match":["ハイフン","150-0001","そろえ","同じ形"]},{"match":["toBe","expect","null","2つ目"]},{"match":["保証","8桁","全角","テストに無い","決まっていな"]}]'::jsonb,
  '{"core":"渡し方が違ってもハイフン入りの同じ形にそろえて返す関数だという結論を指していれば満たす","ground":"expect と toBe が期待している戻り値（150-0001 や null）を根拠として挙げていれば満たす","depth":"テストに現れない入力（8桁以上・全角の数字・ハイフンの位置が違うものなど）の扱いは保証されていない点に触れていれば満たす","core_reject":["ハイフンを取り除いた形にして返すと読んでいる","桁が足りないときは空の文字列を返すと読んでいる","渡したものをそのまま返す関数だと読んでいる"]}'::jsonb
);

commit;
