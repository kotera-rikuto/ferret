import { IconChevronDown } from "@/components/ui/icons";

/**
 * よくある質問。**`<details>` で開閉する（JavaScript を1行も足さない）。**
 *
 * 自前で開閉状態を持つと、この節のためだけに LP 全体がクライアント部品になる。
 * `<details>` はブラウザが持っている仕組みなので、
 *   - スクリプトが届く前から開ける
 *   - キーボードと読み上げに最初から対応している（`summary` がボタンとして扱われる）
 *   - ページ内検索（⌘F）で閉じている中身も見つかる（Chrome / Safari）
 * という3つがそのまま手に入る。
 *
 * 矢印の回転は `@keyframes` ではなく transition なので、
 * `app/globals.css` の `prefers-reduced-motion` の一覧には入らない
 * （あちらが止めているのは繰り返す動きだけ）。それでも動きを減らす設定の人には
 * `motion-reduce:transition-none` で止めておく。
 */
export function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-2xl border-2 border-b-5 border-line bg-panel open:border-brand-soft"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4.5 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep sm:px-6 [&::-webkit-details-marker]:hidden">
            {item.q}
            <IconChevronDown
              size={20}
              className="shrink-0 text-brand-deep transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <p className="px-5 pb-5 text-[14px] leading-loose font-medium text-ink sm:px-6">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
