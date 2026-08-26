/**
 * パスワード再設定の「メールのリンクから来た印」の検査（`lib/auth/recovery.ts`）。
 * ケース定義は tests/unit/テストケース.md の §21。
 *
 * **この印が唯一の関門。** `/reset-password` はログインの有無で通していない ──
 * `recovery` のリンクを開いた人はその時点でログイン状態になるので、
 * ログインで通すと「いまのパスワードを知らない人がパスワードを差し替えられる画面」に
 * なってしまう（`app/settings/PasswordForm.tsx` が塞いだ穴と同じもの）。
 *
 * したがってここで見るのは**印を偽造できないこと**と**期限が効くこと**の2点だけ。
 * どちらも破れても画面は普通に動くので、テストでしか気づけない。
 */

import { describe, it, expect } from "vitest";

// 署名の鍵は特権キーから導出する。import より前に置くこと
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key";

const { signRecoveryMark, verifyRecoveryMark, RECOVERY_WINDOW_SECONDS } =
  await import("@/lib/auth/recovery");

const NOW = 1_800_000_000_000; // 固定の時刻（Date.now() に依存させない）

describe("§21 メールのリンクから来た印", () => {
  it("U-900 発行した直後の印は通る", () => {
    expect(verifyRecoveryMark(signRecoveryMark(NOW), NOW)).toBe(true);
  });

  it("U-901 寿命のあいだは通り、過ぎたら通らない", () => {
    const mark = signRecoveryMark(NOW);
    const justInside = NOW + (RECOVERY_WINDOW_SECONDS - 1) * 1000;
    const justOutside = NOW + (RECOVERY_WINDOW_SECONDS + 1) * 1000;

    expect(verifyRecoveryMark(mark, justInside)).toBe(true);
    expect(verifyRecoveryMark(mark, justOutside)).toBe(false);
  });

  /**
   * **ここが本題。** 想定している相手は「ログイン中の端末を触れる人」で、
   * その人はブラウザの開発者ツールから Cookie を自分で書ける。
   * 素の値（`1` のような固定文字）だと1行打つだけで印が手に入り、
   * せってい画面が要求している「いまのパスワード」を回避できてしまう。
   */
  it("U-902 自分で作った値は通らない", () => {
    for (const forged of [
      "1",
      "true",
      "ferret",
      `${Math.floor(NOW / 1000) + 600}`,
      `${Math.floor(NOW / 1000) + 600}.`,
      `${Math.floor(NOW / 1000) + 600}.deadbeef`,
      // 署名の形（base64url・43文字）を真似た値
      `${Math.floor(NOW / 1000) + 600}.${"A".repeat(43)}`,
    ]) {
      expect(verifyRecoveryMark(forged, NOW), forged).toBe(false);
    }
  });

  /**
   * 期限だけ書き換えて延命できないこと。
   * 期限は署名の対象に入っているので、触ると署名が合わなくなる。
   */
  it("U-903 期限だけ書き換えた印は通らない", () => {
    const mark = signRecoveryMark(NOW);
    const [expires, signature] = mark.split(".");
    const extended = `${Number(expires) + 86_400}.${signature}`;

    // 素の状態なら通る印を、期限だけ伸ばすと通らなくなる
    expect(verifyRecoveryMark(mark, NOW)).toBe(true);
    expect(verifyRecoveryMark(extended, NOW)).toBe(false);
  });

  it("U-904 空・未設定・壊れた値は例外にせず false", () => {
    for (const value of [undefined, "", ".", "..", "abc.def", "NaN.x"]) {
      expect(verifyRecoveryMark(value, NOW)).toBe(false);
    }
  });

  it("U-905 印に個人を特定できる値を入れていない", () => {
    // 誰のものかはセッション側が持っている（updateUser はそのセッションの
    // ユーザーを変える）。Cookie に増やす情報は少ないほどよい
    const [expires, signature, ...rest] = signRecoveryMark(NOW).split(".");
    expect(rest).toEqual([]);
    expect(Number(expires)).toBe(Math.floor(NOW / 1000) + RECOVERY_WINDOW_SECONDS);
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  /**
   * 寿命は「画面が開いてから打ち終わるまで」の猶予。
   * リンク自体の有効期限（1時間・Supabase 側の設定）とは別物なので、
   * **こちらを1時間に合わせないこと**（合わせると、リンクを開いたまま
   * 離席した端末が触られる時間が6倍になる）。
   */
  it("U-906 寿命が短いままであること", () => {
    expect(RECOVERY_WINDOW_SECONDS).toBeGreaterThanOrEqual(60);
    expect(RECOVERY_WINDOW_SECONDS).toBeLessThanOrEqual(900);
  });
});
