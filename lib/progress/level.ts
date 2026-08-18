// XP とレベルの計算。純粋関数のみ。
//
// **XP はカウンタとして貯めない。** `users.xp` に足していく形にすると
// 「採点結果は保存できたのに XP の加算だけ失敗した」というズレが生まれる。
// しかも画面は普通に描画される（数字が少し小さいだけ）ので、まず気づけない。
// 回答ログから毎回導出すれば `user_attempts` が唯一の真実のまま保てる
// （lib/progress/streak.ts と同じ方針）。ユーザー自身に XP を書かせる経路が
// どこにも無いので、点数と同じく自己申告にならない。
//
// **問題ごとに最高点だけを見る。** 1回ごとに足すと、同じ問題を解き直すだけで
// いくらでも増やせる（しかも解き直しには毎回こちらの採点原価がかかる）。
// 最高点で見れば「点を伸ばしたぶんだけ増える」ので、解き直す動機は残しつつ
// 稼ぎ場にはならない。**同一回答の再送（リプレイ）で増えないことも、
// 判定を1つも書かずにここから出てくる** ── 点数が同じなら差が0になるため。
//
// オーナー判断（2026-08-18）: 点数に応じて増やす / 1レベル = クリア10問ぶん /
// レベルが上がっても表示が変わるだけ（段位・認定証には繋げない）。

import { CLEAR_THRESHOLD, PERFECT_THRESHOLD } from "@/lib/ai/compose";

/** クリア（CLEAR_THRESHOLD 以上）で得る XP */
export const XP_CLEAR = 10;

/** パーフェクト帯（PERFECT_THRESHOLD 以上）で得る XP */
export const XP_PERFECT = 15;

/**
 * 1レベルぶんの XP。
 *
 * 「クリア10問ぶんで1つ上がる」を数式のほうに持たせている。
 * 100 と直接書くと、XP_CLEAR を変えたときに1レベルの重みが黙って変わる。
 * 全100問をクリアすると 1,000〜1,500 XP（パーフェクトの数で変わる）。
 */
export const XP_PER_LEVEL = XP_CLEAR * 10;

/** その問題の最高点に対して与える XP。不合格の帯は0 */
export function xpForScore(score: number): number {
  if (score >= PERFECT_THRESHOLD) return XP_PERFECT;
  if (score >= CLEAR_THRESHOLD) return XP_CLEAR;
  return 0;
}

/** 回答ログのうち、XP の計算に必要な列だけ */
export type ScoredAttempt = {
  id?: string;
  problem_id: number;
  total_score: number;
};

/**
 * 回答ログを問題ごとの最高点にまとめる。
 *
 * **XP をこの形に通してから数えることが、解き直しでの稼ぎを防いでいる。**
 * 同じ問題に何度クリアの行が積まれても、最高点が伸びなければ合計は変わらない。
 *
 * @param rows              判定保留を除いた自分の回答ログ
 * @param excludeAttemptId  この回答を除いて数える（「この回答より前の最高点」を出すため）
 */
export function bestScoreByProblem(
  rows: Iterable<ScoredAttempt>,
  excludeAttemptId?: string,
): Map<number, number> {
  const best = new Map<number, number>();
  for (const row of rows) {
    if (excludeAttemptId !== undefined && row.id === excludeAttemptId) continue;
    const current = best.get(row.problem_id) ?? 0;
    if (row.total_score > current) best.set(row.problem_id, row.total_score);
  }
  return best;
}

/**
 * 累計 XP。**問題ごとの最高点**を渡すこと（回答1件ごとの点数ではない）。
 *
 * @param bestScores 問題ごとの最高点。順不同でよい
 */
export function totalXp(bestScores: Iterable<number>): number {
  let xp = 0;
  for (const score of bestScores) xp += xpForScore(score);
  return xp;
}

/**
 * その回答で増えた XP。最高点を更新したぶんだけ増える。
 *
 * 点が下がった回では0。**減らすことはしない** ── 一度手に入れたものは
 * 減らない見せ方（装備獲得型）に揃えるため。
 *
 * @param previousBest その回答より前の、同じ問題での最高点（未回答なら0）
 * @param score        その回答の点数
 */
export function xpGain(previousBest: number, score: number): number {
  return Math.max(0, xpForScore(score) - xpForScore(previousBest));
}

export type LevelState = {
  level: number;
  /** いまのレベルに入ってから貯めた XP */
  xpInLevel: number;
  /** つぎのレベルまでの残り XP */
  xpToNext: number;
  /** バーの塗り（0〜100） */
  percent: number;
};

/**
 * 累計 XP からレベルを出す。上限は設けない（復習で最高点を伸ばせばその先も伸びる）。
 *
 * 0 XP がレベル1なので、10問クリア（100 XP）でレベル2に上がり、
 * 全100問クリアでレベル11に届く。
 */
export function levelFromXp(xp: number): LevelState {
  // 負の値や小数が来ても画面が壊れないようにする（呼び出し側の計算違いを
  // ここで吸収する。表示のためだけの数字なので、例外を投げる価値はない）
  const total = Math.max(0, Math.floor(xp));
  const xpInLevel = total % XP_PER_LEVEL;

  return {
    level: Math.floor(total / XP_PER_LEVEL) + 1,
    xpInLevel,
    xpToNext: XP_PER_LEVEL - xpInLevel,
    percent: Math.round((xpInLevel / XP_PER_LEVEL) * 100),
  };
}

/**
 * リザルト画面へ渡す表示用の値。
 *
 * 前後2つの状態を持つのは、バーを**この回答の前の位置から**動かすため。
 * 0から動かすと、増えていない回でも増えたように見える。
 */
export type XpView = {
  total: number;
  gain: number;
  now: LevelState;
  before: LevelState;
};

export function xpView(total: number, gain: number): XpView {
  const safeTotal = Math.max(0, Math.floor(total));
  // 増えたぶんが累計を超えることはない。超えて渡された場合は累計に合わせる
  // （「+15 XP」なのにバーが 10 ぶんしか進んでいない、という食い違いを防ぐ）
  const safeGain = Math.min(Math.max(0, Math.floor(gain)), safeTotal);

  return {
    total: safeTotal,
    gain: safeGain,
    now: levelFromXp(safeTotal),
    before: levelFromXp(safeTotal - safeGain),
  };
}
