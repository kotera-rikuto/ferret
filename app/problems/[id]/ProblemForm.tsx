"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ANSWER_MIN_CHARS, ANSWER_MAX_CHARS } from "@/lib/ai/compose";
import { IconInfo } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

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
    <div className="flex flex-col gap-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="回答を入力してください..."
        rows={7}
        className="resize-y rounded-2xl border-2 border-line bg-panel px-4.5 py-4 text-[15px] leading-loose outline-none focus:border-brand placeholder:text-locked-ink"
      />

      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-muted">
          {tooShort
            ? `あと ${ANSWER_MIN_CHARS - length} 文字`
            : tooLong
              ? `${length - ANSWER_MAX_CHARS} 文字オーバー`
              : " "}
        </span>
        <span className={tooLong ? "text-red-600" : "text-muted"}>
          {length} / {ANSWER_MAX_CHARS}
        </span>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* 送信は下部固定フッター。スクロール位置に関係なく常に押せる場所に置く */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-panel">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-6 py-4">
          {/* OpenAI 送信の注記は常時表示（仕様書 §9.5 の法務要件） */}
          <p className="flex items-center gap-2 text-[11px] font-bold leading-relaxed text-muted">
            <IconInfo size={15} className="shrink-0" />
            回答は採点のため OpenAI に送信されます。個人情報やひみつのコードは書かないでください。
          </p>
          <button
            onClick={handleSubmit}
            disabled={tooShort || tooLong || loading}
            className="whitespace-nowrap rounded-2xl border-b-5 border-brand-deep bg-brand px-12 py-3.5 text-[15px] font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2 disabled:cursor-not-allowed disabled:border-locked-edge disabled:bg-locked disabled:text-locked-ink disabled:active:translate-y-0 disabled:active:border-b-5"
          >
            回答する
          </button>
        </div>
      </footer>

      {/* 採点待ち。実測 1.2〜4.3 秒かかるので、マスコットの演出で待ち時間を埋める */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg/95">
          <Mascot className="w-36 animate-sniff" />
          <p className="text-base font-extrabold">フェレットがコードを読んでいます</p>
          <div className="flex gap-2">
            <span className="size-2.5 animate-blink rounded-full bg-brand" />
            <span className="size-2.5 animate-blink rounded-full bg-brand [animation-delay:0.2s]" />
            <span className="size-2.5 animate-blink rounded-full bg-brand [animation-delay:0.4s]" />
          </div>
        </div>
      )}
    </div>
  );
}
