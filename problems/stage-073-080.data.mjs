// ステージ 73〜77・79・80 の問題データ（第10章 プロジェクト全体を見渡す。78 は A1 で投入済み）。
// **これで JS編（1〜80）が終わる。**
//
// 螺旋の回収が1本。
//   80 ← 30（破壊するメソッド・破壊しないメソッド）
//
// この章は「そのままでは動かせる形ではない」問題が多い（モジュール構文・package.json・
// テストファイル）。データ側に `runnable: false` を付けてあり、run-code.mjs が
// 実行対象外として表示する。**黙って SyntaxError を出すと壊れた問題と見分けが付かない。**
//
// 投入前に必ず次の2つを回すこと。
//   node problems/preflight.mjs problems/stage-073-080.data.mjs
//   node problems/run-code.mjs  problems/stage-073-080.data.mjs
//
// ⚠️ .sql は範囲指定で生成しないこと（78 が A1 投入分なので混ざる）。

export const problems = [
  {
    order: 73,
    title: "ES Modules ─ import / export（名前付きとデフォルト）",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    runnable: false,
    notRunnableReason: "モジュール構文のため、1ファイル単体では動かせない",
    code: `// lib/format.js
export const TAX_RATE = 0.1;

export function toYen(n) {
  return \`\${n} 円\`;
}

export default function summarize(items) {
  return \`\${items.length}件\`;
}

// app/report.js
import toYen, { TAX_RATE } from "../lib/format.js";

console.log(TAX_RATE);
console.log(toYen([1, 2, 3]));`,
    question:
      "2つの console.log でそれぞれ何が出力されますか。2つ目がその結果になる理由も説明してください。",
    model_answer: `2つ目で呼ばれるのは、format.js の toYen ではなく default に指定された summarize です。

中括弧の外に書いた名前は default に結び付き、その名前は読み込む側が自由に決められます。export した側と一致している必要はありません。

そのため toYen([1, 2, 3]) は summarize を呼び、出力は 0.1 と 3件 になります。format.js の toYen は読み込まれていないので使われません。一方 TAX_RATE は中括弧の中なので、export した側と同じ名前でなければ受け取れません。`,
    prerequisite: `export には2種類あります。export const x = … のように名前を付けて出すものと、export default … で1つだけ出せるものです。

読み込む側では、名前を付けて出したものは { } で囲んで、出したときと同じ綴りで受け取ります。export default で出したものは { } の外に書き、その名前は読み込む側が決めます。

import 名前, { … } from "…" は、この2つを1行で書いた形です。`,
    keywords: [
      { match: ["toYen", "default"] },
      { match: ["summarize", "3件"] },
      { match: ["中括弧の外", "自由に決め", "何でもよ"] },
      { match: ["TAX_RATE", "中括弧の中", "同じ名前"] },
    ],
    rubric_items: {
      core: "toYen という名前で入ってくるのが default の summarize だという結論を指していれば満たす",
      ground:
        "中括弧の外に書いた名前は default に結び付き読み込む側が自由に決められる点に触れていれば満たす",
      depth:
        "出力が 3件 になり format.js の toYen が使われない点、または TAX_RATE は同じ名前でなければ受け取れない点に触れていれば満たす",
      core_reject: [
        "2つ目が format.js の toYen を呼ぶと読んでいる",
        "名前が違うので実行時エラーになると読んでいる",
        "TAX_RATE も自由な名前で受け取れると読んでいる",
      ],
    },
  },

  {
    order: 74,
    title: "CommonJS(require) と ESM が混ざったコードを読む",
    language: "js",
    difficulty: 4,
    reading_type: "ズレ",
    runnable: false,
    notRunnableReason: "2つの形式のファイルにまたがるため、1ファイル単体では動かせない",
    code: `// lib/legacy.js（CommonJS）
const helpers = {};

helpers.formatDate = (d) => d;
helpers.VERSION = "1.4.0";

module.exports = helpers;

// app/main.mjs（ESM）
import { VERSION } from "../lib/legacy.js";

console.log(VERSION);`,
    question:
      "このコードを実行すると何が起きますか。そうなる理由も説明してください。",
    model_answer: `名前を指定した取り込みができず、読み込みの時点で失敗します。

CommonJS 側の module.exports がやっているのは、組み立てたオブジェクトを1つ渡すことだけです。名前ごとに出しているわけではないので、ESM 側から { VERSION } と書いても受け取る先がありません。

ESM の取り込みは実行が始まる前に決まるので、これは実行時のエラーではなく読み込み時のエラーになります。try で囲んでも捕まりません。default として1つ受け取ってから、そこから中身を取り出す形にすれば動きます。`,
    prerequisite: `CommonJS では module.exports = 値 で1つの値を外へ出します。ESM では export を使って、出すものに名前を付けられます。

ESM の import { … } は、読み込む前にどの名前があるかが決まっている必要があります。相手が CommonJS の場合、Node はコードを調べて名前を推測しますが、組み立ててから代入する書き方では見つけられません。

import 名前 from "…" の形なら、相手が渡した値そのものを受け取れます。`,
    keywords: [
      { match: ["VERSION", "名前を指定"] },
      { match: ["失敗", "受け取る先", "できず"] },
      { match: ["module.exports", "名前ごと", "1つ渡す"] },
      { match: ["default", "実行が始まる前", "読み込み時"] },
    ],
    rubric_items: {
      core: "名前を指定した取り込みができず読み込みの時点で失敗するという結論を指していれば満たす",
      ground:
        "CommonJS 側が1つのオブジェクトを渡しているだけで名前ごとに出していない点に触れていれば満たす",
      depth:
        "実行が始まる前に決まるので try で囲んでも捕まらない点、または default として受け取れば動く点に触れていれば満たす",
      core_reject: [
        "VERSION に 1.4.0 が入ると読んでいる",
        "実行時に undefined になるだけだと読んでいる",
        "CommonJS と ESM はどう書いても混ぜられないと読んでいる",
      ],
    },
  },

  {
    order: 75,
    title: "package.json と npm ─ 依存関係を読む",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    runnable: false,
    notRunnableReason: "package.json の中身なので、実行するものではない",
    code: `{
  "name": "order-batch",
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run",
    "ci": "npm run build && npm run test"
  },
  "dependencies": {
    "zod": "^3.22.4",
    "date-fns": "~2.30.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "typescript": "5.4.5"
  }
}`,
    question:
      "この package.json から、依存の指定と scripts について読み取れることを説明してください。",
    model_answer: `3つの指定は、上がってよい幅がそれぞれ違います。

zod の 3.22.4 は左端の数字を変えない範囲で新しくなります。date-fns の 2.30.0 は左から2つ目までを変えない範囲だけなので、2.31 には上がりません。typescript の 5.4.5 は記号が付いていないので固定で、そこから動きません。

もう2つ読み取れます。開発のときだけ使う側に並んでいる vitest と typescript は、公開用の導入では外せます。ci は && でつないでいるので、build が失敗すると test は走らずにそこで止まります。`,
    prerequisite: `dependencies はアプリを動かすのに要るもの、devDependencies は開発のときだけ要るものです。公開用に入れるときは後者を外せます。

バージョンの前に付く記号には意味があります。^ は左端の数字を保つぶんだけ新しくしてよい、~ は左から2番目までを保つぶんだけ、というきまりです。何も付けなければその1つだけになります。

npm run 名前 は scripts の中身を実行します。A && B は A が成功したときだけ B を走らせます。`,
    keywords: [
      { match: ["3.22.4", "2.30.0"] },
      { match: ["上がってよい", "上がる", "新しくな"] },
      { match: ["5.4.5", "固定", "動かな"] },
      { match: ["devDependencies", "&&", "build が失敗"] },
    ],
    rubric_items: {
      core: "3つのバージョン指定で上がってよい幅が違うという結論を指していれば満たす",
      ground:
        "^ と ~ と記号なしで新しくなる範囲が変わる点に触れていれば満たす",
      depth:
        "devDependencies が公開用の導入では外せる点、または ci が && なので build の失敗で test が走らない点に触れていれば満たす",
      core_reject: [
        "^ と ~ が同じ意味だと読んでいる",
        "typescript もほかと同じように上がると読んでいる",
        "devDependencies も公開用の導入に含まれると読んでいる",
      ],
    },
  },

  {
    order: 76,
    title: "Node.js 標準モジュール ─ fs / path で書かれたスクリプトを読む",
    language: "js",
    difficulty: 4,
    reading_type: "意図",
    runnable: false,
    notRunnableReason: "Node の標準モジュールを取り込むため、この場では動かせない",
    code: `import { readFile, writeFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";

export async function convert(inputPath, outDir) {
  const raw = await readFile(inputPath, "utf8");
  const rows = raw.split("\\n").filter((line) => line.length > 0);

  const name = basename(inputPath, extname(inputPath));
  const outPath = join(outDir, \`\${name}.json\`);

  await writeFile(outPath, JSON.stringify(rows, null, 2), "utf8");

  return { outPath, count: rows.length };
}`,
    question:
      "この関数は、出力先の場所を文字列の足し算ではなく専用の関数で組み立てています。書いた人がなぜこの形を選んだのか、その意図を説明してください。",
    model_answer: `場所の組み立てを自分の手でやらず、環境や入力の形の違いを吸収させるためです。

文字列の足し算で outPath を作ると、outDir の末尾に区切りが付いているかどうかで結果が変わります。join に任せれば、そこを気にしなくてよくなります。

basename と extname を通しているのも同じ考えです。入力が相対でも絶対でも、どれだけ深い場所にあっても、拡張子が何であっても、取り出せる名前は同じになります。区切りの記号は OS によって違うので、そこも任せています。`,
    prerequisite: `node:path の join(…) は、渡した断片をその環境の区切り記号でつなぎます。basename(パス, 取り除きたい部分) はいちばん後ろの名前だけを取り出し、extname(パス) は . から後ろを返します。

node:fs/promises の readFile / writeFile は、結果を Promise で返します。

パスの区切り記号は環境によって違います。/ を使う環境と \\ を使う環境があります。`,
    keywords: [
      { match: ["outPath", "outDir"] },
      { match: ["吸収", "気にしなくて", "任せ"] },
      { match: ["末尾", "付いているかどうか", "結果が変わ"] },
      { match: ["相対", "絶対", "拡張子", "OS"] },
    ],
    rubric_items: {
      core: "場所の組み立てを自分でやらず環境や入力の形の違いを吸収させるという意図を指していれば満たす",
      ground:
        "文字列の足し算だと outDir の末尾の有無で結果が変わる点に触れていれば満たす",
      depth:
        "入力が相対でも絶対でも同じ名前が取れる点、または区切りの記号が OS によって違う点に触れていれば満たす",
      core_reject: [
        "処理を速くするために使っていると読んでいる",
        "入力のファイルを書き換えるために使っていると読んでいる",
        "出力先を outDir ではなく入力と同じ場所にするためだと読んでいる",
      ],
    },
  },

  {
    order: 77,
    title: "process.env と設定ファイル ─ 環境ごとの分岐を読む",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `function resolveConfig(env) {
  const isProd = env.NODE_ENV === "production";

  return {
    apiBase: env.API_BASE ?? (isProd ? "https://api.example.com" : "http://localhost:3000"),
    debug: env.DEBUG === "true",
    retries: Number(env.RETRIES ?? 3),
  };
}

console.log(resolveConfig({ NODE_ENV: "production", DEBUG: "false", RETRIES: "0" }));
console.log(resolveConfig({ NODE_ENV: "development" }));`,
    question:
      "2つの console.log でそれぞれどんなオブジェクトが出力されますか。1つ目で意外に思える値があれば、その理由も説明してください。",
    model_answer: `1つ目の設定では retries が 3 ではなく 0 になります。

?? は左が null か undefined のときだけ右を使います。RETRIES には "0" が入っていて、これはどちらでもないので左がそのまま残ります。Number を通しても 0 が残ります。

環境変数の値はすべて文字として届くので、DEBUG も "false" という中身のあるものです。=== "true" と比べているので false になります。2つ目の呼び出しでは NODE_ENV が production ではないので apiBase は localhost のほうになり、RETRIES が無いので retries は 3 になります。`,
    prerequisite: `環境変数の値は、数字を書いても真偽を書いても、受け取るときはすべて文字列です。"0" も "false" も中身のある文字列です。

a ?? b は、a に値が無いとき（null と undefined）だけ b を使います。a || b は、それに加えて空の文字や 0 のときも b を使います。この2つを取り違えると、0 を指定したのに既定値に戻ってしまいます。

Number(値) は数に直します。env.X === "true" のような比べ方は、文字列として一致するかを見ています。`,
    keywords: [
      { match: ["retries", "1つ目の設定"] },
      { match: ["3 ではな", "0 が残"] },
      { match: ["どちらでもな", "そのまま残", "左が"] },
      { match: ["DEBUG", "false", "localhost", "3 になり"] },
    ],
    rubric_items: {
      core: "1つ目で retries が 3 ではなく 0 になるという結論を指していれば満たす",
      ground:
        "?? が左を使わないのは null か undefined のときだけである点に触れていれば満たす",
      depth:
        "DEBUG が \"false\" という中身のある値でも === \"true\" で false になる点、または2つ目では RETRIES が無いので 3 になる点に触れていれば満たす",
      core_reject: [
        "1つ目の retries が 3 になると読んでいる",
        "1つ目の debug が true になると読んでいる",
        "2つ目の apiBase が https のほうになると読んでいる",
      ],
    },
  },

  {
    order: 79,
    title: "テストコードを読む② ─ 落ちたテストの出力から原因箇所を絞る",
    language: "js",
    difficulty: 5,
    reading_type: "影響",
    runnable: false,
    notRunnableReason: "テストファイルなので、vitest から実行するもの",
    code: `// lib/slug.js
export function toSlug(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[,_/]/g, "-")
    .replace(/[^\\w\\s-]/g, "")
    .replace(/\\s+/g, "-");
}

// lib/slug.test.js
import { describe, it, expect } from "vitest";
import { toSlug } from "./slug.js";

describe("toSlug", () => {
  it("空白をつなぐ", () => {
    expect(toSlug("Hello World")).toBe("hello-world");
  });

  it("前後の空白を落とす", () => {
    expect(toSlug("  Hello World  ")).toBe("hello-world");
  });

  it("記号を落とす", () => {
    expect(toSlug("Hello, World!")).toBe("hello-world");
  });

  it("連続した空白を1つにする", () => {
    expect(toSlug("Hello   World")).toBe("hello-world");
  });
});`,
    context: ` ✓ lib/slug.test.js > toSlug > 空白をつなぐ
 ✓ lib/slug.test.js > toSlug > 前後の空白を落とす
 × lib/slug.test.js > toSlug > 記号を落とす
   → expected 'hello--world' to be 'hello-world'
 ✓ lib/slug.test.js > toSlug > 連続した空白を1つにする

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)`,
    question:
      "テストが1件だけ落ちています。実行結果を手がかりに、原因がコードのどこにあるかを説明してください。",
    model_answer: `原因は、記号をハイフンに変える行と、空白をハイフンに変える行が続けざまに効いていることです。

落ちた入力の「Hello, World!」はカンマの後ろに空白があります。まずカンマがハイフンになり、そのあと残った空白ももう1つのハイフンになるので、ハイフンが2つ並びます。実行結果の expected 'hello--world' to be 'hello-world' が、ちょうどその1つぶんの差を示しています。

ほかの3件は通っているので、原因はカンマのような記号を含む入力に限られると分かります。trim の行も、空白をまとめる行も、それぞれ別の1件が通っているので無関係です。`,
    prerequisite: `describe と it はテストのまとまりと1件を表します。expect(実際).toBe(期待) は、左右が同じかを確かめます。

実行結果の ✓ は通ったもの、× は落ちたものです。落ちた行の下には、受け取った値と期待した値が並びます。

文字列.replace(正規表現, 置き換えるもの) をつなげて書くと、前の結果に対して次が働きます。[^\\w\\s-] は「英数字・下線・空白・ハイフン以外」を表します。`,
    keywords: [
      { match: ["カンマ", "記号をハイフン"] },
      { match: ["2つ", "--", "重なっ"] },
      { match: ["空白をハイフン", "続けざま", "そのあと"] },
      { match: ["3件", "trim", "通って"] },
    ],
    rubric_items: {
      core: "記号をハイフンに変える行と空白をハイフンに変える行が続けざまに効いているのが原因だという結論を指していれば満たす",
      ground:
        "実行結果の expected 'hello--world' to be 'hello-world' がハイフン1つぶんの差である点に触れていれば満たす",
      depth:
        "ほかの3件が通っているのでカンマを含む入力だけで起きると絞れる点、または trim や空白をまとめる処理は無関係だと分かる点に触れていれば満たす",
      core_reject: [
        "trim が効いていないのが原因だと読んでいる",
        "空白をまとめる処理が原因だと読んでいる",
        "期待した値のほうが間違っていると読んでいる",
      ],
    },
  },

  {
    order: 80,
    title: "総合演習 ─ ユーティリティ群のうち仕様と食い違う1つを見つける",
    language: "js",
    difficulty: 5,
    reading_type: "ズレ",
    code: `// このファイルの関数はすべて「渡された配列を変えずに新しい配列を返す」ことになっている

function head(list, n) {
  return list.slice(0, n);
}

function withoutEmpty(list) {
  return list.filter((v) => v !== "");
}

function sortedByLength(list) {
  return list.sort((a, b) => a.length - b.length);
}

function appended(list, value) {
  return [...list, value];
}

const src = ["bb", "a", "", "ccc"];

console.log(sortedByLength(src));
console.log(src);`,
    question:
      "4つの関数のうち1つだけが、先頭のコメントに書かれた決まりを守っていません。どれがどう違うかを、出力とあわせて説明してください。",
    model_answer: `決まりを守っていないのは sortedByLength だけです。

sort は新しい配列を作らず、その場で並べ替えて同じ配列を返します。そのため src も並べ替わってしまい、出力の2行はどちらも [ '', 'a', 'bb', 'ccc' ] になります。

ほかの3つは決まりどおりです。head の slice も withoutEmpty の filter も別の配列を返しますし、appended はスプレッドで組み直しているので、渡された配列に手を入れていません。`,
    prerequisite: `配列のメソッドには、呼ばれた配列そのものに手を入れるものと、手を入れずに別の配列を返すものがあります。ステージ30 で扱った区別です。

slice と filter と [...配列] は後者です。sort と push と splice は前者で、返ってくるものも別ではありません。

先頭のコメントのような約束は、機械が守らせてくれるわけではありません。実際の動きと突き合わせて読むこと。`,
    keywords: [
      { match: ["sortedByLength", "sort"] },
      { match: ["src", "並べ替わ", "変えて"] },
      { match: ["新しい配列を作らな", "その場で", "同じ配列"] },
      { match: ["slice", "filter", "決まりどおり", "2行"] },
    ],
    rubric_items: {
      core: "sortedByLength だけが渡された配列を変えてしまうという結論を指していれば満たす",
      ground:
        "sort が新しい配列を作らずその場で並べ替えて同じ配列を返す点に触れていれば満たす",
      depth:
        "出力の2行がどちらも同じ中身になる点、または残る3つは別の配列を返すので決まりどおりである点に触れていれば満たす",
      core_reject: [
        "appended が渡された配列を変えると読んでいる",
        "4つとも決まりどおりだと読んでいる",
        "withoutEmpty が渡された配列から空文字を消すと読んでいる",
      ],
    },
  },
];
