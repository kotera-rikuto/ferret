#!/usr/bin/env python3
"""マスコットの顔からアイコンを作る（C11・2026-08-26）。

  python3 design/mascot/build-icons.py

書き出すもの（**すべて生成物。手で描き直さない**）
  app/icon.png         256角。タブ・ブックマーク・検索結果の丸
  app/apple-icon.png   180角。ホーム画面に追加したときの絵
  app/favicon.ico      16/32/48。`/favicon.ico` を直接取りに来る相手向け

**なぜ script として残すか:** 切る位置（下の HEAD_BOX と TAIL_CUT）がこの作業の判断そのもので、
絵を差し替えたときに同じ判断をやり直せる必要がある。PNG だけ残すと
「どこで切ったのか」「なぜそこなのか」が失われる（design/mascot/cut-parts.py と同じ理由）。

**切り出しの方針**
  元の絵は1枚の塗り絵で、隠れている部分は描かれていない（CLAUDE.md）。
  顔だけを使うので、重なっているものの扱いが2つだけ問題になる。

  虫眼鏡 … レンズが左頬に重なっている。**外せない**（外すと描かれていない頬が穴になる）。
            ただしレンズの右端は頭の輪郭とほぼ同じ位置なので、
            HEAD_BOX の左端をそこに置けば、切るだけで画面から外れる。
  しっぽ … 右下から頬に接している。こちらは背景の隙間があるので、
            **隙間を通る斜めの線**で落とす（TAIL_CUT）。座標軸に平行な矩形で落とすと、
            頬の輪郭を垂直に切った跡が 256px でもはっきり残る（実際に出たので直した）。

  仕上げに**円で抜く**。HEAD_BOX の四隅（体の胸元・しっぽの端）は円の外に出るので、
  この抜きが最後の掃除も兼ねている。
"""

from PIL import Image, ImageDraw
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "public", "character_nobg.png")

# 顔の箱（元画像 2000 角の座標）。上は耳の先、下は口元の下、左はレンズの右端、右は頬の先。
HEAD_BOX = (585, 150, 1545, 1105)

# しっぽを落とす直線（元画像の座標）。この2点を通る線の**右下側**を消す。
# 頬の黒い輪郭としっぽの毛先の**間の隙間**を通す。頬の輪郭を1px でも削ると、
# 切り跡が 256px で小さな引っかき傷のように残る（実際に出たので線を下げた）。
TAIL_CUT = ((1650, 900), (1280, 1120))

# 丸い下地。--color-brand（app/globals.css の明るいテーマ側）。
# **透明のまま使わない** ── 暗いテーマのブラウザで輪郭線と目だけが浮く（C11 でオーナー判断）。
BRAND = "#f59e0b"

# 円の中で顔が占める幅。上げると耳と口元が円からはみ出す
FACE_RATIO = 0.78
# apple-icon は角を iOS 側が丸めるので**塗りは正方形**。そのぶん顔を小さく置く
APPLE_FACE_RATIO = 0.72

# 一度大きく描いて縮める（円の縁と毛先のギザギザを消すため）
SS = 4


def _face() -> Image.Image:
    """顔だけを切り出した RGBA。背景は透明のまま返す"""
    src = Image.open(SRC).convert("RGBA")
    face = src.crop(HEAD_BOX).copy()

    # しっぽを斜めの線で落とす。線より下（右下側）を透明にする
    (x0, y0), (x1, y1) = TAIL_CUT
    slope = (y1 - y0) / (x1 - x0)
    cut = Image.new("L", face.size, 255)
    poly = []
    for x in range(face.width + 1):
        # face 座標 → 元画像座標に戻して線の高さを求める
        y = y0 + slope * ((x + HEAD_BOX[0]) - x0) - HEAD_BOX[1]
        poly.append((x, max(0, min(face.height, y))))
    poly += [(face.width, face.height), (0, face.height)]
    ImageDraw.Draw(cut).polygon(poly, fill=0)
    face.putalpha(Image.composite(face.getchannel("A"), Image.new("L", face.size, 0), cut))
    return face


def _round_icon(face: Image.Image, size: int) -> Image.Image:
    """ブランド色の丸に顔を載せる。角は透明（明暗どちらのタブでも同じに見える）"""
    w = size * SS
    canvas = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse((0, 0, w - 1, w - 1), fill=BRAND)

    fw = int(w * FACE_RATIO)
    fh = int(fw * face.height / face.width)
    layer = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    layer.alpha_composite(face.resize((fw, fh), Image.LANCZOS), ((w - fw) // 2, (w - fh) // 2))

    mask = Image.new("L", (w, w), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, w - 1, w - 1), fill=255)
    canvas.alpha_composite(Image.composite(layer, Image.new("RGBA", (w, w), (0, 0, 0, 0)), mask))
    return canvas.resize((size, size), Image.LANCZOS)


def _square_icon(face: Image.Image, size: int) -> Image.Image:
    """角まで塗った正方形。ホーム画面のアイコンは iOS が角を丸めるので、こちらは丸くしない"""
    w = size * SS
    canvas = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rectangle((0, 0, w - 1, w - 1), fill=BRAND)
    fw = int(w * APPLE_FACE_RATIO)
    fh = int(fw * face.height / face.width)
    canvas.alpha_composite(face.resize((fw, fh), Image.LANCZOS), ((w - fw) // 2, (w - fh) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    face = _face()

    icon = _round_icon(face, 256)
    # ファイルサイズは色数を落として詰める（元は平塗りの絵なので帯は出ない）。
    # 透明を残したまま量子化するので FASTOCTREE（RGBA を量子化できるのはこれと
    # libimagequant だけ。MEDIANCUT は RGB 専用で ValueError になる）
    icon.quantize(colors=128, method=Image.FASTOCTREE).save(
        os.path.join(ROOT, "app", "icon.png"), optimize=True
    )

    apple = _square_icon(face, 180)
    apple.convert("RGB").quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE).save(
        os.path.join(ROOT, "app", "apple-icon.png"), optimize=True
    )

    # favicon.ico は `/favicon.ico` を直接取りに来る相手（一部のクローラ・RSS リーダ）向け。
    # Next.js が <link> で案内するのは app/icon.png のほうで、こちらは案内に出ない
    icon.save(
        os.path.join(ROOT, "app", "favicon.ico"),
        sizes=[(48, 48), (32, 32), (16, 16)],
    )

    for path in ("app/icon.png", "app/apple-icon.png", "app/favicon.ico"):
        print(f"{path}: {os.path.getsize(os.path.join(ROOT, path)) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
