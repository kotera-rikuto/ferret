import type { MetadataRoute } from "next";
import { SITEMAP_PATHS, siteOrigin } from "@/lib/seo/site";
import { previewPages } from "@/lib/seo/preview-pages";

/**
 * `https://ferretcode.com/sitemap.xml` を組み立てる。
 *
 * 「このURLたちを見に来てください」と自分から渡す一覧。
 * `ferretcode.com` は 2026-08-22 にできた新規ドメインで**外部から1本もリンクされていない**ため、
 * 検索エンジンにはこのサイトの存在を知る材料が他に無い。ここと Search Console への
 * 登録だけが、向こう側に材料を渡す手段になる。
 *
 * ⚠️ **載せるのはログインが要らないページだけ**（一覧と理由は `SITEMAP_PATHS`）。
 * 守っているURLをここに書くと、自分でURLの一覧を配ることになる。
 *
 * **定数の一覧に、ログイン前に読める問題を足す**（C13・2026-09-11）。
 * あちらは URL に `problems.id` が入るので定数に書けない
 * （`lib/seo/preview-pages.ts` の冒頭に理由）。DB を読めなかったときは
 * 空が返り、定数ぶんだけの sitemap になる ── ビルドは落とさない。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();

  // 基点が分からない（プレビュー配信・ローカル）ときは空で返す。
  // sitemap は絶対URLしか書けない仕様なので、基点が無ければ書けるものが1つも無い。
  // ここで本番URLを固定値で書くと、**プレビューが本番のページ一覧を配る**ことになる
  if (!origin) return [];

  // `lastModified` は入れていない。ここで出せるのはビルドの時刻だけで、
  // **中身を1文字も変えていない配信でも「更新した」と申告してしまう。**
  // 当てにならない日付は検索エンジン側で無視されるので、書かないほうが正直
  const pages = [...SITEMAP_PATHS, ...(await previewPages())];

  return pages.map(({ path, priority, changeFrequency }) => ({
    // 末尾のスラッシュを重ねない。`/` は基点そのもの
    url: path === "/" ? origin : `${origin}${path}`,
    priority,
    changeFrequency,
  }));
}
