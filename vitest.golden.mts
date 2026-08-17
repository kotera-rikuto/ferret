import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * ゴールデンセット専用の設定（`npm run golden`）。
 *
 * **通常のテスト設定（`vitest.config.mts`）と分けてあるのは実費のため。**
 * 1周で OpenAI に約90回リクエストする（約¥4・数分）。
 * `npm test` の include に入れると、テストを流すたびに課金と待ち時間が発生する。
 *
 * 逆向きの保険にもなっている: `vitest.config.mts` の include は
 * `tests/unit/**` と `tests/integration/**` だけなので、`tests/golden/` は
 * `npm test` や `npm run test:watch` では**収集されない。**
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/golden/**/*.test.ts"],
    reporters: ["verbose"],
    // 90回ぶんの採点を1つの beforeAll でまとめて回す。既定の10秒では足りない
    hookTimeout: 45 * 60_000,
    testTimeout: 60_000,
    // 実費が出るので、落ちても自動で再実行しない
    retry: 0,
    // 測定は1ファイルなので並列化の余地がない。実行結果の出力順を安定させる
    fileParallelism: false,
  },
});
