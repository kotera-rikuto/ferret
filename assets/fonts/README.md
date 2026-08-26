# assets/fonts

共有カード（`app/opengraph-image.tsx`）の文字を描くためのフォント。

| ファイル | 何か |
|---|---|
| `MPLUSRounded1c-Bold.subset.ttf` | 生成物。`python3 design/og/subset-font.py` が作る |
| `OFL.txt` | 許諾（SIL Open Font License 1.1）。**同梱が条件なので消さない** |

- **ブラウザには配られない。** `public/` ではなくここに置いてあるのは、
  ビルドのときにサーバー側が読むだけのファイルだから（配ると同じ字を二重に届けることになる）。
- 画面の文字は `next/font/google`（`app/layout.tsx`）が配る別の実体。**こちらとは無関係。**
  あれは CSS の仕組みなので、画像を描く `next/og` には効かない。
- 中身は「`lib/seo/site.ts` に出てくる字 ＋ 英数記号 ＋ かな」だけ。
  **カードの文言に新しい漢字を足したら `design/og/subset-font.py` を回し直すこと**
  （忘れると豆腐（□）で焼かれる。歯止めは `tests/unit/og-image.test.ts` の U-845）。
- 元のフォントは M PLUS Rounded 1c Bold（Google Fonts・OFL）。
  権利表示は `Copyright 2016 The Rounded M+ Project Authors.` で、**予約名（RFN）の指定は無い**ため、
  切り出したものに同じ名前を残してある。
