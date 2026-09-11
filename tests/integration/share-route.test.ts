/**
 * GET /api/share/[attemptId]（結果の共有カード・G1）の結合テスト。
 * ケース定義は tests/integration/テストケース.md の §16。
 *
 * **この API は「本人以外にも見せる」経路ではない。**
 * G1 の設計上の要点は、共有機能を作りながら
 * 「回答ログは本人だけが読める・誰も書けない」を崩さなかったことにある。
 * ここが崩れると、崩れたことが**画面のどこにも出ない** ──
 * 絵は今までどおり出るのに、他人の結果まで出るようになる。
 * だから「誰の行を・どのクライアントで読んでいるか」を検査する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeClients, defaultState, USER_ID, type DbState, type DbSpy } from "./helpers";
import { CLEAR_THRESHOLD } from "@/lib/ai/compose";

const { getUserMock, holder } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  holder: { admin: null as unknown, session: null as unknown },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => holder.session }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => holder.admin }));

const { GET } = await import("@/app/api/share/[attemptId]/route");

const ATTEMPT_ID = "22222222-2222-2222-2222-222222222222";

let state: DbState;
let spy: DbSpy;

/**
 * 回答1件を `attempts` に置く（配列ではなく単体）。
 *
 * helpers の session クライアントは **select の列で結果を振り分ける**が、
 * このルートの `problem_id, total_score` は
 * `loadProgress`（`lib/progress/unlock.ts`）と**同じ文字列**なので、
 * どちらも `attempts` の側に落ちる。列で見分けられない以上、
 * 見分けさせるために本番のクエリを変えるのは順序が逆になる ──
 * こちらが単体を置いて `.maybeSingle()` の返り値に合わせる。
 */
function attempt(row: Record<string, unknown> | null) {
  return row as unknown as DbState["attempts"];
}

function setup(patch: Partial<DbState> = {}) {
  state = defaultState({
    attempts: attempt({ problem_id: 5, total_score: CLEAR_THRESHOLD }),
    problemDetail: { title: "代入の順番を追う ─ 担当者の付け替え" },
    ...patch,
  });
  const clients = makeClients(state, getUserMock as never);
  holder.admin = clients.admin;
  holder.session = clients.session;
  spy = clients.spy;
}

/** ルートは `params` を Promise で受け取る（Next.js 16） */
function call(attemptId = ATTEMPT_ID) {
  return GET(new Request(`http://localhost/api/share/${attemptId}`), {
    params: Promise.resolve({ attemptId }),
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
  setup();
});

describe("§16 結果の共有カード（GET /api/share/[attemptId]）", () => {
  it("I-883 クリアした回は PNG が返る（中身まで描けている）", async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");

    // **本文を必ず読み切ること。**
    // `ImageResponse` は見出しを先に返し、絵はそのあと流れてくる。
    // status と content-type だけ見る検査は**描画が落ちていても緑になる** ──
    // 実際に 2026-09-11 の実装でそうなった（satori が
    // 「子が2つ以上ある div には display を明示せよ」で例外を投げていたのに、
    // この検査は通っていて、画面で絵が出ないことから気づいた）。
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // PNG の署名
    // 描けずに空だけ返る形にならないよう、下限も見る
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it("I-884 個人の点数なので途中のキャッシュに残さない", async () => {
    const res = await call();

    // 共有された絵は本人以外の目に触れるが、**この URL は本人のもの**。
    // CDN や社内プロキシに残ると、次に同じ URL を開いた別の人へ配られる
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("I-885 未ログインなら 401（DB を引く前に止まる）", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await call();

    expect(res.status).toBe(401);
    expect(spy.sessionTables).toHaveLength(0);
  });

  it("I-886 attemptId が UUID でなければ 404（ログイン確認より前に落とす）", async () => {
    const res = await call("1");

    expect(res.status).toBe(404);
    // 形が違う時点で問い合わせる意味がない。素通しすると
    // 「1」「2」と変えた総当たりがそのまま DB への問い合わせになる
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("I-887 回答ログは session クライアントで読む（admin で読まない）", async () => {
    await call();

    // **これが RLS を効かせている唯一の担保。**
    // admin（service_role）で読むと RLS を迂回するので、
    // 絞り込みの条件を書き間違えた瞬間に他人の結果が出る側へ倒れる
    expect(spy.sessionTables).toContain("user_attempts");
    expect(spy.selects.map(([table]) => table)).not.toContain("user_attempts");
  });

  it("I-888 問題名は admin で読み、模範解答を取らない", async () => {
    await call();

    // problems は RLS ポリシーが0件なので session では読めない。
    // admin で読む以上、**取る列を明示する**のが唯一の歯止めになる
    const problems = spy.selects.filter(([table]) => table === "problems");
    expect(problems).toHaveLength(1);
    expect(problems[0][1]).toBe("title");
  });

  it("I-889 判定保留の回は共有できない", async () => {
    await call();

    // 上限に達した回は層1だけで採点していて合否が出ていない。
    // 絞り込みを外すと「クリアしていないのにクリアの絵」が作れる
    expect(spy.sessionFilters).toContainEqual(["is_provisional", false]);
  });

  it("I-890 クリアに届かなかった回は 404", async () => {
    setup({
      attempts: attempt({ problem_id: 5, total_score: CLEAR_THRESHOLD - 1 }),
    });

    const res = await call();

    expect(res.status).toBe(404);
  });

  it("I-891 自分の回答が無ければ 404", async () => {
    setup({ attempts: attempt(null) });

    const res = await call();

    expect(res.status).toBe(404);
  });

  it("I-892 問題が見つからなければ 404", async () => {
    setup({ problemDetail: null });

    const res = await call();

    expect(res.status).toBe(404);
  });

  it("I-893 見つからない理由を区別して返さない", async () => {
    // 「行が無い」と「クリアしていない」を別の返事にすると、
    // 他人の attemptId に対して**その回答の存在を確かめられる**
    const missing = await call();
    const belowClear = await (async () => {
      setup({ attempts: attempt({ problem_id: 5, total_score: 0 }) });
      return call();
    })();

    setup({ attempts: attempt(null) });
    const nothing = await call();

    expect(missing.status).toBe(200); // 既定は成功する状態
    expect(belowClear.status).toBe(nothing.status);
    expect(await belowClear.json()).toEqual(await nothing.json());
  });
});
