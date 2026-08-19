"use client";

/**
 * 最初の描画より前に走らせる素の JavaScript を埋め込むための入れ物。
 *
 * **なぜ素の `<script>` ではなくこれを通すのか。**
 * React は「ツリーをブラウザ側で組み立て直した」ときに `<script>` を作り直す。
 * その `<script>` は**実行されない**（DOM の途中に足された script はブラウザが走らせない）ため、
 * React は開発中に警告を出す ──
 * `Encountered a script tag while rendering React component.`
 *
 * 組み立て直しは、ハイドレーションがずれたときに起きる。原因はこちらの不具合とは
 * 限らず、**ブラウザ拡張が HTML を触っただけでも起きる**（React の案内文にもそう書いてある）。
 * つまり素の `<script>` を置いている限り、この警告は他人の環境で勝手に出る。
 *
 * 対処は Next.js のドキュメントにあるとおり **`type` を出し分ける**こと
 * （`01-app/02-guides/preventing-flash-before-hydration.md`「Extracting a reusable component」）。
 *
 * | どこ | `type` | 何が起きるか |
 * |---|---|---|
 * | サーバー（HTML を組むとき） | `text/javascript` | ブラウザが HTML を読む途中に**同期実行**する（本来の役目） |
 * | ブラウザ（組み立て直すとき） | `text/plain` | 実行されないことが型で明示されるので、React は警告を出さない |
 *
 * **`"use client"` が要る。** サーバーコンポーネントのままだと、出力が
 * RSC のペイロードとして固定され、ブラウザ側で `typeof window` を評価する機会が無い
 * （＝いつでも `text/javascript` のまま）。ここだけクライアント部品にすることで、
 * 組み立て直しのときに `text/plain` へ切り替わる。
 *
 * `suppressHydrationWarning` は `type` がサーバーとブラウザで違うことを許すため。
 * **ここを外すと、この部品自体が新しいハイドレーションのずれを生む。**
 *
 * ⚠️ 組み立て直しが起きた回は、この script は実行されない。
 * 配色を当て直すのは `ThemeSync`（`useLayoutEffect`）の役目で、2つで組になっている。
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
