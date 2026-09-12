"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { CHANGELOG_SEEN_STORAGE_KEY } from "@/lib/changelog";

/*
 * 上部バーの「更新情報」に付く **NEW**（tasks/E12・オーナー判断 2026-09-12「読んだら消える」）。
 *
 * **出す条件は「端末が覚えている版と、いまの版が違うこと」だけ。**
 * 版の作り方は `changelogMarker()`（日付＋件数）で、文章を直しただけでは変わらない ──
 * 印は「増えた」ことを伝えるためのもの。
 *
 * ── サーバーでは何も描かない ───────────────────────────────
 *
 * 覚えているのは `localStorage` なので、**サーバーは誰が読んだかを知らない。**
 * サーバー側の答え（`getServerSnapshot`）を「読んだ」にしてあるのはそのため。
 * 逆にすると、**読み終わった人にも一瞬 NEW が見えて直後に消える。**
 * 代わりに「スクリプトが届いてから出る」ので、ごく短い間だけ表示が遅れる。
 * 見落としても実害のない飾りなので、こちらに倒してある。
 *
 * ── 読んだと見なす条件 ─────────────────────────────────
 *
 * 1. 上部バーの「更新情報」を開いた（`<details>` の `toggle`）
 * 2. `/changelog`（全件）を開いている
 *
 * 2 を入れているのは、**全件ページに直接来た人が読んでいないことにならないよう**にするため。
 * 上部バーは `/` と `/changelog` の両方に出るので、あちらを見たのに次に来たとき
 * NEW が残っていると印が嘘になる。
 */

/**
 * `localStorage` は React の外にある値なので、`useSyncExternalStore` で読む。
 *
 * ⚠️ **`useEffect` の中で `setState` する形にはできない**（`react-hooks/set-state-in-effect` が
 * 落とす。React 19 はその書き方を連鎖再描画として扱う）。
 * 「外の値を購読して読む」ための仕組みがこれなので、素直にこちらに乗せる。
 */
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 別のタブで開いて読んだときも消す（localStorage の変更は storage で飛んでくる）
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * 覚えている版。**読めない環境では「見た」ことにする**（＝印を出さない）。
 * プライベートモードなどで `localStorage` が例外を投げるため（`lib/theme.ts` と同じ理由）。
 * 毎回出続けるより、出ないほうがまだ害が小さい。
 */
function readSeen(fallback: string): string | null {
  try {
    return localStorage.getItem(CHANGELOG_SEEN_STORAGE_KEY);
  } catch {
    return fallback;
  }
}

function writeSeen(marker: string) {
  try {
    localStorage.setItem(CHANGELOG_SEEN_STORAGE_KEY, marker);
  } catch {
    // 覚えられない環境では、開くたびに消えて次に来ると戻る。飾りなので追わない
  }
  notify();
}

export function NewMark({ marker }: { marker: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  const getSnapshot = useCallback(() => {
    // 全件ページを開いている間は出さない。**読んだ扱いにするのは下の効果**だが、
    // 先にここで伏せておかないと、書き込むまでの一瞬だけ NEW が見える
    if (window.location.pathname === "/changelog") return marker;
    return readSeen(marker);
  }, [marker]);

  const seen = useSyncExternalStore(
    subscribe,
    getSnapshot,
    // サーバー側の答え。「読んだ」にしておくと、サーバーの HTML には印が入らない
    useCallback(() => marker, [marker]),
  );

  useEffect(() => {
    if (window.location.pathname === "/changelog") {
      writeSeen(marker);
      return;
    }

    // 開いたら消す。`<details>` の開閉はブラウザが持っているので、
    // こちらは知らせを受け取るだけ（開閉状態を React で持たない）
    const details = ref.current?.closest("details");
    if (!details) return;
    const onToggle = () => {
      if (details.open) writeSeen(marker);
    };
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, [marker]);

  return (
    <span ref={ref} className="contents">
      {seen !== marker ? (
        <span
          // 読み上げでは「新着」と読ませる。NEW の3文字だけだと、
          // 何が新しいのかが音だけでは分からない
          aria-label="新着"
          className="rounded-full bg-brand px-1.5 py-0.5 font-mono text-[9px] leading-none font-bold tracking-wider text-white"
        >
          NEW
        </span>
      ) : null}
    </span>
  );
}
