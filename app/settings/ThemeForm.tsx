"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  currentTheme,
  saveTheme,
  subscribeTheme,
  type Theme,
} from "@/lib/theme";

/**
 * 画面の配色の切り替え。
 *
 * オーナー判断（2026-08-19・E9）で**端末のダークモードには追従させない。**
 * ここで選んだときだけ変わる。選んだ内容はこのブラウザに覚える（アカウントではない）。
 *
 * 押した瞬間に画面全体の色が変わる。保存ボタンを置いていないのは、
 * 見た目の設定は結果がその場で見えるので、確定の操作を挟むほうがかえって迷うため
 * （パスワードや退会と違い、間違えても押し直せば元に戻る）。
 */
const CHOICES: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "明るい", hint: "クリーム色の背景" },
  { value: "dark", label: "暗い", hint: "こげ茶色の背景" },
];

export function ThemeForm() {
  // いま当たっている配色を `<html>` から読む。localStorage ではなく属性を見るのは、
  // 最初の描画より前に走る script（app/layout.tsx）が当てた結果がそこに出ているから。
  //
  // 覚えてある値を最初の描画で読んでしまうと、サーバーが作った画面（必ず既定の明るい）と
  // 食い違って React が組み立て直しに失敗する。そのためサーバー側では既定を返し、
  // ブラウザ側でだけ実際の値に差し替える。
  //
  // **この画面を開き直した直後だけ、選ばれている側の表示が約50ms 遅れて追いつく**
  // （実測。画面全体の色は script が当てているので最初から正しく、
  // 遅れるのはこの2つのボタンの枠だけ）。消すにはサーバーが配色を知る必要があり、
  // それには Cookie を読むことになって全画面が動的描画に変わる。
  // ボタンの枠が一瞬ズレることと釣り合わないので、ここは追いつく形のままにしてある。
  const theme = useSyncExternalStore(
    subscribeTheme,
    currentTheme,
    () => DEFAULT_THEME,
  );

  return (
    <section className="rounded-2xl border-2 border-line bg-panel p-6">
      <h2 className="mb-1.5 text-sm font-extrabold">画面の配色</h2>
      <p className="mb-4 text-xs font-bold leading-relaxed text-muted">
        いま使っているブラウザに覚えます。ほかの端末では選び直してください。
        <br />
        コードの枠は、どちらを選んでも読みやすい暗い色のままです。
      </p>

      <div className="flex flex-wrap gap-3">
        {CHOICES.map((choice) => {
          const selected = theme === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              // 選ばれているかは見た目だけでなく読み上げにも伝える。
              // 色の違いだけで示すと、この画面の目的そのものと相性が悪い
              aria-pressed={selected}
              onClick={() => saveTheme(choice.value)}
              className={`flex min-w-36 flex-col items-start gap-0.5 rounded-2xl border-2 px-4 py-3 text-left ${
                selected
                  ? "border-brand-soft border-b-5 bg-brand-tint"
                  : "border-line hover:bg-bg-deep"
              }`}
            >
              <span className="text-sm font-extrabold">{choice.label}</span>
              <span className="text-[11px] font-bold text-muted">
                {choice.hint}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
