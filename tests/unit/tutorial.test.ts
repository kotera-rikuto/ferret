/**
 * lib/stages/tutorial.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §26。
 *
 * 肩慣らしの範囲を DB カラムではなく定数で持つ判断をしているので（E15）、
 * **範囲そのものと、画面が範囲を自前で計算していないことをテストで守る。**
 * ズレても画面は普通に描画される（印が1つ多い／少ないだけ）ため、目視では気づけない。
 *
 * 出典: A3（TASKS.md 2026-08-26）でステージ1〜3を素直な問題に差し替えた
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { TUTORIAL_MAX_ORDER, isTutorialOrder } from "@/lib/stages/tutorial";

describe("§26-1 肩慣らしの範囲", () => {
  it("U-924 A3 で差し替えた3問と同じ範囲", () => {
    // 印の範囲を実態より広げると、「肩慣らしのはずの問題で引っかかる」体験になる。
    // 4・5問目は A3 で触っていない
    expect(TUTORIAL_MAX_ORDER).toBe(3);
  });

  it("U-925 上限以下のステージ番号だけが肩慣らし", () => {
    expect(isTutorialOrder(1)).toBe(true);
    expect(isTutorialOrder(TUTORIAL_MAX_ORDER)).toBe(true);
    expect(isTutorialOrder(TUTORIAL_MAX_ORDER + 1)).toBe(false);
    expect(isTutorialOrder(100)).toBe(false);
    // 動作確認用の行（order=999）に印が出ない
    expect(isTutorialOrder(999)).toBe(false);
  });

  it("U-926 0・負数・小数・null は肩慣らしにしない", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, null, undefined]) {
      expect(isTutorialOrder(bad as number), `${bad} に印が出ている`).toBe(false);
    }
  });

  /**
   * 範囲の判定を**画面に書かない**（`lib/progress/preview.ts` と同じ理由）。
   *
   * `order <= 3` を画面へ直接書くと、定数を直しても画面だけ古い範囲の印を出し続ける。
   * しかも**出しすぎた側には何の症状も出ない**ので、見て気づくことができない。
   */
  it("U-927 ステージ選択の画面が範囲を自前で計算していない", () => {
    const page = readFileSync(
      join(process.cwd(), "app/stages/page.tsx"),
      "utf8",
    );
    expect(page, "肩慣らしの判定を lib/stages/tutorial.ts に通していない").toContain(
      "isTutorialOrder",
    );
    expect(
      /(?:order|stage)\s*(?:<=|<|===)\s*\d/.test(page),
      "画面が肩慣らしの範囲を直接書いている",
    ).toBe(false);
  });
});
