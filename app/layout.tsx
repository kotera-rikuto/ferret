import type { Metadata } from "next";
import { M_PLUS_Rounded_1c, JetBrains_Mono } from "next/font/google";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
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

export const metadata: Metadata = {
  title: "Ferret",
  description: "他人のコードが読める、AI時代のエンジニアに。",
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
