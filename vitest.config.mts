import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 単体テストと結合テストの設定。E2E（Playwright）はここには含めない。
 *
 * alias を手で書いているのは、`vite-tsconfig-paths` を足さずに済ませるため。
 * `tsconfig.json` の paths は `"@/*": ["./*"]` の1件だけなので、
 * 依存を増やすより1行書くほうが安い。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // E2E は Playwright が実行する。Vitest に拾わせない
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    // テスト名に含めた ID（U-020 など）を検索しやすくする
    reporters: ["verbose"],
  },
});
