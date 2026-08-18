"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DELETE_CONFIRM_WORD } from "@/lib/account";

/**
 * 退会（アカウント削除）。
 *
 * **確認を2つ求める**（オーナー判断 2026-08-19）。
 *   - 「{DELETE_CONFIRM_WORD}」の入力 … 押し間違いを防ぐ
 *   - パスワードの再入力     … 離席した端末を触った他人を防ぐ
 * 片方だけでは片方の事故しか防げない。**本当の検証はサーバー側**
 * （`/api/account/delete`）で行い、ここは入口を絞るだけ。
 *
 * 手続きは折りたたんでおく。設定画面を開いただけで
 * 取り消せないボタンが目の前にある状態を避けるため。
 */
export function DeleteAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ready = confirm.trim() === DELETE_CONFIRM_WORD && password.length > 0 && !loading;

  async function handleDelete() {
    if (!ready) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, password }),
      });

      if (!res.ok) {
        // サーバーが返した理由をそのまま出す。
        // 「退会できませんでした」に潰すと、パスワードが違うのか
        // 通信が届かなかったのかが分からず、次の手が打てない
        const body = await res.json().catch(() => null);
        setError(
          body?.error ??
            "退会の手続きが完了しませんでした。時間をおいてもう一度お試しください。",
        );
        setLoading(false);
        return;
      }

      // セッション Cookie はサーバー側で落としてある。
      // タイトル画面へ移ったうえで `refresh()` まで呼ぶのは、
      // **ログイン中に描いた画面がクライアント側のキャッシュに残るため。**
      // 消さずに戻ると、退会したのに前の画面が見えることがある
      router.push("/");
      router.refresh();
    } catch {
      setError("通信が届きませんでした。接続を確認してもう一度お試しください。");
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border-2 border-line bg-panel p-6">
      <h2 className="mb-1.5 text-sm font-extrabold">退会</h2>
      <p className="mb-4 text-xs font-bold leading-relaxed text-muted">
        アカウントと、これまでの記録をすべて削除します。もとに戻すことはできません。
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-2xl border-2 border-line border-b-4 bg-panel px-6 py-2.5 text-sm font-extrabold text-muted active:translate-y-[2px] active:border-b-2"
        >
          退会の手続きへ
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 何が消えるかを先に見せる。プライバシーポリシー第7条・利用規約第12条と同じ範囲 */}
          <div className="rounded-xl border-2 border-line bg-bg-deep p-4">
            <p className="mb-2 text-xs font-extrabold">消えるもの</p>
            <ul className="flex flex-col gap-1 text-xs font-bold leading-relaxed text-muted">
              <li>・ログイン情報（同じメールアドレスで、あらためて登録できます）</li>
              <li>・これまでの回答と、その採点結果</li>
              <li>・すすみぐあい（クリアしたステージ・レベル・つづけた日数）</li>
              <li>・送ってもらった報告や、採点についての申し立て</li>
            </ul>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-muted">
              確認のため「{DELETE_CONFIRM_WORD}」と入力してください
            </span>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-muted">
              パスワード（ご本人の確認のため）
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border-2 border-line bg-panel px-4 py-3 text-sm font-bold outline-none focus:border-brand"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={!ready}
              className="rounded-2xl border-b-5 border-red-800 bg-red-600 px-8 py-3 text-sm font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2 disabled:cursor-not-allowed disabled:border-locked-edge disabled:bg-locked disabled:text-locked-ink disabled:active:translate-y-0 disabled:active:border-b-5"
            >
              {loading ? "手続き中..." : "退会する"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setPassword("");
                setError("");
              }}
              disabled={loading}
              className="text-sm font-bold text-muted hover:text-ink"
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
