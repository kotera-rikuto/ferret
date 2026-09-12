// ログインしていない人に見せる範囲。**判定の出どころはここ1か所**（C13・2026-09-11）。
//
// `lib/progress/unlock.ts` と役割を分けてある:
//   - `unlock.ts` … ログイン済みの人が「どこまで進んだか」で開く範囲
//   - ここ        … ログインしていない人に無条件で開く範囲（進みようが無いので定数）
//
// **2か所に書かないこと。** 画面（app/problems/[id]・app/stages）と
// 検索エンジンへの申告（lib/seo/）が別々の答えを出すと、
// 「検索結果には出ているのに開くとログイン画面」あるいはその逆になる。
//
// ⚠️ **採点（`app/api/score`）はここを見ない。** あちらは未ログインなら 401 のまま。
// 採点は1回あたり実費が出て、上限はすべて `user_id` に紐づいている
// （`ai_usage_daily`）ので、ログインしていない人の採点は**費用を誰にも紐づけられない**。
// 全体1日500回の上限があるため青天井にはならないが、
// アカウントを持たない誰かが全ユーザーぶんの枠を1日¥20ほどで使い切れてしまう。
// **ここは「読めるようにするだけ」の仕組み**（票 C13）。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Progress, ProgressProblem } from "@/lib/progress/unlock";

/**
 * ログイン前に「URL を配る」ためだけに読む問題。**`ProgressProblem` より狭い。**
 *
 * `difficulty` を含めていないのは、配り先（sitemap・`/llms.txt`）が使わないため。
 * 下の `listPreviewProblems` の「欄を増やさない」という約束を、型でも示しておく。
 */
export type PreviewProblem = Pick<ProgressProblem, "id" | "order" | "title">;

/**
 * ログイン前に読めるステージ番号（`problems.order`）の上限。**両端を含む。**
 *
 * **1問だけにしてある**（2026-09-11・オーナー判断）。LP の「1問目をみてみる」から
 * 入って「どういうものか」が伝わればよく、その先を見せるほど登録する理由が薄くなるため。
 *
 * ⚠️ **`id` ではなく `order` で区切っている。** 実データの `id` は
 * `order` と一致していない（ステージ1の id は 8）。`id` で書くと、
 * 問題を入れ直した日に**別の問題が黙って公開される。**
 *
 * 増やすときは `lib/seo/` 側（sitemap・/llms.txt）も自動で追随する ──
 * どちらもこの定数から引いた問題を載せるので、直すのはここだけでよい。
 */
export const PREVIEW_MAX_ORDER = 1;

/** そのステージ番号がログイン前に読めるか */
export function isPreviewOrder(order: number | null | undefined): boolean {
  return (
    typeof order === "number" &&
    Number.isInteger(order) &&
    order >= 1 &&
    order <= PREVIEW_MAX_ORDER
  );
}

/** ログイン前に読める問題（`order` 昇順）。読めなければ空 */
export async function listPreviewProblems(
  admin: SupabaseClient,
): Promise<PreviewProblem[]> {
  // **`select` の欄を増やさないこと。** `model_answer` と `rubric_items` は
  // ここから先（sitemap・LP のリンク）へ一切渡さない
  const { data } = await admin
    .from("problems")
    .select("id, order, title")
    // `order` は Postgres の予約語。引用符でくくらないと PostgREST が解釈できない
    // （tests/integration/architecture.test.ts の I-398 が見ている）
    .lte('"order"', PREVIEW_MAX_ORDER)
    .order("order");

  return (data ?? []).filter((p) => isPreviewOrder(p.order));
}

/**
 * ログインしていない人向けの進行状況。**`loadProgress` と同じ形を返す。**
 *
 * 同じ形にしてあるのは、ステージ選択の画面（`app/stages/page.tsx`）が
 * ログインの有無で別の描画経路を持たないようにするため。分けると、
 * 片方だけに手が入って「ログイン前だけ鍵が外れている」状態を作れてしまう。
 *
 * 中身は「何もクリアしていない人」と同じ ── ただし**現在地は進まない。**
 * `unlock.ts` は「未クリアの先頭まで」を開けるので、ログイン前でも
 * そのままでは全ステージが開いてしまう。ここでは
 * **`isPreviewOrder` を通ったものだけ**を `unlockedIds` に入れる。
 */
export async function loadPreviewProgress(
  admin: SupabaseClient,
): Promise<Progress> {
  // `difficulty` は星の表示に使う（E15）。**ログインの有無で欄を変えない** ──
  // この関数は `loadProgress` と同じ形を返す約束なので、片方だけ欠けると
  // 「ログインすると星が出る」という違いが生まれる
  const { data } = await admin
    .from("problems")
    .select("id, order, title, difficulty")
    .order("order");

  const problems: ProgressProblem[] = data ?? [];

  return {
    problems,
    // クリア記録はログインしないと持てない。空で返す
    bestScores: new Map(),
    clearedFlags: problems.map(() => false),
    // 先頭（ステージ1）が現在地。マップ上で「スタート」の吹き出しが出る位置
    currentIndex: problems.length === 0 ? -1 : 0,
    unlockedIds: new Set(
      problems.filter((p) => isPreviewOrder(p.order)).map((p) => p.id),
    ),
  };
}
