import type { Metadata } from "next";
import { M_PLUS_Rounded_1c, JetBrains_Mono } from "next/font/google";
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
    <html
      lang="ja"
      className={`${mplusRounded.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
