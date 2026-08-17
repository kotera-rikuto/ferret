/**
 * 投入済みの問題データの健全性検査。
 * ケース定義は tests/integration/テストケース.md の §15。
 *
 * **既定では走らない。** 実際の Supabase を読む（読み取りのみ・書き込みはしない）。
 *
 *   npm run test:db
 *
 * `ideas/問題作成ガイド.md` の「投入前セルフチェック」は8項目あり、
 * 上4つは DB の制約が拒否する（§13 で検証済み）。
 * **下4つは投入できてしまうので人が見るしかない**とガイドに書かれている。
 * そこを機械にやらせるのがこのファイル。
 *
 * 一番効くのは「模範解答が層1で満点を取るか」。
 * ガイドが「これ1つでキーワード設定ミスの大半が見つかる」と書いている検査で、
 * 実際の採点関数（scoreKeywords）をそのまま使って確かめる。
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  scoreKeywords,
  normalizeForMatch,
  KEYWORD_SLOT_COUNT,
  type KeywordSlot,
} from "@/lib/ai/compose";
import { chapterOf } from "@/lib/stages/chapters";

const OPT_IN = process.env.RUN_DB_TESTS === "1";
if (OPT_IN) loadEnv({ path: ".env.local", quiet: true });

const URL_ = OPT_IN ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
const SERVICE = OPT_IN ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;
const RUN = OPT_IN && Boolean(URL_ && SERVICE);

/** 検証用・テスト用に入れてある問題は本番のコンテンツではないので外す */
const CONTENT_ORDER_MAX = 100;

type Problem = {
  id: number;
  order: number;
  title: string;
  language: string;
  code: string;
  question: string;
  model_answer: string;
  reading_type: string;
  /** 実行結果。入っている問題だけコードの下に別パネルで出る */
  context: string | null;
  /** 前提知識。入っている問題だけ折りたたみで出る */
  prerequisite: string | null;
  keywords: KeywordSlot[];
  rubric_items: {
    core: string;
    ground: string;
    depth: string;
    core_reject: string[];
  };
};

let problems: Problem[] = [];

/** テスト名に出す見出し */
function label(p: Problem) {
  return `order=${p.order}「${p.title}」`;
}

describe.skipIf(!RUN)("§15 問題コンテンツの健全性（実DB・読み取りのみ）", () => {
  beforeAll(async () => {
    const db: SupabaseClient = createClient(URL_!, SERVICE!, {
      auth: { persistSession: false },
    });
    const { data, error } = await db
      .from("problems")
      .select(
        "id, order, title, language, code, question, model_answer, reading_type, context, prerequisite, keywords, rubric_items",
      )
      .order("order");
    if (error) throw new Error(`問題を読み込めません: ${error.message}`);
    problems = ((data ?? []) as Problem[]).filter((p) => p.order <= CONTENT_ORDER_MAX);
  });

  it("I-800 検証対象の問題が1件以上ある（前提の確認）", () => {
    expect(problems.length).toBeGreaterThan(0);
  });

  /**
   * ガイドが「最重要」としている検査。
   * 模範解答自身が層1で満点を取れないルーブリックは壊れている。
   * 学習者は模範解答より短く書くのが普通なので、ここが満点でないと
   * 「正しく読めているのに層1が伸びない」問題になる。
   */
  it("I-801 模範解答が層1で満点を取る", () => {
    const broken: string[] = [];
    for (const p of problems) {
      const { score, hits } = scoreKeywords(p.model_answer, p.keywords);
      if (score < 20) {
        const missed = hits
          .map((hit, i) => (hit ? null : `#${i + 1}: ${p.keywords[i].match.join(" / ")}`))
          .filter(Boolean);
        broken.push(`${label(p)} → ${score}点。当たらなかったスロット ${missed.join(" , ")}`);
      }
    }
    expect(broken, `\n${broken.join("\n")}\n`).toEqual([]);
  });

  /**
   * 設問文にキーワードが入っていると、設問を写すだけで層1が取れる。
   * 「読めているか」ではなく「写したか」を測る問題になってしまう。
   */
  it("I-802 キーワードが設問文に含まれていない", () => {
    const leaked: string[] = [];
    for (const p of problems) {
      const question = normalizeForMatch(p.question);
      p.keywords.forEach((slot, i) => {
        for (const kw of slot.match) {
          const k = normalizeForMatch(kw);
          if (k.length >= 2 && question.includes(k)) {
            leaked.push(`${label(p)} スロット#${i + 1} の「${kw}」が設問文にある`);
          }
        }
      });
    }
    expect(leaked, `\n${leaked.join("\n")}\n`).toEqual([]);
  });

  /**
   * core に2要素以上を詰めると、正しいが短い回答が partial に落ちて不合格になる。
   * ガイドの表がそのまま数字で示している（1要素なら full、2要素だと 33点で不合格）。
   * 2つ目以降の要素は depth に回すのが正しい。
   */
  it("I-803 rubric_items.core が結論を1つだけ書いている", () => {
    const suspicious: string[] = [];
    for (const p of problems) {
      const core = p.rubric_items.core;
      const commas = (core.match(/、/g) ?? []).length;
      const conjunctions = (core.match(/かつ|および|ならびに|、さらに/g) ?? []).length;
      if (commas >= 2 || conjunctions >= 1) {
        suspicious.push(`${label(p)} core=「${core}」（読点${commas} / 接続${conjunctions}）`);
      }
    }
    expect(suspicious, `\n${suspicious.join("\n")}\n`).toEqual([]);
  });

  it("I-804 各スロットに表記ゆれが2件以上ある", () => {
    const thin: string[] = [];
    for (const p of problems) {
      p.keywords.forEach((slot, i) => {
        if (slot.match.length < 2) {
          thin.push(`${label(p)} スロット#${i + 1} が ${slot.match.length} 件`);
        }
      });
    }
    expect(thin, `\n${thin.join("\n")}\n`).toEqual([]);
  });

  /**
   * ガイドは「各要素は2文字以上」とルール化しているが、コード側に検査が無い。
   * しかも記号は正規化で落ちるので、`"[2, 4]"` は 6文字でも正規化後は `"24"` になる。
   * **正規化した後の長さ**で見ないとルールを守ったことにならない。
   */
  it("I-805 キーワードが正規化後も2文字以上ある", () => {
    const tooShort: string[] = [];
    for (const p of problems) {
      p.keywords.forEach((slot, i) => {
        for (const kw of slot.match) {
          const k = normalizeForMatch(kw);
          if (k.length < 2) {
            tooShort.push(`${label(p)} スロット#${i + 1}「${kw}」→ 正規化後「${k}」`);
          }
        }
      });
    }
    expect(tooShort, `\n${tooShort.join("\n")}\n`).toEqual([]);
  });

  /**
   * 模範解答が「言いがちな誤読」に当たると、正解が矛盾扱いされうる。
   * core_reject は AI に渡しているので、書き方によっては模範解答を否定する。
   */
  it("I-806 core_reject が模範解答そのものを指していない", () => {
    const conflict: string[] = [];
    for (const p of problems) {
      const answer = normalizeForMatch(p.model_answer);
      for (const reject of p.rubric_items.core_reject) {
        const r = normalizeForMatch(reject);
        // 誤読の文がまるごと模範解答に含まれていたら、両立していない
        if (r.length >= 8 && answer.includes(r)) {
          conflict.push(`${label(p)}「${reject}」が模範解答に含まれる`);
        }
      }
    }
    expect(conflict, `\n${conflict.join("\n")}\n`).toEqual([]);
  });

  it("I-807 order が重複していない", () => {
    const seen = new Map<number, string>();
    const dup: string[] = [];
    for (const p of problems) {
      const prev = seen.get(p.order);
      if (prev) dup.push(`order=${p.order}: 「${prev}」と「${p.title}」`);
      seen.set(p.order, p.title);
    }
    expect(dup, `\n${dup.join("\n")}\n`).toEqual([]);
  });

  it("I-808 タイトルが重複していない", () => {
    const seen = new Map<string, number>();
    const dup: string[] = [];
    for (const p of problems) {
      const prev = seen.get(p.title);
      if (prev) dup.push(`「${p.title}」が order=${prev} と order=${p.order} で重複`);
      seen.set(p.title, p.order);
    }
    expect(dup, `\n${dup.join("\n")}\n`).toEqual([]);
  });

  it("I-809 コード・設問・模範解答が空でない", () => {
    const empty: string[] = [];
    for (const p of problems) {
      for (const [field, value] of [
        ["code", p.code],
        ["question", p.question],
        ["model_answer", p.model_answer],
      ] as const) {
        if (!value || value.trim().length === 0) empty.push(`${label(p)} の ${field}`);
      }
    }
    expect(empty, `\n${empty.join("\n")}\n`).toEqual([]);
  });

  it("I-810 キーワードがちょうど4スロットある（DB制約の再確認）", () => {
    for (const p of problems) {
      expect(p.keywords.length, label(p)).toBe(KEYWORD_SLOT_COUNT);
    }
  });

  it("I-811 order が章の範囲に収まっている", () => {
    const orphan: string[] = [];
    for (const p of problems) {
      if (chapterOf(p.order) === null) orphan.push(label(p));
    }
    expect(orphan, `章に属さない問題:\n${orphan.join("\n")}\n`).toEqual([]);
  });

  it("I-812 language が js / ts のいずれか", () => {
    for (const p of problems) {
      expect(["js", "ts"], label(p)).toContain(p.language);
    }
  });

  /**
   * 実行結果・前提知識は「空なら枠を出さない」で分岐している（app/problems/[id]/page.tsx）。
   * 空文字列を入れると、入れたつもりなのに画面には出ない。
   * **エラーにならず、画面も壊れないので気づけない。** 未使用なら NULL のままにする。
   */
  it("I-814 実行結果・前提知識に空文字列が入っていない", () => {
    const blank: string[] = [];
    for (const p of problems) {
      for (const [field, value] of [
        ["context", p.context],
        ["prerequisite", p.prerequisite],
      ] as const) {
        if (value !== null && value.trim().length === 0) {
          blank.push(`${label(p)} の ${field}（NULL にすること）`);
        }
      }
    }
    expect(blank, `\n${blank.join("\n")}\n`).toEqual([]);
  });

  it("I-815 前提知識が400字以内（DB制約の再確認）", () => {
    const tooLong: string[] = [];
    for (const p of problems) {
      if (p.prerequisite && p.prerequisite.length > 400) {
        tooLong.push(`${label(p)} → ${p.prerequisite.length}字`);
      }
    }
    expect(tooLong, `\n${tooLong.join("\n")}\n`).toEqual([]);
  });

  /**
   * 前提知識に答えを書くと、その問題は読解訓練として成立しなくなる
   * （tasks/E4-問題データに欄を足す.md の注意）。
   * 「const は入れ替えられない」は前提知識だが、
   * 「だからこのコードはエラーになる」は答え。
   *
   * **これは目安の検査。** 模範解答と長めに一致する部分があるかを見るだけなので、
   * 言い換えて答えを書いた場合は捕まえられない。それでも、
   * 模範解答から文をコピーして貼るという一番ありがちな崩れ方は止まる。
   */
  it("I-816 前提知識が模範解答の文をそのまま写していない", () => {
    const WINDOW = 14;
    const leaked: string[] = [];
    for (const p of problems) {
      if (!p.prerequisite) continue;
      const pre = normalizeForMatch(p.prerequisite);
      const ans = normalizeForMatch(p.model_answer);
      for (let i = 0; i + WINDOW <= ans.length; i++) {
        const chunk = ans.slice(i, i + WINDOW);
        if (pre.includes(chunk)) {
          leaked.push(`${label(p)} 模範解答と一致「${chunk}」`);
          break;
        }
      }
    }
    expect(leaked, `\n${leaked.join("\n")}\n`).toEqual([]);
  });

  /**
   * 前提知識に採点キーワードを書くと、それを写すだけで層1が取れる。
   * I-802（キーワードを設問文に入れない）と同じ理屈で、
   * 前提知識も**全員が読める場所**なので同じ制限がかかる。
   *
   * ただし禁じるのは**コード本文に出てこない語だけ。**
   * `const` や `push` のようにコードに書かれている語は、
   * 前提知識を開かなくても画面から読めるので、ここで隠しても意味がない。
   * 逆に「コードに無い語」（`undefined` / `キー` / `参照` など）は
   * 結論そのものの語彙になりやすく、渡すと層1が「写したか」の検査に変わる。
   *
   * `context`（実行結果）はこの検査の対象にしない。
   * 影響型は「ログのどの行を根拠にしたか」を答えさせる問題なので、
   * ログに答えの語が出るのは設計どおり。
   */
  it("I-817 前提知識に、コードに無い採点キーワードが入っていない", () => {
    const leaked: string[] = [];
    for (const p of problems) {
      if (!p.prerequisite) continue;
      const pre = normalizeForMatch(p.prerequisite);
      const code = normalizeForMatch(p.code);
      p.keywords.forEach((slot, i) => {
        for (const kw of slot.match) {
          const k = normalizeForMatch(kw);
          if (k.length >= 2 && pre.includes(k) && !code.includes(k)) {
            leaked.push(`${label(p)} スロット#${i + 1} の「${kw}」が前提知識にある`);
          }
        }
      });
    }
    expect(leaked, `\n${leaked.join("\n")}\n`).toEqual([]);
  });

  /**
   * 参考値。落とすのではなく、いま何問あるかを記録として出す。
   * 100問に対する進捗が CI のログに残る。
   */
  it("I-813 進捗を記録する", () => {
    const byType = new Map<string, number>();
    for (const p of problems) {
      byType.set(p.reading_type, (byType.get(p.reading_type) ?? 0) + 1);
    }
    const summary = [...byType.entries()].map(([t, n]) => `${t}:${n}`).join(" / ");
    console.info(`[問題コンテンツ] ${problems.length} / 100 問  内訳 ${summary}`);
    expect(problems.length).toBeLessThanOrEqual(100);
  });
});

describe.skipIf(RUN)("§15 問題コンテンツの健全性", () => {
  it("実DB に繋がないので飛ばした（RUN_DB_TESTS=1 で有効になる）", () => {
    expect(RUN).toBe(false);
  });
});
