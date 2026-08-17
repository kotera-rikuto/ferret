// 異議申し立て・問題報告の共有定義。
// route.ts に置けないのは、App Router のルートファイルが HTTP メソッド以外の
// export を許さないため。クライアント（ResultView）とサーバー（/api/feedback）の
// 両方から参照するので、依存ゼロのここに置く。

export const FEEDBACK_KINDS = ["score_dispute", "problem_error"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/**
 * 理由の記入は必須。ボタン1つで送れると「意地悪の連打」と「本当に採点がおかしい報告」を
 * 区別できず、貯めたデータをゴールデンセットの材料に使えなくなる。
 * 書く手間そのものが本気度のフィルタになる。
 */
export const COMMENT_MIN_CHARS = 10;
/** DB 制約（char_length <= 500）と揃えている。変えるときは両方 */
export const COMMENT_MAX_CHARS = 500;
