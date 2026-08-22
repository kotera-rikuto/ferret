import Link from "next/link";
import { Mascot } from "@/components/ui/Mascot";
import { Container, PrimaryCta } from "@/components/lp/parts";

/**
 * LP の上部バー。**開閉するメニューは作らない。**
 *
 * 折りたたみメニューを付けると、この節のためだけに LP 全体がクライアント部品になる
 * （開いているかどうかを覚える必要が出るため）。節への近道は本文を上から読めば
 * 全部通るので、狭い画面ではロゴと「無料で始める」だけを残す作りにした。
 *
 * 下地は**半透明にしない。** Tailwind の `bg-bg/85` はトークンを `color-mix()` で薄める
 * 指定に変わり、`color-mix()` を解釈しないブラウザ用の控えの値として
 * **明るい配色の色がそのまま焼き込まれる**（実測: `#fdf8ecd9`）。
 * 暗い配色でそこに落ちると、上部バーだけクリーム色の帯になる。
 * 問題画面の上部バーも不透明（`bg-bg`）なので、そちらと揃える。
 */
export function LpHeader() {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-line bg-bg">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Mascot className="w-7" />
          <span className="text-lg font-extrabold tracking-wide">Ferret</span>
        </Link>

        <nav className="hidden items-center gap-7 text-[13px] font-bold text-ink md:flex">
          {[
            { href: "#flow", label: "1問の流れ" },
            { href: "#types", label: "6つの読み方" },
            { href: "#faq", label: "よくある質問" },
          ].map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-md hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden rounded-md text-[13px] font-extrabold text-brand-deep hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep sm:block"
          >
            ログイン
          </Link>
          <PrimaryCta href="/register" size="sm">
            無料で始める
          </PrimaryCta>
        </div>
      </Container>
    </header>
  );
}
