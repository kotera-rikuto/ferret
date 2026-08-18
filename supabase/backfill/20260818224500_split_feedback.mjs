/**
 * 20260818224500_attempt_feedback_split.sql の後始末。
 * つなげて保存されていた文章（ai_feedback）を ai_praise / ai_next_focus に戻す。
 *
 * 使い方（リポジトリのルートで）:
 *   node supabase/backfill/20260818224500_split_feedback.mjs           # 下見（書き込まない）
 *   node supabase/backfill/20260818224500_split_feedback.mjs --apply   # 実行
 *
 * **AI を呼ばない。点数を1点も動かさない。** 触るのは ai_praise / ai_next_focus の2列だけ。
 * 再採点で分け直すと、同じ回答でも点が変わる（実測で24点動いた記録がある）ため、
 * レベル（XP）とマップのクリア状態が後から動いてしまう。ここでは文章の切り分けだけを行う。
 *
 * ── なぜ機械的に戻せるか ────────────────────────────────────────
 * lib/ai/scorer.ts は [praise, nextFocus].join(" ") でつないでいた。
 * 各項目の中身は保存前に `\s+ → " "` へ畳まれているが、**日本語の文の切れ目に
 * 半角スペースは入らない**（実データでも「〜です。次に、〜」と続いている）。
 * したがって「。」＋半角スペースの並びは、つないだ境目にだけ現れる。
 * 実データ34件で境目が2つ以上ある行は0件だった。
 *
 * 境目が無い行は、片方の項目が空だった回。空になり方は
 * lib/ai/scorer.ts の templatePraise / templateNextFocus から2通りしかない。
 *   - よかったところが空 → 55点未満 かつ core=none（褒める材料が無い帯域）
 *   - つぎの一歩が空   → 80点以上（パーフェクト帯・矛盾なし）
 * どちらにも当てはまらない行は**触らない**。文章を2つに分けて書かせる前
 * （2026-08-16 の変更より前）に採点した行で、元から2つになっていない。
 *
 * しきい値は当時の値をこの場に書き写してある。compose.ts から読み込まないのは、
 * 将来しきい値を変えたときに**過去の復元結果が動いてしまわない**ようにするため。
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/** 当時の CLEAR_THRESHOLD / PERFECT_THRESHOLD（lib/ai/compose.ts） */
const CLEAR_AT = 55;
const PERFECT_AT = 80;

/** つないだ境目。句点＋半角スペース */
const JOINT = "。 ";

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

/** 保存済みの4観点から core の判定を取り出す（axes は配列を包んだ形） */
function coreVerdict(axes) {
  const list = axes?.axes;
  return Array.isArray(list)
    ? (list.find((a) => a.axis === "core")?.verdict ?? null)
    : null;
}

/** 戻せるなら { praise, nextFocus } を返す。戻せないなら null */
export function splitFeedback(row) {
  const text = (row.ai_feedback ?? "").trim();
  if (!text) return null;

  const at = text.indexOf(JOINT);
  if (at >= 0) {
    return {
      praise: text.slice(0, at + 1),
      nextFocus: text.slice(at + JOINT.length),
    };
  }

  // 境目が無い＝片方が空だった回。どちら側が空になる帯域かで決める
  if (row.total_score >= PERFECT_AT && !row.contradiction) {
    return { praise: text, nextFocus: null };
  }
  if (row.total_score < CLEAR_AT && coreVerdict(row.axes) === "none") {
    return { praise: null, nextFocus: text };
  }
  return null;
}

const { data, error } = await admin
  .from("user_attempts")
  .select("id, problem_id, total_score, ai_feedback, ai_praise, ai_next_focus, axes, contradiction, created_at")
  .order("created_at", { ascending: true });

if (error) {
  console.error("読み取り失敗:", error.message);
  process.exit(1);
}

const plan = [];
const skipped = [];
let already = 0;

for (const row of data) {
  // すでに2欄が入っている行は触らない（何度実行しても同じ結果になるように）
  if (row.ai_praise !== null || row.ai_next_focus !== null) {
    already += 1;
    continue;
  }
  const split = splitFeedback(row);
  if (!split) {
    skipped.push(row);
    continue;
  }
  plan.push({ row, ...split });
}

console.log(`対象 ${data.length} 件 / 復元する ${plan.length} 件 / 1枠のまま残す ${skipped.length} 件 / すでに済み ${already} 件`);

for (const { row, praise, nextFocus } of plan) {
  console.log(`  #${row.id.slice(0, 8)} problem=${row.problem_id} score=${row.total_score}`);
  console.log(`    よかったところ: ${praise ?? "（枠を出さない）"}`);
  console.log(`    つぎの一歩    : ${nextFocus ?? "（枠を出さない）"}`);
}
for (const row of skipped) {
  console.log(`  1枠のまま #${row.id.slice(0, 8)} problem=${row.problem_id} score=${row.total_score}「${(row.ai_feedback ?? "").slice(0, 30)}…」`);
}

if (!APPLY) {
  console.log("\n下見だけで終了しました。書き込むには --apply を付けて実行してください。");
  process.exit(0);
}

let updated = 0;
for (const { row, praise, nextFocus } of plan) {
  const { error: e } = await admin
    .from("user_attempts")
    .update({ ai_praise: praise, ai_next_focus: nextFocus })
    .eq("id", row.id);
  if (e) {
    console.error(`  #${row.id.slice(0, 8)} 更新失敗:`, e.message);
    continue;
  }
  updated += 1;
}

console.log(`\n${updated} / ${plan.length} 件を更新しました。`);
if (updated !== plan.length) process.exit(1);
