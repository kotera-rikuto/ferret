import Image from "next/image";
import character from "@/public/character_nobg.png";

// マスコット画像の唯一の入口。静的 import なので next/image が寸法を把握でき、
// 表示サイズは呼び出し側の w-* クラスで決める。
// 画像を差し替えるとき（衣装違い・表情違いなど）もここだけ直せば全画面に反映される
export function Mascot({
  className,
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return <Image src={character} alt={alt} className={className} />;
}
