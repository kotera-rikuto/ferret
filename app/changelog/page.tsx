import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { ChangelogList } from "@/components/changelog/ChangelogList";
import { LpHeader } from "@/components/lp/LpHeader";
import { Container } from "@/components/lp/parts";
import { Mascot } from "@/components/ui/Mascot";
import { CHANGELOG } from "@/lib/changelog";
import { publicPageMetadata } from "@/lib/seo/site";

/**
 * 更新情報の全件（tasks/E12）。LP には最新3件だけ出し、こちらに全部を残す。
 *
 * **ログイン不要のページ。`proxy.ts` の matcher に足さないこと。**
 * 理由は法務文書と同じで、**まだ登録していない人に読ませるためにある** ──
 * 「動いているサービスかどうか」を登録前に確かめる場所であり（M1 の記事から来た人の着地点）、
 * 利用規約 第18条が約束している「変更の周知」も、規約に同意する前の人が読めなければ意味がない。
 *
 * 上部バーは LP と同じ `LpHeader` を使う。ここへ来る人は登録していないことが多く、
 * 読み終わったところに「無料で始める」が無いと、戻る先が無くなる。
 *
 * ⚠️ 節の見出しの動き（`SectionHead` / `Reveal`）は使っていない。
 * **動かすのは LP の見出しだけ**という決めがある（tests/unit/lp-motion.test.ts §19）。
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/changelog",
  title: "更新情報",
  description:
    "Ferret の更新情報。新しく追加した問題・機能と、利用規約およびプライバシーポリシーの改定を、反映した日付とあわせて掲載しています。",
});

export default function ChangelogPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      {/* 節への近道は LP のもの。`anchorBase` を渡さないと、この画面で押しても何も起きない */}
      <LpHeader anchorBase="/" />

      <main className="flex-1">
        <Container className="flex max-w-3xl flex-col gap-10 py-14 sm:py-20">
          <header className="flex flex-col gap-4">
            <Link
              href="/"
              className="self-start rounded-md text-sm font-extrabold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep"
            >
              ← トップへもどる
            </Link>
            <div className="flex items-center gap-3">
              <Mascot alt="" className="w-11 shrink-0" />
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                更新情報
              </h1>
            </div>
            <p className="text-[14px] leading-loose font-medium text-ink">
              新しく増えた問題と機能、利用規約の改定を、本番に反映した日付とあわせて載せています。
            </p>
          </header>

          <ChangelogList entries={CHANGELOG} headingLevel="h2" />
        </Container>
      </main>

      {/* LegalFooter 自身が <footer> を出すので、ここは div で囲う（footer の入れ子は仕様違反） */}
      <div className="border-t-2 border-line bg-bg-deep">
        <LegalFooter />
      </div>
    </div>
  );
}
