import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ステージマップの道（ノードを繋ぐ線）の幾何。
 *
 * **見ているのは CSS と SVG の食い違い。** 道は `<section>` の中の SVG に描くが、
 * 章と章の間には CSS の余白（`my-9`）と区切りの帯がある。この高さは
 * SVG の座標属性（`y1` / `y2`）に数字で書くしかない ── 幾何属性なので
 * クラスやメディアクエリでは表せない。
 *
 * つまり **markup のクラスと TS の定数が同じ高さを指していないと、道の端が
 * 丸から外れる。** 外れても画面は正常に見える（線が少しずれるだけ）ので、
 * ここで固定する。実際 2026-08-19 まで**章を跨ぐ線そのものが無く**、
 * 区切りの上下に 335px の空白ができていた。
 *
 * 描画して測るのが本筋だが、この環境には DOM が無い（`vitest.config.mts` は
 * `environment: "node"`）。ブラウザでの実測は E2E 側の役目なので、
 * ここでは**源泉である2つの数字が一致していること**だけを見る。
 */

const SOURCE = readFileSync(
  join(process.cwd(), "components/stage/StageMap.tsx"),
  "utf8",
);

/** `const NAME = 123;` を読む */
function constOf(name: string): number {
  const m = SOURCE.match(new RegExp(`const ${name} = (\\d+);`));
  expect(m, `${name} の定義が見つからない`).not.toBeNull();
  return Number(m![1]);
}

/**
 * 章の区切りの `className`。
 * **`my-9` を目印に引く。** 「ここから」の文字から遡る形にすると、
 * 内側の `<span>` の className を拾ってしまう
 */
function dividerClassName(): string {
  const m = SOURCE.match(/className="([^"]*my-9[^"]*)"/);
  expect(m, "章の区切り（my-9 を持つ要素）が見つからない").not.toBeNull();
  return m![1];
}

describe("§12-3 マップの道", () => {
  it("U-820 章の区切りの高さが、markup のクラスと定数で一致している", () => {
    const margin = constOf("CHAPTER_GAP_MARGIN");
    const label = constOf("CHAPTER_LABEL_H");
    const divider = dividerClassName();

    // Tailwind の 1 単位 = 4px。my-9 = 36px、h-5 = 20px
    expect(divider, "区切りの上下の余白が my-9 でない").toContain("my-9");
    expect(margin, "CHAPTER_GAP_MARGIN が my-9（36px）と合っていない").toBe(36);
    expect(divider, "区切りの帯の高さが h-5 で固定されていない").toContain("h-5");
    expect(label, "CHAPTER_LABEL_H が h-5（20px）と合っていない").toBe(20);

    // 帯の高さを固定するのは、文字の行の高さ（13px × 1.5 = 19.5）に頼ると
    // フォントや文字サイズを変えた日に道の端が静かにずれるため
    expect(divider).toContain("text-[13px]");
  });

  it("U-821 章を跨ぐ道が引かれている", () => {
    // 節ごとに線を引く作りなので、節と節の間は誰も描かない区間になりうる。
    // 次の章の先頭ノードへ繋ぐ線があること（無いと道が途切れて見える）
    expect(SOURCE).toMatch(/y1=\{height \+ CHAPTER_GAP \+ PAD_TOP\}/);
    expect(SOURCE, "跨ぐ相手（次のグループの先頭ノード）を引いていない").toMatch(
      /nextGroup\.stages\[nextGroup\.stages\.length - 1\]/,
    );
  });

  it("U-822 区切りの帯は道より上に描かれ、見出しに地の色が敷かれている", () => {
    const divider = dividerClassName();
    // 道は節の SVG から溢れて帯の高さを跨ぐ。帯が下だと線が見出しの上を通る
    expect(divider, "区切りが道より上に来ない（relative z-10 が無い）").toContain(
      "z-10",
    );
    // 見出しの文字を線が横切っても読めるようにする。
    // **目印はテンプレートリテラルのほう。** 「ここから 第N章」はコメントにも
    // 出てくるので、素の文字列で探すと markup ではなく注記を拾う
    const at = SOURCE.indexOf("`ここから 第${");
    expect(at, "区切りの見出しの markup が見つからない").toBeGreaterThan(0);
    const span = SOURCE.lastIndexOf("<span", at);
    expect(
      SOURCE.slice(span, at),
      "見出しに地の色（bg-bg）が敷かれていない",
    ).toContain("bg-bg");
  });
});
