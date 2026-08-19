-- ステージ81〜90 投入
-- 出典: problems/stage-006-014.data.mjs / 設計: problems/stage-006-014.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- id は書かない（GENERATED ALWAYS AS IDENTITY）

begin;

-- ステージ81: JS と TS を並べて読む ─ 型注釈は何を防いでいるか（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  81,
  'JS と TS を並べて読む ─ 型注釈は何を防いでいるか',
  'ts',
  3,
  '意図',
  '// before.js（型注釈なし）
function applyCoupon(order, coupon) {
  return order.amount - coupon.discount;
}

applyCoupon({ amount: 1200 }, { discount: "300" });
applyCoupon({ amount: 1200 });

// after.ts（型注釈あり）
type Order = { amount: number };
type Coupon = { discount: number };

function applyCouponTyped(order: Order, coupon: Coupon): number {
  return order.amount - coupon.discount;
}',
  '下の書き方にすると、上の2つの呼び出しはどうなりますか。書いた人がこの形を選んだ意図とあわせて説明してください。',
  'どちらの呼び出しも、実行する前に止められます。

1つ目は discount に "300" という文字を渡していますが、Coupon は数だと書いてあるので受け付けません。2つ目は coupon そのものを渡しておらず、引数の数が足りないと指摘されます。

型注釈は、動かしてみるまで分からなかったことを、書いた時点で分かるようにするためのものです。上の書き方では1つ目は 1200 - "300" となって思わぬ結果になり、2つ目は coupon が無いまま読みに行って実行時に落ちます。どちらも動かさないと気づけません。',
  '[{"match":["実行する前","書いた時点","動かす前"]},{"match":["止め","受け付け","指摘"]},{"match":["discount","文字","引数の数"]},{"match":["1200","実行時に落ち","気づけ"]}]'::jsonb,
  '{"core":"型注釈があると2つの呼び出しが実行する前に止められるという結論を指していれば満たす","depth":"型注釈が無いと 1200 - \"300\" のような結果や実行時の失敗になって動かすまで気づけない点に触れていれば満たす","ground":"discount に数ではない値を渡している点、または coupon を渡していない点に触れていれば満たす","core_reject":["型注釈を書いても実行してみるまで分からないと読んでいる","型注釈が実行時の速さのために書かれていると読んでいる","上の2つの呼び出しはどちらも問題ないと読んでいる"]}'::jsonb,
  'TypeScript は JavaScript に型の情報を書き足せるようにしたものです。書いた型は実行前に照合され、実行時には残りません。

引数の後ろに : 型 と書くと「ここに来てよいのはこの形だけ」という意味になります。関数名の後ろの ): 型 は戻り値の形です。

type 名前 = { … } は、その形に名前を付ける書き方です。'
);

-- ステージ82: 型注釈と型推論 ─ 書かれた型・書かれない型（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  82,
  '型注釈と型推論 ─ 書かれた型・書かれない型',
  'ts',
  3,
  'トレース',
  'let count = 3;
let label = "在庫";
const fixed = "在庫";
let anything;

const rates = [0.1, 0.2];
const mixed = [1, "a"];

function double(n: number) {
  return n * 2;
}

const result = double(count);',
  'この10行から、それぞれの名前がどんな型として扱われるかを答えてください。型注釈が付いていないものについては、その理由も説明してください。',
  '型注釈が付いているのは double の引数だけで、あとはすべて代入した値から決まっています。

count は number、label は string です。let なので後から入れ替えられる前提になり、「3 という値」ではなく「数」として扱われます。一方 const fixed は入れ替えられないので、"在庫" という値そのものに固定されます。let と const で決まり方が変わります。

anything は代入も注釈も無いので何でも入れられる扱いになります。rates は number[]、mixed は 1 と "a" の両方が入っているので (string | number)[] です。result は double の戻り値から number になります。',
  '[{"match":["代入した値から","決まって","推論"]},{"match":["let","const","決まり方"]},{"match":["number","string"]},{"match":["rates","mixed","result","anything"]}]'::jsonb,
  '{"core":"型注釈が付いていないものが代入した値から決まっているという結論を指していれば満たす","depth":"mixed が2つの種類のどれかを表す形になる点、または result が double の戻り値から決まる点に触れていれば満たす","ground":"let と const で決まり方が変わる点に触れていれば満たす","core_reject":["型注釈が無いものはすべて何でも入る扱いになると読んでいる","let と const で決まり方は同じだと読んでいる","mixed が実行時にエラーになると読んでいる"]}'::jsonb,
  '型は必ずしも書く必要がありません。代入された内容から決められる場合、TypeScript がそれを自動的に決めます。

let で宣言したものは後から入れ替えられるので「その種類」まで、const で宣言したものは入れ替えられないので「その値そのもの」まで定まります。

配列は中身から定まります。複数の種類が混ざっていると、それらのどれかを表す形になります。関数の戻り値も、中の return から定まります。'
);

-- ステージ83: strict と strictNullChecks ─ なぜ undefined の考慮を求められるのか（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  83,
  'strict と strictNullChecks ─ なぜ undefined の考慮を求められるのか',
  'ts',
  4,
  '意図',
  'type User = { id: number; nickname?: string };

function findUser(id: number): User | undefined {
  const users: User[] = [{ id: 1, nickname: "さとう" }];
  return users.find((u) => u.id === id);
}

// この行は strictNullChecks を切っていると通り、入れていると止められる
function greetLoose(id: number) {
  const user = findUser(id);
  return `${user.nickname} さん`;
}

function greetStrict(id: number) {
  const user = findUser(id);
  if (!user) {
    return "見つかりませんでした";
  }
  return `${user.nickname ?? "名無し"} さん`;
}',
  'この設定を入れると、なぜ上の関数が止められて下の関数は通るのでしょうか。書いた人がこの設定を入れている意図とあわせて説明してください。',
  'findUser が「見つからなかった場合」も返しうるからです。

戻り値には User だけでなく undefined も並んでいます。greetLoose はそれを確かめずに user.nickname を読みに行くので、見つからなかったときに実行時の失敗になります。この設定は、その可能性を無視したまま先へ進むことを止めます。

greetStrict のほうは、if (!user) で見つからない場合を返してしまっているので、そこから先の user は必ずある側だけになります。nickname も ?? で埋めています。「無いかもしれない」を型として持ち回り、使う手前で必ず1回片付けさせるのがこの設定の狙いです。',
  '[{"match":["undefined","見つからな","無いかもしれな"]},{"match":["確かめず","無視","そのまま読"]},{"match":["findUser","並んで","greetLoose"]},{"match":["greetStrict","if (!user)","片付け"]}]'::jsonb,
  '{"core":"findUser が見つからなかった場合も返しうる点を指していれば満たす","depth":"greetStrict が見つからない場合を手前で返しているので以降は必ずある側だけになる点に触れていれば満たす","ground":"戻り値に undefined も並んでいる点に触れていれば満たす","core_reject":["findUser が必ず User を返すと読んでいる","この設定が実行時の速さのために入っていると読んでいる","下の関数も本当は止められるべきだと読んでいる"]}'::jsonb,
  '型を | でつなぐと「どちらかである」という意味になります。User | undefined は「User か、無いか」です。

配列の find は、条件に合うものが無いときに「無い」を返します。そのため返ってくるものの型にはそれも含まれます。

if で「無い場合」を手前で返してしまうと、そこから先ではもう片方だけが残ります。これは第3章の早期リターンと同じ形です。'
);

-- ステージ84: オブジェクト型と省略可能プロパティ、配列の型（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  84,
  'オブジェクト型と省略可能プロパティ、配列の型',
  'ts',
  3,
  'トレース',
  'type Item = {
  sku: string;
  qty: number;
  note?: string;
};

const a: Item = { sku: "A-1", qty: 2 };
const b: Item = { sku: "A-2", qty: 0, note: "取り置き" };
const c: Item = { sku: "A-3", qty: 1, color: "赤" };
const d: Item = { sku: "A-4" };

const list: Item[] = [a, b];
const counts: number[] = list.map((i) => i.qty);',
  '4つの宣言のうち、型として受け付けられないものはどれですか。それぞれ理由も説明してください。',
  '受け付けられないのは c と d の2つです。

c は color という余分な項目を足しています。Item に無いものを直接書き足すと、その場で指摘されます。d は qty が足りません。? が付いていないものは省けないからです。

a と b は通ります。note には ? が付いているので、書いても書かなくてもかまいません。b のように 0 を入れても、qty は「あるかどうか」ではなく「数であるかどうか」を見ているだけなので問題ありません。list と counts のように、配列の中身の形も 型[] で書けます。',
  '[{"match":["c と d","cとd","2つ"]},{"match":["color","余分","Item に無い"]},{"match":["qty","足りな","省けな"]},{"match":["note","0 を入れ","書かなくて"]}]'::jsonb,
  '{"core":"受け付けられないのが c と d の2つだという結論を指していれば満たす","depth":"note は ? が付いているので書かなくてよい点、または b の qty が 0 でも通る点に触れていれば満たす","ground":"c が Item に無い項目を足している点、または d に qty が無い点に触れていれば満たす","core_reject":["d だけが受け付けられないと読んでいる","b の qty が 0 なので受け付けられないと読んでいる","c の余分な項目は無視されて通ると読んでいる"]}'::jsonb,
  'type 名前 = { 項目: 型; … } は、そのオブジェクトがどんな項目を持つかを表します。

項目名の後ろに ? を付けると「あってもなくてもよい」という意味になります。付いていないものは必ず要ります。

型に無い項目を直接書き足したオブジェクトを渡すと、その場で指摘されます。型[] は「その型が並んだ配列」です。'
);

-- ステージ85: ユニオン型 ─ 「どれか」を表す型（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  85,
  'ユニオン型 ─ 「どれか」を表す型',
  'ts',
  4,
  'トレース',
  'type Id = number | string;

function describe(id: Id) {
  console.log(id.toString());
  console.log(id.toFixed(2));
  console.log(id.padStart(8, "0"));

  if (typeof id === "number") {
    console.log(id.toFixed(2));
  } else {
    console.log(id.padStart(8, "0"));
  }
}',
  '関数の中の4つの console.log のうち、そのままでは書けないものはどれですか。理由も説明してください。',
  'そのままでは書けないのは、2つ目の toFixed と3つ目の padStart です。

Id は number か string のどちらかなので、両方に共通してあるものしか直接は使えません。toString はどちらにもあるので1つ目は通ります。toFixed は number にしかなく、padStart は string にしかないので、どちらか分からない状態では使えません。

if (typeof id === "number") の中と else の中では、どちらであるかが決まっています。だから4つ目の toFixed と、その else の padStart は書けます。',
  '[{"match":["toFixed","padStart","2つ目"]},{"match":["共通","両方に","どちらにもある"]},{"match":["number か string","どちらか分からな","決まっていな"]},{"match":["typeof","toString","4つ目"]}]'::jsonb,
  '{"core":"両方に共通してあるものしか直接は使えないという結論を指していれば満たす","depth":"toString はどちらにもあるので使える点、または typeof の判定を通った中では使える点に触れていれば満たす","ground":"toFixed が number にしかなく padStart が string にしかない点に触れていれば満たす","core_reject":["4つとも書けると読んでいる","toString も書けないと読んでいる","if の中でも toFixed は書けないと読んでいる"]}'::jsonb,
  '型を | でつなぐと「そのどれか」という意味になります。number | string は「数か文字列のどちらか」です。

どちらの側か分からない状態では、両方が持っているものだけが使えます。片方にしかないものを使うには、どちらの側かを手前で確かめる必要があります。

typeof 値 === "number" のような判定を通ると、その中では側が確定します。'
);

-- ステージ86: リテラル型と as const（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  86,
  'リテラル型と as const',
  'ts',
  4,
  'トレース',
  'const statusA = "paid";
let statusB = "paid";

const config = { mode: "dark", retries: 3 };
const frozen = { mode: "dark", retries: 3 } as const;

function setMode(mode: "light" | "dark") {
  return mode;
}

setMode(statusA);
setMode(config.mode);
setMode(frozen.mode);',
  '最後の3行のうち、そのままでは通らないものはどれですか。型がどう決まっているかとあわせて説明してください。',
  '通らないのは真ん中の setMode(config.mode) です。

config は const で宣言していますが、中の項目は後から差し替えられるので mode は string として広く決まります。string のままでは "light" か "dark" のどちらかとは限らないので受け付けられません。

frozen は as const を付けているため中身まで固定され、mode は "dark" のままです。だから3行目は通ります。なお statusA は const なので "paid" という値そのものに決まりますが、setMode が受け取れるのは "light" か "dark" だけなので、1行目もそもそも渡せません。',
  '[{"match":["config.mode","真ん中","2行目"]},{"match":["string","広く","限らな"]},{"match":["as const","frozen","固定され"]},{"match":["statusA","paid","そもそも"]}]'::jsonb,
  '{"core":"config.mode が string として広く決まるので通らないという結論を指していれば満たす","depth":"as const を付けた frozen は固定されて通る点、または statusA が \"paid\" なのでそもそも渡せない点に触れていれば満たす","ground":"const に入れても中の項目は差し替えられるので値そのものが残らない点に触れていれば満たす","core_reject":["3行とも通ると読んでいる","frozen.mode も string になるので通らないと読んでいる","config が const なので中身まで固定されると読んでいる"]}'::jsonb,
  'const で宣言したものは入れ替えられないので、「その値そのもの」まで定まります。let は入れ替えられるので「その種類」までです。

オブジェクトを const に入れても、その中身は書き換えられます。そのため中の値は種類のほうで定まります。

as const を付けると、中身も書き換えられないものとして扱われ、値そのものが残ります。'
);

-- ステージ87: 絞り込み(narrowing) ─ if を通ると型が変わる（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  87,
  '絞り込み(narrowing) ─ if を通ると型が変わる',
  'ts',
  4,
  'トレース',
  'type Input = string | number | null;

function normalize(value: Input): string {
  if (value === null) {
    return "（未入力）";
  }

  if (typeof value === "number") {
    return value.toFixed(1);
  }

  return value.trim().toUpperCase();
}

console.log(normalize(null));
console.log(normalize(12.345));
console.log(normalize("  ok  "));',
  '3回の呼び出しでそれぞれ何が出力されますか。最後の行で value がどう扱われているかも説明してください。',
  '出力は （未入力）、12.3、OK の3行です。

最後の return では value が string として扱われています。2つの if を通り抜けてくるあいだに、null である場合と number である場合が手前で返されているので、残っているのは string だけになるからです。だから trim や toUpperCase をそのまま書けます。

12.345 は toFixed(1) で 12.3 になります。"  ok  " は trim で前後の空白が落ちてから大文字になり OK です。',
  '[{"match":["string","残って","だけになる"]},{"match":["2つの if","通り抜け","手前で返"]},{"match":["12.3","OK","未入力"]},{"match":["trim","toFixed","toUpperCase"]}]'::jsonb,
  '{"core":"最後の return で value が string として扱われるという結論を指していれば満たす","depth":"出力が （未入力）/ 12.3 / OK になる点、または trim と toUpperCase をそのまま書ける点に触れていれば満たす","ground":"2つの if で null と number の場合が手前で返されている点に触れていれば満たす","core_reject":["最後の return でも value が3つのどれか分からないままだと読んでいる","2つ目の出力が 12.345 になると読んでいる","3つ目の出力が空白の付いたままになると読んでいる"]}'::jsonb,
  '| でつないだ型は「そのどれか」を表します。どれであるかが分からないうちは、全部に共通するものしか使えません。

if で「この場合」を返してしまうと、そこから先では残りの場合だけになります。=== null や typeof 値 === "number" のような判定がその役をします。

数.toFixed(桁) は小数の桁を揃えた文字列を返します。文字列.trim() は前後の空白を落とします。'
);

-- ステージ88: 関数の型 ─ シグネチャから使い方を読む（仕様）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  88,
  '関数の型 ─ シグネチャから使い方を読む',
  'ts',
  4,
  '仕様',
  '// 実装は見ずに、この宣言だけから使い方を読む

declare function pickBy<T>(
  list: readonly T[],
  predicate: (item: T, index: number) => boolean,
): T[];

declare function firstOr<T>(list: readonly T[], fallback: T): T;

declare function groupBy<T>(
  list: readonly T[],
  toKey: (item: T) => string,
): Record<string, T[]>;',
  'この3つの宣言だけから、それぞれが何を受け取って何を返すのかを説明してください。型だけから確実に分かることと、分からないことを分けて書いてください。',
  '確実に分かることがいくつもあります。

pickBy は配列と、要素と番号を受け取って真偽を返す関数をもらい、同じ種類の要素が並んだ配列を返します。readonly が付いているので、渡した配列に手を入れないことも約束されています。firstOr は配列と同じ種類の値をもう1つもらい、その種類の値を1つ返します。fallback が必須なので、何も返せない場合が無いことが分かります。groupBy は要素から文字を作る関数をもらい、その文字ごとに配列をまとめたものを返します。

言い切れないこともあります。pickBy が predicate を何回呼ぶか、firstOr がどんなときに fallback を返すか、groupBy が並び順を保つかどうかは、型には書かれていません。',
  '[{"match":["pickBy","firstOr","groupBy"]},{"match":["同じ種類","同じ型","要素の型"]},{"match":["readonly","手を入れな","fallback"]},{"match":["言い切れな","書かれていな","何回呼ぶ","並び順"]}]'::jsonb,
  '{"core":"3つの宣言から受け取るものと返すものが読み取れるという結論を指していれば満たす","depth":"呼ばれる回数や並び順のように型には書かれていないことがある点に触れていれば満たす","ground":"同じ T が使われているので入力と出力の要素がそろう点に触れていれば満たす","core_reject":["実装を見ないと何も分からないと読んでいる","pickBy が別の種類の配列を返しうると読んでいる","firstOr が何も返さない場合があると読んでいる"]}'::jsonb,
  'declare function は「この形の関数がある」とだけ伝える書き方で、中身は書きません。

<T> は「使うときに決まる型」を表す入れ物です。同じ T が複数の場所に出てきたら、それらは同一でなければなりません。

readonly 型[] は「読むだけの配列」です。Record<string, X> は「文字をキーにして X を持つオブジェクト」です。'
);

-- ステージ89: any / unknown / never ─ 危険な型・安全な型（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  89,
  'any / unknown / never ─ 危険な型・安全な型',
  'ts',
  4,
  '意図',
  'function handleAny(input: any) {
  return input.toUpperCase();
}

function handleUnknown(input: unknown) {
  if (typeof input === "string") {
    return input.toUpperCase();
  }
  return "";
}

function assertNever(x: never): never {
  throw new Error(`想定外の値: ${x}`);
}',
  '上2つの関数は同じことをしようとしていますが、書き方が違います。書いた人が2つ目の形を選ぶ意図を説明してください。',
  'unknown は、中身が何か確かめてから使うことを書き手に強制するためです。

any を書くと照合そのものが外れるので、input.toUpperCase() は無条件に通ります。数が渡ってきても止められず、実行時に落ちます。unknown は「何か分からない」という意味なので、確かめるまで何も使わせません。そのため typeof で確かめる1行が要るようになります。

any は「照合をやめる」、unknown は「照合を先送りにして、使う手前で必ず1回やる」という違いです。3つ目の never は「ここには何も来ない」を表す型で、分岐を数え漏らしたときに気づくための受け皿として使われます。',
  '[{"match":["unknown","先送り","使わせな"]},{"match":["any","無条件","止められず"]},{"match":["typeof","強制","1行が要る"]},{"match":["never","数え漏らし","実行時に落ち"]}]'::jsonb,
  '{"core":"unknown が使う手前で確かめることを強制するという意図を指していれば満たす","depth":"any は照合をやめる側で unknown は先送りにする側だという対比、または never が数え漏らしに気づくための受け皿である点に触れていれば満たす","ground":"any だと照合が外れて無条件に通ってしまう点に触れていれば満たす","core_reject":["any と unknown は同じものだと読んでいる","unknown のほうが自由に使えるので選んでいると読んでいる","never が「何でも入る型」だと読んでいる"]}'::jsonb,
  'any はどんな値でも入れられ、そのうえ何をしても検査されません。書いた側の責任になります。

unknown もどんな値でも入れられますが、確かめるまで使えません。typeof などで確かめた中では、その形として扱えます。

never は「値が存在しない」ことを表します。到達しないはずの場所を表すのに使われます。'
);

-- ステージ90: 型エラーメッセージを読む① ─ どの行の何が食い違っているか（影響）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, context, question, model_answer, keywords, rubric_items, prerequisite)
values (
  90,
  '型エラーメッセージを読む① ─ どの行の何が食い違っているか',
  'ts',
  5,
  '影響',
  'type Row = { id: number; label: string };

function toRows(records: { id: string; name: string }[]): Row[] {
  return records.map((r) => ({
    id: r.id,
    label: r.name,
  }));
}

const rows = toRows([{ id: "1", name: "在庫" }]);',
  'src/rows.ts:4:5 - error TS2322: Type ''string'' is not assignable to type ''number''.

4     id: r.id,
      ~~

  src/rows.ts:1:15
    1 type Row = { id: number; label: string };
                  ~~
    The expected type comes from property ''id'' which is declared here on type ''Row''',
  'この出力から、どこで何が食い違っているかを説明してください。直すとしたら候補がいくつかあるので、それぞれどこまで波及するかもあわせて書いてください。',
  '食い違っているのは4行目の id で、string を入れようとしているのに Row の id は number だと決まっていることです。

出力の後半が、その決まった場所を指しています。1行目の Row の id で、期待している側がどこで定まったのかを教えてくれています。つまり原因は map の中だけを見ていても分からず、2か所を突き合わせる必要があります。

直し方は複数あります。Row の id を string にすると、Row を使っているほかの場所すべてに広がります。toRows の中で Number(r.id) と変えると、この関数の中だけで収まりますが、数として読めない値が来たときの扱いを決める必要が出ます。受け取る records 側の id を number にすると、この関数を呼んでいる側が作り直しになります。',
  '[{"match":["4行目","id","map の中"]},{"match":["文字","string","number"]},{"match":["1行目","Row","決まった場所"]},{"match":["Number(","呼んでいる側","ほかの場所","収まり"]}]'::jsonb,
  '{"core":"4行目の id に string を入れようとしているのが食い違いだという結論を指していれば満たす","depth":"直し方によって影響の届く範囲が変わる点に触れていれば満たす","ground":"出力の後半が Row の id で期待する型が定まったことを指している点に触れていれば満たす","core_reject":["1行目の Row の宣言そのものが誤りだと読んでいる","records の name が食い違っていると読んでいる","直し方は Row を変える1通りしかないと読んでいる"]}'::jsonb,
  '型検査の出力は、まず「どのファイルの何行目か」と「何が何に入らないか」を伝えます。

そのあとに続く部分は、期待している側の型がどこで定まったのかを指します。食い違いは2つの場所の関係なので、両方を見ないと直せません。

{ … } を返す関数では、返しているオブジェクトの各項目が、宣言した戻り値の型と1つずつ突き合わされます。'
);

commit;
