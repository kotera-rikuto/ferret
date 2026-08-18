// 問題文のコードに色を付ける（Shiki）。**サーバー側だけで動く。**
//
// Ferret はコードを読ませるアプリなので、`const` なのか変数名なのか文字列なのかを
// 目で拾う手間は、読み取りそのものと関係ないところで体力を使わせている。
//
// ブラウザ側で色を付けない理由は2つ。文法定義とテーマを読み込むぶん
// 転送量が増えることと、**色が付くまでの一瞬、素のコードが見える**こと。
// 問題画面はサーバーコンポーネントなので、HTML を返す時点で色が付いた状態にできる。
//
// **配色は Shiki 既製のものをそのまま使う**（オーナー判断・2026-08-18）。
// 既製テーマ40種のうち gruvbox-dark-hard を選んだのは、
// design/ のモックが手で塗っていた色（キーワード=オレンジ・文字列=黄緑・
// コメント=くすんだ茶）との差が実測でいちばん小さかったため。
// 選定の手順は tasks/E5-コードの色付け.md の作業記録に残してある。

import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import javascript from "shiki/langs/javascript.mjs";
import typescript from "shiki/langs/typescript.mjs";
import gruvboxDarkHard from "shiki/themes/gruvbox-dark-hard.mjs";

/** 使うテーマ。`app/globals.css` のコードパネルの色はここから写している */
export const CODE_THEME = gruvboxDarkHard;

/**
 * 色付きの `<pre>` と素の `<pre>` で共有するクラス。
 *
 * 問題によって色が付いたり付かなかったりするので、
 * **どちらの経路でも同じ余白・行間になること**を1か所で保証する。
 */
export const PRE_CLASS = "overflow-x-auto p-5 font-mono text-sm leading-loose";

/**
 * `problems.language` の値から Shiki の文法名へ。
 *
 * DB には `js` / `ts` が入っている（`ideas/db仕様.md`。将来 `ruby` / `python` の欄もある）。
 * **知らない言語は色を付けずに素のまま出す。** 対応していない言語が1件入っただけで
 * 問題画面が落ちるより、色が付かないほうがはるかにましなため。
 */
const LANGS: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript",
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript",
};

/**
 * 文法定義とテーマの読み込みは1回だけ。
 *
 * `createHighlighterCore` は文法をパースするので、リクエストごとに作ると
 * 問題を開くたびに同じ処理を繰り返すことになる。Promise のまま持って、
 * 同時に複数のリクエストが来ても読み込みが二重に走らないようにする。
 *
 * 文法もテーマも**名前で読み込むのではなく import している**（`shiki` の
 * 全部入りではなく `shiki/core`）。全部入りにすると使わない200言語ぶんが
 * サーバーの配布物に乗る。
 *
 * 正規表現エンジンは JavaScript 版を使う（既定の Oniguruma は WebAssembly を
 * 積むことになる）。JS / TS はどちらも JavaScript 版が正式に対応している言語。
 */
let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [gruvboxDarkHard],
    langs: [javascript, typescript],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/**
 * コードを色付き HTML にする。**色を付けられなかったときは `null`。**
 *
 * 呼ぶ側（`app/problems/[id]/page.tsx`）は `null` なら素のテキストとして描く。
 * 例外を投げて画面ごと落とさないのは、ここが表示の飾りだからで、
 * 落ちてよい場所ではない（採点の保存とは扱いが違う）。
 *
 * 差し込む先は `dangerouslySetInnerHTML` になるが、Shiki は
 * 受け取った文字列を必ずエスケープしてから span で包むので、
 * `code` に `<script>` が書かれていてもタグとしては出ない。
 * そもそも `problems.code` は運営が入れるデータで、ユーザー入力は通らない。
 */
export async function highlightCode(
  code: string,
  language: string | null | undefined,
): Promise<string | null> {
  const lang = LANGS[(language ?? "").trim().toLowerCase()];
  if (!lang) return null;

  try {
    const hl = await getHighlighter();
    return hl.codeToHtml(code, {
      lang,
      theme: gruvboxDarkHard.name ?? "gruvbox-dark-hard",
      // Shiki が付ける <pre> に、素のときと同じ見た目の指定を足す。
      // ここを揃えておかないと、色が付く問題と付かない問題で
      // 余白や行間が変わってしまう
      transformers: [
        {
          pre(node) {
            this.addClassToHast(node, PRE_CLASS);
          },
        },
      ],
    });
  } catch (e) {
    // 色が付かないだけで読めるので、握りつぶさず記録して素通しに落とす
    console.error("[highlight] コードの色付けに失敗しました", e);
    return null;
  }
}
