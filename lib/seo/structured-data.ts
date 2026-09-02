import {
  ARTICLES_URL,
  OG_IMAGE,
  READING_TYPE_LINES,
  SITE_ALTERNATE_NAME,
  SITE_DESCRIPTION,
  SITE_FACTS,
  SITE_IS_FREE,
  SITE_NAME,
  siteOrigin,
} from "@/lib/seo/site";

/**
 * 構造化データ（JSON-LD）── **「このサイトは何か」を機械が読む形で名乗る宣言**（C12）。
 *
 * 人には見えない。`<head>` に JSON を1つ置くだけで、読むのは検索エンジンと AI。
 * 本文（LP）にも同じことが書いてあるが、あちらは**文章から読み取ってもらう**必要があり、
 * 読み取り方は相手まかせになる。こちらは項目名が決まっているので、
 * 「名前」「説明」「言語」「無料かどうか」が取り違えられない。
 *
 * ⚠️ **書いてよいのは実装済みの事実だけ**（中身は `SITE_FACTS`）。
 * AI はここに書いてあることを**そのまま事実として答える**ので、
 * 盛った実績は取り消せない。価格は `SITE_IS_FREE` から出す（課金開始時は D2 で直す）。
 *
 * **基点（本番URL）が無いときは `null` を返して何も出さない。**
 * JSON-LD の `@id` と `url` は絶対URLでなければ意味を持たず（相対だと
 * 「どのサイトの話か」が決まらない）、かつ本番URLを固定値で書くと
 * **プレビュー配信のページが本番を名乗る**（`siteOrigin` の注記と同じ理由）。
 */
export function structuredData(): Record<string, unknown> | null {
  const origin = siteOrigin();
  if (!origin) return null;

  const websiteId = `${origin}#website`;

  return {
    "@context": "https://schema.org",
    // 2つのノードを別々の script に分けず1つの `@graph` に入れる。
    // `isPartOf` / `@id` で結び付けてあるので、機械には「同じサイトの話」だと分かる
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: origin,
        name: SITE_NAME,
        // 「フェレット」で検索されたときの手掛かり。別名だと明示しないと別物に見える
        alternateName: SITE_ALTERNATE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "ja",
        image: `${origin}${OG_IMAGE.url}`,
        // **ここが外に効く唯一の項目。** 技術記事（Zenn）と同じ主体だと結び付ける。
        // AI が参照するのは他人が書いたものなので、そこへ辿れる線を1本置く
        sameAs: [ARTICLES_URL],
      },
      {
        "@type": "WebApplication",
        "@id": `${origin}#app`,
        url: origin,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        // 学習系のアプリだと名乗る。schema.org が定めている語をそのまま使う
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web browser",
        inLanguage: "ja",
        isPartOf: { "@id": websiteId },
        // 実装済みの事実だけ。出どころは lib/seo/site.ts の1か所
        featureList: [...SITE_FACTS],
        // 読み方6種。DB の CHECK 制約と同じ語（lib/stages/reading-types.ts）
        teaches: [...READING_TYPE_LINES],
        isAccessibleForFree: SITE_IS_FREE,
        // 価格を名乗るのは無料のあいだだけ。**有料化したら項目ごと消える**ので、
        // 「0円」が残ったまま古くなることがない（D2 で SITE_IS_FREE を false にする）
        ...(SITE_IS_FREE
          ? { offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" } }
          : {}),
      },
    ],
  };
}

/**
 * `<script type="application/ld+json">` の中身にする文字列。
 *
 * **`<` を `\u003c` に置き換えているのは XSS 対策**（Next.js の
 * `01-app/02-guides/json-ld.md` がそう書いている）。`JSON.stringify` は
 * HTML を意識しないので、値に `</script>` が混ざると script がそこで閉じる。
 * いまの中身は定数だけなので実際には混ざらないが、**ここに DB の値や
 * 入力された文字を足す日が来たときに効く**ので、先に通してある。
 */
export function structuredDataJson(): string | null {
  const data = structuredData();
  return data ? JSON.stringify(data).replace(/</g, "\\u003c") : null;
}
