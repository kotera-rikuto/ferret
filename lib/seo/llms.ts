import {
  ARTICLES_URL,
  READING_TYPE_LINES,
  SITEMAP_PATHS,
  SITE_ALTERNATE_NAME,
  SITE_DESCRIPTION,
  SITE_FACTS,
  SITE_NAME,
  siteOrigin,
} from "@/lib/seo/site";

/**
 * `https://ferretcode.com/llms.txt` の中身（C12）。
 *
 * **AI 向けにサイトの説明を平文で置く、新しめの慣行。**
 * `robots.txt` のような決まった仕様ではなく、守っている相手も限られる ──
 * つまり**費用対効果は「置くだけ安い」程度**で、これを置いたから答えに出る、という関係は無い。
 * 効くのは M1（外部で言及される数）のほうで、こちらは
 * **読みに来た相手に正しく伝わる**ようにしておくための準備（票 C12 の期待値の節）。
 *
 * 中身は `lib/seo/site.ts` の定数から組み立てる。ここに文章を直接書くと、
 * **LP と JSON-LD と llms.txt で説明が3通りに割れる**（AI はそのどれかを事実として答える）。
 *
 * ⚠️ **利用の許諾を書かないこと。** 「学習・引用に使ってよい」と書くのは
 * 権利の許諾にあたり、**利用規約 第8条・第9条（問題文・解説・コード例の複製と
 * 再配布を禁じている）と正面から食い違う。** ここに書いてよいのは「拒否していない」という事実だけで、
 * 許諾は法務文書の側で決めること。
 */
export function llmsTxt(): string {
  const origin = siteOrigin();

  // 本番URLが分かるなら絶対URL、分からない（プレビュー・ローカル）なら相対パス。
  // **相対パスなら基点を取り違えようがない**ので、sitemap や canonical のように
  // 「基点が無ければ何も出さない」とまではしない ── この文書は
  // URL の宣言ではなく説明文で、リンクが相対でも中身は正しいまま
  const link = (path: string) => (origin ? `${origin}${path === "/" ? "" : path}` : path);

  const lines: string[] = [
    `# ${SITE_NAME}（${SITE_ALTERNATE_NAME}）`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    ...SITE_FACTS.map((fact) => `- ${fact}`),
    "",
    "## 読み方は6種類",
    "",
    "「読む」と一口に言っても、問われることは違う。問題はこの6つを混ぜて並べてある。",
    "",
    ...READING_TYPE_LINES.map((line) => `- ${line}`),
    "",
    "## 公開しているページ",
    "",
    ...SITEMAP_PATHS.map(
      ({ path, label, summary }) => `- [${label}](${link(path)}): ${summary}`,
    ),
    "",
    "## 開発の記録",
    "",
    `- [Zenn（${SITE_NAME} の技術記事）](${ARTICLES_URL}): 採点の作り・AI の従量課金に上限を付けた話・テスト設計など、このサービスを作る過程で分かったことを公開している`,
    "",
    "## この文書について",
    "",
    "- サイト本文・検索エンジン向けのメタ情報・構造化データ（JSON-LD）と、同じ出どころから作っている",
    "- AI のクローラーを拒否していない。`robots.txt` で巡回対象から外しているのは、ログインが要る画面と、人が読む画面ではないもの（API・ログアウト）だけ",
    "- 実績や利用者数は書いていない。書いていないことは、まだ無いか、公表していない",
    "",
  ];

  return lines.join("\n");
}
