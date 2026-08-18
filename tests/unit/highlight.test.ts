/**
 * lib/code/highlight.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §13。
 *
 * 色付けは「間違っていても画面は普通に出る」種類の処理で、
 * 壊れ方が**色が消える・素の文字列が混ざる**という静かなものになる。
 * ここで見るのは3つ。
 *   - 色が実際に付いていること（JS / TS の両方）
 *   - 知らない言語や失敗のときに例外ではなく null で返ること（問題画面を落とさない）
 *   - パネルの背景色（app/globals.css）がテーマの背景色とズレていないこと
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CODE_THEME, PRE_CLASS, highlightCode } from "@/lib/code/highlight";

const GLOBALS_CSS = readFileSync(
  fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
  "utf8",
);

/** `--color-code-bg: #1d2021;` のような1行から色を取り出す */
function cssToken(name: string): string | undefined {
  return GLOBALS_CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1];
}

/** 色付き HTML から、その単語に付いた色を取り出す（見つからなければ undefined） */
function colorOf(html: string, word: string): string | undefined {
  return html.match(
    new RegExp(`color:(#[0-9a-fA-F]{6})[^>]*>\\s*${word}\\s*</span>`),
  )?.[1];
}

describe("§13 コードの色付け", () => {
  it("U-600 JavaScript のコードに色が付く", async () => {
    const html = await highlightCode("const total = 900;", "js");

    expect(html).not.toBeNull();
    // キーワードに色が付いている＝トークンごとの span が出ている
    expect(html).toContain("<span");
    expect(html).toMatch(/color:#[0-9a-fA-F]{6}/);
    expect(html).toContain("const");
  });

  it("U-601 TypeScript の型注釈・型宣言にも色が付く", async () => {
    const html = await highlightCode(
      "interface Item { price: number }\nconst tax: number = 0.1;",
      "ts",
    );
    expect(html).not.toBeNull();

    // `interface` が `const` と同じキーワードの色で出る＝TS として読めている
    const constColor = colorOf(
      (await highlightCode("const tax = 0.1;", "js"))!,
      "const",
    );
    expect(colorOf(html!, "interface")).toBe(constColor);

    // 型注釈の `number` も地の文のままではなく色が付く
    expect(colorOf(html!, "number")).toBeTruthy();
    expect(colorOf(html!, "number")).not.toBe(constColor);
  });

  it("U-602 知らない言語・空の言語は色を付けずに null を返す", async () => {
    // 画面側は null なら素のテキストで描く。問題を1件足しただけで落ちてはいけない
    for (const lang of ["ruby", "python", "", null, undefined, "  "]) {
      expect(await highlightCode("puts 1", lang)).toBeNull();
    }
  });

  it("U-603 大文字・前後の空白が混ざった言語名でも読める", async () => {
    for (const lang of [" JS ", "TS", "JavaScript", "tsx"]) {
      expect(await highlightCode("const a = 1;", lang)).not.toBeNull();
    }
  });

  it("U-604 パネルの色（globals.css）がテーマの色とズレていない", () => {
    // ここがズレると、見出しの帯と本文で背景色が変わって段差に見える。
    // 目視では気づきにくいので、テーマを差し替えたときにここで落とす
    const bg = CODE_THEME.colors?.["editor.background"]?.toLowerCase();
    const fg = CODE_THEME.colors?.["editor.foreground"]?.toLowerCase();

    expect(bg).toBeTruthy();
    expect(cssToken("code-bg")?.toLowerCase()).toBe(bg);
    expect(cssToken("code-ink")?.toLowerCase()).toBe(fg);
  });

  it("U-605 色付きの <pre> にも素のときと同じ体裁が付く", async () => {
    const html = await highlightCode("const a = 1;", "js");

    // 余白・行間・等幅の指定。色が付く問題と付かない問題で見た目が変わらないこと
    for (const cls of PRE_CLASS.split(" ")) {
      expect(html).toContain(cls);
    }
  });

  it("U-606 HTML として解釈される文字はエスケープされる", async () => {
    const html = await highlightCode(
      'const s = "<img src=x onerror=alert(1)>";',
      "js",
    );

    // 差し込み先が dangerouslySetInnerHTML なので、ここが崩れると
    // 問題データの書き方ひとつでタグが生きてしまう
    expect(html).not.toContain("<img");
    expect(html).toContain("&#x3C;img");
  });

  it("U-607 空のコード・長いコードでも落ちない", async () => {
    expect(await highlightCode("", "js")).not.toBeNull();

    const long = Array.from({ length: 400 }, (_, i) => `const v${i} = ${i};`).join("\n");
    const html = await highlightCode(long, "js");
    expect(html).toContain("v399");
  });

  it("U-608 同じ内容を2回色付けしても同じ結果になる", async () => {
    // 2回目は読み込み済みのハイライターを使い回す経路を通る
    const code = "function f(n) { return n * 2; }";
    expect(await highlightCode(code, "js")).toBe(await highlightCode(code, "js"));
  });
});
