/**
 * せってい画面（パスワード変更・退会）の通し。
 * ケース定義は tests/e2e/テストケース.md の §8。
 *
 * **この spec は共有のテストユーザー（TEST_USER）を一切使わない。** 理由は2つ。
 *   1. 退会するとユーザーが消え、パスワードを変えると他の spec がログインできなくなる
 *   2. 作業ツリーを分けた別セッションと**同じ DB を共有している**ため、
 *      共有ユーザーの回答履歴を触ると、相手の実行中のテストを壊しうる（その逆もある）
 * そこで1テストにつき使い捨てアカウントを1つ作り、その中で使い切る。
 * 管理APIで作るので確認メールは飛ばない。
 */

import {
  test as base,
  expect,
  submitLoginForm,
  createDisposableUser,
  removeUser,
  authUserExists,
  profileRowExists,
  firstProblemId,
  markCleared,
  countAllAttempts,
  type DisposableUser,
} from "./support/fixtures";
import type { Page } from "@playwright/test";

/**
 * 退会の確認欄に入力する語。
 *
 * 原本は `lib/account.ts` の `DELETE_CONFIRM_WORD`。E2E は他の spec と同じく
 * アプリのコードを import せず、画面から見える文字だけで組んである。
 * **原本を変えたらここも変えること**（案内文とボタンの活性が同時に落ちるので、
 * 気づかないままにはならない）。
 */
const CONFIRM_WORD = "削除";

const test = base.extend<{
  /** このテスト専用の使い捨てアカウント。終了時に消す */
  account: DisposableUser;
  /** 使い捨てアカウントでログイン済みのページ */
  accountPage: Page;
}>({
  account: async ({}, use) => {
    const user = await createDisposableUser("c3");
    await use(user);
    // 退会が通っていれば既に居ないので、その場合は何もしない
    await removeUser(user.id);
  },

  accountPage: async ({ page, account }, use) => {
    await page.goto("/login");
    await submitLoginForm(page, { email: account.email, password: account.password });
    await page.waitForURL("**/stages");
    await use(page);
  },
});

/** 退会の確認欄。ラベルの文言は画面と1文字ずつ同じにしてある */
function confirmBox(page: Page) {
  return page.getByLabel(`確認のため「${CONFIRM_WORD}」と入力してください`);
}

function passwordBox(page: Page) {
  return page.getByLabel("パスワード（ご本人の確認のため）");
}

async function openWithdrawal(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "退会の手続きへ" }).click();
}

test.describe("§8 せってい", () => {
  test("E-700 未ログインで /settings を開くとログイン画面へ送られ、ログイン後に戻る", async ({
    page,
    account,
  }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);

    // ここで goto し直すと next が消えるので、開いている画面のまま送る
    await submitLoginForm(page, { email: account.email, password: account.password });

    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("heading", { name: "せってい" })).toBeVisible();
  });

  test("E-701 サイドバーの「せってい」から開ける", async ({ accountPage: page }) => {
    await page.getByRole("link", { name: "せってい" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("heading", { name: "せってい" })).toBeVisible();
  });

  test("E-702 いま入っているメールアドレスが出る", async ({
    accountPage: page,
    account,
  }) => {
    await page.goto("/settings");
    // 退会もパスワード変更も「どのアカウントに対する操作か」が要る。
    // サイドバーの足元にも同じアドレスが出ているので、本文側に絞って見る
    await expect(page.getByRole("main").getByText(account.email)).toBeVisible();
  });

  /**
   * 設定画面を開いただけで、取り消せないボタンが目の前にある状態を避けている。
   * 「退会の手続きへ」を押すまで確認欄も実行ボタンも出さない。
   */
  test("E-703 退会は折りたたまれている", async ({ accountPage: page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "退会する" })).toHaveCount(0);

    await page.getByRole("button", { name: "退会の手続きへ" }).click();
    await expect(page.getByRole("button", { name: "退会する" })).toBeVisible();
  });

  test("E-704 確認の語とパスワードが揃うまで退会できない", async ({
    accountPage: page,
    account,
  }) => {
    await openWithdrawal(page);
    const button = page.getByRole("button", { name: "退会する" });

    await expect(button).toBeDisabled();

    // 語だけ
    await confirmBox(page).fill(CONFIRM_WORD);
    await expect(button).toBeDisabled();

    // パスワードだけ
    await confirmBox(page).fill("");
    await passwordBox(page).fill(account.password);
    await expect(button).toBeDisabled();

    // 両方
    await confirmBox(page).fill(CONFIRM_WORD);
    await expect(button).toBeEnabled();
  });

  /**
   * **パスワードが違えば退会できない。** これが効いていないと、
   * ログインしたまま離席した端末を触った人がアカウントを消せる。
   */
  test("E-705 パスワードが違うと退会できない", async ({
    accountPage: page,
    account,
  }) => {
    await openWithdrawal(page);
    await confirmBox(page).fill(CONFIRM_WORD);
    await passwordBox(page).fill("WrongPassword2026!");
    await page.getByRole("button", { name: "退会する" }).click();

    // サーバーが返した理由がそのまま出る
    await expect(page.getByText("パスワードが違います。")).toBeVisible();
    // 画面から出ていない（消えたように見せない）
    await expect(page).toHaveURL(/\/settings/);
    // アカウントは残っている
    expect(await authUserExists(account.id)).toBe(true);
  });

  test("E-706 パスワードを変更でき、新しいパスワードでログインできる", async ({
    accountPage: page,
    account,
  }) => {
    const newPassword = "FerretChanged2026!";

    await page.goto("/settings");
    await page.getByLabel("いまのパスワード").fill(account.password);
    await page.getByLabel("あたらしいパスワード", { exact: true }).fill(newPassword);
    await page.getByLabel("あたらしいパスワード（確認）").fill(newPassword);
    await page.getByRole("button", { name: "変更する" }).click();

    await expect(page.getByText("パスワードを変更しました。")).toBeVisible();

    // 出直して、新しいパスワードで入れること
    await page.getByRole("button", { name: "ログアウト" }).click();
    await page.waitForURL("**/login");
    await submitLoginForm(page, { email: account.email, password: newPassword });
    await expect(page).toHaveURL(/\/stages/);
  });

  test("E-706b いまのパスワードが違えば変更できない", async ({
    accountPage: page,
  }) => {
    await page.goto("/settings");
    await page.getByLabel("いまのパスワード").fill("WrongPassword2026!");
    await page.getByLabel("あたらしいパスワード", { exact: true }).fill("FerretOther2026!");
    await page.getByLabel("あたらしいパスワード（確認）").fill("FerretOther2026!");
    await page.getByRole("button", { name: "変更する" }).click();

    await expect(page.getByText("いまのパスワードが違います。")).toBeVisible();
  });

  /**
   * 退会の通し。**公開ゲート2（`残タスク.md` §C-4）が求めているのはこれ。**
   * 利用規約 第12条・プライバシーポリシー 第7条が「回答・採点結果・進行状況を
   * 削除する」と約束しているので、消えたことを実際に確かめる。
   */
  test("E-707 退会するとログインできなくなり、回答も残らない", async ({
    accountPage: page,
    account,
  }) => {
    // 消える対象の回答を1件作る（実コンテンツの問題に相乗りする）
    await markCleared(account.id, await firstProblemId());
    expect(await countAllAttempts(account.id)).toBe(1);

    await openWithdrawal(page);
    await confirmBox(page).fill(CONFIRM_WORD);
    await passwordBox(page).fill(account.password);
    await page.getByRole("button", { name: "退会する" }).click();

    // タイトル画面へ戻る
    await expect(page.getByRole("heading", { name: "Ferret" })).toBeVisible();

    // ログイン情報・プロフィール行・回答がすべて消えている
    expect(await authUserExists(account.id)).toBe(false);
    expect(await profileRowExists(account.id)).toBe(false);
    expect(await countAllAttempts(account.id)).toBe(0);

    // そのアカウントではもう入れない
    await page.goto("/login");
    await submitLoginForm(page, { email: account.email, password: account.password });
    await expect(
      page.getByText("メールアドレスまたはパスワードが違います。"),
    ).toBeVisible();
  });
});
