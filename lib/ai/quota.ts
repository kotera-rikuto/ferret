// AI採点の1日あたりの上限（D1・2026-08-22）。
//
// **プラン別ではない。全員同じ。** 課金（D2）を入れると決めるまで、
// ここは商品の線引きではなく「使いすぎと荒らしを止める栓」として動く。
// プラン別にするときは下の2つの定数を関数に変えるだけで済むように、
// 呼び出し側（app/api/score/route.ts）には数字を書いていない。
//
// ---------------------------------------------------------------------------
// なぜ3重なのか
// ---------------------------------------------------------------------------
//
//   ① 全体の1日上限（DAILY_LIMIT_GLOBAL）
//      **アカウントを量産されたときに効くのはここだけ。** 登録はブラウザから
//      Supabase Auth へ直接飛ぶので、アプリ側から「1人が何個作ったか」は分からない。
//      個人の上限をいくら下げても、アカウントの数を掛ければ原価は伸びる。
//      ここが天井になっていれば、何アカウント作られても1日の支出は動かない。
//
//   ② 個人の1日上限（DAILY_LIMIT_PER_USER）
//      1アカウントで自動化された連打を止める。
//
//   ③ 既存の安全網（route.ts の RATE_LIMITS。1分10件 / 1時間60件 / 24時間300件）
//      **触っていない。** あちらは「行の数」を数える連打のブレーキで、
//      判定保留や解放用に入れた行まで含めて多めに数える。多めに数えるのは安全側なので、
//      こちらの数え方（採点1回だけを数える）に揃えて緩めることはしない。
//
// この3つはどれもコードの中の話で、**金額の天井にはならない。**
// 本当の天井は OpenAI 側の使用量上限（管理画面）で、そこは残タスク.md §C-4 の宿題。
//
// ---------------------------------------------------------------------------
// 数え方は user_attempts ではなく専用の表
// ---------------------------------------------------------------------------
//
// `ideas/db仕様.md` の「レート制限のクエリ」（user_attempts を数える）は使っていない。
// 理由は supabase/migrations/20260822174900_ai_usage_daily.sql の先頭に書いてある。
// 要点は「count → 判定 → 採点 が不可分でないので並列で抜けられる」と
// 「行の数は採点の回数ではない」の2つ。

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 環境変数で上書きできる上限。**上書きは運用のためで、既定値が仕様。**
 *
 * 値が壊れていたら（0以下・数字でない）既定値に落とす。
 * 「設定を間違えたら上限が消える」ほうが、気づかない事故としては最悪なので、
 * 落とす方向は必ず既定値（＝制限あり）にする。
 */
function envLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`${name} の値が不正なので既定値を使う:`, raw);
    return fallback;
  }
  return n;
}

/**
 * 1人が1日（JST）に AI 採点を受けられる回数。
 *
 * 20 の根拠: 原価は1回 約¥0.04（実測。`npm run golden` の 90回で約¥3.6）なので
 * 1人1日あたり ¥0.8 が上限になる。全100問を5日で走り切れる量で、
 * 実際の学習で当たることはほぼない。
 * **3（Free プランの案）にはしない** ── 課金前のいまは商品の線引きではないため、
 * 訓練が成立しない高さまで下げる理由がない。
 */
export const DAILY_LIMIT_PER_USER = envLimit("AI_SCORING_DAILY_LIMIT", 20);

/**
 * サービス全体で1日（JST）に許す AI 採点の回数。
 *
 * 500 の根拠: 最悪でも1日 ¥20〜40。利用者が増えたら環境変数で上げる
 * （上げ忘れると全員が「混み合っています」になるので、発動時はログに出す）。
 */
export const DAILY_LIMIT_GLOBAL = envLimit("AI_SCORING_DAILY_LIMIT_GLOBAL", 500);

export type QuotaVerdict =
  /** 1回ぶん確保できた。**この後に OpenAI を呼んでよい** */
  | { ok: true; userUsed: number; globalUsed: number }
  /** 上限。`user` は本人の枠切れ（判定保留）、`global` は全体の天井（503） */
  | { ok: false; blockedBy: "user" | "global"; userUsed: number; globalUsed: number }
  /** 数えられなかった。**通さない**（既存の安全網と同じ判断） */
  | { ok: "unavailable" };

/** returns table なので配列で返る。念のため単体でも受ける */
function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

/**
 * 1回ぶん確保する。**OpenAI を呼ぶ直前に1回だけ呼ぶこと。**
 *
 * 呼んだ後で確保するとその回の原価が出るので、順番を入れ替えてはいけない。
 * 同一回答のリプレイ（API を呼ばない）より後に呼ぶ必要もある ── リプレイで
 * 消費すると「同じ回答を出し直すと枠が減る」ことになる。
 *
 * @param admin service_role のクライアント。**本人のクライアントでは数えない。**
 *   RLS の設定ミスで0件が返ると上限が黙って無効になるのが一番まずい壊れ方（route.ts と同じ理由）
 */
export async function consumeAiQuota(
  admin: SupabaseClient,
  userId: string,
): Promise<QuotaVerdict> {
  const { data, error } = await admin.rpc("consume_ai_quota", {
    p_user_id: userId,
    p_user_limit: DAILY_LIMIT_PER_USER,
    p_global_limit: DAILY_LIMIT_GLOBAL,
  });

  if (error) {
    console.error("採点回数の確保に失敗:", error);
    return { ok: "unavailable" };
  }

  const row = firstRow(data);
  // 関数が値を返さないのは想定外。ここで通すと上限が無効になるので落とす
  if (!row || typeof row.allowed !== "boolean") {
    console.error("採点回数の確保が想定外の値を返した:", data);
    return { ok: "unavailable" };
  }

  const userUsed = Number(row.user_used ?? 0);
  const globalUsed = Number(row.global_used ?? 0);

  if (row.allowed) return { ok: true, userUsed, globalUsed };

  return {
    ok: false,
    blockedBy: row.blocked_by === "global" ? "global" : "user",
    userUsed,
    globalUsed,
  };
}

/**
 * 確保した1回ぶんを返す。**「課金されていない」と分かった失敗のときだけ。**
 *
 * OpenAI が 429 / 5xx を返した場合はトークンが1つも課金されていないので返す。
 * 応答が返ってきた失敗（JSON が壊れている・スキーマ違い等）は課金済みなので返さない。
 * タイムアウトも返さない（課金されたか判定できないため安全側に置く）。
 *
 * **全部の失敗で返すと穴になる。** 失敗を誘発できる入力を見つけた相手が、
 * 枠を消費せずに何度でも OpenAI を叩けることになる（1回の失敗で内部リトライ込み最大2回課金）。
 *
 * 返却に失敗しても採点の結果は変えない（ログだけ残す）。
 * ここで例外を投げると、採点不成立の 503 が 500 に化けて原因が分かりにくくなる。
 */
export async function refundAiQuota(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin.rpc("refund_ai_quota", { p_user_id: userId });
  if (error) console.error("採点回数の返却に失敗:", error);
}

export type QuotaSnapshot = {
  used: number;
  limit: number;
  /** 0 未満にはしない。上限を下げた直後は used が limit を超えうる */
  remaining: number;
};

/**
 * 残数の表示用。増やさずに読むだけ。
 *
 * 読めなかったときは null を返す（画面は枠を出さない）。
 * **0 を返さない** ── 「残り0」と出したのに採点できる／その逆の矛盾表示を作らないため。
 */
export async function peekAiQuota(
  admin: SupabaseClient,
  userId: string,
): Promise<QuotaSnapshot | null> {
  const { data, error } = await admin.rpc("peek_ai_quota", { p_user_id: userId });
  if (error) {
    console.error("採点回数の参照に失敗:", error);
    return null;
  }
  const row = firstRow(data);
  if (!row) return null;

  const used = Number(row.user_used ?? 0);
  if (!Number.isFinite(used)) return null;

  return {
    used,
    limit: DAILY_LIMIT_PER_USER,
    remaining: Math.max(0, DAILY_LIMIT_PER_USER - used),
  };
}

/**
 * つぎに枠が戻るまでの秒数（JST の 0 時まで）。`Retry-After` に載せる。
 *
 * リセットの時刻は SQL 側の日付（`now() at time zone 'Asia/Tokyo'`）と揃えてある。
 * ここは「あと何秒か」の目安を返すだけなので、多少ずれても強制には影響しない。
 */
export function secondsUntilJstReset(now: Date = new Date()): number {
  // JST の「いま」を UTC の見た目に置き換えて、その日の残り時間を測る。
  // 実行環境のタイムゾーンに依存させないため、日付の計算は UTC 経由で行う
  const jstNow = new Date(now.getTime() + 9 * 60 * 60_000);
  const elapsedMs =
    jstNow.getTime() -
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate());
  return Math.max(1, Math.ceil((24 * 60 * 60_000 - elapsedMs) / 1000));
}
