"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage, OAUTH_ENABLED } from "@/lib/auth/errors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(authErrorMessage(error, "ログインできませんでした"));
      setLoading(false);
      return;
    }
    // middleware に付けられた行き先へ戻す。無ければステージ一覧へ。
    // useSearchParams() を使うとページの事前生成が止まるため、
    // 送信時に1度だけ URL から読む
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/") ? next : "/stages");
    router.refresh();
  }

  async function handleOAuth(provider: "google" | "github") {
    if (!OAUTH_ENABLED[provider]) {
      setError("この方法はまだ準備中です。メールアドレスでお進みください。");
      return;
    }
    const supabase = createClient();
    // error を握りつぶすと、押しても無反応に見えて原因が分からなくなる
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(authErrorMessage(error, "ログインできませんでした"));
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-zinc-50 text-2xl font-bold text-center">
          ログイン
        </h1>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-zinc-800 text-zinc-50 px-4 py-3 rounded-lg outline-none"
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-zinc-800 text-zinc-50 px-4 py-3 rounded-lg outline-none"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full hover:bg-amber-300 transition-colors disabled:opacity-40"
          >
            {loading ? "確認中..." : "ログイン"}
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleOAuth("google")}
            className="border border-zinc-700 text-zinc-50 py-3 rounded-full hover:bg-zinc-800 transition-colors"
          >
            Googleでログイン{!OAUTH_ENABLED.google && "（準備中）"}
          </button>
          <button
            onClick={() => handleOAuth("github")}
            className="border border-zinc-700 text-zinc-50 py-3 rounded-full hover:bg-zinc-800 transition-colors"
          >
            GitHubでログイン{!OAUTH_ENABLED.github && "（準備中）"}
          </button>
        </div>

        <p className="text-zinc-400 text-sm text-center">
          アカウントをお持ちでない方は
          <Link href="/register" className="text-amber-400 ml-1">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
