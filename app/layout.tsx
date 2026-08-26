import type { Metadata } from "next";
import { M_PLUS_Rounded_1c, JetBrains_Mono } from "next/font/google";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
import {
  OPEN_GRAPH_BASE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  TWITTER_BASE,
  siteOrigin,
} from "@/lib/seo/site";
import { InlineScript } from "@/components/theme/InlineScript";
import { ThemeSync } from "@/components/theme/ThemeSync";
import "./globals.css";

// 丸ゴシックが学習アプリのトーンの土台（design/README.md）。
// 日本語グリフは unicode-range でサブセット分割配信されるため preload 対象を絞れず、
// preload: false にしないとビルド時に警告が出る
const mplusRounded = M_PLUS_Rounded_1c({
  variable: "--font-mplus-rounded",
  weight: ["500", "700", "800"],
  subsets: ["latin"],
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// 本番URL。プレビュー配信とローカルでは null になる（理由は lib/seo/site.ts）
const origin = siteOrigin();

/**
 * 全画面の共通のメタ情報 ── 検索結果の見出し・説明文と、SNS に貼られたときのカード。
 * 文言の出どころは `lib/seo/site.ts`（4か所に散らないよう1本化してある）。
 *
 * **ここに `alternates`（canonical）を書かないこと。** Next.js は書かれていない項目を
 * 下の階層へそのまま受け継がせるので、ここに1つ書くと `/terms` も `/privacy` も
 * 「正しいURLはトップページ」と申告する ── 2枚ともトップの複製として扱われる。
 * ページごとの宣言は `publicPageMetadata`（`lib/seo/site.ts`）が組み立てる。
 */
export const metadata: Metadata = {
  // 相対パスの解決基点。**固定値を書かない** ── プレビューが本番URLを名乗る。
  // 未設定なら項目ごと出さない（Next.js 16 は基点の無い相対パスをビルドで弾く）
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  title: {
    default: SITE_TITLE,
    // 各画面の title を「〜 | Ferret」の形に揃える。
    // ⚠️ **画面側の title に「| Ferret」を書かないこと**（「利用規約 | Ferret | Ferret」になる）
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    ...OPEN_GRAPH_BASE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // og:url はここに書かない。canonical と同じ理由で、全ページが
    // トップのURLを名乗ってしまう。ページごとに publicPageMetadata が入れる
    //
    // **og:image もここに書かない。** `app/opengraph-image.tsx` を置いてあるので
    // Next.js がページごとに足す（C11）。ここに書くとそちらが使われなくなる
  },
  // X（Twitter）だけは「カードの型」を別に申告しないと、1200×630 の絵が
  // 小さな四角に縮められる（`summary_large_image`。理由は TWITTER_BASE のコメント）
  twitter: {
    ...TWITTER_BASE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme は暗い配色の入口（app/globals.css）。サーバーは既定（明るい）で返し、
    // 覚えてある人のぶんだけ下の script が最初の描画より前に書き換える。
    // suppressHydrationWarning が要るのはそのため ── React が組み立て直すときに
    // 「自分が書いた覚えのない値が入っている」と判断して、せっかく当てた配色を
    // 巻き戻してしまう（Next.js のドキュメント preventing-flash-before-hydration）
    <html
      lang="ja"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${mplusRounded.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* 素の <script> ではなく InlineScript を通す。
            理由（React の script 警告と type の出し分け）はその部品の冒頭に書いてある */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
