import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // 並行作業用の git worktree はリポジトリの中（.claude/worktrees/）に作る。
    // 中身はこのリポジトリの別チェックアウトなので、除外しないと
    // **他タスクの作業途中のコードまで検査してしまう。**
    // 実際に他セッションのワークツリーから 1,727 errors / 21,381 warnings が出て、
    // `npm run lint` が自分の変更を見るのに使えなくなっていた（2026-08-19）。
    // 各ワークツリーは自分の中で lint を回すので、ここから見る必要はない。
    ".claude/worktrees/**",
  ]),
  {
    // Playwright のフィクスチャは `async ({}, use) => { await use(value) }` という形で書く。
    // React の useXxx とは無関係だが、名前が use なので rules-of-hooks が反応してしまう。
    // E2E のフィクスチャに限って外す
    files: ["tests/e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
]);

export default eslintConfig;
