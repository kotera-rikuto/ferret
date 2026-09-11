// 投入済みの実データから登録用 SQL を生成する。
//
//   node problems/gen-sql.mjs <開始order> <終了order> [出典の名前] > problems/stage-XXX-YYY.sql
//
// 第3引数を省くと 出典 の行が stage-006-014 のまま出る（初回のバッチの名前が残っている）。
// **記録の出典が実際のデータファイルと違うと、あとから読んだ人が別のものを直す**ので、
// 新しいバッチでは自分のファイル名を渡すこと。
//
// **手で SQL を書かない。** 手書きだと、投入のときに直した1文字が記録に反映されず、
// あとから .sql を信じた人が別のものを入れることになる
// （tasked/A1-読解型の検証.md の決定①）。
//
// id は出力しない（GENERATED ALWAYS AS IDENTITY。指定すると 428C9）。

import { readFile } from "node:fs/promises";

const from = Number(process.argv[2]);
const to = Number(process.argv[3]);
// `--scenario` を付けると、場面（A4）だけを入れ直す UPDATE 文を出す。
//
// 既に入っている問題に場面を足したときの記録用。insert 文を作り直すと
// 「この .sql を流せば再現できる」はずが**既存行と衝突して流せない**ので、
// 場面だけを足した回は場面だけの記録にする。
// 4・5問目のように data.mjs を持たない問題でも、これで記録が残せる。
const SCENARIO_ONLY = process.argv.includes("--scenario");
const source = process.argv.slice(4).find((a) => !a.startsWith("--")) ?? "stage-006-014";

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

if (SCENARIO_ONLY) {
  out.push(`-- ステージ${from}〜${to} の場面（scenario）を投入`);
  out.push(`-- 出典: problems/${source}.data.mjs / 票: tasks/A4-問題に実務の文脈を足す.md`);
  out.push(`-- **投入済みの実データから生成したもので、手書きしていない**`);
  out.push(`-- 入れ直すときは node problems/scenario-update.mjs <データファイル>`);
  out.push("");
  out.push("begin;");
  for (const p of rows) {
    if (p.scenario === null) continue;
    out.push("");
    out.push(`-- ステージ${p.order}: ${p.title}`);
    out.push(`update public.problems set scenario = ${lit(p.scenario)} where "order" = ${p.order};`);
  }
  out.push("");
  out.push("commit;");
  console.log(out.join("\n"));
  process.exit(0);
}

out.push(`-- ステージ${from}〜${to} 投入`);
out.push(`-- 出典: problems/${source}.data.mjs / 設計: problems/${source}.md`);
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
  if (p.scenario !== null) {
    cols.push("scenario");
    vals.push(lit(p.scenario));
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
