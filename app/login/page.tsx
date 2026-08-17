"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authErrorMessage, OAUTH_ENABLED } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { IconGithub, IconGoogle } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

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
    // proxy に付けられた行き先へ戻す。無ければステージ一覧へ。
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
        <h1 className="text-lg font-extrabold text-center">おかえりなさい</h1>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => handleOAuth("google")}
            className="flex items-center justify-center gap-2.5 rounded-2xl bg-panel border-2 border-line border-b-4 py-3 text-sm font-extrabold active:translate-y-[2px] active:border-b-2"
          >
            <IconGoogle />
            Googleでログイン
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
            GitHubでログイン
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

        <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand placeholder:text-locked-ink placeholder:font-medium"
            />
          </label>
          {shownError && <p className="text-red-600 text-sm">{shownError}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-brand border-b-5 border-brand-deep text-white font-extrabold tracking-wide py-3.5 active:translate-y-[3px] active:border-b-2 disabled:bg-locked disabled:border-locked-edge disabled:text-locked-ink"
          >
            {loading ? "確認中..." : "ログイン"}
          </button>
        </form>

        <p className="text-muted text-sm font-bold text-center">
          アカウントをお持ちでない方は
          <Link href="/register" className="text-brand-deep font-extrabold ml-1">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
