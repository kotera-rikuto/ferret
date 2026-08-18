// ステージ 25〜29 の問題データ（第4章 データの構造を読む）。
//
// 28 は構成案の螺旋で 4・5（参照）の回収先。
// 「コピーしたつもりで共有されている」をもう一度踏ませる。
//
// 投入前に必ず次の2つを回すこと。
//   node problems/preflight.mjs problems/stage-025-029.data.mjs
//   node problems/run-code.mjs  problems/stage-025-029.data.mjs

export const problems = [
  {
    order: 25,
    title: "オブジェクトの読み書き ─ プロパティアクセスと存在チェック(in)",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `function describeSetting(settings, key) {
  if (settings[key]) {
    return \`\${key} は \${settings[key]} が設定されています\`;
  }
  if (key in settings) {
    return \`\${key} は明示的に \${String(settings[key])} が指定されています\`;
  }
  return \`\${key} は未設定です\`;
}

const settings = { notify: false, theme: "dark", label: undefined };

console.log(describeSetting(settings, "theme"));
console.log(describeSetting(settings, "notify"));
console.log(describeSetting(settings, "label"));
console.log(describeSetting(settings, "locale"));`,
    question:
      "4回の呼び出しでそれぞれ何が出力されますか。3つ目がその結果になる理由も説明してください。",
    model_answer: `3つ目は「未設定です」にはならず、「label は明示的に undefined が指定されています」と出ます。

label の値は undefined ですが、名前そのものは settings に存在します。in は名前があるかどうかだけを見て、そこに入っている値が何かは見ないためです。

同じ理由で notify も、値が false なので1つ目の条件には入りませんが、2つ目で拾われます。4つのうち「未設定です」と出るのは locale だけです。`,
    prerequisite: `obj[名前] は、変数に入っている名前でプロパティを取り出す書き方です。そのプロパティが無いときの結果は undefined になります。

"名前" in obj は、そのプロパティが obj にあるかどうかを真偽で返します。中に入っている値そのものは見ません。

String(値) は値を文字にします。`,
    keywords: [
      { match: ["label", "in 演算子", "名前そのもの"] },
      { match: ["明示的に", "存在し", "未設定にならない"] },
      { match: ["undefined", "有無", "値ではなく"] },
      { match: ["locale", "false", "notify"] },
    ],
    rubric_items: {
      core: "label は名前が存在するため未設定にならないという結論を指していれば満たす",
      ground:
        "in が名前の有無だけを見て中の値を見ない点に触れていれば満たす",
      depth:
        "notify が false でも1つ目の条件に入らず2つ目で拾われる点、または「未設定です」と出るのが locale だけである点に触れていれば満たす",
      core_reject: [
        "3つ目が「未設定です」と出ると読んでいる",
        "2つ目が1つ目の条件で拾われると読んでいる",
        "4つ目で実行時エラーになると読んでいる",
      ],
    },
  },

  {
    order: 26,
    title: "ネストしたオブジェクトを掘る（オプショナルチェーン ?.）",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `function shippingLabel(order) {
  const city = order.customer?.address?.city;
  const zip = order.customer.address?.zip;

  return \`\${city ?? "未登録"} / \${zip ?? "未登録"}\`;
}

console.log(shippingLabel({ customer: { address: { city: "京都市", zip: "6008216" } } }));
console.log(shippingLabel({ customer: {} }));
console.log(shippingLabel({}));`,
    question:
      "3回の呼び出しで何が起きますか。最後がその結果になる理由も説明してください。",
    model_answer: `最後の呼び出しで TypeError が発生し、そこで止まります。

zip を取り出している行は order.customer.address?.zip と書かれていて、address の手前にある customer には何も付いていません。最後の呼び出しでは order が空なので customer が undefined になり、その undefined から address を読もうとした時点で落ちます。city の行のほうは customer にも付いているので、ここは通ります。

1回目は「京都市 / 6008216」、2回目は customer が空でどちらも取れないので「未登録 / 未登録」になります。`,
    prerequisite: `a?.b は、a が null か undefined なら、そこで打ち切って undefined を返します。a に値があるときは、ふつうに b を取り出します。

守ってくれるのは ?. を書いた位置の1回だけで、その左側で行われる取り出しには効きません。

a ?? b は、a が null か undefined のときだけ b を使います。`,
    keywords: [
      { match: ["customer", "zip", "2行目"] },
      { match: ["TypeError", "エラー", "止ま", "落ち"] },
      { match: ["手前", "付いていない", "守られない"] },
      { match: ["未登録", "京都市", "6008216"] },
    ],
    rubric_items: {
      core: "最後の呼び出しで実行時エラーになるという結論を指していれば満たす",
      ground:
        "zip の行は customer に ?. が付いておらず customer が無い場合に守られない点に触れていれば満たす",
      depth:
        "2回目が「未登録 / 未登録」になる点、または1回目が「京都市 / 6008216」になる点に触れていれば満たす",
      core_reject: [
        "最後も「未登録 / 未登録」になると読んでいる",
        "2回目で実行時エラーになると読んでいる",
        "?. を書けばその左側の取り出しも守られると読んでいる",
      ],
    },
  },

  {
    order: 27,
    title: "分割代入と省略記法 ─ 取り出し方・詰め方",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `function normalizeForm(input) {
  const { title, tags = [], author: writer = "匿名", ...rest } = input;

  return {
    title,
    tagCount: tags.length,
    writer,
    extraKeys: Object.keys(rest),
  };
}

console.log(normalizeForm({
  title: "在庫の締め処理",
  author: null,
  draft: true,
  reviewedBy: "sato",
}));`,
    question:
      "この関数の戻り値はどうなりますか。4つの値がそれぞれその結果になる理由も説明してください。",
    model_answer: `戻り値は { title: '在庫の締め処理', tagCount: 0, writer: null, extraKeys: [ 'draft', 'reviewedBy' ] } です。

... で受けた rest には、その手前で名指しした名前は入りません。title と tags と author は分割代入の中で取り出したので、rest からは外れます。

writer は null のままで「匿名」にはなりません。既定値が使われるのは値が undefined のときだけで、null は渡された値として扱われるためです。tags は入力に無いので既定値の空の配列が使われ、tagCount は 0 になります。`,
    prerequisite: `const { a, b } = obj は、obj の中から名前を指定して同時に受け取る書き方です。

a = 既定値 を付けると、その名前が obj に無かったときの値を決められます。a: 別名 と書くと、別の名前で受け取れます。

...名前 を最後に置くと、そこまでに受け取らなかったぶんが新しいオブジェクトにまとまります。Object.keys(obj) はプロパティの名前を配列で返します。`,
    keywords: [
      { match: ["extraKeys", "rest", "名指し"] },
      { match: ["draft", "reviewedBy", "2つだけ"] },
      { match: ["取り出した", "外れ", "含まれない"] },
      { match: ["writer", "null", "tagCount"] },
    ],
    rubric_items: {
      core: "rest に手前で取り出した名前が入らないという結論を指していれば満たす",
      ground:
        "title と tags と author を分割代入の中で名指ししている点に触れていれば満たす",
      depth:
        "writer が null のままで「匿名」にならない点、または tagCount が 0 になる点に触れていれば満たす",
      core_reject: [
        "extraKeys に title や author も含まれると読んでいる",
        "writer が「匿名」になると読んでいる",
        "tags が入力に無いので実行時エラーになると読んでいる",
      ],
    },
  },

  {
    order: 28,
    title: "スプレッドのコピーが浅いせいで起きるズレを読む",
    language: "js",
    difficulty: 4,
    reading_type: "ズレ",
    code: `const basePreset = {
  name: "標準",
  notify: { email: true, slack: false },
};

// もとのプリセットを壊さないよう、複製してから調整する
function customize(preset, label) {
  const copied = { ...preset };
  copied.name = label;
  copied.notify.slack = true;
  return copied;
}

const teamPreset = customize(basePreset, "チーム用");

console.log(teamPreset.name, basePreset.name);
console.log(teamPreset.notify.slack, basePreset.notify.slack);`,
    question:
      "コメントに書かれた意図と、実際の動きが食い違っている箇所があります。2つの出力を示したうえで、どこがどう食い違うかを説明してください。",
    model_answer: `basePreset.notify.slack も true になってしまいます。

{ ...preset } は一番外側の段だけを写す複製なので、notify のように入れ子になっているものは中身が作り直されず、同じものを指したままになります。そのため copied.notify.slack への代入は、basePreset からも見えます。

一方 name のほうはコメントどおりで、copied.name への代入は basePreset に影響しません。出力は「チーム用 標準」と「true true」になります。`,
    prerequisite: `{ ...obj } は、obj のプロパティを新しいオブジェクトに写します。写されるのは一番外側の段だけです。

プロパティの値がさらにオブジェクトだった場合、その値そのもの（どこを指しているか）が写されます。指し先の中身までは作り直されません。

ステージ4・5で扱った「写して渡る値」と「指し先だけが渡る値」の違いが、ここでも効いてきます。`,
    keywords: [
      { match: ["notify", "slack", "入れ子"] },
      { match: ["true", "壊れ", "影響"] },
      { match: ["1階層", "浅い", "同じもの", "共有"] },
      { match: ["name", "標準", "コメントどおり"] },
    ],
    rubric_items: {
      core: "basePreset.notify.slack も true に変わってしまうという結論を指していれば満たす",
      ground:
        "スプレッドが一番外側の段だけを写すため notify が同じものを指したままである点に触れていれば満たす",
      depth:
        "name のほうはコメントどおりで basePreset が「標準」のまま残る点に触れていれば満たす",
      core_reject: [
        "basePreset.notify.slack は false のままだと読んでいる",
        "basePreset.name も「チーム用」に変わると読んでいる",
        "スプレッドを使っているので中身まで複製されると読んでいる",
      ],
    },
  },

  {
    order: 29,
    title: "Object.keys / values / entries でぐるっと回す",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `const counts = { "2026": 4, error: 12, "10": 1, warn: 3 };

for (const [level, count] of Object.entries(counts)) {
  console.log(\`\${level}=\${count}\`);
}

console.log(Object.keys(counts).length);`,
    question:
      "このコードを実行すると何が出力されますか。並ぶ順番がそうなる理由も説明してください。",
    model_answer: `出力は 10=1、2026=4、error=12、warn=3 の順で、最後に 4 が出ます。

記述した順ではなく、数字として解釈できる名前が先に、小さい順に並ぶためです。10 と 2026 がここに当たります。

その後ろは、残りの名前が書いた順のまま続くので error、warn の順になります。最後の Object.keys(counts).length は名前の数なので 4 です。`,
    prerequisite: `Object.entries(obj) は、[名前, 値] という2要素の配列を並べた配列を返します。for (const [a, b] of …) と書くと、その2つを同時に受け取れます。

Object.keys(obj) は名前だけ、Object.values(obj) は値だけを配列で返します。

オブジェクトのプロパティには決まった並び順があり、記述した順とは限りません。`,
    keywords: [
      { match: ["10", "2026", "数字"] },
      { match: ["先に", "最初に", "順番が変わ"] },
      { match: ["小さい順", "昇順", "数として"] },
      { match: ["error", "warn", "書いた順"] },
    ],
    rubric_items: {
      core: "記述した順ではなく 10 と 2026 が先に並ぶという結論を指していれば満たす",
      ground:
        "数字として解釈できる名前が先に小さい順で並ぶ点に触れていれば満たす",
      depth:
        "残りの error と warn は書いた順のまま続く点、または最後の出力が 4 になる点に触れていれば満たす",
      core_reject: [
        "記述した順に 2026、error、10、warn と並ぶと読んでいる",
        "名前のアルファベット順に並ぶと読んでいる",
        "Object.entries が値だけを返すと読んでいる",
      ],
    },
  },
];
