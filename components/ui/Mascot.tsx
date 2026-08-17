import Image from "next/image";
import neutral from "@/public/character_nobg.png";
import happy from "@/public/character_happy.png";
import thinking from "@/public/character_thinking.png";

// マスコット画像の唯一の入口。静的 import なので next/image が寸法を把握でき、
// 表示サイズは呼び出し側の w-* クラスで決める。
// 画像を差し替えるとき（衣装違い・表情違いなど）もここだけ直せば全画面に反映される。
//
// 3枚ともキャラの占有率は同じ（キャンバスの 82% × 84%）なので、
// 表情を変えても同じ w-* クラスで大きさが揃う。

/**
 * 表情。
 *
 * neutral  … 通常。ロゴ・ステージの現在地・待機
 * happy    … クリア / 完了を祝う場面だけ。不合格の画面には出さない
 * thinking … 考えている最中・保留。採点待ちや、まだ届かなかったとき
 */
export type MascotMood = "neutral" | "happy" | "thinking";

const SOURCES = { neutral, happy, thinking } as const;

export function Mascot({
  mood = "neutral",
  className,
  alt = "",
  priority = false,
}: {
  mood?: MascotMood;
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  return (
    <Image src={SOURCES[mood]} alt={alt} className={className} priority={priority} />
  );
}
