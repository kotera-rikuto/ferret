/**
 * DB 制約と RLS の検証。
 * ケース定義は tests/integration/テストケース.md の §13。
 *
 * **既定では走らない。** 実際の Supabase に繋いで行を作るため、明示的に有効化したときだけ動く。
 *
 *   npm run test:db
 *
 * 他のテストと違い、ここだけは**モックにできない。**
 * 確かめたいのが「Postgres が本当に拒否するか」そのものだから。
 * アプリ側のコードをどれだけテストしても、RLS が外れていれば
 * ブラウザから直接 `total_score: 100` を書き込める。
 *
 * 後始末:
 *   - 投入する問題は order 9500 番台。本番の問題（1〜100）と混ざらない
 *   - 作った user_attempts は毎回消す
 *   - テスト用ユーザーは使い回す（消さない）
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

const OPT_IN = process.env.RUN_DB_TESTS === "1";

// 有効にしたときだけ .env.local を読む。
// 常に読むと、他のテストファイルと同じプロセスに本番の接続先や API キーが載ってしまう
if (OPT_IN) loadEnv({ path: ".env.local", quiet: true });

const URL_ = OPT_IN ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
const ANON = OPT_IN ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined;
const SERVICE = OPT_IN ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;

const HAS_ENV = Boolean(URL_ && ANON && SERVICE);
const RUN = HAS_ENV && OPT_IN;

if (OPT_IN && !HAS_ENV) {
  throw new Error(
    "RUN_DB_TESTS=1 が指定されましたが、.env.local に Supabase の URL / anon キー / service_role キーが揃っていません",
  );
}

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

const TEST_ORDER = 9500;

/** 制約を通る最小の問題データ */
function validProblem(patch: Record<string, unknown> = {}) {
  return {
    order: TEST_ORDER,
    title: "DBテスト用",
    language: "js",
    difficulty: 1,
    reading_type: "トレース",
    code: "const rate = 0.9;",
    question: "何が起きますか。",
    model_answer: "エラーになります。",
    keywords: [
      { match: ["rate"] },
      { match: ["const"] },
      { match: ["再代入"] },
      { match: ["エラー"] },
    ],
    rubric_items: {
      core: "エラーになるという結論",
      ground: "const への再代入",
      depth: "TypeError という名前",
      core_reject: ["900 が出ると読んでいる", "let が問題だと読んでいる"],
    },
    ...patch,
  };
}

/** 制約を通る最小の回答データ */
function validAttempt(userId: string, problemId: number, patch: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    problem_id: problemId,
    answer: "DBテスト用の回答です",
    keyword_score: 20,
    deep_score: 80,
    total_score: 100,
    ai_feedback: "テスト用",
    scoring_method: "ai",
    grader_version: "db-test",
    answer_hash: `db-test-${problemId}-${Math.abs(problemId * 7919)}`,
    is_provisional: false,
    contradiction: false,
    ...patch,
  };
}

const USERS = {
  a: { email: "db-test-a@ferret.test", password: "FerretDbTestA2026!" },
  b: { email: "db-test-b@ferret.test", password: "FerretDbTestB2026!" },
};

let admin: SupabaseClient;
let anon: SupabaseClient;
let asA: SupabaseClient;
let asB: SupabaseClient;
let userA = "";
let userB = "";
let problemId = 0;

async function ensureUser(email: string, password: string): Promise<string> {
  const { data } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (data?.user) return data.user.id;

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list?.users.find((u) => u.email === email);
  if (!found) throw new Error(`テストユーザーを用意できません: ${email}`);
  return found.id;
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL_!, ANON!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`ログインできません（${email}）: ${error.message}`);
  return client;
}

/** 投入して、成功なら id を返す。失敗ならエラーコードを返す */
async function insertProblem(patch: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("problems")
    .insert(validProblem(patch))
    .select("id")
    .single();
  return { id: data?.id as number | undefined, error };
}

// ---------------------------------------------------------------------------

describe.skipIf(!RUN)("§13 DB 制約と RLS（実DB）", () => {
  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } });
    anon = createClient(URL_!, ANON!, { auth: { persistSession: false } });

    await admin.from("problems").delete().gte("order", TEST_ORDER);

    userA = await ensureUser(USERS.a.email, USERS.a.password);
    userB = await ensureUser(USERS.b.email, USERS.b.password);
    asA = await signIn(USERS.a.email, USERS.a.password);
    asB = await signIn(USERS.b.email, USERS.b.password);

    const { id, error } = await insertProblem();
    if (error) throw new Error(`テスト用の問題を投入できません: ${error.message}`);
    problemId = id!;

    await admin.from("user_attempts").delete().in("user_id", [userA, userB]);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("user_attempts").delete().in("user_id", [userA, userB]);
    await admin.from("problems").delete().gte("order", TEST_ORDER);
  });

  // -------------------------------------------------------------------------
  // 13-1 problems の制約
  // -------------------------------------------------------------------------

  describe("13-1 problems の制約", () => {
    it("I-600/601 キーワードが4個でなければ拒否する", async () => {
      const three = await insertProblem({
        order: TEST_ORDER + 1,
        keywords: [{ match: ["a"] }, { match: ["b"] }, { match: ["c"] }],
      });
      expect(three.error?.code).toBe("23514");
      expect(three.error?.message).toContain("keywords");

      const five = await insertProblem({
        order: TEST_ORDER + 2,
        keywords: Array.from({ length: 5 }, () => ({ match: ["x"] })),
      });
      expect(five.error?.code).toBe("23514");
    });

    it("I-602 keywords が null でも制約をすり抜けない", async () => {
      const { error } = await insertProblem({ order: TEST_ORDER + 3, keywords: null });
      // NOT NULL か CHECK のどちらかで必ず止まる
      expect(error).toBeTruthy();
    });

    it("I-603 keywords が配列でなければ拒否する", async () => {
      const { error } = await insertProblem({
        order: TEST_ORDER + 4,
        keywords: { match: ["a"] },
      });
      expect(error?.code).toBe("23514");
    });

    it("I-604 キーワードがちょうど4個なら通る", async () => {
      const { id, error } = await insertProblem({ order: TEST_ORDER + 5 });
      expect(error).toBeNull();
      expect(id).toBeGreaterThan(0);
    });

    it("I-605 core_reject が2件未満なら拒否する", async () => {
      const { error } = await insertProblem({
        order: TEST_ORDER + 6,
        rubric_items: {
          core: "a",
          ground: "b",
          depth: "c",
          core_reject: ["1件だけ"],
        },
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toContain("rubric_items");
    });

    it("I-606 rubric_items にキーが欠けていたら拒否する", async () => {
      const { error } = await insertProblem({
        order: TEST_ORDER + 7,
        rubric_items: { core: "a", ground: "b", core_reject: ["x", "y"] },
      });
      expect(error?.code).toBe("23514");
    });

    it("I-607 core_reject が配列でなければ拒否する", async () => {
      const { error } = await insertProblem({
        order: TEST_ORDER + 8,
        rubric_items: { core: "a", ground: "b", depth: "c", core_reject: "x" },
      });
      expect(error?.code).toBe("23514");
    });

    it("I-608 読解型が6種と厳密に一致しなければ拒否する", async () => {
      for (const bad of ["トレース型", "trace", "その他", ""]) {
        const { error } = await insertProblem({
          order: TEST_ORDER + 9,
          reading_type: bad,
        });
        expect(error?.code, `${bad} が通ってしまった`).toBe("23514");
      }
    });

    it("I-609 6種の読解型はすべて通る", async () => {
      const types = ["トレース", "意図", "ズレ", "影響", "命名", "仕様"];
      for (const [i, t] of types.entries()) {
        const { error } = await insertProblem({
          order: TEST_ORDER + 20 + i,
          reading_type: t,
        });
        expect(error, `${t} が拒否された: ${error?.message}`).toBeNull();
      }
    });

    it("I-610 title が null なら拒否する", async () => {
      const { error } = await insertProblem({ order: TEST_ORDER + 40, title: null });
      expect(error?.code).toBe("23502"); // not null violation
    });

    it("I-611 id を明示すると拒否する（自動採番）", async () => {
      const { error } = await admin
        .from("problems")
        .insert({ ...validProblem({ order: TEST_ORDER + 41 }), id: 999999 });
      expect(error?.code).toBe("428C9");
    });
  });

  // -------------------------------------------------------------------------
  // 13-2 user_attempts の制約
  // -------------------------------------------------------------------------

  describe("13-2 user_attempts の制約", () => {
    it.each([
      ["keyword_score が 25", { keyword_score: 25 }],
      ["keyword_score が -1", { keyword_score: -1 }],
      ["deep_score が 85", { deep_score: 85 }],
      ["total_score が 101", { total_score: 101 }],
      ["total_score が -1", { total_score: -1 }],
    ])("I-620〜622 点数が範囲外（%s）なら拒否する", async (_label, patch) => {
      const { error } = await admin
        .from("user_attempts")
        .insert(validAttempt(userA, problemId, patch));
      expect(error?.code).toBe("23514");
    });

    it("I-623 scoring_method が想定外なら拒否する", async () => {
      const { error } = await admin
        .from("user_attempts")
        .insert(validAttempt(userA, problemId, { scoring_method: "embedding" }));
      expect(error?.code).toBe("23514");
    });

    it("I-624 ai / keyword_only は通る", async () => {
      for (const method of ["ai", "keyword_only"]) {
        const { error } = await admin.from("user_attempts").insert(
          validAttempt(userA, problemId, {
            scoring_method: method,
            answer_hash: `db-test-method-${method}`,
          }),
        );
        expect(error, `${method} が拒否された`).toBeNull();
      }
    });

    it("I-625 answer_hash が無ければ拒否する", async () => {
      const row = validAttempt(userA, problemId);
      delete (row as Record<string, unknown>).answer_hash;
      const { error } = await admin.from("user_attempts").insert(row);
      expect(error?.code).toBe("23502");
    });

    it("I-626 存在しないユーザーの行は作れない", async () => {
      const { error } = await admin
        .from("user_attempts")
        .insert(
          validAttempt("00000000-0000-0000-0000-000000000000", problemId, {
            answer_hash: "db-test-fk",
          }),
        );
      expect(error?.code).toBe("23503"); // foreign key violation
    });

    it("I-627 判定保留・矛盾の既定値は false", async () => {
      const row = validAttempt(userA, problemId, { answer_hash: "db-test-defaults" });
      delete (row as Record<string, unknown>).is_provisional;
      delete (row as Record<string, unknown>).contradiction;

      const { data, error } = await admin
        .from("user_attempts")
        .insert(row)
        .select("is_provisional, contradiction")
        .single();
      expect(error).toBeNull();
      expect(data?.is_provisional).toBe(false);
      expect(data?.contradiction).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 13-3 RLS
  // -------------------------------------------------------------------------

  describe("13-3 RLS", () => {
    beforeAll(async () => {
      await admin.from("user_attempts").delete().in("user_id", [userA, userB]);
      await admin
        .from("user_attempts")
        .insert([
          validAttempt(userA, problemId, { answer_hash: "rls-a", total_score: 90 }),
          validAttempt(userB, problemId, { answer_hash: "rls-b", total_score: 40 }),
        ]);
    });

    /**
     * problems にポリシーを作っていない理由。
     * SELECT を許すと anon キー（ブラウザに配られる）で model_answer を直接読める。
     */
    it("I-640 未ログインでは問題を1件も読めない", async () => {
      const { data, error } = await anon.from("problems").select("id, model_answer");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("I-640b ログイン済みでも問題は読めない（サーバー経由のみ）", async () => {
      const { data } = await asA.from("problems").select("id, model_answer");
      expect(data).toEqual([]);
    });

    it("I-641/642 自分の回答だけが読める", async () => {
      const { data } = await asA.from("user_attempts").select("user_id, total_score");
      expect(data?.length).toBeGreaterThan(0);
      expect(data?.every((r) => r.user_id === userA)).toBe(true);
      expect(data?.some((r) => r.user_id === userB)).toBe(false);
    });

    /**
     * **ここが RLS 設計の要。**
     * 通ってしまうと、ブラウザから直接 total_score: 100 を挿入でき、
     * 段位・認定証・ステージ進行のすべてが無意味になる。
     * db仕様.md が「書き込みポリシーは意図的に1つも作らない」と明記している箇所。
     */
    it("I-643 自分の回答であっても書き込めない", async () => {
      const { error } = await asA
        .from("user_attempts")
        .insert(validAttempt(userA, problemId, { answer_hash: "rls-forged" }));
      expect(error).toBeTruthy();

      // 本当に入っていないことを service_role で確かめる
      const { data } = await admin
        .from("user_attempts")
        .select("id")
        .eq("answer_hash", "rls-forged");
      expect(data).toEqual([]);
    });

    it("I-643b 他人になりすました書き込みもできない", async () => {
      const { error } = await asA
        .from("user_attempts")
        .insert(validAttempt(userB, problemId, { answer_hash: "rls-impersonate" }));
      expect(error).toBeTruthy();
    });

    it("I-644 自分のスコアを書き換えられない", async () => {
      const { error } = await asA
        .from("user_attempts")
        .update({ total_score: 100 })
        .eq("answer_hash", "rls-a");
      // ポリシーが無いので更新対象が0件になるか、エラーになる
      const { data } = await admin
        .from("user_attempts")
        .select("total_score")
        .eq("answer_hash", "rls-a")
        .single();
      expect(data?.total_score, `更新が通った（error=${error?.message}）`).toBe(90);
    });

    it("I-644b 自分の回答を消せない", async () => {
      await asA.from("user_attempts").delete().eq("answer_hash", "rls-a");
      const { data } = await admin
        .from("user_attempts")
        .select("id")
        .eq("answer_hash", "rls-a");
      expect(data?.length).toBe(1);
    });

    it("I-645 プランを自分で書き換えられない", async () => {
      await asA.from("users").update({ plan: "pro_plus" }).eq("id", userA);
      const { data } = await admin.from("users").select("plan").eq("id", userA).single();
      expect(data?.plan).toBe("free");
    });

    it("I-646 自分のユーザー情報だけが読める", async () => {
      const { data } = await asA.from("users").select("id");
      expect(data).toEqual([{ id: userA }]);
    });

    it("I-647 契約情報も自分の行だけ", async () => {
      const { data, error } = await asB.from("subscriptions").select("user_id");
      expect(error).toBeNull();
      expect((data ?? []).every((r) => r.user_id === userB)).toBe(true);
    });

    it("I-648 service_role は制限を受けない", async () => {
      const { data } = await admin.from("problems").select("id").gte("order", TEST_ORDER);
      expect((data ?? []).length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 13-4 トリガー
  // -------------------------------------------------------------------------

  describe("13-4 public.users の自動生成", () => {
    it("I-660/662 サインアップで public.users の行ができる", async () => {
      // 経路が増えても書き漏らさないよう、アプリ側ではなく DB 側に置いてある
      const { data } = await admin.from("users").select("id, plan, xp").eq("id", userA).single();
      expect(data).toMatchObject({ id: userA, plan: "free", xp: 0 });
    });

    it("I-661 同じユーザーで2回呼ばれても落ちない（on conflict do nothing）", async () => {
      const { error } = await admin
        .from("users")
        .upsert({ id: userA, plan: "free", xp: 0 }, { onConflict: "id", ignoreDuplicates: true });
      expect(error).toBeNull();
    });
  });
});

describe.skipIf(RUN)("§13 DB 制約と RLS", () => {
  it("実DB に繋がないので飛ばした（RUN_DB_TESTS=1 で有効になる）", () => {
    expect(RUN).toBe(false);
  });
});
