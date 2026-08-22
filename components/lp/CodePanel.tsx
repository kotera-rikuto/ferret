import { PRE_CLASS, highlightCode } from "@/lib/code/highlight";

/**
 * LP に置くコードパネル。
 *
 * **本物の問題画面と同じ作りにしてある**（`app/problems/[id]/page.tsx` の `CodePanel`）。
 * スクリーンショットを貼らずにここで組み直しているのは、オーナー判断（2026-08-22）:
 *   - どの画面幅でも文字がぼやけない。2倍サイズの画像を用意する手間も出ない
 *   - 暗い配色にそのまま追従する（画像だと明色版と暗色版の2枚を出し分けることになる）
 *   - **載せる文字をこちらで書くので、模範解答が写り込む事故が構造として起きない**
 *   - 問題を1問直すたびに撮り直す保守が付いてこない
 *
 * 色付けは Shiki（`lib/code/highlight.ts`）。**サーバー側で色が付いた HTML になる**ので、
 * LP にスクリプトは増えない。色を付けられなかったときは素のまま出す（本物と同じ挙動）。
 *
 * ⚠️ 申し送り: 問題画面のパネルとマークアップが同じものを2か所に持っている。
 * あちらは E11（スマホ版の不具合）が触っている最中なので、いま共通化すると衝突する。
 * まとめるなら F5（保守性）で扱うのが筋。
 */
export async function CodePanel({
  label,
  hint,
  code,
  language,
}: {
  /** パネル左上。本物は言語名（`JAVASCRIPT`） */
  label: string;
  /** パネル右上。本物は「読んでみよう」 */
  hint: string;
  code: string;
  language: string;
}) {
  const html = await highlightCode(code, language);

  return (
    <div
      data-code-panel
      className="overflow-hidden rounded-2xl border-b-5 border-code-edge bg-code-bg"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4.5 py-2.5 text-[11px] font-bold tracking-wider text-code-muted">
        <span>{label}</span>
        <span>{hint}</span>
      </div>
      {html ? (
        <div className="contents" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className={`${PRE_CLASS} text-code-ink`}>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
