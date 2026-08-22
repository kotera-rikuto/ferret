/**
 * テスト用アカウントのパスワードを**特権キーから導出する**（2026-08-22・C5）。
 *
 * それまでは各テストファイルに平文で書いてあった。リポジトリが Public なので、
 * デプロイすると「パスワードが世界に公開されたアカウントが本番に存在する」状態になる。
 *
 * **保存する代わりに導出する。** リポジトリにも `.env.local` にも置かないので、
 * ズレようがなく、変更を忘れることもない
 *（XP をカウンタに持たず `user_attempts` から導くのと同じ考え）。
 *
 *   - 特権キーを持っている人は**元から何でもできる**ので、ここから新しく漏れるものは無い
 *   - **乱数にしない。** プロセスが分かれると値が変わり、アカウントを作り直す処理を
 *     通らない側がログインできなくなる（Playwright は chromium / mobile で分かれうる）
 *   - **呼ぶまで評価しない。** `tests/integration/database.test.ts` は
 *     `RUN_DB_TESTS=1` のときだけ `.env.local` を読むので、
 *     読み込み時に評価すると通常の `npm test` が特権キー無しで落ちる
 */
import { createHash } from "node:crypto";

export function derivedPassword(label: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が未設定です。.env.local を確認してください（.env.local.example 参照）",
    );
  }
  const digest = createHash("sha256").update(`${key}:${label}`).digest("base64url");
  // 記号と数字を足して、パスワード要件（8文字以上）を確実に満たす
  return `Ferret-${digest.slice(0, 24)}!1`;
}
