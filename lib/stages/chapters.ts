// ステージ選択マップの「章」。出典は ideas/問題構成案.md v3（ステージ1〜100の章立て）。
//
// DB にカラムを持たせず定数にしている理由:
// 章は order の範囲で機械的に決まり、問題構成案の側で確定している。
// カラムにすると 100問ぶんの入力作業と入力ミスの検証が増えるが、定数なら1箇所で済む。
// 章を跨いで問題を差し替える運用が始まったらカラム化を再検討する（design/移植残タスク.md）。

export type Chapter = {
  no: number;
  title: string;
  /** この章に属する order の範囲（両端を含む） */
  from: number;
  to: number;
};

export const CHAPTERS: Chapter[] = [
  { no: 1, title: "値の正体を掴む", from: 1, to: 7 },
  { no: 2, title: "実行の道筋を追う", from: 8, to: 14 },
  { no: 3, title: "処理のかたまりを読み解く", from: 15, to: 24 },
  { no: 4, title: "データの構造を読む", from: 25, to: 29 },
  { no: 5, title: "データの変形を追う", from: 30, to: 40 },
  { no: 6, title: "標準機能の引き出しを開ける", from: 41, to: 48 },
  { no: 7, title: "設計の意図を読む", from: 49, to: 54 },
  { no: 8, title: "壊れたときの挙動を読む", from: 55, to: 59 },
  { no: 9, title: "時間差のあるコードを読む", from: 60, to: 72 },
  { no: 10, title: "プロジェクト全体を見渡す", from: 73, to: 80 },
  { no: 11, title: "なぜ型があるのか", from: 81, to: 83 },
  { no: 12, title: "型が語っていることを読む", from: 84, to: 90 },
  { no: 13, title: "型の組み立てを追う", from: 91, to: 96 },
  { no: 14, title: "現場の型定義を読む", from: 97, to: 100 },
];

/**
 * order が属する章。範囲外（E2E のシード order=9001 など）は null を返し、
 * 画面側は章バナーなしで描画する。ここで例外を投げると、
 * 検証用の問題を1件入れただけでマップ全体が落ちる。
 */
export function chapterOf(order: number): Chapter | null {
  return CHAPTERS.find((c) => order >= c.from && order <= c.to) ?? null;
}

/**
 * ステージ選択のマップに出さない order（オーナー判断 2026-09-12）。
 *
 * 999 は動作確認用に入れてある問題で、**学習者にとっては中身のない1件**。
 * 100問の最後に「ここから とくべつステージ」という帯つきで並んでいて、
 * 進捗の分母も 101 になっていた（100問クリアしても 100/101 で 100% にならない）。
 *
 * **消すのはマップの表示だけ**（オーナー判断）。`loadProgress` からは外さないので、
 * `/problems/<999のid>` は今までどおり開けて採点もできる ── 動作確認の裏口として残す。
 *
 * ⚠️ **E2E のシード（9001 / 9002）はここに入れない。** あちらは
 * `tests/e2e/stages.spec.ts` が**マップ上の鍵の状態を見て**解放判定を確かめており、
 * 隠すとその検査が対象を見失う。本番の DB には存在しないので、隠す必要もない。
 */
const HIDDEN_ORDERS: ReadonlySet<number> = new Set([999]);

/** マップに出さない問題か */
export function isHiddenOrder(order: number): boolean {
  return HIDDEN_ORDERS.has(order);
}
