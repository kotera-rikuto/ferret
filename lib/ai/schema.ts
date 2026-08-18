// 層2の入出力の形。OpenAI の Structured Outputs に渡すスキーマと、
// 返ってきたJSONの検証をここにまとめる。
//
// 検証で既定値を埋めないのが重要。v2 は `JSON.parse(content ?? "{}")` から
// `score: undefined` を経て 0点に丸めていたため、API が想定外の応答を返すと
// ユーザーが理由不明の0点を食らっていた。v3 は「採点成功」か「例外」しかない。

import type { DeepScoreOutput, MatchedReject, Verdict } from "./compose";

/**
 * プロンプトと採点基準の版。変えたら grader_version が変わり、リプレイのキャッシュも切れる。
 *
 * p2 → p3（2026-08-17）: matched_reject の追加と、読み違いを検出したときに
 * 場所を示させる指示の追加。**配点の計算式は変えていない。**
 * それでも版を上げるのは、同じ "p2" という記録の中に別々の指示文で採点した行が混ざると、
 * ゴールデンセット（残課題 §8）で前後を比べたときに差の出所が分からなくなるため。
 * 副作用として、p2 で採点済みの回答を再送すると再採点になる（1件 約¥0.04）。
 *
 * p3 → p4（2026-08-18・B3）: `# 校正の基準例` に「結果だけを述べて原因に触れていない
 * 回答は core を full にしない」判断例を追加（残課題 §8「直す候補」1）。
 * **配点の計算式も観点の重みも変えていない。** 変えたのは判断例だけ。
 * p3 では「エラーが出ると思います」だけの回答が5回中2回 core=full を取り、
 * 60点でクリア閾値55を越えていた（`core` は1段24点なので、1段の揺れが合否を変える）。
 */
export const PROMPT_VERSION = "p4";

/**
 * matched_reject の取りうる値。**スキーマの enum と検証で同じ配列を使う。**
 * 片方だけ広げると、スキーマは通るのに parseDeepScore が弾く（またはその逆）が起きる。
 * 番号を3までにしている理由は compose.ts の MatchedReject を参照。
 */
export const MATCHED_REJECT_VALUES = ["none", "1", "2", "3"] as const;

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
  //
  // matched_reject は矛盾判定の後・文章の前に置く。
  // 採点の判定はすべて済んでいるので判定を動かす心配がなく、
  // 逆に「どの誤読に当たったか」を決めてから文章を書かせられるので、
  // next_focus がその読み方の崩れる箇所を指しやすくなる。
  required: [
    "core",
    "ground",
    "depth",
    "articulation",
    "contradiction",
    "contradiction_evidence",
    "matched_reject",
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
    matched_reject: { type: "string", enum: MATCHED_REJECT_VALUES },
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
  // 記録用の項目だが、ここでも既定値（"none"）で埋めない。
  // 埋めると「モデルが返していない」と「該当なしと判定した」が同じ値になり、
  // 集計したときに『誰も誤読していない問題』と見分けがつかなくなる。
  if (
    typeof raw.matched_reject !== "string" ||
    !(MATCHED_REJECT_VALUES as readonly string[]).includes(raw.matched_reject)
  ) {
    return {
      ok: false,
      error: `matched_reject が不正です: ${String(raw.matched_reject)}`,
    };
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
    matched_reject: raw.matched_reject as MatchedReject,
    praise: raw.praise,
    next_focus: raw.next_focus,
  };
  return { ok: true, value };
}
