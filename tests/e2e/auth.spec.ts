/**
 * 認証まわりの通し。
 * ケース定義は tests/e2e/テストケース.md の §1。
 *
 * 他のすべてのテストの前提になるので、ここが落ちたら先に直すこと。
 */

import {
  test,
  expect,
  login,
  submitLoginForm,
  TEST_USER,
} from "./support/fixtures";

/**
 * ログイン画面の見出しは「ログイン」ではない。
 *
 * デザイン移植（`943345a`）で「おかえりなさい」に変わり、「ログイン」は
 * 送信ボタンのラベルにだけ残っている。**画面が正しく、テストが古かった。**
 * 文言は1か所にまとめて、次に変わったときの直し先を1つにしておく。
 */
const LOGIN_HEADING = "おかえりなさい";
const REGISTER_HEADING = "はじめまして";

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
      await expect(page.getByRole("heading", { name: LOGIN_HEADING })).toBeVisible();
    });
  }

  test("E-103 ログイン後に元の場所へ戻る", async ({ page, problems }) => {
    await page.goto("/stages");
    await expect(page).toHaveURL(/\/login/);

    // ここで goto し直すと `next` が消えるので、開いている画面のまま送る
    await submitLoginForm(page);

    await expect(page).toHaveURL(/\/stages/);
    // ステージ選択画面には見出し（h1）が無い。右レールのウィジェットが
    // この画面まで到達した印になる（マップだけ見ると、問題0件でも通ってしまう）
    await expect(page.getByRole("heading", { name: "すすみぐあい" })).toBeVisible();
    expect(problems.length).toBeGreaterThan(0);
  });

  test("E-104 問題画面から弾かれてもログイン後にそこへ戻る", async ({
    page,
    problems,
  }) => {
    const first = problems[0];
    await page.goto(`/problems/${first.id}`);
    await expect(page).toHaveURL(/\/login/);

    await submitLoginForm(page);

    await expect(page).toHaveURL(new RegExp(`/problems/${first.id}`));
    // 戻った先が本当に問題画面であること。URL だけ見ると、
    // 未解放で 404 になっていても通ってしまう。
    // 問題画面のタイトルは見出し（h1〜h6）ではなく上部バーの文字なので、文字として引く
    await expect(page.getByText(first.title)).toBeVisible();
  });

  test("E-105 next が無ければステージ選択へ", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/stages/);
  });
});

test.describe("§1 ログインの失敗と案内", () => {
  test("E-106/107 パスワードを間違えたら理由が出て、入力は残る", async ({ page }) => {
    await page.goto("/login");
    await submitLoginForm(page, { password: "wrong-password-1234" });

    await expect(
      page.getByText("メールアドレスまたはパスワードが違います。"),
    ).toBeVisible();
    // 画面は遷移しない
    await expect(page).toHaveURL(/\/login/);
    // 入力したメールアドレスは消えない
    await expect(page.getByLabel("メールアドレス")).toHaveValue(TEST_USER.email);
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
    // ボタンの文言はデザイン移植で変わった（「新規登録」「ログイン」→ 下の2つ）。
    // 見たいのは**入口が2つあること**なので、行き先で確かめる
    await expect(page.getByRole("link", { name: "はじめる" })).toHaveAttribute(
      "href",
      "/register",
    );
    await expect(
      page.getByRole("link", { name: "アカウントをお持ちの方" }),
    ).toHaveAttribute("href", "/login");
  });

  test("E-115 ログインと新規登録を行き来できる", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "新規登録" }).click();
    await expect(page.getByRole("heading", { name: REGISTER_HEADING })).toBeVisible();

    await page.getByRole("link", { name: "ログイン" }).click();
    await expect(page.getByRole("heading", { name: LOGIN_HEADING })).toBeVisible();
  });

  /**
   * 🟡 いまは走らせない（オーナー判断・2026-08-17）。
   *
   * 実行するたびに**使い捨てのアカウントが Supabase に1つ増える**うえ、
   * Supabase 標準のメール送信は1時間あたり数通の制限があるため、
   * 続けて実行すると**実装が正しくても落ちる**（原因の分かりにくい落ち方になる）。
   *
   * **C1（メール送信を Resend に切り替える）が終わったら戻すこと。**
   * 戻すときは、作った使い捨てアカウントを後片付けで消す処理も足す。
   */
  test.skip("E-111 新規登録すると確認メールの案内が出る", async ({ page }) => {
    const fresh = `e2e-signup-${Date.now()}@ferret.test`;

    await page.goto("/register");
    await page.getByLabel("メールアドレス").fill(fresh);
    await page.getByLabel("パスワード").fill("FerretE2E2026!");
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(page.getByRole("heading", { name: "確認メールを送りました" })).toBeVisible();
    // どのアドレス宛に送ったかが分かること
    await expect(page.getByText(fresh)).toBeVisible();
  });

  /**
   * 🟡 **登録済みのアドレスでも「確認メールを送りました」になる**（2026-08-17 実測）。
   *
   * Supabase がアカウントの存在を隠すため、登録済みでも signUp が成功したように返る
   * （偽のユーザーを返し、メールは送らない）。したがって
   * `lib/auth/errors.ts` の `user_already_exists` の文面には**到達しない。**
   * アプリ側の実装が悪いのではなく、認証基盤の既定の振る舞い。
   *
   * `残タスク.md` §H は「アカウント列挙の防止は見送る（原因が分かる表示を優先）」と
   * 決めているので、**実際の挙動はその決定と逆になっている。**
   * どちらに寄せるかは Supabase の管理画面側の話なので **C4 の判断に残し**、
   * ここでは現状を固定するだけにする。
   */
  test("E-112 登録済みのメールで登録しても、アカウントの有無は伏せられる", async ({
    page,
    userId,
  }) => {
    void userId; // テストユーザーを作っておく

    await page.goto("/register");
    await page.getByLabel("メールアドレス").fill(TEST_USER.email);
    await page.getByLabel("パスワード").fill(TEST_USER.password);
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(
      page.getByRole("heading", { name: "確認メールを送りました" }),
    ).toBeVisible();
    // 「登録済み」と分かる文面は出ない
    await expect(
      page.getByText("このメールアドレスは登録済みです。ログイン画面からお進みください。"),
    ).toHaveCount(0);
  });

  test("E-113 短すぎるパスワードは必要な文字数が示される", async ({ page }) => {
    await page.goto("/register");
    // 弱いパスワードは Supabase に弾かれるので、アカウントは作られない
    await page.getByLabel("メールアドレス").fill(`e2e-weak-${Date.now()}@ferret.test`);
    await page.getByLabel("パスワード").fill("abc");
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(page.getByText(/パスワードをもう少し長くしてください（\d+文字以上）。/)).toBeVisible();
  });

  test("E-115b 新規登録画面からログイン画面へ戻れる", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "ログイン" }).click();
    await expect(page.getByRole("heading", { name: LOGIN_HEADING })).toBeVisible();
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
    // ログアウトボタンは2か所にある（左ナビと、狭い画面用の簡易ヘッダー）。
    // 個数を数えるとレイアウトを増やしただけで落ちるので、
    // **実際に押せるボタンが POST のフォームの中にあること**を見る
    const form = authedPage
      .getByRole("button", { name: "ログアウト" })
      .locator("xpath=ancestor::form[1]");
    await expect(form).toHaveAttribute("action", "/logout");
    await expect(form).toHaveAttribute("method", "post");
  });
});
