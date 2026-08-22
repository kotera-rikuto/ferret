import type { Metadata } from "next";
import { unlistedPageMetadata } from "@/lib/seo/site";

/**
 * 新規登録画面のメタ情報だけを持つ層。理由は `app/login/layout.tsx` と同じ。
 */
export const metadata: Metadata = unlistedPageMetadata({
  title: "新規登録",
  description: "Ferret のアカウントを作ります。",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
