// ステージの解放状態。**画面と採点APIで同じ計算を使うためにここに1本化してある。**
//
// 判定ロジックを2箇所に書くと、片方だけ直したときに「画面では鍵がかかっているのに
// API は通る」というズレが生まれる。アクセス制御の穴はたいていこの形で入るので、
// 表示（app/stages）とガード（app/problems・app/api/score）は必ずこの関数を通す。

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEAR_THRESHOLD } from "@/lib/ai/compose";

export type ProgressProblem = {
  id: number;
  order: number;
  title: string | null;
};

export type Progress = {
  /** order 昇順の問題一覧 */
  problems: ProgressProblem[];
  /** 問題ごとの最高スコア（判定保留を除く） */
  bestScores: Map<number, number>;
  /** クリア済みか（problems と同じ並び） */
  clearedFlags: boolean[];
  /** 現在地の添字。全問クリア済みなら -1 */
  currentIndex: number;
  /** 開いてよい問題の id */
  unlockedIds: Set<number>;
};

/**
 * @param admin   problems を読むための service_role クライアント
 *                （problems は RLS ポリシーを持たないので、こちらでしか読めない）
 * @param session ログイン中ユーザーのクライアント。
 *                回答履歴は RLS で自分の行だけに絞られる。
 *                仮に RLS が壊れて0件になっても「未クリア＝より多くロック」に倒れるので、
 *                安全側に転ぶ。ここを service_role にすると、その保険が消える。
 */
export async function loadProgress(
  admin: SupabaseClient,
  session: SupabaseClient,
  userId: string,
): Promise<Progress> {
  const [{ data: problems }, { data: attempts }] = await Promise.all([
    admin.from("problems").select("id, order, title").order("order"),
    session
      .from("user_attempts")
      .select("problem_id, total_score")
      // RLS でも絞られるが、条件は明示しておく（RLS の有無に依存しない）
      .eq("user_id", userId)
      // 判定保留（レート上限時に層1のみで採点した回）は進行判定に使わない
      .eq("is_provisional", false),
  ]);

  const list: ProgressProblem[] = problems ?? [];

  const bestScores = new Map<number, number>();
  for (const a of attempts ?? []) {
    const current = bestScores.get(a.problem_id) ?? 0;
    if (a.total_score > current) bestScores.set(a.problem_id, a.total_score);
  }

  const clearedFlags = list.map(
    (p) => (bestScores.get(p.id) ?? 0) >= CLEAR_THRESHOLD,
  );

  // 未クリアの先頭が現在地。全問クリア済みなら -1
  const currentIndex = clearedFlags.indexOf(false);
  const lastOpen = currentIndex === -1 ? list.length - 1 : currentIndex;

  // 「現在地まで」に加えて「クリア済みの問題」も必ず開けておく。
  // 途中に新しい問題を差し込んだとき、その先でクリア済みの問題が
  // 鍵付きに戻ってしまうのを防ぐため
  const unlockedIds = new Set<number>();
  list.forEach((p, i) => {
    if (i <= lastOpen || clearedFlags[i]) unlockedIds.add(p.id);
  });

  return { problems: list, bestScores, clearedFlags, currentIndex, unlockedIds };
}
