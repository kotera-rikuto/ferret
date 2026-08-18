// 問題の投入。PostgREST（service_role）で入れ、投入結果をそのまま返す。
//
//   node problems/insert.mjs [データファイル]
//
// SQL を手で書いて貼るのではなくここから入れるのは、記録（.sql）を
// **投入した実データから生成する**ため。手書きだと記録と DB が静かにずれる
// （tasked/A1-読解型の検証.md の決定①）。
//
// id は送らない（GENERATED ALWAYS AS IDENTITY。送ると 428C9）。
// 9問を1回の POST で送るので、1問でも制約に触れれば全部入らない。

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const dataPath = process.argv[2] ?? "./problems/stage-006-014.data.mjs";
const { problems } = await import(pathToFileURL(dataPath).href);

const env = await readFile(".env.local", "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = pick("NEXT_PUBLIC_SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");

const rows = problems.map((p) => ({
  order: p.order,
  title: p.title,
  language: p.language,
  difficulty: p.difficulty,
  reading_type: p.reading_type,
  code: p.code,
  context: p.context ?? null,
  prerequisite: p.prerequisite ?? null,
  question: p.question,
  model_answer: p.model_answer,
  keywords: p.keywords,
  rubric_items: p.rubric_items,
}));

const res = await fetch(`${url}/rest/v1/problems`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify(rows),
});

const body = await res.json();

if (!res.ok) {
  console.error(`❌ 投入に失敗（HTTP ${res.status}）`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`✅ ${body.length} 問を投入した`);
for (const p of body.sort((a, b) => a.order - b.order)) {
  console.log(`  order=${String(p.order).padStart(3)}  id=${p.id}  ${p.title}`);
}
