import Link from "next/link";
import { Mascot } from "@/components/ui/Mascot";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_REVISED_DATE,
  OPERATOR_NAME,
} from "@/lib/legal";

/**
 * 法務文書（利用規約・プライバシーポリシー）の共通の枠。
 *
 * 2つの文書で見出し・余白・番号の付き方を揃えるために枠だけを切り出した。
 * ページ側には**文章だけ**を置く（`h2` / `p` / `ol` / `table` の素のタグ）。
 * 体裁はここの `[&_...]` で一括して当てるので、条文を足すときに
 * class を書き写す必要がなく、書き写し漏れによる見た目のばらつきが起きない。
 *
 * ログインを要求しないページ。`proxy.ts` の matcher に入れないこと
 * （入れると、規約に同意する前の人が規約を読めなくなる）。
 */
export function LegalPage({
  title,
  lead,
  children,
  other,
}: {
  title: string;
  /** 見出しの下に置く1〜2文の要約。条文を読む前に何の文書かが分かるようにする */
  lead: string;
  children: React.ReactNode;
  /** もう一方の文書への行き先。文書間を往復できるようにする */
  other: { href: string; label: string };
}) {
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-5">
          <Link
            href="/"
            className="text-sm font-extrabold text-muted hover:text-ink"
          >
            ← もどる
          </Link>
          <div className="flex items-center gap-2.5 text-lg font-extrabold">
            <Mascot className="h-7 w-7" />
            Ferret
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-extrabold lg:text-3xl">{title}</h1>
            <p className="text-sm font-bold leading-loose text-muted">{lead}</p>
          </div>
        </header>

        {/*
         * 条文の体裁。読み物なので行間を広めに取る。
         * ol は「第N条」の中の項番号で、法務文書の慣例どおり丸括弧なしの算用数字。
         */}
        <article
          className="flex flex-col gap-6 text-sm leading-loose font-medium
            [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-extrabold
            [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:pl-6
            [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-6
            [&_section]:flex [&_section]:flex-col [&_section]:gap-3
            [&_a]:font-extrabold [&_a]:text-brand-deep [&_a]:underline
            [&_dl]:flex [&_dl]:flex-col [&_dl]:gap-3
            [&_dt]:font-extrabold
            [&_dd]:text-muted"
        >
          {children}
        </article>

        <footer className="flex flex-col gap-4 border-t-2 border-line pt-6 text-sm font-bold text-muted">
          <dl className="flex flex-col gap-1">
            <div className="flex gap-2">
              <dt>制定日</dt>
              <dd>{LEGAL_EFFECTIVE_DATE}</dd>
            </div>
            {/* 改定日は制定日と別に出す。片方だけだと、
                いつ効力を持ったのか／いつ変わったのかのどちらかが読めない */}
            <div className="flex gap-2">
              <dt>最終改定日</dt>
              <dd>{LEGAL_REVISED_DATE}</dd>
            </div>
            <div className="flex gap-2">
              <dt>運営者</dt>
              <dd>{OPERATOR_NAME}</dd>
            </div>
          </dl>
          <Link
            href={other.href}
            className="font-extrabold text-brand-deep underline"
          >
            {other.label}
          </Link>
        </footer>
      </div>
    </div>
  );
}
