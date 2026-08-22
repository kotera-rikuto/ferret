/**
 * LP（`/`）の通し。ケース定義は tests/e2e/テストケース.md の §8。
 *
 * タイトル画面が LP に置き換わった（tasks/M2）。ここで見るのは4つ。
 *   - **ログインしていない人が読める**（記事や広告からの着地点なので、ここが要）
 *   - ログイン済みの人はステージ画面へ送られる
 *   - **売っていないものの値段が書かれていない**（課金は D1・D2 の後）
 *   - スクリプトが無くても、狭い画面でも成立している
 *
 * 見出しやボタンの文言そのものは追わない。LP は文言を書き換える前提の画面なので、
 * 文字列で固定すると、直すたびにテストが落ちて意味が薄れる。
 * **行き先（href）と、あってはいけないもの**を見る。
 */

import { test, expect } from "./support/fixtures";

/** `lib/ai/scorer.ts` の NG_WORDS のうち、画面に出てはいけないもの（display.spec.ts と同じ並び） */
const NG_WORDS = [
  "弱点",
  "間違い",
  "間違っ",
  "初心者",
  "失敗",
  "正しい読み方",
  "不正解",
  "理解不足",
  "苦手",
];

/**
 * 値段の書き方。
 *
 * **課金は未実装なので、LP に金額が出ていたらそれは実在しない値段。**
 * `ideas/仕様書.md` §3 の価格（1,480 / 2,980 など）を先に載せてしまう事故を、
 * ここで止める。無料と書くのは構わないので「無料」は見ない。
 */
const PRICE_MARKS = ["¥", "円", "月額", "/ 月", "税込"];

test.describe("§8 LP", () => {
  test("E-464 未ログインで開けて、登録とログインの入口がある", async ({
    page,
  }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);

    // 見出しは1つ。ロゴと惹句を同じ h1 に入れてある
    await expect(page.getByRole("heading", { name: "Ferret" })).toBeVisible();

    // 入口は複数あってよい（上部バー・主役・末尾）。**行き先で数える**
    expect(await page.locator('a[href="/register"]').count()).toBeGreaterThan(
      0,
    );
    expect(await page.locator('a[href="/login"]').count()).toBeGreaterThan(0);
  });

  test("E-465 何のサービスかが本文から読める", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();

    // 「読む」ことを扱うサービスだと分かる語が本文にある。
    // ここが空だと、ロゴとボタンだけだった元のタイトル画面に戻ってしまう
    expect(body).toContain("コード");
    expect(body).toContain("日本語");

    // 節が4つとも描かれている（見出しの階層で確認する）
    const headings = await page
      .getByRole("heading", { level: 2 })
      .allInnerTexts();
    expect(headings.length).toBeGreaterThanOrEqual(4);
  });

  test("E-466 ログイン済みで開くとステージ画面へ送られる", async ({
    authedPage,
  }) => {
    await authedPage.goto("/");
    await expect(authedPage).toHaveURL(/\/stages$/);
  });

  test("E-467 NG語が出ない", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();
    for (const ng of NG_WORDS) {
      expect(body, `LP に NG語「${ng}」がある`).not.toContain(ng);
    }
  });

  test("E-468 まだ売っていないものの値段が書かれていない", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();
    for (const mark of PRICE_MARKS) {
      expect(body, `LP に金額の表記「${mark}」がある`).not.toContain(mark);
    }
    // 無料であることは書いてある
    expect(body).toContain("無料");
  });

  test("E-469 利用規約とプライバシーポリシーへ辿れる", async ({ page }) => {
    for (const name of ["利用規約", "プライバシーポリシー"]) {
      await page.goto("/");
      await page.getByRole("link", { name }).click();
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
  });

  test.describe("スクリプトを切った状態", () => {
    test.use({ javaScriptEnabled: false });

    /**
     * よくある質問は `<details>` で開閉している。
     * 自前の状態を持たない作りなので、**スクリプトが届く前から開ける**のが要点。
     * ここが落ちたら、開閉をクライアント部品で作り直したということ。
     */
    test("E-470 よくある質問が開ける", async ({ page }) => {
      await page.goto("/");
      const first = page.locator("details").first();
      await expect(first).not.toHaveAttribute("open", /.*/);
      await first.locator("summary").click();
      await expect(first).toHaveAttribute("open", /.*/);
    });
  });

  test.describe("スマホ幅", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    /**
     * 記事から来る人はスマホが多い（タスク票の注意）。
     * **コードは中で横スクロールしてよい**が、ページそのものが横に溢れてはいけない。
     * `mobile` プロジェクトは display.spec.ts しか見ないので、幅はここで指定している。
     */
    test("E-471 横スクロールが本文に漏れない", async ({ page }) => {
      await page.goto("/");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
