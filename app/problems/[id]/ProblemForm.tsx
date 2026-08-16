"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ANSWER_MIN_CHARS, ANSWER_MAX_CHARS } from "@/lib/ai/compose";

// model_answer / rubric_items は意図的に含めない。
// クライアントに渡すと模範回答が見えてしまう
export type ProblemForDisplay = {
  id: number;
  title: string;
  code: string;
  question: string;
};

export function ProblemForm({ problem }: { problem: ProblemForDisplay }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const length = answer.trim().length;
  const tooShort = length < ANSWER_MIN_CHARS;
  const tooLong = length > ANSWER_MAX_CHARS;

  async function handleSubmit() {
    if (tooShort || tooLong) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_id: problem.id, answer }),
      });

      if (!res.ok) {
        // サーバーが返した理由をそのまま出す。
        // 「採点中にエラーが発生しました」に潰すと、文字数不足なのか
        // 通信障害なのかが分からず、直しようがなくなる
        const body = await res.json().catch(() => null);
        setError(
          body?.error ??
            "採点が完了しませんでした。入力はそのままなので、もう一度お試しください。",
        );
        setLoading(false);
        return;
      }

      // スコアはリザルト画面が user_attempts から読むのでURLには載せない
      router.push(`/result/${problem.id}`);
    } catch {
      // 入力は保持したまま再挑戦できるようにする
      setError("通信が届きませんでした。接続を確認してもう一度お試しください。");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="回答を入力してください..."
        rows={5}
        className="bg-zinc-900 text-zinc-50 px-4 py-3 rounded-xl outline-none resize-none text-sm leading-relaxed"
      />

      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">
          {tooShort
            ? `あと ${ANSWER_MIN_CHARS - length} 文字`
            : tooLong
              ? `${length - ANSWER_MAX_CHARS} 文字オーバー`
              : " "}
        </span>
        <span className={tooLong ? "text-red-400" : "text-zinc-600"}>
          {length} / {ANSWER_MAX_CHARS}
        </span>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={tooShort || tooLong || loading}
        className="bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "採点中..." : "回答する"}
      </button>
      <p className="text-zinc-500 text-xs text-center">
        回答は採点のため OpenAI に送信されます
      </p>
    </div>
  );
}
