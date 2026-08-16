/**
 * 結合テストの共通ヘルパー。
 *
 * Supabase クライアントのモックは1箇所にまとめてある。
 * /api/score だけでクエリが5パターン
 * （レート制限のカウント・解放判定の problems 一覧・解放判定の回答履歴・
 * 　問題の単発取得・リプレイ検索）＋ insert あるので、
 * テストごとに書くと必ずズレる。
 *
 * ※ このファイルは *.test.ts ではないので Vitest には収集されない。
 */

import { vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// 状態とスパイ
// ---------------------------------------------------------------------------

export type ProblemListRow = { id: number; order: number; title: string };
export type AttemptRow = { problem_id: number; total_score: number };

export type DbState = {
  /** レート制限のカウントが返す行（created_at の ISO 文字列） */
  rateRows: { created_at: string }[];
  /** レート制限のカウントが失敗したときのエラー */
  rateError: { message: string } | null;
  /** 解放判定に使う problems 一覧 */
  problemList: ProblemListRow[] | null;
  /** 解放判定に使う回答履歴（session クライアント経由） */
  attempts: AttemptRow[] | null;
  /** 採点に使う問題の詳細。null なら 404 */
  problemDetail: Record<string, unknown> | null;
  /** リプレイ検索が返す行。null なら新規採点 */
  replay: Record<string, unknown> | null;
  /** insert が返すエラー。null なら成功 */
  insertError: { message: string } | null;
};

export type DbSpy = {
  /** insert された行 */
  inserted: Record<string, unknown>[];
  /** admin 側の [テーブル, 列] */
  selects: Array<[string, string]>;
  /** admin 側の [テーブル, 列名, 値] */
  filters: Array<[string, string, unknown]>;
  /** session 側で読んだテーブル */
  sessionTables: string[];
  /** session 側の [列名, 値] */
  sessionFilters: Array<[string, unknown]>;
};

export function emptySpy(): DbSpy {
  return {
    inserted: [],
    selects: [],
    filters: [],
    sessionTables: [],
    sessionFilters: [],
  };
}

/**
 * Supabase のクエリビルダを模した鎖。
 * eq / gte / order / limit は自分を返し、single / maybeSingle / await で結果を返す。
 * これ1つで5パターンすべてのクエリを賄える。
 */
function makeChain(result: unknown, onFilter: (column: string, value: unknown) => void) {
  const chain = {
    eq(column: string, value: unknown) {
      onFilter(column, value);
      return chain;
    },
    gte(column: string, value: unknown) {
      onFilter(column, value);
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

/** service_role クライアント。problems と user_attempts の両方を読む */
function makeAdmin(state: DbState, spy: DbSpy) {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          spy.selects.push([table, columns]);

          let result: unknown;
          if (table === "problems") {
            // 採点用の詳細取得か、解放判定用の一覧か
            result = columns.includes("model_answer")
              ? { data: state.problemDetail, error: null }
              : { data: state.problemList, error: null };
          } else if (columns === "created_at") {
            result = { data: state.rateRows, error: state.rateError };
          } else {
            result = { data: state.replay, error: null };
          }

          return makeChain(result, (column, value) =>
            spy.filters.push([table, column, value]),
          );
        },
        insert(row: Record<string, unknown>) {
          spy.inserted.push(row);
          return Promise.resolve({ error: state.insertError });
        },
      };
    },
  };
}

/** ログイン中ユーザーのクライアント。回答履歴は RLS で自分の行だけに絞られる */
function makeSession(
  state: DbState,
  spy: DbSpy,
  getUser: () => Promise<{ data: { user: { id: string } | null } }>,
) {
  return {
    auth: { getUser },
    from(table: string) {
      spy.sessionTables.push(table);
      return {
        select: () =>
          makeChain({ data: state.attempts, error: null }, (column, value) =>
            spy.sessionFilters.push([column, value]),
          ),
      };
    },
  };
}

export function makeClients(
  state: DbState,
  getUser: () => Promise<{ data: { user: { id: string } | null } }>,
) {
  const spy = emptySpy();
  return { admin: makeAdmin(state, spy), session: makeSession(state, spy, getUser), spy };
}

// ---------------------------------------------------------------------------
// 固定データ
// ---------------------------------------------------------------------------

export const USER_ID = "11111111-1111-1111-1111-111111111111";

/** 採点対象の回答。引用照合を通す evidence はこの文字列の一部にすること */
export const ANSWER =
  "5行目の const 宣言に再代入しているため TypeError で停止し、console.log は実行されません";

export const EVIDENCE_REAL = "const 宣言に再代入";
export const EVIDENCE_FAKE = "元の配列を書き換えている";

/** 解放判定に使う一覧。id=5 が第1ステージ（開いている）、id=6 は次（閉じている） */
export const PROBLEM_LIST: ProblemListRow[] = [
  { id: 5, order: 1, title: "const と let ─ 再代入できる箱・できない箱" },
  { id: 6, order: 2, title: "参照が共有されたまま渡される関数" },
];

export const UNLOCKED_ID = 5;
export const LOCKED_ID = 6;

export const PROBLEM_DETAIL = {
  id: 5,
  code: "const rate = 0.9;\nrate = 0.8;",
  question: "このコードを実行すると何が起きますか。",
  model_answer: "const の rate に再代入しているため TypeError で止まります。",
  reading_type: "トレース",
  rubric_items: {
    core: "const の rate への再代入でエラーになるという結論を指していれば満たす",
    ground: "rate = 0.8 が const 宣言への再代入である点に触れていれば満たす",
    depth: "TypeError という具体的なエラー名に触れていれば満たす",
    core_reject: ["900 が出力されると読んでいる", "let の total が問題だと読んでいる"],
  },
  keywords: [
    { match: ["5行目"] },
    { match: ["const"] },
    { match: ["再代入"] },
    { match: ["TypeError"] },
  ],
};

export function defaultState(patch: Partial<DbState> = {}): DbState {
  return {
    rateRows: [],
    rateError: null,
    problemList: PROBLEM_LIST,
    attempts: [],
    problemDetail: PROBLEM_DETAIL,
    replay: null,
    insertError: null,
    ...patch,
  };
}

/** n 件の「直近の採点」を作る。レート制限に当てるために使う */
export function recentAttempts(n: number, agoMs = 1_000): { created_at: string }[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    created_at: new Date(now - agoMs - i).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// OpenAI のモック用レスポンス
// ---------------------------------------------------------------------------

export type Verdict = "full" | "partial" | "none";
export type Verdicts = [Verdict, Verdict, Verdict, Verdict];

export function deepOutput(
  verdicts: Verdicts = ["full", "full", "full", "full"],
  opts: {
    evidence?: string;
    contradiction?: boolean;
    contradictionEvidence?: string;
    praise?: string;
    next_focus?: string;
  } = {},
) {
  const ev = opts.evidence ?? EVIDENCE_REAL;
  const axis = (v: Verdict) => ({ verdict: v, evidence: v === "full" ? ev : "" });
  const [core, ground, depth, articulation] = verdicts;
  return {
    core: axis(core),
    ground: axis(ground),
    depth: axis(depth),
    articulation: axis(articulation),
    contradiction: opts.contradiction ?? false,
    contradiction_evidence: opts.contradictionEvidence ?? "",
    praise: opts.praise ?? "const の扱いまで読み取れています。",
    next_focus: opts.next_focus ?? "5行目の rate = 0.8 に注目してみてください。",
  };
}

export function openAiOk(out = deepOutput()) {
  return {
    choices: [
      {
        message: { content: JSON.stringify(out), refusal: null },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1650,
      prompt_tokens_details: { cached_tokens: 1600 },
      completion_tokens: 120,
    },
    system_fingerprint: "fp_test",
  };
}

// ---------------------------------------------------------------------------
// リクエスト組み立て
// ---------------------------------------------------------------------------

export function scoreRequest(
  body: unknown,
  init: { headers?: Record<string, string>; raw?: string } = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/score", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...(init.headers ?? {}),
    },
    body: init.raw ?? JSON.stringify(body),
  });
}

/** console.error / console.warn を黙らせる。戻り値で呼び出し内容を確認できる */
export function silenceConsole() {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  return { error, warn };
}
