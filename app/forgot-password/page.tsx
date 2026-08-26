"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";
import { authErrorMessage } from "@/lib/auth/errors";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { Mascot } from "@/components/ui/Mascot";
import { configuredAppOrigin } from "@/lib/http/origin";

/**
 * パスワード再設定のメールを送る画面（C9）。
 *
 * **ログイン不要。** `proxy.ts` の matcher には足していない ──
 * パスワードを忘れた人が開く画面なので、ログインを求めた瞬間に役目を失う。
 *
 * 送るだけで、パスワードを決めるのは次の画面（`app/reset-password/page.tsx`）。
 * リンクの受け取り方は `app/auth/callback/route.ts` に集めてある。
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    setLoading(true);
    setError("");

    /**
     * `redirectTo` は**いまの文面では使われない。**
     *
     * メールの本文（`supabase/templates/reset-password.html`）は
     * `{{ .SiteURL }}/auth/callback?...` と自分で組み立てているので、
     * リンクの行き先は管理画面の Site URL（＝本番URL）で決まる。
     * それでも渡してあるのは、**文面を `{{ .ConfirmationURL }}` に戻した日に
     * 行き先が無いと Supabase 側の既定へ流れる**ため。
     *
     * 値に `location.origin` をそのまま使わないのは、開発中に開いている
     * ローカルのURLが混ざるのを防ぐため。**本番URLが設定されているとき
     * （Vercel の Production）はそちらを優先する**（C1 で踏んだ地雷。
     * `lib/http/origin.ts` のコメント）。
     */
    const origin = configuredAppOrigin() ?? location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback`,
    });

    /**
     * **登録の有無を画面で分けない**（オーナー判断 2026-08-26・案A）。
     *
     * 分けると、メールアドレスを入れるだけで「そのアドレスが Ferret に
     * 登録されているか」を誰でも調べられる。C7（新規登録の案内文）でも
     * 同じ判断をしている。
     *
     * Supabase は未登録のアドレスでも成功として返す（アカウントの有無を
     * 伏せる既定の作り）ので、ふつうはここに来ない。**それでも見ているのは、
     * 設定や版によって「そんなユーザーはいない」と返る場合があるため。**
     * その1種類だけは成功と同じ画面に寄せる ── 送信の間隔やメールアドレスの
     * 形式のような、登録の有無と関係のない理由は、伏せずに伝えたい。
     */
    const notFound =
      error?.code === "user_not_found" ||
      (error?.message ?? "").toLowerCase().includes("user not found");

    if (error && !notFound) {
      setError(authErrorMessage(error, "メールをお送りできませんでした"));
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto] justify-items-center px-6 py-10">
        <div className="self-center w-full max-w-sm bg-panel border-2 border-line rounded-3xl p-8 flex flex-col items-center gap-4 text-center">
          <Mascot mood="happy" className="w-20 animate-pop" />
          <h1 className="text-xl font-extrabold">メールを送りました</h1>
          <p className="text-muted text-sm font-bold leading-relaxed break-all">
            {email}{" "}
            に、パスワードを設定し直すためのリンクをお送りしました。メール内のリンクを開くと、あたらしいパスワードを決められます。
          </p>
          {/*
           * 後半の一文は C7（新規登録の完了画面）と同じ趣旨。
           * **未登録のアドレスでもこの画面が出る**ので、待ち続けずに次の一手が
           * 分かるようにしておく。全員に同じ文面なので、登録の有無は伝わらない。
           *
           * 1段にまとめてあるのは、小さい文字の段が3つ続くと**どれも読まれない**ため。
           */}
          <p className="text-muted text-xs font-bold leading-relaxed">
            リンクは1時間ほどで使えなくなります。届いていないときは、迷惑メールの振り分けをご確認ください。このメールアドレスでのご登録が無い場合は、メールは届きません。
          </p>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => {
                setSent(false);
                setError("");
              }}
              className="text-brand-deep text-sm font-extrabold"
            >
              別のメールアドレスで送る
            </button>
            <Link href="/login" className="text-muted text-sm font-extrabold">
              ログイン画面へ
            </Link>
          </div>
        </div>
        <LegalFooter />
      </div>
    );
  }

  return (
    // 縦2段の組み方はログイン画面と同じ（`app/login/page.tsx` のコメント参照）。
    // 列を minmax(0,1fr) で明示するのは、幅320px でカードが溢れるため（E8）
    <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto] justify-items-center px-6 py-10">
      <Link
        href="/login"
        className="fixed top-6 left-7 text-sm font-extrabold text-muted hover:text-ink"
      >
        ← もどる
      </Link>

      <div className="self-center w-full max-w-sm bg-panel border-2 border-line rounded-3xl p-8 flex flex-col gap-5">
        <div className="flex items-center justify-center gap-2.5 text-xl font-extrabold">
          <Mascot className="w-8 h-8" />
          Ferret
        </div>
        <h1 className="text-lg font-extrabold text-center">パスワードの再設定</h1>
        <p className="text-muted text-sm font-bold leading-relaxed text-center">
          ご登録のメールアドレスに、パスワードを設定し直すためのリンクをお送りします。
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-muted">メールアドレス</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand placeholder:text-locked-ink placeholder:font-medium"
            />
          </label>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || email.length === 0}
            className="rounded-2xl bg-brand border-b-5 border-brand-deep text-white font-extrabold tracking-wide py-3.5 active:translate-y-[3px] active:border-b-2 disabled:bg-locked disabled:border-locked-edge disabled:text-locked-ink"
          >
            {loading ? "送信中..." : "リンクを送る"}
          </button>
        </form>

        <p className="text-muted text-sm font-bold text-center">
          パスワードを思い出した方は
          <Link
            href="/login"
            className="text-brand-deep font-extrabold ml-1 whitespace-nowrap"
          >
            ログイン
          </Link>
        </p>
      </div>
      <LegalFooter />
    </div>
  );
}
