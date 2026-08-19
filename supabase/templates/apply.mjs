#!/usr/bin/env node
/**
 * 認証メールの文面を Supabase に反映する。
 *
 * 管理画面にHTMLを手で貼る作業を置き換えるもの。**貼り付けをやめた理由は2つある。**
 *   1. コピー経路の文字コードで壊れる。TextEdit が UTF-8 のファイルを別の
 *      文字コードとして開き、化けたまま貼られる事故が実際に起きた（2026-08-17）
 *   2. 管理画面の内容は Git で追えないので、リポジトリの控えと静かにズレる
 *
 * このスクリプトを通せば、**リポジトリのファイルが唯一の正**になる。
 *
 * 使い方（トークンを履歴やファイルに残さないため、環境変数で渡す）。
 * **bash と zsh の両方で動く形にしてある。** 以前は `read -rs -p "PAT: " VAR` と
 * 書いていたが、zsh の `read -p` は「コプロセスから読む」という別の意味なので
 * `read: -p: no coprocess` で失敗する（2026-08-19 に実際に踏んだ）。
 * macOS の既定シェルは zsh なので、bash 専用の書き方をここに置かないこと:
 *
 *   printf 'PAT: '; read -rs SUPABASE_ACCESS_TOKEN; echo; export SUPABASE_ACCESS_TOKEN
 *   node supabase/templates/apply.mjs
 *   unset SUPABASE_ACCESS_TOKEN
 *
 * トークンは https://supabase.com/dashboard/account/tokens で発行する。
 * **アカウント全体を操作できる強い鍵なので、使い終わったら削除するか、
 * 上のように環境変数で渡して unset すること。** ファイルに書かない。
 *
 * 触るのは確認メールの件名と本文だけ。site_url やパスワード設定など他の項目は
 * 送らないので変わらない（`supabase config push` と違い、ファイル全体で
 * 上書きしないのが狙い。config push は site_url まで巻き込むため使えない）。
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 管理画面の「Confirm signup」に対応する2項目。API のプロパティ名は公式リファレンス準拠 */
const TEMPLATES = [
  {
    label: "Confirm signup",
    file: "confirm-signup.html",
    subject: "Ferret のメールアドレス確認",
    subjectKey: "mailer_subjects_confirmation",
    contentKey: "mailer_templates_confirmation_content",
  },
];

/**
 * ファイル先頭の説明コメントは送らない。
 * 受信者に見えるものではないし、メール本文に運用メモを混ぜたくない。
 */
function stripLeadingComment(html) {
  return html.replace(/^\s*<!--[\s\S]*?-->\s*/, "");
}

/**
 * プロジェクトの識別子。`.env.local` の Supabase URL から取り出す。
 * ここに直接書かないのは、環境を変えたときに書き換え漏れが起きるため。
 */
async function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;

  const env = await readFile(join(HERE, "../../.env.local"), "utf8").catch(() => "");
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  const ref = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!ref) {
    throw new Error(
      "プロジェクトの識別子が分かりません。.env.local の NEXT_PUBLIC_SUPABASE_URL を確認するか、SUPABASE_PROJECT_REF を指定してください",
    );
  }
  return ref;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      [
        "SUPABASE_ACCESS_TOKEN が設定されていません。次のように渡してください:",
        "",
        `  printf 'PAT: '; read -rs SUPABASE_ACCESS_TOKEN; echo; export SUPABASE_ACCESS_TOKEN`,
        "  node supabase/templates/apply.mjs",
        "  unset SUPABASE_ACCESS_TOKEN",
        "",
        "トークンの発行: https://supabase.com/dashboard/account/tokens",
      ].join("\n"),
    );
    process.exit(1);
  }

  const ref = await projectRef();
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

  const body = {};
  const applied = [];
  for (const t of TEMPLATES) {
    const html = stripLeadingComment(await readFile(join(HERE, t.file), "utf8"));
    body[t.subjectKey] = t.subject;
    body[t.contentKey] = html;
    applied.push({ ...t, html });
    console.log(`送信: ${t.label}（件名「${t.subject}」/ 本文 ${html.length} 文字）`);
  }

  const res = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // 本文にトークンは含まれないが、念のため長さを切って出す
    const detail = (await res.text()).slice(0, 400);
    // 読み取り専用のトークンで実行すると必ずここに来る（2026-08-17 に実際に踏んだ）。
    // API の文言は「権限が足りない」とだけ言い、何の権限が要るかを教えてくれない
    const hint =
      res.status === 403
        ? "\n\nトークンの権限が足りません。**Auth（認証設定）の書き込み**を含むトークンで実行してください。\n" +
          "読み取りだけの権限では、この操作（文面の書き込み）はできません。\n" +
          "発行し直す: https://supabase.com/dashboard/account/tokens"
        : "";
    throw new Error(`反映に失敗しました（HTTP ${res.status}）: ${detail}${hint}`);
  }

  // **書けたと信じない。** 読み直して、送った内容と一致することを確かめる。
  // 一部のプロパティは無効な値だと黙って無視されうるため
  const check = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!check.ok) {
    console.warn(`⚠️ 反映は成功したが、確認の読み出しに失敗した（HTTP ${check.status}）`);
    return;
  }
  const current = await check.json();

  let ok = true;
  for (const t of applied) {
    const subjectMatches = current[t.subjectKey] === t.subject;
    const contentMatches = current[t.contentKey] === t.html;
    console.log(
      `${subjectMatches && contentMatches ? "✅" : "❌"} ${t.label}: ` +
        `件名 ${subjectMatches ? "一致" : "不一致"} / 本文 ${contentMatches ? "一致" : "不一致"}`,
    );
    if (!subjectMatches || !contentMatches) ok = false;
  }

  if (!ok) {
    console.error(
      "\n送った内容と保存された内容が違います。管理画面で確認してください:",
      `\n  https://supabase.com/dashboard/project/${ref}/auth/templates`,
    );
    process.exit(1);
  }
  console.log("\n完了。文字化けの心配なく反映されました。");
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
