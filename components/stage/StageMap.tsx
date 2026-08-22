"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chapterOf } from "@/lib/stages/chapters";
import {
  IconBook,
  IconCheck,
  IconChevronDown,
  IconLock,
  IconPaw,
} from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

export type Stage = {
  id: number;
  order: number;
  title: string;
  status: "cleared" | "current" | "locked";
  /**
   * 満点帯（`lib/ai/compose.ts` の `PERFECT_THRESHOLD` 以上）に到達済みか。
   *
   * **status の4つ目の値にはしない。** 満点のステージはクリア済みでもあるので、
   * `status === "cleared"` で書かれている判定（道の実線・ボタンの文言・見た目）が
   * すべて満点ノードを取りこぼす。独立した欄にして「クリア済みに一枚重ねる」形にしてある。
   */
  perfect: boolean;
};

/**
 * 1行ぶんの高さは **CSS 変数 `--row-h`**（下の `ROW_H_CLASS`）。TS の定数ではない。
 *
 * - **パソコン（lg 以上）は 180。** モック（`design/stages-desktop-light.html`）は 145 だが、
 *   あれは「try/catch の流れ」のような短いタイトル前提の値。実データのタイトルは
 *   「スタックトレースを読む ─ ログから原因の行を特定する」のように3行へ折り返すため、
 *   145 ではラベルが次の行の丸に重なり、章の最後では節の下端を 20px はみ出していた（実測）。
 * - **狭い画面（lg 未満）は 224。** マップの列は lg 以上で約 664px、lg 未満は画面幅そのまま
 *   （375px 端末で 327px）と**半分以下**になる。横位置は割合なので列が狭まると丸どうしが近づき、
 *   幅 144px のラベルと、現在地の「スタート」吹き出し（丸の 48px 上）が
 *   **1つ上の行のラベルに 53×36px 重なる**（375px で実測。lg 以上では起きない）。
 *   横に逃がす余地が無いので縦に開ける。必要な間隔は「1つ上のノードの下端
 *   （丸 76 + すきま 8 + ラベル 76 = 160）」を「吹き出しの上端（次の行の頭から -8 -48）」が
 *   越えないこと、すなわち `--row-h - 56 ≥ 160` → **216 以上**。余裕を見て 224。
 *
 * **JS で選ばないこと（E11）。** 2026-08-19〜21 は `matchMedia` で選んでいたが、
 * サーバー描画は画面幅を知らないので広い側（180）で返すしかなく、**狭い画面では
 * 一度 180 で描いたあとに詰め直していた。** CPU を 1/8 に絞って測ると、
 * 375px では **約 900ms のあいだ 180 の配置が見えたまま**で、そのあと
 * 文書の高さが 21,069 → 24,925px（+3,856px）に伸びて**全ノードが動いていた。**
 * CSS 変数なら最初の描画から正しい値で出る。
 *
 * ⚠️ **Tailwind は class 名を文字として探す。** テンプレートリテラルで組み立てると
 * `--row-h` の宣言そのものが CSS に出力されず、`calc()` が全部無効になって
 * マップが1点に潰れる。だからこの文字列は**リテラルで持つ**
 * （対応は `tests/unit/stage-map.test.ts` の U-823 が見ている）。
 */
const ROW_H_CLASS = "[--row-h:224px] lg:[--row-h:180px]";

/** 節の上端から先頭ノードまで。現在地の「スタート」吹き出し（丸の 53px 上）を収める高さ */
const PAD_TOP = 76;

/**
 * ノードの上端から丸の中心まで（丸 76 の半分）。道の端をここに合わせる。
 * **道は行の高さに依存するので、`--row-h` を使った `calc()` の中に出てくる。**
 */
const CIRCLE_MID = 38;

/**
 * 丸をバナーの下へ逃がすときに空ける余裕。
 * 満点の縁取り（`ring-offset-2`）は丸の外へ 5px ほど出るので、
 * 0 にすると輪の上側がバナーに切られる。
 */
const BANNER_CLEARANCE = 8;

/**
 * ノード1つが縦に占める高さの最大値。
 * 内訳は 現在地の丸 92（`size-23`）+ すきま 8（`gap-2`）+ ラベル 76（`h-19`）- 持ち上げ 8。
 *
 * ラベルの高さを内容任せにせず固定しているのは、タイトルの行数で章の下端が動くと
 * 章見出し（「ここから 第N章」）と直上のステージの間隔が 8〜38px でばらつくため（実測）。
 * **下の markup のクラスと対応している値なので、片方だけ変えないこと。**
 */
const NODE_H = 168;

/**
 * 章の区切り（「ここから 第N章」）が縦に占める高さ。
 * 内訳は 上の余白 36（`my-9`）+ 帯 20（`h-5`）+ 下の余白 36（`my-9`）。
 *
 * **章を跨ぐ道の長さがこの値で決まる。** 道は節（`<section>`）の中の SVG に描くので、
 * 節の外＝区切りの帯を跨ぐ長さを、こちら側が数字で知っている必要がある。
 *
 * 帯の高さを `h-5` で固定しているのは、文字の行の高さ（13px × 1.5 = 19.5）に
 * 頼ると**フォントや文字サイズを変えた日に道の端が丸から静かに外れる**ため。
 * **下の markup のクラスと対応する値なので、片方だけ変えないこと**
 * （`tests/unit/stage-map.test.ts` の U-820 が対応を見ている）。
 */
const CHAPTER_GAP_MARGIN = 36;
const CHAPTER_LABEL_H = 20;
const CHAPTER_GAP = CHAPTER_GAP_MARGIN * 2 + CHAPTER_LABEL_H;

/** 蛇行の横位置（%）。order で引くので、途中に問題を差し込んでも並びが崩れない */
const XS = [50, 28, 52, 72, 48, 28, 52, 72, 48, 28];
const xOf = (order: number) => XS[(order - 1) % XS.length];

type ChapterGroup = {
  no: number | null;
  title: string;
  /** order 昇順 */
  stages: Stage[];
};

/** order 昇順の stages を、連続する章ごとの塊にまとめる */
function groupByChapter(stages: Stage[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const s of stages) {
    const ch = chapterOf(s.order);
    const no = ch?.no ?? null;
    const last = groups[groups.length - 1];
    if (last && last.no === no) {
      last.stages.push(s);
    } else {
      groups.push({ no, title: ch?.title ?? "とくべつステージ", stages: [s] });
    }
  }
  return groups;
}

export function StageMap({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Stage | null>(null);

  const groups = groupByChapter(stages);
  // 下から上に登るマップなので、後の章ほど上に描く
  const displayGroups = [...groups].reverse();

  const current = stages.find((s) => s.status === "current") ?? null;
  const currentChapter = current ? chapterOf(current.order) : null;
  const [banner, setBanner] = useState<{ no: number | null; title: string }>({
    no: currentChapter?.no ?? groups[0]?.no ?? null,
    title: currentChapter?.title ?? groups[0]?.title ?? "",
  });

  const [fab, setFab] = useState<"hidden" | "up" | "down">("hidden");

  const bannerRef = useRef<HTMLDivElement>(null);
  const currentNodeRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  /**
   * 現在地を「章バナーの下の、実際に見えている範囲」の中央に置く。
   *
   * `scrollIntoView({ block: "center" })` だとバナーの高さを勘定に入れないため、
   * 画面の上端から数えた中央に来る。その結果、**現在地の1つ上のノードが
   * ちょうどバナーの裏に入り、丸だけが隠れてラベルだけが浮いて見えていた**
   * （起動直後の既定の見た目なので、毎回それを目にすることになる）。
   *
   * 中央に置いただけでは足りない。バナーの帯にどの丸が来るかは**画面の高さ次第**で、
   * 実測でも 900px 高では 14.5px かかっていた。かかっていたら下へずらして必ず全部見せる。
   *
   * **`--row-h` ≥ バナーの高さ + 丸の直径（76）+ `BANNER_CLEARANCE` が前提。**
   * これが成り立つ限り帯にかかる丸は多くても1つなので、ずらして別の丸が新たにかかることはない
   * （行間 180 ≥ 81 + 76 + 8 = 165。バナーを高くするなら `--row-h` も上げること）。
   *
   * **バナーが貼り付く位置は `getComputedStyle` で引く（E11）。** 狭い画面では
   * 上に数字の帯（`app/stages/page.tsx`）が居座るのでバナーは `top-4` ではなく
   * その下に貼り付く。ここに数字を書き写すと、帯の高さを変えた日に
   * **着地の計算だけが古い値のまま**残り、現在地の丸がバナーの裏に入る。
   */
  const scrollToCurrent = useCallback((behavior: ScrollBehavior) => {
    const node = currentNodeRef.current;
    if (!node) return;
    const banner = bannerRef.current;
    const bannerHeight = banner?.getBoundingClientRect().height ?? 0;
    const stickyTop = banner
      ? parseFloat(getComputedStyle(banner).top) || 0
      : 0;
    const bannerBottom = stickyTop + bannerHeight;
    const rect = node.getBoundingClientRect();
    const visibleCenter = bannerBottom + (window.innerHeight - bannerBottom) / 2;

    // **先に丸めること。** ページの端では狙った位置までスクロールできず、
    // ブラウザ側で丸められる。丸める前の値で下の判定をすると、
    // 実際の見た目と違う位置で判定してしまい、ずらしが効かない。
    // 現在地が STAGE 1（マップの最下部）のとき必ずここに当たる ＝ 新規ユーザーの初回表示
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const clamp = (v: number) => Math.max(0, Math.min(v, maxScroll));

    let top = clamp(window.scrollY + rect.top + rect.height / 2 - visibleCenter);

    for (const circle of document.querySelectorAll<HTMLElement>("[data-stage-circle]")) {
      const box = circle.getBoundingClientRect();
      // ずらした後の画面内の位置に置き換えて判定する
      const y = box.top + window.scrollY - top;
      if (y < bannerBottom + BANNER_CLEARANCE && y + box.height > stickyTop) {
        top = clamp(top - (bannerBottom + BANNER_CLEARANCE - y));
        break;
      }
    }

    window.scrollTo({ top, behavior });
  }, []);

  useEffect(() => {
    // 起動時は現在地が画面内に来るようにする（UI概要の要件）
    scrollToCurrent("instant");

    function sync() {
      // 章バナー: バナーのすぐ下に重なっている章を表示する
      const bannerRect = bannerRef.current?.getBoundingClientRect();
      if (bannerRect) {
        const y = bannerRect.bottom + 20;
        for (const sec of sectionRefs.current) {
          if (!sec) continue;
          const r = sec.getBoundingClientRect();
          if (r.top <= y && r.bottom >= y) {
            setBanner({
              no: sec.dataset.chapterNo ? Number(sec.dataset.chapterNo) : null,
              title: sec.dataset.chapterTitle ?? "",
            });
            break;
          }
        }
      }

      // 現在地が画面から出ているときだけ「現在地へ」を出す
      const node = currentNodeRef.current;
      if (node) {
        const r = node.getBoundingClientRect();
        if (r.bottom < 90) setFab("up");
        else if (r.top > window.innerHeight - 40) setFab("down");
        else setFab("hidden");
      }
    }

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
    // 行の高さは CSS 変数（`ROW_H_CLASS`）なので、最初の描画から確定している。
    // 2026-08-19〜21 は JS で選んでいて、描いたあとに全ノードが動くため
    // `rowH` を依存に足して2回走らせていた。もう要らない（E11）
  }, [scrollToCurrent]);

  function handleStart() {
    if (!selected) return;
    router.push(`/problems/${selected.id}`);
  }

  return (
    <>
      {/*
       * 章バナー: スクロールに追従して現在見えている章を示す。
       *
       * **狭い画面では上の数字の帯の下に貼り付く**（`top-16` = 60px の帯 + 4px。
       * 帯は `app/stages/page.tsx` にある。片方だけ動かさないこと）。
       * lg 以上は帯が出ないので従来どおり `top-4`。
       */}
      <div
        ref={bannerRef}
        className="sticky top-16 z-20 flex items-center justify-between rounded-2xl border-b-5 border-brand-deep bg-gradient-to-br from-brand to-brand-soft px-6 py-4 text-white shadow-[0_8px_22px_rgba(196,112,0,0.18)] lg:top-4"
      >
        {/*
         * **高さを2行ぶん（`min-h-11` = 44px）で固定する（E11）。**
         * 章の番号は `chapterOf` が null を返す order（動作確認用の 999 など）で消えるので、
         * 素直に書くとバナーが 81px ⇄ 65px で伸び縮みし、**その下のマップ全体が 16px 跳ねる。**
         * バナーは貼り付いているので、スクロールして章の外に入った瞬間に起きる。
         *
         * 空の行を置くのではなく箱の高さを決めているのは、番号が無いときに
         * 「見出しの上に説明のつかない空白の行がある」形にしないため（1行のまま中央に来る）。
         * 44px は `py-4` と `border-b-5` を除いた2行ぶんの実測値。
         */}
        <div className="flex min-h-11 flex-col justify-center">
          {banner.no !== null && (
            <span className="block text-xs font-extrabold tracking-widest opacity-90">
              第{banner.no}章
            </span>
          )}
          <span className="text-lg font-extrabold">{banner.title}</span>
        </div>
        <IconBook size={26} />
      </div>

      <div className={`relative ${ROW_H_CLASS}`}>
        {displayGroups.map((group, gi) => {
          // 章の中も上ほど先のステージ（order 降順）
          const rows = [...group.stages].sort((a, b) => b.order - a.order);
          // 下端は「最後のノードが収まる位置」で決める。行数 × 行の高さだと
          // 行の高さとノードの高さの差だけ余白が出たり、逆にはみ出したりする
          const height = `calc(var(--row-h) * ${rows.length - 1} + ${PAD_TOP + NODE_H}px)`;

          // 章を跨ぐ道の相手。1つ下の節（＝手前の章）の**最上段**のノード。
          // group.stages は order 昇順なので、末尾がその章でいちばん先のステージ＝最上段。
          // この節の最下段（rows の末尾）と order が隣り合うので、道が繋がる
          const nextGroup = displayGroups[gi + 1];
          const below = nextGroup
            ? nextGroup.stages[nextGroup.stages.length - 1]
            : null;
          const bottom = rows[rows.length - 1];

          return (
            <div key={group.no ?? `extra-${gi}`}>
              <section
                ref={(el) => {
                  sectionRefs.current[gi] = el;
                }}
                data-chapter-no={group.no ?? ""}
                data-chapter-title={group.title}
                className="relative"
                style={{ height }}
              >
                {/*
                 * 道。クリアして通った区間は実線、その先は点線。
                 *
                 * **1区間 = 1つの入れ物 + 1本の線。** ひとつの SVG にまとめて
                 * `y1` / `y2` を px で書くほうが素直だが、**幾何属性は CSS で表せない** ──
                 * 行の高さがメディアクエリで変わる（`ROW_H_CLASS`）ので、
                 * それをやると行の高さを JS で選ぶしかなくなり、E11 で直した
                 * 「描いたあとに全ノードが動く」に戻る。
                 *
                 * 入れ物の上下端を丸の中心に合わせておけば、線は入れ物の中で
                 * **0% → 100%** を結ぶだけでよく、px の座標が要らない。
                 * 横位置（`x1` / `x2`）は入れ物が `inset-x-0` ＝ 節と同じ幅なので、
                 * これまでと同じ割合がそのまま使える。
                 */}
                {rows.map((s, i) => {
                  const next = rows[i + 1];
                  if (!next) return null;
                  const done = next.status === "cleared";
                  return (
                    <div
                      key={s.id}
                      className="pointer-events-none absolute inset-x-0"
                      style={{
                        top: `calc(var(--row-h) * ${i} + ${PAD_TOP + CIRCLE_MID}px)`,
                        height: `calc(var(--row-h) - ${CIRCLE_MID}px)`,
                      }}
                    >
                      <svg className="h-full w-full overflow-visible">
                        <line
                          x1={`${xOf(next.order)}%`}
                          y1="100%"
                          x2={`${xOf(s.order)}%`}
                          y2="0"
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeDasharray={done ? undefined : "1 15"}
                          className={done ? "stroke-path-done" : "stroke-path-todo"}
                        />
                      </svg>
                    </div>
                  );
                })}

                {/*
                 * 章を跨ぐ1本。**これが無いと、区切りの上下で道が途切れる**
                 * （実測で 335px、丸2つぶん以上なにも無い区間ができていた。2026-08-19）。
                 * 節ごとに線を引く作りなので、節と節の間だけ誰も描いていなかった。
                 *
                 * **上の節に描く。** 節は position:relative なので、後に来る節のほうが
                 * 上に描かれる ── 下の節から引くと区切りの帯や見出しの上を跨いでしまう。
                 * 上から引けば帯の下を通る。入れ物は overflow-visible なので節の外へ出せる。
                 *
                 * **この区間の長さだけは行の高さに依らない。** 下端は次の節の先頭ノード
                 * （節の下端 + 区切り + `PAD_TOP`）、上端はこの節の最下段の丸の中心なので、
                 * 引き算すると行の高さが打ち消えて `PAD_TOP + NODE_H + CHAPTER_GAP - CIRCLE_MID` になる。
                 */}
                {below && (
                  <div
                    className="pointer-events-none absolute inset-x-0"
                    style={{
                      top: `calc(var(--row-h) * ${rows.length - 1} + ${PAD_TOP + CIRCLE_MID}px)`,
                      height: PAD_TOP + NODE_H + CHAPTER_GAP - CIRCLE_MID,
                    }}
                  >
                    <svg className="h-full w-full overflow-visible">
                      <line
                        x1={`${xOf(below.order)}%`}
                        y1="100%"
                        x2={`${xOf(bottom.order)}%`}
                        y2="0"
                        strokeWidth={6}
                        strokeLinecap="round"
                        strokeDasharray={
                          below.status === "cleared" ? undefined : "1 15"
                        }
                        className={
                          below.status === "cleared"
                            ? "stroke-path-done"
                            : "stroke-path-todo"
                        }
                      />
                    </svg>
                  </div>
                )}

                {rows.map((s, i) => {
                  const isCurrent = s.status === "current";
                  const isOpen = selected?.id === s.id;
                  // 満点はクリア済みの上に重ねる装飾なので、両方が立っているときだけ出す
                  const isPerfect = s.status === "cleared" && s.perfect;
                  return (
                    <div
                      key={s.id}
                      ref={isCurrent ? currentNodeRef : undefined}
                      className={`absolute flex w-36 -translate-x-1/2 flex-col items-center gap-2 ${
                        isOpen ? "z-40" : ""
                      }`}
                      style={{
                        top: `calc(var(--row-h) * ${i} + ${PAD_TOP - (isCurrent ? 8 : 0)}px)`,
                        left: `${xOf(s.order)}%`,
                      }}
                    >
                      {isCurrent && (
                        <>
                          <span className="absolute -top-12 animate-bob rounded-full border-2 border-brand bg-panel px-4 py-1.5 text-sm font-extrabold text-brand whitespace-nowrap">
                            スタート
                          </span>
                          <Mascot
                            className={`pointer-events-none absolute -top-1 w-20 drop-shadow-[0_4px_6px_rgba(74,59,40,0.2)] ${
                              xOf(s.order) > 50 ? "right-26" : "left-26"
                            }`}
                          />
                        </>
                      )}

                      <button
                        // 着地位置の計算（scrollToCurrent）が丸の位置を引くための目印
                        data-stage-circle
                        onClick={() => s.status !== "locked" && setSelected(s)}
                        disabled={s.status === "locked"}
                        className={`grid place-items-center rounded-full transition-transform ${
                          s.status === "cleared"
                            ? // 満点は金の縁取りをひと重足すだけ（案A）。マークも大きさも変えない。
                              // 目立たせすぎると 55点でクリアしたステージが見劣りし、
                              // 「クリアしただけでは足りない」という印象になるため
                              `size-19 border-b-6 border-[#d98a06] bg-brand-soft text-white cursor-pointer active:translate-y-[3px] ${
                                isPerfect
                                  ? "ring-3 ring-[#d98a06] ring-offset-2 ring-offset-bg"
                                  : ""
                              }`
                            : isCurrent
                              ? "relative size-23 border-5 border-b-10 border-brand bg-panel text-brand cursor-pointer active:translate-y-[3px]"
                              : "size-19 border-b-6 border-locked-edge bg-locked text-locked-ink cursor-not-allowed"
                        }`}
                      >
                        {isCurrent && (
                          <span className="pointer-events-none absolute -inset-1.5 animate-halo rounded-full border-4 border-brand" />
                        )}
                        {s.status === "cleared" && <IconCheck size={34} />}
                        {isCurrent && <IconPaw size={38} />}
                        {s.status === "locked" && <IconLock size={26} />}
                      </button>

                      {/* 高さを固定する（NODE_H の内訳）。タイトルの行数でノードの高さが
                          変わると、章の下端＝章見出しの位置が章ごとにずれる */}
                      <span className="block h-19 text-center leading-snug">
                        <span className="block text-[11px] font-extrabold tracking-widest text-muted">
                          STAGE {s.order}
                        </span>
                        <span
                          className={`line-clamp-3 text-sm font-bold ${
                            s.status === "locked" ? "text-locked-ink" : ""
                          }`}
                        >
                          {s.title}
                        </span>
                      </span>

                      {/* ノードにアンカーしたポップオーバー。外側タップで閉じる */}
                      {isOpen && (
                        <div className="absolute bottom-full left-1/2 mb-3 w-66 -translate-x-1/2 rounded-2xl border-2 border-line bg-panel p-5 shadow-[0_12px_32px_rgba(74,59,40,0.16)]">
                          <h2 className="text-base font-extrabold">{s.title}</h2>
                          <p className="mt-1 mb-3.5 flex items-center gap-2 text-xs font-bold text-muted">
                            <span>STAGE {s.order}</span>
                            {isPerfect && (
                              <span className="rounded-full border-2 border-[#d98a06] px-2 py-0.5 text-[11px] font-extrabold text-brand-deep">
                                満点
                              </span>
                            )}
                          </p>
                          <button
                            onClick={handleStart}
                            className={`w-full rounded-2xl py-3 text-[15px] font-extrabold tracking-wide active:translate-y-[3px] active:border-b-2 ${
                              s.status === "cleared"
                                ? "border-2 border-line border-b-5 bg-panel text-muted"
                                : "border-b-5 border-brand-deep bg-brand text-white"
                            }`}
                          >
                            {s.status === "cleared" ? "もう一度読む" : "挑む"}
                          </button>
                          <span className="absolute -bottom-2 left-1/2 -ml-1.75 size-3.5 rotate-45 border-r-2 border-b-2 border-line bg-panel" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              {/*
               * 章の区切り。**高さは CHAPTER_GAP の内訳と揃えてある**
               * （`my-9` = 36 × 2、`h-5` = 20）。章を跨ぐ道の長さがこの値で決まる。
               *
               * `relative z-10` は、章を跨ぐ道より上に描くため。見出しに
               * 地の色（`bg-bg`）を敷いてあるので、道が文字を横切っても読める。
               */}
              {gi < displayGroups.length - 1 && (
                <div className="relative z-10 mx-10 my-9 flex h-5 items-center gap-3.5 text-[13px] font-extrabold tracking-widest text-muted before:h-0.5 before:flex-1 before:rounded-full before:bg-line after:h-0.5 after:flex-1 after:rounded-full after:bg-line">
                  <span className="bg-bg px-2">
                    {group.no !== null
                      ? `ここから 第${group.no}章`
                      : `ここから ${group.title}`}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ポップオーバーの外側タップ判定 */}
      {selected && (
        <div className="fixed inset-0 z-30" onClick={() => setSelected(null)} />
      )}

      {/* 現在地へ戻る。左右対称レイアウトなので画面中央 = マップ列の中央 */}
      {fab !== "hidden" && (
        <button
          onClick={() => scrollToCurrent("smooth")}
          className="fixed bottom-7 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-b-5 border-brand bg-panel px-5.5 py-3 text-sm font-extrabold text-brand shadow-[0_8px_24px_rgba(196,112,0,0.22)] active:translate-y-[3px] active:border-b-2"
        >
          <IconChevronDown size={16} className={fab === "up" ? "rotate-180" : ""} />
          現在地へ
        </button>
      )}
    </>
  );
}
