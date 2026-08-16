/**
 * lib/progress/unlock.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §9。
 *
 * 接続先: 表示（app/stages）とガード（app/problems/[id]・/api/score）が
 * 揃ってこの関数を通す。判定を各所に書くと「画面では鍵がかかっているのに
 * API は通る」というズレが生まれるため。接続されていること自体は
 * 結合テスト I-400〜I-403 で検出する。
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProgress, type ProgressProblem } from "@/lib/progress/unlock";

type Attempt = { problem_id: number; total_score: number };

/** `from().select().order()` だけを再現する admin クライアント */
function adminStub(problems: ProgressProblem[] | null) {
  const tables: string[] = [];
  const columns: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      return {
        select(cols: string) {
          columns.push(cols);
          return {
            order: () => Promise.resolve({ data: problems }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, tables, columns };
}

/** `from().select().eq().eq()` を再現する session クライアント。await できる */
function sessionStub(attempts: Attempt[] | null) {
  const tables: string[] = [];
  const filters: Array<[string, unknown]> = [];
  const chain = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return chain;
    },
    then(onFulfilled: (v: { data: Attempt[] | null }) => unknown) {
      return Promise.resolve({ data: attempts }).then(onFulfilled);
    },
  };
  const client = {
    from(table: string) {
      tables.push(table);
      return { select: () => chain };
    },
  } as unknown as SupabaseClient;
  return { client, tables, filters };
}

const USER = "11111111-1111-1111-1111-111111111111";

/** order 1..n の問題を作る。id は order + 100 にして「id ≠ 並び順」を担保する */
function problems(n: number): ProgressProblem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i + 1,
    order: i + 1,
    title: `ステージ${i + 1}`,
  }));
}

function run(list: ProgressProblem[] | null, attempts: Attempt[] | null) {
  const admin = adminStub(list);
  const session = sessionStub(attempts);
  return {
    admin,
    session,
    result: loadProgress(admin.client, session.client, USER),
  };
}

describe("§9 loadProgress", () => {
  it("U-420 回答が無ければ先頭だけが開いている", async () => {
    const { result } = run(problems(5), []);
    const p = await result;
    expect(p.clearedFlags).toEqual([false, false, false, false, false]);
    expect(p.currentIndex).toBe(0);
    expect([...p.unlockedIds]).toEqual([101]);
  });

  it("U-421 1問目をクリアすると2問目まで開く", async () => {
    const { result } = run(problems(5), [{ problem_id: 101, total_score: 55 }]);
    const p = await result;
    expect(p.clearedFlags[0]).toBe(true);
    expect(p.currentIndex).toBe(1);
    expect([...p.unlockedIds].sort()).toEqual([101, 102]);
  });

  it("U-422 54点はクリアにならない（境界の下側）", async () => {
    const { result } = run(problems(3), [{ problem_id: 101, total_score: 54 }]);
    const p = await result;
    expect(p.clearedFlags[0]).toBe(false);
    expect(p.currentIndex).toBe(0);
  });

  it("U-423 55点ちょうどでクリアになる（境界）", async () => {
    const { result } = run(problems(3), [{ problem_id: 101, total_score: 55 }]);
    const p = await result;
    expect(p.clearedFlags[0]).toBe(true);
  });

  it("U-424 同じ問題に複数回答えたら最高点を採用する", async () => {
    const { result } = run(problems(3), [
      { problem_id: 101, total_score: 30 },
      { problem_id: 101, total_score: 70 },
    ]);
    const p = await result;
    expect(p.bestScores.get(101)).toBe(70);
    expect(p.clearedFlags[0]).toBe(true);
  });

  it("U-425 後から低い点を出してもクリアは維持される（意図的な非対称）", async () => {
    const { result } = run(problems(3), [
      { problem_id: 101, total_score: 70 },
      { problem_id: 101, total_score: 30 },
    ]);
    const p = await result;
    expect(p.clearedFlags[0]).toBe(true);
  });

  it("U-426 判定保留を進行判定から除外する条件が付いている", async () => {
    const { session, result } = run(problems(3), []);
    await result;
    expect(session.filters).toContainEqual(["is_provisional", false]);
  });

  it("U-427 全問クリアなら現在地は -1 で全件開く", async () => {
    const { result } = run(
      problems(3),
      [101, 102, 103].map((id) => ({ problem_id: id, total_score: 100 })),
    );
    const p = await result;
    expect(p.currentIndex).toBe(-1);
    expect(p.unlockedIds.size).toBe(3);
  });

  it("U-428 問題が0件でも落ちない", async () => {
    const { result } = run([], []);
    const p = await result;
    expect(p.currentIndex).toBe(-1);
    expect(p.unlockedIds.size).toBe(0);
  });

  it("U-429 問題の取得が null でも落ちない", async () => {
    const { result } = run(null, []);
    const p = await result;
    expect(p.problems).toEqual([]);
    expect(p.unlockedIds.size).toBe(0);
  });

  it("U-430 回答の取得が null なら全問未クリア（安全側に倒れる）", async () => {
    const { result } = run(problems(5), null);
    const p = await result;
    expect(p.clearedFlags.every((f) => f === false)).toBe(true);
    expect(p.unlockedIds.size).toBe(1);
  });

  it("U-431 途中に問題を差し込んでもクリア済みがロックに戻らない", async () => {
    // 3問クリア済みの状態で、3問目の前に新しい問題を差し込んだ想定。
    // 差し込まれた 103 は未クリアだが、その後ろの 104 はクリア済み
    const { result } = run(problems(5), [
      { problem_id: 101, total_score: 100 },
      { problem_id: 102, total_score: 100 },
      { problem_id: 104, total_score: 100 },
    ]);
    const p = await result;
    expect(p.currentIndex).toBe(2); // 差し込まれた 103 が現在地
    expect(p.unlockedIds.has(104)).toBe(true); // クリア済みは開いたまま
    expect(p.unlockedIds.has(105)).toBe(false); // その先は閉じたまま
  });

  it("U-432 回答の取得に user_id の条件を明示している", async () => {
    const { session, result } = run(problems(3), []);
    await result;
    expect(session.filters).toContainEqual(["user_id", USER]);
  });

  it("U-433 problems は admin、user_attempts は session クライアントで読む", async () => {
    const { admin, session, result } = run(problems(3), []);
    await result;
    expect(admin.tables).toEqual(["problems"]);
    expect(session.tables).toEqual(["user_attempts"]);
    // model_answer を引いていないこと
    expect(admin.columns[0]).toBe("id, order, title");
  });
});
