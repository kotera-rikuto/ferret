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
  createDisposableUser,
  recoveryTokenFor,
  removeUser,
  TEST_USER,
} from "./support/fixtures";
import { SHOW_OAUTH } from "../../lib/auth/errors";

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

  /**
   * Google / GitHub は Supabase 側の設定が済むまで**画面に出さない**
   * （オーナー判断 2026-08-22。それまでは「準備中」のチップ付きで置いてあり、
   * 押すと案内が出る形だった）。
   *
   * 見るのは**入口が無いこと**と、**メールアドレスの入口だけが残っていること。**
   * 区切りの「または」も一緒に消える（片方だけ残ると線が浮く）。
   *
   * 冒頭の1行は目覚まし。**`OAUTH_ENABLED` を true にした日にここで落ちる**ので、
   * そのときは「押すと案内が出る」形（`git log` にある元のテスト）へ戻すこと。
   */
  test("E-109/110 未設定のあいだ OAuth の入口を出さない", async ({ page }) => {
    expect(
      SHOW_OAUTH,
      "OAuth を有効にしたら、このテストを「押すと案内が出る」形に戻すこと",
    ).toBe(false);

    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /GitHub/ })).toHaveCount(0);
      await expect(page.getByText("または")).toHaveCount(0);
      // 唯一の入口は残っている
      await expect(page.getByLabel("メールアドレス")).toBeVisible();
    }
  });

  test("E-114 ルートの画面は未ログインでも開ける", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ferret" })).toBeVisible();
    // 見たいのは**入口が2つあること**なので、行き先で確かめる。
    //
    // **文言で引くのをやめ、行き先を数える形にした（2026-08-22・M2）。**
    // ここが LP になり、登録への入口が上部バー・主役・末尾の3か所に増えた。
    // 文言で1つに絞ると「同じ名前のリンクが複数ある」で落ちる ──
    // 画面が正しくてもテストが落ちる形。LP 自体の通しは tests/e2e/lp.spec.ts。
    expect(await page.locator('a[href="/register"]').count()).toBeGreaterThan(0);
    expect(await page.locator('a[href="/login"]').count()).toBeGreaterThan(0);
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
    await page.getByLabel("パスワード").fill(TEST_USER.password);
    // 2026-08-19 から、同意にチェックを入れるまで登録ボタンは押せない（E-459）
    await page.getByLabel("利用規約とプライバシーポリシーに同意する").check();
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
    // 2026-08-19 から、同意にチェックを入れるまで登録ボタンは押せない（E-459）
    await page.getByLabel("利用規約とプライバシーポリシーに同意する").check();
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
    // 2026-08-19 から、同意にチェックを入れるまで登録ボタンは押せない（E-459）
    await page.getByLabel("利用規約とプライバシーポリシーに同意する").check();
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

test.describe("§1 パスワードの再設定", () => {
  /**
   * 入口（C9）。**ここが無いと、パスワードを忘れた人はそこで終わる。**
   * 位置は入力欄のすぐ下 ── 「入らない」と気づくのはパスワードを打った直後なので、
   * カードの末尾に置くと目に入らない。
   */
  test("E-140 ログイン画面から再設定の画面へ行ける", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "パスワードをお忘れですか" }).click();

    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(
      page.getByRole("heading", { name: "パスワードの再設定" }),
    ).toBeVisible();
  });

  /**
   * **登録の有無を画面で分けない**（オーナー判断 2026-08-26・案A）。
   *
   * 分けると、メールアドレスを入れるだけで「そのアドレスが Ferret に登録されて
   * いるか」を誰でも調べられる。C7（新規登録の案内文・E-112）と同じ判断。
   *
   * 使うのは**毎回違う未登録のアドレス。** テストユーザーのアドレスを入れると
   * 実際に再設定メールが飛ぶ（送信の上限も消費する）。
   */
  test("E-141 未登録のアドレスでも「送りました」と出る", async ({ page }) => {
    const unknown = `e2e-forgot-${Date.now()}@ferret.test`;

    await page.goto("/forgot-password");
    await page.getByLabel("メールアドレス").fill(unknown);
    await page.getByRole("button", { name: "リンクを送る" }).click();

    await expect(page.getByRole("heading", { name: "メールを送りました" })).toBeVisible();
    // 「登録されていません」と分かる文面は出ない
    await expect(page.getByText(/登録されていません|見つかりません/)).toHaveCount(0);
  });

  /**
   * `/reset-password` を守っているのは**ログインの有無ではなく
   * 「メールを受け取れた印」**（`lib/auth/recovery.ts`）。
   *
   * 印が無いのに入力欄を出すと、**いまのパスワードを知らない人が
   * パスワードを差し替えられる画面**になる。せってい画面（E-450 台）が
   * いまのパスワードを尋ねて塞いでいる穴と同じもの。
   */
  test("E-142 リンクを通らずに開くと入力欄を出さない", async ({ page }) => {
    await page.goto("/reset-password");

    await expect(
      page.getByRole("heading", { name: "メールのリンクからお進みください" }),
    ).toBeVisible();
    await expect(page.getByLabel("あたらしいパスワード", { exact: true })).toHaveCount(0);
    // 次の一手（送り直す）への道がある
    await expect(page.getByRole("link", { name: "メールを送り直す" })).toBeVisible();
  });

  /**
   * **どちらもログイン不要。** proxy に足すと1行で済むが、足した瞬間に
   * 「パスワードを忘れた人だけが通れない経路」になる（I-311 と対になる確認）。
   */
  test("E-143 未ログインでも両方の画面が開ける", async ({ page }) => {
    for (const path of ["/forgot-password", "/reset-password"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));
    }
  });

  /**
   * **印を偽造できないこと（C9）。**
   *
   * 想定している相手は「ログイン中の端末を触れる人」で、その人は開発者ツールから
   * Cookie を自分で書ける。**印が素の値なら1行打つだけで手に入り**、
   * せってい画面が要求している「いまのパスワード」を回避できてしまう。
   * だから印は署名してある（`lib/auth/recovery.ts`）。
   *
   * Cookie の名前は原本（同ファイル）と1文字ずつ同じにしてある ──
   * E2E はアプリのコードを import しない約束なので、**原本を変えたらここも変えること**
   * （変え忘れても、印が通らない側に倒れるのでこのテストは落ちる）。
   */
  test("E-146 印を自分で作っても入力欄は出ない", async ({ page, baseURL }) => {
    for (const value of ["1", `${Math.floor(Date.now() / 1000) + 600}.AAAA`]) {
      await page.context().clearCookies();
      await page.context().addCookies([
        { name: "ferret-password-recovery", value, url: baseURL! },
      ]);

      await page.goto("/reset-password");
      await expect(
        page.getByRole("heading", { name: "メールのリンクからお進みください" }),
      ).toBeVisible();
      await expect(
        page.getByLabel("あたらしいパスワード", { exact: true }),
      ).toHaveCount(0);
    }
  });

  /**
   * **通し（C9 の本題）。** ここが通らないと、パスワードを忘れた人は戻れない。
   *
   * メールの受信だけ管理APIで代わりを立てている（`recoveryTokenFor`。
   * リンクに埋め込まれる値を送信せずに取り出す）。**リンクの形は
   * メールの文面と同じ**（`supabase/templates/reset-password.html`）にしてあるので、
   * 受け取り口（`app/auth/callback/route.ts`）の約束が崩れればここで落ちる。
   *
   * 使い捨てアカウントで回すのは、共有のテストユーザーでパスワードを
   * 変えてしまうと他のテストが入れなくなるため（E-706 と同じ理由）。
   */
  test("E-144 メールのリンクからパスワードを設定し直して、それでログインできる", async ({
    page,
  }) => {
    const account = await createDisposableUser("c9");
    const newPassword = "FerretRecovered2026!";

    try {
      const token = await recoveryTokenFor(account.email);

      await page.goto(`/auth/callback?token_hash=${token}&type=recovery`);
      await expect(page).toHaveURL(/\/reset-password/);

      await page.getByLabel("あたらしいパスワード", { exact: true }).fill(newPassword);
      await page.getByLabel("あたらしいパスワード（確認）").fill(newPassword);
      await page.getByRole("button", { name: "このパスワードにする" }).click();

      await expect(
        page.getByRole("heading", { name: "あたらしいパスワードを設定しました" }),
      ).toBeVisible();

      // 出直して、あたらしいパスワードで入れること。
      // ここまで通れば「忘れた状態からの復帰」が成立している
      await page.context().clearCookies();
      await page.goto("/login");
      await submitLoginForm(page, {
        email: account.email,
        password: newPassword,
      });
      await expect(page).toHaveURL(/\/stages/);
    } finally {
      await removeUser(account.id);
    }
  });

  /**
   * 一度使ったリンクは通らない（Supabase 側の性質。C9 の注意「1回限りの扱いを
   * 確認すること」）。**通ってしまうと、メールを覗かれた人が後からいつでも
   * パスワードを差し替えられる。**
   */
  test("E-145 一度使ったリンクは二度目は通らない", async ({ page }) => {
    const account = await createDisposableUser("c9-reuse");

    try {
      const token = await recoveryTokenFor(account.email);
      const link = `/auth/callback?token_hash=${token}&type=recovery`;

      await page.goto(link);
      await expect(page).toHaveURL(/\/reset-password/);

      // 同じリンクをもう一度。理由は画面に出さずログイン画面へ戻す約束（I-342）
      await page.context().clearCookies();
      await page.goto(link);
      await expect(page).toHaveURL(/\/login\?error=auth_callback/);
    } finally {
      await removeUser(account.id);
    }
  });
});
