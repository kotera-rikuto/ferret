/**
 * 認証まわりのルートハンドラの結合テスト。
 * ケース定義は tests/integration/テストケース.md の §7〜§9。
 *
 * 対象: middleware.ts / GET /auth/callback / POST /logout
 *
 * 見るのは「どこへリダイレクトするか」と「その行き先を外から動かせないか」。
 * ログイン画面へ送る処理は、行き先を乗っ取られるとそのまま偽ログイン画面になる。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { silenceConsole } from "./helpers";

// ---------------------------------------------------------------------------
// モック
// ---------------------------------------------------------------------------

const { getUserMock, signOutMock, exchangeMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  signOutMock: vi.fn(),
  exchangeMock: vi.fn(),
}));

// middleware は @supabase/ssr を直接使う
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

// /auth/callback と /logout は lib/supabase/server を使う
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
      exchangeCodeForSession: exchangeMock,
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";

const { middleware, config } = await import("@/middleware");
const { GET: authCallback } = await import("@/app/auth/callback/route");
const { POST: logout } = await import("@/app/logout/route");

const LOGGED_IN = { data: { user: { id: "user-1" } } };
const LOGGED_OUT = { data: { user: null } };

/** テスト中だけ NEXT_PUBLIC_APP_URL を差し替える */
let savedAppUrl: string | undefined;

beforeEach(() => {
  vi.restoreAllMocks();
  getUserMock.mockReset();
  signOutMock.mockReset();
  exchangeMock.mockReset();
  signOutMock.mockResolvedValue({ error: null });
  exchangeMock.mockResolvedValue({ error: null });
  savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
});

function get(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { method: "GET", headers });
}

function locationOf(res: Response) {
  return new URL(res.headers.get("location")!);
}

// ---------------------------------------------------------------------------
// §7 middleware
// ---------------------------------------------------------------------------

describe("§7 middleware", () => {
  it.each([
    ["/stages", "/stages"],
    ["/problems/5", "/problems/5"],
    ["/result/5", "/result/5"],
    ["/review/5", "/review/5"],
  ])("I-300〜302 未ログインで %s はログイン画面へ送る", async (path, expected) => {
    getUserMock.mockResolvedValue(LOGGED_OUT);
    const res = await middleware(get(`http://localhost:3000${path}`));

    expect(res.status).toBe(307);
    const location = locationOf(res);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(expected);
  });

  it("I-303 ログイン済みならリダイレクトしない", async () => {
    getUserMock.mockResolvedValue(LOGGED_IN);
    const res = await middleware(get("http://localhost:3000/stages"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("I-305 matcher が認証の要る画面をすべて含む", () => {
    expect(config.matcher).toEqual([
      "/stages/:path*",
      "/problems/:path*",
      "/result/:path*",
      "/review/:path*",
    ]);
  });

  it("I-306 matcher が公開画面と API を含まない", () => {
    const joined = config.matcher.join(" ");
    expect(joined).not.toContain("/login");
    expect(joined).not.toContain("/register");
    expect(joined).not.toContain("/api");
  });

  /**
   * next はサーバー側で作った値だが、受け取る側と同じ関門を通してある。
   * パスに `//` が入ることは通常ないが、通しておけば
   * 「ログイン画面へ送る処理が外部サイトへの誘導になる」経路が構造的に消える。
   */
  it("I-307 next はパスのみで、クエリは引き継がない", async () => {
    getUserMock.mockResolvedValue(LOGGED_OUT);
    const res = await middleware(get("http://localhost:3000/problems/5?retry=1"));
    expect(locationOf(res).searchParams.get("next")).toBe("/problems/5");
  });

  it("I-309 リダイレクト先は Host ヘッダではなく設定した基点から作る", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ferret.example";
    getUserMock.mockResolvedValue(LOGGED_OUT);

    const res = await middleware(
      get("http://localhost:3000/stages", { host: "evil.example" }),
    );
    expect(locationOf(res).origin).toBe("https://ferret.example");
  });
});

// ---------------------------------------------------------------------------
// §8 GET /auth/callback
// ---------------------------------------------------------------------------

describe("§8 GET /auth/callback", () => {
  it("I-330 引き換えに成功したらステージ選択へ", async () => {
    const res = await authCallback(get("http://localhost:3000/auth/callback?code=abc"));
    expect(exchangeMock).toHaveBeenCalledWith("abc");
    expect(locationOf(res).pathname).toBe("/stages");
  });

  it("I-331 code が無ければログイン画面へ理由付きで戻す", async () => {
    silenceConsole();
    const res = await authCallback(get("http://localhost:3000/auth/callback"));
    const location = locationOf(res);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_callback");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("I-332 プロバイダがエラーを返したらログイン画面へ", async () => {
    silenceConsole();
    const res = await authCallback(
      get("http://localhost:3000/auth/callback?error=access_denied"),
    );
    expect(locationOf(res).searchParams.get("error")).toBe("auth_callback");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  /**
   * プロバイダから返ってきた文言をそのまま URL に載せると、
   * `?error=<好きな文章>` のリンクを配るだけで本物の画面に
   * 攻撃者の文章を表示させられる（「パスワードを再入力してください」など）。
   * 理由は固定の合言葉でしか渡さない。
   */
  it("I-333 プロバイダの文言を URL に載せない", async () => {
    silenceConsole();
    const injected = "セキュリティ確認のためパスワードを再入力してください";
    const res = await authCallback(
      get(
        `http://localhost:3000/auth/callback?error_description=${encodeURIComponent(injected)}`,
      ),
    );
    const location = locationOf(res);
    expect(location.searchParams.get("error")).toBe("auth_callback");
    expect(location.search).not.toContain("パスワード");
    expect(decodeURIComponent(location.href)).not.toContain(injected);
  });

  it("I-334 引き換えに失敗したら理由をログにだけ残す", async () => {
    const spies = silenceConsole();
    exchangeMock.mockResolvedValue({ error: { message: "code verifier mismatch" } });

    const res = await authCallback(get("http://localhost:3000/auth/callback?code=abc"));
    const location = locationOf(res);
    expect(location.pathname).toBe("/login");
    expect(location.href).not.toContain("verifier");
    expect(JSON.stringify(spies.error.mock.calls)).toContain("code verifier mismatch");
  });

  it("I-335 NEXT_PUBLIC_APP_URL が設定されていればそれを基点にする", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ferret.example";
    const res = await authCallback(get("http://localhost:3000/auth/callback?code=abc"));
    expect(locationOf(res).origin).toBe("https://ferret.example");
  });

  it("I-336 NEXT_PUBLIC_APP_URL が壊れていてもリクエスト側に落ちて動く", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "壊れた値";
    const res = await authCallback(get("http://localhost:3000/auth/callback?code=abc"));
    expect(locationOf(res).origin).toBe("http://localhost:3000");
  });
});

// ---------------------------------------------------------------------------
// §9 POST /logout
// ---------------------------------------------------------------------------

describe("§9 POST /logout", () => {
  function post(headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost:3000/logout", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", ...headers },
    });
  }

  it("I-350/351 ログイン済みならセッションを消して 303 でログイン画面へ", async () => {
    getUserMock.mockResolvedValue(LOGGED_IN);
    const res = await logout(post());

    expect(signOutMock).toHaveBeenCalledTimes(1);
    // 303 にしないとリダイレクト先へ POST のまま飛ぶ
    expect(res.status).toBe(303);
    expect(locationOf(res).pathname).toBe("/login");
  });

  it("I-352 別サイトからの POST は 403 で、signOut を呼ばない", async () => {
    getUserMock.mockResolvedValue(LOGGED_IN);
    const res = await logout(post({ "sec-fetch-site": "cross-site" }));

    expect(res.status).toBe(403);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("I-353 別サブドメインからの POST も 403", async () => {
    getUserMock.mockResolvedValue(LOGGED_IN);
    const res = await logout(post({ "sec-fetch-site": "same-site" }));
    expect(res.status).toBe(403);
  });

  it("I-354 未ログインでもエラーにせずログイン画面へ", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await logout(post());

    expect(res.status).toBe(303);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("I-355 signOut が失敗したら 500", async () => {
    silenceConsole();
    getUserMock.mockResolvedValue(LOGGED_IN);
    signOutMock.mockResolvedValue({ error: { message: "network down" } });

    const res = await logout(post());
    expect(res.status).toBe(500);
  });

  it("I-356 GET ハンドラを export していない（img タグでログアウトさせられない）", async () => {
    const mod = await import("@/app/logout/route");
    expect(mod).not.toHaveProperty("GET");
  });

  it("I-358 戻り先は Host ヘッダではなく設定した基点から作る", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ferret.example";
    getUserMock.mockResolvedValue(LOGGED_IN);

    const res = await logout(post({ host: "evil.example" }));
    expect(locationOf(res).origin).toBe("https://ferret.example");
  });
});
