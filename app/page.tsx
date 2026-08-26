import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { Mascot } from "@/components/ui/Mascot";
import { IconCheck } from "@/components/ui/icons";
import { CHAPTERS } from "@/lib/stages/chapters";
import { ANSWER_MAX_CHARS, CLEAR_THRESHOLD } from "@/lib/ai/compose";
import {
  Card,
  Chip,
  Container,
  PrimaryCta,
  SecondaryCta,
  Section,
  SectionHead,
} from "@/components/lp/parts";
import { LpHeader } from "@/components/lp/LpHeader";
import { Reveal } from "@/components/lp/Reveal";
import { CodePanel } from "@/components/lp/CodePanel";
import { Demo } from "@/components/lp/Demo";
import { Faq } from "@/components/lp/Faq";
import { IconComment, IconHandover, IconSpark } from "@/components/lp/icons";
import { publicPageMetadata } from "@/lib/seo/site";
import { ChangelogList } from "@/components/changelog/ChangelogList";
import { latestChangelog } from "@/lib/changelog";

/**
 * 検索結果に出る唯一の入口。**title は書かない**（`layout.tsx` の既定値をそのまま使う）。
 *
 * `path` を渡しているのは canonical のため。本番は `ferretcode.com` の他に
 * Vercel が配る `*.vercel.app` でも同じ画面が開くので、宣言が無いと
 * 2つが別ページとして数えられ、評価が割れる。
 *
 * ⚠️ 本文の文言を変えたら `lib/seo/site.ts` の `SITE_DESCRIPTION` も直すこと。
 * 画面とメタ情報が食い違っても**画面上は何も起きない**（気づけるのは検索結果だけ）。
 */
export const metadata: Metadata = publicPageMetadata({ path: "/" });

/*
 * ============================================================================
 * LP（紹介ページ）。tasks/M2 の実装。
 * ============================================================================
 *
 * 置き換えたのは「ロゴとボタン2つだけ」のタイトル画面。**すでに知っている人しか
 * 登録できない状態だった**ので、記事や広告から来た人が「これは自分に必要か」を
 * 判断できるところまで書いてある。
 *
 * オーナー判断（2026-08-22）:
 *   ① `/lp` を別に作らず**このページ（`/`）を LP にする。** 宣伝する URL が1つで済む
 *   ② **年次（新卒〜2年目 / 3年目）を書かない。** 仕様書と需要分析で主軸がずれており、
 *      未解決のまま年次を名乗ると、決まった後に文言を全部書き直すことになる。
 *      代わりに「他人のコードを読む必要がある場面」で条件を示す
 *   ③ **料金は「いまは無料」だけ。** 将来の価格表も、有料化の予告も置かない
 *      （課金は D1・D2 の後。売っていないものの値段を書かない）
 *   ④ **スクリーンショットを貼らず、本物と同じ部品で画面を組み直す**
 *      （理由は components/lp/CodePanel.tsx に書いてある）
 *
 * 書くときの制約:
 *   - **ネガティブワード禁止**（CLAUDE.md）。「あなたは○○ができていない」という
 *     煽り方をしない。この節の言葉づかいは採点プロンプトと同じ方針で揃えている
 *   - **できていない機能を「できる」と書かない。** 段位・認定証・共有・振り返り画面は未実装
 *   - **新しい色を作らない**（`app/globals.css` のトークンだけ）。暗い配色は自動で追従する
 *
 * 文章はこのファイルにまとめてある。M1（技術記事）と文言を揃えるとき、
 * 探す場所が1か所で済むようにするため。
 */

// ---------------------------------------------------------------------------
// 載せる文章とデータ
// ---------------------------------------------------------------------------

/**
 * LP で1周ぶん見せる問題。
 *
 * **100問のどれでもない、この LP のために書いた1問。** 実際の問題を載せると、
 * そのステージを解く前に答えが分かってしまう（タスク票の注意書き）。
 * 題材は「カートの小計」で、実務由来にする方針（`ideas/問題作成ガイド.md`）に合わせた。
 *
 * 点数は「こういう形で返る」を示すための例。**クリアかどうかだけは
 * `lib/ai/compose.ts` のしきい値から出している**（数字を画面に焼くと、
 * 閾値を変えたときに LP だけ古い判定を出し続ける）。
 * 内訳は実際に出る組み合わせに合わせてあり、キーワード18点（4スロット中3つ）＋
 * AI 68点（core と ground が full・depth が none）で 86点になる。
 */
const DEMO = {
  language: "js",
  /** パネル左上に出す言語名。本物の問題画面は DB の値をそのまま大文字にしている */
  languageLabel: "JAVASCRIPT",
  /*
   * **1行を30字までに収めてある。** コードパネルは横スクロールできる作りなので
   * 溢れても壊れないが、右端が切れた状態が最初に見えると「表示が崩れている」と
   * 受け取られる。**幅375pxでも全部見える**のがこの上限の根拠で、
   * `reduce` の1行版（50字）は 1024px 前後のノートパソコンで切れた。
   *
   * 読み取ってほしいことは同じ（合計を数え終わった後に配列へ足しても数字は動かない）。
   */
  code: `const cart = [1200, 800, 500];
let total = 0;
for (const price of cart) {
  total += price;
}
cart.push(3000);
console.log(total);`,
  question:
    "最後の行では何が出力されますか。そう読めた理由もあわせて説明してください。",
  answer:
    "2500 が出力されます。total は for のところで足し終わっていて、そのあと cart に 3000 を足しても、total が数え直されることはないからです。",
  praise:
    "計算が終わる順番を根拠にできています。push より前だと言い切れているのが要点です。",
  nextFocus:
    "total に入っているのは数え終えた結果で、cart とはつながっていません。そこまで書けると、同じ読み方が他でも通じます。",
  scores: [
    { label: "スコア", value: 86, max: 100, accent: "bg-brand" },
    { label: "キーワード", value: 18, max: 20, accent: "bg-brand-soft" },
    { label: "AI 採点", value: 68, max: 80, accent: "bg-brand-soft" },
  ],
} as const;

/**
 * なぜ読む力なのか。**場面の記述に留める**（読めていない人を指さない）。
 *
 * 見出しは体言止め。日本語の LP は機能カードの見出しを名詞句で置くのが普通で、
 * 「〜する」で揃えると全部が同じ調子になる。本文も1文目を短く切ってある。
 */
const SCENES = [
  {
    Icon: IconSpark,
    title: "AI が書いたコードのレビュー",
    body: "動くように見えるコードが、前より速く出てくる。通していいかを決めるのは、読んだ人です。",
  },
  {
    Icon: IconComment,
    title: "PR に添えるコメント",
    body: "「ここ、null が来ませんか」の一言が出るかどうか。どこまで読めたかがそのまま出ます。",
  },
  {
    Icon: IconHandover,
    title: "引き継いだコードの修正",
    body: "書いた人はもういない。100行を読むところから仕事が始まります。",
  },
];

/**
 * 読解型6種。**定義は `ideas/問題構成案.md` v3 の凡例をそのまま噛み砕いたもの。**
 * ここを勝手に言い換えると、問題の作り方（`rubric_items` の `depth`）と食い違う。
 */
const READING_TYPES = [
  {
    name: "トレース",
    body: "実行したら何が起きるか。出力・戻り値・順番を追う",
  },
  { name: "意図", body: "なぜこの書き方なのか。書いた人の狙いを言葉にする" },
  {
    name: "ズレ",
    body: "やりたかったことと実際の動きが、噛み合っていない場所",
  },
  { name: "影響", body: "ここを変えると、どこまで波が届くか" },
  { name: "命名", body: "名前とコメントだけで、その関数の役目を当てる" },
  { name: "仕様", body: "テストと型定義から、守るべき約束を読み取る" },
];

/** 採点のしくみ。**すべて実装済みのものだけ**を書く */
const SCORING_POINTS = [
  {
    title: "点数だけで終わらせない",
    body: "「よかったところ」と「つぎの一歩」を分けて返します。どこが読めていたかが、文章で残ります。",
  },
  {
    title: "AI の言い分は裏を取る",
    body: "「コードのここに書いてあります」という引用は、実物と突き合わせてから点にします。合わなければ数えません。",
  },
  {
    title: "同じ回答なら、同じ点数",
    body: "採点した回答は取り置いてあります。同じ文なら、同じ点が返ります。",
  },
  {
    title: "おかしいと思ったら送れる",
    body: "採点への異議をリザルト画面から送れます。届いた内容は、基準の調整にそのまま使います。",
  },
];

const FAQ = [
  {
    q: "お金はかかりますか？",
    a: "いまは全機能を無料で使えます。カードの登録も要りません。",
  },
  {
    q: "どの言語のコードを読みますか？",
    a: "JavaScript が80問、TypeScript が20問。フレームワークは扱いません（React・Next.js は別に用意する予定です）。",
  },
  {
    q: "1問にどのくらいかかりますか？",
    a: "コードは10行前後。読んで書いて、返ってくるまで数分です。1日1問でも記録は積もります。",
  },
  {
    q: "回答は日本語でいいのですか？",
    a: "はい。選択肢はありません。自分の言葉で説明すること自体が中身なので、そこは変えていません。10文字から書けます。",
  },
  {
    q: "コードを書く課題もありますか？",
    a: "ありません。読む側だけに絞っています。書く練習ができる場所はすでに多いので、並べて使ってください。",
  },
  {
    q: "やめたいときは？",
    a: "「せってい」から退会できます。ログイン情報と回答の記録も、一緒に消えます。",
  },
];

// ---------------------------------------------------------------------------
// 導出する値（数字をここに焼かない）
// ---------------------------------------------------------------------------

/** 全ステージ数。章の定義（`lib/stages/chapters.ts`）の末尾から出す */
const TOTAL_STAGES = CHAPTERS[CHAPTERS.length - 1].to;

/**
 * TypeScript の章が始まる番号。
 *
 * `ideas/問題構成案.md` v3 が JS 1〜80 / TS 81〜100 と決めており、
 * 章の区切り（第11章「なぜ型があるのか」）と一致している。
 * 章の定義側にこの区別を持たせていないので、境目だけをここで名指しする。
 */
const TS_FIRST_CHAPTER = 11;

/**
 * 言語ごとの章の束。**章の定義（`lib/stages/chapters.ts`）から組み立てる。**
 * 問数も範囲もここで数えているので、章が増減しても LP だけ古くならない。
 */
const LANGUAGE_GROUPS = [
  {
    label: "JavaScript",
    chapters: CHAPTERS.filter((c) => c.no < TS_FIRST_CHAPTER),
  },
  {
    label: "TypeScript",
    chapters: CHAPTERS.filter((c) => c.no >= TS_FIRST_CHAPTER),
  },
].map((g) => {
  const from = g.chapters[0].from;
  const to = g.chapters[g.chapters.length - 1].to;
  return { ...g, from, to, count: to - from + 1 };
});

// ---------------------------------------------------------------------------
// ログイン済みの人の扱い
// ---------------------------------------------------------------------------

/**
 * ログイン済みかどうか。**ステージ画面へ送るためだけに使う。**
 *
 * **Cookie が1つも無いときは Supabase に問い合わせない。** セッションは Cookie に
 * 載っているので、無ければ未ログインで確定する。LP は記事や広告から人が来る
 * いちばん来訪の多いページで、その大半は未ログインなので、
 * 全員に Supabase への往復を待たせると表示がまるごとそのぶん遅れる。
 *
 * Cookie がある場合は**中身を信じず `getUser()` で確かめる**（CLAUDE.md の方針）。
 * `getSession()` は Cookie を読むだけなので、期限切れも偽造も見抜けない。
 * ここで判定を誤っても行き先は `/stages` で、あちらは `proxy.ts` と
 * ページ自身のガードで弾くので、抜け道にはならない。
 */
async function isSignedIn(): Promise<boolean> {
  const store = await cookies();
  const hasSessionCookie = store
    .getAll()
    // @supabase/ssr の既定の名前。長いときは `.0` `.1` と分割される
    .some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  if (!hasSessionCookie) return false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

// ---------------------------------------------------------------------------
// ページ
// ---------------------------------------------------------------------------

export default async function Home() {
  if (await isSignedIn()) redirect("/stages");

  return (
    <div className="flex min-h-screen flex-col">
      <LpHeader />

      <main className="flex-1">
        {/* ══ 主役 ══════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          {/*
            上からアンバーの光を落とし、細かい点を敷く。
            どちらもトークンの色を参照しているので、暗い配色でもそのまま成立する
            （brand-tint は暗い側では半透明のアンバーに差し替わる）。
            装飾なので aria からは外す。
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_-10%,var(--color-brand-tint),transparent_70%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)] opacity-60"
          />

          <Container className="relative grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-22">
            <div className="animate-rise flex flex-col items-start gap-6">
              <Chip>コードリーディング特化の学習サイト</Chip>

              {/*
                見出しは1つだけ。ロゴと惹句を同じ h1 に入れてあるので、
                読み上げでは「Ferret 他人のコードが読める、AI時代のエンジニアに。」になる
              */}
              <h1 className="flex flex-col gap-4">
                {/*
                  ロゴの行。**字間を詰めて大きくしてある**（2026-08-22・オーナー指摘）。
                  12px + 字間 0.42em では、すぐ上のチップ（11px だが下地があるぶん重い）に
                  負けて、ブランド名ではなく小さな注記に見えていた。
                  20px まで上げ、字間は 0.26em に詰めて塊として見えるようにしている。
                */}
                <span className="text-xl font-extrabold tracking-[0.26em] text-brand-deep">
                  Ferret
                </span>
                {/*
                  **節ごとに inline-block で包む。** 日本語はどこでも改行できるので、
                  素のままだと画面幅しだいで「読め / る、」のように語の途中で折れる
                  （タイトル画面の補足文で同じ手当てをしている）。塊にしておけば、
                  入る幅が無いときは節ごと次の行へ落ちる。
                  改行を跨いだ JSX の空白は消えるので、2つの間に隙間は出ない。

                  大きさは**その幅でいちばん狭くなる列**に合わせてある。1文字が 1em の
                  全角11文字（`tracking-tight` で約10.7em）なので、ここを超えると
                  inline-block が折れずに溢れる。lg で一度小さくなるのは、
                  そこから2カラムになって左の列が 463px まで狭まるため。
                  360px を切る画面（折りたたみ端末の外側など）だけもう一段下げている。
                */}
                <span className="text-[1.7rem] leading-[1.4] font-extrabold tracking-tight max-[359px]:text-[1.55rem] sm:text-[2.4rem] md:text-[2.8rem] lg:text-[2.6rem] xl:text-[2.9rem]">
                  <span className="inline-block">他人のコードが読める、</span>
                  <span className="inline-block">AI時代のエンジニアに。</span>
                </span>
              </h1>

              <p className="max-w-xl text-[15px] leading-loose font-medium text-ink sm:text-base">
                {/* **1つの式にまとめてある。** JSX は行をまたいだ文字列を半角空白でつなぐので、
                    素の文章として書くと prettier が折った位置に隙間が入る
                    （実測: 「返します。 ステージ1」）。日本語では句点の後の空白が目立つ */}
                {`コードを読んで、日本語で説明する。AI がその場で採点して、読めていたところを返します。ステージ1から、全${TOTAL_STAGES}問。`}
              </p>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <PrimaryCta href="/register">はじめる</PrimaryCta>
                <SecondaryCta href="/login">
                  アカウントをお持ちの方
                </SecondaryCta>
              </div>

              {/*
                ボタンの下に「無料で使えます / カード登録なし / JavaScript・TypeScript」の
                3点を並べていたが、**オーナー判断で外した**（2026-08-22）。
                同じことは §06「先に伝えておくこと」とよくある質問に書いてあり、
                主役では惹句とボタンに視線を集めたいため。
              */}
            </div>

            {/* 主役の右。**本物の問題画面と同じ部品**でコードと設問を出す */}
            {/* min-w-0 が無いと、grid の列が中のコードの横幅に引っ張られて画面から溢れる */}
            <div className="animate-rise relative w-full min-w-0">
              <Card className="flex flex-col gap-4 p-4 sm:p-5">
                <CodePanel
                  label={DEMO.languageLabel}
                  hint="読んでみよう"
                  code={DEMO.code}
                  language={DEMO.language}
                />
                {/*
                  マスコットと設問を**同じ行に並べる**（重ねない）。
                  絶対配置でカードの外へ覗かせると、狭い画面で設問の文字に重なる。

                  絵は `character_nobg.png`（neutral）だけを使う ── happy / thinking には
                  透かしが焼き込まれていて、暗い面やアンバーの面に載せると出る（design/README.md）。
                */}
                <div className="flex items-center gap-3 px-1 pb-1">
                  <Mascot
                    alt="フェレット"
                    priority
                    className="w-14 shrink-0 animate-float drop-shadow-[0_8px_18px_rgba(74,59,40,0.18)] sm:w-16"
                  />
                  <p className="text-sm leading-relaxed font-extrabold">
                    {DEMO.question}
                  </p>
                </div>
              </Card>
            </div>
          </Container>
        </section>

        {/* ══ 更新情報 ══════════════════════════════════════════════ */}
        {/*
          **主役のすぐ下。番号を振らない。**

          最初は末尾（節08）に置いていたが、**そこまで読む人はほとんどいない**
          （オーナー指摘・2026-08-26）。ここで伝えたいのは「いまも動いているアプリだ」
          ということで、それは**最初の画面で分からないと意味がない。**

          見出しは「更新情報」だけ。惹句（「いま何が新しいか」「これからも変わっていきます」）は
          外した ── 更新そのものが動いている証拠なので、説明を足すほど宣伝に見える。

          **細い帯にしてあるのは、主役の惹句とボタンを押し下げないため。**
          日付・種類・見出しの1行だけを並べ、本文は `/changelog` に置く。
        */}
        <section id="changelog" className="border-y-2 border-line bg-bg-deep">
          <Container className="flex flex-col gap-3.5 py-7 sm:py-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[11px] font-extrabold tracking-[0.16em] text-muted">
                更新情報
              </h2>
              <Link
                href="/changelog"
                className="rounded-md text-[12px] font-extrabold whitespace-nowrap text-brand-deep hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep"
              >
                すべて見る →
              </Link>
            </div>
            <ChangelogList entries={latestChangelog()} variant="row" />
          </Container>
        </section>

        {/* ══ 01 なぜ読む力なのか ═══════════════════════════════════ */}
        <Section tone="deep">
          <SectionHead
            index="01"
            label="なぜ「読む」なのか"
            title="AI時代に求められるのは、コードを書く力より読む力。"
            lead="AI の発達によって、エンジニアに求められる力が変わってきました。出てきたコードの良し悪しを判断できる人こそ、これからの時代に必要になります。"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-3 lg:gap-6">
            {SCENES.map(({ Icon, title, body }) => (
              <Card key={title} className="flex flex-col gap-4 p-6">
                <span className="grid size-11 place-items-center rounded-2xl bg-brand-tint text-brand-deep">
                  <Icon size={22} />
                </span>
                <h3 className="text-[15px] leading-relaxed font-extrabold">
                  {title}
                </h3>
                <p className="text-[13px] leading-loose font-medium text-ink">
                  {body}
                </p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ══ 02 1問の流れ ═════════════════════════════════════════ */}
        <Section id="flow">
          <SectionHead
            index="02"
            label="使い方"
            title="やることは3つだけ"
            lead="上のコードを、最後まで進めてみます。"
          />
          <div className="mt-10">
            <Demo
              code={DEMO.code}
              language={DEMO.language}
              languageLabel={DEMO.languageLabel}
              question={DEMO.question}
              answer={DEMO.answer}
              answerMaxChars={ANSWER_MAX_CHARS}
              praise={DEMO.praise}
              nextFocus={DEMO.nextFocus}
              score={[...DEMO.scores]}
              cleared={DEMO.scores[0].value >= CLEAR_THRESHOLD}
            />
          </div>
        </Section>

        {/* ══ 03 6つの読み方 ═══════════════════════════════════════ */}
        <Section id="types" tone="deep">
          <SectionHead
            index="03"
            label="問題"
            title="読み方は6種類"
            lead="「読む」と一口に言っても、問われることは違います。100問はこの6つを混ぜて並べています。"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {READING_TYPES.map((t, i) => (
              <Card key={t.name} className="flex flex-col gap-3 p-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] font-bold text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xl font-extrabold tracking-wide text-brand-deep">
                    {t.name}
                  </span>
                </div>
                <p className="text-[13px] leading-loose font-medium text-ink">
                  {t.body}
                </p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ══ 04 100問の道筋 ═══════════════════════════════════════ */}
        <Section>
          <SectionHead
            index="04"
            label="ステージ"
            title={`全${TOTAL_STAGES}問、${CHAPTERS.length}章`}
            lead="値の正体から、現場の型定義まで。読む順番はこちらで用意しました。"
          />

          <div className="mt-8 flex flex-wrap gap-2.5">
            <Chip>順に解放</Chip>
            <Chip>連続日数</Chip>
            <Chip>すすみぐあいが残る</Chip>
          </div>

          {/*
            章の一覧。**`lib/stages/chapters.ts` をそのまま描いている。**
            書き写すと、章を1つ増やしたときに LP だけ古いままになる。
          */}
          <div className="mt-10 flex flex-col gap-9">
            {LANGUAGE_GROUPS.map((g) => (
              <div key={g.label} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-extrabold tracking-wide text-brand-deep">
                    {g.label} ・ {g.count}問
                  </span>
                  <span
                    aria-hidden
                    className="h-[2px] flex-1 rounded-full bg-line"
                  />
                  <span className="font-mono text-[11px] font-bold whitespace-nowrap text-muted">
                    STAGE {g.from}–{g.to}
                  </span>
                </div>
                <ol className="grid gap-3 sm:grid-cols-2 lg:gap-x-5">
                  {g.chapters.map((c) => (
                    <li
                      key={c.no}
                      className="flex items-baseline gap-3.5 rounded-2xl border-2 border-line bg-panel px-4 py-3.5"
                    >
                      <span className="font-mono text-[11px] font-bold text-brand-deep">
                        {String(c.no).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-[14px] font-extrabold">
                        {c.title}
                      </span>
                      <span className="font-mono text-[11px] font-bold whitespace-nowrap text-muted">
                        {c.from}–{c.to}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Section>

        {/* ══ 05 採点のしくみ ══════════════════════════════════════ */}
        <Section tone="deep">
          <SectionHead
            index="05"
            label="採点"
            title="なぜその点なのかが分かる"
            lead="自由記述の AI 採点は、放っておくと理由の見えない点数になります。そうならない作りを4つ入れました。"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:gap-6">
            {SCORING_POINTS.map((p) => (
              <Card key={p.title} className="flex gap-4 p-6">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand text-white">
                  <IconCheck size={13} />
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-extrabold">{p.title}</h3>
                  <p className="text-[13px] leading-loose font-medium text-ink">
                    {p.body}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        {/* ══ 06 注意点 ══════════════════════════════════════════ */}
        <Section>
          <SectionHead index="06" label="ご利用にあたって" title="注意点" />
          <Card className="mt-9 flex max-w-3xl flex-col gap-4 p-7 sm:p-9">
            <ul className="flex flex-col gap-4">
              {[
                "いまは全機能を無料で使えます。カードの登録は要りません。",
                "回答は採点のため OpenAI に送信されます。個人情報や、公開できないコードは書かないでください。",
                "読む専門です。コードを書く課題はありません。",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span className="text-[14px] leading-loose font-medium">
                    {t}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        {/* ══ 07 よくある質問 ══════════════════════════════════════ */}
        <Section id="faq" tone="deep">
          <SectionHead
            index="07"
            label="質問"
            title="よくある質問"
            align="center"
          />
          <div className="mx-auto mt-10 max-w-3xl">
            <Faq items={FAQ} />
          </div>
        </Section>

        {/* ══ 最後の案内 ═══════════════════════════════════════════ */}
        <Section>
          <div className="flex flex-col items-center gap-8 rounded-[2rem] border-2 border-b-5 border-line bg-brand-tint px-6 py-14 text-center sm:px-12">
            <Mascot
              alt=""
              className="w-28 animate-float drop-shadow-[0_10px_24px_rgba(74,59,40,0.18)] sm:w-32"
            />
            <Reveal className="flex flex-col gap-4">
              <h2 className="text-2xl leading-snug font-extrabold sm:text-4xl">
                <span className="inline-block">まずは1問、</span>
                <span className="inline-block">読んでみてください。</span>
              </h2>
              <p className="text-[15px] leading-loose font-medium">
                ステージ1は10行のコードです。読んで、思ったことを書くだけ。
              </p>
            </Reveal>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <PrimaryCta href="/register">無料で始める</PrimaryCta>
              <SecondaryCta href="/login">ログイン</SecondaryCta>
            </div>
          </div>
        </Section>
      </main>

      {/* 法務文書への導線は既存の部品をそのまま置く（C2 で作ってある） */}
      {/* LegalFooter 自身が <footer> を出すので、ここは div で囲う（footer の入れ子は仕様違反） */}
      <div className="border-t-2 border-line bg-bg-deep">
        <Container className="flex flex-col items-center gap-3 pt-10">
          <span className="flex items-center gap-2">
            <Mascot className="w-6" />
            <span className="font-extrabold tracking-wide">Ferret</span>
          </span>
          <p className="text-center text-xs font-bold text-muted">
            他人のコードが読める、AI時代のエンジニアに。
          </p>
        </Container>
        <LegalFooter />
      </div>
    </div>
  );
}
