// 既存の投入済み問題で「キーワードがタイトルに出ている」件数を数えるだけの調査用スクリプト。
// 新しい検査（I-802t）を必須にしてよいかの判断材料。読み取りのみ。

import { readFile } from "node:fs/promises";
import { normalizeForMatch } from "../lib/ai/compose.ts";

const env = await readFile(".env.local", "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = pick("NEXT_PUBLIC_SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");

const res = await fetch(`${url}/rest/v1/problems?select=order,title,code,keywords&order=order`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const rows = await res.json();

let leaky = 0;
for (const p of rows) {
  if (p.order > 100) continue;
  const title = normalizeForMatch(p.title);
  const code = normalizeForMatch(p.code);
  const hits = [];
  p.keywords.forEach((slot, i) => {
    for (const kw of slot.match) {
      const k = normalizeForMatch(kw);
      if (k.length >= 2 && title.includes(k) && !code.includes(k)) {
        hits.push(`#${i + 1}「${kw}」`);
      }
    }
  });
  if (hits.length > 0) {
    leaky++;
    console.log(`order=${p.order}「${p.title}」 → ${hits.join(" , ")}`);
  }
}
console.log(`\n本番用 ${rows.filter((p) => p.order <= 100).length} 問中 ${leaky} 問が該当`);
