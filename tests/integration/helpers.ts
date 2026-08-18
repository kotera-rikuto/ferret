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
  /** リザルト画面が読む最新の回答。null なら未回答 */
  resultAttempt: Record<string, unknown> | null;
  /** 採点に使う問題の詳細。null なら 404 */
  problemDetail: Record<string, unknown> | null;
  /** リプレイ検索が返す行。null なら新規採点 */
  replay: Record<string, unknown> | null;
  /** insert が返すエラー。null なら成功 */
  insertError: { message: string } | null;
  /** upsert が返すエラー。null なら成功 */
  upsertError: { message: string } | null;
  /**
   * delete が返すエラーを**テーブル単位**で置く（退会の削除で使う）。
   * 途中の1テーブルだけ失敗させて「その先へ進まないこと」を見るため、
   * 単一のフラグにはしていない。
   */
  deleteErrors: Record<string, { message: string }>;
  /** auth.admin.deleteUser が返すエラー。null なら成功 */
  authDeleteError: { message: string } | null;
};

export type DbSpy = {
  /** insert された行 */
  inserted: Record<string, unknown>[];
  /** upsert された [行, オプション] */
  upserted: Array<[Record<string, unknown>, unknown]>;
  /** admin 側の [テーブル, 列] */
  selects: Array<[string, string]>;
  /** admin 側の [テーブル, 列名, 値] */
  filters: Array<[string, string, unknown]>;
  /** session 側で読んだテーブル */
  sessionTables: string[];
  /** session 側の [列名, 値] */
  sessionFilters: Array<[string, unknown]>;
  /** session 側の select 列 */
  sessionSelects: string[];
  /** order() に渡された [列名, オプション] */
  orders: Array<[string, unknown]>;
  /** limit() に渡された件数 */
  limits: number[];
  /** delete された [テーブル, 列名, 値]。**呼ばれた順に入る**（退会の削除順を見る） */
  deleted: Array<[string, string, unknown]>;
  /** auth.admin.deleteUser に渡された user_id */
  authDeleted: string[];
  /** session 側の signOut に渡されたオプション */
  signOuts: unknown[];
};

export function emptySpy(): DbSpy {
  return {
    inserted: [],
    upserted: [],
    selects: [],
    filters: [],
    sessionTables: [],
    sessionFilters: [],
    sessionSelects: [],
    orders: [],
    limits: [],
    deleted: [],
    authDeleted: [],
    signOuts: [],
  };
}

/**
 * Supabase のクエリビルダを模した鎖。
 * eq / gte / order / limit は自分を返し、single / maybeSingle / await で結果を返す。
 * これ1つで5パターンすべてのクエリを賄える。
 */
function makeChain(
  result: unknown,
  onFilter: (column: string, value: unknown) => void,
  spy?: DbSpy,
) {
  const chain = {
    eq(column: string, value: unknown) {
      onFilter(column, value);
      return chain;
    },
    gte(column: string, value: unknown) {
      onFilter(column, value);
      return chain;
    },
    order(column: string, options?: unknown) {
      spy?.orders.push([column, options]);
      return chain;
    },
    limit(count: number) {
      spy?.limits.push(count);
      return chain;
    },
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
            // 解放判定の一覧（loadProgress）だけがこの列で引く。
            // 採点用の詳細（model_answer 入り）と画面用の詳細（code 入り）は
            // どちらも「1件取得」なので、一覧かどうかで振り分ける
            result =
              columns === "id, order, title"
                ? { data: state.problemList, error: null }
                : { data: state.problemDetail, error: null };
          } else if (columns === "created_at") {
            result = { data: state.rateRows, error: state.rateError };
          } else {
            result = { data: state.replay, error: null };
          }

          return makeChain(
            result,
            (column, value) => spy.filters.push([table, column, value]),
            spy,
          );
        },
        insert(row: Record<string, unknown>) {
          spy.inserted.push(row);
          return Promise.resolve({ error: state.insertError });
        },
        upsert(row: Record<string, unknown>, options?: unknown) {
          spy.upserted.push([row, options]);
          return Promise.resolve({ error: state.upsertError });
        },
        /**
         * 退会の削除。`.delete().eq(列, 値)` の形しか使わないので鎖は最小限。
         * **どのテーブルを何番目に消したか**を spy.deleted の並びで見る
         */
        delete() {
          return {
            eq(column: string, value: unknown) {
              spy.deleted.push([table, column, value]);
              return Promise.resolve({ error: state.deleteErrors[table] ?? null });
            },
          };
        },
      };
    },
    // 退会でアカウント本体を消す口。service_role でしか呼べない
    auth: {
      admin: {
        deleteUser(userId: string) {
          spy.authDeleted.push(userId);
          return Promise.resolve({ data: null, error: state.authDeleteError });
        },
      },
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
    auth: {
      getUser,
      // 退会の最後に Cookie を落とすために呼ばれる。
      // scope が渡っているか（通信せず手元だけ消しているか）を spy で見る
      signOut(options?: unknown) {
        spy.signOuts.push(options);
        return Promise.resolve({ error: null });
      },
    },
    from(table: string) {
      spy.sessionTables.push(table);
      return {
        select(columns: string) {
          spy.sessionSelects.push(columns);
          // 解放判定（problem_id を引く）とリザルト画面（点数を引く）で
          // 同じ user_attempts を別の形で読むので、列で振り分ける
          const result = columns.includes("problem_id")
            ? { data: state.attempts, error: null }
            : { data: state.resultAttempt, error: null };
          return makeChain(
            result,
            (column, value) => spy.sessionFilters.push([column, value]),
            spy,
          );
        },
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
    resultAttempt: null,
    problemDetail: PROBLEM_DETAIL,
    replay: null,
    insertError: null,
    upsertError: null,
    deleteErrors: {},
    authDeleteError: null,
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
    matched_reject?: "none" | "1" | "2" | "3";
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
    matched_reject: opts.matched_reject ?? "none",
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
