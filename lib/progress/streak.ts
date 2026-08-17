// ストリーク（連続で回答した日数）の計算。純粋関数のみ。
//
// 新しいテーブルは作らず user_attempts.created_at から毎回導出する。
// カウンタを別に持つと「回答は保存されたがカウンタ更新に失敗した」という
// 不整合が生まれるが、導出なら回答ログが唯一の真実のまま。

/** ISO 日時（または Date）を JST の日付文字列 YYYY-MM-DD にする */
export function toJstDate(value: string | Date): string {
  // sv-SE ロケールは YYYY-MM-DD 形式を返す定番の手
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * 連続日数を数える。
 *
 * きょうまだ回答していなくても、きのうまで続いていればその値を返す。
 * 「朝アプリを開いた瞬間にストリークが0に見える」と、続ける動機のほうが折れるため。
 * きょう回答すれば +1 された値になる。
 *
 * @param activeDates 回答があった JST 日付（YYYY-MM-DD）。重複・順不同でよい
 * @param today       きょうの JST 日付
 */
export function calcStreak(activeDates: Iterable<string>, today: string): number {
  const days = new Set(activeDates);
  let cursor = days.has(today) ? today : prevDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}

/** YYYY-MM-DD の前日。UTC 経由で計算するのは、実行環境のタイムゾーンに影響されないため */
function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
