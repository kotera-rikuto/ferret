# assets/fonts

カードの文字を描くためのフォント。**2つあるのは、描く文字の出どころが2つあるから。**

| ファイル | 何か |
|---|---|
| `MPLUSRounded1c-Bold.subset.ttf` | 生成物。`python3 design/og/subset-font.py` が作る。**LP のカード**（`app/opengraph-image.tsx`）用 |
| `MPLUSRounded1c-Bold.ttf` | 原本まるごと（3.4MB）。**結果のカード**（`app/api/share/[attemptId]`）用 |
| `OFL.txt` | 許諾（SIL Open Font License 1.1）。**同梱が条件なので消さない** |

**なぜ結果のカードだけ原本が要るのか（G1・2026-09-11）**

結果のカードは**問題名を描く**が、問題名は DB にあるので切り出しの対象にできない。
実測すると **106件中85件が豆腐（□）になった**（不足126字）。
足りない字を足す案（271KB）は**問題を1問足すたびに壊れる**うえ、
satori は無い字をエラーにせず豆腐で描くので**SNS に流れてから気づく**ことになる。
原本を持てば二度と壊れないので、そちらを採った。

**重くないのか:** ブラウザには1バイトも配られない（サーバーが絵を描くときに読むだけ）。
LP のカードは文言がコードにあり `tests/unit/og-image.test.ts` の U-845 で検査できるので、
あちらは切り出したものを使い続ける。**両方を見張る検査は U-907 と `npm run test:db` の I-894。**

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
