/**
 * ログインしないで読める範囲（C13・2026-09-11）。
 * ケース定義は tests/e2e/テストケース.md の §14。
 *
 * **ここで見るのは境目の両側。** 片側だけを見ると、どちらの壊れ方も素通りする。
 *   - 開けたはずの側が読めない → 開放そのものが消えている（LP のボタンが行き止まりになる）
 *   - 閉じたはずの側が読める   → 100問がそのまま外へ出る
 *
 * **いちばん重いのは E-722。** ログインしないで採点できてしまうと、
 * その回の費用を誰にも紐づけられない（上限はすべて `user_id` に紐づいている）。
 * このタスクで開けたのは「読む」だけなので、ここが 401 でなくなったら作りが壊れている。
 */

import {
  test,
  expect,
  dismissScenario,
  stageNode,
  stageState,
} from "./support/fixtures";
import type { Page } from "@playwright/test";

/**
 * 回答欄。**メモ欄と取り違えないように名前で引く**
 * （同じ画面に textarea が2つある。もう1つは「メモ（採点には送りません）」）。
 */
function answerBox(page: Page) {
  return page.getByRole("textbox", { name: "回答を入力してください" });
}

test.describe("§14 ログイン前に読める範囲", () => {
  test("E-720 LP の「1問目をみてみる」から、ログインせずに問題が開く", async ({
    page,
  }) => {
    await page.goto("/");

    // 行き先は問題ページ。**ボタンの文言ではなく href の形で引く**
    // （文言は lib/seo/site.ts の定数で、直したときにここが落ちる意味は無い）
    const preview = page.locator('a[href^="/problems/"]').first();
    await expect(preview).toBeVisible();

    await preview.click();
    await expect(page).toHaveURL(/\/problems\/\d+$/);

    // **ログインしていない人が最初に見るのは場面のカード**（A4 との統合で こうなった）。
    // 閉じるまで本文のどこにも触れないので、先に閉じる
    await dismissScenario(page);

    // ログイン画面へ跳ね返されていないこと。コードと設問が出ている
    await expect(page.locator("[data-code-panel]").first()).toBeVisible();
    await expect(answerBox(page)).toBeVisible();
  });

  test("E-721 範囲外の問題は URL を直打ちしてもログイン画面へ（戻り先つき）", async ({
    page,
    problems,
  }) => {
    // シード問題は order 9000番台 ＝ 開放の範囲外
    const locked = problems[0];
    await page.goto(`/problems/${locked.id}`);

    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(`/problems/${locked.id}`)}`),
    );
    // 本文が出ていないこと（リダイレクトの前に描いていない）。
    // 場面のカード（A4）も出ていないこと ── あれは本文より前に重なるので、
    // ここが漏れると「読めないが場面だけ読める」状態を見逃す
    await expect(page.locator("[data-code-panel]")).toHaveCount(0);
    await expect(page.locator("[data-scenario-intro]")).toHaveCount(0);
  });

  test("E-722 未ログインの採点APIは 401 のまま（費用の穴を開けていない）", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");

    const res = await page.request.post("/api/score", {
      headers: { "Content-Type": "application/json", Origin: baseURL ?? "" },
      data: { problem_id: 1, answer: "あ".repeat(200) },
      failOnStatusCode: false,
    });

    expect(res.status()).toBe(401);
  });

  test("E-723 未ログインでもマップは開き、鍵つきのステージは押せない", async ({
    page,
    problems,
  }) => {
    await page.goto("/stages");
    await expect(page).toHaveURL(/\/stages$/);

    // 登録への導線がある（ログアウトやせっていは出さない）
    expect(await page.locator('a[href="/register"]').count()).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "ログアウト" })).toHaveCount(0);

    // シード問題（範囲外）は鍵のまま。押してもポップオーバーが開かない
    expect(await stageState(page, problems[0].order)).toBe("locked");
    await stageNode(page, problems[0].order)
      .locator("button")
      .first()
      .click({ force: true });
    await expect(page.getByRole("button", { name: "挑む" })).toHaveCount(0);
  });

  test("E-724 書いて押すと登録への案内が出て、採点は走らない", async ({ page }) => {
    // 採点APIを1回でも叩いたら記録する。**叩かないことがこのケースの中身**
    const scored: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/score")) scored.push(r.url());
    });

    await page.goto("/");
    await page.locator('a[href^="/problems/"]').first().click();
    await expect(page).toHaveURL(/\/problems\/\d+$/);
    await dismissScenario(page);

    const answer = "ログインしないで書いた下書きです。".repeat(6);
    await answerBox(page).fill(answer);
    await page.getByRole("button", { name: "回答する" }).click();

    // 登録への導線が出る
    await expect(page.locator('a[href="/register"]')).toBeVisible();
    expect(scored).toHaveLength(0);

    // **書いた内容は消えない。** 端末に残しておき、登録後に同じ問題を開くと戻る
    await page.reload();
    await dismissScenario(page);
    await expect(answerBox(page)).toHaveValue(answer);
  });
});
