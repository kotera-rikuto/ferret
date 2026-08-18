/**
 * ステージ選択と問題画面。
 * ケース定義は tests/e2e/テストケース.md の §2・§3。
 *
 * §2 はデザイン移植（`943345a`）で前提が変わっている。
 *   - 絵文字（✅🐾🔒）→ SVG アイコン。**読み上げ用の名前が無いので文字では引けない**
 *   - 中央モーダル → ノードに付くポップオーバー。「キャンセル」ボタンは無くなり外側を押して閉じる
 * ノードの状態は support/fixtures.ts の `stageState`（押せるか・スタートの吹き出し）で読む。
 *
 * **ノードの個数は数えない。** シード問題を開くために手前の実問題を全部クリア済みに
 * するので、マップにはクリア済みのノードが実コンテンツの数だけ並ぶ（今後100問まで増える）。
 */

import { test, expect, markCleared, stageNode, stageState } from "./support/fixtures";

test.describe("§2 ステージ選択", () => {
  test("E-200/201 手前まで進んだ状態では次の1つだけが開いていて、鍵つきは押せない", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto("/stages");

    expect(await stageState(page, problems[0].order)).toBe("current");
    expect(await stageState(page, problems[1].order)).toBe("locked");

    // 鍵つきのノードを押してもポップオーバーが開かない
    await stageNode(page, problems[1].order)
      .locator("button")
      .first()
      .click({ force: true });
    await expect(page.getByRole("button", { name: "挑む" })).toHaveCount(0);
  });

  test("E-202 クリアすると次のステージが開く", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 100);
    await authedPage.goto("/stages");

    // 「1問目がクリア扱いになった」ことは、**2問目が現在地に移ったこと**で確かめる。
    // クリア済みの見た目そのものは消去法で求めているので、単体では弱い
    expect(await stageState(authedPage, problems[0].order)).toBe("cleared");
    expect(await stageState(authedPage, problems[1].order)).toBe("current");
  });

  test("E-203 54点ではクリアにならない（境界）", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 54);
    await authedPage.goto("/stages");

    expect(await stageState(authedPage, problems[0].order)).toBe("current");
    expect(await stageState(authedPage, problems[1].order)).toBe("locked");
  });

  test("E-203b 55点ちょうどでクリアになる（境界）", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 55);
    await authedPage.goto("/stages");

    expect(await stageState(authedPage, problems[0].order)).toBe("cleared");
    expect(await stageState(authedPage, problems[1].order)).toBe("current");
  });

  test("E-205/207 現在地を押すと確認が出て、問題画面へ進める", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto("/stages");

    const node = stageNode(page, problems[0].order);
    await node.locator("button").first().click();

    // ポップオーバー。中央モーダルの「このステージに挑みますか？」は無くなり、
    // ノードに付く吹き出しにタイトルと主ボタンが出る形になった
    await expect(node.getByRole("heading", { name: problems[0].title })).toBeVisible();

    await page.getByRole("button", { name: "挑む" }).click();
    await expect(page).toHaveURL(new RegExp(`/problems/${problems[0].id}`));
  });

  test("E-206 クリア済みは「もう一度読む」の文言になる", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 100);
    await authedPage.goto("/stages");

    await stageNode(authedPage, problems[0].order).locator("button").first().click();
    // クリア済みは主ボタンの色も文言も変わる（「挑む」は出ない）
    await expect(authedPage.getByRole("button", { name: "もう一度読む" })).toBeVisible();
    await expect(authedPage.getByRole("button", { name: "挑む" })).toHaveCount(0);
  });

  test("E-208 外側を押すと閉じる", async ({ authedPage, problems }) => {
    const page = authedPage;
    await page.goto("/stages");

    await stageNode(page, problems[0].order).locator("button").first().click();
    await expect(page.getByRole("button", { name: "挑む" })).toBeVisible();

    // 「キャンセル」ボタンは無くなった。ポップオーバーの外側を押すと閉じる作りなので、
    // 画面の隅を押す（外側判定は画面全体を覆う透明な層が受ける）
    await page.mouse.click(8, 200);
    await expect(page.getByRole("button", { name: "挑む" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/stages/);
  });

  test("E-210 各ノードにステージ番号とタイトルが出る", async ({
    authedPage,
    problems,
  }) => {
    await authedPage.goto("/stages");
    const node = stageNode(authedPage, problems[0].order);
    // ラベルは「Stage 1」ではなく「STAGE 1」（デザイン移植で大文字になった）
    await expect(node.getByText(`STAGE ${problems[0].order}`)).toBeVisible();
    await expect(node.getByText(problems[0].title)).toBeVisible();
  });
});

test.describe("§3 問題画面", () => {
  test("E-230/231/232 コード・設問・入力欄と外部送信の告知が出る", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    // 問題画面のタイトルは見出し（h1〜h6）ではなく上部バーの文字
    await expect(page.getByText(problems[0].title)).toBeVisible();
    await expect(page.locator("pre code")).toContainText("const rate = 0.9");
    await expect(page.getByText("このコードを実行すると何が起きますか。")).toBeVisible();

    // 仕様書 §9.5 の法務要件。常時表示であること
    await expect(
      page.getByText("回答は採点のため OpenAI に送信されます"),
    ).toBeVisible();
  });

  /**
   * コードの色分け（E5・Shiki）。
   *
   * 見るのは「色が2色以上あること」ではなく **キーワードと文字列が
   * 別々の色で出ていること**。前者だと、文法の読み込みに失敗して
   * 全部が地の文の色になった状態でも、コメント1行で通ってしまう。
   *
   * 色は増やす前に**サーバーで付け終わっている**必要があるので、
   * JavaScript を切った状態でも色が出ることまで見る。
   */
  test("E-241 コードに色が付く（サーバー側で色付け済み）", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    const colorOf = (word: string) =>
      page
        .locator("pre code span", { hasText: new RegExp(`^\\s*${word}\\s*$`) })
        .first()
        .evaluate((el) => getComputedStyle(el).color);

    // キーワード（const）と識別子（rate）が別の色になっている
    expect(await colorOf("const")).not.toBe(await colorOf("rate"));

    // 色付きのまま HTML が届いている（ブラウザ側で後から塗っていない）
    const html = await page.content();
    expect(html).toContain("shiki");
    // 行頭のインデントは色付きの span の中に入るので \s* で受ける
    expect(html).toMatch(/<span style="color:#[0-9a-fA-F]{6}">\s*const<\/span>/);
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
    await expect(authedPage.getByText(problems[1].title)).toBeVisible();
  });

  test("E-273 振り返り画面はまだ無い", async ({ authedPage, problems }) => {
    const res = await authedPage.goto(`/review/${problems[0].id}`);
    expect(res?.status()).toBe(404);
  });
});
