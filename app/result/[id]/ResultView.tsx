"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mascot } from "@/components/ui/Mascot";
import { IconPaw } from "@/components/ui/icons";
import {
  COMMENT_MAX_CHARS,
  COMMENT_MIN_CHARS,
  type FeedbackKind,
} from "@/lib/feedback";
// 型だけを読み込む。計算は page.tsx（サーバー）側で済ませてあるので、
// しきい値や配点をブラウザへ送らずに済む
import type { XpView } from "@/lib/progress/level";

type Props = {
  problemId: number;
  attemptId: string;
  totalScore: number;
  keywordScore: number;
  deepScore: number;
  feedback: string | null;
  cleared: boolean;
  perfect: boolean;
  /** 結論が反転していると判定された回（`user_attempts.contradiction`） */
  contradiction: boolean;
  xp: XpView;
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
 *
 * さらに読み違い（結論の反転）を検出した回だけ、チップと文章の**順番と大きさを入れ替える**。
 * この場面は3枠すべてが 0 で並ぶうえ、本人は真面目に読んで結論だけが逆になっている。
 * 点数は消さず1行に畳み、「次に見る場所」を主役にする（残課題 §5 / タスク E6）。
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
  contradiction,
  xp,
}: Props) {
  /**
   * 見せ方を控えめにする回。
   *
   * 読み違いに絞っているのは、点数で線を引くと「あと一歩」の回まで巻き込むため。
   * `cleared` を条件に入れているのは、矛盾が申告のみで裏が取れない場合の上限が
   * 40点で、将来クリア閾値を下げたときに「クリアなのに控えめ」が生まれないようにするため。
   * 文章が無いときに畳むと画面が空になるので、そのときは通常の並びに戻す。
   */
  const softened = contradiction && !cleared && Boolean(feedback);
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
  const [countUp, setCountUp] = useState(0);
  useEffect(() => {
    // 控えめにする回では数えない。数字が動くと視線がそこに集まり、
    // 主役を入れ替えた意味が消える
    if (softened) return;
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const t = Math.min((now - start) / 900, 1);
      setCountUp(Math.round(totalScore * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalScore, softened]);

  // 演出を止めた回は真値をそのまま出す（0 のまま止まって見えないように）
  const shownScore = softened ? totalScore : countUp;

  /**
   * スコアの3項目。チップと1行の2通りで**同じ数字**を出すために配列にしてある。
   *
   * `accent` を文字列そのままで持っているのは Tailwind の都合。
   * `bg-${...}` のように組み立てるとクラスが生成されず色が消えるので、
   * 完全なクラス名のままここに書いておく必要がある。
   */
  const stats = [
    { label: "スコア", value: shownScore, max: 100, accent: "bg-brand" },
    { label: "キーワード", value: keywordScore, max: 20, accent: "bg-brand-soft" },
    { label: "AI 採点", value: deepScore, max: 80, accent: "bg-brand-soft" },
  ];

  const scoreChips = (
    <div className="flex w-full gap-3.5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex-1 overflow-hidden rounded-2xl border-2 border-b-5 border-line bg-panel text-center"
        >
          <span
            className={`block ${s.accent} py-1.5 text-[11px] font-extrabold tracking-widest text-white`}
          >
            {s.label}
          </span>
          <span className="block px-1 py-3.5 text-[28px] font-extrabold">
            {s.value}
            <span className="text-[13px] font-bold text-muted"> / {s.max}</span>
          </span>
        </div>
      ))}
    </div>
  );

  // 控えめにする回の点数。**隠さない。** 見えないと「ごまかされた」と受け取られる。
  // 大きさと配置だけを変え、探せば分かる場所に残す
  const scoreLine = (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
      {stats.map((s) => (
        <span key={s.label} className="text-xs font-bold">
          <span className="text-muted">{s.label}</span>{" "}
          <span className="text-ink">{s.value}</span>
          <span className="text-locked-ink"> / {s.max}</span>
        </span>
      ))}
    </div>
  );

  const feedbackPanel = feedback ? (
    <div
      className={`flex w-full flex-col gap-3 rounded-2xl border-2 border-line bg-panel ${
        softened ? "border-b-5 p-7" : "p-6"
      }`}
    >
      <h2
        className={`flex items-center gap-2 font-extrabold ${
          softened ? "text-[15px]" : "text-sm"
        }`}
      >
        <Mascot className={softened ? "w-7.5 h-7.5" : "w-6.5 h-6.5"} />
        フェレットのメモ
      </h2>
      <p className={`leading-loose ${softened ? "text-[15px]" : "text-sm"}`}>
        {feedback}
      </p>
    </div>
  ) : null;

  // XP バーは「この回答を出す前の位置」から動かす。
  // 0 から動かすと、増えていない回でも増えたように見えてしまう。
  //
  // レベルをまたいだ回は、右端まで満たす → 一瞬で空にする → 新しいレベルのぶんを満たす。
  // 前の位置から新しい位置へ直接動かすと（90% → 0%）バーが**縮んで**見え、
  // 増えたのに減ったように映る。
  //
  // なお「レベル◯になった」という文は出さない。XP は回答ログから毎回導出しているので、
  // ここでの「前の状態」は**この問題ぶんを引いた値**であって、
  // その回答をした時点の値ではない。後から別の問題をクリアしたあとにこの画面を開くと、
  // レベルが上がった回として複数の画面が名乗り出てしまう。
  // 動きは演出（クリア時の紙吹雪と同じ扱い）だが、文にすると事実の主張になる
  const leveledUp = xp.now.level > xp.before.level;
  const [xpFill, setXpFill] = useState(xp.before.percent);
  // 空に戻す一瞬だけトランジションを切る（切らないと右端から左端へ滑って戻る）
  const [xpSnap, setXpSnap] = useState(false);

  useEffect(() => {
    // スコアのカウントアップ（900ms）が終わってから動かす。同時に動くと視線が散る
    const timers = [
      setTimeout(() => setXpFill(leveledUp ? 100 : xp.now.percent), 900),
    ];
    if (leveledUp) {
      timers.push(
        setTimeout(() => {
          setXpSnap(true);
          setXpFill(0);
        }, 1700),
        setTimeout(() => {
          setXpSnap(false);
          setXpFill(xp.now.percent);
        }, 1760),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [leveledUp, xp.now.percent]);

  /* XP バー。最高点を伸ばしたぶんだけ増える（lib/progress/level.ts）。
     増えなかった回でもバーは出す ── 一度貯まったものは減らない、という
     見せ方に揃えるため、「+0 XP」ではなくバッジを出さないだけにしてある。

     読み違いのときは点数と一緒に文章の下へ回す（数字の並びを1か所にまとめる） */
  const xpBar = (
    <div className="flex w-full flex-col gap-2.5 rounded-2xl border-2 border-line bg-panel px-5 py-4">
      <div className="flex items-center gap-3.5">
        <IconPaw size={26} className="shrink-0 text-brand" />
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-brand-tint">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-brand to-brand-soft ${
              xpSnap ? "" : "transition-[width] duration-700 ease-out"
            }`}
            style={{ width: `${xpFill}%` }}
          />
        </div>
        {xp.gain > 0 && (
          <span className="shrink-0 text-sm font-extrabold text-brand-deep">
            +{xp.gain} XP
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between text-xs font-bold text-muted">
        <span className="font-extrabold text-ink">レベル {xp.now.level}</span>
        <span>つぎのレベルまで あと {xp.now.xpToNext} XP</span>
      </div>
    </div>
  );

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

        {/* 点数・XP・文章。読み違いのときだけ順番を入れ替え、文章を主役にする。
            文章そのものは praise / next_focus を結合済みの ai_feedback（1枠）。
            2枠に分けるのは保存形式の変更待ち（design/移植残タスク.md・E2） */}
        {softened ? (
          <>
            {feedbackPanel}
            {scoreLine}
            {xpBar}
          </>
        ) : (
          <>
            {scoreChips}
            {xpBar}
            {feedbackPanel}
          </>
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
