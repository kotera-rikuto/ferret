import Image from "next/image";
import thinkingBody from "@/public/mascot/thinking-body.png";
import happyBody from "@/public/mascot/happy-body.png";
import tailPart from "@/public/mascot/tail.png";

/**
 * 動くマスコット。**大きく出る2か所だけ**で使う（E10・2026-08-19）。
 *
 * 静止画で足りるところは `Mascot.tsx` のまま。あちらが全画面の唯一の入口で、
 * ここは「動かすと効く場所」だけの別入口。**16か所は静止画のまま**にしてある
 * （横 26〜36px のアイコンは動かしても見えず、読み込むものだけ増える）。
 *
 * ---
 *
 * **Lottie は使っていない**（オーナー判断・2026-08-19）。
 *
 * Lottie は「専用ソフトで作り込んだ動きを再生する」ための仕組みで、
 * 今回作ったのは「元の絵をしっぽと本体に切り分けて、位置と角度を動かす」だけ。
 * それは CSS でそのまま書けるので、**ライブラリが1つも増えず、実行時の処理も無い**
 * （この部品は JSX と画像の参照しか持たない）。
 * 将来ちゃんとしたベクターの動きを外注するなら、その時点で入れ直せばよい。
 * 判断の経緯は tasked/E10 の作業記録に書いてある。
 *
 * **`"use client"` を書かないこと。** ここに状態を持たせないのは、
 * 全画面の入口である `Mascot.tsx` と同じ扱いを保つため。
 * （呼び出し側の `ProblemForm` / `ResultView` はどちらもブラウザ側の部品なので、
 * この部品もそのルートの配布物には乗る。ただし乗るのは JSX だけで、
 * 静止画で足りている16か所には何も増えない）
 *
 * **動かせる部位は「元の絵で隠れていない部品」だけ。**
 * 1枚の塗り絵なので、裏に回っている部分は描かれていない。
 * しっぽだけが体との間に背景の隙間を持っていて、切り離せた。
 * 虫眼鏡はレンズが顔に重なっており、ずらすと顔の輪郭が無い部分が出るので動かさない
 * （代わりにレンズの内側を光が横切る。切らずに済む）。
 * 切り方と座標は `design/mascot/cut-parts.py`。
 */

// 3枚とも同じ 768px 角のキャンバスに描き出してあるので、重ねるだけで位置が合う。
// 寸法を CSS 側で決めるため、両方向（h/w）を指定する（片方だけだと next/image が警告を出す）。
const LAYER = "pointer-events-none absolute inset-0 h-full w-full select-none";

// しっぽを回す軸。cut-parts.py の PIVOT (1424, 1524) を 2048 で割った値。
// **script 側の PIVOT を動かしたらここも直す**（合っていないと付け根が浮く）。
const TAIL_ORIGIN = "69.5% 74.4%";

// 虫眼鏡のレンズ（光を通す円）。元画像でレンズの内側は x 223-557 / y 668-835±167。
const LENS = { left: "10.9%", top: "32.6%", width: "16.3%", height: "16.3%" } as const;

export function MascotMotion({
  motion,
  className,
}: {
  /**
   * thinking … 採点待ち。息づかい + しっぽ + レンズの光。**繰り返す**
   * cheer    … リザルトの登場。ためて跳んで着地する。**1回だけ**。
   *             クリアしたときにしか使わない（不合格の画面で喜ばせない）
   */
  motion: "thinking" | "cheer";
  className?: string;
}) {
  const cheer = motion === "cheer";
  return (
    <div className={`relative aspect-square ${className ?? ""}`}>
      {/*
       * 全身の動き。軸を足元に置いてあるので、縮んでも立ち位置が上下しない。
       * しっぽの回転はこの中に入れて、全身の動きに乗るようにしている。
       */}
      <div
        className={`absolute inset-0 origin-bottom ${
          cheer ? "animate-mascot-cheer" : "animate-mascot-breathe"
        }`}
      >
        {/* しっぽは体より奥。切り口が腕（前足）の裏に隠れる並び順 */}
        <Image
          src={tailPart}
          alt=""
          aria-hidden
          loading="eager"
          className={`${LAYER} ${cheer ? "animate-mascot-tail-flick" : "animate-mascot-tail"}`}
          style={{ transformOrigin: TAIL_ORIGIN }}
        />
        <Image
          src={cheer ? happyBody : thinkingBody}
          alt=""
          aria-hidden
          loading="eager"
          className={LAYER}
        />

        {/*
         * レンズを横切る光。採点待ちだけ。
         * 円で切り抜いた中を斜めの帯が通るので、レンズの外へはみ出さない。
         * `opacity-0` を素の状態にしてあるので、
         * 「動きを減らす」設定で止めたときに帯が残らない（globals.css）。
         */}
        {!cheer && (
          <span
            aria-hidden
            className="pointer-events-none absolute overflow-hidden rounded-full"
            style={LENS}
          >
            <span
              className="animate-mascot-glint absolute rounded-full opacity-0"
              style={{
                left: "34%",
                top: "-30%",
                width: "32%",
                height: "160%",
                background:
                  "linear-gradient(to right, transparent, rgba(255,255,255,0.9), transparent)",
              }}
            />
          </span>
        )}
      </div>
    </div>
  );
}
