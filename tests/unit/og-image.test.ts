/**
 * アイコンと共有カード（app/icon.png・app/opengraph-image.tsx）の検査。
 * ケース定義は tests/unit/テストケース.md の §22。
 *
 * ここも seo.test.ts と同じく**壊れても画面が何も変わらない領域**で、
 * 症状は「他人のタイムラインの中」に出るので自分では気づけない。
 *   - フォントに無い字を書いた      → カードの文字が豆腐（□）で焼かれる
 *   - openGraph を上書きした        → そのページだけ絵の無い素っ気ないリンクになる
 *   - twitter:card を落とした       → 1200×630 が小さな四角に縮む
 *   - 重いアイコンを置いた          → タブの絵1枚で 1.6MB 配ることになる
 * どれも貼ってみるまで分からず、しかもSNS側にキャッシュされる。だからここで止める。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  OG_IMAGE,
  OG_IMAGE_HEADLINE,
  OG_IMAGE_TAGLINE,
  SITE_NAME,
  publicPageMetadata,
} from "@/lib/seo/site";

function repoFile(path: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)));
}

/**
 * TTF の cmap（文字 → 字形の対応表）を読んで、収録されている符号位置を集める。
 *
 * フォントを読む道具（fontkit・opentype.js）は入れていない。**この検査のためだけに
 * 依存を1つ増やす価値は無い**ので、必要な形式だけ自前で読む。
 * `design/og/subset-font.py` の出力は format 4 の subtable だけを持つ
 * （確認: `fontTools` で platformID 0/3 とも format 4）。
 */
function codepointsInFont(ttf: Buffer): Set<number> {
  const numTables = ttf.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (ttf.subarray(rec, rec + 4).toString("latin1") === "cmap") {
      cmapOffset = ttf.readUInt32BE(rec + 8);
      break;
    }
  }
  if (cmapOffset < 0) throw new Error("cmap テーブルが無い");

  const found = new Set<number>();
  const numSubtables = ttf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const sub = cmapOffset + ttf.readUInt32BE(rec + 4);
    if (ttf.readUInt16BE(sub) !== 4) continue; // format 4 以外は読まない

    const segCount = ttf.readUInt16BE(sub + 6) / 2;
    const endCodes = sub + 14;
    const startCodes = endCodes + segCount * 2 + 2; // reservedPad を1つ挟む
    const idDeltas = startCodes + segCount * 2;
    const idRangeOffsets = idDeltas + segCount * 2;

    for (let s = 0; s < segCount; s++) {
      const end = ttf.readUInt16BE(endCodes + s * 2);
      const start = ttf.readUInt16BE(startCodes + s * 2);
      const delta = ttf.readInt16BE(idDeltas + s * 2);
      const rangeOffset = ttf.readUInt16BE(idRangeOffsets + s * 2);
      if (start === 0xffff) continue;
      for (let cp = start; cp <= end; cp++) {
        let glyph: number;
        if (rangeOffset === 0) {
          glyph = (cp + delta) & 0xffff;
        } else {
          const at = idRangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
          glyph = ttf.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        // 字形 0 は「無い」を表す（豆腐で描かれる）
        if (glyph !== 0) found.add(cp);
      }
    }
  }
  return found;
}

/** PNG の IHDR から縦横を読む（8バイトの署名 + 長さ4 + "IHDR"4 の直後） */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("共有カードのフォント", () => {
  it("U-845 カードに描く文字が全部フォントに入っている（豆腐で焼かれない）", () => {
    const font = repoFile("assets/fonts/MPLUSRounded1c-Bold.subset.ttf");
    const covered = codepointsInFont(font);

    // 実際に画像へ描く文字だけを見る（OG_IMAGE_ALT は alt 属性で、絵には出ない）
    const drawn = [SITE_NAME, ...OG_IMAGE_HEADLINE, OG_IMAGE_TAGLINE].join("");
    const missing = [...new Set(drawn)].filter(
      (ch) => !covered.has(ch.codePointAt(0)!),
    );

    // 落ちたときの直し方をそのまま書く（この検査の値はそこにある）
    expect(
      missing,
      `フォントに無い字: ${missing.join(" ")}\n` +
        "python3 design/og/subset-font.py を回して assets/fonts/ を作り直すこと",
    ).toEqual([]);
  });
});

describe("カードの申告", () => {
  /**
   * **C11 で実測して直した箇所。** `app/opengraph-image.tsx` を置くだけでは、
   * `openGraph` を書いたページ（`publicPageMetadata` を通す全ページ）に og:image が付かない。
   * Next.js が `openGraph` を階層ごとに混ぜず丸ごと差し替えるため、
   * 足してもらった画像も一緒に消える。
   */
  it("U-846 openGraph を上書きするページでも og:image が残る", () => {
    for (const path of ["/", "/terms", "/changelog"]) {
      const og = publicPageMetadata({ path }).openGraph;
      expect(og?.images, `${path} に og:image が無い`).toBeTruthy();
      expect(JSON.stringify(og?.images)).toContain(OG_IMAGE.url);
    }
  });

  it("U-847 X のカードは大きい形（summary_large_image）で、画像も付く", () => {
    const twitter = publicPageMetadata({ path: "/" }).twitter;
    // `Metadata["twitter"]` はカードの型ごとの直和で、`card` を持たない枝もある。
    // 素で `twitter?.card` と書くとビルドの型検査が落ちるので、絞ってから見る
    const card = twitter && "card" in twitter ? twitter.card : undefined;
    // 既定の summary だと 1200×630 が左端の小さな四角に縮む
    expect(card).toBe("summary_large_image");
    expect(JSON.stringify(twitter?.images)).toContain(OG_IMAGE.url);
  });

  it("U-848 申告した大きさ（1200×630）が SNS の想定どおり", () => {
    // 1.91:1 から外すと、切り取られる側で端の文字が落ちる
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(630);
  });
});

describe("アイコン", () => {
  it("U-849 タブのアイコンは正方形で、数十KBに収まっている", () => {
    const icon = repoFile("app/icon.png");
    const { width, height } = pngSize(icon);
    expect(width).toBe(height);
    // 元のマスコットは1枚 1.3〜1.6MB ある。**縮めずに置くと全ページで配ることになる**
    expect(icon.byteLength).toBeLessThan(60 * 1024);
  });

  it("U-850 ホーム画面のアイコンは 180 角（iOS が求める大きさ）", () => {
    const apple = repoFile("app/apple-icon.png");
    expect(pngSize(apple)).toEqual({ width: 180, height: 180 });
    expect(apple.byteLength).toBeLessThan(60 * 1024);
  });
});
