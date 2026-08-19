"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";
import { authErrorMessage, OAUTH_ENABLED } from "@/lib/auth/errors";
import { IconGithub, IconGoogle } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  // 法務文書への同意。チェックが入るまで登録の経路を開かない
  const [agreed, setAgreed] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    // ボタンは disabled にしてあるが、ここでも見る。
    // form は Enter でも送信できるので、片方だけだと素通りする経路が残る
    if (!agreed) return;
    const supabase = createClient();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setError(authErrorMessage(error, "登録できませんでした"));
      setLoading(false);
      return;
    }
    setSent(true);
  }

  async function handleOAuth(provider: "google" | "github") {
    // **OAuth もここで止める。** ボタンはチェック欄より上にあるので、
    // 見ただけでは同意が要ることが分からない。止めないと、
    // OAuth を有効にした日から「同意を通らない登録経路」が1本できる
    // （C2 の申し送り「OAuth を有効化したときに同意文の位置を見直す」はこれで済んだ）
    if (!agreed) {
      setError(
        "利用規約とプライバシーポリシーをお読みのうえ、同意にチェックを入れてください。",
      );
      return;
    }
    if (!OAUTH_ENABLED[provider]) {
      setError("この方法はまだ準備中です。メールアドレスでお進みください。");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(authErrorMessage(error, "登録できませんでした"));
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-panel border-2 border-line rounded-3xl p-8 flex flex-col items-center gap-4 text-center">
          <Mascot mood="happy" className="w-20 animate-pop" />
          <h1 className="text-xl font-extrabold">確認メールを送りました</h1>
          <p className="text-muted text-sm font-bold leading-relaxed">
            {email} に確認メールを送りました。メール内のリンクをクリックするとログインできます。
          </p>
          {/*
           * C7（2026-08-19）。**登録済みのアドレスでもこの画面が出る。**
           *
           * Supabase はアカウントの有無を外から調べられないようにするため、
           * 登録済みのアドレスでも signUp を成功したように返し、メールは送らない。
           * こちら側では変えられない挙動なので、案内でしか埋められない。
           *
           * この一文が無いと、前に登録したことを忘れた人が**届かないメールを
           * 待ち続ける。** 全員に同じ文面を出すので、「登録済みかどうかを教えない」
           * という認証基盤の性質は崩れない（教えるのは次の一手だけ）。
           */}
          <p className="text-muted text-xs font-bold leading-relaxed">
            すでにご登録のあるメールアドレスの場合、メールは届きません。そのままログイン画面へお進みください。
          </p>
          <Link href="/login" className="text-brand-deep text-sm font-extrabold">
            ログイン画面へ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <Link
        href="/"
        className="fixed top-6 left-7 text-sm font-extrabold text-muted hover:text-ink"
      >
        ← もどる
      </Link>

      <div className="w-full max-w-sm bg-panel border-2 border-line rounded-3xl p-8 flex flex-col gap-5">
        <div className="flex items-center justify-center gap-2.5 text-xl font-extrabold">
          <Mascot className="w-8 h-8" />
          Ferret
        </div>
        <h1 className="text-lg font-extrabold text-center">はじめまして</h1>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => handleOAuth("google")}
            className="flex items-center justify-center gap-2.5 rounded-2xl bg-panel border-2 border-line border-b-4 py-3 text-sm font-extrabold active:translate-y-[2px] active:border-b-2"
          >
            <IconGoogle />
            Googleで登録
            {!OAUTH_ENABLED.google && (
              <span className="text-[10px] font-extrabold text-locked-ink bg-locked px-2 py-0.5 rounded-full">
                準備中
              </span>
            )}
          </button>
          <button
            onClick={() => handleOAuth("github")}
            className="flex items-center justify-center gap-2.5 rounded-2xl bg-panel border-2 border-line border-b-4 py-3 text-sm font-extrabold active:translate-y-[2px] active:border-b-2"
          >
            <IconGithub />
            GitHubで登録
            {!OAUTH_ENABLED.github && (
              <span className="text-[10px] font-extrabold text-locked-ink bg-locked px-2 py-0.5 rounded-full">
                準備中
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-bold text-muted before:content-[''] before:flex-1 before:h-0.5 before:bg-line before:rounded-full after:content-[''] after:flex-1 after:h-0.5 after:bg-line after:rounded-full">
          または
        </div>

        <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-muted">メールアドレス</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand placeholder:text-locked-ink placeholder:font-medium"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-muted">パスワード</span>
            <input
              type="password"
              placeholder="8文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand placeholder:text-locked-ink placeholder:font-medium"
            />
          </label>
          {error && <p className="text-danger text-sm">{error}</p>}
          {/*
           * 同意はチェックで取る（オーナー判断 2026-08-19。それまでは
           * 「登録すると同意したものとみなします」の一文だった）。
           *
           * **ボタンより前に置く。** 押す前に読める位置に、押す操作の意味が
           * 書かれている必要がある（フッターの共通リンクではこの役を兼ねられない）。
           *
           * **文を `<label>` で包んでいないのは、中にリンクがあるため。**
           * label の中のリンクを押すと、リンクを開くと同時にチェックも切り替わる。
           * 読むつもりで押した人が、気づかないうちに同意した状態になる。
           * 代わりに `aria-label` で名前を与えてある。
           *
           * リンクを別タブで開くのは、**書きかけのメールアドレスとパスワードを
           * 消さないため**（この画面には下書きの保存が無い）。
           */}
          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                // 「チェックを入れてください」と出したまま、
                // 入れた後も残り続けないようにする
                if (e.target.checked) setError("");
              }}
              aria-label="利用規約とプライバシーポリシーに同意する"
              className="mt-0.5 size-4 shrink-0 accent-brand"
            />
            <p className="text-[11px] font-bold leading-relaxed text-muted">
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-deep underline"
              >
                利用規約
              </Link>
              と
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-deep underline"
              >
                プライバシーポリシー
              </Link>
              に同意します
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || !agreed}
            className="rounded-2xl bg-brand border-b-5 border-brand-deep text-white font-extrabold tracking-wide py-3.5 active:translate-y-[3px] active:border-b-2 disabled:bg-locked disabled:border-locked-edge disabled:text-locked-ink"
          >
            {loading ? "送信中..." : "登録する"}
          </button>
        </form>

        <p className="text-muted text-sm font-bold text-center">
          すでにアカウントをお持ちの方は
          <Link href="/login" className="text-brand-deep font-extrabold ml-1">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
