// ステージ 55〜58 の問題データ（第8章 壊れたときの挙動を読む。59 は A1 で投入済み）。
//
// 57 は 72（fetch）の回収元の1つ。もう1つは 46（JSON）。
// 72 を作るときは stage-041-048.md（46）と本ファイル（57）の両方を読むこと。
//
// 投入前に必ず次の2つを回すこと。
//   node problems/preflight.mjs problems/stage-055-058.data.mjs
//   node problems/run-code.mjs  problems/stage-055-058.data.mjs
//
// ⚠️ .sql は範囲指定で生成しないこと（59 が A1 投入分なので混ざる）。

export const problems = [
  {
    order: 55,
    title: "throw と Error オブジェクト",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `class ValidationError extends Error {
  constructor(field) {
    super(\`\${field} が不正です\`);
    this.name = "ValidationError";
    this.field = field;
  }
}

function check(kind) {
  if (kind === "class") {
    throw new ValidationError("quantity");
  }
  if (kind === "string") {
    throw "壊れています";
  }
  return "ok";
}

for (const kind of ["class", "string"]) {
  try {
    check(kind);
  } catch (e) {
    console.log(e.name, "/", e.message, "/", e instanceof Error);
  }
}`,
    question:
      "2回の繰り返しでそれぞれ何が出力されますか。2周目がその結果になる理由も説明してください。",
    model_answer: `2周目は undefined / undefined / false になります。

throw には Error 以外の値も書けて、catch はそれをそのまま受け取ります。ここで投げているのは「壊れています」という文字列なので、e には name も message も入っていません。読もうとしても undefined になるだけで、実行時エラーにもなりません。

e instanceof Error も false です。1周目のほうは ValidationError / quantity が不正です / true になります。`,
    prerequisite: `throw は例外を発生させ、その場で処理を中断します。catch (e) の e には、投げられた値がそのまま入ります。

投げる値は Error でなくても構いません。ただし name や message は Error が用意しているものなので、別の種類の値を投げるとそれらは存在しません。

class B extends Error は Error を土台にした自分用の種類を作る書き方で、super(…) に渡した文が message になります。値 instanceof クラス名 は、その値がそのクラスを土台にしているかを真偽で返します。`,
    keywords: [
      { match: ["文字列", "壊れています", "2回目"] },
      { match: ["undefined", "取り出せな", "入っていな"] },
      { match: ["throw", "Error 以外", "そのまま受け取"] },
      { match: ["instanceof", "false", "ValidationError"] },
    ],
    rubric_items: {
      core: "文字列を投げた回は e に name も message も入っていないという結論を指していれば満たす",
      ground:
        "throw には Error 以外の値も書けて catch がそれをそのまま受け取る点に触れていれば満たす",
      depth:
        "e instanceof Error が false になる点、または1周目が ValidationError / quantity が不正です / true になる点に触れていれば満たす",
      core_reject: [
        "2周目の message に「壊れています」が入ると読んでいる",
        "文字列を投げると catch されずに落ちると読んでいる",
        "1周目の name が Error になると読んでいる",
      ],
    },
  },

  {
    order: 56,
    title: "try / catch / finally ─ 実行順を追う",
    language: "js",
    difficulty: 4,
    reading_type: "トレース",
    code: `function loadRecord(id) {
  try {
    if (id < 0) {
      throw new Error("id が不正です");
    }
    console.log("try");
    return "見つかりました";
  } catch (e) {
    console.log("catch");
    return "見つかりません";
  } finally {
    console.log("finally");
  }
}

function loadRecordBroken(id) {
  try {
    return "見つかりました";
  } finally {
    return "finally の値";
  }
}

console.log(loadRecord(1));
console.log(loadRecord(-1));
console.log(loadRecordBroken(1));`,
    question:
      "このコードを実行すると何が出力されますか。最後の1行がその値になる理由も説明してください。",
    model_answer: `最後の1行は「finally の値」になります。

finally は try や catch が return を決めたあとにも走ります。そこで return を書くと、先に決まっていた戻り値が捨てられて finally のものに置き換わります。

出力の順も同じ理由で決まります。loadRecord(1) は try → finally → 見つかりました、loadRecord(-1) は catch → finally → 見つかりません の順に出ます。戻り値が決まっていても、それが呼び出し元へ戻る前に finally が走るためです。`,
    prerequisite: `try { … } catch (e) { … } finally { … } の finally は、例外が起きても起きなくても最後に走ります。

try や catch の中で return を書いた場合でも、その値が外へ渡される手前で finally が実行されます。

finally の中に return を書くこともできます。その場合どちらの値が返るかは、順序を追って考えること。`,
    keywords: [
      { match: ["finally", "loadRecordBroken"] },
      { match: ["捨て", "上書き", "置き換わ"] },
      { match: ["return", "決めたあと", "戻る前"] },
      { match: ["出力の順", "見つかりません", "先に走"] },
    ],
    rubric_items: {
      core: "finally に return を書くと try の return が捨てられるという結論を指していれば満たす",
      ground:
        "finally が try や catch の return より後に走る点に触れていれば満たす",
      depth:
        "出力が try → finally → 戻り値 の順になる点、または loadRecord(-1) で catch → finally の順に出る点に触れていれば満たす",
      core_reject: [
        "最後の1行が「見つかりました」になると読んでいる",
        "return のあとなので finally は実行されないと読んでいる",
        "loadRecord(-1) では finally が走らないと読んでいる",
      ],
    },
  },

  {
    order: 57,
    title: "握りつぶされた catch を読む ─ エラーが消えるコード",
    language: "js",
    difficulty: 4,
    reading_type: "ズレ",
    code: `// 設定が壊れていたら既定値で動かす
function loadUserPrefs(raw, applyTheme) {
  try {
    const parsed = JSON.parse(raw);
    applyTheme(parsed.theme);
    return { theme: parsed.theme, perPage: parsed.perPage };
  } catch (e) {
    return { theme: "light", perPage: 20 };
  }
}

function applyTheme(name) {
  if (name === "dark") {
    throw new Error("テーマの適用に失敗しました");
  }
}

console.log(loadUserPrefs('{"theme":"dark","perPage":50}', applyTheme));
console.log(loadUserPrefs("{壊れた", applyTheme));`,
    question:
      "コメントに書かれた意図と、実際の動きが食い違っています。2つの出力を示したうえで、どこがどう食い違うかを説明してください。",
    model_answer: `1つ目は設定が壊れていないのに、既定値の { theme: 'light', perPage: 20 } が返ります。

try の範囲に applyTheme の呼び出しまで入っているためです。JSON.parse が投げた例外も、applyTheme が投げた例外も、まとめて同じ catch が受けます。1つ目で失敗しているのはテーマの適用のほうで、設定そのものは正しく読めています。

2つ目も同じ戻り値になるので、どちらが起きたのかを呼び出し元から区別できません。catch は受け取った値を一度も見ていないので、記録も残りません。`,
    prerequisite: `try { … } catch (e) { … } は、try の中で起きた例外を catch が受け止めます。try に入っている行のうち、どれが失敗したのかは catch 側からは分かりません。

JSON.parse(文字列) は、形が壊れていると例外を投げます。

catch で受けた値を使わずに別の値を返すと、その失敗はどこにも残らず、呼び出した側からは成功したときと同じに見えます。`,
    keywords: [
      { match: ["applyTheme", "1つ目", "try の範囲"] },
      { match: ["既定値", "light", "20"] },
      { match: ["catch", "まとめて", "広すぎ", "囲まれ"] },
      { match: ["区別", "見分け", "記録"] },
    ],
    rubric_items: {
      core: "1つ目は設定が壊れていないのに既定値が返るという結論を指していれば満たす",
      ground:
        "try の範囲に applyTheme の呼び出しまで入っていて同じ catch が受ける点に触れていれば満たす",
      depth:
        "2つ目と戻り値が同じで原因を区別できない点、または catch が受け取った値を見ていないので記録が残らない点に触れていれば満たす",
      core_reject: [
        "1つ目が dark と 50 のまま返ると読んでいる",
        "applyTheme が投げた例外は外へ出ると読んでいる",
        "2つ目だけが既定値になると読んでいる",
      ],
    },
  },

  {
    order: 58,
    title: "バリデーション ─ 壊れた値が来る前提のコードを読む",
    language: "js",
    difficulty: 4,
    reading_type: "意図",
    code: `const REQUIRED = ["id", "amount", "placedAt"];

function normalizeOrder(input) {
  const problems = [];

  for (const key of REQUIRED) {
    if (!(key in input)) {
      problems.push(\`\${key} がありません\`);
    }
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) {
    problems.push("amount が数として読めません");
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    order: { id: String(input.id), amount, placedAt: input.placedAt },
  };
}`,
    question:
      "この関数は、問題を見つけてもそこで切り上げずに最後まで進んでから返しています。書いた人がなぜこの形を選んだのか、その意図を説明してください。",
    model_answer: `見つかった問題をすべて集めてから、一度に返すためです。

途中で切り上げると、呼ぶ側は1つ直して送り直すたびに次の問題を知ることになります。ここでは problems に push していき、最後にまとめて返しているので、1回のやり取りで直すべき箇所が分かります。

戻り値の形も揃えてあります。ok が true のときだけ変換済みの order を返すので、呼ぶ側は「ok なら中身は揃っている」と信じて進められます。例外ではなく戻り値にしてあるので、呼ぶ側が try で囲む必要もありません。`,
    prerequisite: `"名前" in obj は、そのプロパティが obj にあるかどうかを真偽で返します。

Number(値) は数に直そうとします。数として読めないときの結果は NaN になり、Number.isFinite(値) はそれを含めて「ふつうの数か」を確かめます。

検査の結果を例外で知らせるか戻り値で知らせるかは設計の選択で、呼ぶ側の書き方が変わります。`,
    keywords: [
      { match: ["problems", "すべて", "全部"] },
      { match: ["一度に", "まとめて", "1回で"] },
      { match: ["push", "最後に", "途中で切り上げ"] },
      { match: ["ok", "order", "例外ではな", "try で囲"] },
    ],
    rubric_items: {
      core: "見つかった問題をすべて集めてから一度に返すという意図を指していれば満たす",
      ground:
        "problems に push していき最後にまとめて返している点に触れていれば満たす",
      depth:
        "ok が true のときだけ変換済みの order を返すので呼ぶ側が中身を信じられる点、または例外ではなく戻り値なので呼ぶ側が try で囲まなくてよい点に触れていれば満たす",
      core_reject: [
        "処理を速くするために最後まで進めていると読んでいる",
        "最初に見つかった問題だけを返していると読んでいる",
        "問題があっても order を返していると読んでいる",
      ],
    },
  },
];
