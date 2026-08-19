"use client";

import { useLayoutEffect } from "react";
import { applyTheme, readStoredTheme } from "@/lib/theme";

/**
 * 覚えてある配色を `<html>` に当て直すだけの部品。**画面には何も出さない。**
 *
 * 本番では何もしない。配色は `app/layout.tsx` の script が
 * 最初の描画より前に当て終わっているので、ここは同じ値を書き直すだけになる。
 *
 * **開発中だけ必要になる。** 開発中の React は不具合を見つけるために部品を1回だけ
 * 組み立て直すのだが、そのとき `<html>` の属性を「React が知っているものだけ」に戻す。
 * script が当てた配色はそこで消えるので、暗くしていた人の画面が
 * 途中から明るく戻ってしまう。これが無いと、開発中の見え方と本番の見え方が食い違う。
 *
 * 描画の直前に走る形（useLayoutEffect）にしてあるのは、
 * 画面に出てから当て直すと明るい画面が一瞬見えるため。
 * サーバー側では何もしない扱いになる（React 19 が空の処理に差し替える）ので、
 * 「サーバーでは動かない」という警告も出ない。
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return null;
}
