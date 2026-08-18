/**
 * POST /api/account/delete（退会）の結合テスト。
 * ケース定義は tests/integration/テストケース.md の §15。
 *
 * **取り消せない操作を特権キーで実行する唯一の API。** 見るべきものは3つ。
 *   1. 入口の守り（送信元・Content-Type・本文サイズ・認証）が他の POST と同じか
 *   2. **本人確認を通らずに削除へ進まないか** ── service_role は誰が呼んでいるかを
 *      見ないので、ここが抜けると「誰でも他人のアカウントを消せる API」になる
 *   3. 消す順番と、途中で失敗したときにその先へ進まないこと
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeClients,
  defaultState,
  USER_ID,
  silenceConsole,
  type DbState,
  type DbSpy,
} from "./helpers";
import { DELETE_CONFIRM_WORD, DELETE_TARGETS } from "@/lib/account";

const USER_EMAIL = "owner@ferret.test";
const PASSWORD = "FerretDev2026!";

const { getUserMock, verifyPasswordMock, holder } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  holder: { admin: null as unknown, session: null as unknown },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => holder.session }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => holder.admin }));
// 本物は認証基盤へログインを試みる。ここでは「確認が通ったか」だけを差し替える
vi.mock("@/lib/auth/reauth", () => ({ verifyPassword: verifyPasswordMock }));

const { POST } = await import("@/app/api/account/delete/route");

let state: DbState;
let spy: DbSpy;

function setup(patch: Partial<DbState> = {}) {
  state = defaultState(patch);
  const clients = makeClients(state, getUserMock as never);
  holder.admin = clients.admin;
  holder.session = clients.session;
  spy = clients.spy;
}

beforeEach(() => {
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({
    data: { user: { id: USER_ID, email: USER_EMAIL } },
  });
  verifyPasswordMock.mockReset();
  verifyPasswordMock.mockResolvedValue({ ok: true });
  setup();
});

function request(
  body: unknown,
  init: { headers?: Record<string, string>; raw?: string } = {},
) {
  return new NextRequest("http://localhost:3000/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...(init.headers ?? {}),
    },
    body: init.raw ?? JSON.stringify(body),
  });
}

async function post(body: unknown, init?: Parameters<typeof request>[1]) {
  const res = await POST(request(body, init));
  return { res, json: (await res.json()) as Record<string, unknown> };
}

const VALID = { confirm: DELETE_CONFIRM_WORD, password: PASSWORD };

/** 何ひとつ消えていないこと。**失敗の確認では必ずこれを見る** */
function nothingDeleted() {
  expect(spy.deleted).toHaveLength(0);
  expect(spy.authDeleted).toHaveLength(0);
}

// ---------------------------------------------------------------------------

describe("§15-1 リクエストの入口", () => {
  it("I-850 別サイトからの POST は 403", async () => {
    const { res } = await post(VALID, { headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(403);
    nothingDeleted();
  });

  it("I-851 別サブドメインからの POST も 403", async () => {
    const { res } = await post(VALID, { headers: { "sec-fetch-site": "same-site" } });
    expect(res.status).toBe(403);
    nothingDeleted();
  });

  it("I-852 Content-Type が JSON でなければ 415", async () => {
    const { res } = await post(VALID, { headers: { "content-type": "text/plain" } });
    expect(res.status).toBe(415);
    nothingDeleted();
  });

  it("I-853 Content-Length が上限（4KB）を超えたら 413", async () => {
    const { res } = await post(VALID, {
      headers: { "content-length": String(5 * 1024) },
    });
    expect(res.status).toBe(413);
    nothingDeleted();
  });

  it("I-854 Content-Length が無くても実サイズが上限を超えたら 413", async () => {
    const huge = JSON.stringify({ ...VALID, password: "あ".repeat(5000) });
    const { res } = await post(null, { raw: huge });
    expect(res.status).toBe(413);
    nothingDeleted();
  });

  it("I-855 本文が JSON として壊れていたら 400", async () => {
    const { res } = await post(null, { raw: "{壊れている" });
    expect(res.status).toBe(400);
    nothingDeleted();
  });

  it("I-856 未ログインなら 401。本人確認まで進まない", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { res } = await post(VALID);
    expect(res.status).toBe(401);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    nothingDeleted();
  });
});

describe("§15-2 本人確認", () => {
  it("I-857 確認の語が違えば 400。削除は起きない", async () => {
    const { res, json } = await post({ ...VALID, confirm: "けす" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("confirm_mismatch");
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    nothingDeleted();
  });

  it("I-858 確認の語は前後の空白と全角/半角の違いを吸収する", async () => {
    const { res } = await post({ ...VALID, confirm: `　${DELETE_CONFIRM_WORD} ` });
    expect(res.status).toBe(200);
  });

  it("I-859 パスワードが空なら 400。削除は起きない", async () => {
    const { res, json } = await post({ ...VALID, password: "" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("password_required");
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    nothingDeleted();
  });

  it("I-860 パスワードが違えば 401。削除は起きない", async () => {
    verifyPasswordMock.mockResolvedValue({ ok: false, reason: "invalid" });
    const { res, json } = await post(VALID);
    expect(res.status).toBe(401);
    expect(json.code).toBe("password_mismatch");
    nothingDeleted();
  });

  it("I-861 確認そのものができなければ 503。アカウントは残る", async () => {
    verifyPasswordMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { res, json } = await post(VALID);
    expect(res.status).toBe(503);
    expect(json.code).toBe("reauth_unavailable");
    // 「いま確認ができなかった」と「消えていない」の両方が伝わること
    expect(String(json.error)).toContain("アカウントはそのまま");
    nothingDeleted();
  });

  it("I-862 パスワードで確認できないアカウントは 400 で止める", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email: null } } });
    const { res, json } = await post(VALID);
    expect(res.status).toBe(400);
    expect(json.code).toBe("password_unsupported");
    nothingDeleted();
  });

  /**
   * 本人確認に渡すのは**セッションから読んだ値**。
   * リクエスト本文のメールアドレスや user_id を見ると、
   * 他人のアカウントを指定した削除が通り得る。
   */
  it("I-863 確認はセッションのメールアドレスと user_id で行う", async () => {
    await post({ ...VALID, email: "someone-else@example.com", user_id: "other" });
    expect(verifyPasswordMock).toHaveBeenCalledWith(USER_EMAIL, PASSWORD, USER_ID);
  });
});

describe("§15-3 削除", () => {
  it("I-864 子 → 親 の順に消し、最後にアカウント本体を消す", async () => {
    const { res } = await post(VALID);
    expect(res.status).toBe(200);

    // 消す順番は lib/account.ts の DELETE_TARGETS が正。
    // 実装側でループを書き換えて順番が入れ替わればここで落ちる
    expect(spy.deleted.map(([table]) => table)).toEqual(
      DELETE_TARGETS.map((t) => t.table),
    );
    // アカウント本体は必ず最後（先に消すと、残りを消す手がかりが無くなる）
    expect(spy.authDeleted).toEqual([USER_ID]);
  });

  it("I-865 どのテーブルも自分の user_id だけを対象にする", async () => {
    await post(VALID);
    for (const [table, column, value] of spy.deleted) {
      const target = DELETE_TARGETS.find((t) => t.table === table);
      expect(column, `${table} の絞り込み列`).toBe(target?.column);
      expect(value, `${table} の絞り込み値`).toBe(USER_ID);
    }
  });

  it("I-866 途中で失敗したらその先へ進まず 500。アカウントは消さない", async () => {
    const console = silenceConsole();
    // 2番目（回答ログ）で失敗させる
    setup({ deleteErrors: { user_attempts: { message: "boom" } } });

    const { res, json } = await post(VALID);
    expect(res.status).toBe(500);
    expect(json.code).toBe("delete_failed");

    // 失敗したところで止まっている（3番目以降へ進んでいない）
    expect(spy.deleted.map(([table]) => table)).toEqual([
      "problem_feedback",
      "user_attempts",
    ]);
    // **ログインできる状態のまま残す。** 中途半端に消してログインだけ消すと、
    // 本人にも運営にも何が残っているのか分からなくなる
    expect(spy.authDeleted).toHaveLength(0);
    // 残っていることが画面に伝わること
    expect(String(json.error)).toContain("そのまま残っています");
    expect(console.error).toHaveBeenCalled();
  });

  it("I-867 アカウント本体の削除に失敗したら 500", async () => {
    const console = silenceConsole();
    setup({ authDeleteError: { message: "boom" } });

    const { res, json } = await post(VALID);
    expect(res.status).toBe(500);
    expect(json.code).toBe("auth_delete_failed");
    expect(console.error).toHaveBeenCalled();
  });

  it("I-868 成功したらセッションを手元から落とす", async () => {
    const { res } = await post(VALID);
    expect(res.status).toBe(200);
    // scope: "local" ── アカウントがもう無いので、認証基盤への問い合わせはしない
    expect(spy.signOuts).toEqual([{ scope: "local" }]);
  });

  it("I-869 成功したら ok を返す", async () => {
    const { res, json } = await post(VALID);
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });
});
