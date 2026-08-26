import Link from "next/link";
import { IconChevronDown } from "@/components/ui/icons";
import { ChangelogList } from "@/components/changelog/ChangelogList";
import { latestChangelog } from "@/lib/changelog";

/**
 * 上部バーの「更新情報」。押すと最新ぶんの見出しが下に開く（tasks/E12・オーナー指摘 2026-08-26）。
 *
 * **`<details>` で開閉する。JavaScript を1行も足していない**（`components/lp/Faq.tsx` と同じ作り）。
 * `LpHeader` の「開閉するメニューは作らない」は**自前で開閉状態を持たない**という決めで、
 * ブラウザの持ち物である `<details>` はそれに当たらない ── 状態を持たないので
 * LP はサーバー部品のままで、スクリプトが届く前から開けて、
 * キーボードと読み上げにも最初から対応している（`summary` がボタンとして扱われる）。
 *
 * **主役の下に置いていた帯の代わり。** 帯は幅375で 180px を使っていたが、
 * ここなら上部バーの中に収まり、**どの画面からでも・スクロール位置に関係なく開ける**
 * （上部バーは sticky）。「いまも動いているアプリだ」を伝える場所としては、
 * 1枚目に入るかどうかを気にしなくてよいこちらのほうが強い。
 *
 * ⚠️ **外側をクリックしても閉じない**（`<details>` にその仕組みは無い）。
 * 閉じるにはもう一度押す。それを直すには開閉状態を持つ部品が要るので、
 * **JavaScript ゼロと引き換えに受け入れている。**
 */
export function ChangelogMenu() {
  return (
    // relative は開いた中身の位置決め。group は矢印の向きを summary の状態に追従させるため
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-md text-[12px] font-extrabold whitespace-nowrap text-ink hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep sm:text-[13px] [&::-webkit-details-marker]:hidden"
        // 「押すと開く」ことを読み上げにも伝える。summary は既定でボタンとして扱われる
        aria-label="更新情報を開く"
      >
        更新情報
        <IconChevronDown
          size={14}
          className="shrink-0 text-brand-deep transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>

      {/*
        開いた中身。**画面の幅で置き方を変える。**

        - 狭い画面: `fixed` で左右に貼る。**`absolute right-0` では画面の外へ出た** ──
          右端に寄るのは「更新情報」の文字の右端で、その右には「無料で始める」があるぶん
          内側に入っている。幅375では左端が **x=-112px** になり、実測で読めなかった
          （横スクロールは出ないので、`scrollWidth` では検出できない）
        - `sm` 以上: 押した場所の真下に右寄せで出す（`absolute right-0 top-full`）

        `top-19` は上部バー（`h-16` = 64px）の下に 12px の隙間を空けた位置。
        `z-40` は上部バーの `z-30` より上 ── 中身は上部バーの外へはみ出して重なるので、
        同じ高さだと後続の節に潜る。
      */}
      <div className="fixed inset-x-4 top-19 z-40 rounded-2xl border-2 border-b-5 border-line bg-panel p-4 shadow-[0_12px_28px_rgba(74,59,40,0.14)] sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-3 sm:w-80">
        <ChangelogList entries={latestChangelog()} variant="row" />
        {/* 区切り線は**この囲みに引く。** リンク自体に `border-t` を当てると、
            線が文字の幅しか伸びず、短い罫線が浮いて見える（実測して直した） */}
        <div className="mt-3.5 border-t-2 border-line pt-3">
          <Link
            href="/changelog"
            className="rounded-md text-[12px] font-extrabold text-brand-deep hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-deep"
          >
            すべて見る →
          </Link>
        </div>
      </div>
    </details>
  );
}
