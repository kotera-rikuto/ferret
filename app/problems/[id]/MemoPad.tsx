"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { IconChevronDown, IconPencil } from "@/components/ui/icons";

/**
 * 問題を読みながら書き留めるメモ欄。
 *
 * **メモは採点に送らない。** この部品は回答欄（ProblemForm）と完全に別で、
 * 中身が /api/score へ渡る経路がどこにも無い。同じ部品にまとめると
 * 「送る文字列」と「送らない文字列」が1つの state に同居することになり、
 * 後から片方だけを送り忘れる／送ってしまう事故が起きうる。
 * メモには考えの途中経過（誤った仮説を含む）が入るので、送ると点が変わる。
 *
 * 保存先は端末の中だけ（オーナー判断 2026-08-19・案A）。
 * 端末をまたいで見る用途は薄く、DB とAPIを増やさずに済むため。
 * サーバー側からは見えないので、「メモが消えた」に対して復元する手段は無い。
 */

/**
 * 1件あたりの上限。
 *
 * 上限を置く目的は端末の保存領域を有界にすること。**100問 × 2000字でも
 * 約400KB で、ブラウザの上限（5MB 前後）の1割に届かない。** だから
 * 「古いメモを消す」仕組みは入れていない ── 消す仕組みは、書いたはずのメモが
 * 黙って消える経路をこちら側で作ることでもあるので、必要になるまで持たない。
 *
 * 回答欄（ANSWER_MAX_CHARS = 600）より大きいのは、メモが下書きだから。
 * 回答より短くしか書けないメモ欄は用をなさない。
 */
export const MEMO_MAX_CHARS = 2000;

/** 残り文字数を出し始める割合。常時出すと、採点される欄のように見えるため */
const COUNTER_FROM = 0.8;

/**
 * 読む列の横にメモを並べる幅（オーナー判断 2026-08-19）。
 *
 * **横に並べたメモは画面に貼り付く**（`lg:sticky`）。狙いは
 * 「コードを読みながら書ける」と「回答を書くときに参照できる」を同時に満たすこと ──
 * 縦に積むとどちらか一方しか満たせず、もう一方はスクロールが要る。
 *
 * 境目は **`lg`（1024px）＝アプリ共通のデスクトップの線**。この画面だけ独自の値を
 * 持たせない（他の画面も lg 未満で簡易ヘッダーに切り替わる）。
 * **狭い画面は「開閉できる帯を画面の上に貼り付ける」**（E11。下の注）。
 * 1024〜1088px の間は読む列が 720 から少し縮むが、コードは枠の中で横スクロールする。
 *
 * ⚠️ **この文字列は Tailwind の `lg:` と同じ幅を指していないといけない。**
 * `rem` で書いてあるのはそのため（Tailwind は `64rem` で出力する）。
 * ずれると「横に並んでいるのに開閉ボタンも出る」状態になる。
 * 対になっているのは `page.tsx` と `ProblemForm.tsx` の `lg:`。
 */
const SIDE_BY_SIDE = "(min-width: 64rem)";

/**
 * 狭い画面での貼り付け位置。**問題画面のヘッダーの高さ**（`page.tsx` の
 * `sticky top-0` な `<header>`。上下の余白 14×2 + 中身 40 + 下線 2 = 70px）。
 *
 * ここが合っていないと、メモの帯がヘッダーの裏に潜るか、下に隙間が空く。
 * 数字の対応は `tests/e2e/display.spec.ts` の E-467 が見ている。
 */
const NARROW_STICKY_TOP = "top-[70px]";

function subscribeSideBySide(onChange: () => void) {
  const query = window.matchMedia(SIDE_BY_SIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** localStorage を初回描画で読むための購読なしストア。サーバー描画時は null */
const subscribeNothing = () => () => {};

export function MemoPad({ problemId }: { problemId: number }) {
  // 回答の下書き（ferret:draft:{id}）とは別の名前にする。
  // 混ざると、メモを開いたら回答が出てくる（またはその逆）ことになる
  const memoKey = `ferret:memo:${problemId}`;
  const bodyId = useId();

  // 復元のしかたは ProblemForm の下書きと同じ。
  // effect での setState は lint（react-hooks/set-state-in-effect）で禁止なので、
  // 「編集前は保存済み、編集し始めたら編集値」の合成で復元する
  const storedMemo = useSyncExternalStore(
    subscribeNothing,
    () => localStorage.getItem(memoKey),
    () => null,
  );

  // 横に並べられる幅か。**サーバー側では画面幅が分からない**ので、
  // 狭いほう（折りたたみ）を既定にして、広い画面では描画後に開く
  const sideBySide = useSyncExternalStore(
    subscribeSideBySide,
    () => window.matchMedia(SIDE_BY_SIDE).matches,
    () => false,
  );

  const [edited, setEdited] = useState<string | null>(null);
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const memo = edited ?? storedMemo ?? "";
  const restored = edited === null && Boolean(storedMemo);

  // 横に並んでいるときは畳む意味がないので常に開く。
  //
  // **狭いときは閉じて出す（E11）。** 2026-08-19〜21 は「すでに書いたものがあれば
  // 開いて出す」だったが、メモを画面の上に貼り付けた（下の注）ことで
  // **保存済みメモの有無で最初の描画が 128px ずれる**ようになった ──
  // `localStorage` はサーバーからは見えないので、開くかどうかが決まるのは
  // ハイドレーションの後で、その瞬間にコードが下へ飛ぶ。
  // 代わりに、書いたものがあることは帯の目印（下の `hasStored`）で知らせる。
  const open = sideBySide || (manuallyOpen ?? false);
  // 閉じているときだけ出す目印。開いていれば中身そのものが見えている
  const hasStored = Boolean(storedMemo) && !open;

  function handleChange(value: string) {
    // 保存に失敗しても入力は画面に残す。先に state を更新しておくことで、
    // 「保存できません」と出ている間もメモを書き続けられる
    setEdited(value);
    try {
      if (value) localStorage.setItem(memoKey, value);
      else localStorage.removeItem(memoKey);
      setSaveFailed(false);
    } catch {
      // 端末の保存領域が一杯のとき（同じアドレスで動く他のアプリが使い切っている等）。
      // 黙って握りつぶすと、書いたメモが保存されたと思ったまま消える
      setSaveFailed(true);
    }
  }

  const length = memo.length;

  // 見出しの中身は開閉ボタンと固定見出しで共通。
  // 別々に書くと、片方だけ文言が変わって「採点には送りません」が消える
  const label = (
    <>
      <IconPencil size={17} className="text-brand-deep" />
      メモ
      {/* 採点されない欄であることを、書き始める前に見える場所に置く。
          置かないと回答欄と取り違えて、書いたのに送られない事故になる */}
      <span className="text-[11px] font-bold text-muted">
        （採点には送りません）
      </span>
    </>
  );

  return (
    /*
     * **狭い画面では画面の上に貼り付ける（E11・オーナー判断 2026-08-22）。**
     *
     * 「コードでも答案でも使える」がメモ欄の要件。パソコンでは横に並べた列を
     * `sticky` にすることでそれを満たしているが、狭い画面には横に並べる幅が無い。
     * 縦に積むと**置いた場所の片方でしか使えない** ── 回答欄の下に置いていた
     * 2026-08-21 までは、コードを読んでいる位置からメモが 500px 下にあった（375px で実測）。
     *
     * 上に貼り付けると、コードを読んでいる間もスクロールして回答を書く間も
     * 同じ帯が画面の上に残る。**縦の代償は閉じている間 44px、開いて 172px**（375px で実測）。
     *
     * `order-first` は**見た目だけ**先頭に出すため。**DOM の順は回答欄より後ろのまま**で、
     * 回答欄から Tab を押したときに当たるのがメモにならない（E-455 で直した導線）。
     * `z-10` はコードのパネルの上に来るため。**lg では `z-auto` に戻す**
     * （横に並んでいて重ならないので、パソコン側の重なり順を変えない）。
     */
    <div
      className={`sticky ${NARROW_STICKY_TOP} order-first z-10 flex flex-col gap-2 rounded-2xl border-2 border-line bg-panel px-5 py-2.5 lg:py-4 lg:top-24 lg:order-none lg:z-auto lg:w-72 lg:shrink-0`}
    >
      {sideBySide ? (
        <p className="flex items-center gap-2 text-sm font-extrabold">{label}</p>
      ) : (
        <button
          type="button"
          onClick={() => setManuallyOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex items-center gap-2 text-sm font-extrabold"
        >
          {label}
          {/* 閉じていても「前に書いたものがある」ことが分かるようにする。
              開いた状態で出すのをやめた代わりの合図（上の hasStored の注） */}
          {hasStored && (
            <span
              aria-label="書いたメモがあります"
              className="size-1.5 shrink-0 rounded-full bg-brand"
            />
          )}
          <IconChevronDown
            size={16}
            className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {/* 閉じているときも要素は残す（class で隠す）。
          外してしまうと aria-controls の指す先が消え、書きかけの入力も失われる */}
      <div id={bodyId} className={open ? "flex flex-col gap-2" : "hidden"}>
        <textarea
          value={memo}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={MEMO_MAX_CHARS}
          placeholder="変数の値を追う、気になった行を控える、回答の下書きにする..."
          rows={4}
          aria-label="メモ（採点には送りません）"
          // 回答欄と見た目を変えてある。同じ白い枠を2つ並べると、
          // どちらに書けば採点されるのかが見て分からない。
          //
          // 狭い画面では低くする（`h-28`）。画面の上に貼り付いているので、
          // ここが高いぶんだけコードの見える範囲が削られる
          className="resize-y rounded-xl bg-bg-deep px-4 py-3 text-sm leading-loose outline-none focus:ring-2 focus:ring-brand placeholder:text-locked-ink h-28 lg:h-64"
        />

        <div className="flex items-center justify-between text-xs font-bold text-muted">
          <span>
            {saveFailed
              ? "この端末には保存できませんでした。書いた内容は画面を閉じるまで残ります。"
              : restored
                ? "前回のメモを表示しています"
                : " "}
          </span>
          {/* 上限に近づいたときだけ出す */}
          {length >= MEMO_MAX_CHARS * COUNTER_FROM && (
            <span className="shrink-0">
              {length} / {MEMO_MAX_CHARS}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
