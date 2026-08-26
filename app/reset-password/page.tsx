import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { unlistedPageMetadata } from "@/lib/seo/site";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { Mascot } from "@/components/ui/Mascot";
import { RECOVERY_COOKIE, verifyRecoveryMark } from "@/lib/auth/recovery";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = unlistedPageMetadata({
  title: "あたらしいパスワード",
  description: "メールのリンクから、Ferret のパスワードを設定し直します。",
});

/**
 * あたらしいパスワードを決める画面（C9）。
 *
 * **ログイン不要の画面として置いてある**（`proxy.ts` の matcher には足さない）。
 * ここへ来るのはメールのリンクを開いた人で、その時点でログイン状態にはなっているが、
 * 「ログインしているか」で通す作りにはしない ── 通してしまうと、
 * **いまのパスワードを知らない人がパスワードを差し替えられる画面**が1枚できる。
 * それは `app/settings/PasswordForm.tsx` が塞いだ穴と同じもの。
 *
 * 代わりに見るのは「メールのリンクを開いた印」（`lib/auth/recovery.ts`）。
 * 印が無ければ入力欄を出さず、送り直す案内だけを出す。
 * **`proxy.ts` に足さないので `lib/seo/site.ts` の `CRAWL_DISALLOW` も触らない**
 * （2つは同じ範囲を指す約束になっている。CLAUDE.md「守りの原則」）。
 */
export default async function ResetPasswordPage() {
  const store = await cookies();
  // 印は**署名を照合してから**信じる。Cookie は誰でも書ける場所なので、
  // 「値があること」だけを見ると印の意味が無くなる（lib/auth/recovery.ts）
  const arrivedFromEmail = verifyRecoveryMark(store.get(RECOVERY_COOKIE)?.value);

  return (
    // 組み方はログイン画面と同じ（`app/login/page.tsx` のコメント参照）
    <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto] justify-items-center px-6 py-10">
      <div className="self-center w-full max-w-sm bg-panel border-2 border-line rounded-3xl p-8 flex flex-col gap-5">
        <div className="flex items-center justify-center gap-2.5 text-xl font-extrabold">
          <Mascot className="w-8 h-8" />
          Ferret
        </div>

        {arrivedFromEmail ? (
          <ResetPasswordForm />
        ) : (
          <>
            <h1 className="text-lg font-extrabold text-center">
              メールのリンクからお進みください
            </h1>
            {/*
             * ここに来る理由は2つある。**どちらも同じ案内で足りる。**
             *   - リンクを開いてから時間が経った（印の寿命は10分）
             *   - リンクを通らずにこのURLを直接開いた
             * 理由を分けて出しても次の一手は同じ（送り直す）ので、分けない。
             */}
            <p className="text-muted text-sm font-bold leading-relaxed text-center">
              あたらしいパスワードは、お送りしたメールのリンクを開いた画面で決められます。リンクを開いてから時間が経つと、この画面に戻ります。
            </p>
            <Link
              href="/forgot-password"
              className="rounded-2xl bg-brand border-b-5 border-brand-deep text-white font-extrabold tracking-wide py-3.5 text-center active:translate-y-[3px] active:border-b-2"
            >
              メールを送り直す
            </Link>
            <p className="text-muted text-sm font-bold text-center">
              パスワードを思い出した方は
              <Link
                href="/login"
                className="text-brand-deep font-extrabold ml-1 whitespace-nowrap"
              >
                ログイン
              </Link>
            </p>
          </>
        )}
      </div>
      <LegalFooter />
    </div>
  );
}
