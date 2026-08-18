// ブラウザ確認のために、開発用アカウントのステージを開ける／後片付けする。
//
//   node problems/unlock-seed.mjs add 3 4 5 7 8    … 印つきの行を入れて開ける
//   node problems/unlock-seed.mjs clean            … 印つきの行だけ消す
//
// **必ず印（grader_version）を付ける。** 実際に採点した行と混ざると、
// あとから「これは本物の実測か、確認のために置いた行か」が区別できなくなる。
// A1 が同じことをしている（tasked/A1-読解型の検証.md の申し送り5）。
//
// 進行判定は user_attempts の最高点だけを見るので（lib/progress/unlock.ts）、
// クリア閾値を超える行が1本あれば開く。

import { readFile } from "node:fs/promises";
import { CLEAR_THRESHOLD } from "../lib/ai/compose.ts";

const MARKER = "a2-unlock-seed";

const env = await readFile(".env.local", "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = pick("NEXT_PUBLIC_SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const users = await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: h })).json();
const dev = users.users.find((u) => u.email === "dev@ferret.test");

const mode = process.argv[2];

if (mode === "clean") {
  const res = await fetch(
    `${url}/rest/v1/user_attempts?grader_version=eq.${MARKER}&user_id=eq.${dev.id}`,
    { method: "DELETE", headers: { ...h, Prefer: "return=representation" } },
  );
  const gone = await res.json();
  console.log(`🧹 印つきの行を ${gone.length} 件消した（実際に採点した行は残っている）`);
  process.exit(0);
}

if (mode !== "add") {
  console.error("使い方: node problems/unlock-seed.mjs add <order...> | clean");
  process.exit(1);
}

const orders = process.argv.slice(3).map(Number);
const col = encodeURIComponent('"order"');
const problems = await (
  await fetch(`${url}/rest/v1/problems?select=id,order,title&order=${col}.asc`, { headers: h })
).json();

// **日時を1週間前にずらす。** 使いすぎの安全網（app/api/score/route.ts の RATE_LIMITS）は
// user_attempts.created_at の直近24時間を数えるので、印つきの行を「今」で入れると
// **1分10件の枠をそのまま食い潰し、本命の採点が 429 で弾かれる。**
// 実際に第3章の確認で踏んだ（14件入れた直後の1回目が 429）。
// 進行判定は最高点しか見ないので（lib/progress/unlock.ts）、日時をずらしても解放には影響しない。
const backdated = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

const rows = problems
  .filter((p) => orders.includes(p.order))
  .map((p) => ({
    user_id: dev.id,
    problem_id: p.id,
    created_at: backdated,
    answer: `【${MARKER}】ブラウザ確認のために置いた行。実際の回答ではない。`,
    keyword_score: 20,
    deep_score: CLEAR_THRESHOLD - 20 + 5,
    total_score: CLEAR_THRESHOLD + 5,
    ai_feedback: `${MARKER}`,
    scoring_method: "ai",
    grader_version: MARKER,
    answer_hash: `${MARKER}-${p.id}`,
    is_provisional: false,
    contradiction: false,
  }));

const res = await fetch(`${url}/rest/v1/user_attempts`, {
  method: "POST",
  headers: { ...h, Prefer: "return=representation" },
  body: JSON.stringify(rows),
});
const body = await res.json();
if (!res.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(`🔓 ${body.length} 件の印つきの行を入れた（order: ${orders.join(", ")}）`);
console.log(`   終わったら node problems/unlock-seed.mjs clean で消すこと`);
