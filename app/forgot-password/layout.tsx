import type { Metadata } from "next";
import { unlistedPageMetadata } from "@/lib/seo/site";

/**
 * パスワード再設定（メール送信）の画面のメタ情報だけを持つ層。
 * 理由は `app/login/layout.tsx` と同じ（`page.tsx` が "use client" なので
 * そこから `metadata` を書き出せない）。
 *
 * 検索結果に**出さない**のはログイン・新規登録と同じ扱い。
 * `robots.txt` では塞がない ── 塞ぐと中身を読めなくなるだけで、
 * 「載せないでくれ」という宣言（index: false）が届かなくなる
 * （`lib/seo/site.ts` の `unlistedPageMetadata` のコメント）。
 */
export const metadata: Metadata = unlistedPageMetadata({
  title: "パスワードの再設定",
  description: "Ferret のパスワードを設定し直すためのリンクをお送りします。",
});

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
