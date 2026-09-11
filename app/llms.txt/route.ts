import { llmsTxt } from "@/lib/seo/llms";
import { previewPages } from "@/lib/seo/preview-pages";

/**
 * `https://ferretcode.com/llms.txt` を配る（C12）。
 *
 * **`public/llms.txt` に静的ファイルとして置かなかったのは意図。**
 * あの形だと、サイトの説明文（`lib/seo/site.ts`）と同じことを**手で書き写す**ことになり、
 * 片方を直したときにもう片方が古いまま残る ── しかも
 * **食い違っても画面には何も出ず**、気づけるのは AI が古い説明で答えたときだけ。
 * ここを Route Handler にしてあることで、出どころが1本になっている。
 *
 * `Content-Type` を明示しているのは、`.txt` という名前だけでは
 * **文字化けを避けられない**ため（`charset` が無いと相手の既定の文字コードで読まれる）。
 */

// 中身はビルド時に決まる（リクエストごとに変わるものが無い）。
// robots.txt・sitemap.xml と同じ扱いにして、配信のたびに組み立て直さない。
//
// **ログイン前に読める問題の一覧だけ DB から引く**（C13）。URL に `problems.id` が
// 入るので定数に書けないため。問題を入れ替えたら再デプロイで追随する
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return new Response(llmsTxt(await previewPages()), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
