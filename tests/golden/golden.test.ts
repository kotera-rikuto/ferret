/**
 * ゴールデンセット ── 採点のブレを実測する（`tasks/B1`）。
 *
 * **`npm test` では走らない。** 専用コマンドで手で流す:
 *
 *   npm run golden
 *
 * 通常のテスト設定（`vitest.config.mts`）の include に入れていないのは実費のため。
 * 1周で OpenAI に約90回リクエストする（約¥4・数分）。普段のテストに課金と
 * 待ち時間を持ち込まないよう、専用の設定（`vitest.golden.mts`）に分けてある。
 *
 * ## ここが測っているもの
 *
 * 採点の指示文や配点を触ったときに、**判定がどう動いたかを数字で比べるための土台。**
 * 同じ50件の回答を毎回同じ条件で通すので、前回との差がそのまま変更の影響になる。
 *
 * ## 採点APIではなく採点関数を直接呼んでいる理由（2026-08-17 オーナー判断）
 *
 * `POST /api/score` には**同じ回答を再送すると前の結果をそのまま返す仕組み**があり、
 * それを通すとブレそのものが測れない（毎回同じ点が返る）。加えて回数制限
 * （1分10件）に当たるため50件流すのに1時間近くかかる。
 * `scoreAnswer` を直接呼べばどちらも回避でき、毎回本当に採点される。
 *
 * その代わり、ルート側の入口処理（文字数・個人情報・CSRF の検査）は通らない。
 * **ここで測れるのは「採点そのもの」に限られる。**
 *
 * ## 触ってはいけないもの
 *
 * B1 は**測るだけ**のタスク。`lib/ai/` は1行も変えない。
 * 数字を見て採点基準を直すのは B3（`tasks/B3-判定基準の調整.md`）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  CLEAR_THRESHOLD,
  PERFECT_THRESHOLD,
  type AxisName,
  type KeywordSlot,
  type Verdict,
} from "@/lib/ai/compose";
import { GRADER_VERSION, scoreAnswer, type ScoringInput } from "@/lib/ai/scorer";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const CASES_URL = new URL("./cases.json", import.meta.url);
const RESULTS_DIR = new URL("./results/", import.meta.url);

/** 実測1回あたりの原価（円）。残課題 §0 の実測値 */
const YEN_PER_CALL = 0.04;

/** 閾値付近の何件を繰り返し採点するか（フリップ率の測定対象） */
const FLIP_CASES = Number(process.env.GOLDEN_FLIP_CASES ?? 10);

/** その何回ぶんを測るか。1周目を含む回数 */
const FLIP_RUNS = Number(process.env.GOLDEN_FLIP_RUNS ?? 5);

/**
 * 同時に走らせる採点の数。
 *
 * 直列だと90回で4分以上かかる。採点は1件ずつ独立しているので同時に流しても
 * 結果は変わらない（`temperature: 0`・`seed` は問題ごとに固定）。
 * OpenAI 側のレート制限に当てないよう控えめにしておく。
 */
const CONCURRENCY = Number(process.env.GOLDEN_CONCURRENCY ?? 4);

/**
 * 件を絞って流す（例: `GOLDEN_ONLY=G01,G05 npm run golden`）。
 *
 * 配線の確認や、B3 で1件だけ試したいときに使う。**絞ったときの数字は測定結果ではない。**
 * 取り違えないよう、出力の先頭に警告を出す。
 */
const ONLY = (process.env.GOLDEN_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// ゴールデンセットの読み込み
// ---------------------------------------------------------------------------

const CATEGORIES = ["clear", "fail", "inverted", "short_correct"] as const;
type Category = (typeof CATEGORIES)[number];

type GoldenCase = {
  id: string;
  /** problems.order。id は自動採番で環境ごとに変わるため order で指定する */
  order: number;
  category: Category;
  /** 箇条書き形式の回答か（残課題 §12 の誤爆観測用） */
  bullet: boolean;
  /** 数値・短い識別子だけが誤っている反転誤答か（同 §11 の経路） */
  numeric_only: boolean;
  answer: string;
  note: string;
};

/** そのカテゴリはクリアするべきか */
function shouldClear(category: Category): boolean {
  return category === "clear" || category === "short_correct";
}

/**
 * 回答文の一覧は git 管理外。**既定値で埋めずにここで止める。**
 * 40件しか読めていないのに測定が成立したように見えるのが一番まずい壊れ方なので、
 * 件数と項目をすべて検証する。
 */
function loadCases(): GoldenCase[] {
  if (!existsSync(CASES_URL)) {
    throw new Error(
      "tests/golden/cases.json が見つかりません。" +
        "回答文は模範解答を含むため git 管理外です（.gitignore 参照）。" +
        "別の環境から持ってくるか、tasks/B1-採点のブレを測る.md の内訳に沿って作り直してください。",
    );
  }

  const raw: unknown = JSON.parse(readFileSync(CASES_URL, "utf8"));
  if (typeof raw !== "object" || raw === null || !("cases" in raw)) {
    throw new Error("cases.json に cases 配列がありません");
  }
  const list = (raw as { cases: unknown }).cases;
  if (!Array.isArray(list)) throw new Error("cases が配列ではありません");

  const seen = new Set<string>();
  return list.map((c, i) => {
    const at = `cases[${i}]`;
    if (typeof c !== "object" || c === null) throw new Error(`${at} がオブジェクトではありません`);
    const v = c as Record<string, unknown>;

    if (typeof v.id !== "string" || !v.id) throw new Error(`${at}.id が不正です`);
    if (seen.has(v.id)) throw new Error(`${at}.id が重複しています: ${v.id}`);
    seen.add(v.id);
    if (typeof v.order !== "number" || !Number.isInteger(v.order)) {
      throw new Error(`${v.id}.order が整数ではありません`);
    }
    if (typeof v.category !== "string" || !CATEGORIES.includes(v.category as Category)) {
      throw new Error(`${v.id}.category が不正です: ${String(v.category)}`);
    }
    if (typeof v.answer !== "string" || v.answer.trim().length < 10) {
      throw new Error(`${v.id}.answer が短すぎます（採点APIの下限は10字）`);
    }
    if (typeof v.bullet !== "boolean") throw new Error(`${v.id}.bullet が真偽値ではありません`);
    if (typeof v.numeric_only !== "boolean") {
      throw new Error(`${v.id}.numeric_only が真偽値ではありません`);
    }

    return {
      id: v.id,
      order: v.order,
      category: v.category as Category,
      bullet: v.bullet,
      numeric_only: v.numeric_only,
      answer: v.answer,
      note: typeof v.note === "string" ? v.note : "",
    };
  });
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

type Run = {
  case_id: string;
  round: number;
  ok: boolean;
  error?: string;
  total: number;
  keyword_score: number;
  deep_score: number;
  cleared: boolean;
  perfect: boolean;
  contradiction: boolean;
  evidence_capped: boolean;
  fabrication_suspected: boolean;
  demoted_count: number;
  verdicts: Partial<Record<AxisName, Verdict>>;
  matched_reject: string;
  feedback: string;
  feedback_source: string;
  prompt_tokens: number | null;
  cached_tokens: number | null;
  completion_tokens: number | null;
};

async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${((n / d) * 100).toFixed(0)}% (${n}/${d})`;
}

// ---------------------------------------------------------------------------

const allCases = loadCases();
const cases = ONLY.length ? allCases.filter((c) => ONLY.includes(c.id)) : allCases;
const runs: Run[] = [];
/** 何件を繰り返し測ったか（フリップ率の対象。1周目の点が閾値に近い順） */
let flipTargets: string[] = [];
const report: string[] = [];

function say(line = "") {
  report.push(line);
  console.log(line);
}

beforeAll(async () => {
  loadEnv({ path: ".env.local", quiet: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(".env.local に Supabase の URL / service_role キーが揃っていません");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(".env.local に OPENAI_API_KEY がありません");
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  // 列は `app/api/score/route.ts` と同じものだけを取る。**context（実行結果）は取らない。**
  // 本番の採点器は context をモデルに渡していない（渡しているのは問題画面だけ）。
  // ここで足すと、本番より材料の多い条件で測ることになり数字が比較できなくなる。
  const { data: problems, error } = await admin
    .from("problems")
    .select("id, order, code, question, model_answer, reading_type, rubric_items, keywords")
    .order("order");
  if (error) throw new Error(`problems の取得に失敗: ${error.message}`);

  const byOrder = new Map<number, ScoringInput>();
  for (const p of problems ?? []) {
    byOrder.set(p.order as number, {
      id: p.id as number,
      code: p.code as string,
      question: p.question as string,
      model_answer: p.model_answer as string,
      reading_type: p.reading_type as string,
      rubric_items: p.rubric_items as ScoringInput["rubric_items"],
      keywords: p.keywords as KeywordSlot[],
    });
  }

  const missing = [...new Set(cases.map((c) => c.order))].filter((o) => !byOrder.has(o));
  if (missing.length) {
    throw new Error(`ゴールデンセットが参照している問題が DB にありません: order ${missing.join(", ")}`);
  }

  const flipCount = Math.min(FLIP_CASES, cases.length);
  const plannedCalls = cases.length + flipCount * (FLIP_RUNS - 1);
  say("=".repeat(78));
  if (ONLY.length) {
    say(`⚠️ GOLDEN_ONLY で ${cases.length}/${allCases.length}件に絞っています。**これは測定結果ではありません**`);
  }
  say(`ゴールデンセット ${cases.length}件 / 採点器 ${GRADER_VERSION}`);
  say(
    `予定リクエスト数 ${plannedCalls}回（1周 ${cases.length} + 閾値付近 ${flipCount}件 × 追加 ${FLIP_RUNS - 1}回）` +
      ` / 概算 ¥${(plannedCalls * YEN_PER_CALL).toFixed(1)}`,
  );
  say("=".repeat(78));

  const score = async (c: GoldenCase, round: number): Promise<Run> => {
    const problem = byOrder.get(c.order)!;
    const base = {
      case_id: c.id,
      round,
      verdicts: {} as Partial<Record<AxisName, Verdict>>,
    };
    try {
      const r = await scoreAnswer(c.answer, problem);
      const verdicts: Partial<Record<AxisName, Verdict>> = {};
      for (const a of r.axes) verdicts[a.axis] = a.verdict;
      return {
        ...base,
        ok: true,
        total: r.total,
        keyword_score: r.keywordScore,
        deep_score: r.deepScore,
        cleared: r.cleared,
        perfect: r.perfect,
        contradiction: r.contradiction,
        evidence_capped: r.evidenceCapped,
        fabrication_suspected: r.fabricationSuspected,
        demoted_count: r.axes.filter((a) => a.demoted).length,
        verdicts,
        matched_reject: r.matched_reject,
        feedback: r.ai_feedback,
        feedback_source: r.usage.feedback_source,
        prompt_tokens: r.usage.prompt_tokens,
        cached_tokens: r.usage.cached_tokens,
        completion_tokens: r.usage.completion_tokens,
      };
    } catch (e) {
      // 1件の失敗で90回ぶんを捨てない。落ちた件だけ記録して集計から外す
      console.error(`[golden] ${c.id} round${round} 採点不成立:`, e);
      return {
        ...base,
        ok: false,
        error: String(e),
        total: -1,
        keyword_score: -1,
        deep_score: -1,
        cleared: false,
        perfect: false,
        contradiction: false,
        evidence_capped: false,
        fabrication_suspected: false,
        demoted_count: 0,
        matched_reject: "",
        feedback: "",
        feedback_source: "",
        prompt_tokens: null,
        cached_tokens: null,
        completion_tokens: null,
      };
    }
  };

  // 1周目 ── 全件
  const round1 = await mapLimited(cases, CONCURRENCY, (c) => score(c, 1));
  runs.push(...round1);
  say(`1周目 完了（${round1.filter((r) => r.ok).length}/${round1.length} 成功）`);

  // 2周目以降 ── 閾値をまたぎそうな件だけ繰り返す。
  // 全件を5回流すと¥10かかる。ブレが合否を変えるのは閾値付近だけなので、そこに寄せる
  flipTargets = round1
    .filter((r) => r.ok)
    .map((r) => ({ id: r.case_id, d: Math.abs(r.total - CLEAR_THRESHOLD) }))
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
    .slice(0, flipCount)
    .map((r) => r.id);

  const byId = new Map(cases.map((c) => [c.id, c]));
  const repeats: { c: GoldenCase; round: number }[] = [];
  for (let round = 2; round <= FLIP_RUNS; round++) {
    for (const id of flipTargets) repeats.push({ c: byId.get(id)!, round });
  }
  const extra = await mapLimited(repeats, CONCURRENCY, (r) => score(r.c, r.round));
  runs.push(...extra);
  say(`繰り返し 完了（${extra.filter((r) => r.ok).length}/${extra.length} 成功）`);
  say();
}, 45 * 60_000);

// ---------------------------------------------------------------------------
// 集計と記録
// ---------------------------------------------------------------------------

describe("ゴールデンセット", () => {
  it("B1-000 測定結果を出力する", () => {
    const ok = runs.filter((r) => r.ok);
    const first = new Map(runs.filter((r) => r.round === 1 && r.ok).map((r) => [r.case_id, r]));
    const byId = new Map(cases.map((c) => [c.id, c]));

    const rows = cases
      .map((c) => ({ c, r: first.get(c.id) }))
      .filter((x): x is { c: GoldenCase; r: Run } => Boolean(x.r));

    // --- 1周目の全件表 ---
    say("## 1周目の結果（全件）");
    say();
    say("| 件 | order | 区分 | 合計 | 層1 | 層2 | 判定 | 想定 | core | ground | depth | artic | 矛盾 | 格下げ | reject |");
    say("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const { c, r } of rows) {
      const want = shouldClear(c.category);
      const hit = r.cleared === want ? "✓" : "✗";
      say(
        `| ${c.id} | ${c.order} | ${c.category} | ${r.total} | ${r.keyword_score} | ${r.deep_score} ` +
          `| ${r.cleared ? "クリア" : "不合格"}${r.perfect ? "(P)" : ""} | ${want ? "クリア" : "不合格"} ${hit} ` +
          `| ${r.verdicts.core ?? "-"} | ${r.verdicts.ground ?? "-"} | ${r.verdicts.depth ?? "-"} | ${r.verdicts.articulation ?? "-"} ` +
          `| ${r.contradiction ? "○" : ""} | ${r.demoted_count || ""} | ${r.matched_reject} |`,
      );
    }
    say();

    // --- 区分ごと ---
    const group = (cat: Category) => rows.filter((x) => x.c.category === cat);
    say("## 区分ごとの一致");
    say();
    say("| 区分 | 件数 | 想定どおり | 合格ライン |");
    say("|---|---|---|---|");
    for (const cat of CATEGORIES) {
      const g = group(cat);
      const good = g.filter((x) => x.r.cleared === shouldClear(x.c.category)).length;
      const line =
        cat === "inverted" ? "誤合格率 0%" : cat === "short_correct" ? "クリア率 100%" : "—";
      say(`| ${cat} | ${g.length} | ${pct(good, g.length)} | ${line} |`);
    }
    say();

    const inverted = group("inverted");
    const shortOk = group("short_correct");
    const allCleared = rows.filter((x) => x.r.cleared).length;

    say("## 出す数字");
    say();
    say(`- 反転誤答の**誤合格率**: ${pct(inverted.filter((x) => x.r.cleared).length, inverted.length)} … 目標 0%`);
    say(`- 短いが正しい回答の**合格率**: ${pct(shortOk.filter((x) => x.r.cleared).length, shortOk.length)} … 目標 100%`);
    say(`- 想定との一致率（全${rows.length}件）: ${pct(rows.filter((x) => x.r.cleared === shouldClear(x.c.category)).length, rows.length)}`);
    say(
      `- このセットの合格率: ${pct(allCleared, rows.length)}` +
        `（**構成上の期待値は50%。** クリア想定15 + 短い正答10 = 25件。` +
        `残課題 §8 の「クリア率 60〜70%」は実利用者の話で、半分を誤答で固めたこのセットには当てはまらない）`,
    );
    say(`- パーフェクト帯（${PERFECT_THRESHOLD}点以上）: ${pct(rows.filter((x) => x.r.perfect).length, rows.length)}`);
    say();

    // --- 想定と外れた件（B3 が最初に見る場所）---
    const missed = rows.filter((x) => x.r.cleared !== shouldClear(x.c.category));
    say("## 想定と外れた件");
    say();
    if (!missed.length) {
      say("なし。");
    } else {
      say("| 件 | order | 区分 | 点 | 想定 | core | ground | depth | artic | 用意した意図 |");
      say("|---|---|---|---|---|---|---|---|---|---|");
      for (const { c, r } of missed) {
        say(
          `| ${c.id} | ${c.order} | ${c.category} | ${r.total} | ${shouldClear(c.category) ? "クリア" : "不合格"} ` +
            `| ${r.verdicts.core ?? "-"} | ${r.verdicts.ground ?? "-"} | ${r.verdicts.depth ?? "-"} ` +
            `| ${r.verdicts.articulation ?? "-"} | ${c.note} |`,
        );
      }
    }
    say();

    // --- フリップ率 ---
    say(`## 同一回答を${FLIP_RUNS}回採点したときのブレ（閾値${CLEAR_THRESHOLD}に近い${flipTargets.length}件）`);
    say();
    say("| 件 | 区分 | 点数 | 最小 | 最大 | 幅 | 合否 | 入れ替わり |");
    say("|---|---|---|---|---|---|---|---|");
    let flipped = 0;
    for (const id of flipTargets) {
      const rs = ok.filter((r) => r.case_id === id).sort((a, b) => a.round - b.round);
      const totals = rs.map((r) => r.total);
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      const cs = rs.map((r) => r.cleared);
      const flip = cs.includes(true) && cs.includes(false);
      if (flip) flipped++;
      say(
        `| ${id} | ${byId.get(id)?.category ?? ""} | ${totals.join(" / ")} | ${min} | ${max} | ${max - min} ` +
          `| ${cs.map((c) => (c ? "○" : "×")).join("")} | ${flip ? "**あり**" : "なし"} |`,
      );
    }
    say();
    say(`- **合否が入れ替わった率**: ${pct(flipped, flipTargets.length)}`);
    const spreads = flipTargets.map((id) => {
      const t = ok.filter((r) => r.case_id === id).map((r) => r.total);
      return Math.max(...t) - Math.min(...t);
    });
    if (spreads.length) {
      say(`- 点数の振れ幅: 最大 ${Math.max(...spreads)}点 / 平均 ${(spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(1)}点`);
    }
    say();

    // どの観点が揺れているのか。core は満点48・partial 24 なので、1段の揺れが24点動く。
    // 合否が入れ替わる原因はほぼここに出る（残課題 §8 の「core が ○ と △ の間で振れる」）
    say("### 繰り返した件で観点の判定が揺れたか");
    say();
    say("| 件 | core | ground | depth | artic |");
    say("|---|---|---|---|---|");
    for (const id of flipTargets) {
      const rs = ok.filter((r) => r.case_id === id).sort((a, b) => a.round - b.round);
      const cell = (axis: AxisName) => {
        const vs = rs.map((r) => r.verdicts[axis] ?? "-");
        return new Set(vs).size > 1 ? `**${vs.join("/")}**` : vs[0];
      };
      say(`| ${id} | ${cell("core")} | ${cell("ground")} | ${cell("depth")} | ${cell("articulation")} |`);
    }
    say();

    // --- §12 箇条書きの誤爆 ---
    const bullets = rows.filter((x) => x.c.bullet);
    const prose = rows.filter((x) => !x.c.bullet);
    const enumProblem = rows.filter((x) => x.c.order === 4);
    say("## 残課題 §12 ── 箇条書き回答が捏造検出を誤爆させていないか");
    say();
    say("| 母集団 | 件数 | 引用の格下げが1つ以上 | 捏造扱い(3つ以上) | 引用ゼロで層1頭打ち |");
    say("|---|---|---|---|---|");
    const line = (name: string, g: typeof rows) =>
      say(
        `| ${name} | ${g.length} | ${pct(g.filter((x) => x.r.demoted_count > 0).length, g.length)} ` +
          `| ${pct(g.filter((x) => x.r.fabrication_suspected).length, g.length)} ` +
          `| ${pct(g.filter((x) => x.r.evidence_capped).length, g.length)} |`,
      );
    line("箇条書き形式の回答", bullets);
    line("散文の回答", prose);
    line("列挙を誘発する設問（order 4）", enumProblem);
    line("全体", rows);
    say();

    // --- §11 数値だけの反転誤答 ---
    say("## 残課題 §11 ── 数値だけが誤っている反転誤答");
    say();
    say("| 件 | order | 合計 | 層1 | 層2 | 矛盾申告 | 引用照合 | 判定 |");
    say("|---|---|---|---|---|---|---|---|");
    for (const { c, r } of rows.filter((x) => x.c.numeric_only)) {
      // 矛盾ありで層2が20を超えていれば、引用の実在確認が取れていない（soft cap 側）。
      // 20以下は hard veto か、そもそも層2が低いかの区別が付かない
      const quote = !r.contradiction ? "—" : r.deep_score > 20 ? "**取れていない**" : "取れている/不明";
      say(
        `| ${c.id} | ${c.order} | ${r.total} | ${r.keyword_score} | ${r.deep_score} ` +
          `| ${r.contradiction ? "あり" : "**なし**"} | ${quote} | ${r.cleared ? "**クリア**" : "不合格"} |`,
      );
    }
    say();
    const numericCases = rows.filter((x) => x.c.numeric_only);
    say(
      `- 数値だけが誤っている型: ${numericCases.length}件` +
        `（タスクの下限は3件以上 → ${numericCases.length >= 3 ? "満たす" : "**満たしていない**"}）`,
    );
    say(`- うち矛盾を申告した: ${pct(numericCases.filter((x) => x.r.contradiction).length, numericCases.length)}`);
    say(`- うちクリアしてしまった: ${pct(numericCases.filter((x) => x.r.cleared).length, numericCases.length)}`);
    say();

    // --- その他 ---
    const mr = new Map<string, number>();
    for (const { r } of rows) mr.set(r.matched_reject, (mr.get(r.matched_reject) ?? 0) + 1);
    say("## そのほか");
    say();
    say(`- matched_reject の分布: ${[...mr.entries()].sort().map(([k, v]) => `${k}=${v}`).join(" / ")}`);
    say(`- フィードバックがテンプレートに差し替わった率: ${pct(rows.filter((x) => x.r.feedback_source === "template").length, rows.length)}`);
    const cached = ok.filter((r) => r.cached_tokens !== null);
    if (cached.length) {
      const hit = cached.reduce((t, r) => t + (r.cached_tokens ?? 0), 0);
      const prompt = cached.reduce((t, r) => t + (r.prompt_tokens ?? 0), 0);
      say(`- プロンプトキャッシュ命中率: ${prompt ? ((hit / prompt) * 100).toFixed(0) : "0"}%`);
    }
    say(`- 採点不成立: ${runs.filter((r) => !r.ok).length}件`);
    say(`- 実リクエスト数: ${runs.length}回 / 概算 ¥${(runs.length * YEN_PER_CALL).toFixed(1)}`);
    say();

    // --- 保存 ---
    mkdirSync(RESULTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jsonPath = new URL(`./${stamp}-${GRADER_VERSION.replace(/[/:]/g, "_")}.json`, RESULTS_DIR);
    writeFileSync(
      jsonPath,
      JSON.stringify(
        { measured_at: new Date().toISOString(), grader_version: GRADER_VERSION, cases, runs },
        null,
        2,
      ),
    );
    const mdPath = new URL(`./${stamp}-report.md`, RESULTS_DIR);
    writeFileSync(mdPath, report.join("\n"));
    console.log(`保存: tests/golden/results/ に JSON とレポートを書き出しました`);

    expect(rows.length).toBe(cases.length);
  });

  // 下の2件は**タスクが定めた合格ライン**（tasks/B1）。
  // 落ちたら「コマンドが壊れた」のではなく、**それが測定結果**。B3 で直す。
  it("B1-001 反転誤答は1件もクリアしない（誤合格率 0%）", () => {
    const bad = cases
      .filter((c) => c.category === "inverted")
      .map((c) => ({ c, r: runs.find((r) => r.case_id === c.id && r.round === 1 && r.ok) }))
      .filter((x) => x.r?.cleared);
    expect(bad.map((x) => `${x.c.id}(${x.r!.total}点)`)).toEqual([]);
  });

  it("B1-002 短いが正しい回答はすべてクリアする（クリア率 100%）", () => {
    const bad = cases
      .filter((c) => c.category === "short_correct")
      .map((c) => ({ c, r: runs.find((r) => r.case_id === c.id && r.round === 1 && r.ok) }))
      .filter((x) => x.r && !x.r.cleared);
    expect(bad.map((x) => `${x.c.id}(${x.r!.total}点)`)).toEqual([]);
  });
});
