import Link from "next/link";
import { Mascot } from "@/components/ui/Mascot";
import { Container, PrimaryCta } from "@/components/lp/parts";
import { ChangelogMenu } from "@/components/changelog/ChangelogMenu";

/**
 * LP の上部バー。**自前で開閉状態を持つメニューは作らない。**
 *
 * 折りたたみメニューを付けると、この節のためだけに LP 全体がクライアント部品になる
 * （開いているかどうかを覚える必要が出るため）。節への近道は本文を上から読めば
 * 全部通るので、狭い画面ではロゴと「無料で始める」だけを残す作りにした。
 *
 * **「更新情報」だけは開閉する**（`ChangelogMenu`・E12）。ただし状態を持つのは
 * ブラウザ（`<details>`）で、こちらはサーバー部品のまま ── 上の決めには当たらない。
 * ここに置いてあるのは、**上部バーが sticky なのでスクロール位置に関係なく開ける**から。
 * 主役の下の帯（180px）を置き換えている。
 *
 * `anchorBase` は節への近道の書き出し。**LP 以外の画面でも使うため**に持たせている
 * （E12 で `/changelog` が同じ上部バーを使うようになった）。空なら `#flow` で同じ画面の中を、
 * `"/"` なら `/#flow` で LP へ移動してから節に着く。**渡し忘れると、LP の外で
 * 「使い方」を押しても何も起きない**（その画面には `#flow` が無いため。押せるのに動かない）。
 *
 * 下地は**半透明にしない。** Tailwind の `bg-bg/85` はトークンを `color-mix()` で薄める
 * 指定に変わり、`color-mix()` を解釈しないブラウザ用の控えの値として
 * **明るい配色の色がそのまま焼き込まれる**（実測: `#fdf8ecd9`）。
 * 暗い配色でそこに落ちると、上部バーだけクリーム色の帯になる。
 * 問題画面の上部バーも不透明（`bg-bg`）なので、そちらと揃える。
 */
export function LpHeader({ anchorBase = "" }: { anchorBase?: "" | "/" } = {}) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-line bg-bg">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Mascot className="w-7" />
          <span className="text-lg font-extrabold tracking-wide">Ferret</span>
        </Link>

        <nav className="hidden items-center gap-7 text-[13px] font-bold text-ink md:flex">
          {[
            { href: "#flow", label: "使い方" },
            { href: "#types", label: "問題" },
            { href: "#faq", label: "よくある質問" },
          ].map((n) => (
            <a
              key={n.href}
              href={`${anchorBase}${n.href}`}
              className="rounded-md hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* ログインより先に置く。**狭い画面ではログインが消える**（下の hidden sm:block）ので、
              後ろに置くとそこだけ順番が入れ替わって見える */}
          <ChangelogMenu />
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
