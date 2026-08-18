/**
 * lib/progress/level.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §13。
 *
 * XP は「増えた数字」なので、ズレても画面は普通に描画される（少し小さいだけ）。
 * ストリークと同じく、目視では気づけない種類の計算なのでここで固める。
 *
 * 特に押さえたいのは2つ。
 *   - **同じ問題を解き直しても、最高点が伸びなければ増えない**（稼ぎ場にしない）
 *   - **点が下がっても減らない**（一度手に入れたものは減らない、という見せ方）
 * どちらも「実装がそうなっている」だけでは、後から1回ごとの加算に書き換えられる。
 */

import { describe, it, expect } from "vitest";
import { CLEAR_THRESHOLD, PERFECT_THRESHOLD } from "@/lib/ai/compose";
import {
  XP_CLEAR,
  XP_PERFECT,
  XP_PER_LEVEL,
  bestScoreByProblem,
  levelFromXp,
  totalXp,
  xpForScore,
  xpGain,
  xpView,
} from "@/lib/progress/level";

/**
 * しきい値は compose.ts のものを使う。ここで 55 / 80 と直接書くと、
 * 採点側でしきい値を動かしたときにテストだけが古い基準で通り続ける
 * （v2 → v3 で 65 → 55 に変えたとき、画面側の直書きが残った経緯がある）。
 */
const JUST_CLEARED = CLEAR_THRESHOLD;
const NOT_CLEARED = CLEAR_THRESHOLD - 1;
const JUST_PERFECT = PERFECT_THRESHOLD;
const CLEARED_HIGH = PERFECT_THRESHOLD - 1;

describe("§13-1 xpForScore", () => {
  it("U-600 クリアに届かない点では増えない", () => {
    expect(xpForScore(0)).toBe(0);
    expect(xpForScore(NOT_CLEARED)).toBe(0);
  });

  it("U-601 クリア帯はクリアぶん", () => {
    expect(xpForScore(JUST_CLEARED)).toBe(XP_CLEAR);
    expect(xpForScore(CLEARED_HIGH)).toBe(XP_CLEAR);
  });

  it("U-602 パーフェクト帯は上乗せされる", () => {
    expect(xpForScore(JUST_PERFECT)).toBe(XP_PERFECT);
    expect(xpForScore(100)).toBe(XP_PERFECT);
    expect(XP_PERFECT).toBeGreaterThan(XP_CLEAR);
  });

  it("U-603 帯の切り替わりはしきい値ちょうどで起きる", () => {
    // 「クリアなのに XP が0」「不合格なのに XP が入る」を作らない。
    // 採点側のしきい値と1点でもずれると、リザルトの合否と XP が食い違う
    expect(xpForScore(CLEAR_THRESHOLD - 1)).toBe(0);
    expect(xpForScore(CLEAR_THRESHOLD)).toBe(XP_CLEAR);
    expect(xpForScore(PERFECT_THRESHOLD - 1)).toBe(XP_CLEAR);
    expect(xpForScore(PERFECT_THRESHOLD)).toBe(XP_PERFECT);
  });
});

describe("§13-2 bestScoreByProblem", () => {
  it("U-610 問題ごとの最高点にまとめる", () => {
    const best = bestScoreByProblem([
      { problem_id: 1, total_score: 40 },
      { problem_id: 1, total_score: 73 },
      { problem_id: 2, total_score: 92 },
    ]);
    expect(best.get(1)).toBe(73);
    expect(best.get(2)).toBe(92);
  });

  it("U-611 あとの回答で点が下がっても最高点は下がらない", () => {
    const best = bestScoreByProblem([
      { problem_id: 1, total_score: 92 },
      { problem_id: 1, total_score: 20 },
    ]);
    expect(best.get(1)).toBe(92);
  });

  it("U-612 指定した回答を除いて数えられる（この回答より前の最高点）", () => {
    const rows = [
      { id: "a", problem_id: 1, total_score: 60 },
      { id: "b", problem_id: 1, total_score: 92 },
    ];
    expect(bestScoreByProblem(rows, "b").get(1)).toBe(60);
    // 除いた結果その問題の回答が無くなれば、そもそも入っていない
    expect(bestScoreByProblem([rows[1]], "b").has(1)).toBe(false);
  });

  it("U-613 回答が無ければ空", () => {
    expect(bestScoreByProblem([]).size).toBe(0);
  });
});

describe("§13-3 totalXp", () => {
  it("U-620 最高点の集まりから累計を出す", () => {
    expect(totalXp([JUST_CLEARED, JUST_PERFECT])).toBe(XP_CLEAR + XP_PERFECT);
  });

  it("U-621 未回答なら0", () => {
    expect(totalXp([])).toBe(0);
  });

  it("U-622 クリアしていない問題は数に入らない", () => {
    expect(totalXp([NOT_CLEARED, NOT_CLEARED, JUST_CLEARED])).toBe(XP_CLEAR);
  });

  /**
   * 🔴 稼ぎ場にしないための本体。
   *
   * 同じ問題のクリアが何行積まれても、最高点が伸びていなければ累計は動かない。
   * ここが1回ごとの加算に変わると、解き直すだけで無限に増やせるようになり、
   * しかも解き直し1回ごとにこちら側の採点原価（約¥0.04）がかかる。
   */
  it("U-623 同じ問題を何度クリアしても、最高点が同じなら増えない", () => {
    const once = [{ problem_id: 1, total_score: 73 }];
    const threeTimes = [
      { problem_id: 1, total_score: 73 },
      { problem_id: 1, total_score: 73 },
      { problem_id: 1, total_score: 73 },
    ];
    expect(totalXp(bestScoreByProblem(threeTimes).values())).toBe(
      totalXp(bestScoreByProblem(once).values()),
    );
  });

  it("U-624 全100問クリアで1,000、全問パーフェクトで1,500", () => {
    // ② の設計（1レベル = クリア10問ぶん）の前提になる数字
    const allCleared = Array.from({ length: 100 }, () => JUST_CLEARED);
    const allPerfect = Array.from({ length: 100 }, () => JUST_PERFECT);
    expect(totalXp(allCleared)).toBe(100 * XP_CLEAR);
    expect(totalXp(allPerfect)).toBe(100 * XP_PERFECT);
  });
});

describe("§13-4 xpGain", () => {
  it("U-630 初めてクリアしたらクリアぶん増える", () => {
    expect(xpGain(0, JUST_CLEARED)).toBe(XP_CLEAR);
  });

  it("U-631 初めてのクリアがパーフェクトならその額", () => {
    expect(xpGain(0, JUST_PERFECT)).toBe(XP_PERFECT);
  });

  /**
   * 🔴 同一回答の再送（リプレイ）で増えないこと。
   *
   * 採点API はリプレイでも user_attempts に行を作る（usage.replayed = true）。
   * 1回ごとの加算だと、送信ボタンを押すだけで増える経路になる。
   * 最高点の差で見れば、点が同じなので差が0になり、判定を書かずに防げる。
   */
  it("U-632 同じ点をもう一度取っても増えない", () => {
    expect(xpGain(73, 73)).toBe(0);
    expect(xpGain(JUST_PERFECT, JUST_PERFECT)).toBe(0);
  });

  it("U-633 クリアからパーフェクトへ伸ばしたら差ぶんだけ", () => {
    expect(xpGain(JUST_CLEARED, JUST_PERFECT)).toBe(XP_PERFECT - XP_CLEAR);
  });

  it("U-634 同じ帯の中で点が伸びても増えない", () => {
    // 帯（不合格 / クリア / パーフェクト）で決まるので、60 → 73 は同じ額
    expect(xpGain(JUST_CLEARED, CLEARED_HIGH)).toBe(0);
  });

  it("U-635 点が下がっても減らない", () => {
    // 100点のあとに復習で20点を取っても、手に入れたものは減らさない
    expect(xpGain(100, 20)).toBe(0);
    expect(xpGain(JUST_PERFECT, NOT_CLEARED)).toBe(0);
  });

  it("U-636 クリアに届かない回では増えない", () => {
    expect(xpGain(0, NOT_CLEARED)).toBe(0);
    expect(xpGain(NOT_CLEARED, NOT_CLEARED)).toBe(0);
  });
});

describe("§13-5 levelFromXp", () => {
  it("U-640 0 XP はレベル1（レベル0を作らない）", () => {
    const state = levelFromXp(0);
    expect(state.level).toBe(1);
    expect(state.percent).toBe(0);
    expect(state.xpToNext).toBe(XP_PER_LEVEL);
  });

  it("U-641 クリア10問ぶんでレベルが1つ上がる", () => {
    expect(levelFromXp(XP_PER_LEVEL - 1).level).toBe(1);
    expect(levelFromXp(XP_PER_LEVEL).level).toBe(2);
    expect(levelFromXp(XP_PER_LEVEL * 2).level).toBe(3);
  });

  it("U-642 レベルの途中では残りと塗りを出す", () => {
    const half = levelFromXp(XP_PER_LEVEL + XP_PER_LEVEL / 2);
    expect(half.level).toBe(2);
    expect(half.xpInLevel).toBe(XP_PER_LEVEL / 2);
    expect(half.xpToNext).toBe(XP_PER_LEVEL / 2);
    expect(half.percent).toBe(50);
  });

  it("U-643 全100問クリアでレベル11に届く", () => {
    // ②の判断は「クリア10問ぶんで1レベル」。0 XP がレベル1なので、
    // 100問クリア（1,000 XP）はレベル11、全問パーフェクトなら16になる
    expect(levelFromXp(100 * XP_CLEAR).level).toBe(11);
    expect(levelFromXp(100 * XP_PERFECT).level).toBe(16);
  });

  it("U-644 上限を設けない", () => {
    expect(levelFromXp(XP_PER_LEVEL * 999).level).toBe(1000);
  });

  it("U-645 負の値・小数でも壊れない", () => {
    // 表示のためだけの数字なので、例外ではなく安全側の値に丸める
    expect(levelFromXp(-50)).toEqual(levelFromXp(0));
    expect(levelFromXp(10.9).xpInLevel).toBe(10);
  });

  it("U-646 塗りは 0〜100 に収まる", () => {
    for (const xp of [0, 1, 49, 50, 99, XP_PER_LEVEL, XP_PER_LEVEL * 7 + 3]) {
      const { percent } = levelFromXp(xp);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});

describe("§13-6 xpView", () => {
  it("U-650 増えた回は、前の位置と今の位置の両方を返す", () => {
    const view = xpView(XP_CLEAR * 3, XP_CLEAR);
    expect(view.total).toBe(XP_CLEAR * 3);
    expect(view.gain).toBe(XP_CLEAR);
    expect(view.before.xpInLevel).toBe(XP_CLEAR * 2);
    expect(view.now.xpInLevel).toBe(XP_CLEAR * 3);
  });

  it("U-651 増えていない回は前と今が同じ（バーが動かない）", () => {
    const view = xpView(XP_CLEAR * 3, 0);
    expect(view.before).toEqual(view.now);
  });

  it("U-652 レベルが上がった回は、前のレベルが1つ小さい", () => {
    const view = xpView(XP_PER_LEVEL, XP_CLEAR);
    expect(view.before.level).toBe(1);
    expect(view.now.level).toBe(2);
  });

  it("U-653 増えぶんが累計を超えて渡されても食い違わせない", () => {
    // 「+15 XP」と出ているのにバーが 10 ぶんしか進んでいない、を作らない
    const view = xpView(XP_CLEAR, XP_PERFECT);
    expect(view.gain).toBe(XP_CLEAR);
    expect(view.before.xpInLevel).toBe(0);
  });

  it("U-654 累計0・増加0（未クリアの回）でも成り立つ", () => {
    const view = xpView(0, 0);
    expect(view.total).toBe(0);
    expect(view.gain).toBe(0);
    expect(view.now.level).toBe(1);
    expect(view.before).toEqual(view.now);
  });
});
