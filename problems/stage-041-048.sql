-- ステージ41〜48 投入
-- 出典: problems/stage-006-014.data.mjs / 設計: problems/stage-006-014.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- id は書かない（GENERATED ALWAYS AS IDENTITY）

begin;

-- ステージ41: 文字列メソッド ─ 分解・結合・整形・検索（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  41,
  '文字列メソッド ─ 分解・結合・整形・検索',
  'js',
  3,
  'トレース',
  'function parseTags(line) {
  return line
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

const raw = " 在庫, ,急ぎ ,, 在庫 ";

console.log(parseTags(raw));
console.log(parseTags(raw).length);
console.log(raw.replace(" ", "_"));',
  '3つの console.log でそれぞれ何が出力されますか。最後がその結果になる理由も説明してください。',
  '最後の行は、いちばん前の空白1つだけが置き換わって「_在庫, ,急ぎ ,, 在庫 」になります。

replace の探すもの側に文字列を書いた場合、置き換わるのは最初に見つかった1か所だけで、あとの空白はそのまま残ります。raw そのものも変わりません。

parseTags のほうは、split でできた空の要素を trim と filter が落とすので [ ''在庫'', ''急ぎ'', ''在庫'' ] の3件になります。同じものをまとめる処理は無いので、在庫 は2つ残ります。',
  '[{"match":["replace","最後の行"]},{"match":["1か所","1つだけ","いちばん前"]},{"match":["あとの空白","残ります","1か所しか"]},{"match":["在庫","3件","同じもの"]}]'::jsonb,
  '{"core":"replace が最初に見つかった1か所だけを置き換えるという結論を指していれば満たす","depth":"parseTags の結果が 在庫 / 急ぎ / 在庫 の3件になる点、または同じものをまとめる処理が無いので 在庫 が2つ残る点に触れていれば満たす","ground":"探すもの側に文字列を書いた場合はあとの空白が残る点に触れていれば満たす","core_reject":["replace がすべての空白を置き換えると読んでいる","replace が raw そのものを書き換えると読んでいる","parseTags が同じものをまとめて2件になると読んでいる"]}'::jsonb,
  '文字列.split(",") は区切り文字で分けた配列を返します。区切りが連続していると、その間に空の要素ができます。

文字列.trim() は前後の空白を落とした新しい文字列を返します。

文字列.replace(探すもの, 置き換えるもの) は新しい文字列を返します。探すもの側に文字列を書いたときと正規表現を書いたときで、置き換わる範囲が変わります（正規表現は次のステージ）。'
);

-- ステージ42: 数値の罠 ─ Number / parseInt / NaN と浮動小数点の誤差（ズレ）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  42,
  '数値の罠 ─ Number / parseInt / NaN と浮動小数点の誤差',
  'js',
  4,
  'ズレ',
  '// 入力された金額を数にして、合計が期待どおりかを確かめる
function verifyTotal(inputs, expected) {
  const values = inputs.map((v) => parseInt(v, 10));
  const sum = values.reduce((a, b) => a + b, 0);

  return { values, sum, matched: sum === expected };
}

console.log(verifyTotal(["1200", "80円", "0.5"], 1280));
console.log(0.1 + 0.2 === 0.3);',
  'コメントに書かれた意図と、実際の動きが食い違っています。2つの出力を示したうえで、どこがどう食い違うかを説明してください。',
  '壊れた入力が混じっているのに matched が true になります。

parseInt は数として解釈できない文字に当たった時点で止まるので、"80円" は 80 に、"0.5" は 0 になります。0.5 が 0 に潰れているのに、合計はたまたま 1280 になり、期待値と一致してしまいます。確かめたつもりで何も確かめられていません。

2つ目の出力は false です。0.1 + 0.2 はぴったり 0.3 にならないため、=== では確かめられません。',
  '[{"match":["parseInt","0.5","80円"]},{"match":["true","一致","通って"]},{"match":["時点で止ま","潰れ","そこまでしか"]},{"match":["0.1","false","ぴったり"]}]'::jsonb,
  '{"core":"壊れた入力なのに matched が true になるという結論を指していれば満たす","depth":"0.1 + 0.2 === 0.3 が false になり小数を === で確かめられない点に触れていれば満たす","ground":"parseInt が途中で止まるため \"0.5\" が 0 になっている点に触れていれば満たす","core_reject":["matched が false になると読んでいる","\"80円\" のところで実行時エラーになると読んでいる","\"0.5\" が 0.5 として足されると読んでいる"]}'::jsonb,
  'parseInt(文字列, 10) は文字列を10進の整数として読みます。先頭から読める範囲だけを読み、途中で数と見なせない文字が現れたらそこで打ち切ります。1文字も読めなければ NaN になります。

Number(文字列) は全体が数として読めるかを見るので、途中で打ち切ることはありません。

コンピュータは 0.1 や 0.2 のような値を2進数で近似して持つため、書いたとおりの値にはなりません。'
);

-- ステージ43: 正規表現の基本 ─ パターンを声に出して読む（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  43,
  '正規表現の基本 ─ パターンを声に出して読む',
  'js',
  4,
  'トレース',
  'const patternA = /[A-Z]{2}-\d{4}/;
const patternB = /^[A-Z]{2}-\d{4}$/;

const codes = ["AB-1234", "xAB-1234x", "AB-12345"];

for (const code of codes) {
  console.log(code, patternA.test(code), patternB.test(code));
}',
  '3つの商品コードそれぞれについて、2つのパターンがどう判定するかを答えてください。結果が分かれる理由も説明してください。',
  'patternA ははじまりと終わりを固定していないので、文字列の一部にその形が見つかれば true になります。

そのため xAB-1234x のように前後に余計な文字が付いていても true です。patternB は ^ と $ で囲んであり、全体がその形でなければ true になりません。

出力は3行で、AB-1234 は両方 true、xAB-1234x は patternA だけ true、AB-12345 も patternA だけ true です。最後は末尾に数字が1つ余っているので patternB では false になります。',
  '[{"match":["patternA","はじまりと終わり","アンカー"]},{"match":["一部","含まれ","余計な文字"]},{"match":["全体","^ と $","囲んで"]},{"match":["AB-12345","patternB","false"]}]'::jsonb,
  '{"core":"patternA は文字列の一部に当てはまれば true になるという結論を指していれば満たす","depth":"AB-12345 が patternB では false になる点、または3行の判定が並ぶ順に触れていれば満たす","ground":"patternA には ^ と $ が無いので全体が一致する必要がない点に触れていれば満たす","core_reject":["patternA が xAB-1234x で false になると読んでいる","patternB が AB-12345 で true になると読んでいる","2つのパターンの結果が3行とも同じになると読んでいる"]}'::jsonb,
  '/…/ で囲んだものを正規表現といい、文字の並びの形を表します。

[A-Z]{2} は「大文字が2つ」、\d{4} は「数字が4つ」です。正規表現.test(文字列) は、その形が見つかるかどうかを真偽で返します。

^ は文字列のはじまり、$ は終わりを表します。これらを書くかどうかで、test が「どこかにあるか」を見るのか「これがすべてか」を見るのかが変わります。'
);

-- ステージ44: 正規表現の実務パターン ─ 抽出と置換（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  44,
  '正規表現の実務パターン ─ 抽出と置換',
  'js',
  4,
  'トレース',
  'const log = "order=A-1001 user=U-77 order=A-1002";

const ids = log.match(/order=(A-\d+)/g);
const first = log.match(/order=(A-\d+)/);
const masked = log.replace(/U-\d+/g, "U-****");

console.log(ids);
console.log(first[1]);
console.log(masked);',
  '3つの console.log でそれぞれ何が出力されますか。1つ目がその結果になる理由も説明してください。',
  'g を付けた match では、括弧で取り出した部分は返らず、当てはまった全体だけが並びます。

そのため ids は [ ''order=A-1001'', ''order=A-1002'' ] になり、order= を含んだ文字列が入ります。A-1001 だけがほしい場合は、g の無いほうを使って first[1] を見ます。こちらは ''A-1001'' です。

masked のほうは replace に g が付いているので該当箇所を残らず置き換え、order=A-1001 user=U-**** order=A-1002 になります。',
  '[{"match":["ids","g を付け","グローバル"]},{"match":["全体","括弧","返らず"]},{"match":["order=","含んだ","そのまま並"]},{"match":["first","A-1001","masked"]}]'::jsonb,
  '{"core":"g を付けた match では括弧で取り出した部分が返らないという結論を指していれば満たす","depth":"g の無いほうでは first[1] から A-1001 が取れる点、または masked が該当箇所を残らず置き換える点に触れていれば満たす","ground":"ids に order= を含んだ文字列が入っている点に触れていれば満たす","core_reject":["ids に A-1001 と A-1002 だけが入ると読んでいる","first[1] が order=A-1001 になると読んでいる","masked の置き換えが最初の1か所だけになると読んでいる"]}'::jsonb,
  '正規表現の後ろに付く g は「当てはまるところを全部たどる」という指定です。

文字列.match(正規表現) は、g があるときと無いときで返るものの形が変わります。g が無いときは、当てはまった文字列に加えて ( ) で囲んだ部分も配列に入り、[1] から順に取り出せます。

文字列.replace(正規表現, 置き換えるもの) は、g があれば該当箇所を残らず置き換えます。'
);

-- ステージ45: Map / Set ─ オブジェクト・配列との使い分け（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  45,
  'Map / Set ─ オブジェクト・配列との使い分け',
  'js',
  4,
  '意図',
  'function summarizeVisits(events) {
  const uniqueUsers = new Set();
  const countByPage = new Map();

  for (const event of events) {
    uniqueUsers.add(event.userId);
    countByPage.set(event.page, (countByPage.get(event.page) ?? 0) + 1);
  }

  return {
    users: uniqueUsers.size,
    pages: [...countByPage.entries()],
  };
}',
  '同じ利用者を1人として数える部分と、ページごとに数える部分があります。書いた人がこの2つのやり方を選んだ意図を説明してください。',
  '数え方に必要な決まりを、自分で書かずに入れ物の側に任せるためです。

uniqueUsers は同じ値を重ねて持たない入れ物なので、add を呼ぶだけで済み、size がそのまま人数になります。配列でやるなら、入れる前に includes で確かめる処理を毎回書くことになります。

countByPage のほうを選んでいるのは、名前を入れた順に保ち、名前が文字へ変えられないためです。ふつうのオブジェクトだと、数字らしい名前が付いたページの並び順が入れた順と変わってしまいます。',
  '[{"match":["uniqueUsers","countByPage"]},{"match":["任せ","自分で書かず","決まり"]},{"match":["size","add","人数"]},{"match":["並び順","文字へ変え","includes"]}]'::jsonb,
  '{"core":"数え方に必要な決まりを自分で書かず入れ物の側に任せるという意図を指していれば満たす","depth":"ふつうのオブジェクトだと名前が文字へ変えられて並び順が変わる点、または配列なら includes で確かめる処理が要る点に触れていれば満たす","ground":"add を呼ぶだけで同じ値が重ならず size がそのまま人数になる点に触れていれば満たす","core_reject":["処理を速くするために選んでいると読んでいる","2つの入れ物は同じもので使い分けに意味は無いと読んでいる","uniqueUsers が訪問回数を数えていると読んでいる"]}'::jsonb,
  'new Set() は、同じ値を1つしか持たない入れ物です。add(値) で足し、size で個数が分かります。

new Map() は、名前と値の組を持つ入れ物です。set(名前, 値) で入れ、get(名前) で取り出します。ふつうのオブジェクトと違って、名前は文字のほかにどんな値でも使え、入れた順が保たれます。

[...entries()] は、[名前, 値] の組を並べた配列にします。'
);

-- ステージ46: JSON.stringify / JSON.parse ─ 文字列とデータの往復（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  46,
  'JSON.stringify / JSON.parse ─ 文字列とデータの往復',
  'js',
  4,
  'トレース',
  'const draft = {
  title: "月次レポート",
  savedAt: new Date("2026-08-19T00:00:00Z"),
  tags: new Set(["経理", "月次"]),
  reviewer: undefined,
  render: () => "html",
};

const text = JSON.stringify(draft);
const restored = JSON.parse(text);

console.log(text);
console.log(typeof restored.savedAt);
console.log(restored.tags);
console.log("reviewer" in restored);',
  '4つの console.log でそれぞれ何が出力されますか。2つ目がその結果になる理由も説明してください。',
  '2つ目は string になります。

書き出す時点で savedAt は Date から文字列へ変えられ、JSON.parse はそれを Date に戻しません。書き出されたとおりに作り直すだけだからです。

1つ目のテキストには title と savedAt と tags しか入りません。tags は空のオブジェクト {} になり、reviewer と render は項目ごと落ちます。そのため3つ目は {}、4つ目は false になります。',
  '[{"match":["savedAt","Date"]},{"match":["string","文字列"]},{"match":["Date に戻","作り直す","書き出す時点"]},{"match":["tags","空のオブジェクト","reviewer","落ち"]}]'::jsonb,
  '{"core":"往復すると savedAt が文字列になるという結論を指していれば満たす","depth":"tags が空のオブジェクトになる点、または reviewer と render が項目ごと落ちる点に触れていれば満たす","ground":"書き出す時点で Date が文字列へ変えられ JSON.parse が戻さない点に触れていれば満たす","core_reject":["restored.savedAt が Date のままだと読んでいる","tags が配列として戻ると読んでいる","reviewer が undefined として残ると読んでいる"]}'::jsonb,
  'JSON.stringify(値) はデータを1本のテキストにします。JSON.parse(テキスト) はテキストをデータに戻します。

テキストで表せるのは、名前と値の組・並び・数・真偽・空を表すものだけです。それ以外のものは、テキストにする段階で形を変えられるか、項目ごと落とされます。

戻す側は、もとが何だったかを知りません。テキストに書かれている形のまま組み立てます。'
);

-- ステージ47: Date ─ 日付計算のコードを読む（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  47,
  'Date ─ 日付計算のコードを読む',
  'js',
  4,
  'トレース',
  'function closingDate(year, month) {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

console.log(closingDate(2026, 2));
console.log(closingDate(2026, 3));

const base = new Date(2026, 0, 31);
base.setMonth(1);
console.log(base.getMonth() + 1, base.getDate());',
  '3つの console.log でそれぞれ何が出力されますか。1つ目がその結果になる理由も説明してください。',
  '日にあたる引数に 0 を渡すと、ひとつ前の月の最終日になります。

月は0始まりなので new Date(2026, 2, 0) の 2 は3月を指し、その0日目、つまり2月の最終日になります。2026年は閏年ではないので 2026-2-28 です。2つ目は3月の最終日で 2026-3-31 になります。

3つ目は setMonth(1) で1月31日を2月にしていますが、2月31日という日は無いので3月3日へ送られます。出力は 3 3 です。',
  '[{"match":["0 を渡","月は0"]},{"match":["最終日","ひとつ前の月","2月28"]},{"match":["0始まり","0 から数え","1つずれ"]},{"match":["setMonth","3月3日","2月31日"]}]'::jsonb,
  '{"core":"日にあたる引数に 0 を渡すとひとつ前の月の最終日になるという結論を指していれば満たす","depth":"setMonth(1) で1月31日が3月3日へ送られる点、または1つ目が 2026-2-28 になる点に触れていれば満たす","ground":"月の指定が0始まりで 2 が3月を指す点に触れていれば満たす","core_reject":["1つ目が 2026-2-1 になると読んでいる","1つ目が 2026-3-1 になると読んでいる","setMonth(1) の結果が2月31日のまま残ると読んでいる"]}'::jsonb,
  'new Date(年, 月, 日) で日付を作れます。月の指定だけは 0 が1月、11 が12月です（getMonth() も同じ数え方）。

日の指定は、その月に存在しない値を書いても実行時エラーになりません。範囲を外れたぶんは前後の月へ送られます。

setMonth(月) は月だけを変えます。日はそのまま残ります。'
);

-- ステージ48: タイムゾーン ─ JST と UTC がズレるコードを読む（ズレ）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  48,
  'タイムゾーン ─ JST と UTC がズレるコードを読む',
  'js',
  5,
  'ズレ',
  '// 受注時刻を日本時間の日付に直し、日ごとの集計キーにする
function toJstKey(isoString) {
  return new Date(isoString).toISOString().slice(0, 10);
}

const orders = [
  { id: "A-1", placedAt: "2026-08-18T14:30:00Z" },
  { id: "A-2", placedAt: "2026-08-18T15:30:00Z" },
];

for (const order of orders) {
  console.log(order.id, toJstKey(order.placedAt));
}',
  'コメントに書かれた意図と、実際の動きが食い違っています。2つの出力を示したうえで、どこがどう食い違うかを説明してください。',
  'A-2 は日本時間では19日の0時30分ですが、キーは 2026-08-18 になります。

toISOString は常に世界標準時での表記を返すので、9時間ぶんの差が考慮されていません。世界標準時の15時以降に入った注文は日本時間では翌日ですが、前日として数えられてしまいます。

A-1 のほうはどちらで見ても18日なので、ずれていません。毎日9時間ぶんの注文が前の日に寄せられる、という形の食い違いです。',
  '[{"match":["A-2","2件目","15時30分"]},{"match":["19日","翌日","前日"]},{"match":["toISOString","9時間","考慮され"]},{"match":["A-1","15時以降","ずれていない"]}]'::jsonb,
  '{"core":"日本時間では19日の注文が18日として数えられるという結論を指していれば満たす","depth":"A-1 のほうはどちらで見ても18日なのでずれていない点、または毎日9時間ぶんの注文だけが前の日に寄せられる点に触れていれば満たす","ground":"toISOString が常に世界標準時の日付を返し9時間ぶんの差が入っていない点に触れていれば満たす","core_reject":["2件とも日本時間でも18日なので問題ないと読んでいる","A-1 のほうがずれていると読んでいる","toISOString が実行環境の時間帯に合わせて変わると読んでいる"]}'::jsonb,
  'new Date("…Z") の末尾の Z は、その時刻が世界標準時であることを表します。

toISOString() が返す表記は、どの環境で動かしても世界標準時のものです。実行している場所の時間帯には合わせません。

日本の時間帯は世界標準時より進んでいるので、同じ瞬間を指していても日付が変わることがあります。'
);

commit;
