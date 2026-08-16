"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mascot } from "@/components/ui/Mascot";

type Props = {
  problemId: number;
  totalScore: number;
  keywordScore: number;
  deepScore: number;
  feedback: string | null;
  cleared: boolean;
  perfect: boolean;
};

/** 紙吹雪の色（ブランド系の3色） */
const CONFETTI_COLORS = ["#f59e0b", "#fbbf24", "#c47000"];

/**
 * リザルトの表示と演出。データ取得は page.tsx（サーバー）側。
 *
 * 巨大なスコア1つではなく統計チップに分けているのは、0点のときに
 * 巨大な「0」が罰のように見える問題（TASKS.md）への対処。
 * チップならキーワード分など「拾えた数字」が横に並ぶ。
 */
export function ResultView({
  problemId,
  totalScore,
  keywordScore,
  deepScore,
  feedback,
  cleared,
  perfect,
}: Props) {
  // スコアのカウントアップ。演出であって真値は totalScore（サーバー由来）
  const [shownScore, setShownScore] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const t = Math.min((now - start) / 900, 1);
      setShownScore(Math.round(totalScore * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalScore]);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* 紙吹雪はクリア時だけ。位置と遅れは添字から決める（乱数だと SSR とズレる） */}
      {cleared && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          {Array.from({ length: 24 }, (_, i) => (
            <i
              key={i}
              className="absolute -top-4 animate-fall rounded-[3px]"
              style={{
                left: `${((i * 4.1 + 2) % 100)}%`,
                width: 8 + (i % 3) * 3,
                height: 14,
                background: CONFETTI_COLORS[i % 3],
                animationDelay: `${(i % 8) * 0.12}s`,
              }}
            />
          ))}
        </div>
      )}

      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center gap-5 px-6 py-12">
        <Mascot className="w-32 animate-pop drop-shadow-[0_8px_18px_rgba(74,59,40,0.18)]" />
        <h1 className="text-4xl font-extrabold tracking-wide text-brand-deep">
          {perfect ? "パーフェクト！" : cleared ? "クリア！" : "もう一度挑戦しよう"}
        </h1>

        {/* 統計チップ */}
        <div className="flex w-full gap-3.5">
          <div className="flex-1 overflow-hidden rounded-2xl border-2 border-b-5 border-line bg-panel text-center">
            <span className="block bg-brand py-1.5 text-[11px] font-extrabold tracking-widest text-white">
              スコア
            </span>
            <span className="block px-1 py-3.5 text-[28px] font-extrabold">
              {shownScore}
              <span className="text-[13px] font-bold text-muted"> / 100</span>
            </span>
          </div>
          <div className="flex-1 overflow-hidden rounded-2xl border-2 border-b-5 border-line bg-panel text-center">
            <span className="block bg-brand-soft py-1.5 text-[11px] font-extrabold tracking-widest text-white">
              キーワード
            </span>
            <span className="block px-1 py-3.5 text-[28px] font-extrabold">
              {keywordScore}
              <span className="text-[13px] font-bold text-muted"> / 20</span>
            </span>
          </div>
          <div className="flex-1 overflow-hidden rounded-2xl border-2 border-b-5 border-line bg-panel text-center">
            <span className="block bg-brand-soft py-1.5 text-[11px] font-extrabold tracking-widest text-white">
              AI 採点
            </span>
            <span className="block px-1 py-3.5 text-[28px] font-extrabold">
              {deepScore}
              <span className="text-[13px] font-bold text-muted"> / 80</span>
            </span>
          </div>
        </div>

        {/* AIフィードバック。praise / next_focus の2枠表示は保存形式の変更待ち
            （design/移植残タスク.md）。当面は結合済みの ai_feedback を1枠で出す */}
        {feedback && (
          <div className="flex w-full flex-col gap-3 rounded-2xl border-2 border-line bg-panel p-6">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <Mascot className="w-6.5 h-6.5" />
              フェレットのメモ
            </h2>
            <p className="text-sm leading-loose">{feedback}</p>
          </div>
        )}

        {/* 主ボタンは1本。もう一方はテキストリンクに格下げして迷いを減らす */}
        <div className="mt-1.5 flex w-full flex-col gap-3.5">
          {cleared ? (
            <>
              <Link
                href="/stages"
                className="rounded-2xl border-b-5 border-brand-deep bg-brand py-3.5 text-center font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2"
              >
                つぎのステージへ
              </Link>
              <div className="flex items-center justify-center gap-7 text-[13px] font-extrabold">
                <Link href={`/problems/${problemId}`} className="text-muted hover:text-ink">
                  もう一度挑む
                </Link>
                <span className="text-muted">
                  ふりかえる
                  <span className="ml-1 rounded-full bg-locked px-1.5 py-0.5 text-[10px] text-locked-ink">
                    準備中
                  </span>
                </span>
              </div>
            </>
          ) : (
            <>
              <Link
                href={`/problems/${problemId}`}
                className="rounded-2xl border-b-5 border-brand-deep bg-brand py-3.5 text-center font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2"
              >
                もう一度挑む
              </Link>
              <div className="flex items-center justify-center gap-7 text-[13px] font-extrabold">
                <Link href="/stages" className="text-muted hover:text-ink">
                  ステージにもどる
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
