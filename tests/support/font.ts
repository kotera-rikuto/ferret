/**
 * TTF の中身を読む道具。**検査から2か所で使う。**
 *
 * - `tests/unit/og-image.test.ts` の U-845 / U-907 ── コードに書いた文言を見る
 * - `tests/integration/problem-content.test.ts` の I-894 ── DB のタイトルを見る
 *
 * 片方だけでは網にならない。**カードに描く文字の出どころが2つある**ためで、
 * LP のカードは文言がコードにあり、結果のカード（G1）は問題名が DB にある。
 */

/**
 * TTF の cmap（文字 → 字形の対応表）を読んで、収録されている符号位置を集める。
 *
 * フォントを読む道具（fontkit・opentype.js）は入れていない。**この検査のためだけに
 * 依存を1つ増やす価値は無い**ので、必要な形式だけ自前で読む。
 * `design/og/subset-font.py` の出力は format 4 の subtable だけを持つ
 * （確認: `fontTools` で platformID 0/3 とも format 4）。
 */
export function codepointsInFont(ttf: Buffer): Set<number> {
  const numTables = ttf.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (ttf.subarray(rec, rec + 4).toString("latin1") === "cmap") {
      cmapOffset = ttf.readUInt32BE(rec + 8);
      break;
    }
  }
  if (cmapOffset < 0) throw new Error("cmap テーブルが無い");

  const found = new Set<number>();
  const numSubtables = ttf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const sub = cmapOffset + ttf.readUInt32BE(rec + 4);
    if (ttf.readUInt16BE(sub) !== 4) continue; // format 4 以外は読まない

    const segCount = ttf.readUInt16BE(sub + 6) / 2;
    const endCodes = sub + 14;
    const startCodes = endCodes + segCount * 2 + 2; // reservedPad を1つ挟む
    const idDeltas = startCodes + segCount * 2;
    const idRangeOffsets = idDeltas + segCount * 2;

    for (let s = 0; s < segCount; s++) {
      const end = ttf.readUInt16BE(endCodes + s * 2);
      const start = ttf.readUInt16BE(startCodes + s * 2);
      const delta = ttf.readInt16BE(idDeltas + s * 2);
      const rangeOffset = ttf.readUInt16BE(idRangeOffsets + s * 2);
      if (start === 0xffff) continue;
      for (let cp = start; cp <= end; cp++) {
        let glyph: number;
        if (rangeOffset === 0) {
          glyph = (cp + delta) & 0xffff;
        } else {
          const at = idRangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
          glyph = ttf.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        // 字形 0 は「無い」を表す（豆腐で描かれる）
        if (glyph !== 0) found.add(cp);
      }
    }
  }
  return found;
}
