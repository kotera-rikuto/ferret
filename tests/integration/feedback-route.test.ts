/**
 * POST /api/feedback の結合テスト。
 * ケース定義は tests/integration/テストケース.md の §14。
 *
 * 保存するだけの単純な API だが、**書き込みが起きる POST の入口**なので
 * /api/score と同じ守り（送信元・Content-Type・本文サイズ・認証）が要る。
 * エンドポイントごとに緩くすると、緩いほうが攻撃の入口になる。
 *
 * 溜めたデータはゴールデンセット（残課題 §8）の材料にする想定なので、
 * 「意地悪の連打」と「本当に採点がおかしい報告」を区別できることも見る。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  makeClients,
  defaultState,
  UNLOCKED_ID,
  USER_ID,
  type DbState,
  type DbSpy,
} from "./helpers";
import { COMMENT_MIN_CHARS, COMMENT_MAX_CHARS, FEEDBACK_KINDS } from "@/lib/feedback";

const { getUserMock, holder } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  holder: { admin: null as unknown, session: null as unknown },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => holder.session }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => holder.admin }));

const { POST } = await import("@/app/api/feedback/route");

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
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
  setup();
});

const ATTEMPT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const COMMENT = "採点が厳しすぎると感じました。根拠も書いたつもりです。";

function request(
  body: unknown,
  init: { headers?: Record<string, string>; raw?: string } = {},
) {
  return new NextRequest("http://localhost:3000/api/feedback", {
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

const VALID = {
  problem_id: UNLOCKED_ID,
  kind: "score_dispute",
  comment: COMMENT,
};

/** upsert された行 */
function saved() {
  return spy.upserted[0]?.[0];
}

// ---------------------------------------------------------------------------

describe("§14-1 リクエストの入口", () => {
  it("I-700 別サイトからの POST は 403", async () => {
    const { res } = await post(VALID, { headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(403);
    expect(spy.upserted).toHaveLength(0);
  });

  it("I-701 別サブドメインからの POST も 403", async () => {
    const { res } = await post(VALID, { headers: { "sec-fetch-site": "same-site" } });
    expect(res.status).toBe(403);
  });

  it("I-702 Content-Type が JSON でなければ 415", async () => {
    const { res } = await post(VALID, { headers: { "content-type": "text/plain" } });
    expect(res.status).toBe(415);
  });

  it("I-703 Content-Length が上限（4KB）を超えたら 413", async () => {
    const { res } = await post(VALID, { headers: { "content-length": String(5 * 1024) } });
    expect(res.status).toBe(413);
  });

  it("I-704 Content-Length が無くても実サイズが上限を超えたら 413", async () => {
    const huge = JSON.stringify({ ...VALID, comment: "あ".repeat(5000) });
    const { res } = await post(null, { raw: huge });
    expect(res.status).toBe(413);
  });

  it("I-705 本文が JSON として壊れていたら 400", async () => {
    const { res } = await post(null, { raw: "{壊れている" });
    expect(res.status).toBe(400);
  });

  it("I-706 いずれの場合も保存しない", async () => {
    await post(VALID, { headers: { "sec-fetch-site": "cross-site" } });
    await post(VALID, { headers: { "content-type": "text/plain" } });
    await post(null, { raw: "{壊れている" });
    expect(spy.upserted).toHaveLength(0);
  });
});

describe("§14-2 認証", () => {
  it("I-710 未ログインなら 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { res, json } = await post(VALID);
    expect(res.status).toBe(401);
    expect(json.error).toBe("ログインが必要です。");
    expect(spy.upserted).toHaveLength(0);
  });

  /**
   * /api/score とは検証の順序が逆で、こちらは**認証が本文検証より先**。
   * 未ログインで壊れた本文を送ると 400 ではなく 401 が返る。
   * 意図的かどうかは別として、現状を固定しておく。
   */
  it("I-711 未ログインなら本文が不正でも 401 が優先する", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { res } = await post({ problem_id: "abc", kind: "unknown", comment: "" });
    expect(res.status).toBe(401);
  });

  it("I-712 user_id は本文ではなくセッションの値を使う", async () => {
    await post({ ...VALID, user_id: "22222222-2222-2222-2222-222222222222" });
    expect(saved()?.user_id).toBe(USER_ID);
  });
});

describe("§14-3 入力検証", () => {
  it.each([
    ["配列", []],
    ["文字列", "score_dispute"],
    ["数値", 1],
    ["null", null],
  ])("I-720 本文がオブジェクトでない（%s）なら 400", async (_label, body) => {
    const { res } = await post(body);
    expect(res.status).toBe(400);
  });

  it.each([
    // undefined を渡すと JSON.stringify がキーごと落とすので「無し」になる
    ["無し", undefined],
    ["文字列", "abc"],
    ["0", 0],
    ["負の数", -1],
    ["小数", 1.5],
    ["null", null],
  ])("I-721 problem_id が不正（%s）なら 400", async (_label, problem_id) => {
    const { res } = await post({ ...VALID, problem_id });
    expect(res.status).toBe(400);
    expect(spy.upserted).toHaveLength(0);
  });

  it.each([
    ["未知の値", "spam"],
    ["空文字", ""],
    ["数値", 1],
    ["無し", undefined],
  ])("I-722 kind が不正（%s）なら 400", async (_label, kind) => {
    const { res } = await post({ ...VALID, kind });
    expect(res.status).toBe(400);
  });

  it.each([...FEEDBACK_KINDS])("I-723 kind が %s なら通る", async (kind) => {
    const { res } = await post({ ...VALID, kind });
    expect(res.status).toBe(200);
    expect(saved()?.kind).toBe(kind);
  });

  it("I-724 comment が文字列でなければ 400", async () => {
    const { res, json } = await post({ ...VALID, comment: 123 });
    expect(res.status).toBe(400);
    expect(json.error).toBe("理由を書いてください。");
  });

  /**
   * 理由の記入を必須にしているのは、ボタン1つで送れると
   * 「意地悪の連打」と「本当に採点がおかしい報告」を区別できないため。
   * 書く手間そのものが本気度のフィルタになっている。
   */
  it("I-725 理由が短すぎたら 400（必要な文字数を伝える）", async () => {
    const { res, json } = await post({ ...VALID, comment: "あ".repeat(COMMENT_MIN_CHARS - 1) });
    expect(res.status).toBe(400);
    expect(json.error).toContain(String(COMMENT_MIN_CHARS));
    expect(spy.upserted).toHaveLength(0);
  });

  it("I-726 下限ちょうどは通る（境界）", async () => {
    const { res } = await post({ ...VALID, comment: "あ".repeat(COMMENT_MIN_CHARS) });
    expect(res.status).toBe(200);
  });

  it("I-727 上限を超えたら 400", async () => {
    const { res, json } = await post({ ...VALID, comment: "あ".repeat(COMMENT_MAX_CHARS + 1) });
    expect(res.status).toBe(400);
    expect(json.error).toContain(String(COMMENT_MAX_CHARS));
  });

  it("I-728 上限ちょうどは通る（境界）", async () => {
    const { res } = await post({ ...VALID, comment: "あ".repeat(COMMENT_MAX_CHARS) });
    expect(res.status).toBe(200);
  });

  it("I-729 上限は DB 制約（char_length <= 500）と揃っている", () => {
    expect(COMMENT_MAX_CHARS).toBe(500);
  });
});

describe("§14-4 コメントの掃除", () => {
  it("I-740 制御文字を除去する", async () => {
    await post({ ...VALID, comment: `採点が厳し\u0000すぎると感じ\u007Fました` });
    expect(saved()?.comment).not.toContain("\u0000");
    expect(saved()?.comment).not.toContain("\u007F");
  });

  it("I-741 見えない文字を除去する", async () => {
    await post({ ...VALID, comment: `採点が厳し\u200Bすぎると感じ\u202Eました` });
    expect(String(saved()?.comment)).not.toMatch(
      /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/,
    );
  });

  it("I-742 前後の空白を落とす", async () => {
    await post({ ...VALID, comment: `   ${COMMENT}   ` });
    expect(saved()?.comment).toBe(COMMENT);
  });

  it("I-743 全角英数字を揃える（NFKC）", async () => {
    await post({ ...VALID, comment: "ｽｺｱが 100 点になりません。理由を書きます。" });
    expect(saved()?.comment).toContain("スコア");
  });

  it("I-744 掃除した結果 短すぎたら 400", async () => {
    // 見えない文字で水増ししても通らない
    const padded = "あ" + "\u200B".repeat(50) + "い";
    const { res, json } = await post({ ...VALID, comment: padded });
    expect(res.status).toBe(400);
    expect(json.error).toContain(String(COMMENT_MIN_CHARS));
  });
});

describe("§14-5 attempt_id の紐付け", () => {
  it("I-750 指定が無ければ null で保存する", async () => {
    await post(VALID);
    expect(saved()?.attempt_id).toBeNull();
    // 引きにいっていない
    expect(spy.sessionTables).toHaveLength(0);
  });

  it.each([
    ["UUID でない文字列", "not-a-uuid"],
    ["数値", 123],
    ["空文字", ""],
  ])("I-751 attempt_id が %s なら照会せず null にする", async (_label, attempt_id) => {
    const { res } = await post({ ...VALID, attempt_id });
    expect(res.status).toBe(200);
    expect(saved()?.attempt_id).toBeNull();
    expect(spy.sessionTables).toHaveLength(0);
  });

  it("I-752 自分の回答なら紐付ける", async () => {
    setup({ resultAttempt: { id: ATTEMPT_ID } });
    await post({ ...VALID, attempt_id: ATTEMPT_ID });
    expect(saved()?.attempt_id).toBe(ATTEMPT_ID);
    expect(spy.sessionFilters).toContainEqual(["id", ATTEMPT_ID]);
  });

  /**
   * 照会は session クライアントで行うので RLS が効き、他人の行は引けない。
   * 他人の attempt_id を送りつけても null に落ちるだけで、報告自体は受け取る
   * （紐付けは補助情報でしかないため）。
   */
  it("I-753 他人の回答 ID を送っても紐付かず、報告は受け取る", async () => {
    setup({ resultAttempt: null });
    const { res } = await post({ ...VALID, attempt_id: ATTEMPT_ID });
    expect(res.status).toBe(200);
    expect(saved()?.attempt_id).toBeNull();
  });

  it("I-754 照会は session クライアント（RLS が効く側）で行う", async () => {
    setup({ resultAttempt: { id: ATTEMPT_ID } });
    await post({ ...VALID, attempt_id: ATTEMPT_ID });
    expect(spy.sessionTables).toEqual(["user_attempts"]);
    expect(spy.sessionSelects).toEqual(["id"]);
  });
});

describe("§14-6 保存", () => {
  it("I-760 保存に成功したら ok を返す", async () => {
    const { res, json } = await post(VALID);
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it("I-761 保存する内容", async () => {
    await post(VALID);
    expect(saved()).toMatchObject({
      user_id: USER_ID,
      problem_id: UNLOCKED_ID,
      kind: "score_dispute",
      comment: COMMENT,
      attempt_id: null,
    });
  });

  /**
   * 同じ問題への同種の報告は1人1件（DB の unique 制約）。
   * 無視（ignoreDuplicates）ではなく上書きにしているのは、
   * 前回より詳しく書き直した理由が黙って捨てられるのを防ぐため。
   */
  it("I-762 再送は上書きになる（無視ではない）", async () => {
    await post(VALID);
    expect(spy.upserted[0][1]).toEqual({ onConflict: "user_id,problem_id,kind" });
  });

  it("I-763 書き込みは service_role で行う", async () => {
    await post(VALID);
    // session 側では書いていない（RLS でポリシーが無く、そもそも書けない）
    expect(spy.upserted).toHaveLength(1);
  });

  it("I-764 保存に失敗したら 500 で、成功に見せない", async () => {
    setup({ upsertError: { message: "duplicate key" } });
    const { res, json } = await post(VALID);
    expect(res.status).toBe(500);
    expect(json).not.toHaveProperty("ok");
    expect(json.error).toContain("送信できませんでした");
  });

  it("I-765 エラー本文に DB の生メッセージを出さない", async () => {
    setup({ upsertError: { message: "duplicate key value violates unique constraint" } });
    const { json } = await post(VALID);
    expect(JSON.stringify(json)).not.toContain("constraint");
  });
});
