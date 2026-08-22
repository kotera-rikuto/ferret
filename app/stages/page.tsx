import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProgress } from "@/lib/progress/unlock";
import { PERFECT_THRESHOLD } from "@/lib/ai/compose";
import { calcStreak, toJstDate } from "@/lib/progress/streak";
import { levelFromXp, totalXp } from "@/lib/progress/level";
import { StageMap, type Stage } from "@/components/stage/StageMap";
import { IconCheck, IconFlame } from "@/components/ui/icons";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
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
  const { problems, bestScores, clearedFlags, currentIndex } = await loadProgress(
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
    // 満点の基準は採点側（lib/ai/compose.ts）から読む。画面に数字を書くと、
    // 基準を変えたときに表示と実際がずれる（クリア閾値で同じことがあった経緯）
    perfect: (bestScores.get(p.id) ?? 0) >= PERFECT_THRESHOLD,
  }));

  const clearedCount = clearedFlags.filter(Boolean).length;
  const progressPercent =
    stages.length === 0 ? 0 : Math.round((clearedCount / stages.length) * 100);

  // XP も users.xp に貯めず回答ログから導出する（lib/progress/level.ts）。
  // 解放判定のために読んだ最高点をそのまま使えるので、問い合わせは増えない
  const level = levelFromXp(totalXp(bestScores.values()));

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
        {/* lg 未満はサイドバーが消えるので、簡易ヘッダーで代用する */}
        <MobileHeader current="stages" />

        {/*
         * 狭い画面ぶんの数字（レベル / つづけた日数 / すすみぐあい）。
         * **右の `aside` は lg 未満で丸ごと消えるので、ここが唯一の出口**（E11）。
         *
         * **貼り付ける（`sticky`）。** マップは起動時に現在地までスクロールするので、
         * 貼らずに置くと**開いた瞬間から画面の外**にある ── 375px の実測で現在地は
         * ページの 124〜24,000px の位置にあり、上端の帯は一度も目に入らない。
         * つづけた日数はこのジャンルの継続率の本体なので、見えないと置く意味がない。
         *
         * ⚠️ **高さ（`h-15` = 60px）は `StageMap.tsx` の章バナーの `top-16` と対。**
         * バナーはこの帯の下に貼り付くので、高さを変えるならあちらも動かすこと
         * （重なりは `tests/e2e/display.spec.ts` の E-466 が見ている）。
         */}
        <div className="sticky top-0 z-30 flex h-15 items-center gap-2 bg-bg lg:hidden">
          {/* 「あなたは○○レベル」とは言わない（UXルール）。数字は装備と同じ扱い */}
          <div className="flex-1 rounded-xl border-2 border-line bg-panel px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[11px] font-extrabold text-muted">レベル</span>
              <span className="text-sm font-extrabold">{level.level}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-deep">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft"
                style={{ width: `${level.percent}%` }}
              />
            </div>
          </div>

          {/* 0日を罰に見せない: 右の aside と同じ言い換えを使う（文言を変えないこと） */}
          <div className="flex flex-[1.35] items-center gap-1.5 rounded-xl border-2 border-line bg-panel px-2 py-1.5">
            <IconFlame
              size={18}
              className={streak > 0 ? "text-brand" : "text-locked-ink"}
            />
            {streak > 0 ? (
              <span className="text-sm font-extrabold">
                {streak}
                <span className="text-[11px] font-bold text-muted"> 日連続</span>
              </span>
            ) : (
              <span className="text-[10px] leading-tight font-extrabold text-muted">
                きょう解くと
                <br />
                1日目
              </span>
            )}
          </div>

          <div className="flex-1 rounded-xl border-2 border-line bg-panel px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-1">
              <IconCheck size={13} className="shrink-0 text-muted" />
              <span className="text-sm font-extrabold whitespace-nowrap">
                {clearedCount}
                <span className="text-[11px] font-bold text-muted">
                  {" "}
                  / {stages.length}
                </span>
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-deep">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

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
        {/* レベル。上で導出した XP をそのまま出す。
            「あなたは○○レベル」という言い方はしない（UXルール）。
            数字は装備と同じ扱いで、下がることはない */}
        <div className="rounded-2xl border-2 border-line bg-panel p-5">
          <h3 className="mb-3 text-sm font-extrabold">レベル</h3>
          <div className="mb-2 flex items-baseline justify-between text-xs font-bold text-muted">
            <span>つぎまで あと {level.xpToNext} XP</span>
            <span className="text-xl font-extrabold text-ink">{level.level}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-bg-deep">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft"
              style={{ width: `${level.percent}%` }}
            />
          </div>
        </div>

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
