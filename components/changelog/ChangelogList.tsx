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
 */
export function ChangelogList({
  entries,
  /**
   * 箇条書きを省く（LP 用）。
   *
   * LP に出すのは最新3件で、**そこで伝えたいのは「動いているサービスだ」ということだけ。**
   * 公開の回は中身が7項目あり、そのまま並べると節が画面2枚ぶんになるうえ、
   * 内容は LP の §01〜§05 に既に書いてある。全部読みたい人の行き先が `/changelog`。
   */
  compact = false,
  /**
   * 見出しの階層。**画面ごとに違う**ので受け取る。
   * LP では節の見出し（h2）の下に入るので `h3`、`/changelog` では `h1` の下なので `h2`。
   * 数字を飛ばすと、見出しだけを辿って読む人が階層を追えなくなる。
   */
  headingLevel = "h3",
}: {
  entries: readonly ChangelogEntry[];
  compact?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;

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

            {entry.items && !compact ? (
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
