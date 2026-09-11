/**
 * ログイン前に読める範囲（`lib/progress/preview.ts`）の検査。
 * ケース定義は tests/unit/テストケース.md の §24。
 *
 * **ここが緩むと、そのまま無料と有料の境目が消える。**
 * 判定は1か所（あのファイル）にしかないので、画面も検索エンジンへの申告も
 * ここが返した答えをそのまま信じている ── 緩んだことは画面に出ない。
 */

import { describe, it, expect } from "vitest";
import {
  PREVIEW_MAX_ORDER,
  isPreviewOrder,
  listPreviewProblems,
  loadPreviewProgress,
} from "@/lib/progress/preview";

type Row = { id: number; order: number; title: string | null };

/**
 * `problems` だけに答える最小のクライアント。
 *
 * **`lte` を自分で当て直している**のが要点 ── 本物の DB は `order` で絞るが、
 * ここで絞らずに返すことで「呼び出し側が絞りを忘れていないか」も一緒に見られる
 * （`listPreviewProblems` は受け取った行に `isPreviewOrder` をもう一度かけている）。
 */
function fakeAdmin(rows: Row[], opts: { applyFilter?: boolean } = {}) {
  const { applyFilter = true } = opts;
  return {
    from() {
      let limit: number | null = null;
      const builder = {
        select: () => builder,
        lte: (_col: string, value: number) => {
          limit = value;
          return builder;
        },
        order: () => ({
          data: applyFilter && limit !== null
            ? rows.filter((r) => r.order <= (limit as number))
            : rows,
        }),
      };
      return builder;
    },
  } as never;
}

const ROWS: Row[] = [
  { id: 8, order: 1, title: "注文金額の計算を1行ずつ追う" },
  { id: 9, order: 2, title: "代入の順番を追う" },
  { id: 10, order: 3, title: "レスポンスに無い項目を読む" },
];

describe("§24 ログイン前に読める範囲", () => {
  it("U-910 開けるのは order が上限以下のものだけ", () => {
    expect(isPreviewOrder(1)).toBe(true);
    expect(isPreviewOrder(PREVIEW_MAX_ORDER)).toBe(true);
    expect(isPreviewOrder(PREVIEW_MAX_ORDER + 1)).toBe(false);
    expect(isPreviewOrder(100)).toBe(false);
  });

  it("U-911 0・負数・小数・null は開けない（URL から来る値を信じない）", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, null, undefined]) {
      expect(isPreviewOrder(bad as number), `${bad} を開けている`).toBe(false);
    }
  });

  it("U-912 id ではなく order で決める（実データは id 8 がステージ1）", async () => {
    const problems = await listPreviewProblems(fakeAdmin(ROWS));
    // id が 1 の行は存在しないのに、ステージ1は開いている
    expect(problems.map((p) => p.order)).toEqual([1]);
    expect(problems.map((p) => p.id)).toEqual([8]);
  });

  it("U-913 DB の絞り込みを素通りした行も、こちら側でもう一度落とす", async () => {
    // 絞り込みが効かない状態（クエリを書き換えた・RLS が変わった等）を作る。
    // **呼び出し側の1本だけに頼らない**ためのふるい
    const problems = await listPreviewProblems(
      fakeAdmin(ROWS, { applyFilter: false }),
    );
    expect(problems.map((p) => p.order)).toEqual([1]);
  });

  it("U-915 未ログインの進行状況は、開けた問題だけが unlocked", async () => {
    const progress = await loadPreviewProgress(fakeAdmin(ROWS, { applyFilter: false }));

    expect([...progress.unlockedIds]).toEqual([8]);
    // 記録は持てないので、クリア済みは1件も無い
    expect(progress.clearedFlags).toEqual([false, false, false]);
    expect(progress.bestScores.size).toBe(0);
    // 全体像は見せる（マップに101個並ぶ）
    expect(progress.problems).toHaveLength(3);
    // 現在地は先頭。`loadProgress` のように「未クリアの先頭まで開ける」ことはしない
    expect(progress.currentIndex).toBe(0);
  });

  it("U-916 問題が1件も無い環境でも落ちない", async () => {
    const progress = await loadPreviewProgress(fakeAdmin([]));
    expect(progress.problems).toEqual([]);
    expect(progress.currentIndex).toBe(-1);
    expect(progress.unlockedIds.size).toBe(0);
  });
});
