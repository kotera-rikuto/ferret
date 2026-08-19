// 開発用アカウントの進行状況を見る（読み取りのみ）。
// ブラウザ確認のとき、どこまで開いているかを知るために使う。

import { readFile } from "node:fs/promises";
import { CLEAR_THRESHOLD } from "../lib/ai/compose.ts";

const env = await readFile(".env.local", "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = pick("NEXT_PUBLIC_SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");
const h = { apikey: key, Authorization: `Bearer ${key}` };

const users = await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: h })).json();
const dev = users.users.find((u) => u.email === "dev@ferret.test");
console.log(`開発用アカウント: ${dev.email}  id=${dev.id}`);

const col = encodeURIComponent('"order"');
const problems = await (
  await fetch(`${url}/rest/v1/problems?select=id,order,title&order=${col}.asc`, { headers: h })
).json();

const attempts = await (
  await fetch(
    `${url}/rest/v1/user_attempts?select=problem_id,total_score,is_provisional,grader_version&user_id=eq.${dev.id}`,
    { headers: h },
  )
).json();

const best = new Map();
const markers = new Map();
for (const a of attempts) {
  if (a.is_provisional) continue;
  best.set(a.problem_id, Math.max(best.get(a.problem_id) ?? 0, a.total_score));
  markers.set(a.problem_id, a.grader_version);
}

let currentSet = false;
for (const p of problems) {
  const score = best.get(p.id) ?? null;
  const cleared = (score ?? 0) >= CLEAR_THRESHOLD;
  let mark = cleared ? "✅" : "  ";
  if (!cleared && !currentSet) {
    mark = "🐾";
    currentSet = true;
  } else if (!cleared) {
    mark = "🔒";
  }
  console.log(
    `${mark} order=${String(p.order).padStart(3)} id=${p.id} ` +
      `${score === null ? "未回答" : `${score}点`}`.padEnd(8) +
      ` ${markers.get(p.id) ?? ""}  ${p.title}`,
  );
}
console.log(`\n回答ログ ${attempts.length} 件`);
