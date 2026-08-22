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
import type { Page } from "@playwright/test";
import { SITE_TITLE } from "../../lib/seo/site";
import { OPERATOR_DISCLOSURE, OPERATOR_NAME } from "../../lib/legal";

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
    // create-next-app の既定値（Create Next App）は解消済み（app/layout.tsx の metadata）。
    // 定数を照合しているのは、これが**検索結果の見出しそのもの**だから
    // （C8。文言は lib/seo/site.ts に1本化してある）
    await expect(page).toHaveTitle(SITE_TITLE);
  });

  test("E-450b ログイン画面のタイトルは重ならない", async ({ page }) => {
    await page.goto("/login");
    // layout.tsx の title.template が「| Ferret」を付ける。
    // 画面側にも書くと「ログイン | Ferret | Ferret」になる（C8・U-841 と対）
    await expect(page).toHaveTitle("ログイン | Ferret");
  });

  test("E-451 コードはダークテーマで表示される", async ({ authedPage, problems }) => {
    await authedPage.goto(`/problems/${problems[0].id}`);
    // 背景を持っているのはパネルの枠。
    // Shiki 化で <pre> の親が入れ物の div に変わったので、
    // 親をたどらず枠そのものを掴む（入れ物は背景を持たないため、
    // 親をたどる書き方だと「透明＝暗い」で素通りしてしまう）
    const block = authedPage.locator("[data-code-panel]").first();
    const bg = await block.evaluate((el) => getComputedStyle(el).backgroundColor);
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
    await expect(authedPage.getByText("ヒント")).toHaveCount(0);

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
    await authedPage.getByText("ヒント").click();
    await expect(body).toBeVisible();
  });

  /**
   * ハイドレーションのずれ（サーバーが返した HTML と、ブラウザが組んだ結果の食い違い）。
   *
   * **起きても画面は正常に見える。** React が黙ってブラウザ側で組み立て直すので、
   * 見た目は合ったまま、実際には二重に描き直されている。
   * ずれると `<head>` のテーマ初期化スクリプトも作り直され、
   * **暗い配色の人に一瞬明るい画面が出る**（`components/theme/InlineScript.tsx`）。
   *
   * 2026-08-20 に開発中の画面で両方が出た。そのときは
   * **古いサーバーHTML × 新しいコード**という開発時だけの食い違いだったが、
   * 本物のずれと見分けが付かないので、ここで網を張る。
   */
  test("E-463 主要な画面でハイドレーションのずれが出ない", async ({
    authedPage,
    problems,
  }) => {
    const errors: string[] = [];
    const watch = (text: string) => {
      if (/Hydration failed|Encountered a script tag|didn't match/i.test(text)) {
        errors.push(text.slice(0, 200));
      }
    };
    authedPage.on("console", (msg) => {
      if (msg.type() === "error") watch(msg.text());
    });
    authedPage.on("pageerror", (err) => watch(String(err)));

    for (const path of ["/", "/login", "/register", "/stages", `/problems/${problems[0].id}`]) {
      await authedPage.goto(path);
      await authedPage.waitForLoadState("networkidle");
    }

    expect(errors, errors.join("\n")).toEqual([]);
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
      // 運営者の表記は、文書として成立するための必須項目（lib/legal.ts）。
      // **屋号はサービス名と同じ文字列**で画面のあちこちに出るため、
      // 表記そのものより「氏名・住所を請求で開示する」一文の有無を見る。
      // この一文が消えると、屋号だけが残って法32条の求める状態から外れる
      await expect(page.getByText(OPERATOR_NAME).first()).toBeVisible();
      await expect(page.getByText(OPERATOR_DISCLOSURE)).toBeVisible();
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

  /**
   * 同意はチェックで取る（2026-08-19 にみなし同意から変更）。
   *
   * **見るのは文面ではなくゲートのほう。** 文言だけを見ていると、
   * チェック欄を残したまま `disabled` を外す変更が素通りする。
   * 素通りしても画面は正常に見え、**同意していない人が登録できる**。
   */
  test("E-459 同意にチェックを入れるまで登録できない", async ({ page }) => {
    await page.goto("/register");
    const submit = page.getByRole("button", { name: "登録する" });
    const agree = page.getByLabel("利用規約とプライバシーポリシーに同意する");

    await expect(submit).toBeDisabled();
    await agree.check();
    await expect(submit).toBeEnabled();

    // 2つの文書へは、同意する前に読める
    await expect(page.getByRole("link", { name: "利用規約" })).toBeVisible();
    await expect(page.getByRole("link", { name: "プライバシーポリシー" })).toBeVisible();
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

/**
 * メモ欄（G2）。
 *
 * 確かめるのは3つだけで、**どれも壊れても画面は正常に見える。**
 *   - 残ること（端末に保存されている）
 *   - 回答の下書きと混ざらないこと（保存する名前が別）
 *   - **採点に送られないこと**（メモには考えの途中経過が入るので、送ると点が変わる）
 */
test.describe("§6 メモ欄", () => {
  /**
   * 確かめる内容は describe の上に書いてある。
   *   - 残ること（端末に保存されている）
   *   - 回答の下書きと混ざらないこと（保存する名前が別）
   *   - **採点に送られないこと**（メモには考えの途中経過が入るので、送ると点が変わる）
   *
   * 目印になる文字列を使うのは、問題のコードや設問にたまたま含まれる語だと
   * 「送られていない」を確かめたつもりで素通りするため。
   */
  const MEMO_LABEL = "メモ（採点には送りません）";
  const MEMO_TEXT = "目印QX7 ─ ここで total の値を追う";

  /**
   * メモ欄を開く。
   *
   * **横に並べられる幅（1200px 以上）では初めから開いている**ので、そのときは何もしない。
   * 狭い画面では折りたたまれており、開かないと入力できない（MemoPad.tsx の SIDE_BY_SIDE）。
   * 開閉ボタンが出ているかどうかで判断するので、**この関数は
   * 「広い画面では折りたたみボタンが出ない」ことの検査も兼ねている** ──
   * 両方で出るようになったら、広いほうでボタンを押して閉じてしまい、続く fill が落ちる。
   */
  async function openMemo(page: Page) {
    const toggle = page.getByRole("button", { name: /メモ/ });
    if (await toggle.isVisible()) await toggle.click();
  }

  test("E-461 メモは開き直しても残り、回答の下書きと混ざらない", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    await openMemo(page);
    await page.getByLabel(MEMO_LABEL).fill(MEMO_TEXT);
    await page.getByPlaceholder("回答を入力してください...").fill(ANSWER);

    await page.reload();

    // 保存する名前が同じだと、どちらかがもう一方を上書きしてここで入れ替わる
    await expect(page.getByLabel(MEMO_LABEL)).toHaveValue(MEMO_TEXT);
    await expect(page.getByPlaceholder("回答を入力してください...")).toHaveValue(
      ANSWER,
    );
  });

  test("E-462 メモは採点に送られず、採点した後も残る", async ({
    authedPage,
    problems,
  }) => {
    await stub.setOutput(deepOutput());
    const page = authedPage;
    await page.goto(`/problems/${problems[0].id}`);

    await openMemo(page);
    await page.getByLabel(MEMO_LABEL).fill(MEMO_TEXT);
    await page.getByPlaceholder("回答を入力してください...").fill(ANSWER);
    await page.getByRole("button", { name: "回答する" }).click();
    await page.waitForURL(/\/result\//);

    // 採点器へ渡った本文にメモが1文字も入っていないこと
    const { requests } = await stub.inspect();
    expect(JSON.stringify(requests)).not.toContain(MEMO_TEXT);

    // 採点後もメモは残る（オーナー判断 2026-08-19）。
    // 回答の下書きは役目を終えて消えるので、そこで対になっている
    await page.goto(`/problems/${problems[0].id}`);
    await expect(page.getByLabel(MEMO_LABEL)).toHaveValue(MEMO_TEXT);
    await expect(page.getByPlaceholder("回答を入力してください...")).toHaveValue("");
  });
});

/**
 * 狭い画面（E11）。**幅はテストの中で 375px に固定する** ──
 * このファイルは desktop と mobile の2つのプロジェクトで走るので、
 * プロジェクト任せにすると同じ検査が別の幅で2回走ることになる。
 *
 * ここで見るのは「パソコンにあるものが狭い画面にもあるか」と
 * 「貼り付けた帯どうしが重なっていないか」。**どれも壊れても画面は正常に見える。**
 */
test.describe("§6 狭い画面", () => {
  const NARROW = { width: 375, height: 667 };

  /** マップの入れ物（節を持つ div）。行の高さの CSS 変数がここに載っている */
  const MAP_ROOT = "main > div:has(section)";

  test("E-464 レベル・つづけた日数・すすみぐあいが画面の中に見えている", async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.setViewportSize(NARROW);
    await page.goto("/stages");
    // 起動時の現在地へのスクロールが終わってから測る。
    // **貼り付いていなければここで画面の外に出る**（マップは 25,000px ある）
    await page.waitForTimeout(800);

    const bar = page.locator("main > div.sticky").first();
    await expect(bar).toBeInViewport();

    const box = (await bar.boundingBox())!;
    expect(box.y, "帯が画面の上に貼り付いていない").toBeLessThan(4);

    // 3つの数字が帯の中にある。文字ではなく帯の中身で見る
    // （レベルも「すすみぐあい」も数字だけなので、文字列では引けない）
    await expect(bar.getByText("レベル")).toBeVisible();
    await expect(bar.locator("svg")).toHaveCount(2); // ほのお + チェック
    // つづけた日数は 0 日でも数字を出さない（0 を罰に見せない既存の扱い）
    const streakText = await bar.innerText();
    expect(streakText).toMatch(/日連続|きょう解くと/);
  });

  test("E-465 マップの行の高さは CSS だけで決まる（開いた直後に跳ねない）", async ({
    authedPage,
  }) => {
    const page = authedPage;

    // サーバーが返した HTML そのものを見る。位置が px で焼き込まれていたら、
    // 狭い画面では描いたあとに詰め直すことになり、全ノードが動く
    const html = await (await page.request.get("/stages")).text();
    expect(html, "節の高さが --row-h から計算されていない").toContain(
      "calc(var(--row-h)",
    );
    expect(html, "行の高さの宣言が HTML に出ていない").toContain("--row-h:224px");

    // 同じ HTML から、幅だけで別の行の高さが出ること
    for (const [width, expected] of [
      [375, "224px"],
      [1024, "180px"],
    ] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/stages");
      const rowH = await page
        .locator(MAP_ROOT)
        .evaluate((el) => getComputedStyle(el).getPropertyValue("--row-h").trim());
      expect(rowH, `幅 ${width} の行の高さ`).toBe(expected);
    }
  });

  test("E-466 章バナーが数字の帯の下に貼り付く（重ならない）", async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.setViewportSize(NARROW);
    await page.goto("/stages");
    await page.waitForTimeout(800);

    const bar = (await page.locator("main > div.sticky").first().boundingBox())!;
    const banner = (await page
      .locator("main div.sticky", { has: page.locator("svg") })
      .filter({ hasText: /第\d+章|とくべつ/ })
      .first()
      .boundingBox())!;

    expect(banner.y, "章バナーが数字の帯に重なっている").toBeGreaterThanOrEqual(
      bar.y + bar.height,
    );
  });

  test("E-467 メモ欄はコードを読む位置と回答を書く位置の両方から使える", async ({
    authedPage,
    problems,
  }) => {
    const page = authedPage;
    await page.setViewportSize(NARROW);
    await page.goto(`/problems/${problems[0].id}`);

    const header = (await page.locator("header").boundingBox())!;
    const memo = page.locator("div.order-first");
    const toggle = memo.getByRole("button");

    // 1. コードより上にある（読みながら書ける）
    const code = (await page.locator("[data-code-panel]").first().boundingBox())!;
    const memoBox = (await memo.boundingBox())!;
    expect(memoBox.y, "メモがコードより下にある").toBeLessThan(code.y);

    // 2. 開いた状態でも回答欄までスクロールしてもメモが画面に残る
    await toggle.click();
    await page.getByLabel(/^メモ/).fill("total は 0 から始まる");
    await page.getByPlaceholder("回答を入力してください...").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await expect(memo).toBeInViewport();
    await expect(page.getByLabel(/^メモ/)).toHaveValue("total は 0 から始まる");

    // 3. 貼り付く位置がヘッダーの真下（MemoPad.tsx の NARROW_STICKY_TOP）
    const stuck = (await memo.boundingBox())!;
    expect(
      Math.round(stuck.y),
      "メモの帯がヘッダーの高さと合っていない",
    ).toBe(Math.round(header.height));
  });

  /**
   * 最初の画面（`/`）。
   *
   * **もとは「マスコットと説明が横に並ぶこと」を見ていた。** E11 の時点では
   * ロゴとボタン2つだけのタイトル画面で、狭い画面だと縦に積まれていたため。
   * **その画面は M2（2026-08-22）が LP に置き換えて存在しなくなった** ──
   * LP の主役にマスコットは居らず、キャラクターはデモのカードの中で設問の隣に立つ。
   *
   * そこで見る中身を差し替えてある。**LP は幅375px 以下で誰も測っていない画面**で、
   * ここが唯一の網になる（`E-453/454` と `E-453b` は問題・ステージ・リザルトだけ）。
   * マスコットの重なりは M2 側もコメントで気にしている箇所（絶対配置で覗かせると
   * 狭い画面で設問の文字に重なる）なので、位置関係もここで固定する。
   */
  test("E-468 LP（最初の画面）が狭い画面で崩れない", async ({ page }) => {
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 667 });
      await page.goto("/");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `幅 ${width} で横に溢れている`).toBeLessThanOrEqual(1);
    }

    // デモのカードの中で、マスコットが設問の文字に重なっていないこと。
    // 縦に積まれても（横に並ばなくても）落とさない ── 見たいのは重なりのほう
    await page.setViewportSize(NARROW);
    await page.goto("/");
    const mascot = page.locator("img[alt='フェレット']").first();
    const question = mascot.locator("xpath=following-sibling::p").first();
    const m = (await mascot.boundingBox())!;
    const q = (await question.boundingBox())!;
    const 重なり = Math.min(m.x + m.width, q.x + q.width) - Math.max(m.x, q.x);
    expect(重なり, "マスコットが設問の文字に重なっている").toBeLessThanOrEqual(0);
  });

  test("E-469 狭い画面から「ふりかえり」と「せってい」に辿れる", async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.setViewportSize(NARROW);
    await page.goto("/stages");

    await page.getByRole("link", { name: "ふりかえり" }).click();
    await page.waitForURL("**/review");
    await page.getByRole("link", { name: "せってい" }).click();
    await page.waitForURL("**/settings");
    await page.getByRole("link", { name: "ステージ" }).click();
    await page.waitForURL("**/stages");
  });
});
