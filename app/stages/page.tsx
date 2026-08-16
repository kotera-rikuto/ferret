import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CLEAR_THRESHOLD } from "@/lib/ai/compose";
import { createAdminClient } from "@/lib/supabase/admin";
import { StageMap, type Stage } from "@/components/stage/StageMap";
import { LogoutButton } from "@/components/auth/LogoutButton";


export default async function StagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 問題一覧。model_answer / ai_rubric は含めない
  const admin = createAdminClient();
  const { data: problems } = await admin
    .from("problems")
    .select("id, order, title")
    .order("order");

  // 自分の回答履歴。session クライアント経由なので RLS で自分の行だけに絞られる
  const { data: attempts } = await supabase
    .from("user_attempts")
    .select("problem_id, total_score")
    // 判定保留は進行判定に使わない
    .eq("is_provisional", false);

  // 問題ごとの最高スコア
  const bestScores = new Map<number, number>();
  for (const a of attempts ?? []) {
    const current = bestScores.get(a.problem_id) ?? 0;
    if (a.total_score > current) bestScores.set(a.problem_id, a.total_score);
  }

  // 未クリアの先頭が現在地。それ以降はロック
  const clearedFlags = (problems ?? []).map(
    (p) => (bestScores.get(p.id) ?? 0) >= CLEAR_THRESHOLD,
  );
  // 全問クリア済みなら -1 になり、current は存在しない
  const currentIndex = clearedFlags.indexOf(false);

  const stages: Stage[] = (problems ?? []).map((p, i) => ({
    id: p.id,
    order: p.order,
    title: p.title ?? `Stage ${p.order}`,
    status: clearedFlags[i]
      ? "cleared"
      : i === currentIndex
        ? "current"
        : "locked",
  }));

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center py-16">
      <div className="w-full max-w-md flex items-center justify-between px-6 mb-16">
        <h1 className="text-zinc-50 text-2xl font-bold">ステージ選択</h1>
        <LogoutButton />
      </div>

      {stages.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          問題がまだ登録されていません。
        </p>
      ) : (
        <StageMap stages={stages} />
      )}
    </div>
  );
}
