-- ステージ49〜52・54 投入（53 は A1 で投入済みのため含まない）
-- 53 の SQL は problems/stage-015-053-059-078.sql にある。両方流すと order が重複する

begin;

-- ステージ49: class 構文 ─ constructor と this（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  49,
  'class 構文 ─ constructor と this',
  'js',
  3,
  'トレース',
  'class Notifier {
  constructor(channel) {
    this.channel = channel;
    this.sent = 0;
  }

  send(message) {
    this.sent = this.sent + 1;
    return `[${this.channel}] ${message}`;
  }
}

const notifier = new Notifier("slack");

console.log(notifier.send("開始"));

const send = notifier.send;
console.log(send("完了"));',
  'このコードを実行すると何が起きますか。画面に出る内容も含めて説明してください。',
  '2回目の呼び出しで TypeError が発生し、そこで止まります。

this が何を指すかは呼び出し方で決まり、notifier.send(...) のようにドットの左を書いた形で呼んだときだけ notifier になります。変数に入れてから send(...) と呼ぶと左側が無いので this が定まらず、this.sent を読もうとした時点で落ちます。

1回目は [slack] 開始 が出て、sent は 1 になっています。',
  '[{"match":["this","変数に入れ","send"]},{"match":["TypeError","落ち","止まり"]},{"match":["notifier.send","ドット","呼び出し方"]},{"match":["slack","開始","sent"]}]'::jsonb,
  '{"core":"メソッドを変数に入れて呼ぶと this が定まらず実行時エラーになるという結論を指していれば満たす","depth":"1回目は [slack] 開始 が出て sent が 1 になっている点、または this.sent を読む時点で落ちる点に触れていれば満たす","ground":"notifier.send(...) の形で呼んだときだけ this が notifier になる点に触れていれば満たす","core_reject":["2回目も [slack] 完了 が出ると読んでいる","1回目のところで実行時エラーになると読んでいる","変数に入れても notifier に紐づいたままだと読んでいる"]}'::jsonb,
  'class は、同じ形のオブジェクトを作るための型紙です。new で作ると constructor が走り、this.名前 = 値 で個々の値を持たせます。

this が何を指すかは、書かれた場所ではなく呼ばれ方で決まります。obj.method() の形で呼ぶと obj になります。

class の中身は自動的に厳格な扱いになり、指すものが決まらない場合は undefined のままになります。'
);

-- ステージ50: メソッドとゲッター / セッター（意図）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  50,
  'メソッドとゲッター / セッター',
  'js',
  4,
  '意図',
  'class Stock {
  #onHand;
  reserved = 0;

  constructor(onHand) {
    this.#onHand = onHand;
  }

  get available() {
    return Math.max(this.#onHand - this.reserved, 0);
  }

  set onHand(value) {
    if (value < 0) {
      throw new Error("在庫数に負の数は入れられません");
    }
    this.#onHand = value;
  }
}

const stock = new Stock(10);
stock.reserved = 3;',
  'このクラスの外から値を読み書きする部分には、単純な受け渡しではない仕組みが入っています。書いた人がなぜこの形を選んだのか、その意図を説明してください。',
  '読み書きの見た目をふつうのプロパティのまま保ったうえで、中に計算と検査を挟むためです。

available は保持している値ではなく、毎回そのときの数から計算した結果です。それでも外からは stock.available と書くだけで済み、中が計算かどうかを気にしなくてよくなります。

onHand のほうは、#onHand を直接触らせずに代入の形のまま検査を通すためです。負の数が入りそうなときはその場で止められます。どちらも、外から見た書き方を変えないまま中の作りを差し替えられる形になっています。',
  '[{"match":["available","onHand"]},{"match":["プロパティのよう","プロパティのまま","同じ書き方"]},{"match":["毎回","計算","検査","負の数"]},{"match":["#onHand","差し替え","直接触"]}]'::jsonb,
  '{"core":"見た目をふつうのプロパティのまま保って中に計算や検査を挟むという意図を指していれば満たす","depth":"#onHand を直接触らせず検査を通らない代入を防いでいる点、または外から見た書き方を変えないまま中の作りを差し替えられる点に触れていれば満たす","ground":"available が保持している値ではなく毎回の計算結果である点に触れていれば満たす","core_reject":["処理を速くするために選んでいると読んでいる","available が計算せずに保持した値を返していると読んでいる","onHand を読み取り専用にするためだと読んでいる"]}'::jsonb,
  'class の中で # から始まる名前を書くと、そのクラスの外からは触れない値になります。

get 名前() { … } を書くと、obj.名前 と読んだときにその中身が走ります。set 名前(値) { … } を書くと、obj.名前 = 値 と書いたときにその中身が走ります。使う側から見れば、ふつうのプロパティと区別が付きません。

Math.max(a, b) は大きいほうを返します。throw new Error(…) は例外を発生させます。'
);

-- ステージ51: 継承(extends)と super の呼び出し順、static メンバ（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  51,
  '継承(extends)と super の呼び出し順、static メンバ',
  'js',
  4,
  'トレース',
  'class Validator {
  static created = 0;

  constructor(field) {
    this.field = field;
    this.label = this.describe();
    Validator.created = Validator.created + 1;
  }

  describe() {
    return `${this.field} の検査`;
  }
}

class RangeValidator extends Validator {
  max = 100;

  constructor(field) {
    super(field);
  }

  describe() {
    return `${this.field} を ${this.max} 以下に`;
  }
}

const v = new RangeValidator("数量");

console.log(v.label);
console.log(v.max);
console.log(Validator.created, RangeValidator.created);',
  '3つの console.log でそれぞれ何が出力されますか。1つ目がその結果になる理由も説明してください。',
  '1つ目は「数量 を undefined 以下に」になります。

this.label = this.describe() が走るのは親の constructor の中で、そこで呼ばれる describe は引き継いだ側のものです。ところが引き継いだ側の max が用意されるのは super(field) が戻ってきたあとなので、この時点ではまだ入っていません。

そのあと max は 100 になるので、2つ目の出力は 100 です。static はクラス自体が持つ値で引き継いだ側からも同じものが見えるため、3つ目は 1 1 になります。',
  '[{"match":["max","label"]},{"match":["undefined","まだ入っていな","用意される前"]},{"match":["super","親の constructor","戻ってきた"]},{"match":["100","created","1 1"]}]'::jsonb,
  '{"core":"1つ目の label に undefined が入るという結論を指していれば満たす","depth":"そのあと max が 100 になる点、または static が引き継がれて3つ目が 1 1 になる点に触れていれば満たす","ground":"親の constructor が走る時点では引き継いだ側の max がまだ用意されていない点に触れていれば満たす","core_reject":["1つ目が「数量 を 100 以下に」になると読んでいる","1つ目が「数量 の検査」になると読んでいる","3つ目の RangeValidator.created が 0 になると読んでいる"]}'::jsonb,
  'class B extends A と書くと、B は A の中身を引き継ぎます。B の constructor では、this を使う前に super(…) を呼ぶ決まりです。

super(…) の中では A の constructor が走ります。B で書いた 名前 = 値 の用意は、super(…) が終わってから行われます。

static 名前 = 値 はそのクラス自身に付く値で、引き継いだ側から見ても同じ1つです。'
);

-- ステージ52: プロトタイプチェーンと this の束縛 ─ そのメソッドはどこから来たか（トレース）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  52,
  'プロトタイプチェーンと this の束縛 ─ そのメソッドはどこから来たか',
  'js',
  5,
  'トレース',
  'class Reporter {
  constructor(prefix) {
    this.prefix = prefix;
    this.bound = this.format.bind(this);
  }

  format(text) {
    return `${this.prefix}: ${text}`;
  }
}

const reporter = new Reporter("INFO");

console.log(Object.keys(reporter));
console.log(reporter.hasOwnProperty("format"), "format" in reporter);
console.log(reporter.bound("完了"));',
  '3つの console.log でそれぞれ何が出力されますか。2つ目がその結果になる理由も説明してください。',
  '2つ目は false true になります。

format は reporter 自身の持ち物ではなく、型紙の側に置かれています。hasOwnProperty は自分が直接持っているかだけを見るので false になり、探しに行った先まで見る "format" in reporter のほうは true になります。

1つ目の Object.keys も自分が直接持っている名前だけを返すので [ ''prefix'', ''bound'' ] です。3つ目は INFO: 完了 になります。bound は bind で this を固定してあるので、変数として取り出しても prefix を読めるためです。',
  '[{"match":["format","reporter 自身"]},{"match":["false","持ち物ではな"]},{"match":["hasOwnProperty","だけを見る","先まで見る"]},{"match":["prefix","bound","bind","INFO"]}]'::jsonb,
  '{"core":"format が reporter 自身の持ち物ではなく型紙の側にあるという結論を指していれば満たす","depth":"1つ目の Object.keys が prefix と bound だけを返す点、または bind で固定した bound は取り出しても動く点に触れていれば満たす","ground":"hasOwnProperty が自分の持ち物だけを見るので false になる点に触れていれば満たす","core_reject":["2つ目が true true になると読んでいる","1つ目の Object.keys に format も含まれると読んでいる","3つ目で this が外れて実行時エラーになると読んでいる"]}'::jsonb,
  'class で書いたメソッドは、作られた個々のオブジェクトではなくその型紙の側に置かれます。個々のオブジェクトは、自分に無い名前を求められると型紙のほうへ探しに行きます。

名前があるかを調べる書き方には2種類あります。自分が直接持っているものに限って調べるものと、探しに行った先まで含めて調べるものです。

関数.bind(obj) は this を obj に固定した新しい関数を返します。Object.keys(obj) は自分が直接持っている名前を返します。'
);

-- ステージ54〜54 投入
-- 出典: problems/stage-049-054.data.mjs / 設計: problems/stage-049-054.md
-- **投入済みの実データから生成したもので、手書きしていない**
-- id は書かない（GENERATED ALWAYS AS IDENTITY）

begin;

-- ステージ54: 影響範囲を読む ─ このメソッドを変えたらどこが壊れるか（影響）
insert into public.problems
  ("order", title, language, difficulty, reading_type, code, question, model_answer, keywords, rubric_items, prerequisite)
values (
  54,
  '影響範囲を読む ─ このメソッドを変えたらどこが壊れるか',
  'js',
  4,
  '影響',
  'class Invoice {
  constructor(lines) {
    this.lines = lines;
  }

  total() {
    return this.lines.reduce((sum, line) => sum + line.amount, 0);
  }

  summary() {
    return `${this.lines.length}件 / ${this.total()} 円`;
  }

  isOverBudget(limit) {
    return this.total() > limit;
  }

  toCsvRow() {
    return [this.lines.length, this.total()].join(",");
  }
}',
  'total() を、3桁ごとにカンマを入れた文字列（たとえば 12,000）を返すように変えることになりました。この変更でどこが壊れますか。壊れる箇所と、その理由を挙げてください。',
  'isOverBudget が壊れます。

this.total() > limit が文字と数の比べ方になり、"12,000" を数として読み直そうとすると NaN になります。NaN はどちらの向きで比べても成り立たないので、予算を超えていても超過を検出できなくなります。しかも例外にならないので、動かしても気づけません。

toCsvRow も壊れます。値の中に区切りと同じ記号が入るため、1行の列が1つ増えてしまいます。

summary のほうは文字に埋め込むだけなので、読みやすくなるだけで壊れません。',
  '[{"match":["isOverBudget","比較","予算"]},{"match":["検出できな","超過を","成り立たな"]},{"match":["NaN","読み直"]},{"match":["toCsvRow","列が1つ","区切り","summary"]}]'::jsonb,
  '{"core":"isOverBudget の比較が成り立たなくなり超過を検出できなくなるという結論を指していれば満たす","depth":"toCsvRow で値の中の記号が列を1つ増やす点、または summary は埋め込むだけなので壊れない点に触れていれば満たす","ground":"文字と数を > で比べると数として読めず比較が成り立たない点に触れていれば満たす","core_reject":["summary が壊れると読んでいる","変更しても実行時エラーになるだけだと読んでいる","total を呼んでいる箇所はすべて同じように壊れると読んでいる"]}'::jsonb,
  '> や < で文字と数を比べると、文字のほうを数に直してから比べます。数と見なせない記号が混じっていると、その結果は特別な値になり、どんな比べ方でも成り立ちません。

配列.join(",") は要素をカンマでつないだ1本の文字にします。要素の中にカンマが入っていても、そのまま並べます。

同じメソッドを複数の場所から呼んでいるときは、呼んでいる側それぞれで何が起きるかを見ます。'
);

commit;
