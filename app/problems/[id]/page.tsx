"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";

const mockProblem = {
  id: 3,
  title: "配列の操作",
  code: `const numbers = [1, 2, 3, 4, 5];

const result = numbers.filter(n => n % 2 === 0);

console.log(result);`,
  question: "このコードは何をしていますか？処理の流れを説明してください。",
};

export default function ProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!answer.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_id: Number(id), answer }),
      });
      if (!res.ok) throw new Error("scoring failed");
      const { score } = await res.json();
      router.push(`/result/${id}?score=${score}`);
    } catch {
      alert("採点中にエラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-12 gap-8">
        <h1 className="text-zinc-50 text-xl font-bold">{mockProblem.title}</h1>

        {/* コード表示 */}
        <div className="bg-zinc-900 rounded-xl p-6">
          <pre className="text-zinc-300 text-sm font-mono leading-relaxed overflow-x-auto">
            <code>{mockProblem.code}</code>
          </pre>
        </div>

        {/* 設問 */}
        <p className="text-zinc-300 text-sm">{mockProblem.question}</p>

        {/* 回答入力 */}
        <div className="flex flex-col gap-4">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="回答を入力してください..."
            rows={5}
            className="bg-zinc-900 text-zinc-50 px-4 py-3 rounded-xl outline-none resize-none text-sm leading-relaxed"
          />
          <button
            onClick={handleSubmit}
            disabled={!answer.trim() || loading}
            className="bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "採点中..." : "回答する"}
          </button>
        </div>
      </div>
    </div>
  );
}
