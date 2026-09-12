import { Bone, WaitingMascot } from "@/components/ui/LoadingSkeleton";

/**
 * ステージ選択の読み込み中（E14・2026-09-12）。
 *
 * **このファイルがあるかどうかで「押した直後に画面が変わるか」が決まる。**
 * 無いと Next.js はサーバーの処理が終わるまで**前の画面を出したまま**にするので、
 * 押しても何も起きないように見える（本番の実測で 1.3 秒）。
 *
 * おまけに、これがあると Next.js はこの画面を**先読みできるようになる**
 * （動的な画面の先読みは loading があるときだけ部分的に行われる。
 * `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`）。
 *
 * ⚠️ **本物（`page.tsx`）と同じ骨格にしてあること。** 外側の grid の列幅・余白を
 * 揃えていないと、中身が届いた瞬間に画面全体がガタッと動く。
 * `page.tsx` の外枠を変えたらここも直すこと。
 */
export default function Loading() {
  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 gap-8 px-6 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
      {/* 左のサイドバー（lg 以上だけ）。AppSidebar と同じ枠・同じ余白 */}
      <aside className="hidden h-dvh flex-col gap-1.5 border-r-2 border-line py-7 pr-4 pl-2 lg:flex">
        <Bone className="mx-4 mb-5 h-9 w-32" />
        <Bone className="h-11" />
        <Bone className="h-11" />
        <Bone className="h-11" />
        <div className="flex-1" />
        <Bone className="h-12" />
      </aside>

      <main className="flex flex-col gap-5 py-5">
        {/* 狭い画面の数字の帯（レベル / つづけた日数 / すすみぐあい）と同じ高さ */}
        <div className="flex h-15 items-center gap-2 lg:hidden">
          <Bone className="h-13 flex-1" />
          <Bone className="h-13 flex-[1.35]" />
          <Bone className="h-13 flex-1" />
        </div>

        {/*
         * マップ。**本物のように丸を左右に振らない。**
         * 骨組みの丸が実際のステージと違う位置に出ると、中身が届いた瞬間に
         * 全部が横へ滑る。中央に揃えておけば、動くのは横位置だけで済む。
         */}
        <div className="flex flex-col items-center gap-6 py-6">
          <WaitingMascot className="w-24" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2.5">
              <Bone className="size-19 rounded-full" />
              <Bone className="h-3.5 w-36" />
            </div>
          ))}
        </div>
      </main>

      {/* 右の欄（lg 以上だけ）。レベル・つづけた日数・きょうの AI 採点・すすみぐあい */}
      <aside className="hidden h-dvh flex-col gap-4 border-l-2 border-line py-9 pl-5 lg:flex">
        <Bone className="h-28 rounded-2xl" />
        <Bone className="h-24 rounded-2xl" />
        <Bone className="h-32 rounded-2xl" />
        <Bone className="h-28 rounded-2xl" />
      </aside>
    </div>
  );
}
