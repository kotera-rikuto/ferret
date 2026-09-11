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
import { codepointsInFont } from "../support/font";
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

  /**
   * 結果の共有カード（G1）は**問題名を描く**ので、切り出したフォントでは足りない。
   *
   * 実測（2026-09-11）で 106件中85件が豆腐になることを確認したうえで、
   * **丸ごと同梱に切り替えた。** ここはその判断が生きているかだけを見る
   * ── 誰かが「重いから」と切り出したものに戻すと、
   * **絵は出るが問題名だけが □ になる**（しかも SNS に流れてから分かる）。
   *
   * 投入済みの全タイトルを突き合わせる検査は `npm run test:db` の I-894（§15）。
   * あちらは DB を読むので既定では走らない。**両方揃って初めて網になる。**
   */
  it("U-907 結果カードのフォントは切り出しではなく全部入りである", () => {
    const full = repoFile("assets/fonts/MPLUSRounded1c-Bold.ttf");
    const covered = codepointsInFont(full);

    // 常用漢字の一部を抜き出した見本。問題タイトルに実際に出てくる字で、
    // **切り出したほうには入っていない**ものを選んである
    const sample = "担当者暗黙型変換短絡罠掘浮動小数点再帰";
    const missing = [...sample].filter((ch) => !covered.has(ch.codePointAt(0)!));

    expect(
      missing,
      `フォントに無い字: ${missing.join(" ")}\n` +
        "assets/fonts/MPLUSRounded1c-Bold.ttf（全部入り）が要る。" +
        "切り出したものに戻すと問題名が豆腐で焼かれる",
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
