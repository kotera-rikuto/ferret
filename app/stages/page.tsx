import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProgress } from "@/lib/progress/unlock";
import { StageMap, type Stage } from "@/components/stage/StageMap";
import { LogoutButton } from "@/components/auth/LogoutButton";


export default async function StagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 解放状態の計算は問題画面・採点APIと共通の関数に寄せてある。
  // 表示（ここ）と実際のガードが同じ答えを出すことを保証するため
  const admin = createAdminClient();
  const { problems, clearedFlags, currentIndex } = await loadProgress(
    admin,
    supabase,
    user.id,
  );

  const stages: Stage[] = problems.map((p, i) => ({
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
