/**
 * lib/auth/reauth.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §14。
 *
 * 退会の本人確認。ここが「通った」と答えれば、その後の処理は
 * 特権キーでアカウントを消しにいく。**曖昧な失敗を ok にしないこと**が要点。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const EMAIL = "owner@ferret.test";
const PASSWORD = "FerretDev2026!";

const { signInMock, createClientSpy } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  createClientSpy: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: unknown) => {
    createClientSpy(url, key, options);
    return { auth: { signInWithPassword: signInMock } };
  },
}));

const { verifyPassword } = await import("@/lib/auth/reauth");

beforeEach(() => {
  signInMock.mockReset();
  createClientSpy.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

/** 認証が通ったときの応答 */
function ok(userId = USER_ID) {
  return { data: { user: { id: userId }, session: { access_token: "t" } }, error: null };
}

describe("§14 verifyPassword", () => {
  it("U-700 パスワードが通れば ok", async () => {
    signInMock.mockResolvedValue(ok());
    await expect(verifyPassword(EMAIL, PASSWORD, USER_ID)).resolves.toEqual({ ok: true });
    expect(signInMock).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
  });

  it("U-701 パスワードが違えば invalid", async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", status: 400 },
    });
    await expect(verifyPassword(EMAIL, "wrong", USER_ID)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it.each([400, 401])("U-702 %i は invalid として扱う", async (status) => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { status, message: "Bad Request" },
    });
    const result = await verifyPassword(EMAIL, PASSWORD, USER_ID);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  /**
   * 送信制限や通信不良を「パスワードが違う」にすると、
   * 正しいパスワードを入れた人が理由の分からない拒否を受ける。
   * 呼び出し側はこれを 503 にして「アカウントはそのまま」と伝える。
   */
  it.each([429, 500, 503])("U-703 %i は unavailable として扱う", async (status) => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { status, message: "Server Error" },
    });
    const result = await verifyPassword(EMAIL, PASSWORD, USER_ID);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("U-704 返ってきたユーザーが別人なら invalid", async () => {
    signInMock.mockResolvedValue(ok("22222222-2222-2222-2222-222222222222"));
    await expect(verifyPassword(EMAIL, PASSWORD, USER_ID)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("U-705 設定が無いときは確認できたことにしない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(verifyPassword(EMAIL, PASSWORD, USER_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    // 問い合わせ自体を試みない
    expect(signInMock).not.toHaveBeenCalled();
  });

  /**
   * 確認のためのログインでセッション Cookie を書き換えないこと。
   * 書き換わると、確認しただけで画面のログイン状態が差し替わる。
   */
  it("U-706 セッションを保存しないクライアントで確認する", async () => {
    signInMock.mockResolvedValue(ok());
    await verifyPassword(EMAIL, PASSWORD, USER_ID);

    const [, , options] = createClientSpy.mock.calls[0] as [
      string,
      string,
      { auth: { persistSession: boolean; autoRefreshToken: boolean } },
    ];
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
  });
});
