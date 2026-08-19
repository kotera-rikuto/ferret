// ふりかえり画面が `user_attempts.axes`（JSONB）を読むための変換。
// compose.ts と同じく外部依存を持たない純粋関数だけを置く。
//
// ここを画面から切り離しているのは、**保存されている形が1種類ではない**ため。
// 実データ76件を数えたところ、キーの構成が3通りあった（2026-08-19・E1）:
//   - axes, keyword_hits, evidence_capped                                （最初の形）
//   - axes, keyword_hits, evidence_capped, fabrication_suspected          （+ 捏造検出）
//   - axes, keyword_hits, evidence_capped, fabrication_suspected, matched_reject（現行）
// 3通りとも `axes` は配列で入っているが、画面の中で分岐を書くと
// 「古い行を開いたときだけ落ちる」という、手元では踏めない壊れ方をする。
//
// なお `ideas/db仕様.md` は axes を `{ core: {...}, ground: {...} }` という
// 観点名をキーにした形と書いているが、**実際は `{ axes: [ ... ] }` の配列**。
// 保存側は app/api/score/route.ts、中身の型は compose.ts の ComposedAxis。

import {
  AXIS_MAX,
  AXIS_NAMES,
  quoteVerified,
  type AxisName,
  type Verdict,
} from "@/lib/ai/compose";

/**
 * 画面に出す観点の名前。
 *
 * 内部の呼び名（core / ground / depth / articulation）をそのまま出さず、
 * 文で言い換える（オーナー判断・2026-08-19）。初めて見た人に
 * 「明確さ」が何を指すのか伝わらないため。
 *
 * **「できていない」と読める言い方にしないこと**（CLAUDE.md の文言ルール）。
 * ここは満たせているかどうかに関わらず同じ見出しを出すので、
 * 見出し自体は評価の言葉ではなく「何を見ているか」の説明にしてある。
 */
export const AXIS_LABELS: Record<AxisName, string> = {
  core: "結論は合っている",
  ground: "どこを見たか書けている",
  depth: "もう一歩踏み込めている",
  articulation: "はっきり言い切れている",
};

/** 判定の言い方。`none` を「できていない」と書かない（tasks/E1 の注意） */
export const VERDICT_LABELS: Record<Verdict, string> = {
  full: "できている",
  partial: "半分",
  none: "まだ",
};

export type ReviewAxis = {
  axis: AxisName;
  label: string;
  verdict: Verdict;
  /**
   * 回答の中に実在することを確かめた引用。確かめられなければ null。
   *
   * **保存されている引用をそのまま出さないのが要点。**
   * 採点のとき照合を通しているのは `full` の引用だけで（compose.ts）、
   * `partial` と `none` の引用は裏を取っていない。さらに `full` でも、
   * 照合に落ちて格下げされた行は「回答に存在しない文字列」が保存されている。
   * それを「あなたはここをこう書きました」として出すと、
   * **本人が書いていない文章を本人の回答として見せる**ことになる。
   */
  quote: string | null;
  points: number;
  max: number;
};

/**
 * 観点の点数を足しても合計に届かない回がある。その理由。
 *
 * 上限（compose.ts の各種 CAP）が働いた回では、観点ごとの点数の合計と
 * 実際の点数が一致しない。**黙って数字がずれていると採点の不具合に見える**ので、
 * 理由が言える回は画面で言う。
 */
export type ReviewCaps = {
  /** 検証済みの引用が1つも無く、キーワードぶんが頭打ちになった */
  evidenceCapped: boolean;
  /** 引用の照合が3件以上まとめて取れず、AI採点ぶんが頭打ちになった */
  fabricationSuspected: boolean;
};

export type ReviewBreakdown = {
  axes: ReviewAxis[];
  caps: ReviewCaps;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 保存された内訳を画面用に直す。読めなければ `null`。
 *
 * **読めないときに空の内訳を作らない。** 4観点すべてが「まだ」の行と
 * 「そもそも記録が無い行」は画面での意味がまったく違う（前者は採点結果、
 * 後者は採点の仕組みを変える前の回答）。混ぜると、古い回答を開いた人に
 * 全部できていないという嘘の内訳を見せることになる。
 * 呼び出し側は null のとき「この回は内訳が残っていない」と出すこと。
 *
 * @param stored `user_attempts.axes` の中身
 * @param answer 本人の回答。引用が実在するかの照合に使う
 */
export function parseStoredAxes(
  stored: unknown,
  answer: string,
): ReviewBreakdown | null {
  if (!isRecord(stored) || !Array.isArray(stored.axes)) return null;

  const byName = new Map<string, Record<string, unknown>>();
  for (const entry of stored.axes) {
    if (isRecord(entry) && typeof entry.axis === "string") {
      byName.set(entry.axis, entry);
    }
  }

  const axes: ReviewAxis[] = [];
  // 保存されている並びではなく AXIS_NAMES の順に出す。
  // 配点の重い順（core → articulation）で固定され、行ごとに並びが変わらない
  for (const axis of AXIS_NAMES) {
    const entry = byName.get(axis);
    if (!entry) return null;

    const verdict = entry.verdict;
    if (verdict !== "full" && verdict !== "partial" && verdict !== "none") {
      return null;
    }
    // 点数は既定値で埋めない。埋めると「記録が無い」と「0点だった」が同じ見た目になる
    if (typeof entry.points !== "number" || !Number.isFinite(entry.points)) {
      return null;
    }

    const evidence = typeof entry.evidence === "string" ? entry.evidence : "";
    axes.push({
      axis,
      label: AXIS_LABELS[axis],
      verdict,
      quote: evidence && quoteVerified(evidence, answer) ? evidence : null,
      points: entry.points,
      max: AXIS_MAX[axis],
    });
  }

  return {
    axes,
    caps: {
      evidenceCapped: stored.evidence_capped === true,
      fabricationSuspected: stored.fabrication_suspected === true,
    },
  };
}
