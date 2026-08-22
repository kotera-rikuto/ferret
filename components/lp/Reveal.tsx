"use client";

import { useEffect, useRef } from "react";

/**
 * スクロールして入ってきたときに、中身をふわっと持ち上げる入れ物。**LP だけで使う。**
 *
 * ## なぜ JavaScript を使うのか（一度 CSS だけで作って失敗している）
 *
 * 最初は `animation-timeline: view()`（CSS だけでスクロール量を進行度にする仕組み）で
 * 作った。**Chrome では動くが、Safari と Firefox は宣言ごと無視する。**
 * 無視されると読み込み時に1回だけ動く扱いになり、画面外の見出しは
 * スクロールして見るころには動き終わっている ── つまり**動きが無いのと同じ**になる。
 * オーナーの環境で「入っていない」と指摘されたのがこれ（2026-08-22）。
 * `IntersectionObserver` はどのブラウザにもあるので、こちらに寄せた。
 *
 * ## 文字が消えたままにならない作り
 *
 * **サーバーが返す HTML には隠す指定を入れていない。** 隠すのは
 * 「JavaScript が動いて、これから動かすと決めた要素」だけ。だから
 *   - スクリプトが届かない・切られている → そのまま見える
 *   - 検索エンジンのクローラ → そのまま見える
 *   - 「動きを減らす」設定の人 → 何もしない（下の判定で降りる）
 * のいずれでも、文字が出ないままになる経路が無い。
 *
 * ## state を持たず DOM を直接触っている理由
 *
 * やることはクラスの付け外しだけで、React 側に覚えておく必要が無い。
 * 効果の中で `setState` すると描画が余分に走る（`react-hooks/set-state-in-effect`
 * が実際に止めた）。「外側の仕組みと同期する」用途なので、DOM を直に触るのが素直。
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // OS の「動きを減らす」設定。**ここで降りると素の見た目のまま出る**
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /*
     * **すでに見えている位置にあるなら何もしない。**
     * 効果が走るのは最初の描画の後なので、見えている要素をここで隠すと
     * 「一瞬出てから消えて、また出る」チラつきになる。
     * 読み込み時に見えている範囲の動きは、主役の CSS だけに任せる。
     */
    const startsBelow =
      el.getBoundingClientRect().top > window.innerHeight * 0.82;
    if (!startsBelow) return;

    el.setAttribute("data-reveal", "");

    /*
     * 下端に触れた瞬間ではなく、**画面の内側まで入ってから**動かす。
     * 0 にすると目に入る位置に来たときにはもう静止している
     * （CSS 版で実際にそう見えていた）。
     */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.removeAttribute("data-reveal");
          el.classList.add("animate-rise");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
