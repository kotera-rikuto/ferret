/**
 * 認証まわりのルートハンドラの結合テスト。
 * ケース定義は tests/integration/テストケース.md の §7〜§9。
 *
 * 対象: proxy.ts / GET /auth/callback / POST /logout
 *
 * 見るのは「どこへリダイレクトするか」と「その行き先を外から動かせないか」。
 * ログイン画面へ送る処理は、行き先を乗っ取られるとそのまま偽ログイン画面になる。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { silenceConsole } from "./helpers";
import {
  RECOVERY_COOKIE,
  RECOVERY_WINDOW_SECONDS,
  RESET_PASSWORD_PATH,
  verifyRecoveryMark,
} from "@/lib/auth/recovery";

// ---------------------------------------------------------------------------
// モック
// ---------------------------------------------------------------------------

const { getUserMock, signOutMock, exchangeMock, verifyOtpMock, ssr } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  signOutMock: vi.fn(),
  exchangeMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  // createServerClient に渡された設定を掴んでおく。
  // Cookie の書き戻し（cookies.setAll）をテスト側から起こすために要る
  ssr: { options: null as null | Record<string, never> },
}));

// proxy は @supabase/ssr を直接使う
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: Record<string, never>) => {
    ssr.options = options;
    return { auth: { getUser: getUserMock } };
  },
}));

/**
 * セッションが更新されたときの挙動を再現する。
 *
 * `@supabase/ssr` は期限切れのトークンを差し替えると `cookies.setAll` を呼び、
 * 新しい Cookie と一緒に「このレスポンスをキャッシュさせない」ヘッダを渡してくる。
 * 実物のライブラリを動かさずにこの経路へ入るには、こちらから呼んでやる必要がある。
 */
type CookieSink = {
  cookies: {
    setAll(
      cookies: { name: string; value: string; options?: unknown }[],
      headers: Record<string, string>,
    ): void;
  };
};

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

function refreshSession(cookies = [{ name: "sb-test-auth-token", value: "refreshed" }]) {
  const sink = ssr.options as unknown as CookieSink;
  sink.cookies.setAll(
    cookies.map((c) => ({ ...c, options: { path: "/", httpOnly: false } })),
    { "cache-control": NO_STORE },
  );
}

// /auth/callback と /logout は lib/supabase/server を使う
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
      exchangeCodeForSession: exchangeMock,
      verifyOtp: verifyOtpMock,
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
// パスワード再設定の印は特権キーから鍵を導出して署名する（`lib/auth/recovery.ts`）。
// `npm test` は .env.local を読まないので、ここで置いておく。
// `??=` にしてあるのは、実キーが入っている環境の値を踏まないため
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key";

const { proxy, config } = await import("@/proxy");
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
  verifyOtpMock.mockReset();
  signOutMock.mockResolvedValue({ error: null });
  exchangeMock.mockResolvedValue({ error: null });
  verifyOtpMock.mockResolvedValue({ error: null });
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
// §7 proxy
// ---------------------------------------------------------------------------

describe("§7 proxy", () => {
  it.each([
    ["/stages", "/stages"],
    ["/problems/5", "/problems/5"],
    ["/result/5", "/result/5"],
    ["/review/5", "/review/5"],
    ["/settings", "/settings"],
  ])("I-300〜302 未ログインで %s はログイン画面へ送る", async (path, expected) => {
    getUserMock.mockResolvedValue(LOGGED_OUT);
    const res = await proxy(get(`http://localhost:3000${path}`));

    expect(res.status).toBe(307);
    const location = locationOf(res);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(expected);
  });

  it("I-303 ログイン済みならリダイレクトしない", async () => {
    getUserMock.mockResolvedValue(LOGGED_IN);
    const res = await proxy(get("http://localhost:3000/stages"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("I-305 matcher が認証の要る画面をすべて含む", () => {
    expect(config.matcher).toEqual([
      "/stages/:path*",
      "/problems/:path*",
      "/result/:path*",
      "/review/:path*",
      // せってい（2026-08-19・C3）。退会とパスワード変更を置いた画面なので、
      // ログインしていない人を DB へのクエリが走る前に弾く
      "/settings/:path*",
    ]);
  });

  it("I-306 matcher が公開画面と API を含まない", () => {
    const joined = config.matcher.join(" ");
    expect(joined).not.toContain("/login");
    expect(joined).not.toContain("/register");
    expect(joined).not.toContain("/api");
  });

  /**
   * パスワード再設定の2画面（C9）は**ログイン不要のまま**にする。
   *
   * matcher に足すと1行で済んでしまうが、足した瞬間に
   * **パスワードを忘れた人だけが通れない経路**になる（ログインを求められるが、
   * ログインできないから来ている）。`/reset-password` を守っているのは
   * ログインの有無ではなく「メールを受け取れた印」（`lib/auth/recovery.ts`）。
   */
  it("I-311 matcher がパスワード再設定の画面を含まない", () => {
    const joined = config.matcher.join(" ");
    expect(joined).not.toContain("/forgot-password");
    expect(joined).not.toContain("/reset-password");
  });

  /**
   * 法務文書は**規約に同意する前の人**が読む文書なので、
   * ログインを要求した瞬間に文書としての役目を失う。
   * matcher に足すのは1行で済んでしまうため、ここで固定しておく。
   */
  it("I-310 matcher が法務文書の画面を含まない", () => {
    const joined = config.matcher.join(" ");
    expect(joined).not.toContain("/terms");
    expect(joined).not.toContain("/privacy");
  });

  /**
   * next はサーバー側で作った値だが、受け取る側と同じ関門を通してある。
   * パスに `//` が入ることは通常ないが、通しておけば
   * 「ログイン画面へ送る処理が外部サイトへの誘導になる」経路が構造的に消える。
   */
  it("I-307 next はパスのみで、クエリは引き継がない", async () => {
    getUserMock.mockResolvedValue(LOGGED_OUT);
    const res = await proxy(get("http://localhost:3000/problems/5?retry=1"));
    expect(locationOf(res).searchParams.get("next")).toBe("/problems/5");
  });

  it("I-304 セッションが更新されたら、その Cookie がレスポンスに載る", async () => {
    getUserMock.mockImplementation(async () => {
      refreshSession();
      return LOGGED_IN;
    });

    const res = await proxy(get("http://localhost:3000/stages"));
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  });

  /**
   * ライブラリが渡してくる「このレスポンスを絶対にキャッシュさせない」指示。
   * proxy.ts のコメントが「**これを捨てると、セッションが他人に配られる可能性がある**」
   * と書いている箇所。新しいログイン用 Cookie を発行しているレスポンスなので、
   * 途中のキャッシュに保存されると次に同じURLを開いた別の人へ Cookie ごと配られる。
   */
  it("I-308 キャッシュ禁止のヘッダを捨てない（通過時）", async () => {
    getUserMock.mockImplementation(async () => {
      refreshSession();
      return LOGGED_IN;
    });

    const res = await proxy(get("http://localhost:3000/stages"));
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("I-304b 期限切れで弾かれるときも、書き換えられた Cookie を引き継ぐ", async () => {
    // 無効になった Cookie を消す指示が来たのに捨てると、ブラウザに残り続ける
    getUserMock.mockImplementation(async () => {
      refreshSession([{ name: "sb-test-auth-token", value: "" }]);
      return LOGGED_OUT;
    });

    const res = await proxy(get("http://localhost:3000/stages"));
    expect(res.status).toBe(307);
    expect(res.cookies.get("sb-test-auth-token")).toBeDefined();
  });

  /**
   * リダイレクトのときも同じ指示を運ぶ（2026-08-17 に修正）。
   *
   * 以前は新しい `redirect` レスポンスへ **Cookie だけ**を移し替えていて、
   * `setAll` が渡してきたキャッシュ禁止のヘッダが落ちていた。
   * **Set-Cookie を持つのにキャッシュ禁止が付かないレスポンス**になるので、
   * 経路上のキャッシュに保存されると次の人へ Cookie ごと配られうる。
   * 通過時（I-308）だけ守られていて、弾くときに漏れていた。
   */
  it("I-308b リダイレクトでもキャッシュ禁止のヘッダを引き継ぐ", async () => {
    getUserMock.mockImplementation(async () => {
      refreshSession([{ name: "sb-test-auth-token", value: "" }]);
      return LOGGED_OUT;
    });

    const res = await proxy(get("http://localhost:3000/stages"));
    expect(res.cookies.get("sb-test-auth-token")).toBeDefined();
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("I-308c セッションの更新が無ければ余計なヘッダを足さない", async () => {
    getUserMock.mockResolvedValue(LOGGED_OUT);
    const res = await proxy(get("http://localhost:3000/stages"));
    expect(res.status).toBe(307);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("I-309 リダイレクト先は Host ヘッダではなく設定した基点から作る", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ferret.example";
    getUserMock.mockResolvedValue(LOGGED_OUT);

    const res = await proxy(
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

  it("I-331 code も token_hash も無ければログイン画面へ理由付きで戻す", async () => {
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

  /**
   * 🟡 現状を固定するテスト。
   *
   * `NEXT_PUBLIC_APP_URL` が未設定だと、戻り先は Host ヘッダから作られる。
   * つまり経路上でヘッダを差し替えられる構成では、認証直後に別サイトへ飛ばせる。
   * 対策は「本番で環境変数を必ず設定する」ことなので、コードではなく設定の問題。
   * リリース前チェックに入れておきたい。
   */
  it("I-337 【要設定】環境変数が無いと Host ヘッダで戻り先が決まる", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const res = await authCallback(
      new NextRequest("http://evil.example/auth/callback?code=abc", { method: "GET" }),
    );
    expect(locationOf(res).origin).toBe("http://evil.example");
  });

  it("I-336 NEXT_PUBLIC_APP_URL が壊れていてもリクエスト側に落ちて動く", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "壊れた値";
    const res = await authCallback(get("http://localhost:3000/auth/callback?code=abc"));
    expect(locationOf(res).origin).toBe("http://localhost:3000");
  });

  /**
   * メールのリンク（token_hash 方式）。**端末をまたいでも開ける経路。**
   *
   * `code` 方式は登録したブラウザに残る控え（code verifier の Cookie）が要るため、
   * パソコンで登録してスマホでメールを開くと必ず失敗する。
   * 確認メールの文面はこちらを使う形にしてある（supabase/templates/confirm-signup.html）。
   */
  it.each(["signup", "email"])(
    "I-339 token_hash + type=%s で確認し、成功したらステージ選択へ",
    async (type) => {
      const res = await authCallback(
        get(`http://localhost:3000/auth/callback?token_hash=hash-1&type=${type}`),
      );

      expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: "hash-1", type });
      // 控えを使う経路には入らない
      expect(exchangeMock).not.toHaveBeenCalled();
      expect(locationOf(res).pathname).toBe("/stages");
    },
  );

  /**
   * **リンクを開いた人はログイン状態になる。** これは種別によらず同じなので、
   * 確認後の行き先を決めていない種別（email_change = メールアドレス変更）は受け取らない。
   *
   * `recovery`（パスワード再設定）は **C9 で行き先を決めたのでこの一覧から外した** ──
   * 行き先は `/reset-password`、印は Cookie（I-345〜I-348）。
   * 種別を足すときは行き先も同時に決めること（ルート側のコメント）。
   */
  it.each(["email_change", "magiclink", "invite", "signup "])(
    "I-340 対象外の type（%s）は確認せずログイン画面へ",
    async (type) => {
      silenceConsole();
      const res = await authCallback(
        get(
          `http://localhost:3000/auth/callback?token_hash=hash-1&type=${encodeURIComponent(type)}`,
        ),
      );

      expect(verifyOtpMock).not.toHaveBeenCalled();
      expect(locationOf(res).searchParams.get("error")).toBe("auth_callback");
    },
  );

  it("I-341 type が無ければ確認せずログイン画面へ", async () => {
    silenceConsole();
    const res = await authCallback(
      get("http://localhost:3000/auth/callback?token_hash=hash-1"),
    );

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(locationOf(res).searchParams.get("error")).toBe("auth_callback");
  });

  /** 期限切れ・使用済みリンクはここに来る。理由を画面に出さないのは code 方式と同じ */
  it("I-342 確認に失敗したら理由をログにだけ残す", async () => {
    const spies = silenceConsole();
    verifyOtpMock.mockResolvedValue({ error: { message: "Token has expired" } });

    const res = await authCallback(
      get("http://localhost:3000/auth/callback?token_hash=hash-1&type=signup"),
    );
    const location = locationOf(res);
    expect(location.pathname).toBe("/login");
    expect(location.href).not.toContain("expired");
    expect(JSON.stringify(spies.error.mock.calls)).toContain("Token has expired");
  });

  /**
   * 攻撃者が書いた type をログに残さない。
   * ログを読む人の画面が、相手の文字列を表示する場所になるのを避ける
   */
  it("I-343 対象外の type の値そのものはログに残さない", async () => {
    const spies = silenceConsole();
    const injected = "パスワードを再入力してください";
    await authCallback(
      get(
        `http://localhost:3000/auth/callback?token_hash=hash-1&type=${encodeURIComponent(injected)}`,
      ),
    );
    expect(JSON.stringify(spies.error.mock.calls)).not.toContain(injected);
  });

  it("I-344 両方あれば既存の経路（code）を優先する", async () => {
    const res = await authCallback(
      get("http://localhost:3000/auth/callback?code=abc&token_hash=hash-1&type=signup"),
    );

    expect(exchangeMock).toHaveBeenCalledWith("abc");
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(locationOf(res).pathname).toBe("/stages");
  });

  /**
   * パスワード再設定のリンク（C9）。**確認メールと行き先が違う唯一の種別。**
   *
   * ここが /stages に流れていると、パスワードを決める画面を通らずに
   * ログイン状態だけが出来上がる ── 忘れた人は結局入れないまま、
   * 「リンクを踏んだら学習画面に入れた」という分かりにくい状態になる。
   */
  it("I-345 token_hash + type=recovery はパスワード再設定の画面へ送る", async () => {
    const res = await authCallback(
      get("http://localhost:3000/auth/callback?token_hash=hash-1&type=recovery"),
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      token_hash: "hash-1",
      type: "recovery",
    });
    expect(locationOf(res).pathname).toBe(RESET_PASSWORD_PATH);
  });

  /**
   * 「メールを受け取れた印」を持たせる（`lib/auth/recovery.ts`）。
   *
   * **これが無いと `/reset-password` は「ログインしていれば誰でもパスワードを
   * 差し替えられる画面」になる。** せってい画面（PasswordForm）が
   * いまのパスワードを尋ねて塞いでいる穴と同じものが、こちらに開く。
   *
   * 属性も一緒に見る。`httpOnly` が外れれば画面側の JavaScript から読めるようになり、
   * `path` が広がれば関係のないリクエストにも付いて回る。
   */
  it("I-346 recovery のときだけ、メールを受け取れた印を付ける", async () => {
    const res = await authCallback(
      get("http://localhost:3000/auth/callback?token_hash=hash-1&type=recovery"),
    );

    const cookie = res.cookies.get(RECOVERY_COOKIE);
    // **中身は署名済み。** 素の値（"1" のような固定文字）だと、
    // 開発者ツールから1行打つだけで印が手に入る
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.value).not.toBe("1");
    expect(verifyRecoveryMark(cookie?.value)).toBe(true);

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe(RESET_PASSWORD_PATH);
    // 寿命は「画面が開いてから打ち終わるまで」の猶予。無期限にしない
    expect(cookie?.maxAge).toBe(RECOVERY_WINDOW_SECONDS);
  });

  it.each(["signup", "email"])(
    "I-347 確認メール（type=%s）では印を付けない",
    async (type) => {
      const res = await authCallback(
        get(`http://localhost:3000/auth/callback?token_hash=hash-1&type=${type}`),
      );

      expect(res.cookies.get(RECOVERY_COOKIE)).toBeUndefined();
      expect(locationOf(res).pathname).toBe("/stages");
    },
  );

  /**
   * 期限切れ・使用済みのリンクで印を配らない。
   * 配ると、**確認に落ちた人がパスワードを差し替えられる画面へ入れてしまう。**
   */
  it("I-348 recovery の確認に失敗したら印を付けずログイン画面へ", async () => {
    silenceConsole();
    verifyOtpMock.mockResolvedValue({ error: { message: "Token has expired" } });

    const res = await authCallback(
      get("http://localhost:3000/auth/callback?token_hash=hash-1&type=recovery"),
    );

    expect(res.cookies.get(RECOVERY_COOKIE)).toBeUndefined();
    expect(locationOf(res).pathname).toBe("/login");
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
