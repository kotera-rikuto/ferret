"use client";

import { useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
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

/** localStorage の下書きを初回描画で読むための購読なしストア。サーバー描画時は null */
const subscribeNothing = () => () => {};

export function ProblemForm({ problem }: { problem: ProblemForDisplay }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 注記を回答欄の説明として結び付けるための id（下の noticeId の用途は E-455 の注参照）
  const noticeId = useId();

  // 書きかけの回答は端末に残す。×やリロードの一発で長文が消えるのは
  // 解約級の体験なので、確認ダイアログではなく「消えない」ほうで守る。
  // effect での setState は lint（react-hooks/set-state-in-effect）で禁止なので、
  // 「編集前は下書き、編集し始めたら編集値」の合成で復元する
  const draftKey = `ferret:draft:${problem.id}`;
  const storedDraft = useSyncExternalStore(
    subscribeNothing,
    () => localStorage.getItem(draftKey),
    () => null,
  );
  const [edited, setEdited] = useState<string | null>(null);
  const answer = edited ?? storedDraft ?? "";
  const restored = edited === null && Boolean(storedDraft);

  function handleChange(value: string) {
    setEdited(value);
    if (value) localStorage.setItem(draftKey, value);
    else localStorage.removeItem(draftKey);
  }

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

      // 採点まで終わった回答の下書きは役目を終えたので消す
      localStorage.removeItem(draftKey);
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
        onChange={(e) => handleChange(e.target.value)}
        placeholder="回答を入力してください..."
        rows={7}
        // OpenAI 送信の注記を、この欄の説明として結び付ける。
        // 注記は DOM 上では送信ボタンの後ろにある（E-455 の対処。下のフッター参照）ので、
        // 読み上げで順に辿ると「書いた後」に流れてしまう。ここで結び付けておけば
        // 回答欄に入った時点で読まれ、書き始める前に届く
        aria-describedby={noticeId}
        className="resize-y rounded-2xl border-2 border-line bg-panel px-4.5 py-4 text-[15px] leading-loose outline-none focus:border-brand placeholder:text-locked-ink"
      />

      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-muted">
          {restored
            ? "前回の下書きを復元しました"
            : tooShort
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
        {/*
         * **並び順に意味がある（E-455）。**
         *
         * DOM 上は 送信ボタン → 注記 の順で、見た目だけ flex の order で入れ替えている。
         * 素直に「注記 → ボタン」と書くと、回答欄から Tab を1回押したときに当たるのが
         * 注記の中の「くわしく」リンクになり、**キーボードだけで「入力 → Tab → Enter」と
         * 送信できる導線が1手増える**（C2 でリンクを足したときに起きた）。
         * 見た目の左右は order で保つので、目で見える並びは変わらない。
         *
         * 読み上げの順が変わる点は、回答欄の aria-describedby で補っている（上の textarea）。
         */}
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-6 py-4">
          <button
            onClick={handleSubmit}
            disabled={tooShort || tooLong || loading}
            className="order-2 whitespace-nowrap rounded-2xl border-b-5 border-brand-deep bg-brand px-12 py-3.5 text-[15px] font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2 disabled:cursor-not-allowed disabled:border-locked-edge disabled:bg-locked disabled:text-locked-ink disabled:active:translate-y-0 disabled:active:border-b-5"
          >
            回答する
          </button>
          {/*
           * OpenAI 送信の注記は常時表示（仕様書 §9.5 の法務要件）。
           *
           * 送信の根拠と範囲はプライバシーポリシー第3条に書いてある。
           * 別タブで開くのは、回答を書いている途中に画面を差し替えないため
           * （下書きは localStorage に残るが、書きかけの人を動かさないほうがよい）。
           */}
          <p
            id={noticeId}
            className="order-1 flex items-center gap-2 text-[11px] font-bold leading-relaxed text-muted"
          >
            <IconInfo size={15} className="shrink-0" />
            <span>
              回答は採点のため OpenAI に送信されます。個人情報やひみつのコードは書かないでください。
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-deep underline ml-1 whitespace-nowrap"
              >
                くわしく
              </Link>
            </span>
          </p>
        </div>
      </footer>

      {/* 採点待ち。実測 1.2〜4.3 秒かかるので、マスコットの演出で待ち時間を埋める */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg/95">
          <Mascot mood="thinking" className="w-36 animate-sniff" />
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
