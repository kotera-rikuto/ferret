// ステージ 6〜14 の問題データ（第1章の残り2問 + 第2章まるごと）。
//
// **このファイルが投入内容の正。** ここから投入し、投入後の実データから .sql を生成する。
// 手で SQL を書くと記録と DB がずれるため（tasked/A1-読解型の検証.md の決定①）。
//
// 書式は ideas/問題作成ガイド.md、構成は ideas/問題構成案.md v3 に従う。
// id は書かない（GENERATED ALWAYS AS IDENTITY）。
//
// 投入前の機械検査は `node problems/preflight.mjs` で回す。

export const problems = [
  // -------------------------------------------------------------------------
  // 第1章 値の正体を掴む（残り2問）
  // -------------------------------------------------------------------------
  {
    order: 6,
    title: "文字列の組み立て ─ テンプレートリテラルと + の二つの顔",
    language: "js",
    difficulty: 2,
    reading_type: "トレース",
    code: `function buildOrderLine(item) {
  const goods = item.unitPrice * item.quantity;
  const subtotal = item.shippingFee + goods;
  return \`\${item.name} 小計 \${subtotal} 円 / 手数料込み \` + (subtotal + 300);
}

console.log(buildOrderLine({
  name: "定期便A",
  unitPrice: 1200,
  quantity: 2,
  shippingFee: "500",
}));`,
    question:
      "このコードを実行すると何が出力されますか。その値になる理由も説明してください。",
    model_answer: `出力は「定期便A 小計 5002400 円 / 手数料込み 5002400300」になります。

shippingFee が "500" という文字列で渡っているため、3行目の + は足し算ではなく左右をつないで1つにする連結として働き、subtotal は 5002400 になります。一方 2行目の * は片側が数字の見た目であれば数として計算されるので、goods は 2400 です。

最後の (subtotal + 300) も同じ理由で連結になり、5002400300 になります。`,
    prerequisite: `バッククォートで囲んで \${ } を書くやり方をテンプレートリテラルといい、差し込んだ値を並べて1つのテキストにします。

+ は両側が数どうしなら足し算になりますが、片側がテキストのときは左右を並べて1つのテキストを作る働きに変わります。* はこの切り替えを持ちません。

JSON で届いたデータは、見た目が数字でも数の形で入っているとは限りません。`,
    keywords: [
      { match: ["shippingFee", "手数料"] },
      { match: ["連結", "つなぐ", "つなげ", "結合"] },
      { match: ["文字列", "数として", "文字のまま"] },
      { match: ["5002400300", "5002400", "2400"] },
    ],
    rubric_items: {
      core: "shippingFee が文字列で渡っているため + が連結として働くという結論を指していれば満たす",
      ground:
        "3行目の item.shippingFee + goods が足し算になっていない点に触れていれば満たす",
      depth:
        "subtotal が 5002400 になる点、または最後が 5002400300 で終わる点、または * のほうは 2400 と計算される点に触れていれば満たす",
      core_reject: [
        "shippingFee と goods が足し算されて 2900 になると読んでいる",
        "テンプレートリテラルが値を壊していると読んでいる",
        "unitPrice * quantity も連結になると読んでいる",
      ],
    },
  },

  {
    order: 7,
    title: "== と === ─ 暗黙の型変換のワナ",
    language: "js",
    difficulty: 2,
    reading_type: "トレース",
    code: `function shouldSendReminder(form) {
  if (form.remindDays == 0) {
    return false;
  }
  if (form.remindDays === "0") {
    return false;
  }
  return true;
}

console.log(shouldSendReminder({ remindDays: "" }));
console.log(shouldSendReminder({ remindDays: "0" }));
console.log(shouldSendReminder({ remindDays: 3 }));`,
    question:
      "3回の呼び出しでそれぞれ何が出力されますか。1つ目がその結果になる理由も説明してください。",
    model_answer: `出力は上から false、false、true の3行です。

1つ目では remindDays が空文字なので、2行目の == 0 が型変換を行って空文字を 0 とみなし、条件が成立して false が返ります。

2つ目の "0" も同じく == 0 で成立するため、5行目の === "0" を書いた if には一度も到達しません。3つ目は 3 なのでどちらの条件にも当てはまらず true が返ります。`,
    prerequisite: `JavaScript には値を比べる記号が2種類あります。=== は左右の型まで含めて同じかどうかを見ます。== は型が違うときに片方をそろえてから比べます。

そろえ方には決まった規則があり、数と数以外を比べるときは数のほうにそろえます。

HTML のフォームから受け取った値は、数字を入れたつもりでも文字として届きます。`,
    // スロット#3 に「型変換」「そろえ」を置かない。
    // 前者はタイトル（暗黙の型変換のワナ）に、後者は前提知識に出ている語で、
    // どちらも画面から写せてしまう。コードに見えている == は写せてよい（ガイドの但し書き）。
    keywords: [
      { match: ["remindDays", "空文字", "空の文字"] },
      { match: ["false", "送らない"] },
      { match: ["0 とみなし", "0 と等しい", "0 に変換", "同じとみなさ"] },
      { match: ["到達", "一度も", "true"] },
    ],
    rubric_items: {
      core: "空文字が == 0 の比較で 0 と等しいと判定される点を指していれば満たす",
      ground:
        "2行目の form.remindDays == 0 が成立して1つ目の if に入る点に触れていれば満たす",
      depth:
        '出力が false / false / true の3行になる点、または5行目の === "0" の if に一度も到達しない点に触れていれば満たす',
      core_reject: [
        "1つ目が true になると読んでいる",
        '2つ目は 5行目の === "0" の if で止まっていると読んでいる',
        "== と === の違いは結果に出ていないと読んでいる",
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 第2章 実行の道筋を追う（8〜14）
  // -------------------------------------------------------------------------
  {
    order: 8,
    title: "if / else if / else ─ どの枝を通るか追う",
    language: "js",
    difficulty: 2,
    reading_type: "トレース",
    code: `function decidePriority(ticket) {
  if (ticket.waitingHours >= 24) {
    return "至急";
  } else if (ticket.waitingHours >= 72) {
    return "最優先";
  } else if (ticket.isPaidPlan) {
    return "優先";
  } else {
    return "通常";
  }
}

console.log(decidePriority({ waitingHours: 100, isPaidPlan: false }));
console.log(decidePriority({ waitingHours: 30, isPaidPlan: true }));
console.log(decidePriority({ waitingHours: 2, isPaidPlan: true }));`,
    question:
      "3回の呼び出しでそれぞれ何が返りますか。この関数の分岐について気づいたことがあれば書いてください。",
    model_answer: `waitingHours が 72 以上でも最優先の枝には到達しません。1つ手前に書かれた waitingHours >= 24 の条件が 72 以上の場合も含んでしまい、そこで先に至急が返るためです。

戻り値は上から 至急、至急、優先 の3つになります。3つ目だけは待ち時間が 2 なので上2つの条件に当てはまらず、isPaidPlan によって優先が返ります。`,
    prerequisite: `if / else if / else は、上から順に条件を試して、最初に成立したところだけを実行します。成立した時点で残りの条件は試されません。

>= は「以上」を意味します。ticket.waitingHours のようにドットでつなぐ書き方は、オブジェクトの中にある値を取り出しています。`,
    keywords: [
      { match: ["最優先", "72"] },
      { match: ["到達", "入らない", "通らない", "選ばれない"] },
      { match: ["24", "手前", "上の条件"] },
      { match: ["至急", "3回とも", "1つ目と2つ目"] },
    ],
    rubric_items: {
      core: "waitingHours >= 72 の枝には決して到達しないという結論を指していれば満たす",
      ground:
        "1つ手前の waitingHours >= 24 が 72 以上の場合も含んでしまう点に触れていれば満たす",
      depth: "3回の戻り値が 至急 / 至急 / 優先 になる点に触れていれば満たす",
      core_reject: [
        "1つ目の呼び出しで最優先が返ると読んでいる",
        "waitingHours が 100 のとき最後の else に落ちると読んでいる",
        "isPaidPlan が true なら優先が返ると読んでいる",
      ],
    },
  },

  {
    order: 9,
    title: "truthy と falsy ─ 空文字と 0 が分岐を変える",
    language: "js",
    difficulty: 3,
    reading_type: "ズレ",
    code: `function buildProfileSummary(profile) {
  // 表示名が設定されていなければユーザーIDを代わりに出す
  const displayName = profile.displayName || profile.userId;

  // フォロワー数がまだ取得できていないときだけ「-」にする
  const followers = profile.followerCount || "-";

  return \`\${displayName} / フォロワー \${followers}\`;
}

console.log(buildProfileSummary({
  displayName: "",
  userId: "u_8842",
  followerCount: 0,
}));`,
    question:
      "コメントに書かれた意図と、実際の動きが食い違っている箇所があります。どこがどう食い違うかを説明してください。",
    model_answer: `followerCount が 0 のときも「-」が表示されます。|| は左の値が falsy なら右を返しますが、0 はその falsy に含まれるため、実際には取得できていて 0 だった場合まで同じ扱いになります。コメントが想定しているのは値が届かなかった場合だけなので、ここが食い違っています。

一方 displayName の行は、空のときに userId へ置き換わるというコメントどおりの動きです。出力は「u_8842 / フォロワー -」になります。`,
    prerequisite: `|| は、左の値が「あり」とみなせるならそれを、そうでなければ右の値を返します。

何が「あり」で何が「なし」かは値ごとに決まっており、null や undefined のほかに、空の文字や一部の数もここでは「なし」の側に入ります。

\${ } を含むバッククォートの書き方は、値を差し込んで1つのテキストを組み立てます。`,
    keywords: [
      { match: ["followerCount", "フォロワー"] },
      { match: ["0 のとき", "0 でも", "0 だった", "ゼロ"] },
      { match: ["falsy", "空と同じ", "偽の値"] },
      { match: ["displayName", "コメントどおり", "ユーザーID"] },
    ],
    rubric_items: {
      core: "followerCount が 0 のときも「-」が表示される点を指していれば満たす",
      ground:
        "|| が左の値を falsy と判定したときに右を返す仕組みに触れていれば満たす",
      depth:
        "食い違っているのが followerCount の行だけで displayName の行はコメントどおり動いている点に触れていれば満たす",
      core_reject: [
        "followerCount が 0 のときは 0 がそのまま表示されると読んでいる",
        "displayName の行にも同じ食い違いがあると読んでいる",
        "出力の左側が空のままになると読んでいる",
      ],
    },
  },

  {
    order: 10,
    title: "&& || ?? ─ 短絡評価が「返す値」",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `function resolveSettings(config) {
  const perPage = config.perPage ?? 20;
  const theme = config.theme || "light";
  const canExport = config.isPro && config.exportLimit;

  return { perPage, theme, canExport };
}

console.log(resolveSettings({ perPage: 0, theme: "", isPro: true, exportLimit: 50 }));
console.log(resolveSettings({ perPage: 5, theme: "dark", isPro: false, exportLimit: 50 }));`,
    question:
      "2回の呼び出しでそれぞれどんなオブジェクトが返りますか。値がそうなる理由も説明してください。",
    model_answer: `canExport には true ではなく 50 が入ります。&& は左が「あり」のときに右の値をそのまま返すので、真偽ではなく exportLimit の中身が代入されるためです。

1つ目の戻り値は { perPage: 0, theme: "light", canExport: 50 } です。perPage は 0 のまま残りますが、theme は空だったので light に置き換わります。2つ目は { perPage: 5, theme: "dark", canExport: false } になります。`,
    prerequisite: `?? は左が null か undefined のときだけ右を使います。|| はそれに加えて、空の文字や 0 のように「なし」とみなされる値でも右を使います。&& は左が「なし」ならその左を、そうでなければ右を使います。

これらは条件式のなかだけでなく、代入の右側にもよく書かれます。`,
    keywords: [
      { match: ["canExport", "&&"] },
      { match: ["50", "exportLimit", "右の値"] },
      { match: ["真偽", "そのまま返", "boolean"] },
      { match: ["0 のまま", "light", "dark"] },
    ],
    rubric_items: {
      core: "canExport に真偽値ではなく exportLimit の値が入るという結論を指していれば満たす",
      ground: "&& が左を満たすときに右の値をそのまま返す点に触れていれば満たす",
      depth:
        "1つ目で perPage が 0 のまま残る一方で theme だけ light に置き換わる点に触れていれば満たす",
      core_reject: [
        "canExport に true が入ると読んでいる",
        "1つ目の perPage が 20 になると読んでいる",
        "1つ目の theme が空のまま残ると読んでいる",
      ],
    },
  },

  {
    order: 11,
    title: "三項演算子と switch ─ 分岐の省略形を展開して読む",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `function notifyChannel(event) {
  const level = event.severity >= 3 ? "high" : event.severity >= 1 ? "middle" : "low";

  let channel;
  switch (level) {
    case "high":
      channel = "電話";
    case "middle":
      channel = "チャット";
      break;
    case "low":
      channel = "メール";
      break;
  }

  return channel;
}

console.log(notifyChannel({ severity: 5 }));
console.log(notifyChannel({ severity: 2 }));
console.log(notifyChannel({ severity: 0 }));`,
    question:
      "3回の呼び出しでそれぞれ何が返りますか。1つ目がその結果になる理由も説明してください。",
    model_answer: `severity が 5 のときも「チャット」が返ります。

三項演算子は 3 以上なら high、1 以上なら middle、それ以外は low の3段に展開できるので level は high になりますが、high の case には break が無いため、そのまま次の middle の代入まで続けて実行されるためです。

戻り値は上から チャット、チャット、メール の3つになります。`,
    prerequisite: `条件 ? A : B は三項演算子といい、条件が成立すれば A、しなければ B を値として返します。: の後ろにもう一度同じ形を書くと、段を増やせます。

switch は値が一致した case から実行を始めます。case は実行を始める位置を示すもので、そこで区切られているわけではありません。`,
    keywords: [
      { match: ["high", "break"] },
      { match: ["チャット", "middle"] },
      { match: ["続けて", "抜けずに", "フォールスルー", "次の case"] },
      { match: ["メール", "3段", "low"] },
    ],
    rubric_items: {
      core: "severity が 5 のときも チャット が返るという結論を指していれば満たす",
      ground:
        "high の case に break が無く続く middle の代入まで実行される点に触れていれば満たす",
      depth:
        "3回の戻り値が チャット / チャット / メール になる点、または三項演算子が high と middle と low の3段に展開できる点に触れていれば満たす",
      core_reject: [
        "severity が 5 のときは 電話 が返ると読んでいる",
        "break が無いので メール まで実行されると読んでいる",
        "severity が 2 のとき high と判定されると読んでいる",
      ],
    },
  },

  {
    order: 12,
    title: "for 文 ─ ループが何回まわるか数える",
    language: "js",
    difficulty: 2,
    reading_type: "トレース",
    code: `function splitIntoBatches(recipients, size) {
  const batches = [];

  for (let i = 0; i < recipients.length; i += size) {
    batches.push(recipients.slice(i, i + size));
  }

  return batches;
}

const list = ["u1", "u2", "u3", "u4", "u5", "u6", "u7"];

console.log(splitIntoBatches(list, 3).length);
console.log(splitIntoBatches(list, 3)[2]);`,
    question:
      "2つの console.log でそれぞれ何が出力されますか。そうなる理由も説明してください。",
    model_answer: `1つ目は 3、2つ目は ["u7"] が出力されます。

i は 0、3、6 と 3ずつ増え、次の 9 は recipients.length の 7 未満という条件を満たさないので、ループは3回で終わります。

2つ目は最後のまとまりで、slice は指定した終わりが配列の長さを超えていても残っているぶんだけを取り出すため、1件だけの配列になります。`,
    prerequisite: `for (初期化; 条件; 更新) は、条件が成立するあいだ中身を実行し、1周ごとに更新の式を走らせます。+= は今の値に足して入れ直す書き方です。

配列.slice(始まり, 終わり) は、始まりの位置から終わりの手前までを取り出した新しい配列を返します。終わりの位置は取り出す範囲に含みません。`,
    keywords: [
      { match: ["ループ", "繰り返し", "for 文"] },
      { match: ["3回", "3つ", "3件"] },
      { match: ["0、3、6", "3ずつ", "size ずつ"] },
      { match: ["u7", "1件", "1つだけ", "余り"] },
    ],
    rubric_items: {
      core: "ループが3回まわるという結論を指していれば満たす",
      ground:
        "i が size ずつ増えて recipients.length 未満の間だけ条件が成立する点に触れていれば満たす",
      depth:
        "2つ目の出力が u7 だけの配列になる点、または slice が範囲を超えても残りだけを取る点に触れていれば満たす",
      core_reject: [
        "ループが7回まわると読んでいる",
        "ループが2回で終わり u7 が捨てられると読んでいる",
        "i が1ずつ増えると読んでいる",
      ],
    },
  },

  {
    order: 13,
    title: "while / do-while ─ 終了条件から逆算する",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `function fetchPages(totalPages) {
  const fetched = [];
  let page = 1;

  do {
    fetched.push(page);
    page = page + 1;
  } while (page <= totalPages);

  return fetched;
}

console.log(fetchPages(3));
console.log(fetchPages(0));`,
    question:
      "2つの呼び出しでそれぞれ何が返りますか。2つ目がその結果になる理由も説明してください。",
    model_answer: `fetchPages(0) は空の配列ではなく [1] を返します。do-while は中身を実行してから条件を判定する形なので、totalPages が 0 でも1回は push が走るためです。

fetchPages(3) のほうは [1, 2, 3] を返します。page が 4 になった時点で page <= totalPages が成立しなくなって終わります。`,
    prerequisite: `while (条件) { … } は、条件が成立するあいだ中身を繰り返します。

do { … } while (条件) も同じ繰り返しですが、条件を書く位置が中身の後ろにあります。

<= は「以下」を意味します。配列.push(値) は配列の末尾に値を足します。`,
    keywords: [
      { match: ["do-while", "先に実行", "中身が先"] },
      { match: ["1回は", "1つだけ", "1 が入っ"] },
      { match: ["実行してから", "後で判定", "条件の判定が後"] },
      { match: ["1, 2, 3", "4 になった", "3 まで"] },
    ],
    rubric_items: {
      core: "totalPages が 0 でも [1] が返るという結論を指していれば満たす",
      ground: "条件の判定が中身の実行より後ろにある点に触れていれば満たす",
      depth:
        "fetchPages(3) が [1, 2, 3] を返す点、または page が 4 になった時点で条件を外れる点に触れていれば満たす",
      core_reject: [
        "totalPages が 0 のとき空の配列が返ると読んでいる",
        "fetchPages(3) が [1, 2, 3, 4] を返すと読んでいる",
        "while で書いた場合と結果は変わらないと読んでいる",
      ],
    },
  },

  {
    order: 14,
    title: "break と continue ─ 抜ける位置で結果が変わる",
    language: "js",
    difficulty: 3,
    reading_type: "トレース",
    code: `function findFirstError(logs) {
  let found = null;
  let scanned = 0;

  for (const day of logs) {
    for (const line of day.lines) {
      scanned = scanned + 1;

      if (line.level === "info") {
        continue;
      }
      if (line.level === "error") {
        found = line.message;
        break;
      }
    }
  }

  return { found, scanned };
}

console.log(findFirstError([
  { lines: [{ level: "info", message: "起動" }, { level: "error", message: "接続に失敗" }] },
  { lines: [{ level: "error", message: "再試行に失敗" }] },
]));`,
    question:
      "この関数の戻り値はどうなりますか。2つの値がそれぞれその結果になる理由も説明してください。",
    model_answer: `戻り値は { found: "再試行に失敗", scanned: 3 } です。

break は内側の for しか抜けないので、1日目でエラーを見つけて抜けたあとも外側は2周目へ進み、found が上書きされます。関数名に反して最初のものが残りません。

scanned は3になります。info の行では continue で以降の判定を飛ばしていますが、加算はその手前にあるため数えられているためです。`,
    prerequisite: `for (const x of 配列) は、配列の要素を1つずつ取り出して繰り返します。

continue はその回の残りを飛ばして次の回へ進みます。break は繰り返しそのものをやめます。

繰り返しが入れ子になっているときは、それぞれの for が別々の繰り返しとして数えられます。`,
    keywords: [
      { match: ["break", "内側の for", "内側のループ"] },
      { match: ["再試行に失敗", "上書き", "2日目"] },
      { match: ["抜け", "外側", "2周目"] },
      { match: ["scanned", "continue", "3 になり", "3 件"] },
    ],
    rubric_items: {
      core: "found に最後のエラーが残るという結論を指していれば満たす",
      ground:
        "break が内側の for しか抜けず外側の繰り返しが次へ進む点に触れていれば満たす",
      depth:
        "scanned が 3 になる点、または continue で飛ばされる位置より手前で加算されている点に触れていれば満たす",
      core_reject: [
        "found が 接続に失敗 になると読んでいる",
        "break で関数全体が終わり scanned が 2 になると読んでいる",
        "continue で scanned の加算も飛ばされると読んでいる",
      ],
    },
  },
];
