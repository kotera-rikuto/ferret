/**
 * 認証まわりの通し。
 * ケース定義は tests/e2e/テストケース.md の §1。
 *
 * 他のすべてのテストの前提になるので、ここが落ちたら先に直すこと。
 */

import { test, expect, login, TEST_USER } from "./support/fixtures";

test.describe("§1 認証ガードと next 復帰", () => {
  test.beforeEach(async ({ userId }) => {
    void userId; // テストユーザーの用意と履歴の初期化
  });

  const guarded = [
    ["/stages", "/stages"],
    ["/problems/5", "/problems/5"],
    ["/result/5", "/result/5"],
  ] as const;

  for (const [path, expected] of guarded) {
    test(`E-100〜102 未ログインで ${path} を開くとログイン画面へ送られる`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(expected).replace(/\//g, "%2F")}|/login\\?next=${expected}`));
      await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    });
  }

  test("E-103 ログイン後に元の場所へ戻る", async ({ page, problems }) => {
    await page.goto("/stages");
    await expect(page).toHaveURL(/\/login/);

    await page.getByPlaceholder("メールアドレス").fill(TEST_USER.email);
    await page.getByPlaceholder("パスワード").fill(TEST_USER.password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();

    await expect(page).toHaveURL(/\/stages/);
    await expect(page.getByRole("heading", { name: "ステージ選択" })).toBeVisible();
    expect(problems.length).toBeGreaterThan(0);
  });

  test("E-104 問題画面から弾かれてもログイン後にそこへ戻る", async ({
    page,
    problems,
  }) => {
    const first = problems[0];
    await page.goto(`/problems/${first.id}`);
    await expect(page).toHaveURL(/\/login/);

    await page.getByPlaceholder("メールアドレス").fill(TEST_USER.email);
    await page.getByPlaceholder("パスワード").fill(TEST_USER.password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/problems/${first.id}`));
  });

  test("E-105 next が無ければステージ選択へ", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/stages/);
  });
});

test.describe("§1 ログインの失敗と案内", () => {
  test("E-106/107 パスワードを間違えたら理由が出て、入力は残る", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("メールアドレス").fill(TEST_USER.email);
    await page.getByPlaceholder("パスワード").fill("wrong-password-1234");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();

    await expect(
      page.getByText("メールアドレスまたはパスワードが違います。"),
    ).toBeVisible();
    // 画面は遷移しない
    await expect(page).toHaveURL(/\/login/);
    // 入力したメールアドレスは消えない
    await expect(page.getByPlaceholder("メールアドレス")).toHaveValue(TEST_USER.email);
  });

  test("E-109/110 未設定の OAuth は押しても無反応にならない", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Googleでログイン/ }).click();
    await expect(
      page.getByText("この方法はまだ準備中です。メールアドレスでお進みください。"),
    ).toBeVisible();
  });

  test("E-114 タイトル画面は未ログインでも開ける", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ferret" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ログイン" })).toBeVisible();
    await expect(page.getByRole("link", { name: "新規登録" })).toBeVisible();
  });

  test("E-115 ログインと新規登録を行き来できる", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "新規登録" }).click();
    await expect(page.getByRole("heading", { name: "新規登録" })).toBeVisible();

    await page.getByRole("link", { name: "ログイン" }).click();
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  });

  test("E-111 新規登録すると確認メールの案内が出る", async ({ page }) => {
    // 実際にメールを送るので、毎回違うアドレスを使い捨てにする。
    // 送信自体は Supabase 側の設定に依存するため、ここでは画面の遷移だけを見る
    const fresh = `e2e-signup-${Date.now()}@ferret.test`;

    await page.goto("/register");
    await page.getByPlaceholder("メールアドレス").fill(fresh);
    await page.getByPlaceholder("パスワード").fill("FerretE2E2026!");
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(page.getByRole("heading", { name: "確認メールを送りました" })).toBeVisible();
    // どのアドレス宛に送ったかが分かること
    await expect(page.getByText(fresh)).toBeVisible();
  });

  test("E-112 登録済みのメールで登録しようとしたら理由が出る", async ({ page, userId }) => {
    void userId; // テストユーザーを作っておく

    await page.goto("/register");
    await page.getByPlaceholder("メールアドレス").fill(TEST_USER.email);
    await page.getByPlaceholder("パスワード").fill(TEST_USER.password);
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(
      page.getByText("このメールアドレスは登録済みです。ログイン画面からお進みください。"),
    ).toBeVisible();
    // 確認メールの画面へ進んでしまわないこと
    await expect(page.getByRole("heading", { name: "確認メールを送りました" })).toHaveCount(0);
  });

  test("E-113 短すぎるパスワードは必要な文字数が示される", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("メールアドレス").fill(`e2e-weak-${Date.now()}@ferret.test`);
    await page.getByPlaceholder("パスワード").fill("abc");
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(page.getByText(/パスワードをもう少し長くしてください（\d+文字以上）。/)).toBeVisible();
  });

  test("E-115b 新規登録画面からログイン画面へ戻れる", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "ログイン" }).click();
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  });
});

test.describe("§1 ログアウト", () => {
  test("E-130/131 ログアウトするとセッションが本当に消える", async ({
    authedPage,
    problems,
  }) => {
    void problems;
    await authedPage.getByRole("button", { name: "ログアウト" }).click();
    await expect(authedPage).toHaveURL(/\/login/);

    // 戻ろうとしても再びログイン画面へ
    await authedPage.goto("/stages");
    await expect(authedPage).toHaveURL(/\/login/);
  });

  test("E-133 ログアウトはフォーム送信で動く", async ({ authedPage, problems }) => {
    void problems;
    const form = authedPage.locator('form[action="/logout"][method="post"]');
    await expect(form).toHaveCount(1);
  });
});
