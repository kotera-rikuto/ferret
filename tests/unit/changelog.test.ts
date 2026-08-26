/**
 * 更新情報（`lib/changelog.ts`）の検査。ケース定義は tests/unit/テストケース.md の §20。
 *
 * ここで見るのは**書き手の手が滑ったときにだけ壊れるもの**で、
 * どれも画面には出るが「間違って出ている」とは見えない種類のもの。
 *   - 日付の並びが崩れる → 古い更新が先頭に来るが、画面は普通に描ける
 *   - ネガティブワードが混じる → 採点の講評だけ整えても、お知らせ側で方針が崩れる
 *   - 規約を改定したのに書き忘れる → 利用規約 第18条の周知が空手形になる（U-884）
 *   - `/changelog` を守ってしまう → 登録前の人が読めなくなる（U-887）
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CHANGELOG,
  CHANGELOG_CATEGORY_LABELS,
  CHANGELOG_ON_LP,
  formatChangelogDate,
  latestChangelog,
  type ChangelogCategory,
} from "@/lib/changelog";
import { LEGAL_REVISED_DATE } from "@/lib/legal";
import { CRAWL_DISALLOW } from "@/lib/seo/site";

/** サービスを公開した日（C5）。これより前の日付は「更新した日」になり得ない */
const LAUNCH = "2026-08-22";

/**
 * 画面に出してはいけない語（CLAUDE.md）。
 *
 * `lib/ai/scorer.ts` の `NG_WORDS` は**採点の講評だけを対象にした一覧**で、
 * export もしていない。あちらは AI の出力を弾くためのもので、
 * 「学習」「レベル」のように更新情報では普通に使う語まで含む。
 * ここは UI の方針そのもの（4語）に絞る。
 */
const NEGATIVE_WORDS = ["弱点", "失敗", "間違い", "間違っ", "初心者"];

/** 1件ぶんの、画面に出る文字を全部つなげたもの */
function textOf(entry: (typeof CHANGELOG)[number]): string {
  return [
    entry.title,
    entry.body,
    ...(entry.items ?? []),
    entry.link?.label ?? "",
  ].join("\n");
}

describe("§20 更新情報の中身", () => {
  it("U-880 新しい順に並んでいる", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    const dates = CHANGELOG.map((e) => e.date);
    // YYYY-MM-DD は文字列の比較がそのまま日付の比較になる
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("U-881 日付は YYYY-MM-DD で、公開日より前が無い", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date, `${entry.title} の日付の形`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      expect(
        entry.date >= LAUNCH,
        `${entry.title} が公開日（${LAUNCH}）より前になっている。公開前の変更は公開の1件にまとめる決め`,
      ).toBe(true);
    }
  });

  it("U-882 ネガティブワードを使っていない", () => {
    const targets = [
      ...CHANGELOG.map(textOf),
      ...Object.values(CHANGELOG_CATEGORY_LABELS),
    ];
    for (const text of targets) {
      for (const word of NEGATIVE_WORDS) {
        expect(
          text,
          `「${word}」は画面に出さない語（CLAUDE.md）`,
        ).not.toContain(word);
      }
    }
  });

  it("U-883 種類には必ず名前がある（画面に undefined を出さない）", () => {
    for (const entry of CHANGELOG) {
      const label =
        CHANGELOG_CATEGORY_LABELS[entry.category as ChangelogCategory];
      expect(label, `${entry.category} の名前が無い`).toBeTruthy();
    }
  });

  /**
   * **規約を改定したらここにも書く、を機械で担保する。**
   *
   * 利用規約 第18条は「効力の発生前に周知する」と約束していて、
   * その周知の置き場所がこの更新情報（`lib/legal.ts` の `LEGAL_REVISED_DATE` の注に明記）。
   * 改定日を上げたのに更新情報を書き忘れても**画面は何も変わらない**ので、
   * 気づける経路がここしかない。
   */
  it("U-884 最新の改定日に対応する更新情報がある", () => {
    const latestLegal = CHANGELOG.find((e) => e.category === "legal");
    expect(latestLegal, "規約の改定を書いた更新情報が1件も無い").toBeDefined();
    expect(
      formatChangelogDate(latestLegal!.date),
      `lib/legal.ts の最終改定日（${LEGAL_REVISED_DATE}）に対応する更新情報が無い`,
    ).toBe(LEGAL_REVISED_DATE);
  });

  it("U-885 行き先はサイト内のパスで書く", () => {
    for (const entry of CHANGELOG) {
      if (!entry.link) continue;
      expect(entry.link.href, `${entry.title} の行き先`).toMatch(/^\//);
      expect(entry.link.label.length).toBeGreaterThan(0);
    }
  });
});

describe("§20 表示の下ごしらえ", () => {
  it("U-886 日付は年月日に整える（ゼロ埋めを残さない）", () => {
    expect(formatChangelogDate("2026-08-25")).toBe("2026年8月25日");
    expect(formatChangelogDate("2026-12-01")).toBe("2026年12月1日");
  });

  it("U-887 LP に出すのは先頭から数件だけ", () => {
    const shown = latestChangelog();
    expect(shown.length).toBeLessThanOrEqual(CHANGELOG_ON_LP);
    expect(shown.length).toBeLessThanOrEqual(CHANGELOG.length);
    expect(shown[0]).toBe(CHANGELOG[0]);
  });
});

describe("§20 ログインなしで読めること", () => {
  /**
   * **この画面の存在理由が「登録前の人に見せること」なので、守ってはいけない。**
   * `proxy.ts` の matcher に足すと、規約の改定を周知する場所を
   * 同意する前の人が読めなくなる（法務文書と同じ理屈）。
   */
  it("U-888 /changelog は proxy.ts の matcher に入っていない", () => {
    const proxy = readFileSync(
      fileURLToPath(new URL("../../proxy.ts", import.meta.url)),
      "utf8",
    );
    const matcher = proxy.slice(proxy.indexOf("matcher: ["));
    const paths = [...matcher.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
    expect(paths.some((p) => p.startsWith("/changelog"))).toBe(false);
  });

  it("U-889 robots.txt でも塞いでいない", () => {
    const blocked: string[] = [...CRAWL_DISALLOW];
    expect(blocked).not.toContain("/changelog");
  });
});
