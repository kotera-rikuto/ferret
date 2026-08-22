/**
 * 検索エンジンに渡す申告（app/robots.ts・app/sitemap.ts・lib/seo/site.ts）の検査。
 * ケース定義は tests/unit/テストケース.md の §18。
 *
 * ここは**壊れても画面が何も変わらない領域**で、症状の出方が3つとも遅い。
 *   - 守っているURLを sitemap に載せる → 自分でURLの一覧を配ることになる
 *   - `Disallow: /` を返す        → 数週間かけて索引から静かに消える
 *   - canonical を1か所にまとめる  → 規約とポリシーがトップの複製として扱われる
 * どれも本番で気づくまでに時間がかかるので、機械で止められるものはここで止める。
 */

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  CRAWL_DISALLOW,
  SITEMAP_PATHS,
  publicPageMetadata,
  unlistedPageMetadata,
} from "@/lib/seo/site";

const ORIGIN = "https://ferret.example";

/** 基点あり／なしを切り替えて確かめる。設定は Production にしか無い（C5） */
function withOrigin<T>(origin: string | null, run: () => T): T {
  if (origin === null) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = origin;
  return run();
}

const saved = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = saved;
});

/**
 * `proxy.ts` の matcher を**文字列として**読み出す。
 *
 * import しない理由: `proxy.ts` は Supabase のクライアントを組み立てるので、
 * 読み込むだけで実行時の依存が要る。ここで見たいのは「何が列挙されているか」
 * だけなので、ソースを読む。
 *
 * `config.matcher` は Next.js の制約で**リテラルの配列でなければならない**
 * （計算した値を渡せない）。だから `CRAWL_DISALLOW` から組み立てて共有する形にはできず、
 * 二重管理になるのは避けられない。**その二重管理を成立させているのがこの検査。**
 */
function protectedPrefixes(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL("../../proxy.ts", import.meta.url)),
    "utf8",
  );
  const matcher = src.slice(src.indexOf("matcher: ["));
  const paths = [...matcher.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
  // "/stages/:path*" → "/stages"
  return paths.map((p) => "/" + p.split("/")[1]);
}

describe("§18 sitemap に載せるURL", () => {
  it("U-830 認証が要るページを1つも載せない", () => {
    const prefixes = protectedPrefixes();
    expect(prefixes.length).toBeGreaterThan(0); // 読み取り自体が失敗していないこと

    const urls = withOrigin(ORIGIN, () => sitemap().map((entry) => entry.url));
    for (const url of urls) {
      const path = new URL(url).pathname;
      for (const prefix of prefixes) {
        expect(
          path === prefix || path.startsWith(`${prefix}/`),
          `${path} は proxy.ts が守っている ${prefix} 配下`,
        ).toBe(false);
      }
    }
  });

  it("U-831 ログイン画面と新規登録画面は載せない（2026-08-22 オーナー判断）", () => {
    const paths = SITEMAP_PATHS.map((entry) => entry.path);
    expect(paths).not.toContain("/login");
    expect(paths).not.toContain("/register");
  });

  it("U-832 URL は絶対URLで、すべて同じ基点から始まる", () => {
    const urls = withOrigin(ORIGIN, () => sitemap().map((entry) => entry.url));
    expect(urls.length).toBe(SITEMAP_PATHS.length);
    for (const url of urls) expect(url.startsWith(`${ORIGIN}`)).toBe(true);
    // トップは基点そのもの。`https://.../` とスラッシュを重ねない
    expect(urls).toContain(ORIGIN);
  });

  it("U-833 基点が未設定なら空で返す（プレビューが本番の一覧を配らない）", () => {
    expect(withOrigin(null, () => sitemap())).toEqual([]);
  });

  it("U-834 設定が壊れていても本番URLを名乗らない", () => {
    expect(withOrigin("壊れた値", () => sitemap())).toEqual([]);
  });
});

describe("§18 robots.txt", () => {
  it("U-835 全面禁止（Disallow: /）を返さない ── 基点が未設定でも", () => {
    for (const origin of [ORIGIN, null]) {
      const rules = withOrigin(origin, () => robots().rules);
      expect(Array.isArray(rules)).toBe(false);
      const rule = rules as { allow?: unknown; disallow?: unknown };
      expect(rule.allow).toBe("/");
      expect(rule.disallow).not.toBe("/");
      expect(rule.disallow).not.toContain("/");
    }
  });

  it("U-836 proxy.ts が守っている画面がすべて Disallow に載っている", () => {
    const disallow = withOrigin(ORIGIN, () => robots().rules) as {
      disallow: string[];
    };
    for (const prefix of protectedPrefixes()) {
      expect(disallow.disallow, `proxy.ts の ${prefix} が robots に無い`).toContain(
        prefix,
      );
    }
  });

  it("U-837 Sitemap 行は基点があるときだけ出す", () => {
    expect(withOrigin(ORIGIN, () => robots().sitemap)).toBe(`${ORIGIN}/sitemap.xml`);
    expect(withOrigin(null, () => robots().sitemap)).toBeUndefined();
  });
});

describe("§18 canonical（このURLが正、の宣言）", () => {
  it("U-838 ページごとに違うURLを宣言する", () => {
    const canonical = (path: string) =>
      withOrigin(ORIGIN, () => publicPageMetadata({ path }).alternates?.canonical);

    expect(canonical("/")).toBe(ORIGIN);
    expect(canonical("/terms")).toBe(`${ORIGIN}/terms`);
    expect(canonical("/privacy")).toBe(`${ORIGIN}/privacy`);
  });

  it("U-839 基点が未設定なら宣言しない（相対パスはビルドが落ちる）", () => {
    const meta = withOrigin(null, () => publicPageMetadata({ path: "/terms" }));
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph && "url" in meta.openGraph).toBe(false);
  });

  it("U-840 og には共通項目（サイト名・言語）が必ず残る", () => {
    const meta = withOrigin(ORIGIN, () =>
      publicPageMetadata({ path: "/terms", title: "利用規約" }),
    );
    expect(meta.openGraph).toMatchObject({
      siteName: "Ferret",
      locale: "ja_JP",
      type: "website",
      url: `${ORIGIN}/terms`,
    });
  });

  it("U-841 画面側の title に「| Ferret」を重ねない", () => {
    // <title> は layout.tsx の template が「〜 | Ferret」にする。
    // ページ側が同じものを持っていると「利用規約 | Ferret | Ferret」になる
    const meta = publicPageMetadata({ path: "/terms", title: "利用規約" });
    expect(meta.title).toBe("利用規約");
    // og:title には template が効かないので、こちらは組み立て済みで持つ
    expect(meta.openGraph?.title).toBe("利用規約 | Ferret");
  });

  it("U-842 CRAWL_DISALLOW と SITEMAP_PATHS が食い違わない", () => {
    // 一覧に載せながら巡回を禁じる、という自己矛盾を止める。
    // どちらも `as const` なので TypeScript の側でも重ならないと分かっているが、
    // **どちらかを普通の string[] に緩めた瞬間に型の保証は消える**ので実行時にも見る
    const listed: string[] = SITEMAP_PATHS.map((entry) => entry.path);
    const blockedPrefixes: string[] = [...CRAWL_DISALLOW];

    for (const path of listed) {
      for (const blocked of blockedPrefixes) {
        expect(
          path === blocked || path.startsWith(`${blocked}/`),
          `${path} は sitemap に載せながら robots で塞いでいる`,
        ).toBe(false);
      }
    }
  });
});

describe("§18 検索結果に出さないページ", () => {
  it("U-843 ログインと新規登録は index: false・follow: true", () => {
    const meta = unlistedPageMetadata({ title: "新規登録", description: "x" });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("U-844 その2枚は robots.txt では塞がない（読ませないと index:false が届かない）", () => {
    const blocked: string[] = [...CRAWL_DISALLOW];
    expect(blocked).not.toContain("/login");
    expect(blocked).not.toContain("/register");
  });
});
