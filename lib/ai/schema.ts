// 層2の入出力の形。OpenAI の Structured Outputs に渡すスキーマと、
// 返ってきたJSONの検証をここにまとめる。
//
// 検証で既定値を埋めないのが重要。v2 は `JSON.parse(content ?? "{}")` から
// `score: undefined` を経て 0点に丸めていたため、API が想定外の応答を返すと
// ユーザーが理由不明の0点を食らっていた。v3 は「採点成功」か「例外」しかない。

import type { DeepScoreOutput, Verdict } from "./compose";

/** プロンプトと採点基準の版。変えたら grader_version が変わり、リプレイのキャッシュも切れる */
export const PROMPT_VERSION = "p2";

const AXIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  // evidence を verdict より前に置く。Structured Outputs はプロパティ順に生成するため、
  // 「引用を先に探させてから判定させる」ことになり、引用が見つからないときに
  // full を選びにくくなる。追加コストゼロの精度改善。
  required: ["evidence", "verdict"],
  properties: {
    evidence: { type: "string" },
    verdict: { type: "string", enum: ["full", "partial", "none"] },
  },
} as const;

export const DEEP_SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  // feedback は最後。4観点と矛盾判定が確定した後に文章を書かせる。
  // 逆順だと、書いた文章に引きずられて判定が動く。
  required: [
    "core",
    "ground",
    "depth",
    "articulation",
    "contradiction",
    "contradiction_evidence",
    "praise",
    "next_focus",
  ],
  properties: {
    core: AXIS_SCHEMA,
    ground: AXIS_SCHEMA,
    depth: AXIS_SCHEMA,
    articulation: AXIS_SCHEMA,
    contradiction: { type: "boolean" },
    contradiction_evidence: { type: "string" },
    praise: { type: "string" },
    next_focus: { type: "string" },
  },
} as const;

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; value: DeepScoreOutput }
  | { ok: false; error: string };

const VERDICTS: readonly string[] = ["full", "partial", "none"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseAxis(v: unknown, name: string): { verdict: Verdict; evidence: string } | string {
  if (!isRecord(v)) return `${name} がオブジェクトではありません`;
  const { verdict, evidence } = v;
  if (typeof verdict !== "string" || !VERDICTS.includes(verdict)) {
    return `${name}.verdict が不正です: ${String(verdict)}`;
  }
  if (typeof evidence !== "string") return `${name}.evidence が文字列ではありません`;
  return { verdict: verdict as Verdict, evidence };
}

/**
 * 想定外の値は既定値で埋めずにエラーとして返す。
 * 呼び出し側はこれを ScoringUnavailableError に変換し、0点として保存しない。
 */
export function parseDeepScore(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "オブジェクトではありません" };

  const core = parseAxis(raw.core, "core");
  if (typeof core === "string") return { ok: false, error: core };
  const ground = parseAxis(raw.ground, "ground");
  if (typeof ground === "string") return { ok: false, error: ground };
  const depth = parseAxis(raw.depth, "depth");
  if (typeof depth === "string") return { ok: false, error: depth };
  const articulation = parseAxis(raw.articulation, "articulation");
  if (typeof articulation === "string") return { ok: false, error: articulation };

  if (typeof raw.contradiction !== "boolean") {
    return { ok: false, error: "contradiction が真偽値ではありません" };
  }
  if (typeof raw.contradiction_evidence !== "string") {
    return { ok: false, error: "contradiction_evidence が文字列ではありません" };
  }
  if (typeof raw.praise !== "string") {
    return { ok: false, error: "praise が文字列ではありません" };
  }
  if (typeof raw.next_focus !== "string") {
    return { ok: false, error: "next_focus が文字列ではありません" };
  }

  const value: DeepScoreOutput = {
    core,
    ground,
    depth,
    articulation,
    contradiction: raw.contradiction,
    contradiction_evidence: raw.contradiction_evidence,
    praise: raw.praise,
    next_focus: raw.next_focus,
  };
  return { ok: true, value };
}
