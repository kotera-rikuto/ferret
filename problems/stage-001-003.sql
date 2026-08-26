-- ステージ1〜3 投入（2026-08-26・tasks/A3 でチュートリアル用に差し替えた後の実データ）
--
-- ⚠️ **この insert は空の DB に入れるとき用。** 既存の 1〜3 を持つ DB では
-- order が重複する（I-807）。差し替えとして反映するなら
--   node problems/update.mjs problems/stage-001-003.data.mjs
-- を使う（id を据え置き、中身だけ替える）。
-- 差し替える前の1〜3問目は problems/stage-001-005.sql / .md に残してある。
-- 出典: problems/stage-001-003.data.mjs / 設計: problems/stage-001-003.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- id は書かない（GENERATED ALWAYS AS IDENTITY）

begin;

-- ステージ1: 注文金額の計算を1行ずつ追う（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  1,
  '注文金額の計算を1行ずつ追う',
  'js',
  1,
  'トレース',
  'function subtotal(unitPrice, count) {
  let total = unitPrice * count;
  const shipping = 500;
  total = total + shipping;
  return total;
}

console.log(subtotal(1200, 3));',
  'このコードを実行すると何が出力されますか。その数になるまでの過程も説明してください。',
  '4100 が出力されます。

まず total に unitPrice と count を掛けた結果、つまり 1200 × 3 = 3600 が入ります。次の行で total に shipping の 500 を足した値を代入し直しているので、total は 4100 になります。return が返したこの値が console.log に渡されます。',
  '[{"match":["total","小計","合計"]},{"match":["4100","4,100"]},{"match":["代入","足し","加算","足す"]},{"match":["3600","3,600","掛け","1200"]}]'::jsonb,
  '{"core":"4100 が出力されるという結論を指していれば満たす","depth":"unitPrice と count を掛けた 3600 という途中の値に触れていれば満たす","ground":"total に shipping の 500 を足した値を入れ直している行を根拠として挙げていれば満たす","core_reject":["count を掛けずに 1700 が出力されると読んでいる","shipping が引かれて 3100 が出力されると読んでいる"]}'::jsonb,
  'let で宣言した変数には、後から別の値を入れ直せます。const で宣言した変数はそれができません。

コードは上から1行ずつ実行されるので、同じ変数でも行によって入っている値が変わります。'
);

-- ステージ2: 代入の順番を追う ─ 担当者の付け替え（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  2,
  '代入の順番を追う ─ 担当者の付け替え',
  'js',
  2,
  'トレース',
  '// 案件の主担当と副担当を付け替える
let primaryOwner = "田中";
let backupOwner = "鈴木";

const keep = primaryOwner;
primaryOwner = backupOwner;
backupOwner = keep;

console.log(primaryOwner);',
  'このコードを実行すると何が出力されますか。そうなる理由も説明してください。',
  '鈴木 が出力されます。

keep には最初の primaryOwner の値、つまり 田中 が退避されています。その次の行で primaryOwner に backupOwner の値が入るので、primaryOwner は 鈴木 になります。最後の行では keep に取っておいた 田中 が backupOwner に入るため、2人の担当が付け替わった状態になります。',
  '[{"match":["primaryOwner","主担当"]},{"match":["鈴木","付け替わ"]},{"match":["keep","退避","取っておい","保持"]},{"match":["田中","backupOwner"]}]'::jsonb,
  '{"core":"鈴木 が出力されるという結論を指していれば満たす","depth":"backupOwner が 田中 になる点に触れていれば満たす","ground":"keep に元の primaryOwner の値を取っておいてから上書きしている点に触れていれば満たす","core_reject":["出力が 田中 になると読んでいる","primaryOwner と backupOwner が両方とも 鈴木 になると読んでいる"]}'::jsonb,
  '= は、右側の値を左側の変数に入れる書き方です。左右が等しいという意味ではありません。

すでに値が入っている変数に入れると、前の値は残りません。'
);

-- ステージ3: レスポンスに無い項目を読む（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  3,
  'レスポンスに無い項目を読む',
  'js',
  2,
  'トレース',
  '// GET /api/profile の応答をそのまま受け取ったもの
const profile = {
  id: 1024,
  name: "佐藤",
  age: null,
};

console.log(profile.age);
console.log(profile.company);',
  '2つ目の console.log は何を出力しますか。1つ目の出力との違いも説明してください。',
  '2つ目は undefined を出力します。

profile には company という名前が書かれていないので、存在しないプロパティを読み取った結果として undefined が返ります。エラーにはなりません。

1つ目の profile.age は null を出力します。こちらは名前が書かれていて、その値として null が入っています。同じ「値が無い」ように見えても、前者は項目そのものが返ってきていない状態、後者はサーバーが値が無いことを明示して返した状態という違いがあります。',
  '[{"match":["company","プロパティ"]},{"match":["undefined","未定義"]},{"match":["書かれていない","存在しない","含まれていない"]},{"match":["null","明示"]}]'::jsonb,
  '{"core":"company はプロパティが存在しないため undefined になるという結論を指していれば満たす","depth":"1つ目の profile.age が null を出力する点に触れていれば満たす","ground":"profile に company という名前が書かれていない点に触れていれば満たす","core_reject":["2つ目の出力も null になると読んでいる","存在しないプロパティを読み取るとエラーになって止まると読んでいる"]}'::jsonb,
  'オブジェクトは「名前: 値」の組を { } の中に並べたものです。

obj.名前 と書くと、その名前に入っている値を取り出せます。'
);

commit;
