/**
 * E2E の共通部品。
 *
 *   - スタブサーバーの操作（次に何を返すか / 何回呼ばれたか）
 *   - テスト用の問題データの投入と後始末
 *   - テスト用ユーザーの用意とログイン状態
 *
 * user_attempts を毎回消すのが要点。
 * ステージの解放状態もリザルト画面の表示も過去の回答に依存するので、
 * 前回の実行結果が残っていると「開いているはずのステージが閉じている」形で落ちる。
 */

import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export { expect };

const STUB = process.env.OPENAI_STUB_URL ?? "http://127.0.0.1:4010";

// ---------------------------------------------------------------------------
// スタブサーバーの操作
// ---------------------------------------------------------------------------

export type AxisVerdict = "full" | "partial" | "none";

export type DeepOutput = {
  core: { evidence: string; verdict: AxisVerdict };
  ground: { evidence: string; verdict: AxisVerdict };
  depth: { evidence: string; verdict: AxisVerdict };
  articulation: { evidence: string; verdict: AxisVerdict };
  contradiction: boolean;
  contradiction_evidence: string;
  matched_reject: "none" | "1" | "2" | "3";
  praise: string;
  next_focus: string;
};

/** 引用が回答に実在するかは compose.ts が本当に照合する。ここは実在する文字列を使う */
export const EVIDENCE_REAL = "const 宣言に再代入";
export const EVIDENCE_FAKE = "元の配列を書き換えている";

export function deepOutput(
  verdicts: [AxisVerdict, AxisVerdict, AxisVerdict, AxisVerdict] = [
    "full",
    "full",
    "full",
    "full",
  ],
  opts: Partial<Omit<DeepOutput, "core" | "ground" | "depth" | "articulation">> & {
    evidence?: string;
  } = {},
): DeepOutput {
  const ev = opts.evidence ?? EVIDENCE_REAL;
  const axis = (v: AxisVerdict) => ({ verdict: v, evidence: v === "full" ? ev : "" });
  const [core, ground, depth, articulation] = verdicts;
  return {
    core: axis(core),
    ground: axis(ground),
    depth: axis(depth),
    articulation: axis(articulation),
    contradiction: opts.contradiction ?? false,
    contradiction_evidence: opts.contradiction_evidence ?? "",
    matched_reject: opts.matched_reject ?? "none",
    praise: opts.praise ?? "const の扱いまで読み取れています。",
    next_focus: opts.next_focus ?? "5行目の rate = 0.8 に注目してみてください。",
  };
}

export const stub = {
  /** 状態をまっさらに戻す */
  async reset() {
    await fetch(`${STUB}/__control`, { method: "DELETE" });
  },
  /** 既定で返す採点結果を差し替える */
  async setOutput(output: DeepOutput) {
    await fetch(`${STUB}/__control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ output }),
    });
  },
  /** 1回ずつ消費される応答を積む。失敗の再現や「2回目は違う点数」に使う */
  async enqueue(items: unknown[]) {
    await fetch(`${STUB}/__control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queue: items }),
    });
  },
  /** 応答を遅らせる */
  async setDelay(delayMs: number) {
    await fetch(`${STUB}/__control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delayMs }),
    });
  },
  /** 呼び出し回数と受け取った本文 */
  async inspect(): Promise<{ calls: number; requests: unknown[] }> {
    const res = await fetch(`${STUB}/__control`);
    return res.json() as Promise<{ calls: number; requests: unknown[] }>;
  },
};

// ---------------------------------------------------------------------------
// テストデータ
// ---------------------------------------------------------------------------

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL ?? "e2e@ferret.test",
  password: process.env.E2E_USER_PASSWORD ?? "FerretE2E2026!",
};

/** 採点対象の回答。スタブの evidence がこの文字列に実在することが前提 */
export const ANSWER =
  "5行目の const 宣言に再代入しているため TypeError で停止し、console.log は実行されません";

/**
 * E2E 用に投入する問題2件。
 * 1問目が開いていて、2問目は1問目をクリアするまで閉じている、という
 * 解放判定を確かめられる最小の構成。
 */
export const SEED_PROBLEMS = [
  {
    order: 9001,
    title: "E2E ─ const と let",
    language: "js",
    difficulty: 1,
    reading_type: "トレース",
    code: "function applyCoupon(price) {\n  const rate = 0.9;\n  let total = price;\n  total = total * rate;\n  rate = 0.8;\n  return total;\n}",
    context: null,
    prerequisite: null,
    question: "このコードを実行すると何が起きますか。",
    model_answer:
      "5行目で const で宣言された rate に再代入しているため、TypeError が発生して実行が止まります。",
    keywords: [
      { match: ["rate", "const", "定数"] },
      { match: ["エラー", "TypeError", "止ま", "落ち", "例外"] },
      { match: ["再代入", "代入", "0.8"] },
      { match: ["console.log", "出力されない", "表示されない"] },
    ],
    rubric_items: {
      core: "const の rate への再代入でエラーになるという結論を指していれば満たす",
      ground: "5行目の rate = 0.8 が const 宣言への再代入である点に触れていれば満たす",
      depth: "TypeError という具体的なエラー名に触れていれば満たす",
      core_reject: [
        "900 が出力されると読んでいる",
        "let の total への再代入が問題だと読んでいる",
      ],
    },
  },
  {
    order: 9002,
    title: "E2E ─ 参照の共有",
    language: "js",
    difficulty: 2,
    reading_type: "ズレ",
    code: "function addTag(profile, tag) {\n  profile.tags.push(tag);\n  return profile;\n}",
    // 2問目にだけ実行結果と前提知識を入れる。
    // 1問目（どちらも null）と見比べて「入っている問題だけ枠が増える」を確かめられる
    context: "> node addTag.js\n{ userId: 'u-1', tags: [ 'signup', 'newsletter' ] }",
    prerequisite: "push は配列の末尾に要素を足すメソッドです。読み方は「プッシュ」。",
    question: "この関数の呼び出し元にはどんな影響がありますか。",
    model_answer:
      "引数のオブジェクトをそのまま書き換えているため、呼び出し元の profile も変わります。",
    keywords: [
      { match: ["profile", "引数", "オブジェクト"] },
      { match: ["書き換え", "変わる", "破壊"] },
      { match: ["参照", "共有", "同じ"] },
      { match: ["呼び出し元", "外側", "元の"] },
    ],
    rubric_items: {
      core: "呼び出し元のオブジェクトも書き換わるという結論を指していれば満たす",
      ground: "push が引数のオブジェクトを直接変更している点に触れていれば満たす",
      depth: "参照が共有されている点に触れていれば満たす",
      core_reject: [
        "新しい配列を返していると読んでいる",
        "呼び出し元には影響しないと読んでいる",
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Supabase（service_role）
// ---------------------------------------------------------------------------

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "E2E には NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SeededProblem = { id: number; order: number; title: string };

/**
 * `order` を絞り込みに使うときは二重引用符でくくる。
 * PostgREST は `order` を並び替え指定の予約語として扱うため、
 * 素で渡すと `failed to parse order (gte.9000)` になる。
 * エラーを見ないと素通りしたように見え、**テスト用の行が本番テーブルに残る。**
 */
const ORDER_COL = '"order"';

/** テスト用に投入した問題を消す。失敗したら黙って進まない */
async function deleteSeeded(db: SupabaseClient) {
  const { error } = await db.from("problems").delete().gte(ORDER_COL, 9000);
  if (error) {
    throw new Error(
      `テスト用の問題を削除できませんでした（本番テーブルに残ります）: ${error.message}`,
    );
  }
}

/** テスト用の問題を投入する。id は自動採番なので指定しない */
export async function seedProblems(): Promise<SeededProblem[]> {
  const db = admin();
  await deleteSeeded(db);
  const { data, error } = await db
    .from("problems")
    .insert(SEED_PROBLEMS)
    .select("id, order, title");
  if (error) throw new Error(`問題の投入に失敗: ${error.message}`);
  return (data ?? []).sort((a, b) => a.order - b.order);
}

export async function removeProblems() {
  await deleteSeeded(admin());
}

/** テストユーザーを用意する。すでに居ればそのまま使う */
export async function ensureUser(): Promise<string> {
  const db = admin();
  const { data, error } = await db.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });
  if (data?.user) return data.user.id;

  // 既に存在する場合は一覧から引く
  if (error && !/already/i.test(error.message)) {
    throw new Error(`テストユーザーの作成に失敗: ${error.message}`);
  }
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list?.users.find((u) => u.email === TEST_USER.email);
  if (!found) throw new Error("テストユーザーが見つかりません");
  return found.id;
}

/** 回答履歴を消す。ステージの解放状態を初期化するために毎回呼ぶ */
export async function clearAttempts(userId: string) {
  const { error } = await admin().from("user_attempts").delete().eq("user_id", userId);
  if (error) throw new Error(`回答履歴の削除に失敗: ${error.message}`);
}

/** 採点を通さずに入れるクリア済みの回答行。`grader_version` で下ごしらえだと分かるようにしてある */
function clearedRow(
  userId: string,
  problemId: number,
  score: number,
  createdAt?: string,
) {
  return {
    // 既定（now()）に任せず明示できるようにしてある。理由は PREPARED_AT のコメント
    ...(createdAt ? { created_at: createdAt } : {}),
    user_id: userId,
    problem_id: problemId,
    answer: "E2E の下ごしらえ用に投入した回答です",
    keyword_score: 20,
    deep_score: score - 20,
    total_score: score,
    ai_feedback: "下ごしらえ用のフィードバックです。",
    scoring_method: "ai",
    grader_version: "e2e-seed",
    answer_hash: `e2e-seed-${problemId}-${score}`,
    is_provisional: false,
    contradiction: false,
  };
}

/** 特定の問題をクリア済みにする。解放状態を作り込むために使う */
export async function markCleared(userId: string, problemId: number, score = 100) {
  const { error } = await admin()
    .from("user_attempts")
    .insert(clearedRow(userId, problemId, score));
  if (error) throw new Error(`クリア状態の作成に失敗: ${error.message}`);
}

/**
 * シード問題より前にある問題を、テストユーザーのクリア済みにする。
 *
 * シードは `order` 9001 以降に置いてあるので、**実コンテンツが増えるほどマップの末尾に並ぶ。**
 * 解放判定（lib/progress/unlock.ts）は未クリアの先頭までしか開かないため、
 * 先行する問題をクリアしないとシード問題は 404 になる。
 * 問題が0件だった時期はシードが先頭に来ていたので、この下ごしらえは要らなかった。
 */
export async function clearPrecedingStages(userId: string) {
  const db = admin();
  const { data, error } = await db.from("problems").select("id").lt(ORDER_COL, 9000);
  if (error) throw new Error(`先行ステージの取得に失敗: ${error.message}`);

  /**
   * 下ごしらえの行は**24時間より前**に置く。
   *
   * `/api/score` の使いすぎ防止（1分10件 / 1時間60件 / 24時間300件）は
   * `user_attempts` の行数をそのまま数えるので、直前に実問題ぶんの行を入れると
   * **テスト本体の採点が 429 で弾かれる**（実測。問題が増えるほど確実に当たる）。
   *
   * 「手前のステージは以前クリアしてある」という状態のほうが実際の使われ方にも近い。
   * 解放判定（`loadProgress`）は最高点だけを見るので、日付をずらしても結果は変わらない。
   */
  const preparedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const rows = (data ?? []).map((p) => clearedRow(userId, p.id, 100, preparedAt));
  if (rows.length === 0) return;

  // 1件ずつ insert すると、問題が増えるほどテスト1本あたりの待ち時間が伸びる
  // （100問まで増える予定なので、往復回数を問題数に比例させない）
  const { error: insertError } = await db.from("user_attempts").insert(rows);
  if (insertError) {
    throw new Error(`先行ステージのクリアに失敗: ${insertError.message}`);
  }
}

export async function latestAttempt(userId: string, problemId: number) {
  const { data } = await admin()
    .from("user_attempts")
    .select("total_score, keyword_score, deep_score, ai_feedback, contradiction, usage")
    .eq("user_id", userId)
    .eq("problem_id", problemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function countAttempts(userId: string, problemId: number) {
  const { count } = await admin()
    .from("user_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("problem_id", problemId);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// ログイン
// ---------------------------------------------------------------------------

/**
 * すでに開いているログイン画面のフォームを埋めて送る。
 *
 * `login()` と分けてあるのは、`/login?next=...` へ**弾かれて来た**状態から
 * そのまま送信するテスト（E-103・E-104・E-413・E-414）があるため。
 * ここで `goto` すると `next` が消えて、確かめたい復帰そのものが消える。
 *
 * 入力欄は placeholder ではなく見出し（label）で引く。
 * デザイン移植で placeholder が「メールアドレス」→「you@example.com」に変わり、
 * ここが追従できずに**ログイン自体が通らなくなっていた**（E2E 全体が落ちる原因）。
 * 見出しの文言のほうが変わりにくいので、そちらに寄せる。
 */
export async function submitLoginForm(
  page: Page,
  { email = TEST_USER.email, password = TEST_USER.password } = {},
) {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
}

export async function login(page: Page, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await submitLoginForm(page);
}

// ---------------------------------------------------------------------------
// 画面から状態を読む
// ---------------------------------------------------------------------------

/**
 * ステージ選択マップのノード1つ。「STAGE {order}」のラベルを持つ枠で引く。
 *
 * 完全一致の正規表現にしているのは、`STAGE 1` が `STAGE 15` にも当たってしまうため。
 */
export function stageNode(page: Page, order: number) {
  return page.locator("main section > div", {
    has: page.getByText(new RegExp(`^STAGE ${order}$`)),
  });
}

export type StageState = "cleared" | "current" | "locked";

/**
 * ノードの状態を画面から読む。
 *
 * 絵文字（✅🐾🔒）だった頃は文字として数えられたが、デザイン移植で SVG アイコンに
 * 変わり、**アイコンには読み上げ用の名前が付いていない**ので文字では引けない。
 * 代わりに、状態によって変わる**振る舞い**で判定する。
 *   - locked  … ボタンが押せない（`disabled`）
 *   - current … 「スタート」の吹き出しが出ている
 *   - cleared … 押せるが現在地ではない
 *
 * `cleared` は残りとして求めているので、単体では弱い。「1つ前がクリア扱いになったか」を
 * 見たいときは、**次のノードが current になること**と対で確かめること（そちらは強い）。
 */
export async function stageState(page: Page, order: number): Promise<StageState> {
  const node = stageNode(page, order);
  await expect(node).toHaveCount(1);
  if (await node.locator("button").first().isDisabled()) return "locked";
  return (await node.getByText("スタート").count()) > 0 ? "current" : "cleared";
}

/**
 * リザルトの統計チップ（スコア / キーワード / AI 採点）を見出しから枠ごと引く。
 * 見出しの span の親が枠なので、そこまで1つ上がる。
 */
export function statChip(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=..");
}

// ---------------------------------------------------------------------------
// テスト本体で使う拡張フィクスチャ
// ---------------------------------------------------------------------------

type Fixtures = {
  /** テスト用ユーザーの id。回答履歴は毎テスト前に空にしてある */
  userId: string;
  /** 投入済みの問題（order 昇順） */
  problems: SeededProblem[];
  /** ログイン済みのページ */
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  userId: async ({}, use) => {
    const id = await ensureUser();
    await clearAttempts(id);
    await use(id);
    await clearAttempts(id);
  },

  problems: async ({ userId }, use) => {
    const seeded = await seedProblems();
    // シードは実コンテンツの後ろ（order 9000番台）に並ぶので、手前のステージを
    // クリア済みにしないと解放判定が届かず、1問目からして 404 になる。
    // 問題が0件だった時期はシードが先頭に来ていたので要らなかった下ごしらえで、
    // コンテンツが増えたことで必要になった（E4 の申し送り）。
    //
    // **マップの見え方が変わる。** 実問題は全部クリア済みとして描かれるので、
    // ノードの個数を数えるテストは書けない。個々のノードを見ること（stageState）
    await clearPrecedingStages(userId);
    await use(seeded);
    await removeProblems();
  },

  authedPage: async ({ page, userId }, use) => {
    void userId; // 履歴の初期化を先に走らせる
    await stub.reset();
    await login(page);
    await page.waitForURL("**/stages");
    await use(page);
  },
});
