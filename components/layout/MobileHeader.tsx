import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { IconBook, IconGear, IconMap } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

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
 */
export function MobileHeader({
  current,
}: {
  current: "stages" | "review" | "settings";
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
    </header>
  );
}
