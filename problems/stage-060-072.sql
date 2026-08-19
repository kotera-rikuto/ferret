-- ステージ60〜72 投入
-- 出典: problems/stage-006-014.data.mjs / 設計: problems/stage-006-014.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- id は書かない（GENERATED ALWAYS AS IDENTITY）

begin;

-- ステージ60: 同期と非同期 ─ コールバックが「あとで」呼ばれる（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  60,
  '同期と非同期 ─ コールバックが「あとで」呼ばれる',
  'js',
  4,
  'トレース',
  'let cachedTheme = "未取得";

function loadSetting(key, done) {
  setTimeout(() => {
    done(key === "theme" ? "dark" : null);
  }, 0);
}

function getTheme() {
  loadSetting("theme", (value) => {
    cachedTheme = value;
  });
  return cachedTheme;
}

console.log("1回目", getTheme());
setTimeout(() => console.log("2回目", getTheme()), 10);',
  'このコードを実行すると何が出力されますか。最初の行がその結果になる理由も説明してください。',
  '最初の行は「1回目 未取得」になります。

loadSetting に渡した関数が呼ばれるのは、getTheme が return したあとです。先に return が実行されてしまうので、cachedTheme への代入は間に合いません。

2回目は dark になります。1回目の呼び出しで予約された処理がそのあいだに走り、cachedTheme を書き換えているためです。getTheme 自体は待つ仕組みを持っていないので、いつも「そのときに入っている値」を返しているだけです。',
  '[{"match":["1回目","getTheme","cachedTheme"]},{"match":["未取得","間に合いません","まだ入って"]},{"match":["return のあと","先に return","あとから呼ば"]},{"match":["2回目","dark","待つ"]}]'::jsonb,
  '{"core":"最初の行が dark ではなく 未取得 になるという結論を指していれば満たす","depth":"2回目は前の呼び出しで入った dark が返る点、または getTheme が待つ仕組みを持っていない点に触れていれば満たす","ground":"渡した関数が呼ばれるのは return のあとなので代入が間に合わない点に触れていれば満たす","core_reject":["最初の行から dark が返ると読んでいる","2回目も 未取得 のままだと読んでいる","0 ミリ秒なのですぐ実行されて間に合うと読んでいる"]}'::jsonb,
  'setTimeout(関数, ミリ秒) は、その関数をあとで実行するように予約するだけで、その場では走りません。予約した時点で次の行へ進みます。

0 を指定しても「すぐ」ではなく、いま動いている処理がすべて終わってからになります。

関数を引数として渡し、あとから呼んでもらう書き方では、呼ばれる時点が渡した側の実行より後になります。'
);

-- ステージ61: setTimeout とイベントループ ─ 出力順を並べ替える（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  61,
  'setTimeout とイベントループ ─ 出力順を並べ替える',
  'js',
  5,
  'トレース',
  'console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve().then(() => console.log("C"));

queueMicrotask(() => console.log("D"));

console.log("E");',
  'このコードを実行すると、何がどの順で出力されますか。その順になる理由も説明してください。',
  '出力は A E C D B の順です。

setTimeout は 0 を渡しても最後になります。同期の処理がすべて終わってから、待ち行列にたまったものが処理されるためです。まず A と E がその場で出ます。

そのあと、先に処理されるほうの列に入った C と D が、登録した順で走ります。最後に setTimeout の B が出ます。',
  '[{"match":["setTimeout","0 を渡","0 ミリ秒"]},{"match":["最後","いちばん後","A E C D B"]},{"match":["同期","すべて終わ","待ち行列"]},{"match":["queueMicrotask","登録した順","先に"]}]'::jsonb,
  '{"core":"setTimeout に 0 を渡しても最後に実行されるという結論を指していれば満たす","depth":"then と queueMicrotask が setTimeout より先に登録した順で走る点、または出力が A E C D B になる点に触れていれば満たす","ground":"同期の処理がすべて終わってから予約されたものが処理される点に触れていれば満たす","core_reject":["B が C や D より先に出ると読んでいる","C が A の直後に出ると読んでいる","出力が A B C D E の順になると読んでいる"]}'::jsonb,
  'JavaScript は1本の流れで動きます。いま動いている処理が終わるまで、予約されたものは実行されません。

予約には2つの列があります。Promise の then や queueMicrotask が入る列と、setTimeout が入る列です。前者のほうが必ず優先されます。

同じ列の中では、予約した順に実行されます。'
);

-- ステージ62: Promise ─ pending / fulfilled / rejected（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  62,
  'Promise ─ pending / fulfilled / rejected',
  'js',
  4,
  'トレース',
  'function fetchQuota(plan) {
  return new Promise((resolve, reject) => {
    if (plan === "free") {
      resolve(3);
    } else if (plan === "pro") {
      resolve(200);
    } else {
      reject(new Error("不明なプランです"));
    }
  });
}

const a = fetchQuota("free");
const b = fetchQuota("unknown");

b.catch(() => {});

console.log(a);
console.log(typeof a.then);

a.then((n) => console.log("あとで", n));
console.log("先に");',
  '4つの console.log でそれぞれ何が出力されますか。最初の行がその結果になる理由も説明してください。',
  '最初の行は 3 ではなく Promise { 3 } と出ます。

Promise は値そのものではなく、いずれ決まる結果を表す入れ物だからです。中身を取り出すには then などを通す必要があります。

2つ目は function です。3つ目と4つ目の順にも注意が要ります。resolve がその場で呼ばれていても、then に渡した処理は「先に」より後に走るので、先に → あとで 3 の順になります。',
  '[{"match":["Promise","1つ目"]},{"match":["3 ではな","そのもの","中の値"]},{"match":["入れ物","then などを通","取り出す"]},{"match":["先に","あとで","function"]}]'::jsonb,
  '{"core":"最初の行が中の値ではなく Promise そのものを出すという結論を指していれば満たす","depth":"then に渡した処理が「先に」より後に走る点、または typeof a.then が function になる点に触れていれば満たす","ground":"Promise が値そのものではなく いずれ決まる結果を表すものである点に触れていれば満たす","core_reject":["最初の行が 3 を出すと読んでいる","「あとで 3」が「先に」より前に出ると読んでいる","reject した b が catch を書いても落ちると読んでいる"]}'::jsonb,
  'new Promise((resolve, reject) => …) は、いずれ決まる結果を表すものを作ります。resolve(値) で成功、reject(理由) で失敗が決まります。

決まった結果を受け取るには .then(関数) や .catch(関数) を使います。渡した関数は、いま動いている処理が終わってから呼ばれます。

失敗が決まったものを誰も受け止めないと、あとで警告が出ます。.catch() を1つ書いておけば受け止めたことになります。'
);

-- ステージ63: then / catch / finally のチェーン（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  63,
  'then / catch / finally のチェーン',
  'js',
  4,
  'トレース',
  'Promise.resolve(10)
  .then((n) => n * 2)
  .then((n) => {
    if (n > 15) {
      throw new Error("大きすぎます");
    }
    return n;
  })
  .then((n) => console.log("then A", n))
  .catch((e) => {
    console.log("catch", e.message);
    return "回復";
  })
  .then((v) => console.log("then B", v))
  .finally(() => console.log("finally"));',
  'このコードを実行すると何が出力されますか。その順になる理由も説明してください。',
  'catch のあとの then B は走ります。出力は catch 大きすぎます → then B 回復 → finally の3行です。

途中で throw されると、そこから先の then は飛ばされて最初の catch へ移ります。ここで then A が飛ばされます。

catch が受け止めた時点で流れは正常に戻るので、その戻り値「回復」が次の then B に渡ります。finally は結果に関わらず最後に実行されます。',
  '[{"match":["catch","then B"]},{"match":["回復","そのあとも"]},{"match":["受け止め","戻り値","渡ります"]},{"match":["then A","飛ばさ","大きすぎます"]}]'::jsonb,
  '{"core":"catch のあとの then B も走るという結論を指していれば満たす","depth":"then A が飛ばされる点、または finally が最後に実行される点に触れていれば満たす","ground":"catch が受け止めた時点で流れが正常に戻りその戻り値が次へ渡る点に触れていれば満たす","core_reject":["then B も飛ばされると読んでいる","then A が実行されると読んでいる","catch のあとは finally しか走らないと読んでいる"]}'::jsonb,
  '.then(関数) は前の結果を受け取り、その関数が返した値を次へ渡します。

途中で例外が起きると、以降の .then は行われず、いちばん近い .catch へ移ります。.catch が値を返すと、そこから先は正常な流れに戻ります。

.finally(関数) は成功でも失敗でも最後に実行されます。'
);

-- ステージ64: async / await ─ Promise を上から下に読む（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  64,
  'async / await ─ Promise を上から下に読む',
  'js',
  4,
  'トレース',
  'function fetchUser(id) {
  return Promise.resolve({ id, name: "佐藤" });
}

async function loadProfile(id) {
  console.log("開始", id);
  const user = await fetchUser(id);
  console.log("取得", user.name);
  return user;
}

console.log("前");
loadProfile(7);
console.log("後");',
  'このコードを実行すると何がどの順で出力されますか。その順になる理由も説明してください。',
  'await で止まるのは loadProfile の中だけで、呼び出し元は待ちません。

loadProfile(7) を呼ぶと、await の手前までは同期に走ります。そこで「開始 7」が出て、await に来た時点で Promise を返して呼び出し元へ戻ります。呼び出し元はそれを待たずに次の行へ進むので「後」が出ます。

その後で待っていた結果が決まり「取得 佐藤」が出ます。出力は 前 → 開始 7 → 後 → 取得 佐藤 の順です。',
  '[{"match":["await","loadProfile"]},{"match":["呼び出し元","外側","待ちません"]},{"match":["Promise を返し","次の行","手前まで"]},{"match":["開始","取得","佐藤","同期"]}]'::jsonb,
  '{"core":"await で止まるのは loadProfile の中だけで呼び出し元は待たないという結論を指していれば満たす","depth":"出力が 前 → 開始 7 → 後 → 取得 佐藤 になる点、または await の手前までは同期に走る点に触れていれば満たす","ground":"await に来た時点で Promise を返して呼び出し元へ戻る点に触れていれば満たす","core_reject":["「取得 佐藤」が「後」より前に出ると読んでいる","「開始 7」が「後」より後に出ると読んでいる","呼ぶと全部終わるまで次の行に進まないと読んでいる"]}'::jsonb,
  'async を付けた関数の戻り値は、いつでも Promise になります。

await は、その Promise の結果が決まるまでその関数の中の続きを止めます。止まっているあいだ、ほかの処理は動けます。

関数を呼んだ側から見ると、await に差しかかった段階で Promise が返ってきます。そこから先の行は、中の続きが終わるのを待たずに進みます。'
);

-- ステージ65: await を付け忘れたコードを読む ─ Promise { <pending> } の正体（ズレ）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  65,
  'await を付け忘れたコードを読む ─ Promise { <pending> } の正体',
  'js',
  4,
  'ズレ',
  'async function fetchTotal(userId) {
  return 1200;
}

// 合計金額を取り出して表示用に整える
async function buildLabel(userId) {
  const total = fetchTotal(userId);
  return `お支払い ${total} 円`;
}

// 合計金額が 0 より大きいかを返す
async function isPaid(userId) {
  const total = fetchTotal(userId);
  return total > 0;
}

buildLabel(7).then((label) => console.log(label));
isPaid(7).then((paid) => console.log(paid));',
  'コメントに書かれた意図と、実際の動きが食い違っています。2つの出力を示したうえで、どこがどう食い違うかを説明してください。',
  'await を書いていないので、total には 1200 ではなく Promise がそのまま入ります。

fetchTotal は async なので、呼んだ結果は必ず Promise になります。await を書いていなければ、その Promise 自体が代入されます。

buildLabel のほうは「お支払い [object Promise] 円」と出るので、見ればすぐ分かります。ところが isPaid は Promise と 0 を比べることになり、結果は false になるだけです。エラーにもならず数字も出ないので、こちらは気づけません。同じ書き忘れでも、現れ方がまったく違います。',
  '[{"match":["total","fetchTotal"]},{"match":["1200 ではな","そのまま入","Promise のまま"]},{"match":["async","書いていな","付けていな"]},{"match":["object Promise","false","isPaid","気づけ"]}]'::jsonb,
  '{"core":"await が無いので total に Promise が入るという結論を指していれば満たす","depth":"buildLabel は表示で分かるが isPaid は false になるだけで気づけない点に触れていれば満たす","ground":"fetchTotal が async なので戻り値がいつでも Promise である点に触れていれば満たす","core_reject":["total に 1200 が入ると読んでいる","await が無いと実行時エラーになると読んでいる","isPaid が true を返すと読んでいる"]}'::jsonb,
  'async を付けた関数の戻り値は、いつでも Promise です。中で return 1200 と書いても、呼んだ側が受け取るのは Promise のほうです。

await を書くと、その Promise の結果が決まるのを待って、中の値を取り出します。書かなければ Promise 自体が変数に入ります。

Promise は数として比べられません。文字に埋め込むと、その旨を表す決まった文字列になります。'
);

-- ステージ66: async 関数の戻り値は必ず Promise になる（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  66,
  'async 関数の戻り値は必ず Promise になる',
  'js',
  4,
  'トレース',
  'async function ok() {
  return "文字列";
}

async function fail() {
  throw new Error("失敗");
}

async function nested() {
  return Promise.resolve("入れ子");
}

console.log(ok() instanceof Promise);
ok().then((v) => console.log("ok", v));
fail().catch((e) => console.log("fail", e.message));
nested().then((v) => console.log("nested", v));',
  '4つの出力はそれぞれ何になりますか。1行目がその値になる理由も説明してください。',
  '1行目は true です。async を付けた関数は、中で何を return しても Promise が返ります。

文字列を返している ok も、呼んだ側が受け取るのは Promise で、中身は then で取り出します。

throw した fail は、その場で例外が飛ぶのではなく、失敗が決まった Promise になります。だから catch で受けられます。Promise を return した nested は二重に包まれることはなく、then には中の「入れ子」が渡ります。続く出力は ok 文字列 → fail 失敗 → nested 入れ子 です。',
  '[{"match":["async","ok"]},{"match":["Promise","true"]},{"match":["何を return","中身は then","呼んだ側"]},{"match":["fail","nested","二重"]}]'::jsonb,
  '{"core":"async を付けた関数は中で何を return しても Promise を返すという結論を指していれば満たす","depth":"throw した fail が失敗の決まった Promise になる点、または Promise を return した nested が二重に包まれない点に触れていれば満たす","ground":"1行目の ok() instanceof Promise が true になる点に触れていれば満たす","core_reject":["ok() が文字列そのものを返すと読んでいる","fail() が呼んだ時点で例外を投げると読んでいる","nested() の then に Promise が渡ると読んでいる"]}'::jsonb,
  'async を付けた関数の戻り値は、いつでも Promise です。

中で return 値 と書いた場合は、その値で成功したものとして扱われます。中で throw した場合は、そのエラーを抱えた Promise になります。呼んだ時点で例外が飛ぶわけではありません。

return するものが Promise だった場合は、そのまま入れ子にはならず、中の結果がそのまま外へ渡ります。'
);

-- ステージ67: await × try/catch のエラーハンドリング（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  67,
  'await × try/catch のエラーハンドリング',
  'js',
  4,
  'トレース',
  'function mightFail() {
  return Promise.reject(new Error("通信に失敗"));
}

async function withAwait() {
  try {
    const r = await mightFail();
    return r;
  } catch (e) {
    return `catch で受けた: ${e.message}`;
  }
}

async function withoutAwait() {
  try {
    return mightFail();
  } catch (e) {
    return `catch で受けた: ${e.message}`;
  }
}

withAwait().then((v) => console.log("A", v));
withoutAwait()
  .then((v) => console.log("B", v))
  .catch((e) => console.log("B catch", e.message));',
  '2つの出力はそれぞれ何になりますか。B のほうがその結果になる理由も説明してください。',
  'withoutAwait の try / catch は、この失敗を受け止められません。

await を書いていないので、その場では失敗がまだ起きていません。try を抜けたあとに結果が決まるため、catch には入りません。返した Promise がそのまま失敗として外へ出るので、呼び出し側の catch が受けることになります。出力は「B catch 通信に失敗」です。

withAwait のほうは await があるので、その行で失敗が起きて catch に入り、「A catch で受けた: 通信に失敗」になります。',
  '[{"match":["withoutAwait","await を書","try"]},{"match":["受け止め","catch には入りません","捕まえ"]},{"match":["抜けたあと","その場では","決まるのは後"]},{"match":["withAwait","通信に失敗","呼び出し側"]}]'::jsonb,
  '{"core":"withoutAwait の try / catch が失敗を受け止められないという結論を指していれば満たす","depth":"呼び出し側の catch が受けることになる点、または withAwait のほうは catch に入る点に触れていれば満たす","ground":"await が無いので try を抜けたあとに結果が決まる点に触れていれば満たす","core_reject":["withoutAwait でも catch で受けたという文字列が返ると読んでいる","withAwait が失敗のまま外へ出ると読んでいる","try の中に書けば await が無くても受け止められると読んでいる"]}'::jsonb,
  'await のある行で失敗が決まると、その行で例外が起きます。だから try { … } catch { … } の中に入れておけば受け取れます。

await を付けずに Promise をそのまま扱うと、その行ではまだ何も起きていません。結果が決まるのはあとなので、その try はもう終わっています。

async 関数が Promise を return すると、外から見た結果はその Promise の結果になります。'
);

-- ステージ68: .then() の中で throw したエラーはどこへ行くか（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  68,
  '.then() の中で throw したエラーはどこへ行くか',
  'js',
  4,
  'トレース',
  'Promise.resolve("start")
  .then(() => {
    throw new Error("then の中");
  })
  .then(() => {
    console.log("次の then");
  })
  .catch((e) => {
    console.log("catch", e.message);
  });

Promise.resolve("start")
  .then(
    () => {
      throw new Error("2つ目");
    },
    (e) => {
      console.log("同じ then の第2引数", e.message);
    },
  )
  .catch((e) => {
    console.log("後ろの catch", e.message);
  });',
  'このコードを実行すると何が出力されますか。後半の連なりがその結果になる理由も説明してください。',
  '同じ then の第2引数は、その then の第1引数が投げた例外を受けません。

投げられた例外は、あとに続く catch へ渡ります。後半の連なりでは「後ろの catch 2つ目」だけが出て、第2引数の処理は呼ばれません。

前半の連なりも同じ理屈で、throw のあとの「次の then」は飛ばされて catch へ移ります。

出力は2行ですが、**後半のほうが先に出ます。** 前半は throw と catch のあいだに then が1つ挟まっているぶん、そこを通り抜けるのに1段よけいにかかるためです。',
  '[{"match":["第2引数","同じ then"]},{"match":["受けません","呼ばれません","後ろの catch"]},{"match":["あとに続く","先へ渡","移ります"]},{"match":["次の then","飛ばさ","2行"]}]'::jsonb,
  '{"core":"同じ then の第2引数はその then の第1引数が投げた例外を受けないという結論を指していれば満たす","depth":"前半の連なりで「次の then」が飛ばされる点、または出力が2行だけになる点に触れていれば満たす","ground":"投げられた例外があとに続く catch へ渡る点に触れていれば満たす","core_reject":["「同じ then の第2引数」が出力されると読んでいる","「次の then」が実行されると読んでいる","後半の連なりでは何も出力されないと読んでいる"]}'::jsonb,
  '.then(成功のとき, 失敗のとき) のように、then は関数を2つ受け取れます。2つ目は、その then に入ってくる時点で既に失敗していた場合に呼ばれます。

1つ目の関数の中で例外が起きた場合は、その then の2つ目ではなく、さらに後ろにある .catch などへ渡ります。

.catch(関数) は .then(undefined, 関数) と同じ意味です。'
);

-- ステージ69: catch されない Promise ─ 本番ログに何が出るか（ズレ）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  69,
  'catch されない Promise ─ 本番ログに何が出るか',
  'js',
  5,
  'ズレ',
  'function postToServer(event) {
  return Promise.reject(new Error("送信先に届きません"));
}

// 送信は失敗しても画面を止めない
function sendMetrics(event) {
  postToServer(event).then(() => {
    console.log("送信しました");
  });
}

sendMetrics({ name: "click" });
console.log("画面の処理は続きます");',
  'コメントに書かれた意図と、実際の動きが食い違っています。何が出力されるかを示したうえで、どこがどう食い違うかを説明してください。',
  '失敗を誰も受け止めていないので、行き場の無い拒否として扱われます。

then にはうまくいったときの処理しか渡しておらず、うまくいかなかった場合を受ける口がありません。postToServer が返すのは失敗が決まった Promise なので、そのまま行き場を失います。

出力は「画面の処理は続きます」だけです。「送信しました」は出ません。コメントは「画面を止めない」と書いていますが、受け止められなかった拒否は実行環境が記録し、Node.js の既定ではプロセスそのものが終わります。むしろ止める側に働きます。catch を1つ足せば意図どおりになります。',
  '[{"match":["then","受け止め","受ける口"]},{"match":["行き場","拒否","誰も"]},{"match":["失敗が決まった","postToServer"]},{"match":["画面の処理は続きます","送信しました","catch を足"]}]'::jsonb,
  '{"core":"失敗を誰も受け止めていないので行き場の無い拒否になるという結論を指していれば満たす","depth":"「送信しました」は出ず「画面の処理は続きます」だけが出る点、または catch を1つ足せば意図どおりになる点に触れていれば満たす","ground":"then にうまくいったときの処理しか渡しておらず失敗を受ける口が無い点に触れていれば満たす","core_reject":["失敗が握りつぶされて何も起きないと読んでいる","「送信しました」が出ると読んでいる","sendMetrics を呼んだ行で例外が飛んでそこで止まると読んでいる"]}'::jsonb,
  '.then(関数) に渡せるのは、うまくいった場合の処理です。うまくいかなかった場合の処理は .catch(関数) などで別に用意します。

うまくいかないほうに決まった Promise を、どこでも受け取らないままにすると、実行環境がそれを見つけて記録します。Node.js では既定でプロセスを終了させる動きになります。

.then(...) が返すものも Promise なので、その先で受け取ることができます。'
);

-- ステージ70: Promise.all / allSettled / race ─ 1つ失敗したら残りはどうなるか（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  70,
  'Promise.all / allSettled / race ─ 1つ失敗したら残りはどうなるか',
  'js',
  4,
  'トレース',
  'function task(name, ms, shouldFail) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      console.log("完了", name);
      if (shouldFail) {
        reject(new Error(`${name} が失敗`));
      } else {
        resolve(name);
      }
    }, ms);
  });
}

Promise.all([task("A", 10, false), task("B", 5, true), task("C", 20, false)])
  .then((r) => console.log("all", r))
  .catch((e) => console.log("all catch", e.message));',
  'このコードを実行すると何がどの順で出力されますか。その順になる理由も説明してください。',
  '1つ失敗しても、走っている残りの処理は止まりません。

Promise.all が返すものは最初の失敗で決まりますが、それは「結果が決まる」だけで、動いているものを止める仕組みはありません。

出力は 完了 B → all catch B が失敗 → 完了 A → 完了 C の順です。B が5ミリ秒で失敗した時点で all catch に入りますが、10ミリ秒の A と20ミリ秒の C はそのまま最後まで走ります。成功したぶんの結果は受け取れません。',
  '[{"match":["Promise.all","1つ失敗"]},{"match":["止まりません","走り続け","そのまま最後まで"]},{"match":["止める仕組み","最初の失敗","結果が決まる"]},{"match":["完了 A","完了 C","受け取れな"]}]'::jsonb,
  '{"core":"1つ失敗しても走っている残りの処理は止まらないという結論を指していれば満たす","depth":"出力が 完了 B → all catch → 完了 A → 完了 C の順になる点、または成功したぶんの結果は受け取れない点に触れていれば満たす","ground":"all が返すものは最初の失敗で決まるだけで動いているものを止める仕組みが無い点に触れていれば満たす","core_reject":["B が失敗した時点で A と C も止まると読んでいる","「完了 A」が「完了 B」より先に出ると読んでいる","all の then が A と C の結果を受け取ると読んでいる"]}'::jsonb,
  'Promise.all([…]) は、渡したものがすべて成功したときにまとめた結果を返します。1つでも失敗すると、その時点で失敗が決まります。

Promise.allSettled([…]) は、成功も失敗も出そろってから、それぞれの結果を返します。Promise.race([…]) は、いちばん早く決まったものの結果を返します。

いずれも結果の受け取り方を決めるだけで、渡したものの実行そのものには手を出しません。'
);

-- ステージ71: 逐次と並列 ─ await をどこに置くかで速度が変わる（影響）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  71,
  '逐次と並列 ─ await をどこに置くかで速度が変わる',
  'js',
  4,
  '影響',
  'function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function sequential() {
  const a = await delay(30, "a");
  const b = await delay(30, "b");
  const c = await delay(30, "c");
  return [a, b, c];
}

async function parallel() {
  const pa = delay(30, "a");
  const pb = delay(30, "b");
  const pc = delay(30, "c");
  return [await pa, await pb, await pc];
}',
  'この2つの関数は、返すものは変わらないのに書き方が違います。上を下の形に変えると何がどう変わりますか。変わるものと変わらないものを挙げてください。',
  'かかる時間が約90ミリ秒から約30ミリ秒に短くなります。戻り値は同じ配列のままです。

sequential は前の await が終わってから次の delay を呼び始めるので、30 が3回積み上がります。parallel は3つとも先に始めてしまい、そのあとで結果を待つだけなので、いちばん長いものの時間で済みます。

変わらないものもあります。戻り値の並びは同じですし、3つそれぞれの処理内容も変わりません。ただしこの書き換えができるのは、3つが互いに依存していない場合だけです。前の結果を次に渡している場合は、先に始めること自体ができません。',
  '[{"match":["sequential","parallel"]},{"match":["90","3分の1","短く"]},{"match":["終わってから","先に始め","積み上が"]},{"match":["同じ配列","並びは同じ","依存"]}]'::jsonb,
  '{"core":"かかる時間が約90ミリ秒から約30ミリ秒に短くなるという結論を指していれば満たす","depth":"戻り値の配列は変わらない点、または3つが互いに依存していない場合にしか使えない点に触れていれば満たす","ground":"sequential は前の await が終わってから次を呼び始める点に触れていれば満たす","core_reject":["どちらも同じ時間だけかかると読んでいる","下のほうが遅くなると読んでいる","戻り値の並びが変わると読んでいる"]}'::jsonb,
  'await は、その Promise の結果が決まるまでその関数の中の続きを止めます。

Promise は作られた時点で処理が始まります。await を書くかどうかは、始めるかどうかではなく、待つ場所を決めているだけです。

setTimeout を使った delay(ミリ秒, 値) は、指定した時間が過ぎてからその値で成功が決まります。'
);

-- ステージ72: fetch で API を叩くコードを読む（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  72,
  'fetch で API を叩くコードを読む',
  'js',
  5,
  '意図',
  '// 注文一覧を取得する。取れなければ空の配列で画面を出す
async function loadOrders(userId) {
  try {
    const res = await fetch(`/api/orders?user=${userId}`);

    if (!res.ok) {
      return { orders: [], reason: `サーバーが ${res.status} を返しました` };
    }

    const data = await res.json();
    return { orders: data.orders, reason: null };
  } catch (e) {
    return { orders: [], reason: "通信できませんでした" };
  }
}',
  'この関数は、うまくいかなかった場合でも例外を投げずに値を返しています。書いた人がなぜこの形を選んだのか、その意図を説明してください。',
  'うまくいかない場合でも同じ形を返すことで、呼ぶ側がいつも同じ扱いをできるようにするためです。

orders はどの経路でも配列なので、画面はいつでも描けます。呼ぶ側が try で囲む必要もありません。そのうえで、なぜ空になったのかを reason に分けて入れています。空だけを返すと「注文が0件」と「取得に失敗」の区別が付かなくなるので、そこを残しています。

res.ok を見ているのは、通信そのものが成功していても中身が失敗でありうるからです。サーバーがエラーを返しても失敗にはならないので、ここを見ないと見落とします。reason があるぶん、握りつぶしにもなっていません。',
  '[{"match":["orders","reason"]},{"match":["同じ形","同じ扱い","どの経路でも"]},{"match":["res.ok","空だけ","分けて"]},{"match":["握りつぶ","区別","呼ぶ側"]}]'::jsonb,
  '{"core":"うまくいかない場合でも同じ形を返して呼ぶ側が同じ扱いをできるようにする意図を指していれば満たす","depth":"reason を分けることで空になった理由が残る点、または res.ok を見ないとサーバー側の失敗を見落とす点に触れていれば満たす","ground":"orders がどの経路でも配列である点に触れていれば満たす","core_reject":["例外を投げないのは失敗を隠すためだと読んでいる","reason が成功したときにも使われると読んでいる","fetch が失敗すると自動で catch に入るので res.ok は不要だと読んでいる"]}'::jsonb,
  'fetch(URL) は通信の結果を表す Promise を返します。サーバーが 404 や 500 を返しても失敗にはなりません。届かなかったときだけ失敗になります。

サーバーが何を返したかは res.ok や res.status で確かめます。res.json() は本文を読み取って組み立て直すもので、本文が壊れていると失敗します。

ステージ46（テキストとデータの往復）とステージ57（try の範囲）で見たことが、この1つのコードに同時に出てきます。'
);

commit;
