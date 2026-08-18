import Link from "next/link";

/**
 * 法務文書への導線。タイトル画面とログイン画面の下端に置く定位置
 * （design/定番機能リスト.md B）。
 *
 * **ログインの前に置く必要がある。** 規約に同意して登録する人が、
 * 同意する前に規約を読める場所は、ログインを要求しない画面しかない。
 *
 * 新規登録画面にはこれを置かず、同意の一文（`app/register/page.tsx`）に
 * 同じ2つの行き先を持たせている。同じ画面に同じリンクを二重に置かないため。
 */
export function LegalFooter() {
  return (
    <footer className="flex items-center justify-center gap-5 px-6 pt-4 pb-8 text-xs font-bold text-muted">
      <Link href="/terms" className="hover:text-ink">
        利用規約
      </Link>
      <Link href="/privacy" className="hover:text-ink">
        プライバシーポリシー
      </Link>
    </footer>
  );
}
