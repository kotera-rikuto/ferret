/**
 * 採点 → リザルトの通し。
 * ケース定義は tests/e2e/テストケース.md の §4。
 *
 * OpenAI はスタブに差し替えているが、**サーバー側は本物が全部走る**。
 * リクエストの組み立て・再試行・スキーマ検証・引用照合・配点合成・
 * user_attempts への保存まで通ったうえで、画面に何が出るかを見る。
 */

import {
  test,
  expect,
  stub,
  deepOutput,
  markCleared,
  latestAttempt,
  countAttempts,
  ANSWER,
  EVIDENCE_REAL,
  EVIDENCE_FAKE,
} from "./support/fixtures";

/** 問題画面で回答して採点を待つ */
async function answer(page: import("@playwright/test").Page, problemId: number, text = ANSWER) {
  await page.goto(`/problems/${problemId}`);
  await page.getByPlaceholder("回答を入力してください...").fill(text);
  await page.getByRole("button", { name: "回答する" }).click();
}

test.describe("§4 採点結果の表示", () => {
  test("E-260 4観点すべて満たせば 100点・パーフェクト", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput(["full", "full", "full", "full"]));
    await answer(authedPage, problems[0].id);

    await expect(authedPage).toHaveURL(new RegExp(`/result/${problems[0].id}`));
    await expect(authedPage.getByText("100", { exact: true })).toBeVisible();
    await expect(authedPage.getByText("パーフェクト！")).toBeVisible();
  });

  test("E-261 中核だけ読めていれば短くてもクリアする", async ({
    authedPage,
    problems,
  }) => {
    // core=full + articulation=full = 52点。キーワードが2つ当たれば 62点
    await stub.setOutput(deepOutput(["full", "none", "none", "full"]));
    await answer(authedPage, problems[0].id, "const だから再代入でエラーになります");

    await expect(authedPage.getByText("クリア！")).toBeVisible();
  });

  test("E-262 中核を外していれば他が満点でも通らない", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput(["none", "full", "full", "full"]));
    await answer(authedPage, problems[0].id);

    await expect(authedPage.getByText("もう一度挑戦しよう")).toBeVisible();
    await expect(authedPage.getByText("52", { exact: true })).toBeVisible();
  });

  test("E-263/266 矛盾を検出しても、次に見る場所が文章で示される", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await stub.setOutput(
      deepOutput(["full", "none", "none", "none"], {
        contradiction: true,
        contradiction_evidence: EVIDENCE_REAL,
        praise: "処理の流れは追えています。",
        next_focus: "5行目の rate = 0.8 に注目してみてください。",
      }),
    );
    await answer(authedPage, problems[0].id);

    await expect(authedPage.getByText("もう一度挑戦しよう")).toBeVisible();

    // 残課題 §1 の修正が画面まで届いていること。
    // 以前は場所を示さない定型文しか出なかった
    await expect(authedPage.getByText("5行目の rate = 0.8")).toBeVisible();

    const row = await latestAttempt(userId, problems[0].id);
    expect(row?.contradiction).toBe(true);
  });

  test("E-267 引用の捏造は点数が抑えられ、AI の文章は使われない", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(
      deepOutput(["full", "full", "full", "none"], {
        evidence: EVIDENCE_FAKE,
        praise: "完璧に正しく理解しています。",
      }),
    );
    await answer(authedPage, problems[0].id);

    await expect(authedPage.getByText("もう一度挑戦しよう")).toBeVisible();
    await expect(authedPage.getByText("完璧に正しく理解しています")).toHaveCount(0);
  });

  test("E-264 内訳が表示される", async ({ authedPage, problems }) => {
    await stub.setOutput(deepOutput());
    await answer(authedPage, problems[0].id);

    await expect(authedPage.getByText(/キーワード \d+ \/ 20/)).toBeVisible();
    await expect(authedPage.getByText(/説明 \d+ \/ 80/)).toBeVisible();
  });

  test("E-268 画面の点数と DB の行が一致する", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await stub.setOutput(deepOutput(["full", "full", "partial", "none"]));
    await answer(authedPage, problems[0].id);
    await authedPage.waitForURL(new RegExp(`/result/${problems[0].id}`));

    const row = await latestAttempt(userId, problems[0].id);
    await expect(
      authedPage.getByText(String(row!.total_score), { exact: true }),
    ).toBeVisible();
  });

  test("E-269/270 クリア後にステージへ戻るとマップが更新される", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput());
    await answer(authedPage, problems[0].id);
    await authedPage.waitForURL(/\/result\//);

    await authedPage.getByRole("link", { name: "ステージに戻る" }).click();
    await expect(authedPage).toHaveURL(/\/stages/);
    await expect(authedPage.getByText("✅")).toHaveCount(1);
  });

  test("E-271 未回答のリザルトに直接来たら問題画面へ戻される", async ({
    authedPage,
    problems,
  }) => {
    await authedPage.goto(`/result/${problems[0].id}`);
    await expect(authedPage).toHaveURL(new RegExp(`/problems/${problems[0].id}`));
  });
});

test.describe("§4 リプレイ", () => {
  test("E-290/291 同じ回答を出し直しても点数が変わらない", async ({
    authedPage,
    problems,
    userId,
  }) => {
    // 1回目は 100点、2回目に呼ばれたら 52点を返すようにしておく。
    // リプレイが効いていれば2回目は呼ばれないので 100点のまま
    await stub.setOutput(deepOutput(["none", "full", "full", "full"]));
    await stub.enqueue([{ output: deepOutput(["full", "full", "full", "full"]) }]);

    await answer(authedPage, problems[0].id);
    await authedPage.waitForURL(/\/result\//);
    await expect(authedPage.getByText("100", { exact: true })).toBeVisible();

    await answer(authedPage, problems[0].id);
    await authedPage.waitForURL(/\/result\//);
    await expect(authedPage.getByText("100", { exact: true })).toBeVisible();

    // OpenAI は1回しか呼ばれていない
    const { calls } = await stub.inspect();
    expect(calls).toBe(1);

    // 回答ログとしては2行残る
    expect(await countAttempts(userId, problems[0].id)).toBe(2);
  });

  test("E-292 表記だけが違う再送もリプレイされる", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput());
    await answer(authedPage, problems[0].id, ANSWER);
    await authedPage.waitForURL(/\/result\//);

    await answer(authedPage, problems[0].id, `  ${ANSWER}  `);
    await authedPage.waitForURL(/\/result\//);

    const { calls } = await stub.inspect();
    expect(calls).toBe(1);
  });
});

test.describe("§4 エラー時の挙動", () => {
  test("E-310〜313 採点が落ちても入力が残り、直したら通る", async ({
    authedPage,
    problems,
    userId,
  }) => {
    // 2回とも失敗させる（scorer は1回だけ再試行する）
    await stub.enqueue([{ status: 500 }, { status: 500 }]);

    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);
    await page.getByPlaceholder("回答を入力してください...").fill(ANSWER);
    await page.getByRole("button", { name: "回答する" }).click();

    await expect(page.getByText(/採点が混み合っています/)).toBeVisible();
    // 画面は遷移しない
    await expect(page).toHaveURL(new RegExp(`/problems/${problems[0].id}`));
    // 入力はそのまま残っている
    await expect(page.getByPlaceholder("回答を入力してください...")).toHaveValue(ANSWER);
    // 失敗した採点は履歴に残さない
    expect(await countAttempts(userId, problems[0].id)).toBe(0);

    // スタブを正常に戻せば通る
    await stub.setOutput(deepOutput());
    await page.getByRole("button", { name: "回答する" }).click();
    await expect(page).toHaveURL(new RegExp(`/result/${problems[0].id}`));
  });

  test("E-314/315 PII を含む回答は理由が分かる形で止まる", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);
    await page
      .getByPlaceholder("回答を入力してください...")
      .fill(`${ANSWER} 連絡先は test@example.co.jp です`);
    await page.getByRole("button", { name: "回答する" }).click();

    await expect(
      page.getByText(/メールアドレスや認証キーらしき文字列が含まれています/),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/problems/${problems[0].id}`));

    // OpenAI には送られていない
    const { calls } = await stub.inspect();
    expect(calls).toBe(0);
  });
});

test.describe("§4 クリア判定の非対称性", () => {
  /**
   * 🟡 クリア判定は最高点、リザルト画面は最新の回答を読む。
   * したがって「マップは ✅ のままリザルトは『もう一度挑戦しよう』」が同時に成立する。
   * 進行が巻き戻らないのは意図した設計だが、画面としては分かりにくい。
   * まず現状を固定し、リザルトに自己ベストを併記するかは別途判断する。
   */
  test("E-330/331 復習で低い点を取ってもマップのクリアは維持される", async ({
    authedPage,
    problems,
    userId,
  }) => {
    await markCleared(userId, problems[0].id, 100);

    await stub.setOutput(deepOutput(["none", "none", "none", "none"]));
    await answer(authedPage, problems[0].id, "よく分かりませんでした、たぶんエラーです");
    await authedPage.waitForURL(/\/result\//);

    // リザルトは最新の回答なので不合格の表示
    await expect(authedPage.getByText("もう一度挑戦しよう")).toBeVisible();

    // マップは最高点なのでクリアのまま
    await authedPage.goto("/stages");
    await expect(authedPage.getByText("✅")).toHaveCount(1);

    // 次のステージも閉じない
    const res = await authedPage.goto(`/problems/${problems[1].id}`);
    expect(res?.status()).toBe(200);
  });
});
