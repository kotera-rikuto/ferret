"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Stage = {
  id: number;
  order: number;
  title: string;
  status: "cleared" | "current" | "locked";
};

const POSITIONS = [0.78, 0.18, 0.62, 0.28, 0.8, 0.15, 0.58, 0.35];
const ROW_HEIGHT = 130;
const CIRCLE_SIZE = 64;

export function StageMap({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);

  function handleStageClick(stage: Stage) {
    if (stage.status === "locked") return;
    setSelectedStage(stage);
  }

  function handleStart() {
    if (!selectedStage) return;
    router.push(`/problems/${selectedStage.id}`);
  }

  // 下から上に登るマップなので表示順を反転する
  const displayStages = [...stages].reverse();
  const getPos = (index: number) => POSITIONS[index % POSITIONS.length];
  const totalHeight = displayStages.length * ROW_HEIGHT + CIRCLE_SIZE;

  return (
    <>
      <div className="relative w-2/3 mx-auto" style={{ height: totalHeight }}>
        <svg
          className="absolute inset-0 w-full"
          style={{ height: totalHeight, overflow: "visible" }}
        >
          {displayStages.map((_, index) => {
            if (index === displayStages.length - 1) return null;
            const nextStage = displayStages[index + 1];
            return (
              <line
                key={`line-${index}`}
                x1={`${getPos(index) * 100}%`}
                y1={index * ROW_HEIGHT + CIRCLE_SIZE}
                x2={`${getPos(index + 1) * 100}%`}
                y2={(index + 1) * ROW_HEIGHT}
                stroke={
                  nextStage.status === "locked"
                    ? "#3f3f46"
                    : "rgba(251,191,36,0.5)"
                }
                strokeWidth={2}
                strokeDasharray={
                  nextStage.status === "locked" ? "6 4" : undefined
                }
              />
            );
          })}
        </svg>

        {displayStages.map((stage, index) => (
          <div
            key={stage.id}
            style={{
              position: "absolute",
              top: index * ROW_HEIGHT,
              left: `${getPos(index) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <button
              onClick={() => handleStageClick(stage)}
              disabled={stage.status === "locked"}
              className={`flex flex-col items-center gap-1 transition-all ${
                stage.status === "locked"
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:scale-110 cursor-pointer"
              }`}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl border-4 ${
                  stage.status === "cleared"
                    ? "bg-amber-400 border-amber-300"
                    : stage.status === "current"
                      ? "bg-zinc-800 border-amber-400 animate-pulse"
                      : "bg-zinc-900 border-zinc-700"
                }`}
              >
                {stage.status === "cleared" && "✅"}
                {stage.status === "current" && "🐾"}
                {stage.status === "locked" && "🔒"}
              </div>
              <span className="text-amber-400/60 text-xs">
                Stage {stage.order}
              </span>
              <span
                className={`text-xs font-medium text-center w-24 leading-tight ${
                  stage.status === "locked" ? "text-zinc-600" : "text-zinc-300"
                }`}
              >
                {stage.title}
              </span>
            </button>
          </div>
        ))}
      </div>

      {selectedStage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-8">
          <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-sm flex flex-col gap-6">
            <h2 className="text-zinc-50 text-xl font-bold text-center">
              {selectedStage.title}
            </h2>
            <p className="text-zinc-400 text-sm text-center">
              {selectedStage.status === "cleared"
                ? "このステージを復習しますか？"
                : "このステージに挑みますか？"}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleStart}
                className="bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full hover:bg-amber-300 transition-colors"
              >
                {selectedStage.status === "cleared" ? "復習する" : "挑む"}
              </button>
              <button
                onClick={() => setSelectedStage(null)}
                className="border border-zinc-700 text-zinc-400 py-3 rounded-full hover:bg-zinc-800 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
