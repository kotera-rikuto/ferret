-- ステージ1〜5 投入
-- 生成: 2026-08-16 / 出典: problems/stage-001-005.md
-- id は書かない（GENERATED ALWAYS AS IDENTITY）

begin;

-- ステージ1: const と let ─ 再代入できる箱・できない箱（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items)
values (
  1,
  'const と let ─ 再代入できる箱・できない箱',
  'js',
  1,
  'トレース',
  'function applyCoupon(price) {
  const rate = 0.9;
  let total = price;
  total = total * rate;
  rate = 0.8;
  return total;
}

console.log(applyCoupon(1000));',
  'このコードを実行すると何が起きますか。',
  '5行目で const で宣言された rate に再代入しているため、TypeError が発生して実行が止まります。console.log は実行されません。',
  '[{"match":["rate","const","定数"]},{"match":["エラー","TypeError","止ま","落ち","例外"]},{"match":["再代入","代入","0.8"]},{"match":["console.log","出力されない","表示されない"]}]'::jsonb,
  '{"core":"const の rate への再代入でエラーになるという結論を指していれば満たす","ground":"5行目の rate = 0.8 が const 宣言への再代入である点に触れていれば満たす","depth":"console.log(applyCoupon(1000)) に到達せず何も出力されない点、または total の計算（900）までは進んでいる点に触れていれば満たす","core_reject":["900 が出力されると読んでいる","let の total への再代入が問題だと読んでいる"]}'::jsonb
);

-- ステージ2: var が混ざったコードの読み方（ズレ）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items)
values (
  2,
  'var が混ざったコードの読み方',
  'js',
  3,
  'ズレ',
  'function summarizeOrders(orders) {
  var total = 0;

  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];
    if (order.status !== "canceled") {
      total = total + order.amount;
    }
  }

  // 集計に入れた最後の注文を運用ログに残す
  console.log("最後に集計した注文:", order.id);

  return total;
}

console.log(summarizeOrders([
  { id: "A-1", status: "paid", amount: 1200 },
  { id: "A-2", status: "paid", amount: 800 },
  { id: "A-3", status: "canceled", amount: 5000 },
]));',
  'コメントに書かれた意図と、実際にログへ出る内容が食い違っています。ログに何が出るか答え、なぜそうなるのかを説明してください。',
  'ログには「最後に集計した注文: A-3」と出ます。しかし A-3 は status が canceled なので合計に加算されておらず、返ってくる合計も A-1 と A-2 だけの 2000 です。コメントが意図している「集計に入れた最後の注文」は A-2 なので、意図と実際の出力が食い違っています。

原因は order が var で宣言されていることです。var はブロックスコープを持たず関数全体で有効になるため、ループを抜けた後も最後の繰り返しで代入された値、つまり配列の末尾要素が残ります。合計に加算するかどうかを分けているのは if の中だけで、var order への代入はどの注文でも必ず実行されます。',
  '[{"match":["order","var"]},{"match":["A-3","canceled","取り消"]},{"match":["ブロックスコープ","関数全体","ループを抜け","末尾","最後の繰り返し"]},{"match":["2000","加算","if"]}]'::jsonb,
  '{"core":"集計に入っていない A-3 がログに出るという結論を指していれば満たす","ground":"order が var で宣言されているため、ループを抜けた後も最後の要素が残る点に触れていれば満たす","depth":"if で分けているのは加算だけで var order への代入は毎回実行される点、または合計が 2000 になる点に触れていれば満たす","core_reject":["A-2 がログに出ると読んでいる","if で弾かれるので order に canceled の注文は入らないと読んでいる","ループの外なので order を参照できずエラーになると読んでいる"]}'::jsonb
);

-- ステージ3: 基本型と「無い」の2種類（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items)
values (
  3,
  '基本型と「無い」の2種類',
  'js',
  2,
  'トレース',
  '// GET /api/profile のレスポンスをそのまま受け取ったもの
const profile = {
  id: 1024,
  name: "佐藤",
  isActive: true,
  age: null,
};

console.log(typeof profile.id);
console.log(typeof profile.name);
console.log(typeof profile.isActive);
console.log(typeof profile.age);
console.log(typeof profile.company);
console.log(profile.age);
console.log(profile.company);',
  'age と company はどちらも「値が無い」状態ですが、意味が違います。それぞれ何を表しているか、コードの出力を根拠に説明してください。',
  'age はキー自体がレスポンスに存在していて、その値として null が入っている状態です。サーバーが「この項目に値は無い」と明示して返したことを表します。一方 company はキー自体がレスポンスに存在せず、存在しないプロパティへアクセスした結果として undefined が返っています。項目そのものが返ってこなかった状態です。

根拠は6つ目と7つ目の出力で、profile.age は null、profile.company は undefined になります。5つ目の typeof profile.company だけが undefined になるのも、キーが存在しないことの現れです。

なお4つ目の typeof profile.age は null ではなく object になります。null に対する typeof が object を返すのは JavaScript 初期からの既知の仕様上の不具合で、null かどうかの判定に typeof は使えません。',
  '[{"match":["キー","プロパティ","レスポンス"]},{"match":["存在しな","存在せず","undefined","返ってこな"]},{"match":["6つ目","7つ目","5つ目"]},{"match":["object","明示","仕様"]}]'::jsonb,
  '{"core":"company はキー自体が存在しないため undefined になっているという結論を指していれば満たす","ground":"6つ目・7つ目の出力（profile.age が null、profile.company が undefined）を根拠として挙げていれば満たす","depth":"typeof profile.age が object になる点、または null が「値が無いと明示された状態」だという意味の違いに触れていれば満たす","core_reject":["age と company をどちらも値が無いので同じだとまとめている","存在しない profile.company へのアクセスはエラーになると読んでいる"]}'::jsonb
);

-- ステージ4: コピーされる値・共有される値 ─ プリミティブと参照（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items)
values (
  4,
  'コピーされる値・共有される値 ─ プリミティブと参照',
  'js',
  2,
  'トレース',
  'const defaultSettings = { notifyEmail: true, maxProjects: 3 };
const proSettings = defaultSettings;
proSettings.maxProjects = 20;

let defaultRetryCount = 3;
let proRetryCount = defaultRetryCount;
proRetryCount = 20;

console.log(defaultSettings.maxProjects);
console.log(defaultRetryCount);
console.log(defaultSettings === proSettings);',
  '3つの出力を順に答えてください。そのうえで、同じ手順で書いているのに defaultSettings と defaultRetryCount で結果が変わる理由を説明してください。',
  '出力は順に 20、3、true です。

オブジェクトを代入するとき、渡るのは中身の複製ではなく同じ実体を指す参照です。proSettings と defaultSettings は同じオブジェクトを見ているため、proSettings.maxProjects を書き換えると defaultSettings 側からも 20 に見えますし、=== の比較も true になります。

一方 number はプリミティブなので、代入時に値そのものがコピーされます。proRetryCount と defaultRetryCount は別々の値を持つため、proRetryCount への再代入は defaultRetryCount に影響せず 3 のままです。

defaultSettings は const で宣言されているのに中身が変わっている点も重要です。const が禁止するのは変数への再代入だけで、参照先のオブジェクトのプロパティを書き換えることは禁止しません。',
  '[{"match":["proSettings","オブジェクト","同じ実体"]},{"match":["書き換","共有","両方"]},{"match":["参照","複製","コピー"]},{"match":["プリミティブ","true","number"]}]'::jsonb,
  '{"core":"オブジェクトは同じ実体を共有するため片方を書き換えるともう片方にも見えるという結論を指していれば満たす","ground":"proSettings と defaultSettings が複製ではなく同じオブジェクトを指している点に触れていれば満たす","depth":"number はコピーされるので proRetryCount への再代入が defaultRetryCount に影響しない点、または === が true になる点に触れていれば満たす","core_reject":["defaultSettings.maxProjects を 3 と読んでいる","defaultRetryCount を 20 と読んでいる","const なのでプロパティも変更できない、またはエラーになると読んでいる"]}'::jsonb
);

-- ステージ5: 参照が共有されたまま渡される関数を読む（ズレ）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items)
values (
  5,
  '参照が共有されたまま渡される関数を読む',
  'js',
  3,
  'ズレ',
  '// 既定のタグを足したユーザーを返す（元のデータは変更しない想定）
function withDefaultTags(user) {
  const copied = user;
  copied.tags.push("newsletter");
  return copied;
}

const registered = { userId: "u-1024", tags: ["signup"] };
const forMail = withDefaultTags(registered);

console.log(forMail.tags);
console.log(registered.tags);',
  'この関数はコメントに書かれた意図で作られています。意図と実装が食い違っている箇所を挙げ、どのように食い違っているかを、実行するとどうなるかまで含めて説明してください。',
  '食い違っているのは3行目の const copied = user; です。これはオブジェクトを複製しておらず、同じオブジェクトを指す参照に copied という別名を付けただけです。

そのため copied.tags.push("newsletter") は、呼び出し元の registered が持っている配列そのものを書き換えます。出力は2行とも ["signup", "newsletter"] になり、「元のデータは変更しない」という意図は満たされていません。

const で宣言していても防げません。const が禁止するのは変数への再代入だけだからです。',
  '[{"match":["copied","3行目","user","引数"]},{"match":["書き換わ","書き換え","registered","呼び出し元"]},{"match":["参照","複製","コピーではな","別名","同じオブジェクト","共有"]},{"match":["signup","newsletter","2行とも","両方とも"]}]'::jsonb,
  '{"core":"元のオブジェクト（registered）も書き換わってしまうという結論を指していれば満たす","ground":"const copied = user; がコピーではなく同じオブジェクトへの参照であることに触れていれば満たす","depth":"出力が2行とも [\"signup\", \"newsletter\"] になる点に触れていれば満たす","core_reject":["registered.tags は [\"signup\"] のままだと読んでいる","const で宣言しているので変更できない、またはエラーになると読んでいる","関数の引数はコピーして渡されるので呼び出し元は影響を受けないと読んでいる"]}'::jsonb
);

commit;
