import Link from "next/link";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { Mascot } from "@/components/ui/Mascot";

// primary は「はじめる」（新規登録）、ログインは secondary。
// 新規獲得を優先する学習アプリの定石に合わせている（design/README.md）
export default function Home() {
  return (
    // 縦2段（主役 + 法務フッター）。1段目が余りを取る grid にしてあるので、
    // フッターを足してもマスコットとコピーは画面の中央に置かれたまま
    <div className="min-h-screen grid grid-rows-[1fr_auto]">
      <div className="self-center flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-18 px-10 py-16">
        <Mascot
          alt="フェレット"
          priority
          className="w-52 lg:w-70 animate-float drop-shadow-[0_10px_24px_rgba(74,59,40,0.18)]"
        />
        <div className="flex flex-col gap-5 max-w-md">
          <h1 className="text-5xl lg:text-6xl font-extrabold">Ferret</h1>
          <p className="text-xl lg:text-2xl font-extrabold leading-relaxed">
            他人のコードが読める、
            <br />
            AI時代のエンジニアに。
          </p>
          <p className="text-sm font-bold text-muted leading-loose">
            コードを読んで、日本語で説明する。
            <br />
            AI がフィードバックを返す、
            <br />
            {/* 折り返す位置を語の切れ目に固定する。
                日本語はどこでも改行できるので、放っておくと画面幅しだいで
                「学習サイト。」だけが次の行に落ちる。塊にしておけば、
                狭い画面では「コードリーディング特化 / プログラミング学習サイト。」で折れる。
                改行を跨いだ JSX の空白は消えるので、2つの間に隙間は出ない */}
            <span className="inline-block">コードリーディング特化</span>
            <span className="inline-block">プログラミング学習サイト。</span>
          </p>
          <div className="flex flex-col gap-3 mt-2 w-full max-w-xs">
            <Link
              href="/register"
              className="rounded-2xl bg-brand border-b-5 border-brand-deep text-white text-center font-extrabold tracking-wide py-3.5 active:translate-y-[3px] active:border-b-2"
            >
              はじめる
            </Link>
            <Link
              href="/login"
              className="rounded-2xl bg-panel border-2 border-line border-b-5 text-brand-deep text-center font-extrabold tracking-wide py-3.5 active:translate-y-[3px] active:border-b-2"
            >
              アカウントをお持ちの方
            </Link>
          </div>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
