// ステージ 30〜40 の問題データ（第5章 データの変形を追う）。
//
// 螺旋の回収が2つ入っている。
//   33 ← 17（return を書き忘れた関数を読む）… 同じ誤りがコールバックの中で再発する
//   36 ← 4（プリミティブと参照）        … 蓄積オブジェクトを壊すか複製するか
// どちらも回収元は投入済みなので、前提知識でステージ番号に触れて繋げてある。
//
// 投入前に必ず次の2つを回すこと。
//   node problems/preflight.mjs problems/stage-030-040.data.mjs
//   node problems/run-code.mjs  problems/stage-030-040.data.mjs

export const problems = [
  {
    order: 30,
    title: "破壊するメソッド・破壊しないメソッド ─ push / slice / splice",
    language: "js",
    difficulty: 3,
    reading_type: "ズレ",
    code: `// 先頭から3件を取り出す。もとの待ち行列はそのまま残す
function takeFirst(queue) {
  const picked = queue.splice(0, 3);
  return picked;
}

const waiting = ["u1", "u2", "u3", "u4", "u5"];
const batch = takeFirst(waiting);

console.log(batch);
console.log(waiting);`,
    question:
      "コメントに書かれた意図と、実際の動きが食い違っています。2つの出力を示したうえで、どこがどう食い違うかを説明してください。",
    model_answer: `waiting からは3件が消えて、[ 'u4', 'u5' ] の2件だけになります。

splice は指定した範囲を取り出すと同時に、もとの配列からその要素を抜きます。抜いたものを返すので、返り値だけ見ていると気づけません。

batch の中身自体はコメントどおりで [ 'u1', 'u2', 'u3' ] になります。食い違うのは、もとの待ち行列が残らない点だけです。`,
    prerequisite: `配列のメソッドには、もとの配列に手を入れるものと、手を入れずに新しい配列を返すものの2種類があります。

配列.slice(始まり, 終わり) は後者、配列.splice(始まり, 個数) は前者です。名前は1文字しか違いませんが働きが違います。

splice は抜き出した要素を配列にして返します。`,
    keywords: [
      { match: ["splice", "waiting"] },
      { match: ["2件", "u4", "減っ"] },
      { match: ["同時に", "取り出すと", "もとの配列から"] },
      { match: ["batch", "u1", "コメントどおり"] },
    ],
    rubric_items: {
      core: "waiting から3件が消えて2件になるという結論を指していれば満たす",
      ground:
        "splice が取り出すと同時にもとの配列から要素を抜く点に触れていれば満たす",
      depth:
        "batch の中身自体はコメントどおり u1 から u3 になっており食い違うのがもとの配列だけである点に触れていれば満たす",
      core_reject: [
        "waiting が5件のまま残ると読んでいる",
        "batch が空の配列になると読んでいる",
        "splice ももとの配列を変えないと読んでいる",
      ],
    },
  },

  {
    order: 31,
    title: "forEach ─ 副作用でまわすループ",
    language: "js",
    difficulty: 3,
    reading_type: "意図",
    code: `function notifyAll(users, send) {
  const failed = [];

  users.forEach((user) => {
    try {
      send(user.id);
    } catch (e) {
      failed.push({ id: user.id, reason: e.message });
    }
  });

  if (failed.length > 0) {
    console.warn(\`\${failed.length} 件の送信に失敗しました\`);
  }

  return failed;
}`,
    question:
      "この関数が users を1件ずつ回している部分は、何のために回しているのでしょうか。書いた人の意図を説明してください。",
    model_answer: `1件ずつ送るという行為そのものが目的で、変換した結果を集めた配列を作りたいわけではないからです。

コールバックは値を返しておらず、必要なものは外側の failed に貯めています。集めたいのは失敗したものだけなので、全件ぶんの配列は要りません。

try を各件の中に置いてあるのも同じ理由です。1件が失敗しても残りの送信は続き、最後に失敗したものだけをまとめて返す形になっています。`,
    prerequisite: `配列.forEach(関数) は、要素を1つずつ関数に渡して実行します。関数が返した値は使われず、forEach 自体も何も返しません。

try { … } catch (e) { … } は、try の中で例外が起きたときに catch へ移ります。e.message は例外に添えられた説明です。

console.warn は注意を促す出力です。`,
    keywords: [
      { match: ["送信", "送る", "send"] },
      { match: ["行為そのもの", "副作用", "作りたいわけではな"] },
      { match: ["failed", "返しておらず", "外側"] },
      { match: ["失敗したものだけ", "try", "残りの送信"] },
    ],
    rubric_items: {
      core: "送るという行為そのものが目的で結果の配列を作るためではないという意図を指していれば満たす",
      ground:
        "コールバックが値を返しておらず必要なものを外側の failed に貯めている点に触れていれば満たす",
      depth:
        "集めたいのが失敗したものだけである点、または try を各件に置くことで1件の失敗で全体が止まらない点に触れていれば満たす",
      core_reject: [
        "送信結果を集めた配列を作るために回していると読んでいる",
        "失敗した時点で処理を打ち切るために回していると読んでいる",
        "そのほうが速いのでこう書いたと読んでいる",
      ],
    },
  },

  {
    order: 32,
    title: "map ─ 形を変えて新しい配列を作る",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `const entries = [
  { name: "在庫確認", done: true },
  { name: "発注", done: false },
  { name: "検品", done: false },
];

const lines = entries.map((entry, i) => \`\${i + 1}. \${entry.name}\${entry.done ? " (済)" : ""}\`);

entries[1].name = "発注（修正）";

console.log(lines.length, entries.length);
console.log(lines[1]);`,
    question:
      "2つの console.log でそれぞれ何が出力されますか。後半がその結果になる理由も説明してください。",
    model_answer: `後半は「2. 発注」のままで、あとから entries[1].name を書き換えても反映されません。

map はその時点の値を読んで文字列を作り終えており、lines に入っているのは出来上がった文字列そのものだからです。もとのオブジェクトを見に行っているわけではありません。

lines の長さはもとと同じ 3 なので、前半の出力は 3 3 になります。`,
    prerequisite: `配列.map(関数) は、要素を1つずつ関数に渡し、その戻り値を集めた新しい配列を返します。もとの配列には手を入れません。

コールバックは2つ目の引数として、その要素が何番目かを 0 から数えた数で受け取れます。

条件 ? A : B は、条件が成立すれば A を、しなければ B を返します。`,
    keywords: [
      { match: ["lines", "map"] },
      // 語幹で持つ。「反映されな」だと「反映されません」に当たらない（投入前検査で捕まえた）
      { match: ["反映され", "書き換えても", "そのまま", "変わらな"] },
      { match: ["文字列", "その時点", "作り終え"] },
      { match: ["同じ長さ", "3 3", "i + 1"] },
    ],
    rubric_items: {
      core: "lines の2番目が書き換え前のままで反映されないという結論を指していれば満たす",
      ground:
        "map がその時点の値から文字列を作り終えており lines に文字列そのものが入っている点に触れていれば満たす",
      depth:
        "lines の長さがもとと同じ 3 になる点、または前半の出力が 3 3 になる点に触れていれば満たす",
      core_reject: [
        "lines の2番目が「2. 発注（修正）」になると読んでいる",
        "lines の長さがもとの配列と変わると読んでいる",
        "map がもとの配列を書き換えると読んでいる",
      ],
    },
  },

  {
    order: 33,
    title: "map のコールバックが値を返していないコードを読む",
    language: "js",
    difficulty: 3,
    reading_type: "ズレ",
    code: `const rows = [
  { sku: "A-100", qty: 2 },
  { sku: "B-200", qty: 0 },
];

// 表示用の行に整形する
const labels = rows.map((row) => {
  if (row.qty === 0) {
    return \`\${row.sku} 品切れ\`;
  }
  \`\${row.sku} × \${row.qty}\`;
});

console.log(labels);`,
    question:
      "コメントに書かれた意図と、実際の動きが食い違っています。出力を示したうえで、どこがどう食い違うかを説明してください。",
    model_answer: `qty が 0 ではない1件目は undefined になり、labels は [ undefined, 'B-200 品切れ' ] になります。

if に入らなかったときの式には return が無く、評価されるだけで捨てられるためです。ステージ17 で見たのと同じことが、ここではコールバックの中で起きています。

品切れの行のほうは return が書かれているので、意図どおり 'B-200 品切れ' に整形されます。`,
    prerequisite: `配列.map(関数) は、要素ごとに関数を呼び、その戻り値を集めた新しい配列を返します。関数が値を返さなかった要素の位置には、値が無いことを表すものが入ります。

矢印の後ろに { を書いた形では、返したい値を return で明示する必要があります。式を1行置いただけでは返りません。

ステージ17 で扱った「return の書き忘れ」と同じことが起きうる場所です。`,
    keywords: [
      { match: ["qty", "1件目", "A-100"] },
      { match: ["undefined", "値が入らない"] },
      { match: ["return", "捨て", "書かれていない"] },
      { match: ["品切れ", "B-200", "意図どおり"] },
    ],
    rubric_items: {
      core: "qty が 0 でない行が undefined になるという結論を指していれば満たす",
      ground:
        "if に入らなかったときの式に return が無く値が捨てられている点に触れていれば満たす",
      depth:
        "品切れの行のほうは return があるので意図どおり整形される点に触れていれば満たす",
      core_reject: [
        "labels の1件目が 'A-100 × 2' になると読んでいる",
        "品切れの行も undefined になると読んでいる",
        "map が実行時エラーになると読んでいる",
      ],
    },
  },

  {
    order: 34,
    title: "filter / find / some / every ─ 絞り込みと確認",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `function checkStock(items) {
  const shortage = items.filter((item) => item.stock < item.required);
  const firstShort = items.find((item) => item.stock < item.required);

  return {
    count: shortage.length,
    first: firstShort?.sku ?? "なし",
    allReady: items.every((item) => item.stock >= item.required),
    anyShort: items.some((item) => item.stock < item.required),
  };
}

console.log(checkStock([
  { sku: "A-1", stock: 5, required: 3 },
  { sku: "B-2", stock: 1, required: 4 },
]));
console.log(checkStock([]));`,
    question:
      "2回の呼び出しでそれぞれどんなオブジェクトが返りますか。後半で意外に思える値があれば、その理由も説明してください。",
    model_answer: `後半では空の配列を渡しているのに allReady が true になります。

every は「条件に合わないものが1つも無いか」を見るので、要素が1つも無ければ必ず true です。反例が存在しないためです。

同じ空の配列でも some のほうは false になります。find は見つからないと undefined を返すので、first は ?? によって「なし」になります。前半は count が 1、first が B-2、allReady が false です。`,
    prerequisite: `filter は条件に合う要素だけを集めた配列、find は条件に合う最初の要素を返します。find で見つからなかったときの結果は、値が無いことを表すものになります。

some は条件に合うものが1つでもあるか、every は全部が条件に合うかを真偽で返します。

a?.b は a が無いときに打ち切り、a ?? b は a が無いときだけ b を使います。`,
    keywords: [
      { match: ["空の配列", "空配列"] },
      { match: ["allReady", "true"] },
      { match: ["every", "1つも", "反例"] },
      { match: ["なし", "B-2", "undefined", "count"] },
    ],
    rubric_items: {
      core: "空の配列に対して allReady が true になるという結論を指していれば満たす",
      ground:
        "every は条件に合わない要素が1つも無ければ true を返す点に触れていれば満たす",
      depth:
        "前半が count 1 で first が B-2 になる点、または空のとき find が値を返さないので first が「なし」になる点に触れていれば満たす",
      core_reject: [
        "空の配列のとき allReady が false になると読んでいる",
        "空の配列のとき first のところで実行時エラーになると読んでいる",
        "空の配列のとき anyShort も true になると読んでいる",
      ],
    },
  },

  {
    order: 35,
    title: "reduce ─ 畳み込みの途中経過を読む",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `const sales = [
  { region: "東", amount: 1200 },
  { region: "西", amount: 800 },
  { region: "南", amount: 500 },
];

const total = sales.reduce((sum, sale) => sum + sale.amount, 0);
const wrong = sales.reduce((sum, sale) => sum + sale.amount);

console.log(total);
console.log(wrong);`,
    question:
      "2つの console.log でそれぞれ何が出力されますか。後半がその結果になる理由も説明してください。",
    model_answer: `後半は wrong のほうで、配列の最初の要素そのもの（オブジェクト）が sum の出発点になります。

そのため sum + sale.amount はオブジェクトと数の足し算になり、文字列としてつながっていきます。出力は [object Object]800500 です。出発点が先頭の要素なので、繰り返しは2番目から始まります。

前半の total は 0 を渡しているので素直に足し合わされて 2500 になります。`,
    prerequisite: `配列.reduce(関数, 初期値) は、前回までの結果と今の要素を関数に渡し、返った値を次に持ち越します。最後に残った値が全体の結果です。

初期値は省略できます。ただし省略した場合の振る舞いは省略しない場合と違うので、書かれているかどうかを確かめてから読むこと。

数とオブジェクトを + でつなぐと、文字列としてつながります。`,
    keywords: [
      { match: ["wrong", "省いた", "第2引数を書かない"] },
      { match: ["最初の要素", "先頭の要素", "オブジェクトが出発点"] },
      { match: ["2番目から", "1回目が飛", "そこから始ま"] },
      { match: ["2500", "object Object"] },
    ],
    rubric_items: {
      core: "後半では配列の最初の要素そのものが出発点になるという結論を指していれば満たす",
      ground:
        "第2引数を書かないと配列の先頭が出発点として使われる点に触れていれば満たす",
      depth:
        "後半の出力が [object Object]800500 になる点、または前半が 2500 になる点に触れていれば満たす",
      core_reject: [
        "後半も 2500 になると読んでいる",
        "後半が 1300 になると読んでいる",
        "第2引数が無いと実行時エラーになると読んでいる",
      ],
    },
  },

  {
    order: 36,
    title: "reduce 応用 ─ 集計とグループ化",
    language: "js",
    difficulty: 4,
    reading_type: "ズレ",
    code: `const tickets = [
  { id: "T-1", status: "open" },
  { id: "T-2", status: "closed" },
  { id: "T-3", status: "open" },
];

const initial = { open: [], closed: [] };

// initial は雛形として残し、集計結果だけを新しく作る
const grouped = tickets.reduce((acc, ticket) => {
  acc[ticket.status].push(ticket.id);
  return acc;
}, initial);

console.log(grouped.open);
console.log(initial.open);`,
    question:
      "コメントに書かれた意図と、実際の動きが食い違っています。2つの出力を示したうえで、どこがどう食い違うかを説明してください。",
    model_answer: `initial.open にも [ 'T-1', 'T-3' ] が入ってしまいます。

reduce の第2引数に渡した initial は複製されず、そのまま acc として使われます。acc[...].push(...) は新しい配列を作らずその場に足すので、initial の中身が直接書き換わります。grouped と initial は別々のものではなく、1つのものを2つの名前で見ています。

集計そのものは正しく行われていて、closed 側には T-2 が入ります。ステージ4で見た「指し先だけが渡る」形が、ここでも効いています。`,
    prerequisite: `配列.reduce(関数, 最初の値) は、前回までの結果と今の要素を関数に渡し、返った値を次に持ち越します。渡した最初の値は複製されません。

配列.push(値) は末尾に足す操作で、新しい配列を作りません。

ステージ4・5で扱った「写して渡る値」と「指し先だけが渡る値」の違いが、ここでも効いてきます。`,
    keywords: [
      { match: ["initial", "acc"] },
      { match: ["T-1", "T-3", "書き換わ"] },
      { match: ["push", "そのまま", "複製されず"] },
      { match: ["closed", "T-2", "集計そのもの"] },
    ],
    rubric_items: {
      core: "initial の中身も書き換わってしまうという結論を指していれば満たす",
      ground:
        "第2引数に渡した initial が複製されずそのまま acc として使われる点に触れていれば満たす",
      depth:
        "closed 側には T-2 が入っており集計そのものは正しく行われている点に触れていれば満たす",
      core_reject: [
        "initial.open が空の配列のまま残ると読んでいる",
        "grouped と initial が別のオブジェクトになると読んでいる",
        "reduce が第2引数を複製してから使うと読んでいる",
      ],
    },
  },

  {
    order: 37,
    title: "sort ─ 比較関数が返す −1 / 0 / 1",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `const scores = [10, 9, 100, 25];

const sorted = scores.sort();
sorted.push(1);

console.log(scores);
console.log(scores === sorted);`,
    question:
      "2つの console.log でそれぞれ何が出力されますか。前半の並び順がそうなる理由も説明してください。",
    model_answer: `比較関数を渡していないので、要素は数の大小ではなく文字として比べられます。その結果 10, 100, 25, 9 の順に並びます。

これが sort の既定の並べ方です。さらに sort は新しい配列を返すのではなく、もとの配列そのものを並べ替えて返します。そのため scores と sorted は同じ配列で、push した 1 は scores からも見えます。

出力は [ 10, 100, 25, 9, 1 ] と true になります。`,
    prerequisite: `配列.sort() は要素を並べ替えます。引数に関数を渡すと、2つを比べてどちらを前に置くかを自分で決められます。渡さなかったときの並べ方は決まっており、数として比べるとは限りません。

sort は並べ替えた結果をどこに置くか（新しい配列か、もとの配列か）に注意して読むこと。

配列.push(値) は末尾に足します。=== は左右が同じものかどうかを見ます。`,
    keywords: [
      { match: ["比較関数", "引数を渡していない", "何も渡さない"] },
      { match: ["文字として", "文字列として", "10, 100, 25, 9"] },
      { match: ["既定", "決まっている並べ方"] },
      { match: ["true", "同じ配列", "元の配列", "push"] },
    ],
    rubric_items: {
      core: "比較関数が無いので数の大小ではなく文字として並ぶという結論を指していれば満たす",
      ground: "sort が既定で要素を文字として比べる点に触れていれば満たす",
      depth:
        "sort がもとの配列そのものを返すので scores === sorted が true になる点、または push した 1 が scores にも現れる点に触れていれば満たす",
      core_reject: [
        "9, 10, 25, 100 の順に並ぶと読んでいる",
        "scores がもとの順のまま残ると読んでいる",
        "scores === sorted が false になると読んでいる",
      ],
    },
  },

  {
    order: 38,
    title: "オブジェクト配列を複数キーで並べ替えるコードを読む",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `const tasks = [
  { title: "棚卸し", priority: 2, dueDays: 1 },
  { title: "請求書送付", priority: 1, dueDays: 5 },
  { title: "在庫補充", priority: 2, dueDays: 0 },
  { title: "月次報告", priority: 1, dueDays: 5 },
];

const ordered = [...tasks].sort(
  (a, b) => a.priority - b.priority || a.dueDays - b.dueDays,
);

console.log(ordered.map((t) => t.title));`,
    question:
      "このコードを実行すると何が出力されますか。並び順がそうなる理由も説明してください。",
    model_answer: `priority が同じときだけ dueDays で比べます。

比較関数は a.priority - b.priority を先に計算し、その結果が 0 のときだけ || の右側にある a.dueDays - b.dueDays が使われます。0 以外ならそちらがそのまま比較の答えになります。

出力は [ '請求書送付', '月次報告', '在庫補充', '棚卸し' ] です。priority が 2 の2件は dueDays の小さい 在庫補充 が先に来ます。priority も dueDays も同じ2件は、もとの並び順のまま残ります。`,
    prerequisite: `sort に渡す関数は2つの要素を受け取り、負の数なら前者を前に、正の数なら後者を前に、0 なら順序を変えないという意味の数を返します。

a - b は、a が小さいほど負の数になります。

X || Y は X が「なし」とみなせるとき Y を使います。数の 0 もここでは「なし」の側です。

[...配列] は写しを作ります。`,
    keywords: [
      { match: ["priority", "dueDays"] },
      { match: ["同じとき", "同点", "0 のとき"] },
      { match: ["||", "右側", "先に計算"] },
      { match: ["在庫補充", "請求書送付", "もとの並び"] },
    ],
    rubric_items: {
      core: "priority が同じときだけ dueDays で比べるという結論を指していれば満たす",
      ground:
        "a.priority - b.priority が 0 のときだけ || の右側が使われる点に触れていれば満たす",
      depth:
        "出力が 請求書送付 / 月次報告 / 在庫補充 / 棚卸し になる点、または両方同じ2件がもとの並び順のまま残る点に触れていれば満たす",
      core_reject: [
        "dueDays だけで並ぶと読んでいる",
        "priority と dueDays を足した値で並ぶと読んでいる",
        "もとの tasks も並べ替わると読んでいる",
      ],
    },
  },

  {
    order: 39,
    title: "メソッドチェーン ─ filter → map → reduce の流れを追う",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `const orders = [
  { id: "A-1", status: "paid", amount: 1200, coupon: 200 },
  { id: "A-2", status: "canceled", amount: 800, coupon: 0 },
  { id: "A-3", status: "paid", amount: 500, coupon: 600 },
];

const total = orders
  .filter((o) => o.status === "paid")
  .map((o) => o.amount - o.coupon)
  .reduce((sum, v) => sum + v, 0);

console.log(total);`,
    question:
      "このコードを実行すると何が出力されますか。その数になる理由も説明してください。",
    model_answer: `A-3 は amount が 500 で coupon が 600 なので、map の結果が -100 という負の数になります。

map は amount - coupon をそのまま返しており、0 を下限にする処理が無いためです。

filter の時点で canceled の A-2 が外れて2件になり、map で 1000 と -100 になります。reduce で足し合わせるので、出力は 900 です。`,
    prerequisite: `メソッドをつなげて書くと、前の結果に対して次のメソッドを呼びます。filter で件数が減り、map で1件ごとの形が変わり、reduce で1つの値にまとまります。

途中で件数も中身も変わるので、どの段階の配列に対する処理なのかを追いながら読みます。

reduce(関数, 0) は 0 から足し始めます。`,
    keywords: [
      { match: ["A-3", "coupon", "600"] },
      { match: ["-100", "マイナス", "負の数"] },
      { match: ["map", "下限", "そのまま返"] },
      { match: ["900", "2件", "A-2", "filter"] },
    ],
    rubric_items: {
      core: "クーポンが金額を超えた A-3 が負の数になるという結論を指していれば満たす",
      ground:
        "map が amount - coupon をそのまま返しており下限を設けていない点に触れていれば満たす",
      depth:
        "filter で A-2 が外れて2件になる点、または合計が 900 になる点に触れていれば満たす",
      core_reject: [
        "A-3 が 0 として扱われると読んでいる",
        "合計が 1000 になると読んでいる",
        "canceled の A-2 も合計に入ると読んでいる",
      ],
    },
  },

  {
    order: 40,
    title: "ネストした API レスポンスを掘る ─ flat / flatMap と実データの整形",
    language: "js",
    difficulty: 4,
    reading_type: "意図",
    code: `const response = {
  orders: [
    { id: "A-1", lines: [{ sku: "X-1", qty: 2 }, { sku: "X-2", qty: 1 }] },
    { id: "A-2", lines: [] },
    { id: "A-3", lines: [{ sku: "X-1", qty: 5 }] },
  ],
};

const allLines = response.orders.flatMap((order) =>
  order.lines.map((line) => ({ ...line, orderId: order.id })),
);`,
    question:
      "この書き方は、それぞれの注文が持つ明細をどのように扱っていますか。書いた人がなぜこの形を選んだのか、その意図を説明してください。",
    model_answer: `注文1件ごとに明細の配列が返るのを、1本の配列にならすための書き方です。

内側では order.lines を map しているので、注文1件につき配列が1つできます。これをそのまま集めると配列の配列になり、明細を横並びに扱えません。flatMap は1段だけ開くので、明細が並んだ配列になります。

各明細に orderId を足しているのは、平らにしたあとでもどの注文のものか分かるようにするためです。lines が空の A-2 は何も足さないので、結果には残りません。`,
    prerequisite: `配列.flat() は、要素として入っている配列を1段だけ開いて、外側の配列に並べ直します。

配列.flatMap(関数) は map してから flat() を1回かけたのと同じ働きです。

{ ...obj, 追加: 値 } は obj の中身を写した新しいオブジェクトを作り、そこに項目を足します。`,
    keywords: [
      { match: ["flatMap", "注文1件ごと"] },
      { match: ["1本", "平ら", "横並び"] },
      { match: ["lines", "配列の配列", "内側"] },
      { match: ["orderId", "A-2", "何も足さない"] },
    ],
    rubric_items: {
      core: "注文ごとに返る配列を1本の配列にならすためという意図を指していれば満たす",
      ground:
        "内側の map が注文1件につき明細の配列を返している点に触れていれば満たす",
      depth:
        "orderId を足すことで平らにしたあとも元の注文が分かるようにしている点、または lines が空の A-2 は結果に残らない点に触れていれば満たす",
      core_reject: [
        "明細を注文ごとにまとめ直すために使っていると読んでいる",
        "処理を速くするために使っていると読んでいる",
        "flatMap が入れ子をすべての深さまで開くと読んでいる",
      ],
    },
  },
];
