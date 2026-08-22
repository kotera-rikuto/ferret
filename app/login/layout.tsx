import type { Metadata } from "next";
import { unlistedPageMetadata } from "@/lib/seo/site";

/**
 * ログイン画面のメタ情報だけを持つ層。
 *
 * `page.tsx` が "use client" なので、そこから `metadata` を書き出せない
 * （Next.js の制約。クライアント側の部品はサーバーが読む宣言を持てない）。
 * 画面の構造には触らず、宣言だけをここに置く。
 */
export const metadata: Metadata = unlistedPageMetadata({
  title: "ログイン",
  description: "Ferret のアカウントでログインします。",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
