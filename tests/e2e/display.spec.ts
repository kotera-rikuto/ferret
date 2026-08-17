/**
 * 表示まわり。
 * ケース定義は tests/e2e/テストケース.md の §6。
 *
 * playwright.config.ts の `mobile` プロジェクトはこのファイルだけを対象にしている。
 * 同じテストがデスクトップ幅とスマホ幅の両方で走る。
 */

import {
  test,
  expect,
  stub,
  deepOutput,
  markCleared,
  clearPrecedingStages,
  ANSWER,
} from "./support/fixtures";

/** lib/ai/scorer.ts の NG_WORDS のうち、画面に出てはいけないもの */
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

test.describe("§6 表示", () => {
  test("E-450 ブラウザのタブに出るタイトル", async ({ page }) => {
    await page.goto("/");
    // 🟡 create-next-app の既定値のまま。プロダクト名に変えたら期待値を直す
    await expect(page).toHaveTitle("Create Next App");
  });

  test("E-451 コードはダークテーマで表示される", async ({ authedPage, problems }) => {
    await authedPage.goto(`/problems/${problems[0].id}`);
    const block = authedPage.locator("pre").first();
    const bg = await block.evaluate((el) =>
      getComputedStyle(el.parentElement!).backgroundColor,
    );
    // zinc-900 相当。明るい背景になっていないことを見る
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(200);
  });

  /**
   * 実行結果（context）と前提知識（prerequisite）は、入っている問題だけで枠が増える。
   *
   * 見るべきは**空の問題が今までどおり出ること**。
   * 欄を足したときに壊れるのはこちら側で、2枠目が出ないことより気づきにくい。
   */
  test("E-456 実行結果と前提知識は、入っている問題だけ枠が増える", async ({
    authedPage,
    problems,
    userId,
  }) => {
    // シードは実コンテンツの後ろ（order 9001 以降）に並ぶので、
    // 先行するステージをクリアしないと解放されない
    await clearPrecedingStages(userId);

    // 1問目: どちらも空。コードの枠だけで、増えた要素は出ない
    await authedPage.goto(`/problems/${problems[0].id}`);
    await expect(authedPage.locator("pre")).toHaveCount(1);
    await expect(authedPage.getByText("実行結果")).toHaveCount(0);
    await expect(authedPage.getByText("わからない言葉があるとき")).toHaveCount(0);

    // 2問目: どちらも入っている。1問目をクリアして解放する
    await markCleared(userId, problems[0].id, 100);
    await authedPage.goto(`/problems/${problems[1].id}`);

    // 実行結果はコードと混ざらず、別のパネルとして出る
    await expect(authedPage.locator("pre")).toHaveCount(2);
    await expect(authedPage.getByText("実行結果")).toBeVisible();
    await expect(authedPage.locator("pre").nth(1)).toContainText("node addTag.js");

    // 前提知識は閉じた状態で置かれ、押すと開く（JS を使わない details）
    const body = authedPage.getByText("配列の末尾に要素を足すメソッド");
    await expect(body).toBeHidden();
    await authedPage.getByText("わからない言葉があるとき").click();
    await expect(body).toBeVisible();
  });

  test("E-452 主要な画面に NG語が出ない", async ({ authedPage, problems }) => {
    const pages = ["/", "/login", "/register", "/stages", `/problems/${problems[0].id}`];
    for (const path of pages) {
      await authedPage.goto(path);
      const body = await authedPage.locator("body").innerText();
      for (const ng of NG_WORDS) {
        expect(body, `${path} に NG語「${ng}」がある`).not.toContain(ng);
      }
    }
  });

  test("E-452b リザルト画面（不合格帯）にも NG語が出ない", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput(["none", "none", "none", "none"]));
    await authedPage.goto(`/problems/${problems[0].id}`);
    await authedPage.getByPlaceholder("回答を入力してください...").fill(ANSWER);
    await authedPage.getByRole("button", { name: "回答する" }).click();
    await authedPage.waitForURL(/\/result\//);

    const body = await authedPage.locator("body").innerText();
    for (const ng of NG_WORDS) {
      expect(body, `リザルトに NG語「${ng}」がある`).not.toContain(ng);
    }
  });

  test("E-453/454 横スクロールが本文に漏れない", async ({ authedPage, problems }) => {
    await authedPage.goto(`/problems/${problems[0].id}`);

    const overflow = await authedPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // 1px のずれは許容する
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("E-453b ステージ・リザルトも横に溢れない", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 100);

    for (const path of ["/stages", `/result/${problems[0].id}`]) {
      await authedPage.goto(path);
      const overflow = await authedPage.evaluate(
        () =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} が横に溢れている`).toBeLessThanOrEqual(1);
    }
  });

  test("E-455 キーボードだけで回答を送信できる", async ({ authedPage, problems }) => {
    await stub.setOutput(deepOutput());
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    await page.getByPlaceholder("回答を入力してください...").focus();
    await page.keyboard.type(ANSWER);
    await page.keyboard.press("Tab");
    // 入力欄の次にフォーカスが当たるのが送信ボタンであること
    const focused = await page.evaluate(() => document.activeElement?.textContent);
    expect(focused).toContain("回答する");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/result\//);
  });

  test("E-272 0点でも罰のように見える表示になっていないか（現状の記録）", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(
      deepOutput(["none", "none", "none", "none"], {
        contradiction: true,
        contradiction_evidence: "よく分かりませんでした",
      }),
    );
    await authedPage.goto(`/problems/${problems[0].id}`);
    await authedPage
      .getByPlaceholder("回答を入力してください...")
      .fill("よく分かりませんでした、たぶん何かが起きます");
    await authedPage.getByRole("button", { name: "回答する" }).click();
    await authedPage.waitForURL(/\/result\//);

    // 🟡 残課題 §5。巨大な数字で 0 を出す現状を固定しておく。
    // レイアウトを変えたらこの期待値を直す
    const score = authedPage.locator("span.text-9xl");
    await expect(score).toBeVisible();
    await expect(score).toHaveText("0");
  });
});
