// 「場面」（`problems.scenario`）だけを書き替える。
//
//   node problems/scenario-update.mjs <データファイル>
//
// **`update.mjs` を使わない理由:** あちらは1問まるごと（title / code / keywords …）を
// 送り直す。場面を足すためだけに全列を上書きすると、**DB 側にだけ入っている直しが
// あった場合に、気づかないまま巻き戻る。** 触る列を1つに絞れば、その事故が起こりえない。
//
// 読み込むのは各データファイルの `scenario` だけなので、
// `stage-*.data.mjs`（1問まるごとのファイル）も
// `scenario-*.data.mjs`（場面だけのファイル）も、同じようにそのまま渡せる。
// **`scenario` を持たない問題は飛ばす**（null で潰さない）。
//
// `order` は PostgREST の並び替え指定と同じ名前なので、列として絞り込むには
// 引用符が要る（tests/integration/database.test.ts の I-612）。
// 素で書くと絞り込みが効かず、**エラーにもならないまま全行が更新される。**

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// DB の CHECK と同じ値（supabase/migrations/20260911220000_problem_scenario.sql）
const SCENARIO_MAX = 120;

// lib/ai/scorer.ts の NG_WORDS の写し。場面は画面に出る文章なので、
// 採点の講評と同じ制限がかかる（E2E の E-452 が画面の全文を走査する）
const NG_WORDS = [
  "弱点", "間違い", "間違っ", "誤り", "誤っ", "初心者", "勉強", "学習",
  "失敗", "正しい読み方", "不正解", "ダメ", "レベル", "理解不足",
  "できていません", "苦手", "不足", "足りて", "不十分", "浅い", "誤解",
];

const dataPath = process.argv[2];
if (!dataPath) {
  console.error("使い方: node problems/scenario-update.mjs <データファイル>");
  process.exit(1);
}
const { problems } = await import(pathToFileURL(dataPath).href);

const targets = problems.filter((p) => p.scenario !== undefined && p.scenario !== null);
if (targets.length === 0) {
  console.error(`${dataPath} に scenario を持つ問題が無い`);
  process.exit(1);
}

// --- 送る前に検査する ------------------------------------------------------
//
// 投入してから直すと、その間だけ本番の画面に出てしまう。
// preflight.mjs も同じ検査を持っているが、あちらは1問まるごとのファイルしか読めない
// （keywords や rubric_items が要る）ので、場面だけのファイルはここでしか止まらない。
const failures = [];
for (const p of targets) {
  if (p.scenario.trim().length === 0) {
    failures.push(`order=${p.order}: 場面が空文字列（入れないなら省略する）`);
  }
  if (p.scenario.length > SCENARIO_MAX) {
    failures.push(`order=${p.order}: 場面が ${p.scenario.length}字（${SCENARIO_MAX}字以内）`);
  }
  for (const ng of NG_WORDS) {
    if (p.scenario.includes(ng)) failures.push(`order=${p.order}: 場面に NG語「${ng}」`);
  }
}
if (failures.length > 0) {
  console.error("❌ 投入前の検査で止めた");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

const env = await readFile(".env.local", "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = pick("NEXT_PUBLIC_SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");

const col = encodeURIComponent('"order"');

for (const p of targets) {
  const res = await fetch(`${url}/rest/v1/problems?${col}=eq.${p.order}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ scenario: p.scenario }),
  });

  const rows = await res.json();

  if (!res.ok) {
    console.error(`❌ order=${p.order} の更新に失敗（HTTP ${res.status}）`);
    console.error(JSON.stringify(rows, null, 2));
    process.exit(1);
  }

  // 0件なら「その order が無い」。1件でないなら絞り込みが効いていない
  if (!Array.isArray(rows) || rows.length !== 1) {
    console.error(`❌ order=${p.order} で ${rows.length ?? "?"} 行が返った（1行のはず）`);
    process.exit(1);
  }

  console.log(`✅ order=${String(p.order).padStart(3)}  ${rows[0].scenario.split("\n")[0]}`);
}

console.log(`\n${targets.length} 問に場面を入れた`);
