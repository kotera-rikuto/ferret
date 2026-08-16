/**
 * lib/auth/redirect.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §6。
 *
 * 接続先: app/login/page.tsx がログイン後の遷移で safeNextPath を通す。
 * ここを素通しにすると `//evil.example` がプロトコル相対URLとして解釈され、
 * 外部サイトへ飛ばせる。接続されていること自体は結合テスト I-410 /
 * E2E E-413 で検出する。
 */

import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("§6 safeNextPath", () => {
  it("U-300 自サイト内のパスはそのまま通す", () => {
    expect(safeNextPath("/stages")).toBe("/stages");
  });

  it("U-301 クエリ付きのパスも通す", () => {
    expect(safeNextPath("/problems/5?retry=1")).toBe("/problems/5?retry=1");
  });

  it("U-302 ルートパスを通す", () => {
    expect(safeNextPath("/")).toBe("/");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["空文字", ""],
  ])("U-303 %s は既定の戻り先になる", (_label, input) => {
    expect(safeNextPath(input)).toBe("/stages");
  });

  it("U-304 プロトコル相対URL（//evil.example）を弾く", () => {
    expect(safeNextPath("//evil.example")).toBe("/stages");
    expect(safeNextPath("//evil.example/path")).toBe("/stages");
  });

  it("U-305 バックスラッシュ版（/\\evil.example）を弾く", () => {
    expect(safeNextPath("/\\evil.example")).toBe("/stages");
  });

  it("U-306 絶対URLを弾く", () => {
    expect(safeNextPath("https://evil.example")).toBe("/stages");
    expect(safeNextPath("http://evil.example")).toBe("/stages");
  });

  it("U-307 javascript: スキームを弾く", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/stages");
  });

  it("U-308 改行を含むパスを弾く（ヘッダ偽装対策）", () => {
    expect(safeNextPath("/stages\nSet-Cookie: a=b")).toBe("/stages");
  });

  it.each([
    ["復帰改行", "/stages\r\n"],
    ["タブ", "/stages\t"],
    ["NUL", "/stages\x00"],
  ])("U-309 制御文字（%s）を含むパスを弾く", (_label, input) => {
    expect(safeNextPath(input)).toBe("/stages");
  });

  it("U-310 513文字のパスを弾く", () => {
    expect(safeNextPath("/" + "a".repeat(512))).toBe("/stages");
  });

  it("U-311 512文字ちょうどのパスは通す（境界）", () => {
    const path = "/" + "a".repeat(511);
    expect(path.length).toBe(512);
    expect(safeNextPath(path)).toBe(path);
  });

  it("U-312 既定の戻り先を差し替えられる", () => {
    expect(safeNextPath("//evil.example", "/")).toBe("/");
  });
});
