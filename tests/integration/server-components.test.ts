/**
 * 画面（Server Component）のデータ取得の結合テスト。
 * ケース定義は tests/integration/テストケース.md の §10。
 *
 * 見た目は E2E の担当なので、ここでは**どのキーで何を読んでいるか**と
 * **どこへ弾いているか**だけを固定する。
 *
 * 特に「模範解答を select していない」は、漏れたときに画面上は正常に見えるため
 * 目視では気づけない。ここで押さえておく。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  makeClients,
  defaultState,
  ANSWER,
  EVIDENCE_REAL,
  UNLOCKED_ID,
  LOCKED_ID,
  USER_ID,
  type AttemptRow,
  type DbState,
  type DbSpy,
} from "./helpers";

// ---------------------------------------------------------------------------
// モック
// ---------------------------------------------------------------------------

const { getUserMock, holder } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  holder: { admin: null as unknown, session: null as unknown },
}));

/**
 * next/navigation の redirect / notFound は本来「例外を投げて描画を止める」もの。
 * 投げる中身を自前のものに差し替えて、どちらがどこへ飛ばしたかを読めるようにする。
 */
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  // StageMap（クライアントコンポーネント）が import している。描画はしないので中身は不要
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.session,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => holder.admin,
}));

const StagesPage = (await import("@/app/stages/page")).default;
const ProblemPage = (await import("@/app/problems/[id]/page")).default;
const ResultPage = (await import("@/app/result/[id]/page")).default;
const SettingsPage = (await import("@/app/settings/page")).default;
const ReviewPage = (await import("@/app/review/[id]/page")).default;
const ReviewIndexPage = (await import("@/app/review/page")).default;

// ---------------------------------------------------------------------------
// セットアップ
// ---------------------------------------------------------------------------

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

/** ページを描画して、飛ばされた先（redirect / notFound）を文字列で返す */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "RENDERED";
  } catch (e) {
    return String((e as Error).message);
  }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

// ---------------------------------------------------------------------------
// §10-1 ステージ選択
// ---------------------------------------------------------------------------

describe("§10-1 /stages", () => {
  it("I-373 未ログインならログイン画面へ送る", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await outcome(() => StagesPage())).toBe("REDIRECT:/login");
  });

  it("I-370 problems は admin、回答履歴は session クライアントで読む", async () => {
    await StagesPage();
    expect(spy.selects).toContainEqual(["problems", "id, order, title"]);
    // 解放判定とストリークで user_attempts を2回読む。どちらも session 側
    expect(spy.sessionTables).toEqual(["user_attempts", "user_attempts"]);
  });

  it("I-383 ストリークは回答ログから導出する（カウンタを持たない）", async () => {
    await StagesPage();
    // 直近1年ぶんを新しい順に取る
    expect(spy.sessionSelects).toContain("created_at");
    expect(spy.orders).toContainEqual(["created_at", { ascending: false }]);
    expect(spy.limits).toContain(366);
    expect(spy.sessionFilters).toContainEqual(["user_id", USER_ID]);
  });

  it("I-386 レベルは解放判定で読んだ最高点から出す（問い合わせを増やさない）", async () => {
    await StagesPage();
    // XP のために user_attempts を3回目に読んだり、users を読んだりしない
    expect(spy.sessionTables).toEqual(["user_attempts", "user_attempts"]);
    expect(spy.selects.map(([t]) => t)).not.toContain("users");
  });

  it("I-371 一覧に model_answer / rubric_items を含めない", async () => {
    await StagesPage();
    const columns = spy.selects.filter(([t]) => t === "problems").map(([, c]) => c);
    for (const c of columns) {
      expect(c).not.toContain("model_answer");
      expect(c).not.toContain("rubric_items");
      expect(c).not.toContain("keywords");
    }
  });

  it("I-372 判定保留を進行判定から除外する", async () => {
    await StagesPage();
    expect(spy.sessionFilters).toContainEqual(["is_provisional", false]);
    expect(spy.sessionFilters).toContainEqual(["user_id", USER_ID]);
  });

  it("I-374 問題が0件でも落ちない", async () => {
    setup({ problemList: [] });
    expect(await outcome(() => StagesPage())).toBe("RENDERED");
  });

  it("I-374b 問題の取得が null でも落ちない", async () => {
    setup({ problemList: null });
    expect(await outcome(() => StagesPage())).toBe("RENDERED");
  });
});

// ---------------------------------------------------------------------------
// §10-2 問題画面
// ---------------------------------------------------------------------------

describe("§10-2 /problems/[id]", () => {
  it("I-373b 未ログインならログイン画面へ送る", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await outcome(() => ProblemPage(params(String(UNLOCKED_ID))))).toBe(
      "REDIRECT:/login",
    );
  });

  it.each(["abc", "0", "-1", "5.5", "", "1e3"])(
    "I-378 URL の id が整数でない（%s）なら 404",
    async (id) => {
      expect(await outcome(() => ProblemPage(params(id)))).toBe("NOT_FOUND");
    },
  );

  it("I-402 未解放のステージは 404（画面と API で同じ判定）", async () => {
    expect(await outcome(() => ProblemPage(params(String(LOCKED_ID))))).toBe(
      "NOT_FOUND",
    );
  });

  it("I-402b 前のステージをクリア済みなら開く", async () => {
    setup({ attempts: [{ problem_id: UNLOCKED_ID, total_score: 55 }] });
    expect(await outcome(() => ProblemPage(params(String(LOCKED_ID))))).toBe("RENDERED");
  });

  it("I-377 問題の詳細が取れなければ 404", async () => {
    setup({ problemDetail: null });
    expect(await outcome(() => ProblemPage(params(String(UNLOCKED_ID))))).toBe(
      "NOT_FOUND",
    );
  });

  it("I-376 表示に必要な列だけを取り、模範解答を読まない", async () => {
    await ProblemPage(params(String(UNLOCKED_ID)));
    const detail = spy.selects.find(
      ([t, c]) => t === "problems" && c.includes("code"),
    );
    // language / reading_type は画面のバッジ表示に使う。
    // context（実行結果）と prerequisite（前提知識）は入っている問題だけ枠を出す
    // （app/problems/[id]/page.tsx）
    expect(detail?.[1]).toBe(
      "id, order, title, code, question, language, reading_type, context, prerequisite",
    );
    expect(detail?.[1]).not.toContain("model_answer");
    expect(detail?.[1]).not.toContain("rubric_items");
    expect(detail?.[1]).not.toContain("keywords");
  });

  it("I-376c 実行結果・前提知識が空でも描画できる", async () => {
    // 既存の問題は2欄とも NULL。ここで落ちると、欄を足した瞬間に
    // 全問が 404 になる（PROBLEM_DETAIL は2欄を持たないので undefined で入る）
    expect(await outcome(() => ProblemPage(params(String(UNLOCKED_ID))))).toBe(
      "RENDERED",
    );
  });

  it("I-376b 未解放なら問題の詳細を引きにすらいかない", async () => {
    await outcome(() => ProblemPage(params(String(LOCKED_ID))));
    const detail = spy.selects.find(([t, c]) => t === "problems" && c.includes("code"));
    expect(detail).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §10-3 リザルト画面
// ---------------------------------------------------------------------------

const ATTEMPT = {
  total_score: 73,
  keyword_score: 15,
  deep_score: 58,
  ai_feedback: "中核まで読み取れています。",
};

describe("§10-3 /result/[id]", () => {
  it("I-373c 未ログインならログイン画面へ送る", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await outcome(() => ResultPage(params(String(UNLOCKED_ID))))).toBe(
      "REDIRECT:/login",
    );
  });

  it.each(["abc", "0", "-1"])("I-378b URL の id が整数でない（%s）なら 404", async (id) => {
    expect(await outcome(() => ResultPage(params(id)))).toBe("NOT_FOUND");
  });

  it("I-381 未回答なら問題画面へ戻す", async () => {
    setup({ resultAttempt: null });
    expect(await outcome(() => ResultPage(params(String(UNLOCKED_ID))))).toBe(
      `REDIRECT:/problems/${UNLOCKED_ID}`,
    );
  });

  it("I-379 回答履歴は session クライアントで読む（RLS が効く側）", async () => {
    setup({ resultAttempt: ATTEMPT });
    await ResultPage(params(String(UNLOCKED_ID)));
    // 表示する回答と XP の集計で user_attempts を2回読む。どちらも session 側
    expect(spy.sessionTables).toEqual(["user_attempts", "user_attempts"]);
    // id は異議申し立て（/api/feedback）で attempt_id として使う
    expect(spy.sessionSelects[0]).toBe(
      // contradiction は読み違いのときの見せ方の分岐に使う（E6）。
      // ai_praise / ai_next_focus は2枠表示に使う（E2）
      "id, total_score, keyword_score, deep_score, ai_feedback, ai_praise, ai_next_focus, contradiction",
    );
  });

  it("I-380 判定保留を除き、作成日時の降順で1件だけ取る", async () => {
    setup({ resultAttempt: ATTEMPT });
    await ResultPage(params(String(UNLOCKED_ID)));

    expect(spy.sessionFilters).toContainEqual(["problem_id", UNLOCKED_ID]);
    expect(spy.sessionFilters).toContainEqual(["is_provisional", false]);
    expect(spy.orders).toContainEqual(["created_at", { ascending: false }]);
    expect(spy.limits).toContain(1);
  });

  /**
   * 🟡 ステージのクリア判定は「最高点」、リザルト画面は「最新の回答」を読む。
   * そのため 100点でクリアしたあと復習で 20点を取ると、
   * マップは ✅ のままリザルトは「もう一度挑戦しよう」になる。
   *
   * 進行が巻き戻らないのは意図した設計（db仕様.md）だが、
   * 2つの画面が別の基準で合否を出しているのは事実。
   * ここではクエリの形で「最新を読んでいる」ことを固定しておく。
   */
  it("I-382 【要判断】最高点ではなく最新の回答を読む", async () => {
    setup({ resultAttempt: ATTEMPT });
    await ResultPage(params(String(UNLOCKED_ID)));

    const select = spy.sessionSelects[0];
    // 最高点を取るなら order は total_score 降順になるはず
    expect(spy.orders).toContainEqual(["created_at", { ascending: false }]);
    expect(spy.orders).not.toContainEqual(["total_score", { ascending: false }]);
    expect(select).not.toContain("max(");
  });

  /**
   * XP は users.xp に貯めず、回答ログから毎回導出する（lib/progress/level.ts）。
   * カウンタを持つと「採点結果は保存できたのに加算だけ失敗した」というズレが生まれ、
   * 画面は普通に描画される（数字が少し小さいだけ）ので気づけない。
   * ストリークと同じ方針なので、書き込みが1つも走らないことまで見る。
   */
  it("I-384 XP は回答ログから導出する（users.xp に触らない）", async () => {
    setup({ resultAttempt: ATTEMPT });
    await ResultPage(params(String(UNLOCKED_ID)));

    expect(spy.sessionSelects[1]).toBe("id, problem_id, total_score");
    expect(spy.sessionFilters).toContainEqual(["user_id", USER_ID]);
    // 判定保留（層1のみで採点した回）は XP にも数えない
    expect(spy.sessionFilters).toContainEqual(["is_provisional", false]);

    expect(spy.sessionTables).not.toContain("users");
    expect(spy.selects.map(([t]) => t)).not.toContain("users");
    expect(spy.inserted).toHaveLength(0);
    expect(spy.upserted).toHaveLength(0);
  });

  it("I-385 XP の集計を service_role で行わない", async () => {
    setup({ resultAttempt: ATTEMPT });
    await ResultPage(params(String(UNLOCKED_ID)));
    // admin で数えると、RLS が壊れたときに他人の行まで数えて
    // XP が増える方向に転ぶ。session なら「少なく出る」側に倒れる
    expect(spy.selects).toHaveLength(0);
  });

  it("I-379b 解放状態を見ずに描画する（クリア済みの復習を妨げない）", async () => {
    setup({ resultAttempt: ATTEMPT });
    await ResultPage(params(String(LOCKED_ID)));
    // リザルトは「自分の回答があるか」だけで判断する。
    // 回答がある＝そのステージは開いていたということなので、二重に判定しない
    expect(spy.selects.filter(([t]) => t === "problems")).toHaveLength(0);
  });
});

describe("§10-4 せってい画面", () => {
  it("I-383 未ログインならログイン画面へ送る", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await outcome(() => SettingsPage())).toBe("REDIRECT:/login");
  });

  /**
   * せってい画面は問題に紐づかないので、DB を一切読まない。
   * 読み始めたら `loadProgress` を通す必要が出てくる（`ideas/セキュリティ_残課題.md` §4）。
   * ここで「読んでいない」を固定して、足したときに気づけるようにしておく。
   */
  it("I-384 ログイン確認だけで描画し、DB を読まない", async () => {
    expect(await outcome(() => SettingsPage())).toBe("RENDERED");
    expect(spy.selects).toHaveLength(0);
    expect(spy.sessionTables).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §10-5 ふりかえり画面
// ---------------------------------------------------------------------------

/** 内訳つきの回答。引用は ANSWER の中に実在する文字列にしてある */
const REVIEW_ATTEMPT = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  answer: ANSWER,
  total_score: 73,
  keyword_score: 15,
  deep_score: 58,
  contradiction: false,
  created_at: "2026-08-18T02:00:00.000Z",
  axes: {
    axes: [
      { axis: "core", verdict: "full", raw: "full", demoted: false, evidence: EVIDENCE_REAL, points: 48 },
      { axis: "ground", verdict: "partial", raw: "partial", demoted: false, evidence: "", points: 8 },
      { axis: "depth", verdict: "none", raw: "none", demoted: false, evidence: "", points: 0 },
      { axis: "articulation", verdict: "full", raw: "full", demoted: false, evidence: EVIDENCE_REAL, points: 4 },
    ],
    keyword_hits: [true, true, true, false],
    evidence_capped: false,
    fabrication_suspected: false,
    matched_reject: "none",
  },
};

describe("§10-5 /review/[id]", () => {
  it("I-870 未ログインならログイン画面へ送る", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await outcome(() => ReviewPage(params(String(UNLOCKED_ID))))).toBe(
      "REDIRECT:/login",
    );
  });

  it.each(["abc", "0", "-1"])("I-871 URL の id が整数でない（%s）なら 404", async (id) => {
    expect(await outcome(() => ReviewPage(params(id)))).toBe("NOT_FOUND");
  });

  /**
   * **この画面で模範解答を守っているのはこの1行。**
   * 解放判定ではなく「自分の回答が残っているか」を関門にしている
   * （回答がある＝そのステージは開いていた。リザルトと同じ考え方＝I-379b）。
   * ここが緩むと、解いていない問題の答えを URL を打つだけで読めてしまう
   */
  it("I-872 回答が無ければ問題画面へ返し、問題を引きにいかない", async () => {
    setup({ resultAttempt: null });
    expect(await outcome(() => ReviewPage(params(String(UNLOCKED_ID))))).toBe(
      `REDIRECT:/problems/${UNLOCKED_ID}`,
    );
    // 模範解答を含むクエリがそもそも走らない
    expect(spy.selects).toHaveLength(0);
  });

  it("I-873 回答は session クライアントで読む（RLS が効く側）", async () => {
    setup({ resultAttempt: REVIEW_ATTEMPT });
    await ReviewPage(params(String(UNLOCKED_ID)));

    expect(spy.sessionTables).toEqual(["user_attempts"]);
    expect(spy.sessionSelects[0]).toBe(
      "id, answer, total_score, keyword_score, deep_score, axes, contradiction, created_at",
    );
    expect(spy.sessionFilters).toContainEqual(["user_id", USER_ID]);
    expect(spy.sessionFilters).toContainEqual(["problem_id", UNLOCKED_ID]);
  });

  it("I-874 判定保留を除き、作成日時の降順で1件だけ取る", async () => {
    setup({ resultAttempt: REVIEW_ATTEMPT });
    await ReviewPage(params(String(UNLOCKED_ID)));

    expect(spy.sessionFilters).toContainEqual(["is_provisional", false]);
    expect(spy.orders).toContainEqual(["created_at", { ascending: false }]);
    expect(spy.limits).toContain(1);
  });

  /**
   * 模範解答は出すが、**採点基準は出さない**（オーナー判断 2026-08-19）。
   * `rubric_items` が見えると、並べるべき語がそのまま分かってしまい
   * キーワードだけで点が取れる。漏れても画面は正常に見えるので、ここで固定する
   */
  it("I-875 問題は admin で読み、採点基準を select しない", async () => {
    setup({ resultAttempt: REVIEW_ATTEMPT });
    await ReviewPage(params(String(UNLOCKED_ID)));

    const problemSelects = spy.selects.filter(([table]) => table === "problems");
    expect(problemSelects).toHaveLength(1);

    const columns = problemSelects[0][1];
    expect(columns).toContain("model_answer");
    for (const secret of ["rubric_items", "keywords", "core_reject"]) {
      expect(columns, `${secret} を読んでいる`).not.toContain(secret);
    }
  });

  /**
   * リザルトと同じく解放状態を見ない（I-379b）。
   * loadProgress を通すと problems の一覧クエリが増えるので、その形で確かめる
   */
  it("I-876 解放状態を見ずに描画する（クリア済みの復習を妨げない）", async () => {
    setup({ resultAttempt: REVIEW_ATTEMPT });
    expect(await outcome(() => ReviewPage(params(String(LOCKED_ID))))).toBe(
      "RENDERED",
    );
    expect(spy.selects.map(([, columns]) => columns)).not.toContain(
      "id, order, title",
    );
  });

  it("I-877 問題の詳細が取れなければ 404", async () => {
    setup({ resultAttempt: REVIEW_ATTEMPT, problemDetail: null });
    expect(await outcome(() => ReviewPage(params(String(UNLOCKED_ID))))).toBe(
      "NOT_FOUND",
    );
  });

  /**
   * 採点の仕組みを変える前の回答には内訳が無い。
   * **落ちずに描画できること**が条件（tasks/E1 の注意）
   */
  it.each([
    ["内訳が無い", null],
    ["内訳の形が違う", { core: { verdict: "full" } }],
  ])("I-878 %s 古い回答でも落ちない", async (_label, axes) => {
    setup({ resultAttempt: { ...REVIEW_ATTEMPT, axes } });
    expect(await outcome(() => ReviewPage(params(String(UNLOCKED_ID))))).toBe(
      "RENDERED",
    );
  });
});

// ---------------------------------------------------------------------------
// §10-6 といた問題の一覧
// ---------------------------------------------------------------------------

const SOLVED: AttemptRow[] = [
  { problem_id: UNLOCKED_ID, total_score: 40, created_at: "2026-08-17T01:00:00.000Z" },
  { problem_id: UNLOCKED_ID, total_score: 73, created_at: "2026-08-18T01:00:00.000Z" },
  { problem_id: LOCKED_ID, total_score: 88, created_at: "2026-08-16T01:00:00.000Z" },
];

describe("§10-6 /review", () => {
  it("I-879 未ログインならログイン画面へ送る", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await outcome(() => ReviewIndexPage())).toBe("REDIRECT:/login");
  });

  it("I-880 回答は session、問題は admin で読む", async () => {
    setup({ attempts: SOLVED });
    expect(await outcome(() => ReviewIndexPage())).toBe("RENDERED");

    expect(spy.sessionTables).toEqual(["user_attempts"]);
    expect(spy.sessionSelects[0]).toBe("problem_id, total_score, created_at");
    expect(spy.sessionFilters).toContainEqual(["user_id", USER_ID]);
    // 判定保留（層1のみで採点した回）には内訳が無いので出さない
    expect(spy.sessionFilters).toContainEqual(["is_provisional", false]);
  });

  /**
   * 一覧に模範解答を持ち込まない。
   * 表示に要るのは番号・題名だけで、ここで読むと画面へ渡る経路ができる
   */
  it("I-881 一覧に model_answer / rubric_items を含めない", async () => {
    setup({ attempts: SOLVED });
    await ReviewIndexPage();

    const problemSelects = spy.selects.filter(([table]) => table === "problems");
    expect(problemSelects).toHaveLength(1);
    for (const secret of ["model_answer", "rubric_items", "keywords"]) {
      expect(problemSelects[0][1]).not.toContain(secret);
    }
  });

  it.each([
    ["回答が0件", { attempts: [] }],
    ["回答の取得が null", { attempts: null }],
    ["問題の取得が null", { attempts: SOLVED, problemList: null }],
  ])("I-882 %s でも落ちない", async (_label, patch) => {
    setup(patch);
    expect(await outcome(() => ReviewIndexPage())).toBe("RENDERED");
  });
});
