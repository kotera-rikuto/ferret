/**
 * lib/stages/chapters.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §12。
 *
 * 章を DB カラムではなく定数で持つ判断をしているので、
 * **定数が構成案とズレていないこと自体をテストで守る。**
 * ズレても画面は普通に描画されるため（違う章名が出るだけ）、目視では気づけない。
 *
 * 出典: ideas/問題構成案.md v3（JS 1〜80 / TS 81〜100）
 */

import { describe, it, expect } from "vitest";
import { CHAPTERS, chapterOf } from "@/lib/stages/chapters";

describe("§12-1 章の定義", () => {
  it("U-560 全14章ある（構成案 v3）", () => {
    expect(CHAPTERS).toHaveLength(14);
  });

  it("U-561 章番号が 1〜14 の連番", () => {
    expect(CHAPTERS.map((c) => c.no)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
  });

  it("U-562 ステージ 1〜100 を隙間なく覆う", () => {
    const sorted = [...CHAPTERS].sort((a, b) => a.from - b.from);
    expect(sorted[0].from).toBe(1);
    expect(sorted[sorted.length - 1].to).toBe(100);

    for (let i = 1; i < sorted.length; i++) {
      // 前の章の終わりの次から始まる＝隙間も重なりも無い
      expect(sorted[i].from, `第${sorted[i].no}章の開始がずれている`).toBe(
        sorted[i - 1].to + 1,
      );
    }
  });

  it("U-563 どの章も範囲が正しい向きを向いている", () => {
    for (const c of CHAPTERS) {
      expect(c.from, `第${c.no}章`).toBeLessThanOrEqual(c.to);
      expect(c.from).toBeGreaterThan(0);
    }
  });

  it("U-564 章タイトルが空でなく、重複しない", () => {
    for (const c of CHAPTERS) expect(c.title.length).toBeGreaterThan(0);
    expect(new Set(CHAPTERS.map((c) => c.title)).size).toBe(CHAPTERS.length);
  });

  it("U-565 JS 編は 1〜80、TS 編は 81〜100（構成案の配分）", () => {
    const js = CHAPTERS.filter((c) => c.to <= 80);
    const ts = CHAPTERS.filter((c) => c.from >= 81);
    expect(js.length + ts.length).toBe(CHAPTERS.length);
    expect(js[js.length - 1].to).toBe(80);
    expect(ts[0].from).toBe(81);
  });

  it("U-566 章タイトルが NG語を含まない（UXルール）", () => {
    const ng = ["弱点", "間違い", "初心者", "失敗", "不正解", "苦手"];
    for (const c of CHAPTERS) {
      for (const w of ng) {
        expect(c.title, `第${c.no}章に NG語「${w}」`).not.toContain(w);
      }
    }
  });
});

describe("§12-2 chapterOf", () => {
  it("U-580 各章の先頭と末尾の order が、その章に解決する", () => {
    for (const c of CHAPTERS) {
      expect(chapterOf(c.from)?.no, `第${c.no}章の先頭`).toBe(c.no);
      expect(chapterOf(c.to)?.no, `第${c.no}章の末尾`).toBe(c.no);
    }
  });

  it("U-581 章の境目で切り替わる", () => {
    expect(chapterOf(7)?.no).toBe(1);
    expect(chapterOf(8)?.no).toBe(2);
    expect(chapterOf(80)?.no).toBe(10);
    expect(chapterOf(81)?.no).toBe(11);
  });

  it("U-582 1〜100 のすべてがどこかの章に属する", () => {
    for (let order = 1; order <= 100; order++) {
      expect(chapterOf(order), `order=${order} が章に属さない`).not.toBeNull();
    }
  });

  /**
   * 動作確認用の問題（order=999）や、テスト用に投入する 9000番台が該当する。
   * ここで例外を投げると、検証用の問題を1件入れただけでマップ全体が落ちる。
   */
  it("U-583 範囲外は null を返して落ちない", () => {
    expect(chapterOf(101)).toBeNull();
    expect(chapterOf(999)).toBeNull();
    expect(chapterOf(9001)).toBeNull();
    expect(chapterOf(0)).toBeNull();
    expect(chapterOf(-1)).toBeNull();
  });

  it("U-584 整数でない値でも落ちない", () => {
    expect(() => chapterOf(NaN)).not.toThrow();
    expect(chapterOf(NaN)).toBeNull();
    // 小数は範囲に入っていれば拾う（実データでは起きないが落ちないことを確認）
    expect(() => chapterOf(3.5)).not.toThrow();
  });
});
