/**
 * 暗い配色の定義（app/globals.css）と、切り替えの入口（lib/theme.ts）の検査。
 * ケース定義は tests/unit/テストケース.md の §15。
 *
 * 配色は**壊れても例外が出ない。** 色が1つ抜けたときの症状は
 * 「暗い画面の中に1か所だけ明るい箱が残る」で、その画面を開いた人しか気づけない。
 * 見た目そのものは測れないので、ここで見るのは次の3つに絞ってある。
 *   - 明るい側にある色が、暗い側で**決着している**（差し替えるか、据え置くと決めてあるか）
 *   - 暗い側の定義が、Tailwind の層より後に置かれている（層に入ると効かない）
 *   - 最初の描画より前に走る script が、lib/theme.ts と同じ保存先・同じ値を見ている
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isTheme,
} from "@/lib/theme";

const GLOBALS_CSS = readFileSync(
  fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
  "utf8",
);

/** `セレクタ { ... }` の中身を、入れ子の `{}` を数えながら取り出す */
function blockOf(opening: string): string {
  const start = GLOBALS_CSS.indexOf(opening);
  expect(start, `${opening} が見つかりません`).toBeGreaterThan(-1);

  let depth = 0;
  for (let i = GLOBALS_CSS.indexOf("{", start); i < GLOBALS_CSS.length; i++) {
    if (GLOBALS_CSS[i] === "{") depth++;
    if (GLOBALS_CSS[i] === "}" && --depth === 0) {
      return GLOBALS_CSS.slice(start, i + 1);
    }
  }
  throw new Error(`${opening} の括弧が閉じていません`);
}

/** そのブロックが定義している色の名前（`--color-` を外したもの） */
function colorTokens(block: string): Set<string> {
  return new Set(
    [...block.matchAll(/--color-([a-z-]+)\s*:/g)].map((m) => m[1]),
  );
}

const LIGHT = colorTokens(blockOf("@theme {"));
const DARK = colorTokens(blockOf('[data-theme="dark"] {'));

/**
 * 暗い側であえて差し替えない色と、その理由。
 *
 * **この一覧に足すときは globals.css 側にも理由を書くこと。**
 * ここが「決めた」の記録なので、空欄のまま増えると
 * 差し替え忘れと見分けが付かなくなる。
 */
const KEPT_ON_PURPOSE: Record<string, string> = {
  "brand-deep":
    "文字色としても使うので、モックの濃い値にすると読めなくなる（globals.css に実測値あり）",
  "code-bg": "Shiki のテーマの背景。ズレると U-604 が落ちる",
  "code-ink": "Shiki のテーマの地の文。ズレると U-604 が落ちる",
  "code-muted":
    "コードパネルの下地が変わらないので、見出しの文字も変える必要がない",
};

describe("§15 画面の配色", () => {
  it("U-800 明るい側の色は、暗い側で差し替えるか据え置くかが決まっている", () => {
    // 新しい色を足した人に「暗いときどうするか」を必ず1回考えさせるための検査。
    // 足しただけで通ってしまうと、その色のところだけ明るいまま取り残される
    const undecided = [...LIGHT].filter(
      (name) => !DARK.has(name) && !(name in KEPT_ON_PURPOSE),
    );
    expect(undecided).toEqual([]);
  });

  it("U-801 据え置くと決めた色は、暗い側で差し替えられていない", () => {
    // 逆向きの取りこぼし。理由を書いて据え置いたはずの色が
    // あとから黙って差し替えられると、その理由ごと消える
    const overridden = Object.keys(KEPT_ON_PURPOSE).filter((name) =>
      DARK.has(name),
    );
    expect(overridden).toEqual([]);
  });

  it("U-802 暗い側の定義は @theme の外にある", () => {
    // Tailwind は @theme の中身を `@layer theme` の `:root` として出す。
    // 暗い側を同じ中に入れると同じ変数の後勝ちになり、
    // **明るい配色のほうが常に暗い色で描かれる**（切り替えていないのに崩れる）
    const theme = blockOf("@theme {");
    expect(theme).not.toContain("data-theme");

    // 規則そのものが @theme を閉じた後にあること（触れている注記ではなく実体を見る）
    const themeEnds = GLOBALS_CSS.indexOf(theme) + theme.length;
    expect(GLOBALS_CSS.indexOf('[data-theme="dark"] {')).toBeGreaterThan(
      themeEnds,
    );
  });

  it("U-803 最初の描画より前に走る script が lib/theme.ts と同じものを見ている", () => {
    // script は文字列なので、定数を変えても機械的には追随しない。
    // 保存先の名前がズレると「覚えたはずの配色が次に開くと戻る」だけで、
    // 例外もエラーも出ない
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    for (const theme of THEMES) {
      expect(THEME_INIT_SCRIPT).toContain(`"${theme}"`);
    }
    expect(THEME_INIT_SCRIPT).toContain("data-theme");
    // localStorage が読めない環境で落ちないこと（プライベートモードなど）
    expect(THEME_INIT_SCRIPT).toContain("catch");
  });

  it("U-805 明るい側の赤は、値を写さず Tailwind の色を参照している", () => {
    // Tailwind v4 の red-600 は `#dc2626` ではなく `#e40014`（＋広色域用の値）。
    // 「暗い配色を足すだけ」のつもりで手で写すと、**明るい画面の赤が変わる。**
    // 実際に一度 #dc2626 と書いて取り違えた（tasks/E9 の作業記録）。
    // 参照にしておけば、広色域の端末で使われる値まで含めて元と同じものが出る。
    const light = blockOf("@theme {").match(/--color-danger:\s*([^;]+);/)?.[1];
    expect(light).toBe("var(--color-red-600)");

    // 暗い側は逆に、参照ではなく自前の値であること
    // （red-600 を差し替えると退会ボタンの背景まで動いてしまうため）
    const dark = blockOf('[data-theme="dark"] {').match(
      /--color-danger:\s*([^;]+);/,
    )?.[1];
    expect(dark).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("U-804 覚えてある値が壊れていても配色として扱わない", () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
    for (const bad of ["", "DARK", "sepia", null, undefined, 1, {}]) {
      expect(isTheme(bad)).toBe(false);
    }
    // 既定は明るい側。サーバーが返す HTML もこの値で描かれる
    expect(isTheme(DEFAULT_THEME)).toBe(true);
    expect(DEFAULT_THEME).toBe("light");
  });
});
