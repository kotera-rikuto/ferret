import { MascotMotion } from "@/components/ui/MascotMotion";

/**
 * 読み込み中の骨組みの部品。**各画面の `loading.tsx` からだけ使う**（E14・2026-09-12）。
 *
 * 置き場所をここにしてあるのは、骨組みが**2画面に分かれて育つのを防ぐ**ため。
 * 灰色の角丸を各 `loading.tsx` に直接書くと、片方だけ色や丸みが変わっても
 * 誰も気づかない（並べて見る機会が無い ── 読み込み中は一度に1画面しか出ない）。
 *
 * ⚠️ **ここに文字を書かないこと。** 「読み込み中」「お待ちください」のような
 * 文言を骨組みに入れると、**0.1秒で消える回にも一瞬だけ文字が出る。**
 * ちらつきは「何かに失敗した」ように見えるので、形と動きだけで伝える。
 * マスコットが「待っている」を名乗る役割を持っている（採点待ちと同じ顔・同じ動き）。
 */

/** 灰色の角丸。`className` で大きさを決める（幅・高さは呼ぶ側の責任） */
export function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-skeleton rounded-xl bg-line/70 ${className}`}
    />
  );
}

/**
 * 待っていることを名乗るマスコット。**採点待ち（`MascotMotion motion="thinking"`）と同じもの。**
 *
 * 別の絵にしない ── 「フェレットが考えている」＝「待つ場面」という結び付きは
 * 採点待ちで既に作ってあるので、読み込み中に違う絵を出すと意味を二重に覚えさせることになる。
 *
 * 読み上げには `aria-busy` と 1つだけの説明で伝える。骨組みの角丸は
 * すべて `aria-hidden` なので、読み上げられるのはこの一言だけになる。
 */
export function WaitingMascot({ className = "w-24" }: { className?: string }) {
  return (
    <div role="status" className="flex flex-col items-center">
      <MascotMotion motion="thinking" className={className} />
      <span className="sr-only">よみこみ中</span>
    </div>
  );
}
