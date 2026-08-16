/**
 * lib/ai/schema.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §3。
 *
 * 「既定値で埋めない」がこのモジュールの設計の核。
 * v2 は JSON.parse(content ?? "{}") から score: undefined を経て
 * 0点に丸めていたため、API が想定外の応答を返すと
 * ユーザーが理由不明の0点を食らっていた。
 */

import { describe, it, expect } from "vitest";
import { parseDeepScore, DEEP_SCORE_SCHEMA, PROMPT_VERSION } from "@/lib/ai/schema";

/** 検証を通る最小のオブジェクト。各テストで一部だけ壊して使う */
function valid(): Record<string, unknown> {
  return {
    core: { verdict: "full", evidence: "const に再代入" },
    ground: { verdict: "partial", evidence: "" },
    depth: { verdict: "none", evidence: "" },
    articulation: { verdict: "full", evidence: "5行目で停止" },
    contradiction: false,
    contradiction_evidence: "",
    praise: "中核まで読み取れています。",
    next_focus: "5行目の rate = 0.8 に注目してみてください。",
  };
}

describe("§3 parseDeepScore", () => {
  it("U-120 正常な出力はそのまま通る", () => {
    const r = parseDeepScore(valid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.core.verdict).toBe("full");
      expect(r.value.core.evidence).toBe("const に再代入");
      expect(r.value.contradiction).toBe(false);
      expect(r.value.praise).toBe("中核まで読み取れています。");
    }
  });

  it.each([
    ["null", null],
    ["配列", []],
    ["文字列", "full"],
    ["数値", 80],
    ["undefined", undefined],
  ])("U-121 オブジェクトでない入力（%s）を拒否する", (_label, input) => {
    const r = parseDeepScore(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("オブジェクトではありません");
  });

  it.each(["core", "ground", "depth", "articulation"])(
    "U-122 観点 %s が欠けていたら拒否し、どれが欠けたか error に出す",
    (axis) => {
      const raw = valid();
      delete raw[axis];
      const r = parseDeepScore(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(axis);
    },
  );

  it("U-123 verdict が大文字だと拒否する（enum は小文字のみ）", () => {
    const raw = valid();
    raw.core = { verdict: "FULL", evidence: "x" };
    expect(parseDeepScore(raw).ok).toBe(false);
  });

  it.each([["未知の値", "unknown"], ["数値", 1], ["null", null]])(
    "U-124 verdict が %s だと拒否する",
    (_label, verdict) => {
      const raw = valid();
      raw.core = { verdict, evidence: "x" };
      expect(parseDeepScore(raw).ok).toBe(false);
    },
  );

  it("U-125 evidence が文字列でないと拒否する", () => {
    const raw = valid();
    raw.core = { verdict: "full", evidence: 123 };
    const r = parseDeepScore(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("evidence");
  });

  it("U-126 contradiction が文字列だと拒否する", () => {
    const raw = valid();
    raw.contradiction = "true";
    const r = parseDeepScore(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("contradiction");
  });

  it("U-127 contradiction_evidence が欠けていたら拒否する", () => {
    const raw = valid();
    delete raw.contradiction_evidence;
    expect(parseDeepScore(raw).ok).toBe(false);
  });

  it.each(["praise", "next_focus"])(
    "U-128 %s が欠けていたら拒否し、どちらが欠けたか error に出す",
    (key) => {
      const raw = valid();
      delete raw[key];
      const r = parseDeepScore(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(key);
    },
  );

  it("U-129 失敗時に既定値を返さない（value を持たない）", () => {
    const r = parseDeepScore({ core: "壊れている" });
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("value");
  });

  /**
   * 🟡 未知のキーは無視されて通る。
   * OpenAI 側は additionalProperties: false を守るので実害は薄いが、
   * 残課題 §3 で matched_reject を足すときに「スキーマには足したが
   * parseDeepScore に足し忘れた」場合、静かに落ちることになる。
   * その取りこぼしをこのテストが記録しておく。
   */
  it("U-130 【要判断】未知のキーは無視されて通る", () => {
    const raw = valid();
    raw.matched_reject = "1";
    const r = parseDeepScore(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).not.toHaveProperty("matched_reject");
  });

  it("U-131 スキーマの required が8項目すべてを列挙している", () => {
    expect([...DEEP_SCORE_SCHEMA.required]).toEqual([
      "core",
      "ground",
      "depth",
      "articulation",
      "contradiction",
      "contradiction_evidence",
      "praise",
      "next_focus",
    ]);
  });

  /**
   * 順序に意味があるケース。Structured Outputs はプロパティ順に生成するため、
   * evidence を先に置くと「引用を探してから判定させる」ことになる。
   * 並べ替えても型エラーにならないので、テストでしか守れない。
   */
  it("U-132 観点スキーマは evidence を verdict より前に置く", () => {
    for (const axis of ["core", "ground", "depth", "articulation"] as const) {
      expect([...DEEP_SCORE_SCHEMA.properties[axis].required]).toEqual([
        "evidence",
        "verdict",
      ]);
    }
  });

  it("U-133 PROMPT_VERSION が空でない文字列", () => {
    expect(typeof PROMPT_VERSION).toBe("string");
    expect(PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});
