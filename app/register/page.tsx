"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError("登録に失敗しました。もう一度お試しください");
      return;
    }
    setSent(true);
  }

  async function handleOAuth(provider: "google" | "github") {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-sm flex flex-col gap-4 text-center">
          <h1 className="text-zinc-50 text-2xl font-bold">確認メールを送りました</h1>
          <p className="text-zinc-400 text-sm">{email} に確認メールを送りました。メール内のリンクをクリックするとログインできます。</p>
          <Link href="/login" className="text-amber-400 text-sm">ログイン画面へ</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-zinc-50 text-2xl font-bold text-center">
          新規登録
        </h1>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
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
            className="bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full hover:bg-amber-300 transition-colors"
          >
            登録する
          </button>
        </form>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleOAuth("google")}
            className="border border-zinc-700 text-zinc-50 py-3 rounded-full hover:bg-zinc-800 transition-colors"
          >
            Googleで登録
          </button>
          <button
            onClick={() => handleOAuth("github")}
            className="border border-zinc-700 text-zinc-50 py-3 rounded-full hover:bg-zinc-800 transition-colors"
          >
            GitHubで登録
          </button>
        </div>

        <p className="text-zinc-400 text-sm text-center">
          すでにアカウントをお持ちの方は
          <Link href="/login" className="text-amber-400 ml-1">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
