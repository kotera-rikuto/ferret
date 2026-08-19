/**
 * マスコットの動き（app/globals.css・components/ui/MascotMotion.tsx）の検査。
 * ケース定義は tests/unit/テストケース.md の §17。
 *
 * 動きは**壊れても例外が出ない。** 症状はどれも「その画面を開いた人しか気づけない」。
 *   - 「動きを減らす」設定を無視する → 設定した人にだけ、止まらない動きが出続ける
 *   - しっぽの回転軸がズレる → 付け根が浮いて、体から離れたしっぽが見える
 *   - 動きを足して止め忘れる → §E10 で入れた対応が、次の1件から静かに欠ける
 * 見た目そのものは測れないので、ここで見るのは「決めた形が保たれているか」だけ。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const GLOBALS_CSS = read("../../app/globals.css");
const MOTION_TSX = read("../../components/ui/MascotMotion.tsx");
const CUT_PARTS = read("../../design/mascot/cut-parts.py");

/** `見出し { ... }` を、入れ子の `{}` を数えながら取り出す（theme.test.ts と同じ手） */
function blockAt(source: string, opening: string): { text: string; index: number } {
  const start = source.indexOf(opening);
  expect(start, `${opening} が見つかりません`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) {
      return { text: source.slice(start, i + 1), index: start };
    }
  }
  throw new Error(`${opening} の括弧が閉じていません`);
}

const THEME = blockAt(GLOBALS_CSS, "@theme {");
const REDUCED = blockAt(GLOBALS_CSS, "@media (prefers-reduced-motion: reduce) {");

/** `--animate-name: keyframes ...` から、utility 名と @keyframes 名の対を取る */
const ANIMATIONS = [...THEME.text.matchAll(/--animate-([a-z-]+):\s*([a-z-]+)\s/g)].map(
  (m) => ({ utility: `animate-${m[1]}`, keyframes: m[2] }),
);

describe("§17 マスコットの動き", () => {
  it("U-810 動きが1つ以上定義されている（取り出しの前提）", () => {
    expect(ANIMATIONS.length).toBeGreaterThanOrEqual(7);
  });

  /**
   * **新しい動きを足して、止めるのを忘れたら落ちる。**
   * これが無いと、E10 で入れた「動きを減らす」対応が次の1件から静かに欠ける。
   */
  it("U-811 すべての動きが prefers-reduced-motion で止まる", () => {
    const missing = ANIMATIONS.filter(
      (a) => !new RegExp(`\\.${a.utility}\\b`).test(REDUCED.text),
    ).map((a) => a.utility);
    expect(
      missing,
      `globals.css の @media (prefers-reduced-motion) に足してください: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  /**
   * Tailwind は `animate-*` を `@layer utilities` から出す。
   * この規則がどこかの層に入ると、詳細度ではなく層の順番で負けて効かなくなる。
   */
  it("U-812 その規則がどの層にも入っていない", () => {
    const before = GLOBALS_CSS.slice(0, REDUCED.index);
    const depth =
      (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(depth, "@media が @theme や @layer の中に入っています").toBe(0);
  });

  /**
   * 紙吹雪だけは「止める」では駄目。止めると画面の上端に貼り付いたまま残る。
   * 見た目の症状が「祝いの紙が降らずに天井に張り付く」なので、消すのが正しい。
   */
  it("U-813 紙吹雪は止めるのではなく出さない", () => {
    const fall = REDUCED.text.match(/\.animate-fall\s*\{([^}]*)\}/);
    expect(fall, ".animate-fall の規則が見つかりません").not.toBeNull();
    expect(fall![1]).toMatch(/display:\s*none/);
  });

  /** 使われない @keyframes が残ると、次に見た人が消せなくなる（sniff の置き換えで実際に出た） */
  it("U-814 @keyframes と --animate-* が1対1で対応している", () => {
    const defined = new Set(
      [...GLOBALS_CSS.matchAll(/@keyframes\s+([a-z-]+)/g)].map((m) => m[1]),
    );
    const used = new Set(ANIMATIONS.map((a) => a.keyframes));
    expect([...defined].filter((k) => !used.has(k)), "使われていない動き").toEqual([]);
    expect([...used].filter((k) => !defined.has(k)), "定義が無い動き").toEqual([]);
  });

  /**
   * **しっぽの回転軸は2か所に書いてある。** 絵を切る側（cut-parts.py の PIVOT）と
   * 回す側（MascotMotion の TAIL_ORIGIN）で、片方だけ直すと付け根が浮く。
   * 症状は「体から離れたしっぽ」で、切った本人以外には原因が分からない。
   */
  it("U-815 しっぽの回転軸が、絵を切った位置と一致している", () => {
    const pivot = CUT_PARTS.match(/^PIVOT = \((\d+),\s*(\d+)\)/m);
    const canvas = CUT_PARTS.match(/^SRC_SIZE = (\d+)/m);
    const origin = MOTION_TSX.match(/TAIL_ORIGIN = "([\d.]+)% ([\d.]+)%"/);
    expect(pivot, "cut-parts.py の PIVOT が読めません").not.toBeNull();
    expect(canvas, "cut-parts.py の SRC_SIZE が読めません").not.toBeNull();
    expect(origin, "MascotMotion の TAIL_ORIGIN が読めません").not.toBeNull();

    const size = Number(canvas![1]);
    expect(Number(origin![1])).toBeCloseTo((Number(pivot![1]) / size) * 100, 1);
    expect(Number(origin![2])).toBeCloseTo((Number(pivot![2]) / size) * 100, 1);
  });

  /**
   * ここに状態や `"use client"` が付くと、**動きの実装が「ブラウザ側で動かすもの」に
   * 変わる。** そうなると次に来る人が `Mascot.tsx` も同じ形にしたくなり、
   * 静止画で足りている16か所まで巻き込む道が開く（サーバー側から使えなくなる）。
   * いまは CSS だけで動いていて、この部品は JSX と画像の参照しか持たない。
   */
  it("U-816 動くマスコットが JSX だけで足りている", () => {
    // コメントで `"use client"` の話をしているので、註釈を外してから見る
    const code = MOTION_TSX.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /(^|[^:])\/\/.*$/gm,
      "$1",
    );
    expect(code).not.toMatch(/["']use client["']/);
    expect(code).not.toMatch(/\buseState\b|\buseEffect\b/);
  });
});
