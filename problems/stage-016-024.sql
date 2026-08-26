-- ステージ16〜24 投入
-- 出典: problems/stage-016-024.data.mjs / 設計: problems/stage-016-024.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- id は書かない（GENERATED ALWAYS AS IDENTITY）

begin;

-- ステージ16: アロー関数 ─ 省略記法を元の形に戻す（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  16,
  'アロー関数 ─ 省略記法を元の形に戻す',
  'js',
  3,
  'トレース',
  'const orders = [
  { id: "A-1", amount: 1200 },
  { id: "A-2", amount: 800 },
];

const toSummary = (order) => ({ id: order.id, label: `${order.amount} 円` });
const toAmount = (order) => { order.amount };

console.log(orders.map(toSummary)[0]);
console.log(orders.map(toAmount));',
  '2つの console.log でそれぞれ何が出力されますか。後半がその結果になる理由も説明してください。',
  '後半の出力は [ undefined, undefined ] になります。

toAmount のアロー関数は矢印の後ろが波括弧で始まっているため、中身が返す値ではなく処理のまとまり（ブロック）として解釈されます。その中に return が無いので、何も返らずに終わります。

toSummary のほうは波括弧の外側を丸括弧で包んでいるので、オブジェクトそのものを返す式として扱われます。前半の出力は { id: ''A-1'', label: ''1200 円'' } です。',
  '[{"match":["toAmount","2つ目"]},{"match":["undefined","返らない","返さない","値が無い"]},{"match":["ブロック","処理のまとまり","波括弧","中括弧"]},{"match":["toSummary","1200 円","丸括弧","オブジェクト"]}]'::jsonb,
  '{"core":"toAmount が値を返さず undefined になるという結論を指していれば満たす","depth":"前半の出力が { id: ''A-1'', label: ''1200 円'' } になる点、または toSummary が丸括弧で包むことで値として返している点に触れていれば満たす","ground":"toAmount の波括弧が返す値ではなく処理のまとまりとして解釈される点に触れていれば満たす","core_reject":["toAmount が 1200 と 800 の配列を返すと読んでいる","toSummary も undefined を返すと読んでいる","toAmount が実行時エラーになると読んでいる"]}'::jsonb,
  'アロー関数は (引数) => 式 と書くと、その式の結果をそのまま返します。=> の後ろに { を書いた場合は意味が変わり、その中に手続きを並べる形になります。

{ 名前: 値 } の形をそのまま返したいときは、この2つの書き分けが衝突します。

.map(関数) は配列の要素を1つずつ関数に渡し、その結果を集めた新しい配列を作ります。'
);

-- ステージ17: return を書き忘れた関数を読む（ズレ）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  17,
  'return を書き忘れた関数を読む',
  'js',
  3,
  'ズレ',
  '// 会員ランクごとに割引率を返す。該当しなければ 0
function resolveDiscount(user) {
  if (user.rank === "gold") {
    return 0.2;
  }
  if (user.rank === "silver") {
    0.1;
  }
  return 0;
}

function finalPrice(user, price) {
  const rate = resolveDiscount(user);
  return Math.round(price * (1 - rate));
}

console.log(finalPrice({ rank: "gold" }, 5000));
console.log(finalPrice({ rank: "silver" }, 5000));',
  'この関数はコメントに書かれたとおりに動いていません。2つの呼び出しの結果を示したうえで、どこがどう食い違うかを説明してください。',
  'silver のユーザーには割引が効かず、5000 がそのまま返ります。

silver の分岐には return が無く、0.1 という式が評価されるだけで捨てられるためです。そのまま下まで進んで return 0 に到達し、割引率が 0 になります。実行してもエラーにはならないので、動かしただけでは気づきにくい形です。

gold のほうはコメントどおりに動き、4000 になります。食い違っているのは silver の分岐だけです。',
  '[{"match":["silver","シルバー"]},{"match":["5000","割引が効かない","そのまま返"]},{"match":["return","捨て","評価されるだけ"]},{"match":["gold","4000","ゴールド"]}]'::jsonb,
  '{"core":"silver のときに割引が効かず 5000 が返るという結論を指していれば満たす","depth":"gold はコメントどおり 4000 になり食い違いが silver の分岐だけである点に触れていれば満たす","ground":"silver の分岐に return が無く 0.1 が捨てられている点に触れていれば満たす","core_reject":["silver のとき 4500 になると読んでいる","silver のとき undefined が返って実行時エラーになると読んでいる","gold のほうも割引が効かないと読んでいる"]}'::jsonb,
  'return は、その関数の答えとして値を外へ返し、そこで関数を終わらせます。

return を書かずに式だけを1行置いても、JavaScript はそれを文として実行するだけで、エラーにはなりません。

Math.round(数) は小数を四捨五入します。1 - rate のように、割引率から「支払う割合」を作る書き方は実務でよく出てきます。'
);

-- ステージ18: 引数の受け取り方 ─ デフォルト値と残余引数(rest)（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  18,
  '引数の受け取り方 ─ デフォルト値と残余引数(rest)',
  'js',
  3,
  'トレース',
  'function buildNotice(title, level = "info", ...tags) {
  return `[${level}] ${title} ${tags.length > 0 ? tags.join(",") : "タグなし"}`;
}

console.log(buildNotice("バッチ完了"));
console.log(buildNotice("在庫僅少", undefined, "stock", "urgent"));
console.log(buildNotice("接続断", null, "network"));',
  '3回の呼び出しでそれぞれ何が出力されますか。最後がその結果になる理由も説明してください。',
  '最後の呼び出しでは level に null が渡っているため、既定値の info は使われず、そのまま [null] 接続断 network と出ます。

既定値が使われるのは引数が undefined のとき、つまり省略したときか undefined を明示したときだけだからです。

1回目は level を省略しているので info になり、残余引数の tags は空の配列になるので「タグなし」が出ます。2回目は undefined を渡しているので既定値が効き、タグは stock,urgent と並びます。',
  '[{"match":["null","3つ目","3回目"]},{"match":["既定値","デフォルト","info にならない"]},{"match":["undefined","省略したとき","明示したとき"]},{"match":["タグなし","空の配列","stock,urgent"]}]'::jsonb,
  '{"core":"null では既定値が使われず level が null のまま出るという結論を指していれば満たす","depth":"1回目で残余引数が空の配列になり「タグなし」が出る点、または2回目では undefined なので既定値が効く点に触れていれば満たす","ground":"既定値が使われるのは引数が undefined のときだけである点に触れていれば満たす","core_reject":["最後の呼び出しでも info が使われると読んでいる","2回目で undefined がそのまま level に入ると読んでいる","1回目はタグが無いので実行時エラーになると読んでいる"]}'::jsonb,
  '引数に = 値 を付けて書くと、呼び出し側がその引数を渡さなかったときに使う値を決められます。

...名前 は「残りの引数をまとめて配列で受け取る」書き方で、残りが1つも無くても配列自体は作られます。

配列.join(",") は要素を区切り文字でつないだ1つの文字列にします。条件 ? A : B は、条件が成立すれば A を、しなければ B を返します。'
);

-- ステージ19: 早期リターンで書かれた関数を読む（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  19,
  '早期リターンで書かれた関数を読む',
  'js',
  3,
  '意図',
  'function acceptSubmission(form, session) {
  if (!session) {
    return { ok: false, message: "ログインが必要です" };
  }
  if (!form.title) {
    return { ok: false, message: "タイトルを入力してください" };
  }
  if (form.body.length > 2000) {
    return { ok: false, message: "本文が長すぎます" };
  }

  return { ok: true, saved: { title: form.title, body: form.body } };
}',
  'この関数は、条件を1つずつ確かめてその場で結果を返す形で書かれています。書いた人がなぜこの形を選んだのか、その意図を説明してください。',
  '受け付けられない場合を先にすべて返してしまい、末尾の1行を「すべての前提を満たした場合」だけにするための書き方です。

3つの if はどれも、条件に当てはまった時点でその場で return し、後ろへ進ませません。そのため関数の末尾に残るのは通す場合だけになり、ok: true を返す行が1つで済みます。

条件を入れ子にすると、条件の数だけ深さが増えていきます。この形なら、どの条件で断られたのかと、そのときの文言が1対1で並ぶので、後から条件を足すときも return を1本足すだけで済みます。',
  '[{"match":["先に","手前で","冒頭"]},{"match":["受け付けられない","受け付けない","弾く","断られ"]},{"match":["return","入れ子","ネスト"]},{"match":["ok: true","末尾","1対1","足すだけ"]}]'::jsonb,
  '{"core":"受け付けない場合を先に返して末尾を通す場合だけにするという意図を指していれば満たす","depth":"入れ子にせず条件と文言が1対1で並ぶ点、または条件を足すときに return を1本足すだけで済む点に触れていれば満たす","ground":"3つの if がいずれもその場で return して後ろへ進ませない点に触れていれば満たす","core_reject":["処理を速く終わらせるために途中で抜けていると読んでいる","入れ子にすると正しく動かないのでこう書いたと読んでいる","末尾の return が受け付けられなかった場合を表していると読んでいる"]}'::jsonb,
  'return は値を返して、その場で関数を終わらせます。以降の行は実行されません。

!値 は「その値が『なし』とみなせるとき」に成立します。空の文字や null がこれに当たります。

{ ok: false, message: "..." } のように、結果と説明を1つのまとまりにして返す書き方は、呼び出した側で扱いやすくするためによく使われます。'
);

-- ステージ20: スコープ ─ その変数はどこから見えるか（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  20,
  'スコープ ─ その変数はどこから見えるか',
  'js',
  3,
  'トレース',
  'function summarize(entries) {
  let total = 0;
  const labels = [];

  for (const entry of entries) {
    const total = entry.amount * entry.count;
    labels.push(`${entry.name}:${total}`);
  }

  return { total, labels };
}

console.log(summarize([
  { name: "定期便", amount: 1200, count: 2 },
  { name: "単品", amount: 800, count: 1 },
]));',
  'この関数の戻り値はどうなりますか。2つの値がそれぞれその結果になる理由も説明してください。',
  '戻り値は { total: 0, labels: [ ''定期便:2400'', ''単品:800'' ] } です。

total が 0 のままなのは、for の中で外側と重なる名前の const total を宣言しているためです。中で宣言したほうは外側とは別の変数になるので、外側には何も足されません。中で宣言したほうはその周回のあいだだけ存在して消えます。

labels のほうは外側のものがそのまま使われるので、2件ぶんの文字列が入ります。',
  '[{"match":["total","重なる名前","同じ名前"]},{"match":["0 のまま","足されない","加算されない"]},{"match":["別の変数","中で宣言","内側"]},{"match":["2400","定期便:2400","labels"]}]'::jsonb,
  '{"core":"戻り値の total が 0 のままになるという結論を指していれば満たす","depth":"labels には ''定期便:2400'' と ''単品:800'' が入る点、または中で宣言した total がその周回のあいだだけ存在する点に触れていれば満たす","ground":"for の中で外側と重なる名前の total を宣言しているため別の変数になる点に触れていれば満たす","core_reject":["total が 3200 になると読んでいる","同じ名前の宣言があるので実行時エラーになると読んでいる","labels が空の配列のまま返ると読んでいる"]}'::jsonb,
  'let と const で宣言した変数は、それを囲む { } の中だけで有効です。for の { } も1つの範囲になります。

外側にある名前とぶつかる名前でもう一度宣言すると、その範囲のあいだは新しいほうが使われ、外側のものは隠れます。実行時エラーにはなりません。

配列.push(値) は配列の末尾に値を足します。'
);

-- ステージ21: 巻き上げ(hoisting)と一時的死角(TDZ)（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  21,
  '巻き上げ(hoisting)と一時的死角(TDZ)',
  'js',
  4,
  'トレース',
  'function loadConfig() {
  console.log(typeof readEnv);
  console.log(cachedAt);
  console.log(source);

  var cachedAt = "2026-08-18";
  const source = "env";

  function readEnv() {
    return source;
  }
}

loadConfig();',
  'このコードを実行すると何が起きますか。画面に出る内容も含めて説明してください。',
  '3行目の console.log(source) で ReferenceError が発生し、そこで実行が止まります。const で宣言された source は、宣言の行に到達するまで参照できないためです。

そこに至るまでの2行は出力されます。1行目は function と出ます。関数宣言は中身ごと先に用意されるためです。2行目の cachedAt は undefined と出ます。var は名前だけが先に用意され、値が入るのは代入の行に来たときだからです。',
  '[{"match":["source","3行目","const"]},{"match":["ReferenceError","エラー","止ま","例外"]},{"match":["参照できない","宣言より前","宣言の前"]},{"match":["function","undefined","cachedAt"]}]'::jsonb,
  '{"core":"3行目の source で実行時エラーになり処理が止まるという結論を指していれば満たす","depth":"1行目が function と出る点、または2行目の cachedAt が undefined と出る点に触れていれば満たす","ground":"const の source が宣言の行に到達するまで参照できない点に触れていれば満たす","core_reject":["3行とも問題なく出力されると読んでいる","1行目の readEnv が undefined になると読んでいる","2行目の cachedAt のところで止まると読んでいる"]}'::jsonb,
  'JavaScript は関数の中身を実行する前に、その中で宣言される名前を先に把握します。

var は名前だけが先に置かれ、実際の値が入るのは代入を通過した時点です。function 宣言は中身ごと先に置かれます。let と const は名前こそ把握されますが、宣言の行に来るまで読み書きできません。

typeof 値 は、値の種類を表す文字列を返します。'
);

-- ステージ22: クロージャ ─ 関数が覚えている変数（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  22,
  'クロージャ ─ 関数が覚えている変数',
  'js',
  4,
  'トレース',
  'function createCounter(prefix) {
  let issued = 0;

  return function () {
    issued = issued + 1;
    return `${prefix}-${String(issued).padStart(3, "0")}`;
  };
}

const orderNo = createCounter("ORD");
const invoiceNo = createCounter("INV");

console.log(orderNo());
console.log(orderNo());
console.log(invoiceNo());',
  '3回の呼び出しで何が出力されますか。最後がその結果になる理由も説明してください。',
  'orderNo と invoiceNo は、それぞれ別々の issued を持ちます。createCounter を呼ぶたびに新しい issued が作られ、返された関数がその issued を覚えたまま持ち出すためです。

出力は ORD-001、ORD-002、INV-001 の3行になります。最後の1行が INV-001 から始まるのは、invoiceNo が数えているのが orderNo とは別の issued だからです。',
  '[{"match":["issued","カウンタ","数え"]},{"match":["別々","それぞれ","独立","共有されない"]},{"match":["覚え","呼ぶたび","閉じ込め"]},{"match":["INV-001","ORD-002","001 から"]}]'::jsonb,
  '{"core":"orderNo と invoiceNo がそれぞれ別の issued を持つという結論を指していれば満たす","depth":"出力が ORD-001 / ORD-002 / INV-001 になる点、または最後が 003 ではなく 001 から始まる点に触れていれば満たす","ground":"createCounter を呼ぶたびに新しい issued が作られ返された関数がそれを覚えている点に触れていれば満たす","core_reject":["最後の出力が INV-003 になると読んでいる","issued が呼び出しのたびに 0 に戻ると読んでいる","orderNo を2回呼んでも同じ番号が返ると読んでいる"]}'::jsonb,
  '関数の中で作った変数は、ふつうその関数が終わると使えなくなります。ただし、その変数を使う関数を戻り値として外へ出した場合は例外で、外へ出た関数からは引き続き読み書きできます。

String(値) は値を文字にします。文字列.padStart(3, "0") は、3文字になるまで先頭に "0" を足します。'
);

-- ステージ23: 高階関数 ─ 関数を受け取る・関数を返す（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  23,
  '高階関数 ─ 関数を受け取る・関数を返す',
  'js',
  4,
  '意図',
  '// どちらも外部への通信。つながらないときは例外を投げる
function callProfileApi(userId) {
  return { id: userId, name: "佐藤" };
}

function callOrderApi(userId) {
  return [{ id: "A-1", amount: 1200 }];
}

function withRetry(task, times) {
  return function (input) {
    let lastError = null;

    for (let i = 0; i < times; i++) {
      try {
        return task(input);
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError;
  };
}

const fetchProfile = withRetry(callProfileApi, 3);
const fetchOrders = withRetry(callOrderApi, 2);',
  '同じ仕組みを callProfileApi と callOrderApi の中にそれぞれ書かず、withRetry で包む形にしたのはなぜでしょうか。書いた人の意図を説明してください。',
  '再試行という仕組みを、実際に通信する処理から切り離して1か所にまとめるための書き方です。

withRetry は task を引数で受け取り、その task に再試行を足した別の関数を返しています。何度やり直すかの手順そのものは、ここにしかありません。

このため callProfileApi と callOrderApi は本来やりたいことだけを書けばよく、必要になったら回数を変えて包むだけで済みます。呼び出す側から見ると fetchProfile も fetchOrders もふつうの関数と同じように使えて、途中で何が挟まっているかを意識せずに済みます。',
  '[{"match":["再試行","リトライ","やり直"]},{"match":["切り離","まとめ","使い回","共通"]},{"match":["引数で受け取","関数を返","task"]},{"match":["回数","呼び出す側","意識せず"]}]'::jsonb,
  '{"core":"再試行の仕組みを個々の処理から切り離して1か所にまとめる意図を指していれば満たす","depth":"回数を変えるだけで別の呼び出しにも同じ形で使える点、または呼び出す側がふつうの関数と同じように使える点に触れていれば満たす","ground":"withRetry が task を引数で受け取り再試行を足した別の関数を返している点に触れていれば満たす","core_reject":["処理を速く終わらせるために包んでいると読んでいる","例外を握りつぶすために包んでいると読んでいる","withRetry が実際に通信を行う本体だと読んでいる"]}'::jsonb,
  'JavaScript では関数も値として扱えます。引数に渡すことも、戻り値として外へ出すこともできます。

try { … } catch (e) { … } は、try の中で例外が起きたときに catch へ移ります。throw は例外を発生させます。

const 名前 = 関数(引数) の形は、呼び出した結果を新しい名前に入れています。'
);

-- ステージ24: 再帰関数 ─ 自分を呼ぶ関数の止まり方（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  24,
  '再帰関数 ─ 自分を呼ぶ関数の止まり方',
  'js',
  4,
  'トレース',
  'function countReplies(comment) {
  if (!comment.replies) {
    return 0;
  }

  let total = comment.replies.length;

  for (const reply of comment.replies) {
    total = total + countReplies(reply);
  }

  return total;
}

const thread = {
  id: 1,
  replies: [
    { id: 2, replies: [{ id: 4 }, { id: 5 }] },
    { id: 3, replies: [] },
  ],
};

console.log(countReplies(thread));',
  'このコードを実行すると何が出力されますか。その数になる理由も説明してください。',
  '出力は 4 です。

countReplies は自分と同じ名前を中から呼び出して、入れ子になったものまで数えます。thread の直下に 2 件あるので total は 2 から始まり、そこに各件を数えた結果を足していきます。

id 2 のものは自分の下に 2 件持つので 2 を返します。その下の id 4 と id 5 は replies を持たないため、最初の if で 0 を返して止まります。id 3 は空の配列を持っているので最初の if には入りませんが、数える相手が無いので 0 になります。

合計 4 件です。',
  '[{"match":["countReplies","自分と同じ","再帰"]},{"match":["4 件","合計 4","4 になり"]},{"match":["入れ子","ネスト","下の階層"]},{"match":["0 を返","replies を持たない","空の配列"]}]'::jsonb,
  '{"core":"入れ子のものまで数えられて合計が 4 になるという結論を指していれば満たす","depth":"id 4 と id 5 が replies を持たないので 0 を返して止まる点、または id 3 の空の配列でも 0 になる点に触れていれば満たす","ground":"for の中で countReplies を自分自身に対して呼びその戻り値を足している点に触れていれば満たす","core_reject":["直下の 2 件だけを数えて 2 になると読んでいる","id 3 の空の配列で止まらず呼び出しが続くと読んでいる","id 4 と id 5 のところで実行時エラーになると読んでいる"]}'::jsonb,
  '関数は、自分自身を中から呼び出せます。呼び出された側もまた同じ手順を実行するので、どこかで必ず止まる条件が要ります。

!値 は「その値が『なし』とみなせるとき」に成立します。プロパティが存在しないとき、取り出した結果は undefined になります。

配列.length は要素の数です。'
);

commit;
