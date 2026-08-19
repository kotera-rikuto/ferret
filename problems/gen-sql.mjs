// 投入済みの実データから登録用 SQL を生成する。
//
//   node problems/gen-sql.mjs <開始order> <終了order> > problems/stage-XXX-YYY.sql
//
// **手で SQL を書かない。** 手書きだと、投入のときに直した1文字が記録に反映されず、
// あとから .sql を信じた人が別のものを入れることになる
// （tasked/A1-読解型の検証.md の決定①）。
//
// id は出力しない（GENERATED ALWAYS AS IDENTITY。指定すると 428C9）。

import { readFile } from "node:fs/promises";

const from = Number(process.argv[2]);
const to = Number(process.argv[3]);

const env = await readFile(".env.local", "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = pick("NEXT_PUBLIC_SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");

// `order` は PostgREST の並び替え指定と同じ名前なので、列として使うには引用符が要る
// （tests/integration/database.test.ts の I-612）。素で書くと絞り込みが効かず、
// エラーにもならないまま全件が返る。
const col = encodeURIComponent('"order"');
const res = await fetch(
  `${url}/rest/v1/problems?select=*&${col}=gte.${from}&${col}=lte.${to}&order=${col}.asc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
const rows = await res.json();
if (!Array.isArray(rows)) {
  console.error(JSON.stringify(rows, null, 2));
  process.exit(1);
}

/** PostgreSQL の文字列リテラル。シングルクォートは 2つ重ねて escape する */
const lit = (s) => (s === null || s === undefined ? "null" : `'${String(s).replaceAll("'", "''")}'`);
const jsonb = (v) => `${lit(JSON.stringify(v))}::jsonb`;

const out = [];
out.push(`-- ステージ${from}〜${to} 投入`);
out.push(`-- 出典: problems/stage-006-014.data.mjs / 設計: problems/stage-006-014.md`);
out.push(`-- **投入済みの実データから生成したもので、手書きしていない**`);
out.push(`-- id は書かない（GENERATED ALWAYS AS IDENTITY）`);
out.push("");
out.push("begin;");

for (const p of rows) {
  const cols = ['"order"', "title", "language", "difficulty", "reading_type", "code", "question", "model_answer", "keywords", "rubric_items"];
  const vals = [
    p.order,
    lit(p.title),
    lit(p.language),
    p.difficulty,
    lit(p.reading_type),
    lit(p.code),
    lit(p.question),
    lit(p.model_answer),
    jsonb(p.keywords),
    jsonb(p.rubric_items),
  ];
  // 使っている問題だけ列を足す。空文字列を入れると画面に出ないまま気づけない（I-814）
  if (p.context !== null) {
    cols.splice(6, 0, "context");
    vals.splice(6, 0, lit(p.context));
  }
  if (p.prerequisite !== null) {
    cols.push("prerequisite");
    vals.push(lit(p.prerequisite));
  }

  out.push("");
  out.push(`-- ステージ${p.order}: ${p.title}（${p.reading_type}）`);
  out.push("insert into public.problems");
  out.push(`  (${cols.join(", ")})`);
  out.push("values (");
  out.push(vals.map((v) => `  ${v}`).join(",\n"));
  out.push(");");
}

out.push("");
out.push("commit;");
console.log(out.join("\n"));
