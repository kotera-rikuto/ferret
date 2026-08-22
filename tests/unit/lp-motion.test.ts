/**
 * LP の見出しの動き（`app/globals.css` の `rise` / `components/lp/Reveal.tsx`）の検査。
 * ケース定義は tests/unit/テストケース.md の §19。
 *
 * ここで見るのは3つ。どれも**壊れても例外が出ない**種類のもの。
 *   - **LP の外に漏れていないか。** 動きの目的が違う（アプリ側は「待っている」
 *     「祝う」を伝えるためで、こちらは読み物の節の切り替わりを見せるため）。
 *     配ってよい場所を決めた記録が、この検査そのもの
 *   - **`animation-timeline` に戻っていないか。** 一度それで作って失敗している ──
 *     Safari と Firefox は宣言ごと無視するので、**その環境では動きが無いのと同じ**に
 *     なる。Chromium で計測すると「動いている」と出るので気づけない（U-875）
 *   - **文字が消えたままになる経路が無いか。** 隠す指定はサーバーの HTML に入れず、
 *     「動きを減らす」設定なら何もしない（U-876）
 *
 * 「動きを減らす」設定で `animate-rise` が止まることは §17 の U-811 が見ている
 * （`@theme` の `--animate-*` を機械的に拾うので、`rise` も自動で対象になる）。
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (rel: string) =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));

const GLOBALS_CSS = readFileSync(root("app/globals.css"), "utf8");

/**
 * コメントを除いた CSS。
 *
 * 実際の指定だけを見たいときに使う。**このファイルはコメントに理由を長く書く方針**
 * なので、素の文字列で探すと「やめた理由の説明」まで拾ってしまう
 * （U-875 が実際にそれで落ちた）。
 */
const CSS_RULES = GLOBALS_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * LP の動きを当ててよいファイル。
 *
 * `app/page.tsx` が LP 本体、`components/lp/` はその部品置き場。
 * **ここに足すのは「LP を分割した」ときだけ。** 画面を増やすために足さない。
 */
const ALLOWED = ["app/page.tsx", "components/lp/"];

/** `app/` と `components/` の .tsx を全部集める */
function collectTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(root(dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(root(rel)).isDirectory()) collectTsx(rel, acc);
    else if (name.endsWith(".tsx")) acc.push(rel);
  }
  return acc;
}

const SOURCES = [...collectTsx("app"), ...collectTsx("components")].map(
  (rel) => ({
    rel,
    text: readFileSync(root(rel), "utf8"),
  }),
);

describe("§19 LP の見出しの動き", () => {
  it("U-870 対象のファイルを拾えている（検査の前提）", () => {
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(SOURCES.map((f) => f.rel)).toContain("app/page.tsx");
  });

  it("U-871 animate-rise と data-reveal は LP の外で使われていない", () => {
    const strays = SOURCES.filter(
      (f) =>
        /animate-rise|data-reveal/.test(f.text) &&
        !ALLOWED.some((ok) => f.rel.startsWith(ok)),
    ).map((f) => f.rel);

    expect(
      strays,
      `LP 以外で使われています。動きは LP の見出しだけに配る決めです: ${strays.join(", ")}`,
    ).toEqual([]);
  });

  it("U-872 LP 側では実際に使われている（消し忘れた定義にならない）", () => {
    const used = SOURCES.filter((f) => /animate-rise/.test(f.text)).map(
      (f) => f.rel,
    );
    expect(used.length).toBeGreaterThan(0);
    expect(GLOBALS_CSS).toContain("--animate-rise:");
    expect(GLOBALS_CSS).toContain("[data-reveal]");
  });

  it("U-873 動き出す前の指定が、どのレイヤーにも入っていない", () => {
    // Tailwind の utility は @layer utilities から出てくる。この規則がどこかの層に
    // 入ると、詳細度ではなく層の順番で負ける（暗い配色と同じ理屈）
    const at = GLOBALS_CSS.indexOf("[data-reveal] {");
    expect(at, "[data-reveal] の規則が見つかりません").toBeGreaterThan(-1);

    const before = GLOBALS_CSS.slice(0, at);
    const braces = (s: string, ch: string) => s.split(ch).length - 1;
    expect(
      braces(before, "{") - braces(before, "}"),
      "@theme や @layer の中に入っています",
    ).toBe(0);
  });

  /**
   * **一度これで作って失敗している（2026-08-22）。**
   * `animation-timeline: view()` は Chrome 系だけの機能で、Safari と Firefox は
   * 宣言ごと無視する。無視されると読み込み時に1回動く扱いになり、画面外の見出しは
   * スクロールして見るころには動き終わっている ── 動きが無いのと同じになる。
   * **Chromium で測ると「動いている」と出るので、実測では気づけない。**
   */
  it("U-875 CSS だけのスクロール連動（animation-timeline）に戻っていない", () => {
    expect(
      CSS_RULES,
      "animation-timeline は Safari・Firefox で無視される。Reveal.tsx の監視に寄せること",
    ).not.toContain("animation-timeline:");
    expect(CSS_RULES).not.toContain("animation-range:");
  });

  /**
   * 隠す指定が**サーバーの HTML に入っていない**こと。
   * 入れてしまうと、スクリプトが届かない人・クローラ・「動きを減らす」設定の人に
   * 文字が出ないままになる。症状は「文字が無い画面」で、例外は出ない。
   */
  it("U-876 隠すのはブラウザ側だけ／動きを減らす設定では何もしない", () => {
    const reveal = SOURCES.find((f) => f.rel === "components/lp/Reveal.tsx");
    expect(reveal, "components/lp/Reveal.tsx が見つかりません").toBeDefined();

    // クライアント側で動く部品であること
    expect(reveal!.text.startsWith('"use client";')).toBe(true);
    // 「動きを減らす」設定を見て降りること
    expect(reveal!.text).toContain("prefers-reduced-motion");
    // 隠す属性はブラウザ側で付けること
    expect(reveal!.text).toContain('setAttribute("data-reveal"');
    // JSX の属性として書いていないこと（＝サーバーの HTML に入らない）
    expect(
      /<div[^>]*\sdata-reveal/.test(reveal!.text),
      "サーバーが返す HTML に隠す指定を入れてはいけない",
    ).toBe(false);
  });
});
