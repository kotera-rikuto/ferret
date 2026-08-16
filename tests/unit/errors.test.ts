/**
 * lib/auth/errors.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §8。
 */

import { describe, it, expect } from "vitest";
import { authErrorMessage, OAUTH_ENABLED } from "@/lib/auth/errors";

const FALLBACK = "ログインできませんでした";

/**
 * lib/ai/scorer.ts の NG_WORDS の写し。
 *
 * scorer.ts が export していないため複製している。
 * NG語を増やしたらここも直すこと。
 * （scorer.ts 側で `export const NG_WORDS` にすれば重複は消える）
 */
const NG_WORDS = [
  "弱点", "間違い", "間違っ", "誤り", "誤っ", "初心者", "勉強", "学習",
  "失敗", "正しい読み方", "不正解", "ダメ", "レベル", "理解不足",
  "できていません", "苦手", "不足", "足りて", "不十分", "浅い", "誤解",
];

describe("§8 authErrorMessage", () => {
  it("U-380 code から資格情報エラーを判定する", () => {
    expect(authErrorMessage({ code: "invalid_credentials" }, FALLBACK)).toBe(
      "メールアドレスまたはパスワードが違います。",
    );
  });

  it("U-381 message からも判定する（大文字小文字を無視）", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" }, FALLBACK)).toBe(
      "メールアドレスまたはパスワードが違います。",
    );
  });

  it("U-382 メール未確認を案内する", () => {
    const m = authErrorMessage({ code: "email_not_confirmed" }, FALLBACK);
    expect(m).toContain("確認メール");
  });

  it("U-383 登録済みを案内する", () => {
    const m = authErrorMessage({ code: "user_already_exists" }, FALLBACK);
    expect(m).toContain("登録済み");
  });

  it("U-384 弱いパスワードに必要な文字数を示す", () => {
    const m = authErrorMessage({ code: "weak_password" }, FALLBACK);
    // 具体的な数字は Supabase 側の設定に合わせて変わりうるので、
    // 「何文字必要か」が書かれていることだけを固定する
    expect(m).toMatch(/\d+文字以上/);
  });

  it.each([
    ["pwned", "This password has been pwned"],
    ["compromised", "password is compromised"],
    ["data breach", "found in a data breach"],
  ])("U-384b 流出済みパスワード（%s）を責めない言い方で案内する", (_label, message) => {
    const m = authErrorMessage({ message }, FALLBACK);
    expect(m).toContain("流出");
    // 「あなたのパスワードが漏れている」と読める言い方にしない
    expect(m).not.toContain("あなた");
  });

  it("U-385 メール形式の誤りを案内する", () => {
    const m = authErrorMessage({ code: "validation_failed" }, FALLBACK);
    expect(m).toContain("形式");
  });

  it("U-386 送信レート超過を案内する", () => {
    const m = authErrorMessage({ code: "over_email_send_rate_limit" }, FALLBACK);
    expect(m).toContain("しばらく");
  });

  it("U-387 未設定のプロバイダを「準備中」と案内する", () => {
    const m = authErrorMessage({ code: "provider_disabled" }, FALLBACK);
    expect(m).toContain("準備中");
  });

  it("U-388 通信エラーを案内する", () => {
    const m = authErrorMessage({ status: 0 }, FALLBACK);
    expect(m).toContain("接続");
  });

  it("U-389 null なら fallback をそのまま返す", () => {
    expect(authErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  it("U-390 未知のエラーは原文を添える（開発中に追えなくならないため）", () => {
    expect(authErrorMessage({ message: "something odd" }, FALLBACK)).toBe(
      `${FALLBACK}（something odd）`,
    );
  });

  it("U-391 未知のエラーで message も無ければ fallback のみ", () => {
    expect(authErrorMessage({ code: "unknown_code" }, FALLBACK)).toBe(FALLBACK);
  });

  it("U-392 既知のエラー文が NG語を含まない", () => {
    const codes = [
      "invalid_credentials",
      "email_not_confirmed",
      "user_already_exists",
      "weak_password",
      "validation_failed",
      "over_email_send_rate_limit",
      "provider_disabled",
    ];
    for (const code of codes) {
      const message = authErrorMessage({ code }, FALLBACK);
      for (const ng of NG_WORDS) {
        expect(message, `${code} に NG語「${ng}」が含まれる`).not.toContain(ng);
      }
    }
  });

  it("U-393 OAUTH_ENABLED が google / github を真偽値で持つ", () => {
    expect(typeof OAUTH_ENABLED.google).toBe("boolean");
    expect(typeof OAUTH_ENABLED.github).toBe("boolean");
  });
});
