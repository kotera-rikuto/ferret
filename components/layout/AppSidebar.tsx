import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconBook, IconGear, IconMap } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

// ログイン後画面の左ナビ。lg 未満では表示しない（呼び出し側が簡易ヘッダーを出す）。
// 「ふりかえり」は画面が未実装なので押せないボタン + 準備中チップにしてある（E1 で解禁）。
// リンクにして 404 を踏ませるより、押せないことが見えているほうが親切
//
// `current` は「いまどの画面にいるか」。強調を1か所だけにするために持たせている。
// 全部を同じ見た目にすると、どこにいるのか画面から分からなくなる
export function AppSidebar({
  email,
  current = "stages",
}: {
  email: string | null;
  current?: "stages" | "settings";
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
