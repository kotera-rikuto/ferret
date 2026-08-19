/**
 * ふりかえり画面（/review・/review/[id]）の通し。
 *
 * OpenAI はスタブに差し替えているが、**サーバー側は本物が全部走る。**
 * とくに引用照合（compose.ts の quoteVerified）は本物なので、
 * 「回答に存在しない引用を画面に出さない」は実際の格下げを経由して確かめられる。
 */

import {
  test,
  expect,
  stub,
  deepOutput,
  ANSWER,
  EVIDENCE_REAL,
  EVIDENCE_FAKE,
} from "./support/fixtures";

/** lib/ai/scorer.ts の NG_WORDS のうち、画面に出てはいけないもの（display.spec.ts と同じ並び） */
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

/** 問題画面で回答して採点を待つ */
async function answer(
  page: import("@playwright/test").Page,
  problemId: number,
  text = ANSWER,
) {
  await page.goto(`/problems/${problemId}`);
  await page.getByPlaceholder("回答を入力してください...").fill(text);
  await page.getByRole("button", { name: "回答する" }).click();
  await expect(page).toHaveURL(new RegExp(`/result/${problemId}`));
}

test.describe("§17 ふりかえり", () => {
  test("E-710 クリアした回のリザルトから内訳へ入れる", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput(["full", "full", "full", "full"]));
    await answer(authedPage, problems[0].id);

    await authedPage.getByRole("link", { name: "ふりかえる" }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/review/${problems[0].id}`));
    await expect(
      authedPage.getByRole("heading", { name: "ふりかえり" }),
    ).toBeVisible();
  });

  /**
   * **届かなかった回にも導線がある。**
   * どこまで読めていたか確かめたいのはむしろこちらの回で、
   * クリアしたときにだけ内訳が見られるのは順序が逆になる
   */
  test("E-711 届かなかった回のリザルトからも内訳へ入れる", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput(["none", "none", "none", "none"]));
    await answer(authedPage, problems[0].id);

    await expect(
      authedPage.getByRole("heading", { name: "もう一度挑戦しよう" }),
    ).toBeVisible();
    await authedPage.getByRole("link", { name: "ふりかえる" }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/review/${problems[0].id}`));
  });

  test("E-712 4観点の判定と、自分の回答・お手本が出る", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput(["full", "full", "none", "full"]));
    await answer(authedPage, problems[0].id);
    await authedPage.goto(`/review/${problems[0].id}`);

    for (const label of [
      "結論は合っている",
      "どこを見たか書けている",
      "もう一歩踏み込めている",
      "はっきり言い切れている",
    ]) {
      await expect(authedPage.getByText(label, { exact: true })).toBeVisible();
    }

    // 自分の回答と、問題データの模範解答（fixtures の SEED_PROBLEMS[0]）
    await expect(authedPage.getByText(ANSWER)).toBeVisible();
    await expect(authedPage.getByText("TypeError が発生して実行が止まります")).toBeVisible();

    // **引用が実際に出ていること。** これが無いと E-713（実在しない引用を出さない）が
    // 「引用を1つも出していない」状態でも通ってしまい、対で意味を成さなくなる。
    // 鉤括弧ごと引くのは、同じ文字列が「あなたの回答」の中にもあるため
    await expect(
      authedPage.getByText(`「${EVIDENCE_REAL}」`, { exact: true }).first(),
    ).toBeVisible();
  });

  /**
   * **この画面でいちばん壊れてはいけないところ。**
   *
   * 採点のとき照合を通しているのは `full` の引用だけで、照合に落ちた行には
   * 「回答に存在しない文字列」が保存されている。それを引用として出すと、
   * 本人が書いていない文章を本人の回答として見せることになる。
   * ここはスタブが捏造した引用を本物の照合に通させて確かめる
   */
  test("E-713 回答の中に無い引用は画面に出さない", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(
      deepOutput(["full", "full", "full", "full"], { evidence: EVIDENCE_FAKE }),
    );
    await answer(authedPage, problems[0].id);
    await authedPage.goto(`/review/${problems[0].id}`);

    await expect(authedPage.getByRole("heading", { name: "ふりかえり" })).toBeVisible();
    await expect(authedPage.getByText(EVIDENCE_FAKE)).toHaveCount(0);
  });

  test("E-714 左メニューの「ふりかえり」から一覧をたどって内訳へ着く", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput(["full", "full", "full", "full"]));
    await answer(authedPage, problems[0].id);

    await authedPage.goto("/stages");
    await authedPage.getByRole("link", { name: "ふりかえり" }).click();
    await expect(authedPage).toHaveURL(/\/review$/);

    await authedPage.getByRole("link", { name: new RegExp(problems[0].title) }).click();
    await expect(authedPage).toHaveURL(new RegExp(`/review/${problems[0].id}`));
  });

  /**
   * 模範解答を出す画面なので、**回答が無い状態では開かせない。**
   * 解放判定ではなく「自分の回答が残っているか」を関門にしている（I-872）
   */
  test("E-715 解いていない問題のふりかえりでは、お手本が出ない", async ({
    authedPage,
    problems,
  }) => {
    await authedPage.goto(`/review/${problems[0].id}`);

    await expect(authedPage).toHaveURL(new RegExp(`/problems/${problems[0].id}`));
    await expect(authedPage.getByText("お手本の読み方")).toHaveCount(0);
  });

  test("E-716 まだ何も解いていなければ、一覧は空のまま案内を出す", async ({
    authedPage,
  }) => {
    await authedPage.goto("/review");

    await expect(authedPage.getByText("といた問題がここに並びます。")).toBeVisible();
    await expect(authedPage.locator('a[href^="/review/"]')).toHaveCount(0);
  });

  /** UI だけでなく、内訳の言い回しにも同じ文言ルールがかかる */
  test("E-717 禁止されている言い方が画面に出ない", async ({ authedPage, problems }) => {
    await stub.setOutput(deepOutput(["none", "none", "none", "none"]));
    await answer(authedPage, problems[0].id);
    await authedPage.goto(`/review/${problems[0].id}`);

    const body = await authedPage.locator("body").innerText();
    for (const word of NG_WORDS) {
      expect(body, `画面に「${word}」が出ている`).not.toContain(word);
    }
  });
});
