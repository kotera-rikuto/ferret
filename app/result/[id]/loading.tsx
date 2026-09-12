import { Bone, WaitingMascot } from "@/components/ui/LoadingSkeleton";

/**
 * リザルトの読み込み中（E14・2026-09-12）。理由は `app/stages/loading.tsx` の冒頭に書いた。
 *
 * ⚠️ **点数の桁を骨組みで模さないこと。** ここに「88 / 100」のような形の枠を
 * 出すと、届いた点数と大きさが違ったときに数字が飛び跳ねる。
 * 3つの枠だけを置いて、中は空にしてある。
 *
 * ⚠️ **祝う動き（`cheer`）は使わない。** クリアしたかどうかはまだ分かっていない。
 * 先に喜ぶ絵を出すと、届かなかった回に**一度祝ってから取り消す**ことになる。
 * 待っている顔（採点待ちと同じ `thinking`）で揃える。
 */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center gap-5 px-6 py-12">
      <WaitingMascot className="w-32" />

      {/* 見出し（「クリア！」など）の場所 */}
      <Bone className="h-10 w-56" />

      {/* 点数の3枠（AI / キーワード / 合計）。本物と同じ横並び */}
      <div className="flex w-full gap-3">
        <Bone className="h-24 flex-1 rounded-2xl" />
        <Bone className="h-24 flex-1 rounded-2xl" />
        <Bone className="h-24 flex-1 rounded-2xl" />
      </div>

      {/* XP のバー */}
      <Bone className="h-14 w-full rounded-2xl" />

      {/* フェレットのメモ */}
      <Bone className="h-44 w-full rounded-2xl" />

      {/* 下のボタン */}
      <Bone className="h-13 w-full rounded-2xl" />
    </main>
  );
}
