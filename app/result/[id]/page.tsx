"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

function getFeedback(score: number): string {
  if (score >= 90)
    return "完璧な読み取りです！コードの意図まで正確に捉えられています。";
  if (score >= 70)
    return "よく読めています！細かい部分まで丁寧に説明できています。";
  if (score >= 50)
    return "大筋は合っています。もう少し処理の流れを詳しく説明してみましょう。";
  if (score >= 30)
    return "ポイントには近づいています。コードを1行ずつ追って読んでみましょう。";
  return "もう一度コードをじっくり読んでみましょう。どんな値が使われているか確認してみてください。";
}

export default function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ score?: string }>;
}) {
  const router = useRouter();
  const { score: scoreParam } = use(searchParams);
  const score = Number(scoreParam ?? 0);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* スコア */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-zinc-400 text-sm">スコア</span>
          <span className="text-amber-400 text-9xl font-bold">{score}</span>
          <span className="text-zinc-500 text-sm">/ 100</span>
        </div>

        {/* 合否 */}
        <div
          className={`px-6 py-2 rounded-full text-sm font-semibold ${
            score >= 65
              ? "bg-amber-400/20 text-amber-400"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {score >= 65 ? "クリア！" : "もう一度挑戦しよう"}
        </div>

        {/* フィードバック */}
        <div className="bg-zinc-900 rounded-xl p-5 w-full">
          <p className="text-zinc-300 text-sm leading-relaxed">
            {getFeedback(score)}
          </p>
        </div>

        {/* ボタン */}
        <div className="flex flex-col gap-3 w-full">
          {/* 振り返りボタン: MVP後に追加。
              有効化する際は引数に params: Promise<{ id: string }> を戻し、
              const { id } = use(params) で取り出すこと */}
          {/* <button
            onClick={() => router.push(`/review/${id}`)}
            className="border border-amber-400 text-amber-400 font-semibold py-3 rounded-full hover:bg-amber-400/10 transition-colors"
          >
            振り返る
          </button> */}
          <button
            onClick={() => router.push("/stages")}
            className="bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full hover:bg-amber-300 transition-colors"
          >
            ステージに戻る
          </button>
        </div>
      </div>
    </div>
  );
}
