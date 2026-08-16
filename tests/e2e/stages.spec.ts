/**
 * ステージ選択と問題画面。
 * ケース定義は tests/e2e/テストケース.md の §2・§3。
 */

import { test, expect, markCleared } from "./support/fixtures";

test.describe("§2 ステージ選択", () => {
  test("E-200/201 回答が無ければ先頭だけが開いていて、鍵つきは押せない", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto("/stages");

    await expect(page.getByText("🐾")).toHaveCount(1);
    await expect(page.getByText("🔒")).toHaveCount(problems.length - 1);

    // 鍵つきのノードを押してもモーダルが開かない
    await page.getByText("🔒").first().click({ force: true });
    await expect(page.getByText("このステージに挑みますか？")).toHaveCount(0);
  });

  test("E-202 クリアすると次のステージが開く", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 100);
    await authedPage.goto("/stages");

    await expect(authedPage.getByText("✅")).toHaveCount(1);
    await expect(authedPage.getByText("🐾")).toHaveCount(1);
  });

  test("E-203 54点ではクリアにならない（境界）", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 54);
    await authedPage.goto("/stages");

    await expect(authedPage.getByText("✅")).toHaveCount(0);
    await expect(authedPage.getByText("🐾")).toHaveCount(1);
  });

  test("E-203b 55点ちょうどでクリアになる（境界）", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 55);
    await authedPage.goto("/stages");
    await expect(authedPage.getByText("✅")).toHaveCount(1);
  });

  test("E-205/207 現在地を押すと確認が出て、問題画面へ進める", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto("/stages");

    await page.getByText("🐾").click();
    await expect(page.getByText("このステージに挑みますか？")).toBeVisible();

    await page.getByRole("button", { name: "挑む" }).click();
    await expect(page).toHaveURL(new RegExp(`/problems/${problems[0].id}`));
  });

  test("E-206 クリア済みは「復習」の文言になる", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 100);
    await authedPage.goto("/stages");

    await authedPage.getByText("✅").click();
    await expect(authedPage.getByText("このステージを復習しますか？")).toBeVisible();
    await expect(authedPage.getByRole("button", { name: "復習する" })).toBeVisible();
  });

  test("E-208 キャンセルすると閉じる", async ({ authedPage, problems }) => {
    void problems;
    const page = authedPage;
    await page.goto("/stages");

    await page.getByText("🐾").click();
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByText("このステージに挑みますか？")).toHaveCount(0);
    await expect(page).toHaveURL(/\/stages/);
  });

  test("E-210 各ノードにステージ番号とタイトルが出る", async ({
    authedPage,
    problems,
  }) => {
    await authedPage.goto("/stages");
    await expect(authedPage.getByText(`Stage ${problems[0].order}`)).toBeVisible();
    await expect(authedPage.getByText(problems[0].title)).toBeVisible();
  });
});

test.describe("§3 問題画面", () => {
  test("E-230/231/232 コード・設問・入力欄と外部送信の告知が出る", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    await expect(page.getByRole("heading", { name: problems[0].title })).toBeVisible();
    await expect(page.locator("pre code")).toContainText("const rate = 0.9");
    await expect(page.getByText("このコードを実行すると何が起きますか。")).toBeVisible();

    // 仕様書 §9.5 の法務要件。常時表示であること
    await expect(
      page.getByText("回答は採点のため OpenAI に送信されます"),
    ).toBeVisible();
  });

  test("E-233〜236 文字数の下限・上限がボタンの活性に反映される", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    const input = page.getByPlaceholder("回答を入力してください...");
    const submit = page.getByRole("button", { name: "回答する" });

    await expect(page.getByText("あと 10 文字")).toBeVisible();
    await expect(submit).toBeDisabled();

    await input.fill("あ".repeat(9));
    await expect(page.getByText("あと 1 文字")).toBeVisible();
    await expect(submit).toBeDisabled();

    await input.fill("あ".repeat(10));
    await expect(submit).toBeEnabled();

    await input.fill("あ".repeat(601));
    await expect(page.getByText("1 文字オーバー")).toBeVisible();
    await expect(submit).toBeDisabled();
  });

  test("E-237 空白だけの入力は文字数に数えない", async ({ authedPage, problems }) => {
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    await page.getByPlaceholder("回答を入力してください...").fill("   ".repeat(10));
    await expect(page.getByRole("button", { name: "回答する" })).toBeDisabled();
  });

  test("E-239 存在しない問題は 404", async ({ authedPage }) => {
    const res = await authedPage.goto("/problems/999999");
    expect(res?.status()).toBe(404);
  });

  test("E-240 画面のソースに模範解答が含まれない", async ({
    authedPage,
    problems,
  }) => {
    await authedPage.goto(`/problems/${problems[0].id}`);
    const html = await authedPage.content();

    expect(html).not.toContain("TypeError が発生して実行が止まります");
    expect(html).not.toContain("core_reject");
    expect(html).not.toContain("900 が出力されると読んでいる");
  });

  test("E-415 未解放ステージは URL を直接打っても開けない", async ({
    authedPage,
    problems,
  }) => {
    const res = await authedPage.goto(`/problems/${problems[1].id}`);
    expect(res?.status()).toBe(404);
  });

  test("E-415b 前のステージをクリアすれば開く", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 100);
    const res = await authedPage.goto(`/problems/${problems[1].id}`);
    expect(res?.status()).toBe(200);
    await expect(
      authedPage.getByRole("heading", { name: problems[1].title }),
    ).toBeVisible();
  });

  test("E-273 振り返り画面はまだ無い", async ({ authedPage, problems }) => {
    const res = await authedPage.goto(`/review/${problems[0].id}`);
    expect(res?.status()).toBe(404);
  });
});
