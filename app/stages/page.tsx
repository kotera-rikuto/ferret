import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProgress } from "@/lib/progress/unlock";
import { calcStreak, toJstDate } from "@/lib/progress/streak";
import { StageMap, type Stage } from "@/components/stage/StageMap";
import { IconFlame } from "@/components/ui/icons";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Mascot } from "@/components/ui/Mascot";


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

  const clearedCount = clearedFlags.filter(Boolean).length;
  const progressPercent =
    stages.length === 0 ? 0 : Math.round((clearedCount / stages.length) * 100);

  // ストリークは回答ログから毎回導出する（カウンタを別に持たない。lib/progress/streak.ts）。
  // session クライアント経由なので RLS で自分の行に絞られる
  const { data: attemptDates } = await supabase
    .from("user_attempts")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(366);
  const streak = calcStreak(
    (attemptDates ?? []).map((a) => toJstDate(a.created_at)),
    toJstDate(new Date()),
  );

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 gap-8 px-6 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
      <AppSidebar email={user.email ?? null} />

      <main className="flex flex-col gap-5 py-5 pb-28">
        {/* lg 未満はサイドバーが消えるので、最低限のヘッダーで代用する */}
        <header className="flex items-center justify-between lg:hidden">
          <span className="flex items-center gap-2 text-xl font-extrabold">
            <Mascot className="w-7 h-7" />
            Ferret
          </span>
          <LogoutButton />
        </header>

        {stages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <Mascot mood="thinking" className="w-28" />
            <p className="text-sm font-bold text-muted">
              問題がまだ登録されていません。
            </p>
          </div>
        ) : (
          <StageMap stages={stages} />
        )}
      </main>

      <aside className="hidden lg:flex sticky top-0 h-dvh flex-col gap-4 border-l-2 border-line py-9 pl-5">
        {/* 0日を罰に見せない: 数字の0ではなく「きょう解くと1日目」と言い換える */}
        <div className="rounded-2xl border-2 border-line bg-panel p-5">
          <h3 className="mb-3 text-sm font-extrabold">つづけた日数</h3>
          <div className="flex items-center gap-3">
            <IconFlame
              size={28}
              className={streak > 0 ? "text-brand" : "text-locked-ink"}
            />
            {streak > 0 ? (
              <span className="text-2xl font-extrabold">
                {streak}
                <span className="text-xs font-bold text-muted"> 日連続</span>
              </span>
            ) : (
              <span className="text-sm font-extrabold text-muted">
                きょう解くと 1日目
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-line bg-panel p-5">
          <h3 className="mb-3 text-sm font-extrabold">すすみぐあい</h3>
          <div className="mb-2 flex items-baseline justify-between text-xs font-bold text-muted">
            <span>クリアしたステージ</span>
            <span className="text-xl font-extrabold text-ink">
              {clearedCount}
              <span className="text-xs font-bold text-muted"> / {stages.length}</span>
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-bg-deep">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 決済は未実装なのでボタンは押せない状態にしてある（design/移植残タスク.md） */}
        <div className="rounded-2xl border-b-5 border-brand-deep bg-gradient-to-br from-brand to-brand-soft p-5 text-white">
          <h3 className="mb-1.5 text-sm font-extrabold">Pro で全ステージ解放</h3>
          <p className="mb-3.5 text-xs font-bold leading-relaxed opacity-95">
            すべてのカリキュラムと AI 採点 月200問。認定証 PDF もついてくる。
          </p>
          <button
            disabled
            className="w-full rounded-2xl border-b-4 border-black/20 bg-white py-3 text-sm font-extrabold text-brand-deep opacity-90"
          >
            準備中
          </button>
        </div>
      </aside>
    </div>
  );
}
