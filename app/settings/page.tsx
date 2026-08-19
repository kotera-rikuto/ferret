import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Mascot } from "@/components/ui/Mascot";
import { PasswordForm } from "./PasswordForm";
import { ThemeForm } from "./ThemeForm";
import { DeleteAccountForm } from "./DeleteAccountForm";

/**
 * せってい画面。
 *
 * 中身は「画面の配色」「パスワードの変更」「退会」の3つ。
 * メールアドレスの変更は**確認メールが実ユーザーに届くようになってから**入れる
 * （独自ドメインの用意＝C6 待ち。オーナー判断 2026-08-19）。
 * 作っても押しても何も起きない機能を置くより、準備中と分かるほうがよいという判断。
 *
 * 認証は proxy.ts でも止めているが、ページ側にもガードを置く（他の保護画面と同じ）。
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 gap-8 px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <AppSidebar email={user.email ?? null} current="settings" />

      <main className="flex w-full max-w-2xl flex-col gap-5 py-5 pb-16">
        {/* lg 未満はサイドバーが消えるので、戻り道とログアウトを最低限のヘッダーで代用する */}
        <header className="flex items-center justify-between lg:hidden">
          <Link
            href="/stages"
            className="flex items-center gap-2 text-xl font-extrabold"
          >
            <Mascot className="w-7 h-7" />
            Ferret
          </Link>
          <LogoutButton />
        </header>

        <h1 className="text-2xl font-extrabold">せってい</h1>

        {/* アカウント。いまどのメールアドレスで入っているかは、
            パスワードを変えるときにも退会するときにも確かめたい情報 */}
        <section className="rounded-2xl border-2 border-line bg-panel p-6">
          <h2 className="mb-4 text-sm font-extrabold">アカウント</h2>
          <dl className="flex flex-col gap-1.5">
            <dt className="text-xs font-extrabold text-muted">
              メールアドレス
            </dt>
            <dd className="text-[15px] font-bold break-all">
              {user.email ?? "―"}
            </dd>
          </dl>
          <p className="mt-4 flex items-center gap-2 text-xs font-bold text-muted">
            メールアドレスの変更
            <span className="rounded-full bg-locked px-2 py-0.5 text-[10px] font-extrabold text-locked-ink">
              準備中
            </span>
          </p>
        </section>

        <ThemeForm />

        <PasswordForm email={user.email ?? ""} />

        <DeleteAccountForm />
      </main>
    </div>
  );
}
