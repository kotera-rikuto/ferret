import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

/**
 * E2E の設定。ケース定義は tests/e2e/テストケース.md。
 *
 * 起動するサーバーは2つ。
 *   1. OpenAI のスタブ（tests/e2e/support/openai-stub.mjs）
 *   2. Next.js の開発サーバー。OPENAI_BASE_URL をスタブへ向けてある
 *
 * これで lib/ai/scorer.ts を1行も変えずに、採点の通し（リクエスト組み立て →
 * 再試行 → スキーマ検証 → user_attempts への保存 → 画面表示）を実APIなしで確かめられる。
 *
 * 実行前に必要なもの:
 *   - .env.local に Supabase の URL / anon キー / service_role キー
 *   - npx playwright install chromium（ブラウザの取得）
 *
 * 実API を使うケースは @live タグを付けてあり、既定では走らない。
 *   npm run test:e2e            通常（スタブ）
 *   npm run test:e2e:live       実API（課金あり）
 */

loadEnv({ path: ".env.local", quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3100);
const STUB_PORT = Number(process.env.OPENAI_STUB_PORT ?? 4010);
/**
 * ホスト名は `localhost` にする。`127.0.0.1` だと Next 16 の dev サーバーが
 * 「別オリジンからの dev リソース要求」として **自分の JS を配らない**
 * （allowedDevOrigins の既定に 127.0.0.1 が入っていない）。
 * JS が来ないとログイン画面が動かず、E2E が1件も通らなくなる。
 */
const BASE_URL = `http://localhost:${PORT}`;

/** @live を付けたテストだけ実APIに繋ぐ */
const useLive = process.env.E2E_LIVE === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  // support/ は部品置き場なのでテストとして拾わない
  testMatch: /.*\.spec\.ts$/,

  fullyParallel: false,
  // 同じユーザーの回答履歴を共有するので直列で回す。
  // 並列にすると「前のテストの回答が残っている」形で落ちる
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },

  // 既定では @live を除外する（実APIは1回 約¥0.04 かかる）
  grepInvert: useLive ? undefined : /@live/,

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // レイアウト崩れの確認だけなので、対象を絞る
      testMatch: /display\.spec\.ts/,
    },
  ],

  webServer: [
    {
      command: `node tests/e2e/support/openai-stub.mjs`,
      url: `http://127.0.0.1:${STUB_PORT}/__control`,
      reuseExistingServer: !process.env.CI,
      env: { OPENAI_STUB_PORT: String(STUB_PORT) },
      stdout: "ignore",
    },
    {
      command: `npx next dev --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // ここがスタブ差し替えの要。OpenAI SDK が既定の接続先として読む
        ...(useLive ? {} : { OPENAI_BASE_URL: `http://127.0.0.1:${STUB_PORT}/v1` }),
        // 実APIを使わないときはダミーで足りる。
        // 万一スタブへ向いていなければ、実APIを叩く前にここで落ちる
        OPENAI_API_KEY: useLive
          ? (process.env.OPENAI_API_KEY ?? "")
          : "sk-e2e-stub-key",
        NEXT_PUBLIC_APP_URL: BASE_URL,
        // D1 の1日上限を E2E では当てない。
        // 既定（1人1日20問）だと、採点を伴うテストが1回の実行で超えうる ──
        // 超えた回は「判定保留」になるので、落ちるのは上限のテストではなく
        // **採点・リザルト・ふりかえりの全部**になり、原因が分かりにくい。
        // 上限そのものの検証は単体（§19）と実DB（§13-6）でやっている
        AI_SCORING_DAILY_LIMIT: "100000",
        AI_SCORING_DAILY_LIMIT_GLOBAL: "100000",
      },
    },
  ],
});
