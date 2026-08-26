// ステージ 1〜3 の問題データ（第1章 値の正体を掴む）。
//
// **既存の order=1・2・3 を置き換える。** 新規投入ではないので insert.mjs ではなく
//   node problems/update.mjs problems/stage-001-003.data.mjs
// で入れる（id を据え置き、中身だけ差し替える）。旧版の本文は
// problems/stage-001-005.md の「旧版（差し替え前）」節に残してある。
//
// tasks/A3 の目的は「最初の数問をアプリの使い方に慣れる場にする」こと。
// 3問すべてが次を満たしている ── **難度を下げたのではなく、引っかけを外してある。**
//   - 出力がある（「エラーで止まる」「何も出力されない」を答えにしない）
//   - トレース型のみ（ズレ型・暗黙の型変換・コメントとの食い違いを使わない）
//   - 上から順に追えば答えが出る／答えが一点に決まる
//   - 難度は 1 → 2 → 2（4問目が難度2、5問目が難度3なので階段が途切れない）
//
// ⚠️ **core_reject に「depth が言及を求めている値」を書かないこと。**
// 例えばステージ1の depth は途中の値 3600 に触れることを求めているので、
// 「3600 が出力されると読んでいる」を core_reject に入れると、
// **正しく途中の値を書いた回答で矛盾 veto（30点上限）が誤爆しうる。**
// 起票時のメモは「変数の値を1つ前の状態で答える」を reject の例に挙げていたが、
// この3問ではその値がそのまま depth の条件になっているため採らなかった。
// 代わりに **反転（足す↔引く）と、読み落とし** を材料にしてある。
//
// 投入前に必ず次の2つを回すこと。
//   node problems/preflight.mjs problems/stage-001-003.data.mjs --replace
//   node problems/run-code.mjs  problems/stage-001-003.data.mjs

export const problems = [
  {
    order: 1,
    title: "注文金額の計算を1行ずつ追う",
    language: "js",
    difficulty: 1,
    reading_type: "トレース",
    code: `function subtotal(unitPrice, count) {
  let total = unitPrice * count;
  const shipping = 500;
  total = total + shipping;
  return total;
}

console.log(subtotal(1200, 3));`,
    question:
      "このコードを実行すると何が出力されますか。その数になるまでの過程も説明してください。",
    model_answer: `4100 が出力されます。

まず total に unitPrice と count を掛けた結果、つまり 1200 × 3 = 3600 が入ります。次の行で total に shipping の 500 を足した値を代入し直しているので、total は 4100 になります。return が返したこの値が console.log に渡されます。`,
    prerequisite: `let で宣言した変数には、後から別の値を入れ直せます。const で宣言した変数はそれができません。

コードは上から1行ずつ実行されるので、同じ変数でも行によって入っている値が変わります。`,
    keywords: [
      { match: ["total", "小計", "合計"] },
      { match: ["4100", "4,100"] },
      { match: ["代入", "足し", "加算", "足す"] },
      { match: ["3600", "3,600", "掛け", "1200"] },
    ],
    rubric_items: {
      core: "4100 が出力されるという結論を指していれば満たす",
      ground:
        "total に shipping の 500 を足した値を入れ直している行を根拠として挙げていれば満たす",
      depth:
        "unitPrice と count を掛けた 3600 という途中の値に触れていれば満たす",
      core_reject: [
        "count を掛けずに 1700 が出力されると読んでいる",
        "shipping が引かれて 3100 が出力されると読んでいる",
      ],
    },
  },

  {
    order: 2,
    title: "代入の順番を追う ─ 担当者の付け替え",
    language: "js",
    difficulty: 2,
    reading_type: "トレース",
    code: `// 案件の主担当と副担当を付け替える
let primaryOwner = "田中";
let backupOwner = "鈴木";

const keep = primaryOwner;
primaryOwner = backupOwner;
backupOwner = keep;

console.log(primaryOwner);`,
    question:
      "このコードを実行すると何が出力されますか。そうなる理由も説明してください。",
    model_answer: `鈴木 が出力されます。

keep には最初の primaryOwner の値、つまり 田中 が退避されています。その次の行で primaryOwner に backupOwner の値が入るので、primaryOwner は 鈴木 になります。最後の行では keep に取っておいた 田中 が backupOwner に入るため、2人の担当が付け替わった状態になります。`,
    prerequisite: `= は、右側の値を左側の変数に入れる書き方です。左右が等しいという意味ではありません。

すでに値が入っている変数に入れると、前の値は残りません。`,
    keywords: [
      { match: ["primaryOwner", "主担当"] },
      { match: ["鈴木", "付け替わ"] },
      { match: ["keep", "退避", "取っておい", "保持"] },
      { match: ["田中", "backupOwner"] },
    ],
    rubric_items: {
      core: "鈴木 が出力されるという結論を指していれば満たす",
      ground:
        "keep に元の primaryOwner の値を取っておいてから上書きしている点に触れていれば満たす",
      depth: "backupOwner が 田中 になる点に触れていれば満たす",
      core_reject: [
        "出力が 田中 になると読んでいる",
        "primaryOwner と backupOwner が両方とも 鈴木 になると読んでいる",
      ],
    },
  },

  {
    order: 3,
    title: "レスポンスに無い項目を読む",
    language: "js",
    difficulty: 2,
    reading_type: "トレース",
    code: `// GET /api/profile の応答をそのまま受け取ったもの
const profile = {
  id: 1024,
  name: "佐藤",
  age: null,
};

console.log(profile.age);
console.log(profile.company);`,
    question:
      "2つ目の console.log は何を出力しますか。1つ目の出力との違いも説明してください。",
    model_answer: `2つ目は undefined を出力します。

profile には company という名前が書かれていないので、存在しないプロパティを読み取った結果として undefined が返ります。エラーにはなりません。

1つ目の profile.age は null を出力します。こちらは名前が書かれていて、その値として null が入っています。同じ「値が無い」ように見えても、前者は項目そのものが返ってきていない状態、後者はサーバーが値が無いことを明示して返した状態という違いがあります。`,
    prerequisite: `オブジェクトは「名前: 値」の組を { } の中に並べたものです。

obj.名前 と書くと、その名前に入っている値を取り出せます。`,
    keywords: [
      { match: ["company", "プロパティ"] },
      { match: ["undefined", "未定義"] },
      { match: ["書かれていない", "存在しない", "含まれていない"] },
      { match: ["null", "明示"] },
    ],
    rubric_items: {
      core:
        "company はプロパティが存在しないため undefined になるという結論を指していれば満たす",
      ground:
        "profile に company という名前が書かれていない点に触れていれば満たす",
      depth:
        "1つ目の profile.age が null を出力する点に触れていれば満たす",
      core_reject: [
        "2つ目の出力も null になると読んでいる",
        "存在しないプロパティを読み取るとエラーになって止まると読んでいる",
      ],
    },
  },
];
