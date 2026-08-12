"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// model_answer / ai_rubric は意図的に含めない。
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

  async function handleSubmit() {
    if (!answer.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_id: problem.id, answer }),
      });
      if (!res.ok) throw new Error("scoring failed");
      // スコアはリザルト画面が user_attempts から読むのでURLには載せない
      router.push(`/result/${problem.id}`);
    } catch {
      // 入力は保持したまま再挑戦できるようにする
      setError("採点中にエラーが発生しました。もう一度お試しください。");
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
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={!answer.trim() || loading}
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
