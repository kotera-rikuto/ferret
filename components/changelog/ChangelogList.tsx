import Link from "next/link";
import { Chip } from "@/components/lp/parts";
import {
  CHANGELOG_CATEGORY_LABELS,
  formatChangelogDate,
  type ChangelogEntry,
} from "@/lib/changelog";

/**
 * 更新情報の一覧。**LP（最新3件）と `/changelog`（全件）の両方がこれを使う**（tasks/E12）。
 *
 * 2か所で同じ見た目を別々に書くと、片方だけ整えたときにもう片方が古い形で残る。
 * 文章は `lib/changelog.ts` にあり、ここには言葉を置かない（`components/lp/parts.tsx` と同じ方針）。
 *
 * **動き（`Reveal`）は使わない。** 動かすのは LP の節の見出しだけと決めてある
 * （tests/unit/lp-motion.test.ts §19）。ここは読み物なので、下地の色と枠だけで区切る。
 *
 * 見せ方は2つ（`variant`）。**LP は行、`/changelog` はカード。**
 * LP 側は主役のすぐ下に置く細い帯なので、カードを積むと惹句とボタンを押し下げる
 * （オーナー指摘・2026-08-26）。日付・種類・見出しの1行だけを並べる。
 */
export function ChangelogList({
  entries,
  /**
   * 見せ方。**LP は `"row"`、`/changelog` は `"card"`。**
   *
   * LP で伝えたいのは「動いているサービスだ」ということだけなので、
   * 日付・種類・見出しの1行に畳む。本文と箇条書きまで読みたい人の行き先が `/changelog`。
   */
  variant = "card",
  /**
   * 見出しの階層。**画面ごとに違う**ので受け取る。
   * LP では節の見出し（h2）の下に入るので `h3`、`/changelog` では `h1` の下なので `h2`。
   * 数字を飛ばすと、見出しだけを辿って読む人が階層を追えなくなる。
   */
  headingLevel = "h3",
}: {
  entries: readonly ChangelogEntry[];
  variant?: "card" | "row";
  /** `variant="card"` のときだけ効く（行のほうは見出しではなく本文として並べる） */
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;

  if (variant === "row") {
    return (
      <ol className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li
            key={`${entry.date}-${entry.title}`}
            // 幅375pxでは日付＋種類＋見出しが1行に収まらない。折り返しを許して、
            // 折れたときも日付の頭で列が揃うようにしている
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
          >
            <time
              dateTime={entry.date}
              className="font-mono text-[11px] font-bold tracking-wide whitespace-nowrap text-muted"
            >
              {formatChangelogDate(entry.date)}
            </time>
            <Chip>{CHANGELOG_CATEGORY_LABELS[entry.category]}</Chip>
            <span className="text-[13px] leading-relaxed font-extrabold">
              {entry.title}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="flex flex-col gap-5">
      {entries.map((entry) => (
        <li key={`${entry.date}-${entry.title}`}>
          <article className="flex flex-col gap-3.5 rounded-3xl border-2 border-b-5 border-line bg-panel p-6 sm:p-7">
            {/*
              日付と種類。**折り返しを許してある** ── 幅375pxでは
              「2026年8月25日」＋「規約の改定」で1行に収まらないことがある。
              `<time>` にしているのは、機械が日付として読めるようにするため。
            */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <time
                dateTime={entry.date}
                className="font-mono text-[11px] font-bold tracking-wide text-muted"
              >
                {formatChangelogDate(entry.date)}
              </time>
              <Chip>{CHANGELOG_CATEGORY_LABELS[entry.category]}</Chip>
            </div>

            <Heading className="text-[15px] leading-relaxed font-extrabold sm:text-base">
              {entry.title}
            </Heading>

            <p className="text-[13px] leading-loose font-medium text-ink">
              {entry.body}
            </p>

            {entry.items ? (
              <ul className="flex flex-col gap-2.5">
                {entry.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-brand"
                    />
                    <span className="text-[13px] leading-loose font-medium text-ink">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {entry.link ? (
              <Link
                href={entry.link.href}
                className="self-start rounded-md text-[13px] font-extrabold text-brand-deep underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep"
              >
                {entry.link.label} →
              </Link>
            ) : null}
          </article>
        </li>
      ))}
    </ol>
  );
}
