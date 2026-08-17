/**
 * lib/ai/prompt.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §4。
 *
 * ここは主に「プロンプトキャッシュが効く形を崩していないか」の回帰テスト。
 * 先頭の不変部分が全リクエスト共通の前方一致になっているから
 * キャッシュ命中率97%が出ている。可変部が先頭に混ざると原価が跳ね上がる。
 */

import { describe, it, expect } from "vitest";
import { MATCHED_REJECT_VALUES } from "@/lib/ai/schema";
import {
  STATIC_PROMPT,
  problemBlock,
  wrapAnswer,
  type ProblemForScoring,
} from "@/lib/ai/prompt";

const PROBLEM: ProblemForScoring = {
  id: 5,
  code: "function applyCoupon(price) {\n  const rate = 0.9;\n  rate = 0.8;\n}",
  question: "このコードを実行すると何が起きますか。",
  model_answer: "const の rate に再代入しているため TypeError で止まります。",
  reading_type: "トレース",
  rubric_items: {
    core: "const の rate への再代入でエラーになるという結論を指していれば満たす",
    ground: "3行目の rate = 0.8 が const 宣言への再代入である点に触れていれば満たす",
    depth: "TypeError という具体的なエラー名に触れていれば満たす",
    core_reject: ["900 が出力されると読んでいる", "let の total が問題だと読んでいる"],
  },
};

describe("§4 STATIC_PROMPT", () => {
  it("U-150 問題データに依存しない定数である", () => {
    expect(typeof STATIC_PROMPT).toBe("string");
    // テンプレートの差し込み跡が残っていないこと
    expect(STATIC_PROMPT).not.toMatch(/\$\{/);
    expect(STATIC_PROMPT).not.toContain("undefined");
  });

  it("U-151 内容が意図せず変わっていない（スナップショット）", () => {
    // 更新するときは必ずゴールデンセット（残課題 §8）を回してから
    expect(STATIC_PROMPT).toMatchSnapshot();
  });

  it("U-152 プロンプトキャッシュの発動域（1,024トークン相当）を超えている", () => {
    // 日本語混じりで概ね 1 トークン = 1〜2 文字。2,000字あれば確実に超える
    expect(STATIC_PROMPT.length).toBeGreaterThan(2000);
  });

  it("U-152b 4観点と3段階がすべて説明されている", () => {
    for (const axis of ["core", "ground", "depth", "articulation"]) {
      expect(STATIC_PROMPT).toContain(axis);
    }
    for (const verdict of ["full", "partial", "none"]) {
      expect(STATIC_PROMPT).toContain(verdict);
    }
  });

  it("U-152c 6種類の読解型すべてに depth の条件がある", () => {
    for (const type of ["トレース", "意図", "ズレ", "影響", "命名", "仕様"]) {
      expect(STATIC_PROMPT).toContain(type);
    }
  });

  /**
   * matched_reject（残課題 §3）。番号で答えさせる指示と、
   * 「点数は変わらない」という但し書きの両方が要る。
   * 但し書きが無いと、当てはめること自体が減点だと解釈して
   * モデルが none に寄る（＝集計の材料が集まらない）。
   */
  it("U-160 matched_reject を番号で答えさせる指示がある", () => {
    expect(STATIC_PROMPT).toContain("matched_reject");
    expect(STATIC_PROMPT).toContain("none");
    expect(STATIC_PROMPT).toContain("点数を変えません");
  });

  /**
   * プロンプトが許す番号と、スキーマが許す値は同じでなければならない。
   * スキーマだけ広げるとプロンプトが古い範囲を案内し続け、
   * プロンプトだけ広げるとモデルが出せない番号を案内することになる。
   */
  it("U-160b 案内している番号の範囲がスキーマの enum と揃っている", () => {
    expect(STATIC_PROMPT).toContain("番号は 1〜3 のみ");
    expect([...MATCHED_REJECT_VALUES]).toEqual(["none", "1", "2", "3"]);
  });

  /**
   * 残課題 §4。読み違いを指摘するときに場所を示さない案内が出ていた。
   * 「もう一度追ってみてください」を禁じる指示は元からあるが、
   * **必ず場所を入れる**という要求は matched_reject の追加と合わせて足した。
   */
  it("U-161 読み違いを検出したときは場所を示すよう求めている", () => {
    expect(STATIC_PROMPT).toContain("その読み方が成り立たなくなる箇所");
    expect(STATIC_PROMPT).toContain("行番号");
    expect(STATIC_PROMPT).toContain("場所を特定しない案内は書きません");
  });
});

describe("§4 problemBlock", () => {
  it("U-153 採点に必要な材料が揃っている", () => {
    const block = problemBlock(PROBLEM);
    expect(block).toContain(PROBLEM.code);
    expect(block).toContain(PROBLEM.question);
    expect(block).toContain(PROBLEM.reading_type);
    expect(block).toContain(PROBLEM.model_answer);
    expect(block).toContain(PROBLEM.rubric_items.core);
    expect(block).toContain(PROBLEM.rubric_items.ground);
    expect(block).toContain(PROBLEM.rubric_items.depth);
  });

  it("U-154 層1のキーワードを AI に見せない", () => {
    // ScoringInput は keywords を持つが、problemBlock に渡す
    // ProblemForScoring には含まれない。混ざっていないことを実際に確かめる
    const withKeywords = {
      ...PROBLEM,
      keywords: [{ match: ["ヒミツのキーワード"] }],
    } as ProblemForScoring;
    const block = problemBlock(withKeywords);
    expect(block).not.toContain("ヒミツのキーワード");
    expect(block).not.toContain("keywords");
  });

  it("U-155 core_reject を 1. 2. の番号付きで並べる", () => {
    const block = problemBlock(PROBLEM);
    expect(block).toContain("1. 900 が出力されると読んでいる");
    expect(block).toContain("2. let の total が問題だと読んでいる");
  });

  it("U-156 core_reject が3件以上でも連番になる", () => {
    const block = problemBlock({
      ...PROBLEM,
      rubric_items: { ...PROBLEM.rubric_items, core_reject: ["あ", "い", "う"] },
    });
    expect(block).toContain("1. あ");
    expect(block).toContain("2. い");
    expect(block).toContain("3. う");
  });
});

describe("§4 wrapAnswer", () => {
  it("U-157 回答を nonce 付きの区切りで挟む", () => {
    const wrapped = wrapAnswer("エラーになります", "abc12345");
    expect(wrapped).toContain("<<<ANSWER_BEGIN:abc12345>>>");
    expect(wrapped).toContain("<<<ANSWER_END:abc12345>>>");
    expect(wrapped).toContain("エラーになります");
  });

  it("U-158 nonce が違えば区切りも違う（終端の先回りを防ぐ）", () => {
    const a = wrapAnswer("x", "aaaaaaaa");
    const b = wrapAnswer("x", "bbbbbbbb");
    expect(a).not.toBe(b);
  });

  it("U-159 改行を含む回答でも区切りが壊れない", () => {
    const wrapped = wrapAnswer("1行目\n2行目\n3行目", "abc12345");
    const lines = wrapped.split("\n");
    expect(lines[0]).toBe("<<<ANSWER_BEGIN:abc12345>>>");
    expect(lines[lines.length - 1]).toBe("<<<ANSWER_END:abc12345>>>");
  });
});
