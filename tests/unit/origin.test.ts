/**
 * lib/http/origin.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §7。
 *
 * isCrossSiteRequest は app/logout/route.ts で使用中。
 * hasJsonContentType は未使用（/api/score に未適用。結合テスト I-411）。
 */

import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { isCrossSiteRequest, hasJsonContentType } from "@/lib/http/origin";

/** headers だけを持つ最小のリクエスト。両関数とも headers.get しか使わない */
function req(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("§7 isCrossSiteRequest", () => {
  it("U-330 sec-fetch-site: same-origin は通す", () => {
    expect(isCrossSiteRequest(req({ "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("U-331 sec-fetch-site: none（アドレス直打ち等）は通す", () => {
    expect(isCrossSiteRequest(req({ "sec-fetch-site": "none" }))).toBe(false);
  });

  it("U-332 sec-fetch-site: same-site（別サブドメイン）は弾く", () => {
    expect(isCrossSiteRequest(req({ "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("U-333 sec-fetch-site: cross-site は弾く", () => {
    expect(isCrossSiteRequest(req({ "sec-fetch-site": "cross-site" }))).toBe(true);
  });

  it("U-334 ヘッダが1つも無いリクエスト（curl 等）は通す", () => {
    expect(isCrossSiteRequest(req({}))).toBe(false);
  });

  it("U-335 origin と host が一致すれば通す", () => {
    expect(
      isCrossSiteRequest(req({ origin: "https://ferret.io", host: "ferret.io" })),
    ).toBe(false);
  });

  it("U-336 origin が別ホストなら弾く", () => {
    expect(
      isCrossSiteRequest(req({ origin: "https://evil.example", host: "ferret.io" })),
    ).toBe(true);
  });

  it("U-337 ポートが違えば別扱いで弾く", () => {
    expect(
      isCrossSiteRequest(req({ origin: "https://ferret.io:3000", host: "ferret.io" })),
    ).toBe(true);
  });

  it("U-338 壊れた origin は弾く", () => {
    expect(isCrossSiteRequest(req({ origin: "not a url", host: "ferret.io" }))).toBe(
      true,
    );
  });

  it("U-339 sec-fetch-site があれば origin より優先される", () => {
    const r = req({
      "sec-fetch-site": "same-origin",
      origin: "https://evil.example",
      host: "ferret.io",
    });
    expect(isCrossSiteRequest(r)).toBe(false);
  });
});

describe("§7 hasJsonContentType", () => {
  it("U-350 application/json を通す", () => {
    expect(hasJsonContentType(req({ "content-type": "application/json" }))).toBe(true);
  });

  it("U-351 charset 付きでも通す", () => {
    expect(
      hasJsonContentType(req({ "content-type": "application/json; charset=utf-8" })),
    ).toBe(true);
  });

  it("U-352 大文字・前後の空白を吸収する", () => {
    expect(hasJsonContentType(req({ "content-type": " Application/JSON " }))).toBe(true);
  });

  it("U-353 text/plain を弾く（form enctype=text/plain 対策）", () => {
    expect(hasJsonContentType(req({ "content-type": "text/plain" }))).toBe(false);
  });

  it("U-354 フォーム送信の Content-Type を弾く", () => {
    expect(
      hasJsonContentType(req({ "content-type": "application/x-www-form-urlencoded" })),
    ).toBe(false);
  });

  it("U-355 multipart/form-data を弾く", () => {
    expect(
      hasJsonContentType(req({ "content-type": "multipart/form-data; boundary=x" })),
    ).toBe(false);
  });

  it("U-356 Content-Type が無ければ弾く", () => {
    expect(hasJsonContentType(req({}))).toBe(false);
  });

  it("U-357 前方一致ではなく完全一致で判定する", () => {
    expect(
      hasJsonContentType(req({ "content-type": "application/json-patch+json" })),
    ).toBe(false);
  });
});
