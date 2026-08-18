"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, PASSWORD_MIN_LENGTH } from "@/lib/auth/errors";

/**
 * パスワードの変更。
 *
 * **いまのパスワードを必ず先に確かめる。**
 * これが無いと、ログインしたまま離席した端末を触った人が、パスワードだけ書き換えて
 * アカウントごと持っていける（本人はログインできなくなる）。
 *
 * 確認の方法は「いまのパスワードでもう一度ログインする」。
 * 認証基盤側にも同じ趣旨の設定（`supabase/config.toml` の `secure_password_change`）が
 * あり、そちらは「直前にログインしていること」を求める。**先にログインし直す形なので
 * 設定を有効にしても矛盾しない**（設定の反映は config push が必要で、いまは保留中）。
 *
 * サーバー API を作らずブラウザから呼ぶのは、パスワードの変更が
 * 認証基盤の担当で、こちらの DB を触らないため。
 * 退会（`/api/account/delete`）は特権キーで DB を消すのでサーバー側に置いてある。
 */
export function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const tooShort = next.length < PASSWORD_MIN_LENGTH;
  const mismatch = again.length > 0 && next !== again;
  const ready = current.length > 0 && !tooShort && next === again && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    setLoading(true);
    setError("");
    setDone(false);

    const supabase = createClient();

    // 1) いまのパスワードで本人確認。
    // 失敗しても、いま開いているセッションはそのまま（ログアウトされない）
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (signInError) {
      // ここでの「認証情報が違う」はメールアドレスではなくパスワードのこと。
      // 画面にはメールアドレスの入力欄が無いので、共通の文面だと迷わせる
      setError(
        signInError.code === "invalid_credentials"
          ? "いまのパスワードが違います。"
          : authErrorMessage(signInError, "確認ができませんでした"),
      );
      setLoading(false);
      return;
    }

    // 2) 差し替え
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) {
      setError(authErrorMessage(updateError, "パスワードを変更できませんでした"));
      setLoading(false);
      return;
    }

    setCurrent("");
    setNext("");
    setAgain("");
    setDone(true);
    setLoading(false);
  }

  return (
    <section className="rounded-2xl border-2 border-line bg-panel p-6">
      <h2 className="mb-1.5 text-sm font-extrabold">パスワードの変更</h2>
      <p className="mb-4 text-xs font-bold leading-relaxed text-muted">
        いまのパスワードを確かめてから差し替えます。
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-extrabold text-muted">いまのパスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-extrabold text-muted">あたらしいパスワード</span>
          <input
            type="password"
            autoComplete="new-password"
            placeholder={`${PASSWORD_MIN_LENGTH}文字以上`}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand placeholder:text-locked-ink placeholder:font-medium"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-extrabold text-muted">
            あたらしいパスワード（確認）
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand"
          />
        </label>

        {/* 入力中の案内。押せない理由が分かるように、ボタンの無効化とセットで出す */}
        {mismatch && (
          <p className="text-xs font-bold text-red-600">
            2つのあたらしいパスワードがそろっていません。
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && (
          <p className="text-sm font-bold text-brand-deep">パスワードを変更しました。</p>
        )}

        <button
          type="submit"
          disabled={!ready}
          className="self-start rounded-2xl border-b-5 border-brand-deep bg-brand px-8 py-3 text-sm font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2 disabled:cursor-not-allowed disabled:border-locked-edge disabled:bg-locked disabled:text-locked-ink disabled:active:translate-y-0 disabled:active:border-b-5"
        >
          {loading ? "変更中..." : "変更する"}
        </button>
      </form>
    </section>
  );
}
