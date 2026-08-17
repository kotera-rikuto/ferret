"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mascot } from "@/components/ui/Mascot";
import {
  COMMENT_MAX_CHARS,
  COMMENT_MIN_CHARS,
  type FeedbackKind,
} from "@/lib/feedback";

type Props = {
  problemId: number;
  attemptId: string;
  totalScore: number;
  keywordScore: number;
  deepScore: number;
  feedback: string | null;
  cleared: boolean;
  perfect: boolean;
};

type ReportState = "idle" | "sending" | "sent";

/**
 * 理由の記入を必須にしている（COMMENT_MIN_CHARS 以上）。
 * ボタン1つで送れると意地悪の連打と本当の報告を区別できず、
 * 書く手間そのものが本気度のフィルタになるため
 */
const REPORT_FORMS: Record<
  FeedbackKind,
  { label: string; title: string; hint: string }
> = {
  score_dispute: {
    label: "採点に納得できない",
    title: "採点への異議",
    hint: "どこを正しく読めていたと考えるか、コードを根拠に書いてください。いただいた内容は採点の改善にそのまま使います。",
  },
  problem_error: {
    label: "問題の誤りを報告",
    title: "問題の誤りを報告",
    hint: "どこが誤っていそうか教えてください（誤字、コードと設問の食い違いなど）。",
  },
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
  attemptId,
  totalScore,
  keywordScore,
  deepScore,
  feedback,
  cleared,
  perfect,
}: Props) {
  // 異議申し立て・誤り報告。2種で状態を分けるのは、片方を送った後も
  // もう片方を送れるようにするため
  const [reports, setReports] = useState<Record<FeedbackKind, ReportState>>({
    score_dispute: "idle",
    problem_error: "idle",
  });
  const [openKind, setOpenKind] = useState<FeedbackKind | null>(null);
  const [comment, setComment] = useState("");
  const [reportError, setReportError] = useState("");

  function openReport(kind: FeedbackKind) {
    setOpenKind(kind);
    setComment("");
    setReportError("");
  }

  async function sendReport(kind: FeedbackKind) {
    setReports((prev) => ({ ...prev, [kind]: "sending" }));
    setReportError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem_id: problemId,
          attempt_id: attemptId,
          kind,
          comment,
        }),
      });
      if (!res.ok) {
        // サーバーが返した理由をそのまま出す（ProblemForm と同じ方針）
        const body = await res.json().catch(() => null);
        setReportError(
          body?.error ?? "送信できませんでした。もう一度お試しください。",
        );
        setReports((prev) => ({ ...prev, [kind]: "idle" }));
        return;
      }
      setReports((prev) => ({ ...prev, [kind]: "sent" }));
      setOpenKind(null);
      setComment("");
    } catch {
      setReportError(
        "通信が届きませんでした。接続を確認してもう一度お試しください。",
      );
      setReports((prev) => ({ ...prev, [kind]: "idle" }));
    }
  }

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
        {/* 不合格の画面で喜ばせない。届かなかったときは考えている顔にする */}
        <Mascot
          mood={cleared ? "happy" : "thinking"}
          className="w-32 animate-pop drop-shadow-[0_8px_18px_rgba(74,59,40,0.18)]"
        />
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

        {/* 異議申し立て・誤り報告。控えめに置くが、書かれた理由は
            ゴールデンセット（採点精度の検証）の材料になる重要な導線 */}
        {openKind === null ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-xs font-bold">
            {(Object.keys(REPORT_FORMS) as FeedbackKind[]).map((kind) =>
              reports[kind] === "sent" ? (
                <span key={kind} className="text-muted">
                  「{REPORT_FORMS[kind].label}」を受け取りました。ありがとうございます
                </span>
              ) : (
                <button
                  key={kind}
                  onClick={() => openReport(kind)}
                  className="text-locked-ink underline underline-offset-4 hover:text-muted"
                >
                  {REPORT_FORMS[kind].label}
                </button>
              ),
            )}
          </div>
        ) : (
          <div className="mt-3 flex w-full flex-col gap-3 rounded-2xl border-2 border-line bg-panel p-5">
            <h2 className="text-sm font-extrabold">{REPORT_FORMS[openKind].title}</h2>
            <p className="text-xs font-bold leading-relaxed text-muted">
              {REPORT_FORMS[openKind].hint}
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="理由を入力してください..."
              className="resize-y rounded-xl border-2 border-line bg-panel px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-brand placeholder:text-locked-ink"
            />
            {reportError && <p className="text-red-600 text-xs">{reportError}</p>}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted">
                {comment.trim().length < COMMENT_MIN_CHARS
                  ? `あと ${COMMENT_MIN_CHARS - comment.trim().length} 文字`
                  : `${comment.trim().length} / ${COMMENT_MAX_CHARS}`}
              </span>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setOpenKind(null)}
                  className="rounded-xl border-2 border-line px-4 py-2 text-xs font-extrabold text-muted hover:bg-bg-deep"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => sendReport(openKind)}
                  disabled={
                    comment.trim().length < COMMENT_MIN_CHARS ||
                    comment.trim().length > COMMENT_MAX_CHARS ||
                    reports[openKind] === "sending"
                  }
                  className="rounded-xl border-b-4 border-brand-deep bg-brand px-6 py-2 text-xs font-extrabold text-white active:translate-y-[2px] active:border-b-2 disabled:border-locked-edge disabled:bg-locked disabled:text-locked-ink"
                >
                  送信する
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
