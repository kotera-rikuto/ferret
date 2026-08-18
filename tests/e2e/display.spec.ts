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
  statChip,
  ANSWER,
} from "./support/fixtures";
import { OPERATOR_NAME } from "../../lib/legal";

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
    // create-next-app の既定値（Create Next App）は解消済み（app/layout.tsx の metadata）
    await expect(page).toHaveTitle("Ferret");
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
    // 先行ステージのクリア（シードを解放するための下ごしらえ）は
    // problems フィクスチャがまとめて行うようになった

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

  test("E-272 読み違いのときは、点数より先に「次に見る場所」が出る", async ({
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

    // 残課題 §5 / タスク E6。読み違いを検出した回は、3枠すべてが 0 で並ぶ。
    // 点数は**隠さない**（見えないと「ごまかされた」と受け取られる）が、
    // 主役は「次に見る場所」に移す。ここで固定するのは順番と、点数が残っていること
    const memo = authedPage.getByText("フェレットのメモ");
    await expect(memo).toBeVisible();

    await expect(statChip(authedPage, "スコア")).toContainText("0 / 100");
    await expect(statChip(authedPage, "キーワード")).toContainText("0 / 20");
    await expect(statChip(authedPage, "AI 採点")).toContainText("0 / 80");

    // 文章が点数より上にあること。スマホ幅（mobile プロジェクト）でも同じ順番になる
    const memoBox = (await memo.boundingBox())!;
    const scoreBox = (await statChip(authedPage, "スコア").boundingBox())!;
    expect(memoBox.y).toBeLessThan(scoreBox.y);

    // 点数の文字が文章より大きくないこと（大きさで主役が逆転しないように）
    const fontSize = (locator: ReturnType<typeof statChip>) =>
      locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(await fontSize(statChip(authedPage, "スコア"))).toBeLessThanOrEqual(
      await fontSize(memo),
    );
  });
});

/**
 * 法務文書（C2）。
 *
 * 見るべきは体裁ではなく**読める場所に置かれているか**。
 * ログインを要求してしまう・導線が消えるという壊れ方は、
 * 画面そのものは正常に見えるので目視では気づけない。
 */
test.describe("§6 法務文書", () => {
  const documents = [
    ["/terms", "利用規約"],
    ["/privacy", "プライバシーポリシー"],
  ] as const;

  for (const [path, heading] of documents) {
    test(`E-457 未ログインで ${path} が読める`, async ({ page }) => {
      await page.goto(path);
      // ログイン画面へ飛ばされていないこと（proxy の matcher に入れると起きる）
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      // 運営者の表記は、文書として成立するための必須項目（lib/legal.ts）
      await expect(page.getByText(OPERATOR_NAME).first()).toBeVisible();
    });
  }

  test("E-458 タイトル画面とログイン画面から辿れる", async ({ page }) => {
    for (const from of ["/", "/login"]) {
      await page.goto(from);
      await page.getByRole("link", { name: "利用規約" }).click();
      await expect(page.getByRole("heading", { name: "利用規約" })).toBeVisible();

      await page.goto(from);
      await page.getByRole("link", { name: "プライバシーポリシー" }).click();
      await expect(
        page.getByRole("heading", { name: "プライバシーポリシー" }),
      ).toBeVisible();
    }
  });

  test("E-459 新規登録画面に同意の一文がある", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText("同意したものとみなします")).toBeVisible();
  });

  /**
   * 「回答は OpenAI に送信されます」の注記から、その根拠の文書へ辿れること。
   * 注記だけが浮いている状態（C2 の起点）に戻っていないかを見る。
   */
  test("E-460 問題画面の注記からプライバシーポリシーへ辿れる", async ({
    authedPage,
    problems,
  }) => {
    await authedPage.goto(`/problems/${problems[0].id}`);
    await expect(authedPage.getByText("OpenAI に送信されます")).toBeVisible();

    // 別タブで開く。書きかけの回答を差し替えないため（ProblemForm のコメント）
    const [opened] = await Promise.all([
      authedPage.waitForEvent("popup"),
      authedPage.getByRole("link", { name: "くわしく" }).click(),
    ]);
    await expect(
      opened.getByRole("heading", { name: "プライバシーポリシー" }),
    ).toBeVisible();
  });
});
