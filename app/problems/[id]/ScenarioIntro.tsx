"use client";

import { useEffect, useRef, useState } from "react";
import { IconPaw } from "@/components/ui/icons";

/**
 * 場面（`problems.scenario`）を、問題を開いた直後に1回だけ見せるカード。
 *
 * **なぜ画面の中に置かず、暗い背景の上に重ねるのか**（オーナー判断 2026-09-11）:
 * 場面をコードの上に常設すると、スマホでコードに辿り着くまでのスクロールが伸びる。
 * E11 でスマホの縦を詰めたばかりなので、そこを戻したくない。
 * 重ねる形なら**読ませたいものを一番先に見せて、閉じたあとの画面は今までと1pxも変わらない。**
 *
 * **マスコットは出さない**（オーナー判断 2026-09-11）。この画面は設問を
 * マスコットの吹き出しで出しているので、ここにも置くと同じ形の吹き出しが上下に2つ並び、
 * しかもマスコットが「案内役」と「依頼してきた人」を兼ねることになる。
 * 場面は地の文、設問はマスコットの問いかけ、と役を分ける。
 *
 * ### 決めたこと（同日・オーナー判断）
 *
 * - **閉じたら完全に消す。** 読み返す導線は置かない（上部バーにボタンを残す案は採らなかった）
 * - **毎回出す。** 「初回だけ」にはしない ── 端末に見た記録を残す作りが要るうえ、
 *   リザルトから同じ問題へ戻る導線が2つある（ResultView.tsx）ので、
 *   再挑戦のたびに出る形と、二度と出ない形の差が端末ごとにばらつく
 *
 * この2つを合わせると**保存先が要らない**ので、この部品は状態を外に持たない。
 *
 * ### 採点には渡らない
 *
 * `scenario` は表示専用（`prerequisite` と同じ扱い）。
 * `app/api/score/route.ts` は列を名指しで select しているので、
 * DB に欄が増えても採点プロンプトには入らない。**ここを `select("*")` にしないこと。**
 */
export function ScenarioIntro({ scenario }: { scenario: string }) {
  const [open, setOpen] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  // 開いている間だけ、背後の本文をスクロールさせない。
  // 重ねただけだと、カードの外を指でなぞったときに裏のコードが動いてしまう
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Esc で閉じる。重なりものの定石で、これが無いとキーボードだけの人は
  // ボタンまでフォーカスを運ぶしかない
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // 開いた直後のフォーカスをカードの中へ移す。
  // 置いていかないと、Tab を押したときに当たるのが**裏にいる**上部バーの
  // 「中断してマップへ」になり、閉じるつもりで画面を出てしまう。
  //
  // **ボタンではなくカードそのものに当てる。** ボタンに当てると、
  // マウスで開いただけの人にもフォーカスの枠が出る（`.focus()` は
  // :focus-visible の判定を通してしまう）。カードに当てておけば、
  // Tab を1回押した人にはボタンの枠が出る ── 必要な人にだけ出る
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    // どこを押しても閉じる（オーナーの指定）。カードの上のクリックも
    // ここまで上がってくるので、カード側で止めていない
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenario-intro-label"
      data-scenario-intro
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10"
    >
      {/* `animate-pop` は既存の動き（リザルトのマスコット登場）の使い回し。
          新しい @keyframes を足すと globals.css の prefers-reduced-motion にも
          足す必要があるが（E10）、これは既にその一覧に入っている */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="w-full max-w-md animate-pop rounded-3xl border-2 border-line bg-panel px-6 py-7 outline-none sm:px-8"
      >
        <p
          id="scenario-intro-label"
          className="flex items-center gap-2 text-xs font-extrabold tracking-widest text-brand-deep"
        >
          <IconPaw size={16} />
          こんな場面です
        </p>

        <p className="mt-4 text-base font-bold leading-loose whitespace-pre-line">
          {scenario}
        </p>

        <button
          type="button"
          className="mt-7 w-full rounded-2xl border-b-5 border-brand-deep bg-brand px-8 py-3.5 text-[15px] font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2"
        >
          コードを読む
        </button>
      </div>
    </div>
  );
}
