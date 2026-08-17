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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
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
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
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
