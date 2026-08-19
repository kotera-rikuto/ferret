// ステージ 91〜100 の問題データ（TS編・第13章「型の組み立てを追う」＋ 第14章「現場の型定義を読む」）。
// **これで100問が揃う。**
//
// 螺旋の回収が2本、ここで終わる。
//   96 ← 11（三項演算子と switch）
//   97 ← 65（await を付け忘れたコードを読む）
//
// ⚠️ 権利の扱いは stage-081-090.data.mjs の冒頭と同じ。外部教材の文章は参照していない。
//    100（zod）はライブラリ名と公開されている書き方だけを扱い、解説は自作している。
//
// ⚠️ TS 編は前提知識と模範解答の語彙が重なりやすい。
//    スロットには「模範解答にだけ出る語」を選ぶこと。
//
// 投入前に必ず次の2つを回すこと。
//   node problems/preflight.mjs problems/stage-091-100.data.mjs
//   node problems/run-code.mjs  problems/stage-091-100.data.mjs

export const problems = [
  {
    order: 91,
    title: "型エラーメッセージを読む② ─ 長いユニオン型のエラーを絞り込む",
    language: "ts",
    difficulty: 5,
    reading_type: "影響",
    runnable: false,
    notRunnableReason: "型検査の出力を読む題材なので、実行では確かめられない",
    code: `type Event =
  | { kind: "click"; x: number; y: number }
  | { kind: "keydown"; key: string }
  | { kind: "scroll"; top: number };

function handle(e: Event) {
  if (e.kind === "click") {
    return \`\${e.x},\${e.y}\`;
  }
  if (e.kind === "keydown") {
    return e.key;
  }
  return String(e.top);
}

handle({ kind: "keydown", code: "Enter" });`,
    context: `src/handle.ts:17:8 - error TS2345: Argument of type '{ kind: "keydown"; code: string; }' is not assignable to parameter of type 'Event'.
  Types of property 'kind' are incompatible.
    Type '"keydown"' is not assignable to type '"click"'.

17 handle({ kind: "keydown", code: "Enter" });
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`,
    question:
      "この出力は 'keydown' が 'click' に入らないと言っていますが、そもそも keydown は Event に含まれています。何が起きているのかを説明してください。",
    model_answer: `本当の食い違いは kind ではなく、key を渡していないことです。

渡したものは 3つの候補のどれにも当てはまりません。keydown の形には key が要りますが、代わりに code を渡しているためです。どれにも当てはまらなかったとき、型検査は**いちばん最初の候補と比べた結果だけを見せます。** そのため click との比較が出てきます。

長い候補の並びでは、出力に出ている候補が原因とは限りません。**まず渡した値と各候補を自分で突き合わせ、どれに近いかを決めてから読む**必要があります。ここでは kind が keydown なので、比べるべきは2番目の候補です。`,
    prerequisite: `| でつないだ型は「そのどれか」を表します。渡した値がどれか1つに合えば通ります。

どれとも合わなかった場合、型検査は候補を1つ選んで、それとの違いを示します。選ばれるのは必ずしも近いものではありません。

TS2345 は「渡した引数が受け取り側の型に入らない」ことを表します。そのあとに続く行が、どの項目でつまずいたかを示します。`,
    keywords: [
      { match: ["code", "渡していな", "key を渡して"] },
      { match: ["どれにも当てはまら", "3つの候補", "候補のどれ"] },
      { match: ["いちばん最初", "click との比較", "先頭"] },
      { match: ["2番目", "自分で突き合わせ", "原因とは限らな"] },
    ],
    rubric_items: {
      core: "本当の食い違いが kind ではなく key を渡していないことだという結論を指していれば満たす",
      ground:
        "渡した値が3つの候補のどれにも当てはまっていない点に触れていれば満たす",
      depth:
        "出力に出ている候補が原因とは限らない点、または比べるべきが2番目の候補である点に触れていれば満たす",
      core_reject: [
        "kind の値そのものが誤っていると読んでいる",
        "Event に click しか含まれていないと読んでいる",
        "出力に出ている候補が必ず原因だと読んでいる",
      ],
    },
  },

  {
    order: 92,
    title: "type と interface と交差型(&) ─ 使い分けと合成",
    language: "ts",
    difficulty: 4,
    reading_type: "意図",
    runnable: false,
    notRunnableReason: "型の組み立て方を比べる題材なので、実行では確かめられない",
    code: `type Timestamps = {
  createdAt: string;
  updatedAt: string;
};

type Article = Timestamps & {
  id: number;
  title: string;
};

type Comment = Timestamps & {
  id: number;
  body: string;
};

interface Repository<T> {
  find(id: number): T | undefined;
}

interface Repository<T> {
  save(item: T): void;
}`,
    question:
      "同じ2項目を別の名前に切り出したことと、Repository を2回に分けて書いていることには、それぞれ別の意図があります。書いた人の意図を説明してください。",
    model_answer: `Timestamps を切り出したのは、同じ2項目を2か所に書かずに済ませるためです。

Article と Comment はどちらも作成日時と更新日時を持ちます。& でつなぐと、両方の項目をあわせ持つ形になります。あとで項目を足すときも1か所を直せば両方に届きます。

Repository を2回書いているのは別の理由です。**同じ名前の interface は自動的に1つにまとまります。** これは type には無い性質で、あとから項目を足せることを意味します。自分のコードで分ける意味は薄いですが、**外部のライブラリの型に自分の分を足したいとき**にこの性質が要ります。`,
    prerequisite: `type 名前 = … は型に名前を付けます。A & B は「A と B の項目をあわせ持つ」という意味になります。

interface 名前 { … } も形に名前を付けますが、同じ名前で複数回書くと、それらは1つにまとめられます。type にはこの性質がありません。

interface 名前<T> の <T> は、使うときに決まる型を表します。`,
    keywords: [
      { match: ["Timestamps", "2か所に書かず", "共通"] },
      { match: ["Article", "Comment", "両方の項目"] },
      { match: ["1つにまとま", "自動的に", "interface は"] },
      { match: ["外部のライブラリ", "あとから", "type には無い"] },
    ],
    rubric_items: {
      core: "Timestamps を切り出したのが同じ項目を2か所に書かずに済ませるためだという意図を指していれば満たす",
      ground:
        "& でつなぐと両方の項目をあわせ持つ形になる点に触れていれば満たす",
      depth:
        "同じ名前の interface が1つにまとまる点、または外部のライブラリの型に足したいときにその性質が要る点に触れていれば満たす",
      core_reject: [
        "Timestamps が速さのために切り出されていると読んでいる",
        "Repository を2回書いているのは書き間違いだと読んでいる",
        "type でも同じ名前で複数回書けると読んでいる",
      ],
    },
  },

  {
    order: 93,
    title: "ジェネリクス ─ <T> が何に置き換わるか読む",
    language: "ts",
    difficulty: 4,
    reading_type: "トレース",
    code: `function firstOr<T>(list: T[], fallback: T): T {
  return list.length > 0 ? list[0] : fallback;
}

const a = firstOr([1, 2, 3], 0);
const b = firstOr(["x"], "z");
const c = firstOr([], "空でした");

console.log(a, b, c);`,
    question:
      "3回の呼び出しで T がそれぞれ何に置き換わりますか。出力とあわせて説明してください。",
    model_answer: `a では T が number、b では string、c でも string になります。

T は使うときに決まる入れ物で、渡した引数から埋められます。a は配列が number[] なので number、b は ["x"] なので string です。c は配列が空で中身から決められないため、もう1つの引数 "空でした" のほうから string に決まります。**同じ T が2か所にあるので、どちらか片方からでも埋まります。**

出力は 1 x 空でした です。a は配列に中身があるので先頭の 1、b も先頭の x、c は空なので fallback がそのまま返ります。`,
    prerequisite: `<T> は「使うときに決まる型」を表す入れ物です。関数の中では、それが何であるかを決めつけずに書けます。

同じ T が引数と戻り値の複数の場所に出てきたら、それらはすべて同一になります。呼び出したときの引数から埋められます。

条件 ? A : B は、条件が成立すれば A を、しなければ B を返します。`,
    keywords: [
      { match: ["number", "string"] },
      { match: ["渡した引数", "a では", "b では"] },
      { match: ["空でした", "fallback", "空で"] },
      { match: ["1 x 空でした", "先頭", "2か所"] },
    ],
    rubric_items: {
      core: "T が渡した引数から number や string に決まるという結論を指していれば満たす",
      ground:
        "a は配列から b と c は引数の内容から決まる点に触れていれば満たす",
      depth:
        "c は配列が空なのでもう1つの引数から決まる点、または出力が 1 x 空でした になる点に触れていれば満たす",
      core_reject: [
        "T がいつも同じ型に決まると読んでいる",
        "c で T が決められず実行時エラーになると読んでいる",
        "c の出力が空文字になると読んでいる",
      ],
    },
  },

  {
    order: 94,
    title: "keyof / typeof と Utility Types ─ 既存の型から型を作る",
    language: "ts",
    difficulty: 5,
    reading_type: "トレース",
    runnable: false,
    notRunnableReason: "型だけを組み立てる題材なので、実行では確かめられない",
    code: `const defaults = {
  perPage: 20,
  theme: "light",
  debug: false,
};

type Settings = typeof defaults;
type SettingKey = keyof Settings;

type Patch = Partial<Settings>;
type Readonly1 = Readonly<Settings>;
type OnlyView = Pick<Settings, "perPage" | "theme">;
type NoDebug = Omit<Settings, "debug">;

const p: Patch = { theme: "dark" };
const k: SettingKey = "perPage";`,
    question:
      "Settings から作られている5つの型が、それぞれどんな形になるかを説明してください。もとの defaults との関係もあわせて書いてください。",
    model_answer: `すべて defaults ひとつから組み立てられています。

typeof defaults は、値から型を取り出したものです。perPage が number、theme が string、debug が boolean の形になります。keyof はその項目名を集めるので、SettingKey は "perPage" | "theme" | "debug" になります。

Partial は全部を省略可能にしたもの、Readonly は全部を書き換え不可にしたもの、Pick は名前を挙げた2つだけを残したもの、Omit は挙げた1つを取り除いたものです。つまり OnlyView と NoDebug は結果として同じ形になります。**もとの defaults を直せば、5つとも自動的に付いてきます。**`,
    prerequisite: `typeof 値 を型の位置に書くと、その値の形を型として取り出せます。値と型を二重に書かずに済みます。

keyof 型 は、その型が持つ項目名を集めた型になります。

Partial<T> は全部を省略可能に、Readonly<T> は全部を書き換え不可にします。Pick<T, "a" | "b"> は挙げた名前だけを残し、Omit<T, "a"> は挙げた名前を取り除きます。`,
    keywords: [
      { match: ["typeof defaults", "値から型", "取り出し"] },
      { match: ["SettingKey", "集める", "perPage"] },
      { match: ["OnlyView", "NoDebug", "同じ形"] },
      { match: ["defaults を直せば", "自動的に付いて", "ひとつから"] },
    ],
    rubric_items: {
      core: "5つの型がすべて defaults ひとつから組み立てられているという結論を指していれば満たす",
      ground:
        "typeof が値から型を取り出し keyof が項目名を集めている点に触れていれば満たす",
      depth:
        "OnlyView と NoDebug が結果として同じ形になる点、または defaults を直せば5つとも付いてくる点に触れていれば満たす",
      core_reject: [
        "5つの型がそれぞれ独立に書かれていると読んでいる",
        "keyof が項目の値を集めると読んでいる",
        "Omit が挙げた名前だけを残すと読んでいる",
      ],
    },
  },

  {
    order: 95,
    title: "型ガードとユーザー定義型ガード(is)",
    language: "ts",
    difficulty: 5,
    reading_type: "トレース",
    code: `type ApiOk = { ok: true; data: string[] };
type ApiErr = { ok: false; message: string };
type ApiResult = ApiOk | ApiErr;

function isOk(r: ApiResult): r is ApiOk {
  return r.ok === true;
}

function render(r: ApiResult) {
  if (isOk(r)) {
    return r.data.join(",");
  }
  return \`失敗: \${r.message}\`;
}

console.log(render({ ok: true, data: ["a", "b"] }));
console.log(render({ ok: false, message: "権限がありません" }));`,
    question:
      "2回の呼び出しでそれぞれ何が出力されますか。判定用の関数の戻り値の書き方が何をしているかも説明してください。",
    model_answer: `出力は a,b と 失敗: 権限がありません の2行です。

isOk の戻り値に書いてある r is ApiOk は、「この関数が true を返したなら、渡した値は ApiOk である」と呼び出し側に伝えるための書き方です。ただの boolean にすると、if の中で r が ApiOk に絞られません。

そのおかげで if の中では r.data が読めます。ApiErr には data がないので、絞り込みが効いていなければ書けない行です。else 側には ApiErr だけが残るので r.message が読めます。`,
    prerequisite: `| でつないだ型は「そのどれか」を表します。どちらであるかを確かめるまで、片方にしかない項目は読めません。

関数の戻り値に 引数名 is 型 と書くと、その関数が true を返したときに引数がその型であると伝えられます。中身が本当にそう判定しているかは、書いた側の責任です。

配列.join(",") は要素をカンマでつないだ文字列にします。`,
    keywords: [
      { match: ["r is ApiOk", "戻り値に書", "isOk"] },
      { match: ["伝える", "呼び出し側", "ただの boolean"] },
      { match: ["r.data", "絞ら", "読める"] },
      { match: ["a,b", "権限がありません", "r.message"] },
    ],
    rubric_items: {
      core: "r is ApiOk が true のとき値が ApiOk だと呼び出し側に伝える書き方だという結論を指していれば満たす",
      ground:
        "ただの boolean にすると if の中で絞られない点に触れていれば満たす",
      depth:
        "if の中で r.data が読める点、または出力が a,b と 失敗: 権限がありません になる点に触れていれば満たす",
      core_reject: [
        "r is ApiOk が実行時に型を変えていると読んでいる",
        "ただの boolean でも同じように絞られると読んでいる",
        "2つ目の出力が a,b になると読んでいる",
      ],
    },
  },

  {
    order: 96,
    title: "判別可能なユニオン型で書かれた状態管理を読む",
    language: "ts",
    difficulty: 5,
    reading_type: "トレース",
    code: `type State =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "done"; rows: string[] }
  | { status: "failed"; message: string };

function label(state: State): string {
  switch (state.status) {
    case "idle":
      return "待機中";
    case "loading":
      return \`読み込み中(\${state.startedAt})\`;
    case "done":
      return \`\${state.rows.length}件\`;
    case "failed":
      return \`失敗: \${state.message}\`;
  }
}

console.log(label({ status: "idle" }));
console.log(label({ status: "done", rows: ["a", "b", "c"] }));
console.log(label({ status: "failed", message: "通信断" }));`,
    question:
      "3回の呼び出しでそれぞれ何が出力されますか。各 case の中で state がどう扱われているかも説明してください。",
    model_answer: `出力は 待機中、3件、失敗: 通信断 の3行です。

switch が見ている status は、4つの候補すべてが持っていて値が重なりません。そのため case を通ると、state はその1つに絞られます。done の中でだけ rows が読め、failed の中でだけ message が読めるのはそのためです。

ステージ11 の switch は「どの枝を通るか」を追うものでしたが、ここでは**枝を通ること自体が型を絞る**という働きが加わります。候補を1つ足して case を書き忘れると、戻り値に undefined が混ざって指摘されます。`,
    prerequisite: `すべての候補が同じ名前の項目を持ち、その値が重ならないとき、その項目を見るだけでどの候補かを決められます。

switch や if でその項目を確かめると、その中では1つの候補に絞られます。絞られたあとは、その候補にしかない項目も読めます。

ステージ11 で扱った switch と同じ構文ですが、そこでは通る枝を追っていました。`,
    keywords: [
      { match: ["status", "重なりま", "4つの候補"] },
      { match: ["その1つ", "1つに", "case を通る"] },
      { match: ["rows", "message", "その中でだけ"] },
      { match: ["待機中", "3件", "通信断", "書き忘れ"] },
    ],
    rubric_items: {
      core: "case を通ると state が1つの候補に絞られるという結論を指していれば満たす",
      ground:
        "status を4つの候補すべてが持っていて値が重ならない点に触れていれば満たす",
      depth:
        "done の中でだけ rows が読める点、または出力が 待機中 / 3件 / 失敗: 通信断 になる点に触れていれば満たす",
      core_reject: [
        "どの case の中でも4つの候補すべてとして扱われると読んでいる",
        "2つ目の出力が rows の中身そのものになると読んでいる",
        "status を見ても候補は絞られないと読んでいる",
      ],
    },
  },

  {
    order: 97,
    title: "非同期の型 ─ Promise<T> と await の戻り値",
    language: "ts",
    difficulty: 5,
    reading_type: "トレース",
    code: `async function fetchCount(): Promise<number> {
  return 42;
}

async function bad() {
  const n = fetchCount();
  return n * 2;
}

async function good() {
  const n = await fetchCount();
  return n * 2;
}

good().then((v) => console.log(v));`,
    question:
      "上と下の関数の違いは1語だけです。型の上で何が起きるかと、下の関数の出力を説明してください。",
    model_answer: `bad の n は number ではなく Promise<number> になります。

fetchCount は async なので、戻り値は必ず Promise に包まれます。await を付けないと、その包みごと n に入ります。Promise は数として掛けられないので、n * 2 の行が指摘されます。

good では await が包みを開けるので、n は number になり n * 2 が通ります。出力は 84 です。**65 では同じ書き忘れが動かすまで気づけませんでしたが、型を書いておくと書いた時点で止まります。** これが型注釈の効き方のひとつです。`,
    prerequisite: `async を付けた関数の戻り値は、いつでも Promise です。Promise<T> は「いずれ T になるもの」を表します。

await はその包みを開けて中の値を取り出します。付けなければ包みのまま変数に入ります。

ステージ65 で同じ書き忘れを扱いました。そこでは実行するまで分かりませんでした。`,
    keywords: [
      { match: ["Promise<number>", "包みごと", "await を付けないと"] },
      { match: ["n * 2", "指摘", "掛けられな"] },
      { match: ["good", "84", "開ける"] },
      { match: ["書いた時点", "65 では", "止まり"] },
    ],
    rubric_items: {
      core: "bad の n が number ではなく Promise<number> になるという結論を指していれば満たす",
      ground:
        "async の戻り値が Promise に包まれ await を付けないと包みごと入る点に触れていれば満たす",
      depth:
        "good の出力が 84 になる点、またはステージ65 と違って書いた時点で止まる点に触れていれば満たす",
      core_reject: [
        "bad の n にも 42 が入ると読んでいる",
        "await が無くても掛け算はできると読んでいる",
        "good の出力が 42 になると読んでいる",
      ],
    },
  },

  {
    order: 98,
    title: "as と ! ─ なぜここでアサーションが必要なのか",
    language: "ts",
    difficulty: 5,
    reading_type: "意図",
    runnable: false,
    notRunnableReason: "型検査の扱いを読む題材なので、実行では確かめられない",
    code: `type Config = { apiBase: string; retries: number };

// 起動時に1回だけ読み込む。読み込む前に使われることはない
let loaded: Config | null = null;

export function load(raw: string) {
  loaded = JSON.parse(raw) as Config;
}

export function getConfig(): Config {
  return loaded!;
}

export function parseAny(raw: string): Config {
  return JSON.parse(raw);
}`,
    question:
      "as と ! が使われている2か所には、それぞれ別の事情があります。書いた人の意図と、それぞれが何を肩代わりしているのかを説明してください。",
    model_answer: `どちらも「型検査では確かめようがないことを、書いた側が引き受ける」という宣言です。

as Config は、JSON.parse が返すものが何であるか型からは分からないためです。中身が本当に Config かどうかは実行してみるまで決まりませんが、ここでは呼ぶ側の責任でそう扱うと決めています。**確かめているわけではないので、違う形が来れば静かに通ります。**

loaded! は、値が null でないと書き手が知っているためです。読み込む前に使われないという前提はコメントにありますが、型検査はそれを読めません。**どちらも前提が崩れた瞬間に実行時の失敗になります。** parseAny のように as も ! も書かなければ、その場で指摘されます。`,
    prerequisite: `値 as 型 は「この値をこの型として扱う」と書き手が言い切る書き方です。実行時に何かを確かめるわけではありません。

値! は「これは null でも undefined でもない」と言い切る書き方です。これも確かめてはいません。

JSON.parse の結果は、型の上では「何か分からないもの」です。そのため受け取り側で決める必要があります。`,
    keywords: [
      { match: ["as Config", "JSON.parse", "型からは分からな"] },
      { match: ["引き受け", "責任", "書いた側"] },
      { match: ["loaded!", "null でない", "コメント"] },
      { match: ["静かに通", "前提が崩れ", "parseAny"] },
    ],
    rubric_items: {
      core: "型検査では確かめようがないことを書いた側が引き受ける宣言だという意図を指していれば満たす",
      ground:
        "JSON.parse が返すものが型からは分からない点、または loaded が null でないと書き手だけが知っている点に触れていれば満たす",
      depth:
        "確かめているわけではないので前提が崩れると実行時の失敗になる点に触れていれば満たす",
      core_reject: [
        "as が実行時に値を変換していると読んでいる",
        "! が null のときに既定値を入れていると読んでいる",
        "どちらも書けば安全になると読んでいる",
      ],
    },
  },

  {
    order: 99,
    title: "型定義ファイル(.d.ts)を読む ─ 型だけを見て API の使い方を説明する",
    language: "ts",
    difficulty: 5,
    reading_type: "仕様",
    runnable: false,
    notRunnableReason: "型定義だけのファイルなので、実行するものではない",
    code: `// node_modules/@example/queue/index.d.ts

export interface JobOptions {
  /** 失敗したときに試す回数。既定は 0 */
  retries?: number;
  /** ミリ秒。省略すると待たない */
  delay?: number;
}

export interface Job<T> {
  readonly id: string;
  readonly payload: T;
  cancel(): Promise<boolean>;
}

export declare class Queue<T> {
  constructor(name: string);
  add(payload: T, options?: JobOptions): Promise<Job<T>>;
  onFailed(handler: (job: Job<T>, error: Error) => void): () => void;
  close(): Promise<void>;
}`,
    question:
      "この型定義だけを見て、このライブラリの使い方を説明してください。実装を読まなくても言えることを、なるべく具体的に挙げてください。",
    model_answer: `使い方はかなりの部分まで型から読めます。

new Queue("名前") で作り、add に本体を渡して仕事を積みます。add は Promise を返すので、積み終わるのを待てます。返ってくる Job の id と payload は readonly なので、受け取った側から書き換えることは想定されていません。cancel は Promise<boolean> を返すので、**取り消せたかどうかが返る**と読めます。

onFailed は失敗したときに呼ばれる関数を受け取り、**戻り値がまた関数**です。この形は「登録を解除するための関数を返す」約束によく使われます。JobOptions はどちらの項目も省略可能で、コメントに既定値まで書かれています。close も Promise を返すので、終わるのを待てます。`,
    prerequisite: `.d.ts は型だけを書いたファイルです。実装は別にあり、使う側はこの宣言だけを見て書きます。

readonly が付いた項目は、受け取った側から書き換えられません。項目名の後ろの ? は省略できることを表します。

戻り値が (…) => … の形をしている関数は、関数を返します。Promise<T> は「いずれ T になるもの」です。`,
    keywords: [
      { match: ["new Queue", "add", "積み"] },
      { match: ["readonly", "想定されて", "id と payload"] },
      { match: ["cancel", "取り消せたか", "boolean"] },
      { match: ["onFailed", "また関数", "解除"] },
    ],
    rubric_items: {
      core: "型定義だけからこのライブラリの使い方が読み取れるという結論を指していれば満たす",
      ground:
        "new Queue で作り add で仕事を積むという流れに触れていれば満たす",
      depth:
        "cancel の戻り値から取り消せたかどうかが返ると読める点、または onFailed が解除用の関数を返すと読める点に触れていれば満たす",
      core_reject: [
        "実装を読まないと使い方は分からないと読んでいる",
        "readonly の項目も書き換えてよいと読んでいる",
        "onFailed が失敗の件数を返すと読んでいる",
      ],
    },
  },

  {
    order: 100,
    title: "zod のスキーマを読む ─ 型とバリデーションが同居するコード",
    language: "ts",
    difficulty: 5,
    reading_type: "仕様",
    runnable: false,
    notRunnableReason: "外部のライブラリを取り込むため、この場では動かせない",
    code: `import { z } from "zod";

const OrderSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().int().positive(),
  memo: z.string().max(200).optional(),
  status: z.enum(["paid", "canceled"]).default("paid"),
});

type Order = z.infer<typeof OrderSchema>;

export function parseOrder(raw: unknown): Order {
  return OrderSchema.parse(raw);
}

export function tryParseOrder(raw: unknown) {
  return OrderSchema.safeParse(raw);
}`,
    question:
      "この1つの定義が、何と何を1度に決めているかを説明してください。2つの取り込み用の関数の使い分けもあわせて書いてください。",
    model_answer: `OrderSchema ひとつで、実行時の検査と型の両方を決めています。

検査のほうは、id が uuid の形か、amount が正の整数か、memo が200字までか、status が2つのどちらかかを実際に確かめます。型のほうは z.infer で取り出していて、**Order を手で書いていません。** 検査を直せば型も付いてくるので、二重に書いてずれることがありません。

parse は合わなければ例外を投げます。safeParse は投げずに、成否と中身を持ったものを返します。**呼ぶ側で分岐したいなら safeParse、そこで止めてよいなら parse** という使い分けになります。なお status には既定値があるので、渡されていなくても結果には入ります。`,
    prerequisite: `zod は、値の形を1か所に書いておき、実行時にその形かどうかを確かめるためのライブラリです。

書いた形からは、対応する TypeScript の型を取り出せます。z.infer<typeof スキーマ> がその書き方です。

.optional() は省略できること、.default(値) は渡されなかったときに入る値を表します。unknown は「何か分からないもの」で、確かめるまで使えません。`,
    keywords: [
      { match: ["OrderSchema", "同時に", "両方"] },
      { match: ["z.infer", "手で書いて", "二重に"] },
      { match: ["parse", "safeParse", "例外"] },
      { match: ["uuid", "正の整数", "既定値", "status"] },
    ],
    rubric_items: {
      core: "1つの定義が実行時の検査と型の両方を決めているという結論を指していれば満たす",
      ground:
        "型を z.infer で取り出していて手で書いていない点に触れていれば満たす",
      depth:
        "parse が例外を投げ safeParse が成否を返す使い分けの点、または status の既定値が結果に入る点に触れていれば満たす",
      core_reject: [
        "型と検査を別々に書いていると読んでいる",
        "parse と safeParse の違いが無いと読んでいる",
        "この定義が実行時には何もしないと読んでいる",
      ],
    },
  },
];
