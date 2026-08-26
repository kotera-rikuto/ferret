// 既存の問題を order で特定して中身だけ差し替える。
//
//   node problems/update.mjs [データファイル]
//
// insert.mjs（POST）との使い分け:
//   - 新しい問題を足す        → insert.mjs
//   - **既存の order を書き替える → こちら**
//
// なぜ「消して入れ直す」ではなく更新なのか:
//   `user_attempts.problem_id` が問題を指しているので、DELETE + INSERT だと
//   過去の回答ログの参照先が消える（か、外部キーに拒否される）。
//   id を据え置いて中身だけ替えれば、履歴は残ったまま問題文が入れ替わる。
//   **その代わり、過去の回答は新しい問題文に紐づいて見える** ── A3 では
//   未デプロイ・回答者が開発用アカウントのみなので許容している（tasks/A3 の決定）。
//
// 1問ずつ PATCH する。まとめて送れないのは、PostgREST の PATCH が
// 「絞り込みに当たった全行を同じ値で更新する」形しか持たないため。
// 途中で失敗したらそこで止める（先の行だけ新しい、という中途半端を残さない）。
//
// `order` は PostgREST の並び替え指定と同じ名前なので、列として絞り込むには
// 引用符が要る（tests/integration/database.test.ts の I-612）。
// 素で書くと絞り込みが効かず、**エラーにもならないまま全行が更新される。**

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const dataPath = process.argv[2];
if (!dataPath) {
  console.error("使い方: node problems/update.mjs <データファイル>");
  process.exit(1);
}
const { problems } = await import(pathToFileURL(dataPath).href);

const env = await readFile(".env.local", "utf8");
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = pick("NEXT_PUBLIC_SUPABASE_URL");
const key = pick("SUPABASE_SERVICE_ROLE_KEY");

const col = encodeURIComponent('"order"');

for (const p of problems) {
  const body = {
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
  };

  const res = await fetch(`${url}/rest/v1/problems?${col}=eq.${p.order}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
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

  console.log(`✅ order=${String(p.order).padStart(3)}  id=${rows[0].id}  ${rows[0].title}`);
}

console.log(`\n${problems.length} 問を差し替えた`);
