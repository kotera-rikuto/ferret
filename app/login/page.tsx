"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authErrorMessage, OAUTH_ENABLED } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";

/**
 * `/auth/callback` から戻されたときの理由。
 *
 * URL に載る `?error=` は**この表の見出しとしか照合しない。**
 * 文章そのものを URL 経由で受け取ると、`?error=<好きな文章>` のリンクを配るだけで
 * 本物の画面に攻撃者の文言を出せてしまう
 * （「セキュリティ確認のためパスワードを再入力してください」など）。
 */
const CALLBACK_ERRORS: Record<string, string> = {
  auth_callback:
    "ログインの確認を完了できませんでした。お手数ですが、もう一度お試しください。",
};

/** 初回描画時の URL から `?error=` を読む。サーバー描画時は空 */
const subscribeNothing = () => () => {};
const readErrorParam = () =>
  new URLSearchParams(window.location.search).get("error") ?? "";
const readErrorParamOnServer = () => "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 一度でも操作したら、コールバック由来の古い案内は引っ込める
  const [retried, setRetried] = useState(false);

  // 認証コールバックからの戻りだけ、理由を拾って表示する。
  // useSearchParams() を使うとページの事前生成が止まるため、
  // ブラウザ側の値としてURLを読む（サーバー描画時は空を返すので表示のズレも起きない）
  const callbackError = CALLBACK_ERRORS[
    useSyncExternalStore(subscribeNothing, readErrorParam, readErrorParamOnServer)
  ];
  const shownError = error || (retried ? "" : callbackError) || "";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    setLoading(true);
    setRetried(true);
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
    // 送信時に1度だけ URL から読む。
    // safeNextPath を通すのは、外部サイトへ飛ばす値が混ぜられるのを防ぐため
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(safeNextPath(next));
    router.refresh();
  }

  async function handleOAuth(provider: "google" | "github") {
    setRetried(true);
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
          {shownError && <p className="text-red-400 text-sm">{shownError}</p>}
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
