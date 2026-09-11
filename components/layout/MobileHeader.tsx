import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconBook, IconGear, IconMap } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";
import { CTA_PRIMARY_LABEL } from "@/lib/seo/site";

/**
 * lg 未満の簡易ヘッダー。`AppSidebar` が消える幅での代わり。
 *
 * **行き先（ステージ / ふりかえり / せってい）を載せてある（E11）。**
 * 2026-08-21 まではロゴとログアウトだけで、**スマホからは「ふりかえり」と「せってい」に
 * 辿る道が1本も無かった** ── パソコンでは左のナビにあるので気づきにくい。
 * ふりかえり（E1）は解いたあとに見返す機能なので、無いと機能そのものが届かない。
 *
 * **狭いので文字は付けない。** 「ステージ」「ふりかえり」「せってい」を並べると
 * ロゴとログアウトを足して 375px には収まらない（実測）。読み上げ用の名前は
 * `aria-label` で渡し、いまいる場所だけ色を付けて位置が分かるようにしてある。
 *
 * 4画面（ステージ / といた問題 / ふりかえり / せってい）で同じものを出す。
 * 別々に書いていた頃は、行き先を足すたびに4か所を直す形になっていた。
 *
 * @param signedIn ログイン済みか。**false では行き先を並べない**（C13）。
 *                 理由は `AppSidebar` と同じ ── ログインしていない人には
 *                 「ふりかえり」も「せってい」も跳ね返されるだけのリンクになる。
 *                 ステージ選択（`app/stages/page.tsx`）だけがこれを渡す
 */
export function MobileHeader({
  current,
  signedIn = true,
}: {
  current: "stages" | "review" | "settings";
  signedIn?: boolean;
}) {
  const items = [
    { key: "stages", href: "/stages", label: "ステージ", Icon: IconMap },
    { key: "review", href: "/review", label: "ふりかえり", Icon: IconBook },
    { key: "settings", href: "/settings", label: "せってい", Icon: IconGear },
  ] as const;

  return (
    <header className="flex items-center justify-between gap-2 lg:hidden">
      <Link
        href="/stages"
        className="flex shrink-0 items-center gap-2 text-xl font-extrabold"
      >
        <Mascot className="w-7 h-7" />
        Ferret
      </Link>

      {!signedIn ? (
        <Link
          href="/register"
          className="shrink-0 rounded-xl border-b-4 border-brand-deep bg-brand px-4 py-2 text-[13px] font-extrabold tracking-wide text-white active:translate-y-[2px] active:border-b-2"
        >
          {CTA_PRIMARY_LABEL}
        </Link>
      ) : (
      <div className="flex items-center gap-0.5">
        {items.map(({ key, href, label, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-label={label}
            aria-current={current === key ? "page" : undefined}
            className={`grid size-9 place-items-center rounded-xl ${
              current === key
                ? "bg-brand-tint text-brand-deep"
                : "text-muted"
            }`}
          >
            <Icon size={19} />
          </Link>
        ))}
        <LogoutButton className="ml-1.5" />
      </div>
      )}
    </header>
  );
}
