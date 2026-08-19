#!/usr/bin/env python3
"""マスコットの絵をアニメーション用の部品に切り分ける（E10・2026-08-19）。

  python3 design/mascot/cut-parts.py        # public/mascot/ に書き出す
  python3 design/mascot/cut-parts.py --verify   # 検証用の合成画像も出す

**なぜ script として残すか:** 切る位置（下の BOUNDARY）がこの作業の設計判断そのもので、
絵を差し替えたときに同じ判断をやり直せる必要がある。出力の PNG だけ残すと、
「どこで切ったのか」「なぜそこなのか」が失われる。

**切り分けの方針**
  元の絵は 1枚の塗り絵で、隠れている部分は描かれていない。
  なので「動かした結果、描かれていない部分が露出する」部位は動かせない。
  唯一そこを避けられるのが しっぽ ── 体との間に背景の隙間があり、
  重なるのは腕（前足）の裏に入る短い区間だけ。そこだけ ov で体側へ食い込ませ、
  しっぽを体より奥に置くことで、回しても継ぎ目が腕の裏に隠れる。

  ov の食い込みは **体の形（不透明な画素）を OVERLAP_MARGIN だけ内側に縮めた範囲**で
  切り落とす。座標だけで食い込ませると、背景の隙間へはみ出した部分が
  回したときに体から離れて細いトゲになる（実際に出たので、この clip を足した）。

  虫眼鏡は動かさない。レンズが顔に重なっており、ずらすと
  顔の輪郭が描かれていない部分が出る（レンズ上の光は CSS で動かす）。
"""
from PIL import Image, ImageDraw
import numpy as np
import os, sys

SRC_SIZE = 2048          # 元画像（happy / thinking は 2048 角で 1px も違わない）
OUT_SIZE = 768           # 書き出し。画面での最大は 144px なので 5倍の余裕がある
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# (x, y, ov) 上から下へ。x,y は体としっぽの境界、ov はしっぽ側だけ体へ食い込ませる量。
# ov を入れるのは腕（前足）の裏に隠れる区間だけ。背景の隙間で食い込ませると、
# 回したときに切り口が隙間へはみ出して細いトゲに見える（実際に出たので直した）。
BOUNDARY = [
    (1560,  860,  0),
    (1500,  980,  0),
    (1470, 1090,  0),
    (1468, 1200,  0),
    (1458, 1300,  0),
    (1455, 1385,  0),
    (1462, 1440, 24),   # ここから腕の裏
    (1452, 1500, 24),
    (1434, 1556, 20),
    (1404, 1610, 12),
    (1372, 1670,  0),
    (1352, 1730,  0),
    (1320, 1860,  0),
]
# しっぽを回す軸。腕の裏（＝継ぎ目のそば）に置くことで、
# 切り口はほとんど動かず、先だけが振れる。
PIVOT = (1424, 1524)
# しっぽの食い込みを、体の輪郭からこれだけ内側に留める。
# 振り角 ±6° で継ぎ目が動く量（軸から 100px の点で約 10px）より大きく取る。
OVERLAP_MARGIN = 14

def _mask(pts):
    m = Image.new("L", (SRC_SIZE, SRC_SIZE), 0)
    ImageDraw.Draw(m).polygon(
        pts + [(SRC_SIZE + 40, pts[-1][1]), (SRC_SIZE + 40, pts[0][1])], fill=255
    )
    return m

BASE_LINE = [(x, y) for x, y, _ in BOUNDARY]
TAIL_LINE = [(x - ov, y) for x, y, ov in BOUNDARY]

def _erode(m, r):
    """不透明な範囲を r px 内側へ縮める（ひし形。scipy を入れずに済ませる）。"""
    for _ in range(r):
        m = (m & np.roll(m, 1, 0) & np.roll(m, -1, 0)
               & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    return m


def cut(name):
    im = Image.open(os.path.join(ROOT, "public", name)).convert("RGBA")
    if im.size != (SRC_SIZE, SRC_SIZE):
        im = im.resize((SRC_SIZE, SRC_SIZE), Image.LANCZOS)

    keep = np.array(_mask(BASE_LINE)) > 127          # しっぽ側（体から外す範囲）
    over = (np.array(_mask(TAIL_LINE)) > 127) & ~keep  # 体側への食い込み

    body = im.copy()
    body.paste(Image.new("RGBA", im.size, (0, 0, 0, 0)), mask=_mask(BASE_LINE))

    # 食い込みは「体の形の内側」に限る。体の外（背景の隙間）へはみ出させない
    inside = _erode(np.array(body)[:, :, 3] > 127, OVERLAP_MARGIN)
    tail_mask = Image.fromarray(((keep | (over & inside)) * 255).astype("uint8"), "L")
    tail = Image.new("RGBA", im.size, (0, 0, 0, 0))
    tail.paste(im, mask=tail_mask)
    return body, tail

def write(img, rel):
    p = os.path.join(ROOT, "public", "mascot", rel)
    img.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS).save(p, optimize=True)
    return os.path.getsize(p)

if __name__ == "__main__":
    think_body, tail = cut("character_thinking.png")
    happy_body, _ = cut("character_happy.png")   # 体は thinking と同一なのでしっぽは使い回す
    out = {
        "thinking-body.png": write(think_body, "thinking-body.png"),
        "happy-body.png":    write(happy_body, "happy-body.png"),
        "tail.png":          write(tail,       "tail.png"),
    }
    for k, v in out.items():
        print(f"  public/mascot/{k:20s} {v/1024:6.0f} KB")
    print(f"  {'合計':20s} {sum(out.values())/1024:6.0f} KB")

    if "--verify" in sys.argv:
        S = os.environ.get("VERIFY_DIR", "/tmp")
        tiles = []
        for deg in (-8, -5, 0, 5, 8):
            c = Image.new("RGBA", (SRC_SIZE, SRC_SIZE), (255, 0, 200, 255))
            c.alpha_composite(tail.rotate(deg, resample=Image.BICUBIC, center=PIVOT))
            c.alpha_composite(think_body)
            z = c.crop((1230, 1080, 1620, 1800)).resize((260, 480), Image.LANCZOS).convert("RGB")
            ImageDraw.Draw(z).text((4, 4), f"{deg:+d}", fill=(255, 0, 200))
            tiles.append(z)
        sh = Image.new("RGB", (260 * 5 + 8 * 4, 480), (220, 220, 220))
        for i, t in enumerate(tiles):
            sh.paste(t, (i * 268, 0))
        sh.save(os.path.join(S, "verify-joint.png"))
        print(f"  検証画像: {S}/verify-joint.png")
