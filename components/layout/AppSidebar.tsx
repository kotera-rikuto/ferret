import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconBook, IconGear, IconMap } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

// ログイン後画面の左ナビ。lg 未満では表示しない（呼び出し側が簡易ヘッダーを出す）。
// 「ふりかえり」は 2026-08-19（E1）に解禁した。行き先は `/review`（といた問題の一覧）で、
// そこから回ごとのふりかえり（`/review/[id]`）へ入る。
// 一覧を挟むのは、ふりかえり本体が回答1件ごとの画面だから
//
// `current` は「いまどの画面にいるか」。強調を1か所だけにするために持たせている。
// 全部を同じ見た目にすると、どこにいるのか画面から分からなくなる
export function AppSidebar({
  email,
  current = "stages",
}: {
  email: string | null;
  current?: "stages" | "review" | "settings";
}) {
  // 強調とそれ以外。文字色まで変えるので、クラスをまとめて切り替える
  const active =
    "flex items-center gap-3 rounded-xl border-2 border-brand-soft bg-brand-tint px-3.5 py-3 text-[15px] font-extrabold tracking-wide text-brand-deep";
  const idle =
    "flex items-center gap-3 rounded-xl border-2 border-transparent px-3.5 py-3 text-[15px] font-extrabold tracking-wide text-muted hover:text-ink";

  return (
    <aside className="hidden lg:flex sticky top-0 h-dvh flex-col gap-1.5 border-r-2 border-line py-7 pl-2 pr-4">
      <div className="flex items-center gap-2.5 px-4 pb-5 text-2xl font-extrabold">
        <Mascot className="w-9 h-9" />
        Ferret
      </div>

      <Link href="/stages" className={current === "stages" ? active : idle}>
        <IconMap size={20} />
        ステージ
      </Link>
      <Link href="/review" className={current === "review" ? active : idle}>
        <IconBook size={20} />
        ふりかえり
      </Link>
      <Link href="/settings" className={current === "settings" ? active : idle}>
        <IconGear size={20} />
        せってい
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 rounded-xl border-2 border-line px-3.5 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-extrabold text-brand-deep">
          {email?.charAt(0).toUpperCase() ?? "?"}
        </span>
        <span className="truncate text-xs font-bold text-muted">{email ?? ""}</span>
      </div>
      <LogoutButton className="px-4 py-1 text-left" />
    </aside>
  );
}
