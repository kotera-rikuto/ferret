#!/usr/bin/env python3
"""共有カード（app/opengraph-image.tsx）に埋め込むフォントを作る（C11・2026-08-26）。

  python3 design/og/subset-font.py            # 元フォントを取得して切り出す
  python3 design/og/subset-font.py --src <path/to/MPLUSRounded1c-Bold.ttf>

書き出すもの
  assets/fonts/MPLUSRounded1c-Bold.subset.ttf  カードの文字を描くフォント（生成物）
  assets/fonts/OFL.txt                         ライセンス（**同梱が条件。消さない**）

**なぜフォントのファイルが要るのか:** 画面側の文字は `next/font/google` が配ってくれるが、
あれは CSS の仕組みで、**画像を描くときには効かない。** `next/og`（satori）は
フォントのバイト列を渡さないと日本語を1文字も描けず、全部が豆腐（□）になる。

**なぜ丸ごと入れないのか:** M PLUS Rounded 1c は全部で 3.5MB ある。
カードに出る字だけに切り出して 180KB 前後まで落としてある
（**ブラウザには配られない。** ビルドのときに読むだけのファイル）。

**切り出す字の決め方:** `lib/seo/site.ts` に出てくる全文字 ＋ 英数記号 ＋ かな。
カードの文言はあの1ファイルに集めてあるので（`OG_IMAGE_*`）、
**文言を直したらこの script を回し直せば足りる。** かなを全部入れてあるのは、
言い回しを変えたときに再生成を忘れても豆腐になりにくいから ── ただし
**新しい漢字を足したときは回し直しが必要**で、それを忘れたら
tests/unit/og-image.test.ts の U-845 が落ちる（そのための検査）。
"""

import argparse
import os
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "assets", "fonts")
OUT_FONT = os.path.join(OUT_DIR, "MPLUSRounded1c-Bold.subset.ttf")
OUT_LICENSE = os.path.join(OUT_DIR, "OFL.txt")

# Google Fonts の原本。バージョンを固定できないので、
# **出来上がった .ttf をリポジトリに入れて**そちらを正とする（ビルド時に取りに行かない）
BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/mplusrounded1c/"
FONT_URL = BASE + "MPLUSRounded1c-Bold.ttf"

# **このフォントのフォルダには OFL.txt が置かれていない**（METADATA.pb に `license: "OFL"`
# とだけある古い形の登録）。SIL OFL 1.1 は「配布物に許諾文を同梱すること」を条件にしているので、
# 本文は同じ M+ 系の別フォルダから取り、権利表示だけ METADATA.pb の文言に差し替えて置く。
LICENSE_BODY_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/mplus1/OFL.txt"
COPYRIGHT = "Copyright 2016 The Rounded M+ Project Authors."

# 文言の出どころ。ここに出てくる文字は全部入れる
COPY_SOURCE = os.path.join(ROOT, "lib", "seo", "site.ts")

# 常に入れる字。英数記号と、ひらがな・カタカナの全域
ALWAYS = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "".join(chr(c) for c in range(0x3041, 0x3097))  # ひらがな
    + "".join(chr(c) for c in range(0x30A0, 0x30FB))  # カタカナ
    + "、。「」・ー〜（）：／　"
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="MPLUSRounded1c-Bold.ttf の場所（省略すると取得する）")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = tempfile.mkdtemp()

    src = args.src
    if not src:
        src = os.path.join(tmp, "MPLUSRounded1c-Bold.ttf")
        print(f"取得: {FONT_URL}")
        urllib.request.urlretrieve(FONT_URL, src)
    print(f"取得: {LICENSE_BODY_URL}")
    with urllib.request.urlopen(LICENSE_BODY_URL) as res:
        body = res.read().decode("utf-8")
    # 1行目の権利表示だけ Rounded M+ のものに差し替える（2行目以降が OFL 1.1 の本文）
    body = "\n".join([COPYRIGHT, f"Source: {BASE}"] + body.splitlines()[1:])
    with open(OUT_LICENSE, "w", encoding="utf-8") as f:
        f.write(body + "\n")

    with open(COPY_SOURCE, encoding="utf-8") as f:
        chars = sorted(set(f.read()) | set(ALWAYS))
    # 改行やタブは字ではない
    text = "".join(c for c in chars if c.isprintable() and c != " ") + " "
    print(f"切り出す字数: {len(text)}")

    # pyftsubset は fonttools（PyPI: fonttools）に入っている。
    # layout-features は既定のまま（縦書きは使わないが、外すと詰め情報まで落ちる）
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            src,
            f"--text={text}",
            "--output-file=" + OUT_FONT,
            "--no-hinting",
            "--desubroutinize",
            "--name-IDs=*",
        ],
        check=True,
    )
    print(f"assets/fonts/MPLUSRounded1c-Bold.subset.ttf: {os.path.getsize(OUT_FONT) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
