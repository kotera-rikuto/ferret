/**
 * lib/ai/hash.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §2。
 *
 * このハッシュが「同じ回答なら同じ点数」を保証する唯一の仕組み。
 * temperature: 0 は決定性を保証しないため、リプレイが壊れると
 * 同じ回答を出し直すたびに点数が動くようになる。
 */

import { describe, it, expect } from "vitest";
import { answerHash } from "@/lib/ai/hash";

const VERSION = "gpt-4o-mini-2024-07-18/p2";
const ANSWER = "const の rate に再代入しているためエラーになります";

describe("§2 answerHash", () => {
  it("U-100 同じ引数なら常に同じ値を返す", () => {
    const a = answerHash(5, VERSION, ANSWER);
    const b = answerHash(5, VERSION, ANSWER);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("U-101 problemId が違えば別の値になる", () => {
    expect(answerHash(5, VERSION, ANSWER)).not.toBe(answerHash(6, VERSION, ANSWER));
  });

  it("U-102 graderVersion が違えば別の値になる（採点基準を変えたら再採点）", () => {
    expect(answerHash(5, VERSION, ANSWER)).not.toBe(
      answerHash(5, "gpt-4o-mini-2024-07-18/p3", ANSWER),
    );
  });

  it("U-103 表記だけが違う再送は同じ値になる", () => {
    const normal = answerHash(5, VERSION, "エラーになります");
    // 半角カナ + 前後の余分な空白
    const messy = answerHash(5, VERSION, "  ｴﾗｰになります  ");
    expect(messy).toBe(normal);
  });

  it("U-106 語の途中の連続空白は1つに畳まれるだけで消えない", () => {
    // normalizeAnswer は \s+ を " " に置き換える。空白を除去はしないので、
    // 「エラーに なります」と「エラーになります」は別の回答として扱われる
    const collapsed = answerHash(5, VERSION, "エラーに   なります");
    expect(collapsed).toBe(answerHash(5, VERSION, "エラーに なります"));
    expect(collapsed).not.toBe(answerHash(5, VERSION, "エラーになります"));
  });

  it("U-104 句読点が違えば別の値になる（記号は意味を変えうる）", () => {
    expect(answerHash(5, VERSION, "エラーになります")).not.toBe(
      answerHash(5, VERSION, "エラーになります。"),
    );
  });

  it("U-105 空の回答でも落ちずに決定的な値を返す", () => {
    const a = answerHash(5, VERSION, "");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(answerHash(5, VERSION, ""));
  });
});
