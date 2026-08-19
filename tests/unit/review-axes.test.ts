/**
 * 保存された採点内訳（user_attempts.axes）の読み取り。
 *
 * ここを単体で押さえるのは、**壊れ方が画面に出ないから。**
 * 保存されている形は実データで3通りあり（lib/review/axes.ts の冒頭）、
 * 古い行を開いたときだけ落ちる・古い行だけ嘘の内訳が出る、という
 * 手元の新しい回答では絶対に踏めない壊れ方をする。
 */

import { describe, it, expect } from "vitest";
import {
  AXIS_LABELS,
  VERDICT_LABELS,
  parseStoredAxes,
} from "@/lib/review/axes";
import { AXIS_MAX, AXIS_NAMES } from "@/lib/ai/compose";

const ANSWER =
  "5行目の const 宣言に再代入しているため TypeError で停止し、console.log は実行されません";

/** 回答の中に実在する引用。照合を通る */
const QUOTE_REAL = "const 宣言に再代入";
/** 回答の中に無い引用。照合に落ちる */
const QUOTE_FAKE = "元の配列を書き換えている";

function axis(
  name: string,
  verdict: string,
  evidence: string,
  points: number,
  demoted = false,
) {
  return { axis: name, verdict, raw: verdict, demoted, evidence, points };
}

/** 現行の形（app/api/score/route.ts が入れているもの） */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    axes: [
      axis("core", "full", QUOTE_REAL, AXIS_MAX.core),
      axis("ground", "partial", QUOTE_REAL, AXIS_MAX.ground / 2),
      axis("depth", "none", "", 0),
      axis("articulation", "full", QUOTE_REAL, AXIS_MAX.articulation),
    ],
    keyword_hits: [true, true, false, false],
    evidence_capped: false,
    fabrication_suspected: false,
    matched_reject: "none",
    ...overrides,
  };
}

describe("§16-1 parseStoredAxes", () => {
  it("U-710 現行の形を読み、4観点ぶんを返す", () => {
    const result = parseStoredAxes(stored(), ANSWER);

    expect(result).not.toBeNull();
    expect(result!.axes).toHaveLength(4);
    expect(result!.axes[0]).toMatchObject({
      axis: "core",
      label: AXIS_LABELS.core,
      verdict: "full",
      quote: QUOTE_REAL,
      points: AXIS_MAX.core,
      max: AXIS_MAX.core,
    });
  });

  /**
   * 並びを保存順ではなく AXIS_NAMES 順に固定する。
   * 保存側の並びが変わっても画面の並びは動かない
   */
  it("U-711 保存の並びが違っても、配点の重い順に並べ直す", () => {
    const shuffled = stored({
      axes: [
        axis("depth", "none", "", 0),
        axis("articulation", "full", QUOTE_REAL, AXIS_MAX.articulation),
        axis("core", "full", QUOTE_REAL, AXIS_MAX.core),
        axis("ground", "partial", QUOTE_REAL, AXIS_MAX.ground / 2),
      ],
    });

    const result = parseStoredAxes(shuffled, ANSWER);
    expect(result!.axes.map((a) => a.axis)).toEqual([...AXIS_NAMES]);
  });

  /**
   * **この検査がこのファイルの主目的。**
   * 照合を通しているのは採点時の `full` だけなので、格下げされた行と
   * `partial` / `none` の引用は回答に存在しない可能性がある。
   * そのまま出すと、本人が書いていない文章を本人の回答として見せることになる
   */
  it("U-712 回答の中に見つからない引用は出さない", () => {
    const fabricated = stored({
      axes: [
        axis("core", "partial", QUOTE_FAKE, AXIS_MAX.core / 2, true),
        axis("ground", "none", QUOTE_FAKE, 0),
        axis("depth", "none", "", 0),
        axis("articulation", "full", QUOTE_REAL, AXIS_MAX.articulation),
      ],
    });

    const result = parseStoredAxes(fabricated, ANSWER);
    expect(result!.axes[0].quote).toBeNull();
    expect(result!.axes[1].quote).toBeNull();
    expect(result!.axes[2].quote).toBeNull();
    // 実在するものは残る
    expect(result!.axes[3].quote).toBe(QUOTE_REAL);
  });

  it("U-713 実在する引用なら full 以外でも出す", () => {
    const result = parseStoredAxes(stored(), ANSWER);
    expect(result!.axes[1]).toMatchObject({
      verdict: "partial",
      quote: QUOTE_REAL,
    });
  });

  it("U-714 空の引用は出さない", () => {
    const result = parseStoredAxes(stored(), ANSWER);
    expect(result!.axes[2].quote).toBeNull();
  });

  it("U-715 上限が働いたかどうかを読む", () => {
    const capped = stored({ evidence_capped: true, fabrication_suspected: true });
    const result = parseStoredAxes(capped, ANSWER);

    expect(result!.caps).toEqual({
      evidenceCapped: true,
      fabricationSuspected: true,
    });
  });

  /**
   * 実データにあった最初の形（fabrication_suspected / matched_reject が無い）。
   * 無い欄は「起きていない」として読む
   */
  it("U-716 古い形（欄が少ない）でも読める", () => {
    const old = {
      axes: stored().axes,
      keyword_hits: [true, false, false, false],
      evidence_capped: true,
    };

    const result = parseStoredAxes(old, ANSWER);
    expect(result).not.toBeNull();
    expect(result!.caps).toEqual({
      evidenceCapped: true,
      fabricationSuspected: false,
    });
  });
});

/**
 * 読めないものは null。**空の内訳を作らない。**
 * 4観点すべてが「まだ」の行と記録が無い行は意味がまったく違う
 */
describe("§16-2 読めないときは null", () => {
  it.each([
    ["null（採点の仕組みを変える前の行）", null],
    ["undefined", undefined],
    ["配列", []],
    ["文字列", "axes"],
    ["axes を持たない", { keyword_hits: [] }],
    ["axes が配列でない", { axes: { core: {} } }],
  ])("U-717 %s は null を返す", (_label, value) => {
    expect(parseStoredAxes(value, ANSWER)).toBeNull();
  });

  it("U-718 観点が1つでも欠けていれば null", () => {
    const missing = stored({ axes: stored().axes.slice(0, 3) });
    expect(parseStoredAxes(missing, ANSWER)).toBeNull();
  });

  it("U-719 判定が想定外の値なら null", () => {
    const broken = stored({
      axes: [
        axis("core", "excellent", QUOTE_REAL, AXIS_MAX.core),
        ...stored().axes.slice(1),
      ],
    });
    expect(parseStoredAxes(broken, ANSWER)).toBeNull();
  });

  /**
   * 点数を既定値で埋めない（schema.ts と同じ方針）。
   * 埋めると「記録が無い」と「0点だった」が同じ見た目になる
   */
  it.each([["文字列", "48"], ["欠けている", undefined], ["NaN", Number.NaN]])(
    "U-720 点数が %s なら null",
    (_label, points) => {
      const broken = stored({
        axes: [
          { axis: "core", verdict: "full", evidence: QUOTE_REAL, points },
          ...stored().axes.slice(1),
        ],
      });
      expect(parseStoredAxes(broken, ANSWER)).toBeNull();
    },
  );
});

describe("§16-3 画面に出す言葉", () => {
  it("U-721 4観点すべてに名前がある", () => {
    for (const axisName of AXIS_NAMES) {
      expect(AXIS_LABELS[axisName]).toBeTruthy();
    }
  });

  /**
   * CLAUDE.md の文言ルール。「まだ」の判定を「できていない」と書かない。
   * 画面だけ整えても、ここに罰の言葉が入ると方針が崩れる
   */
  it("U-722 禁止されている言い方を使っていない", () => {
    const banned = ["弱点", "失敗", "間違い", "初心者", "できていない", "不足"];
    const words = [
      ...Object.values(AXIS_LABELS),
      ...Object.values(VERDICT_LABELS),
    ];

    for (const word of words) {
      for (const ng of banned) {
        expect(word, `「${word}」に「${ng}」が入っている`).not.toContain(ng);
      }
    }
  });
});
