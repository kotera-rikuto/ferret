// LP だけで使うアイコン。作り方は components/ui/icons.tsx と揃えてある
// （ライブラリを増やさない・色は currentColor・呼び出し側の text-* で着色）。
//
// アプリ内のアイコン集と別ファイルにしているのは、置き場所ではなく寿命が違うため。
// こちらは訴求の文章に付く絵なので、文言を書き換えると一緒に要らなくなる。
// ui/icons.tsx に混ぜると、使われていないものが残っても気づけない。

type IconProps = {
  size?: number;
  className?: string;
};

/** 生成されたコードを指す。星（きらめき）は AI を表す一般的な記号 */
export function IconSpark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 3l1.8 4.6L19.5 9.5 14.8 11.4 13 16l-1.8-4.6L6.5 9.5l4.7-1.9L13 3Z" />
      <path d="M6 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    </svg>
  );
}

/** レビューのコメント。吹き出しの中に2本の行を引いて「書く」ことを示す */
export function IconComment({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" />
      <path d="M8 8.5h8M8 12h5" />
    </svg>
  );
}

/** 引き継ぎ。既にあるファイルが手元に渡ってくる形 */
export function IconHandover({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.5 3H8a2 2 0 0 0-2 2v6" />
      <path d="M14.5 3 19 7.5V19a2 2 0 0 1-2 2h-6" />
      <path d="M3 15.5h7.5" />
      <path d="M8 12.5l-3.2 3 3.2 3" />
    </svg>
  );
}

/** 右向きの矢印。ボタンの末尾に添える */
export function IconArrowRight({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}
