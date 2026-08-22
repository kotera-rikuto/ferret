/**
 * lib/ai/quota.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §19。
 *
 * ここで見るのは「DB の返事に対してどう振る舞うか」だけ。
 * 上限そのものを守っているのは SQL 側の行ロック
 * （supabase/migrations/20260822174900_ai_usage_daily.sql）で、
 * そちらは tests/integration/database.test.ts が実DBに繋いで確かめる。
 *
 * **この層の役目は「迷ったら通さない」こと。** 返事が想定外のときに通してしまうと、
 * DB が不調な間だけ上限が消える ── 最も気づきにくい壊れ方になる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consumeAiQuota,
  refundAiQuota,
  peekAiQuota,
  secondsUntilJstReset,
  DAILY_LIMIT_PER_USER,
  DAILY_LIMIT_GLOBAL,
} from "@/lib/ai/quota";

const USER_ID = "11111111-1111-1111-1111-111111111111";

type RpcResult = { data: unknown; error: { message: string } | null };

/** rpc だけを持つ最小のクライアント。呼ばれた [関数名, 引数] を記録する */
function fakeAdmin(results: Record<string, RpcResult>) {
  const calls: Array<[string, unknown]> = [];
  const admin = {
    rpc(fn: string, args?: unknown) {
      calls.push([fn, args]);
      return Promise.resolve(results[fn] ?? { data: null, error: { message: "未定義" } });
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

function consumeRow(patch: Record<string, unknown> = {}) {
  return { allowed: true, blocked_by: null, user_used: 1, global_used: 1, ...patch };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// §19-1 上限値
// ---------------------------------------------------------------------------

describe("§19-1 上限値", () => {
  it("U-850 既定は 1人1日20問・全体1日500回", () => {
    expect(DAILY_LIMIT_PER_USER).toBe(20);
    expect(DAILY_LIMIT_GLOBAL).toBe(500);
  });

  it("U-851 環境変数で上書きできる", async () => {
    vi.resetModules();
    vi.stubEnv("AI_SCORING_DAILY_LIMIT", "5");
    vi.stubEnv("AI_SCORING_DAILY_LIMIT_GLOBAL", "50");
    const m = await import("@/lib/ai/quota");
    expect(m.DAILY_LIMIT_PER_USER).toBe(5);
    expect(m.DAILY_LIMIT_GLOBAL).toBe(50);
  });

  /**
   * **設定を間違えたときに上限が消える方向へ倒れないこと。**
   * 「0 と書いたら無制限」「数字でなければ無制限」はどちらも
   * 誰も気づかないまま原価が出続ける壊れ方になる。
   */
  it.each([["0"], ["-1"], ["ぜんぶ"], ["1.5"], [""]])(
    "U-852 上限の値が %s なら既定値に落とす（無制限にしない）",
    async (value) => {
      vi.resetModules();
      vi.stubEnv("AI_SCORING_DAILY_LIMIT", value);
      const m = await import("@/lib/ai/quota");
      expect(m.DAILY_LIMIT_PER_USER).toBe(20);
    },
  );
});

// ---------------------------------------------------------------------------
// §19-2 確保
// ---------------------------------------------------------------------------

describe("§19-2 確保", () => {
  it("U-853 上限内なら通し、使用数を返す", async () => {
    const { admin, calls } = fakeAdmin({
      consume_ai_quota: { data: [consumeRow({ user_used: 3, global_used: 9 })], error: null },
    });
    const v = await consumeAiQuota(admin, USER_ID);
    expect(v).toEqual({ ok: true, userUsed: 3, globalUsed: 9 });
    expect(calls).toEqual([
      [
        "consume_ai_quota",
        {
          p_user_id: USER_ID,
          p_user_limit: DAILY_LIMIT_PER_USER,
          p_global_limit: DAILY_LIMIT_GLOBAL,
        },
      ],
    ]);
  });

  it("U-854 本人の枠切れは blockedBy=user で返す（判定保留の経路）", async () => {
    const { admin } = fakeAdmin({
      consume_ai_quota: {
        data: [consumeRow({ allowed: false, blocked_by: "user", user_used: 20 })],
        error: null,
      },
    });
    const v = await consumeAiQuota(admin, USER_ID);
    expect(v).toMatchObject({ ok: false, blockedBy: "user", userUsed: 20 });
  });

  it("U-855 全体の天井は blockedBy=global で返す（503 の経路）", async () => {
    const { admin } = fakeAdmin({
      consume_ai_quota: {
        data: [consumeRow({ allowed: false, blocked_by: "global", global_used: 500 })],
        error: null,
      },
    });
    const v = await consumeAiQuota(admin, USER_ID);
    expect(v).toMatchObject({ ok: false, blockedBy: "global", globalUsed: 500 });
  });

  it("U-856 blocked_by が知らない値なら本人の枠切れとして扱う", async () => {
    // 通す方向に倒さない。判定保留のほうが安全側（原価が出ない）
    const { admin } = fakeAdmin({
      consume_ai_quota: {
        data: [consumeRow({ allowed: false, blocked_by: "なにか" })],
        error: null,
      },
    });
    const v = await consumeAiQuota(admin, USER_ID);
    expect(v).toMatchObject({ ok: false, blockedBy: "user" });
  });

  it("U-857 単体のオブジェクトで返ってきても読める", async () => {
    const { admin } = fakeAdmin({
      consume_ai_quota: { data: consumeRow(), error: null },
    });
    expect(await consumeAiQuota(admin, USER_ID)).toMatchObject({ ok: true });
  });

  it.each([
    ["エラーが返った", { data: null, error: { message: "connection lost" } }],
    ["空で返った", { data: null, error: null }],
    ["空配列で返った", { data: [], error: null }],
    ["allowed が無い", { data: [{ user_used: 1 }], error: null }],
    ["allowed が真偽値でない", { data: [{ allowed: "yes" }], error: null }],
  ])("U-858 %s ときは通さない（上限が無効にならない）", async (_label, result) => {
    const { admin } = fakeAdmin({ consume_ai_quota: result as RpcResult });
    expect(await consumeAiQuota(admin, USER_ID)).toEqual({ ok: "unavailable" });
    expect(consoleError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// §19-3 返却
// ---------------------------------------------------------------------------

describe("§19-3 返却", () => {
  it("U-859 本人の id だけを渡して呼ぶ", async () => {
    const { admin, calls } = fakeAdmin({
      refund_ai_quota: { data: null, error: null },
    });
    await refundAiQuota(admin, USER_ID);
    expect(calls).toEqual([["refund_ai_quota", { p_user_id: USER_ID }]]);
  });

  it("U-860 返却に失敗しても例外にしない（採点の失敗の扱いを変えないため）", async () => {
    const { admin } = fakeAdmin({
      refund_ai_quota: { data: null, error: { message: "boom" } },
    });
    await expect(refundAiQuota(admin, USER_ID)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// §19-4 残数の参照
// ---------------------------------------------------------------------------

describe("§19-4 残数の参照", () => {
  it("U-861 のこりを上限から引いて返す", async () => {
    const { admin } = fakeAdmin({
      peek_ai_quota: { data: [{ user_used: 3, global_used: 40 }], error: null },
    });
    expect(await peekAiQuota(admin, USER_ID)).toEqual({
      used: 3,
      limit: DAILY_LIMIT_PER_USER,
      remaining: DAILY_LIMIT_PER_USER - 3,
    });
  });

  it("U-862 上限を下げた直後でも のこりは負にならない", async () => {
    const { admin } = fakeAdmin({
      peek_ai_quota: { data: [{ user_used: 999, global_used: 999 }], error: null },
    });
    expect((await peekAiQuota(admin, USER_ID))?.remaining).toBe(0);
  });

  it.each([
    ["エラーが返った", { data: null, error: { message: "boom" } }],
    ["空で返った", { data: null, error: null }],
    ["数字でない", { data: [{ user_used: "たくさん" }], error: null }],
  ])("U-863 %s ときは null（枠そのものを出さない）", async (_label, result) => {
    const { admin } = fakeAdmin({ peek_ai_quota: result as RpcResult });
    expect(await peekAiQuota(admin, USER_ID)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §19-5 リセットまでの秒数
// ---------------------------------------------------------------------------

describe("§19-5 リセットまでの秒数", () => {
  it("U-864 JST 0時までの秒数を返す", () => {
    // 2026-08-22 15:00 JST = 06:00 UTC → あと9時間
    expect(secondsUntilJstReset(new Date("2026-08-22T06:00:00Z"))).toBe(9 * 3600);
  });

  it("U-865 JST の日付が変わる直前は1日ぶんに戻る", () => {
    // 2026-08-22 00:00 JST = 前日 15:00 UTC
    expect(secondsUntilJstReset(new Date("2026-08-21T15:00:00Z"))).toBe(24 * 3600);
  });

  it("U-866 いつ呼んでも 1〜86400 秒に収まる（Retry-After に載せる値）", () => {
    for (let h = 0; h < 24; h++) {
      const s = secondsUntilJstReset(new Date(`2026-08-22T${String(h).padStart(2, "0")}:30:00Z`));
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(24 * 3600);
    }
  });
});
