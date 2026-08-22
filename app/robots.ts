import type { MetadataRoute } from "next";
import { CRAWL_DISALLOW, siteOrigin } from "@/lib/seo/site";

/**
 * `https://ferretcode.com/robots.txt` を組み立てる。
 *
 * 検索エンジンが最初に取りに来るファイルで、中身は2つ。
 *   - **巡回してよい範囲**（`Allow` / `Disallow`）
 *   - **ページ一覧のありか**（`Sitemap:`）
 *
 * ⚠️ **`Disallow: /` を返さないこと。** それは「このサイトを検索に出すな」の意味で、
 * C5 でオーナーは逆（検索に出したい）を選んでいる。しかも間違えても画面は何も変わらず、
 * **数週間かけて索引から消える**という形でしか気づけない。
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // ログインが要る画面と、人が読む画面ではないもの。理由は CRAWL_DISALLOW の定義
      disallow: [...CRAWL_DISALLOW],
    },
    // **基点が分からないときは Sitemap 行ごと落とす。**
    // ここだけは相対パスが使えず（robots.txt の仕様上、絶対URLでなければならない）、
    // かつ `NEXT_PUBLIC_APP_URL` は Production にしか入っていない（C5）。
    // 固定値を書くと、プレビュー配信の robots.txt が本番の sitemap を指すことになる。
    //
    // なお **`Allow` / `Disallow` は基点に関係なく出す。**
    // 相対パスなのでプレビューでもそのまま正しく、
    // 「設定を入れ忘れたら検索避けになる」という取り違えを構造的に作らないため
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
