import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconBook, IconGear, IconMap } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";
import { CTA_PRIMARY_LABEL } from "@/lib/seo/site";

// ログイン後画面の左ナビ。lg 未満では表示しない（呼び出し側が簡易ヘッダーを出す）。
// 「ふりかえり」は 2026-08-19（E1）に解禁した。行き先は `/review`（といた問題の一覧）で、
// そこから回ごとのふりかえり（`/review/[id]`）へ入る。
// 一覧を挟むのは、ふりかえり本体が回答1件ごとの画面だから
//
// `current` は「いまどの画面にいるか」。強調を1か所だけにするために持たせている。
// 全部を同じ見た目にすると、どこにいるのか画面から分からなくなる
//
// `signedIn` は「ログイン済みか」。**false ではステージ選択だけを見せる**（C13・2026-09-11）。
// ログインしていない人にもステージ選択を開けたので、「ふりかえり」「せってい」「ログアウト」は
// 行き先が無い ── 並べるとログイン画面に跳ね返されるだけのリンクになる。
// 空いた場所には登録への導線を置く（この画面で唯一の入口になる）
export function AppSidebar({
  email,
  current = "stages",
  signedIn = true,
}: {
  email: string | null;
  current?: "stages" | "review" | "settings";
  signedIn?: boolean;
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
      {signedIn && (
        <>
          <Link href="/review" className={current === "review" ? active : idle}>
            <IconBook size={20} />
            ふりかえり
          </Link>
          <Link href="/settings" className={current === "settings" ? active : idle}>
            <IconGear size={20} />
            せってい
          </Link>
        </>
      )}

      <div className="flex-1" />

      {signedIn ? (
        <>
          <div className="flex items-center gap-2.5 rounded-xl border-2 border-line px-3.5 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-extrabold text-brand-deep">
              {email?.charAt(0).toUpperCase() ?? "?"}
            </span>
            <span className="truncate text-xs font-bold text-muted">{email ?? ""}</span>
          </div>
          <LogoutButton className="px-4 py-1 text-left" />
        </>
      ) : (
        /* 文言は lib/seo/site.ts から引く。課金を始めた日に「無料」が残らないようにするため */
        <>
          <Link
            href="/register"
            className="rounded-xl border-b-5 border-brand-deep bg-brand px-3.5 py-3 text-center text-sm font-extrabold tracking-wide text-white active:translate-y-[3px] active:border-b-2"
          >
            {CTA_PRIMARY_LABEL}
          </Link>
          <Link
            href="/login"
            className="px-4 py-1 text-center text-xs font-extrabold text-muted hover:text-ink"
          >
            ログイン
          </Link>
        </>
      )}
    </aside>
  );
}
