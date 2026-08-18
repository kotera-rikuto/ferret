// 投入前の機械検査。
//
//   node problems/preflight.mjs [データファイル]
//
// `npm run test:db`（tests/integration/problem-content.test.ts の I-801〜I-817）は
// **投入したあとにしか回せない。** 落ちたら DB から消して直すことになる。
// A1 の申し送り「投入前に機械検査を回すと差し戻しが出ない。A2（91問）では
// 常設化する価値がある」を受けて、同じ判定を投入前に回せるようにしたもの。
//
// **判定ロジックは実物を呼ぶ。** scoreKeywords / normalizeForMatch / chapterOf を
// lib/ から直接読むので、採点側が変わればこの検査も自動で追随する
// （写して持つと、写した時点から静かにズレていく）。
//
// あわせて DB の CHECK 制約と、採点APIの個人情報検査も先に当てる。
// 制約違反は投入すれば分かるが、往復が減るぶん早い。個人情報検査のほうは
// **投入しても分からない** ── コードを引用した学習者の回答が 400 で弾かれる形で、
// 問題を公開したあとに初めて出る（tasked/A1 の決定②と同じ事故）。

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  scoreKeywords,
  normalizeForMatch,
  KEYWORD_SLOT_COUNT,
} from "../lib/ai/compose.ts";
import { chapterOf } from "../lib/stages/chapters.ts";

const READING_TYPES = ["トレース", "意図", "ズレ", "影響", "命名", "仕様"];
const PREREQUISITE_MAX = 400;

/** app/api/score/route.ts の PII_PATTERNS と同じ並び */
const PII_PATTERNS = [
  [/[\w.+-]+@[\w-]+\.[\w.]{2,}/, "メールアドレス"],
  [/\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/, "電話番号"],
  [/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}\b/, "APIキー"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, "AWSキー"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "GitHubトークン"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "秘密鍵"],
];

function looksLikeCardNumber(s) {
  for (const m of s.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
    const digits = m[0].replace(/[^\d]/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

const failures = [];
const warnings = [];
const notes = [];

function fail(p, id, message) {
  failures.push(`${id}  order=${p.order}「${p.title}」 ${message}`);
}

/** 落とさないが目に入れておきたいもの。既存の問題と基準がそろっていない項目はこちら */
function warn(p, id, message) {
  warnings.push(`${id}  order=${p.order}「${p.title}」 ${message}`);
}

// ---------------------------------------------------------------------------

const dataPath = process.argv[2] ?? "./problems/stage-006-014.data.mjs";
const { problems } = await import(pathToFileURL(dataPath).href);

// 既存の問題（order / title の重複を見るために読む。読み取りのみ）
let existing = [];
try {
  const env = await readFile(".env.local", "utf8");
  const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
  const url = pick("NEXT_PUBLIC_SUPABASE_URL");
  const key = pick("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/rest/v1/problems?select=id,order,title`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  existing = await res.json();
  notes.push(`既存 ${existing.length} 件と突き合わせた`);
} catch (e) {
  notes.push(`⚠️ 既存データを読めなかったので order / title の重複は未検査（${e.message}）`);
}

for (const p of problems) {
  // --- DB の CHECK 制約（投入すれば 23514 で分かるが、先に潰す） -------------
  if (!READING_TYPES.includes(p.reading_type)) {
    fail(p, "制約", `reading_type「${p.reading_type}」は6種のいずれでもない`);
  }
  if (p.keywords.length !== KEYWORD_SLOT_COUNT) {
    fail(p, "I-810", `キーワードが ${p.keywords.length} スロット（4固定）`);
  }
  if (p.rubric_items.core_reject.length < 2) {
    fail(p, "制約", `core_reject が ${p.rubric_items.core_reject.length} 件（2件以上）`);
  }
  for (const k of ["core", "ground", "depth"]) {
    if (!p.rubric_items[k]) fail(p, "制約", `rubric_items.${k} が空`);
  }
  if (p.prerequisite && p.prerequisite.length > PREREQUISITE_MAX) {
    fail(p, "I-815", `前提知識が ${p.prerequisite.length}字（${PREREQUISITE_MAX}字以内）`);
  }

  // --- I-801 模範解答が層1で満点を取る（ガイドが最重要としている検査） -------
  const { score, hits } = scoreKeywords(p.model_answer, p.keywords);
  if (score < 20) {
    const missed = hits
      .map((hit, i) => (hit ? null : `#${i + 1}: ${p.keywords[i].match.join(" / ")}`))
      .filter(Boolean);
    fail(p, "I-801", `模範解答が ${score}点。当たらないスロット ${missed.join(" , ")}`);
  }

  // --- I-802 キーワードが設問文に無い ---------------------------------------
  const question = normalizeForMatch(p.question);
  p.keywords.forEach((slot, i) => {
    for (const kw of slot.match) {
      const k = normalizeForMatch(kw);
      if (k.length >= 2 && question.includes(k)) {
        fail(p, "I-802", `スロット#${i + 1}の「${kw}」が設問文にある`);
      }
    }
  });

  // --- タイトルにも同じ性質がある（警告どまり・A2 で追加） -------------------
  //
  // タイトルは問題画面の見出しに出る（ideas/db仕様.md の title の欄）。
  // 設問文に書いてはいけない理由が「写すだけで層1が取れる」ことである以上、
  // 同じ画面に出ているタイトルにも同じことが言える。I-802 は設問文しか見ていない。
  //
  // **落とさず警告に留めてある。** 既存の本番用9問のうち4問が同じ形で
  //（order 1 の「再代入」、4・5 の「参照」「共有」、53 の「命名」「コメント」）、
  // ここで必須にすると新しい問題だけが厳しい基準になる。
  // 量産の途中で物差しを変えないこと自体が A2 の決まりなので、判断はオーナーに上げる。
  //
  // なお実害は限定的で、検証済みの引用が1つも無い回答は層1が10点で頭打ちになる
  // （compose.ts の KEYWORD_CAP_WITHOUT_EVIDENCE）。タイトルを写しただけでは
  // クリア閾値55に届かない。効くのは既に full を取れている回答の上積みだけ。
  //
  // I-817 と同じく、コードに見えている語は除く。隠しても画面から読めるため。
  const title = normalizeForMatch(p.title);
  const codeForTitle = normalizeForMatch(p.code);
  p.keywords.forEach((slot, i) => {
    for (const kw of slot.match) {
      const k = normalizeForMatch(kw);
      if (k.length >= 2 && title.includes(k) && !codeForTitle.includes(k)) {
        warn(p, "I-802t", `スロット#${i + 1}の「${kw}」がタイトルにある（コードには無い）`);
      }
    }
  });

  // --- I-803 core が結論を1つだけ書いている ---------------------------------
  const commas = (p.rubric_items.core.match(/、/g) ?? []).length;
  const conjunctions = (p.rubric_items.core.match(/かつ|および|ならびに|、さらに/g) ?? []).length;
  if (commas >= 2 || conjunctions >= 1) {
    fail(p, "I-803", `core に結論が2つ以上（読点${commas} / 接続${conjunctions}）`);
  }

  // --- I-804 / I-805 スロットの厚みと長さ ------------------------------------
  p.keywords.forEach((slot, i) => {
    if (slot.match.length < 2) {
      fail(p, "I-804", `スロット#${i + 1}の表記ゆれが ${slot.match.length} 件（2件以上）`);
    }
    for (const kw of slot.match) {
      const k = normalizeForMatch(kw);
      if (k.length < 2) {
        fail(p, "I-805", `スロット#${i + 1}の「${kw}」が正規化後「${k}」で2文字未満`);
      }
    }
  });

  // --- I-806 core_reject が模範解答そのものを否定していない -------------------
  const answer = normalizeForMatch(p.model_answer);
  for (const reject of p.rubric_items.core_reject) {
    const r = normalizeForMatch(reject);
    if (r.length >= 8 && answer.includes(r)) {
      fail(p, "I-806", `core_reject「${reject}」が模範解答に含まれる`);
    }
  }

  // --- I-807 / I-808 重複（新規どうし + 既存との突き合わせ） ------------------
  for (const other of [...problems, ...existing]) {
    if (other === p) continue;
    if (other.order === p.order) fail(p, "I-807", `order が「${other.title}」と重複`);
    if (other.title === p.title && other.order !== p.order) {
      fail(p, "I-808", `title が order=${other.order} と重複`);
    }
  }

  // --- I-809 / I-811 / I-812 / I-814 -----------------------------------------
  for (const [field, value] of [
    ["code", p.code],
    ["question", p.question],
    ["model_answer", p.model_answer],
  ]) {
    if (!value || value.trim().length === 0) fail(p, "I-809", `${field} が空`);
  }
  if (chapterOf(p.order) === null) fail(p, "I-811", `order=${p.order} がどの章にも属さない`);
  if (!["js", "ts"].includes(p.language)) fail(p, "I-812", `language「${p.language}」`);
  for (const [field, value] of [
    ["context", p.context],
    ["prerequisite", p.prerequisite],
  ]) {
    if (value !== undefined && value !== null && value.trim().length === 0) {
      fail(p, "I-814", `${field} が空文字列（使わないなら省略か null）`);
    }
  }

  // --- I-816 前提知識が模範解答を写していない --------------------------------
  if (p.prerequisite) {
    const WINDOW = 14;
    const pre = normalizeForMatch(p.prerequisite);
    for (let i = 0; i + WINDOW <= answer.length; i++) {
      const chunk = answer.slice(i, i + WINDOW);
      if (pre.includes(chunk)) {
        fail(p, "I-816", `前提知識が模範解答と一致「${chunk}」`);
        break;
      }
    }

    // --- I-817 前提知識にコード外のキーワードが無い --------------------------
    const code = normalizeForMatch(p.code);
    p.keywords.forEach((slot, i) => {
      for (const kw of slot.match) {
        const k = normalizeForMatch(kw);
        if (k.length >= 2 && pre.includes(k) && !code.includes(k)) {
          fail(p, "I-817", `スロット#${i + 1}の「${kw}」が前提知識にある（コードには無い）`);
        }
      }
    });
  }

  // --- 個人情報検査（投入しても分からない。公開後に学習者の回答が 400 になる） -
  for (const [field, value] of [
    ["code", p.code],
    ["question", p.question],
    ["context", p.context ?? ""],
  ]) {
    for (const [re, name] of PII_PATTERNS) {
      if (re.test(value)) {
        fail(p, "PII", `${field} に${name}らしき文字列がある（回答に引用されると 400 になる）`);
      }
    }
    if (looksLikeCardNumber(value)) {
      fail(p, "PII", `${field} にカード番号らしき並びがある`);
    }
  }
}

// ---------------------------------------------------------------------------

console.log(`検査対象 ${problems.length} 問（${dataPath}）`);
for (const n of notes) console.log(`  ${n}`);
console.log("");

if (warnings.length > 0) {
  console.log(`⚠️  警告 ${warnings.length} 件（落としてはいない）`);
  for (const w of warnings) console.log(`  ${w}`);
  console.log("");
}

if (failures.length > 0) {
  console.log(`❌ ${failures.length} 件`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}

console.log("✅ すべて通過");
for (const p of problems) {
  const { score } = scoreKeywords(p.model_answer, p.keywords);
  const ch = chapterOf(p.order);
  console.log(
    `  order=${String(p.order).padStart(3)} 第${ch.no}章 ${p.reading_type.padEnd(4)} ` +
      `難易度${p.difficulty} 模範解答=層1 ${score}点  ${p.title}`,
  );
}
