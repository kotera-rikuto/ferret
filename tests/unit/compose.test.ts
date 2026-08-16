/**
 * lib/ai/compose.ts の単体テスト。
 *
 * ケース定義は tests/unit/テストケース.md の §1 を正とする。
 * テスト名の先頭に付いている ID（U-020 など）で md と対応が取れる。
 *
 * このファイルは `ideas/採点システム_残課題.md` §9 が求めている
 * 「配点の検算スクリプトの常設化」に対応する。
 * 配点・閾値・観点の重みを触ったら、まずここが落ちる。
 */

import { describe, it, expect } from "vitest";
import {
  composeScore,
  scoreKeywords,
  quoteVerified,
  normalizeForMatch,
  normalizeAnswer,
  AXIS_MAX,
  AXIS_NAMES,
  CLEAR_THRESHOLD,
  PERFECT_THRESHOLD,
  ANSWER_MIN_CHARS,
  ANSWER_MAX_CHARS,
  KEYWORD_SLOT_COUNT,
  type DeepScoreOutput,
  type Verdict,
  type KeywordSlot,
} from "@/lib/ai/compose";

// ---------------------------------------------------------------------------
// 固定データ
// ---------------------------------------------------------------------------

/**
 * 採点対象の回答。
 * 実在する問題（id=5「const と let」）の模範解答に近い文面にしてある。
 * 引用照合を通したい evidence は、必ずこの文字列の一部にすること。
 */
const ANSWER =
  "5行目の const 宣言に再代入しているため TypeError で停止し、console.log は実行されません";

/** ANSWER に実在する引用。quoteVerified が true になる */
const EVIDENCE_REAL = "const 宣言に再代入";

/** ANSWER に存在しない引用。full を申告しても partial に格下げされる */
const EVIDENCE_FAKE = "元の配列を書き換えている";

/** 20字を超える引用。先頭20字だけが照合に使われることの確認用 */
const EVIDENCE_LONG = "const 宣言に再代入しているため TypeError で停止";

/** ANSWER に含まれる語（層1をヒットさせる） */
const HITTING = ["5行目", "const", "再代入", "TypeError"];

/** ANSWER に含まれない語 */
const MISSING = ["偶数だけ", "配列を書き換", "非同期処理", "型定義から"];

/**
 * ちょうど4スロットのキーワードを作る。
 * 先頭 `hits` 個だけが ANSWER にヒットし、残りは外れる。
 */
function slots(hits: number): KeywordSlot[] {
  return Array.from({ length: KEYWORD_SLOT_COUNT }, (_, i) => ({
    match: [i < hits ? HITTING[i] : MISSING[i]],
  }));
}

/**
 * 層2（AI）の出力を組み立てる。
 * full の観点にだけ evidence を入れる。実際のプロンプトも
 * 「partial と none の evidence は空文字列にする」と指示している。
 */
function deep(
  verdicts: [Verdict, Verdict, Verdict, Verdict],
  opts: {
    evidence?: string;
    contradiction?: boolean;
    contradictionEvidence?: string;
  } = {},
): DeepScoreOutput {
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
    praise: "",
    next_focus: "",
  };
}

// ---------------------------------------------------------------------------
// §1-1 配点の検算（残課題 §9）
// ---------------------------------------------------------------------------

describe("§1-1 配点の検算", () => {
  it("U-020 core=none は他が満点でも 52点で不合格（中核ゲート）", () => {
    const r = composeScore(deep(["none", "full", "full", "full"]), ANSWER, slots(4));
    expect(r.deepScore).toBe(32);
    expect(r.keywordScore).toBe(20);
    expect(r.total).toBe(52);
    expect(r.cleared).toBe(false);
  });

  it("U-021 全観点 partial は KW 満点でも 50点で不合格（引用ゲート）", () => {
    const r = composeScore(
      deep(["partial", "partial", "partial", "partial"]),
      ANSWER,
      slots(4),
    );
    expect(r.deepScore).toBe(40);
    // full が1つも無いので層1が10点で頭打ちになる
    expect(r.keywordScore).toBe(10);
    expect(r.evidenceCapped).toBe(true);
    expect(r.total).toBe(50);
    expect(r.cleared).toBe(false);
  });

  it("U-022 core=full で説明が短くても 62点でクリア（設計の肝）", () => {
    const r = composeScore(deep(["full", "none", "none", "full"]), ANSWER, slots(2));
    expect(r.deepScore).toBe(52);
    expect(r.keywordScore).toBe(10);
    expect(r.total).toBe(62);
    expect(r.cleared).toBe(true);
  });

  it("U-023 core=full のみ・KW0 は 48点で不合格", () => {
    const r = composeScore(deep(["full", "none", "none", "none"]), ANSWER, slots(0));
    expect(r.total).toBe(48);
    expect(r.cleared).toBe(false);
  });

  it("U-024 core+ground=full・depth=partial は KW0 でも 70点でクリア（設計の肝）", () => {
    const r = composeScore(deep(["full", "full", "partial", "none"]), ANSWER, slots(0));
    expect(r.deepScore).toBe(70);
    expect(r.keywordScore).toBe(0);
    expect(r.total).toBe(70);
    expect(r.cleared).toBe(true);
  });

  it("U-025 4観点 full・KW 満点で 100点・パーフェクト", () => {
    const r = composeScore(deep(["full", "full", "full", "full"]), ANSWER, slots(4));
    expect(r.deepScore).toBe(80);
    expect(r.keywordScore).toBe(20);
    expect(r.total).toBe(100);
    expect(r.cleared).toBe(true);
    expect(r.perfect).toBe(true);
  });

  it("U-026 矛盾が引用付きで確認されたら 30点が上限", () => {
    const r = composeScore(
      deep(["full", "full", "full", "full"], {
        contradiction: true,
        contradictionEvidence: EVIDENCE_REAL,
      }),
      ANSWER,
      slots(4),
    );
    expect(r.deepScore).toBe(20);
    expect(r.keywordScore).toBe(10);
    expect(r.total).toBe(30);
    expect(r.cleared).toBe(false);
    expect(r.contradiction).toBe(true);
  });

  it("U-027 引用の捏造（4観点とも実在しない）は 30点が上限", () => {
    const r = composeScore(
      deep(["full", "full", "full", "full"], { evidence: EVIDENCE_FAKE }),
      ANSWER,
      slots(4),
    );
    expect(r.fabricationSuspected).toBe(true);
    expect(r.deepScore).toBe(20);
    expect(r.keywordScore).toBe(10);
    expect(r.total).toBe(30);
    expect(r.cleared).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §1-2 合成の分岐
// ---------------------------------------------------------------------------

describe("§1-2 合成の分岐", () => {
  it("U-030 full が1つも無いと層1が10点で頭打ちになる", () => {
    const r = composeScore(
      deep(["partial", "partial", "none", "none"]),
      ANSWER,
      slots(4),
    );
    expect(r.keywordScore).toBe(10);
    expect(r.evidenceCapped).toBe(true);
  });

  it("U-031 full が1つでもあれば層1は満点のまま", () => {
    const r = composeScore(deep(["full", "none", "none", "none"]), ANSWER, slots(4));
    expect(r.keywordScore).toBe(20);
    expect(r.evidenceCapped).toBe(false);
  });

  it("U-032 full が無くても KW が10点以下なら切り詰めは起きない", () => {
    const r = composeScore(
      deep(["partial", "partial", "none", "none"]),
      ANSWER,
      slots(2),
    );
    expect(r.keywordScore).toBe(10);
    expect(r.evidenceCapped).toBe(false);
  });

  it("U-033 格下げ2件では捏造とみなさない", () => {
    const r = composeScore(
      deep(["full", "full", "partial", "none"], { evidence: EVIDENCE_FAKE }),
      ANSWER,
      slots(4),
    );
    expect(r.axes.filter((a) => a.demoted)).toHaveLength(2);
    expect(r.fabricationSuspected).toBe(false);
  });

  it("U-034 格下げ3件で捏造とみなし層2を20点に抑える", () => {
    const r = composeScore(
      deep(["full", "full", "full", "none"], { evidence: EVIDENCE_FAKE }),
      ANSWER,
      slots(4),
    );
    expect(r.axes.filter((a) => a.demoted)).toHaveLength(3);
    expect(r.fabricationSuspected).toBe(true);
    expect(r.deepScore).toBeLessThanOrEqual(20);
  });

  it("U-035 矛盾（引用あり）は層2と層1の両方を抑える", () => {
    const r = composeScore(
      deep(["full", "full", "full", "full"], {
        contradiction: true,
        contradictionEvidence: EVIDENCE_REAL,
      }),
      ANSWER,
      slots(4),
    );
    expect(r.deepScore).toBeLessThanOrEqual(20);
    expect(r.keywordScore).toBeLessThanOrEqual(10);
  });

  it("U-036 矛盾（引用なし）は層2だけを抑え、層1は切り詰めない", () => {
    const r = composeScore(
      deep(["full", "full", "full", "full"], {
        contradiction: true,
        contradictionEvidence: EVIDENCE_FAKE,
      }),
      ANSWER,
      slots(4),
    );
    expect(r.deepScore).toBe(40);
    expect(r.keywordScore).toBe(20);
  });

  /**
   * 🟡 現状の挙動を固定するテスト。
   *
   * compose.ts のコメントは「申告のみで裏が取れない場合。通さないが、点を潰しもしない」
   * と書いているが、層2上限 40 + 層1満点 20 = 60点でクリア閾値 55 を超える。
   * つまり「矛盾を申告しているのにクリアする」組み合わせが存在する。
   *
   * 潰す場合の選択肢:
   *   (a) DEEP_CAP_ON_UNVERIFIED_CONTRADICTION を 34 以下にする
   *   (b) 未検証の矛盾でも keywordScore を切り詰める
   * どちらを採るかはオーナーの判断なので、ここでは現状を固定するに留める。
   */
  it("U-037 【要判断】矛盾（引用なし）でも 60点でクリアしてしまう", () => {
    const r = composeScore(
      deep(["full", "full", "full", "full"], {
        contradiction: true,
        contradictionEvidence: EVIDENCE_FAKE,
      }),
      ANSWER,
      slots(4),
    );
    expect(r.total).toBe(60);
    expect(r.contradiction).toBe(true);
    // 仕様が決まったら false に変える
    expect(r.cleared).toBe(true);
  });

  it("U-038 demoted は「full を申告したが引用が取れなかった」観点にだけ立つ", () => {
    const r = composeScore(
      deep(["full", "partial", "none", "full"], { evidence: EVIDENCE_FAKE }),
      ANSWER,
      slots(0),
    );
    const byAxis = Object.fromEntries(r.axes.map((a) => [a.axis, a]));
    expect(byAxis.core.demoted).toBe(true);
    expect(byAxis.core.raw).toBe("full");
    expect(byAxis.core.verdict).toBe("partial");
    expect(byAxis.articulation.demoted).toBe(true);
    expect(byAxis.ground.demoted).toBe(false);
    expect(byAxis.depth.demoted).toBe(false);
  });

  it("U-039 evidence は20字に切り詰めて保存される", () => {
    const r = composeScore(
      deep(["full", "none", "none", "none"], { evidence: EVIDENCE_LONG }),
      ANSWER,
      slots(0),
    );
    const core = r.axes.find((a) => a.axis === "core")!;
    expect(core.evidence).toBe(EVIDENCE_LONG.slice(0, 20));
    expect(core.evidence.length).toBe(20);
    // 先頭20字が回答に実在するので full のまま
    expect(core.verdict).toBe("full");
  });

  it("U-040 partial / none には引用照合をかけない", () => {
    const r = composeScore(
      deep(["partial", "none", "partial", "none"]),
      ANSWER,
      slots(0),
    );
    for (const a of r.axes) {
      expect(a.evidence).toBe("");
      expect(a.demoted).toBe(false);
    }
  });

  it("U-041 axes は core / ground / depth / articulation の順に並ぶ", () => {
    const r = composeScore(deep(["full", "full", "full", "full"]), ANSWER, slots(0));
    expect(r.axes.map((a) => a.axis)).toEqual([...AXIS_NAMES]);
  });
});

// ---------------------------------------------------------------------------
// §1-3 定数の不変条件
// ---------------------------------------------------------------------------

describe("§1-3 定数の不変条件", () => {
  it("U-050 観点の満点の合計は80点", () => {
    const sum = AXIS_NAMES.reduce((t, a) => t + AXIS_MAX[a], 0);
    expect(sum).toBe(80);
  });

  it("U-051 キーワードは4スロット×5点で20点", () => {
    expect(KEYWORD_SLOT_COUNT * 5).toBe(20);
  });

  it("U-052 partial（満点の半分）がどの観点でも整数になる", () => {
    for (const a of AXIS_NAMES) {
      expect(Number.isInteger(AXIS_MAX[a] * 0.5)).toBe(true);
    }
  });

  it("U-053 core=none の理論上の最大は閾値に届かない（中核ゲート）", () => {
    const maxWithoutCore = 80 - AXIS_MAX.core + KEYWORD_SLOT_COUNT * 5;
    expect(maxWithoutCore).toBeLessThan(CLEAR_THRESHOLD);
  });

  it("U-054 クリア閾値は理論下限の53を下回らない", () => {
    expect(CLEAR_THRESHOLD).toBeGreaterThanOrEqual(53);
  });

  it("U-055 引用が1つも取れない回答は閾値に届かない（引用ゲート）", () => {
    // 内部定数を export していないので composeScore 経由で確認する
    const r = composeScore(
      deep(["partial", "partial", "partial", "partial"]),
      ANSWER,
      slots(4),
    );
    expect(r.total).toBeLessThan(CLEAR_THRESHOLD);
  });

  it("U-056 パーフェクト帯はクリア閾値より上", () => {
    expect(PERFECT_THRESHOLD).toBeGreaterThan(CLEAR_THRESHOLD);
  });

  it("U-057 回答の文字数の下限・上限が妥当な関係にある", () => {
    expect(ANSWER_MIN_CHARS).toBeGreaterThan(0);
    expect(ANSWER_MIN_CHARS).toBeLessThan(ANSWER_MAX_CHARS);
  });

  it("U-058 矛盾（引用あり）の最大点は閾値に届かない", () => {
    const r = composeScore(
      deep(["full", "full", "full", "full"], {
        contradiction: true,
        contradictionEvidence: EVIDENCE_REAL,
      }),
      ANSWER,
      slots(4),
    );
    expect(r.total).toBeLessThan(CLEAR_THRESHOLD);
  });

  /** 🟡 U-037 と同根。現状は成立しないので、成立しないことを固定する */
  it("U-059 【要判断】矛盾（引用なし）の最大点は閾値を超える", () => {
    const r = composeScore(
      deep(["full", "full", "full", "full"], {
        contradiction: true,
        contradictionEvidence: EVIDENCE_FAKE,
      }),
      ANSWER,
      slots(4),
    );
    expect(r.total).toBeGreaterThanOrEqual(CLEAR_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// §1-4 scoreKeywords
// ---------------------------------------------------------------------------

describe("§1-4 scoreKeywords", () => {
  it.each([
    [0, 0],
    [1, 5],
    [2, 10],
    [3, 15],
    [4, 20],
  ])("U-060 %i スロットヒットで %i 点", (hits, expected) => {
    expect(scoreKeywords(ANSWER, slots(hits)).score).toBe(expected);
  });

  it("U-061 1スロット内で複数の表記ゆれが当たっても1ヒット", () => {
    const s: KeywordSlot[] = [
      { match: ["const", "再代入", "TypeError"] },
      { match: [MISSING[1]] },
      { match: [MISSING[2]] },
      { match: [MISSING[3]] },
    ];
    const r = scoreKeywords(ANSWER, s);
    expect(r.score).toBe(5);
    expect(r.hits).toEqual([true, false, false, false]);
  });

  it("U-062 空配列を渡しても落ちない", () => {
    expect(scoreKeywords(ANSWER, [])).toEqual({ score: 0, hits: [] });
  });

  it("U-063 match が空のスロットは未ヒット", () => {
    const r = scoreKeywords(ANSWER, [{ match: [] }]);
    expect(r.hits).toEqual([false]);
  });

  it("U-064 大文字小文字を区別しない", () => {
    const r = scoreKeywords("typeerror が出ます", [{ match: ["TypeError"] }]);
    expect(r.hits[0]).toBe(true);
  });

  it("U-065 半角カナ・全角英数を吸収する（NFKC）", () => {
    expect(scoreKeywords("ｴﾗｰになります", [{ match: ["エラー"] }]).hits[0]).toBe(true);
    expect(scoreKeywords("ＴｙｐｅＥｒｒｏｒ", [{ match: ["TypeError"] }]).hits[0]).toBe(
      true,
    );
  });

  it("U-066 記号の有無を無視する", () => {
    const r = scoreKeywords("consolelog は動きません", [{ match: ["console.log"] }]);
    expect(r.hits[0]).toBe(true);
  });

  /**
   * 部分文字列一致なので否定形を区別できない。
   * compose.ts が「だから層1は20点に留め、合否は層2の core が握る」と
   * 明記している既知の限界であり、仕様として固定する。
   */
  it("U-067 否定形にもヒットする（既知の限界・仕様として固定）", () => {
    const r = scoreKeywords("エラーで止まりません", [{ match: ["止ま"] }]);
    expect(r.hits[0]).toBe(true);
  });

  /**
   * 🟡 記号を含むキーワードは正規化で短くなり、無関係な数列に当たる。
   * 「[2, 4]」→「24」になるため「2024年」にヒットする。
   * 問題作成ガイドは「各要素は2文字以上」とルール化しているが、
   * このケースはガイドを守っていても起きる（正規化後に短くなるため）。
   */
  it("U-068 【要判断】記号入りキーワードが無関係な数列にヒットする", () => {
    const r = scoreKeywords("2024年に追加されました", [{ match: ["[2, 4]"] }]);
    expect(normalizeForMatch("[2, 4]")).toBe("24");
    expect(r.hits[0]).toBe(true);
  });

  /** 🟡 コード側にキーワードの長さ下限が無い（ガイドのルールが強制されていない） */
  it("U-069 【要判断】1文字のキーワードが通ってしまう", () => {
    const r = scoreKeywords("1000円になります", [{ match: ["0"] }]);
    expect(r.hits[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §1-5 quoteVerified
// ---------------------------------------------------------------------------

describe("§1-5 quoteVerified", () => {
  it("U-070 回答に実在する引用は成立する", () => {
    expect(quoteVerified(EVIDENCE_REAL, ANSWER)).toBe(true);
  });

  it("U-071 回答に無い引用は成立しない", () => {
    expect(quoteVerified(EVIDENCE_FAKE, ANSWER)).toBe(false);
  });

  it("U-072 正規化後3字以下の引用は常に不成立", () => {
    expect(quoteVerified("abc", "abc を含む回答です")).toBe(false);
  });

  it("U-073 記号だけの引用は不成立", () => {
    expect(normalizeForMatch("「」（）、。・")).toBe("");
    expect(quoteVerified("「」（）、。・", ANSWER)).toBe(false);
  });

  it("U-074 20字を超える引用は先頭20字だけが照合される", () => {
    const evidence = EVIDENCE_LONG.slice(0, 20) + "ZZZ存在しない文字列";
    expect(quoteVerified(evidence, ANSWER)).toBe(true);
  });

  it("U-075 21字目以降だけが実在する引用は不成立", () => {
    const evidence = "XYZWXYZWXYZWXYZWXYZW" + EVIDENCE_REAL;
    expect(evidence.slice(0, 20)).toBe("XYZWXYZWXYZWXYZWXYZW");
    expect(quoteVerified(evidence, ANSWER)).toBe(false);
  });

  it("U-076 句読点・空白の違いは吸収される", () => {
    expect(quoteVerified("const宣言に、再代入", ANSWER)).toBe(true);
  });

  it("U-077 空の引用は不成立", () => {
    expect(quoteVerified("", ANSWER)).toBe(false);
  });

  it("U-078 空の回答に対しては常に不成立", () => {
    expect(quoteVerified(EVIDENCE_REAL, "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §1-6 正規化
// ---------------------------------------------------------------------------

describe("§1-6 正規化", () => {
  it("U-080 normalizeForMatch は全角・空白・句読点を落として小文字化する", () => {
    expect(normalizeForMatch("Ｔｙｐｅ Error、です。")).toBe("typeerrorです");
  });

  it("U-081 normalizeForMatch は各種の括弧・記号を落とす", () => {
    expect(normalizeForMatch("（あ）「い」【う】[え]:お;か!き?")).toBe("あいうえおかき");
  });

  it("U-082 normalizeForMatch はハイフン・アンダースコア・スラッシュを残す", () => {
    expect(normalizeForMatch("a-b_c/d")).toBe("a-b_c/d");
  });

  it("U-083 normalizeAnswer は空白を1つに畳んで trim する", () => {
    expect(normalizeAnswer("  a\n\n b  ")).toBe("a b");
  });

  it("U-084 normalizeAnswer は NFKC 正規化する", () => {
    expect(normalizeAnswer("ｴﾗｰ")).toBe("エラー");
  });

  it("U-085 normalizeAnswer は記号を残す（照合用との違い）", () => {
    expect(normalizeAnswer("a、b。")).toBe("a、b。");
  });
});
