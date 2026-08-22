import Link from "next/link";
import { IconArrowRight } from "@/components/lp/icons";

/*
 * LP の骨格になる部品。**新しい色は作らない**（app/globals.css のトークンだけを使う）。
 *
 * ここに切り出してあるのは「余白と字の大きさ」を1か所に閉じ込めるため。
 * LP は節が9つあり、同じ見出しを9回書くと必ずどこかで大きさがずれる。
 * 文章そのものは app/page.tsx にまとめてあり、この部品側には言葉を置かない。
 */

/** 本文の共通の横幅。節をまたいで左右の端が揃うのはこの値のおかげ */
const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`${CONTAINER} ${className ?? ""}`}>{children}</div>;
}

/**
 * 節。`tone` で下地を切り替えて帯を作る。
 *
 * 明るい配色では bg(#fdf8ec) と bg-deep(#f6efdd) の差が僅かで、
 * 「境目がある」とだけ分かる強さにしてある。線で区切るより、
 * 面で区切るほうが読み物として静かになる。
 */
export function Section({
  id,
  tone = "plain",
  className,
  children,
}: {
  id?: string;
  tone?: "plain" | "deep";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt は上部バーが sticky なので、# で飛んだときに見出しが隠れないように取る余白
      className={`scroll-mt-20 py-18 sm:py-22 lg:py-28 ${
        tone === "deep" ? "bg-bg-deep" : "bg-bg"
      } ${className ?? ""}`}
    >
      <Container>{children}</Container>
    </section>
  );
}

/**
 * 節の見出し。番号 → 見出し → 補足の3段。
 *
 * 番号を等幅で小さく置いているのは、9つの節が「順に読むもの」だと伝えるため。
 * 章立てのある読み物に見えると、途中で離脱しても戻ってきやすい。
 */
export function SectionHead({
  index,
  label,
  title,
  lead,
  align = "left",
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    /*
     * `animate-rise` + `data-reveal` で、スクロールして入ってきたときに
     * 節の頭がせり上がる（定義は app/globals.css）。**LP だけで使う。**
     * 見出しだけに絞ってあり、カードや本文には配っていない ──
     * 動きを増やすほど「作り物」に見えるので、節の切り替わりだけを示す。
     */
    <div
      data-reveal
      className={`animate-rise flex flex-col gap-4 ${
        align === "center" ? "items-center text-center" : "items-start"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-brand-deep">
          {index}
        </span>
        <span className="h-[2px] w-6 rounded-full bg-brand-soft" />
        <span className="text-[11px] font-extrabold tracking-[0.16em] text-muted">
          {label}
        </span>
      </span>
      {/*
        日本語はどこでも改行できるので、放っておくと狭い画面で最後の1〜2文字だけが
        次の行に落ちる（実測: 「6つの読み / 方。」）。
        - `text-balance` … 行の長さを揃える。Chrome 114 / Safari 17.4 以降
        - `word-break: auto-phrase` … 文節の切れ目で折る。いまは Chrome だけ
        どちらも**解釈できないブラウザは無視するだけ**なので、当てておいて損がない。
        Tailwind に auto-phrase の短縮名は無いので直接書いている。
      */}
      <h2 className="text-[1.55rem] leading-[1.45] font-extrabold tracking-tight text-balance [word-break:auto-phrase] sm:text-4xl sm:leading-[1.35]">
        {title}
      </h2>
      {lead ? (
        <p
          className={`text-[15px] leading-loose font-medium text-ink ${
            align === "center" ? "max-w-2xl" : "max-w-3xl"
          }`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 押し込みボタン（design/README.md の「下辺が濃い」パターン）。
 *
 * 見た目の指定をタイトル画面から写さずここに寄せてある。LP には同じボタンが
 * 3か所（上部バー・主役・末尾）出るので、写すと必ずどこかが取り残される。
 */
/*
 * `focus-visible` の輪郭を明示しているのは、この面が**アンバーの上に白**という
 * 組み合わせで、ブラウザ既定の輪郭（多くは青か黒）が下地に沈むため。
 * キーボードだけで辿る人が、いまどのボタンにいるのか分からなくなる。
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-2xl text-center font-extrabold tracking-wide focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep active:translate-y-[3px] active:border-b-2";

export function PrimaryCta({
  href,
  children,
  size = "lg",
  className,
}: {
  href: string;
  children: React.ReactNode;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BUTTON_BASE} border-b-5 border-brand-deep bg-brand text-white ${
        size === "lg" ? "px-7 py-3.5 text-[15px]" : "px-4 py-2 text-[13px]"
      } ${className ?? ""}`}
    >
      {children}
      <IconArrowRight size={size === "lg" ? 18 : 15} />
    </Link>
  );
}

export function SecondaryCta({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BUTTON_BASE} border-2 border-b-5 border-line bg-panel px-7 py-3.5 text-[15px] text-brand-deep ${
        className ?? ""
      }`}
    >
      {children}
    </Link>
  );
}

/** 面に浮くカード。枠の下辺だけ濃いのがこのアプリ共通の作り */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-3xl border-2 border-b-5 border-line bg-panel ${
        className ?? ""
      }`}
    >
      {children}
    </div>
  );
}

/** 小さなラベル。リザルト画面の「よかったところ」と同じ形（components 間で見た目を揃える） */
export function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-[11px] font-extrabold text-brand-deep ${
        className ?? ""
      }`}
    >
      {children}
    </span>
  );
}
