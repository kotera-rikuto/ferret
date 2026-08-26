"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, PASSWORD_MIN_LENGTH } from "@/lib/auth/errors";
import { Mascot } from "@/components/ui/Mascot";

/**
 * あたらしいパスワードの入力欄（C9）。
 *
 * **いまのパスワードは尋ねない。** ここへ来られるのはメールのリンクを開いた人だけで、
 * その人はパスワードを忘れている。本人確認の役はメールの受信が果たしている
 * （印の持ち回りは `lib/auth/recovery.ts`、入口の判定は `page.tsx`）。
 * いまのパスワードを尋ねる版は `app/settings/PasswordForm.tsx` のほう。
 *
 * サーバー API を作らずブラウザから呼ぶのは、パスワードの変更が認証基盤の担当で
 * こちらの DB を触らないため（`PasswordForm.tsx` と同じ理由）。
 */
export function ResetPasswordForm() {
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // 他の端末のログインを本当に解除できたか。**できていないのに
  // 「解除しました」と書かないため**に分けて持つ
  const [othersSignedOut, setOthersSignedOut] = useState(false);

  const tooShort = next.length < PASSWORD_MIN_LENGTH;
  const mismatch = again.length > 0 && next !== again;
  const ready = !tooShort && next === again && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: next });

    if (updateError) {
      // リンクを開いてから時間が経ってセッションが切れた場合はここに来る。
      // 共通の文面だと「もう一度お試しください」で終わり、
      // **何をもう一度やればよいのか**が分からない
      const expired =
        updateError.code === "session_not_found" ||
        (updateError.message ?? "").toLowerCase().includes("session missing") ||
        updateError.status === 401;
      setError(
        expired
          ? "この画面の有効な時間が過ぎました。お手数ですが、再設定のメールをもう一度お送りします。"
          : authErrorMessage(updateError, "パスワードを設定できませんでした"),
      );
      setLoading(false);
      return;
    }

    /**
     * 他の端末のログインを解除する（オーナー判断 2026-08-26）。
     *
     * `scope: "others"` はいま開いている自分の画面を残して他を切るので、
     * 設定し直した直後に自分がログイン画面へ戻される、ということは起きない。
     *
     * **実測（2026-08-26）では、差し替えただけで他の端末は切れていた** ──
     * 認証基盤側が他のセッションを無効にしていて、他端末のアクセストークンは 403、
     * 更新トークンは 400 になった。それでも明示的に呼ぶのは、
     * **これが Supabase の設定と版に依存する挙動**で、いつ変わっても
     * こちらは気づけないため。乗っ取られていた場合に相手を追い出せるかどうかは、
     * 気づけないまま外れていてよい性質ではない。
     *
     * **失敗しても入力のやり直しは求めない。** パスワードの差し替えは
     * すでに済んでいるので、ここで「できませんでした」と出すと
     * 変わっていないように見える。伝えるのは「解除できたかどうか」だけにする。
     */
    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutError) {
      console.error("他の端末のログイン解除に失敗しました:", signOutError.message);
    }

    setOthersSignedOut(!signOutError);
    setNext("");
    setAgain("");
    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Mascot mood="happy" className="w-20 animate-pop" />
        <h1 className="text-xl font-extrabold">あたらしいパスワードを設定しました</h1>
        <p className="text-muted text-sm font-bold leading-relaxed">
          このままお使いいただけます。次からは、あたらしいパスワードでログインしてください。
        </p>
        {othersSignedOut && (
          <p className="text-muted text-xs font-bold leading-relaxed">
            ほかの端末で開いていたログインは解除しました。
          </p>
        )}
        <Link
          href="/stages"
          className="w-full rounded-2xl bg-brand border-b-5 border-brand-deep text-white font-extrabold tracking-wide py-3.5 text-center active:translate-y-[3px] active:border-b-2"
        >
          学習をつづける
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-lg font-extrabold text-center">
        あたらしいパスワードを決める
      </h1>
      <p className="text-muted text-sm font-bold leading-relaxed text-center">
        これからのログインに使うパスワードを入力してください。
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-extrabold text-muted">
            あたらしいパスワード
          </span>
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

        {/* 押せない理由が分かるように、ボタンの無効化とセットで出す
            （`app/settings/PasswordForm.tsx` と同じ作り） */}
        {mismatch && (
          <p className="text-xs font-bold text-danger">
            2つのあたらしいパスワードがそろっていません。
          </p>
        )}
        {error && <p className="text-danger text-sm">{error}</p>}

        <button
          type="submit"
          disabled={!ready}
          className="rounded-2xl bg-brand border-b-5 border-brand-deep text-white font-extrabold tracking-wide py-3.5 active:translate-y-[3px] active:border-b-2 disabled:bg-locked disabled:border-locked-edge disabled:text-locked-ink disabled:active:translate-y-0 disabled:active:border-b-5"
        >
          {loading ? "設定中..." : "このパスワードにする"}
        </button>
      </form>

      {/* リンクは語の途中で折り返させない（幅320px で「送り直 / す」に割れる） */}
      <p className="text-muted text-sm font-bold text-center">
        期限が切れていたときは
        <Link
          href="/forgot-password"
          className="text-brand-deep font-extrabold ml-1 whitespace-nowrap"
        >
          メールを送り直す
        </Link>
      </p>
    </>
  );
}
