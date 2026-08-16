import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconBook, IconGear, IconMap } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

// ログイン後画面の左ナビ。lg 未満では表示しない（呼び出し側が簡易ヘッダーを出す）。
// 「ふりかえり」「せってい」は画面が未実装なので押せないボタン + 準備中チップにしてある。
// リンクにして 404 を踏ませるより、押せないことが見えているほうが親切
export function AppSidebar({ email }: { email: string | null }) {
  return (
    <aside className="hidden lg:flex sticky top-0 h-dvh flex-col gap-1.5 border-r-2 border-line py-7 pl-2 pr-4">
      <div className="flex items-center gap-2.5 px-4 pb-5 text-2xl font-extrabold">
        <Mascot className="w-9 h-9" />
        Ferret
      </div>

      <Link
        href="/stages"
        className="flex items-center gap-3 rounded-xl border-2 border-brand-soft bg-brand-tint px-3.5 py-3 text-[15px] font-extrabold tracking-wide text-brand-deep"
      >
        <IconMap size={20} />
        ステージ
      </Link>
      <button
        disabled
        className="flex items-center gap-3 rounded-xl border-2 border-transparent px-3.5 py-3 text-[15px] font-extrabold tracking-wide text-muted"
      >
        <IconBook size={20} />
        ふりかえり
        <span className="ml-auto rounded-full bg-locked px-2 py-0.5 text-[10px] font-extrabold text-locked-ink">
          準備中
        </span>
      </button>
      <button
        disabled
        className="flex items-center gap-3 rounded-xl border-2 border-transparent px-3.5 py-3 text-[15px] font-extrabold tracking-wide text-muted"
      >
        <IconGear size={20} />
        せってい
        <span className="ml-auto rounded-full bg-locked px-2 py-0.5 text-[10px] font-extrabold text-locked-ink">
          準備中
        </span>
      </button>

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
