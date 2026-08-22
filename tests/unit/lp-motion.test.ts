/**
 * LP の見出しの動き（`app/globals.css` の `rise` / `[data-reveal]`）の検査。
 * ケース定義は tests/unit/テストケース.md の §19。
 *
 * ここで見るのは2つ。どちらも**壊れても例外が出ない**種類のもの。
 *   - **LP の外に漏れていないか。** 動きの目的が違う（アプリ側は「待っている」
 *     「祝う」を伝えるためで、こちらは読み物の節の切り替わりを見せるため）。
 *     配ってよい場所を決めた記録が、この検査そのもの
 *   - **スクロール連動の指定が、`animation` 短縮形より後に置かれているか。**
 *     短縮形は `animation-timeline` を `auto` に戻すので、順番が入れ替わると
 *     「スクロールしても出てこない」ではなく「読み込み時に全部出てしまう」ほうに転ぶ
 *
 * 「動きを減らす」設定で止まることは §17 の U-811 が見ている
 * （`@theme` の `--animate-*` を機械的に拾うので、`rise` も自動で対象になる）。
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = (rel: string) =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));

const GLOBALS_CSS = readFileSync(root("app/globals.css"), "utf8");

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

  it("U-873 スクロール連動の指定が、どのレイヤーにも入っていない", () => {
    // Tailwind の `.animate-rise` は @layer utilities から出てくる。
    // この規則がどこかの層に入ると、詳細度ではなく層の順番で負け、
    // `animation` 短縮形が animation-timeline を auto に戻したままになる
    const at = GLOBALS_CSS.indexOf("[data-reveal] {");
    expect(at, "[data-reveal] の規則が見つかりません").toBeGreaterThan(-1);

    const before = GLOBALS_CSS.slice(0, at);
    const depth =
      (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(depth, "@theme や @layer の中に入っています").toBe(0);
  });

  it("U-874 animation-timeline は animation 短縮形より後に書かれている", () => {
    // 同じ規則の中で順番が逆だと、短縮形が timeline を auto に戻す。
    // ここは規則をまたぐ形（Tailwind の utility → この規則）なので、
    // 「この規則の中に animation 短縮形を書き足していないこと」を見る
    const rule = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf("[data-reveal] {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toContain("animation-timeline:");
    expect(body, "短縮形を足すと timeline が打ち消される").not.toMatch(
      /animation:\s/,
    );
  });
});
