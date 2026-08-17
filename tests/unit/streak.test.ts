/**
 * lib/progress/streak.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §11。
 *
 * 日付の境界は目視で確かめにくく、しかもズレても画面は普通に描画される
 * （「3日連続」が「2日連続」になるだけ）。気づけない種類のバグなのでここで固める。
 *
 * 特に **JST の深夜0時** が要点。サーバーは UTC で動くので、
 * 素直に書くと日本時間の夜9時以降が翌日扱いになる。
 * 無料枠のリセット（1日3問・JST 深夜0時）も同じ境界を使うことになる。
 */

import { describe, it, expect } from "vitest";
import { calcStreak, toJstDate } from "@/lib/progress/streak";

describe("§11-1 toJstDate", () => {
  it("U-500 UTC の日時を JST の日付に直す", () => {
    // UTC 2026-08-17 03:00 = JST 12:00 同日
    expect(toJstDate("2026-08-17T03:00:00Z")).toBe("2026-08-17");
  });

  it("U-501 JST の深夜0時ちょうどで日付が変わる", () => {
    // UTC 15:00 = JST 翌日 00:00
    expect(toJstDate("2026-08-16T15:00:00Z")).toBe("2026-08-17");
  });

  it("U-502 その1秒前はまだ前日", () => {
    expect(toJstDate("2026-08-16T14:59:59Z")).toBe("2026-08-16");
  });

  it("U-503 UTC では前日でも JST では当日になる（夜の回答）", () => {
    // 日本時間 8/17 の朝6時は UTC では 8/16 の21時
    expect(toJstDate("2026-08-16T21:00:00Z")).toBe("2026-08-17");
  });

  it("U-504 Date オブジェクトでも同じ結果になる", () => {
    const iso = "2026-08-16T15:00:00Z";
    expect(toJstDate(new Date(iso))).toBe(toJstDate(iso));
  });

  it("U-505 月末・年末をまたいでも正しい", () => {
    // UTC 2026-12-31 15:00 = JST 2027-01-01 00:00
    expect(toJstDate("2026-12-31T15:00:00Z")).toBe("2027-01-01");
    expect(toJstDate("2026-12-31T14:59:59Z")).toBe("2026-12-31");
  });

  it("U-506 常に YYYY-MM-DD の10文字で、月日はゼロ埋めされる", () => {
    expect(toJstDate("2026-01-05T03:00:00Z")).toBe("2026-01-05");
    expect(toJstDate("2026-01-05T03:00:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("§11-2 calcStreak", () => {
  const TODAY = "2026-08-17";

  it("U-520 回答が1件も無ければ 0", () => {
    expect(calcStreak([], TODAY)).toBe(0);
  });

  it("U-521 きょう回答していれば 1", () => {
    expect(calcStreak(["2026-08-17"], TODAY)).toBe(1);
  });

  it("U-522 きょうと昨日で 2", () => {
    expect(calcStreak(["2026-08-17", "2026-08-16"], TODAY)).toBe(2);
  });

  /**
   * この仕様が肝。きょうまだ回答していなくても、きのうまで続いていれば
   * その値を返す。「朝アプリを開いた瞬間に 0 に見える」と続ける動機が折れるため。
   */
  it("U-523 きょう未回答でも、きのうまで続いていれば途切れない", () => {
    expect(calcStreak(["2026-08-16", "2026-08-15"], TODAY)).toBe(2);
  });

  it("U-524 きょうも昨日も無ければ 0（一昨日までしか無い）", () => {
    expect(calcStreak(["2026-08-15", "2026-08-14"], TODAY)).toBe(0);
  });

  it("U-525 きょう回答すると、きのうまでの値に +1 される", () => {
    const before = calcStreak(["2026-08-16", "2026-08-15"], TODAY);
    const after = calcStreak(["2026-08-17", "2026-08-16", "2026-08-15"], TODAY);
    expect(after).toBe(before + 1);
  });

  it("U-526 途切れたらそこで止まる", () => {
    // 8/17, 8/16 は連続。8/15 が抜けているので 8/14 以前は数えない
    expect(
      calcStreak(["2026-08-17", "2026-08-16", "2026-08-14", "2026-08-13"], TODAY),
    ).toBe(2);
  });

  it("U-527 同じ日が複数あっても1日として数える", () => {
    // 1日に何問解いても連続日数は増えない
    expect(
      calcStreak(["2026-08-17", "2026-08-17", "2026-08-17", "2026-08-16"], TODAY),
    ).toBe(2);
  });

  it("U-528 順不同で渡してよい", () => {
    const shuffled = ["2026-08-15", "2026-08-17", "2026-08-16"];
    expect(calcStreak(shuffled, TODAY)).toBe(3);
  });

  it("U-529 未来の日付は連続の起点にならない", () => {
    // 端末の時計がずれている場合など
    expect(calcStreak(["2026-08-18", "2026-08-19"], TODAY)).toBe(0);
  });

  it("U-530 月をまたいでも数え続ける", () => {
    expect(calcStreak(["2026-09-01", "2026-08-31", "2026-08-30"], "2026-09-01")).toBe(3);
  });

  it("U-531 年をまたいでも数え続ける", () => {
    expect(calcStreak(["2027-01-01", "2026-12-31", "2026-12-30"], "2027-01-01")).toBe(3);
  });

  it("U-532 うるう年の2月29日をまたげる", () => {
    // 2028年はうるう年
    expect(calcStreak(["2028-03-01", "2028-02-29", "2028-02-28"], "2028-03-01")).toBe(3);
  });

  it("U-533 うるう年でない年は2月28日の次が3月1日", () => {
    expect(calcStreak(["2027-03-01", "2027-02-28"], "2027-03-01")).toBe(2);
    // 存在しない 2/29 が混ざっていても連続とはみなさない
    expect(calcStreak(["2027-03-01", "2027-02-29"], "2027-03-01")).toBe(1);
  });

  it("U-534 Set を直接渡せる（Iterable を受ける）", () => {
    expect(calcStreak(new Set(["2026-08-17", "2026-08-16"]), TODAY)).toBe(2);
  });

  it("U-535 長く続いた場合も数え切る", () => {
    const days: string[] = [];
    const d = new Date("2026-08-17T00:00:00Z");
    for (let i = 0; i < 365; i++) {
      days.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() - 1);
    }
    expect(calcStreak(days, TODAY)).toBe(365);
  });

  it("U-536 画面が使う組み合わせ（ISO の配列 → 日付 → 連続日数）が繋がる", () => {
    // app/stages/page.tsx と同じ流れ。JST の深夜をまたぐ時刻を混ぜてある
    const rows = [
      "2026-08-16T15:30:00Z", // JST 8/17 00:30
      "2026-08-16T02:00:00Z", // JST 8/16 11:00
      "2026-08-15T04:00:00Z", // JST 8/15 13:00
    ];
    const streak = calcStreak(rows.map(toJstDate), toJstDate("2026-08-17T03:00:00Z"));
    expect(streak).toBe(3);
  });
});
