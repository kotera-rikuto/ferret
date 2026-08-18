/**
 * 越えてはいけない境界の静的検査。
 * ケース定義は tests/integration/テストケース.md の §11。
 *
 * ソースを文字列として読んで確かめる、ちょっと変わったテスト。
 * ケース数は少ないが、壊れたときの被害が大きいものだけを置く。
 *   - service_role キーがブラウザに渡る
 *   - 模範解答がクライアントコンポーネントに渡る
 *   - 新しく作った保護画面を proxy の matcher に足し忘れる
 * どれも「動くので気づけない」種類の事故で、実行時テストでは拾いにくい。
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "@/proxy";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_DIRS = ["app", "components", "lib"];

type SourceFile = { path: string; text: string; code: string };

/**
 * コメントを落とす。
 *
 * 「クライアントに model_answer を渡さない」といった注意書きを
 * 違反として拾ってしまうため。見たいのは実際の参照だけ。
 * `//` は `https://` を巻き込まないよう、直前がコロンでないときだけ落とす。
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function collectFrom(...dirs: string[]): SourceFile[] {
  const files: SourceFile[] = [];
  for (const dir of dirs) {
    const base = join(ROOT, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.tsx?$/.test(entry.name)) continue;
      const full = join(entry.parentPath ?? base, entry.name);
      const text = readFileSync(full, "utf8");
      files.push({
        path: relative(ROOT, full).split(sep).join("/"),
        text,
        code: stripComments(text),
      });
    }
  }
  return files;
}

const SOURCES = collectFrom(...SOURCE_DIRS);
const CLIENT_FILES = SOURCES.filter((f) => /^\s*["']use client["']/.test(f.text));

describe("§11 静的検査", () => {
  it("収集できている（前提の確認）", () => {
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(CLIENT_FILES.length).toBeGreaterThan(0);
  });

  it("I-390 クライアントコンポーネントが service_role クライアントを読み込まない", () => {
    for (const f of CLIENT_FILES) {
      expect(f.code, `${f.path} が admin クライアントを読み込んでいる`).not.toContain(
        "lib/supabase/admin",
      );
    }
  });

  it("I-391 クライアントコンポーネントが模範解答・ルーブリックに触れない", () => {
    for (const f of CLIENT_FILES) {
      for (const secret of ["model_answer", "rubric_items", "core_reject"]) {
        expect(f.code, `${f.path} が ${secret} を参照している`).not.toContain(secret);
      }
    }
  });

  it("I-392 サーバー専用のキーがクライアント側に現れない", () => {
    const serverOnly = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
    ];
    for (const f of CLIENT_FILES) {
      for (const key of serverOnly) {
        expect(f.code, `${f.path} が ${key} を参照している`).not.toContain(key);
      }
    }
  });

  it("I-392b サーバー専用のキーに NEXT_PUBLIC_ を付けていない", () => {
    for (const f of SOURCES) {
      for (const key of ["SERVICE_ROLE_KEY", "OPENAI_API_KEY", "STRIPE_SECRET_KEY"]) {
        expect(
          f.code,
          `${f.path} で ${key} に NEXT_PUBLIC_ が付いている（バンドルに埋まる）`,
        ).not.toContain(`NEXT_PUBLIC_${key}`);
      }
    }
  });

  it.todo("I-393 next build の出力に service_role キーが含まれない（ビルドが要るので別枠）");

  /**
   * クリア閾値は lib/ai/compose.ts の CLEAR_THRESHOLD だけが持つ。
   * v2 → v3 で 65 → 55 に変えたとき、画面側のハードコードが残って
   * 「API はクリア、画面は不合格」というズレが起きた経緯がある。
   */
  it("I-394 しきい値を画面側にハードコードしていない", () => {
    const uiFiles = SOURCES.filter(
      (f) => f.path.startsWith("app/") || f.path.startsWith("components/"),
    );
    for (const f of uiFiles) {
      for (const pattern of [/>=\s*55\b/, />=\s*65\b/, />\s*54\b/, />\s*64\b/]) {
        expect(f.code, `${f.path} にしきい値の直書きがある`).not.toMatch(pattern);
      }
    }
  });

  /**
   * 保護画面を新しく作ったとき、proxy の matcher に足し忘れると
   * ページ側のガードだけが残る。動くので気づけないが、
   * DB へのクエリが走ってから弾かれることになる。
   */
  it("I-395 ログインを要求するページがすべて matcher に含まれている", () => {
    const guarded = SOURCES.filter(
      (f) => f.path.endsWith("/page.tsx") && f.code.includes('redirect("/login")'),
    );
    expect(guarded.length).toBeGreaterThan(0);

    for (const f of guarded) {
      // app/stages/page.tsx → stages / app/problems/[id]/page.tsx → problems
      const segment = f.path.split("/")[1];
      const covered = config.matcher.some((m) => m.startsWith(`/${segment}`));
      expect(covered, `${f.path} が proxy の matcher に無い`).toBe(true);
    }
  });

  it("I-396 .env 系がリポジトリに含まれない設定になっている", () => {
    const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.env\*?/m);
  });

  /**
   * 法務文書への導線が、ログインの前に置かれた画面から消えていない。
   *
   * 規約に同意して登録する人が同意の前に読める場所は、
   * ログインを要求しない画面（タイトル・ログイン・新規登録）だけ。
   * デザインを直すときに**フッターは真っ先に消される部品**なので、
   * 消えても画面は正常に見えてしまう。ここで固定する。
   */
  it("I-399 ログイン前の画面から法務文書へ辿れる", () => {
    const entrances = ["app/page.tsx", "app/login/page.tsx", "app/register/page.tsx"];

    for (const path of entrances) {
      const f = SOURCES.find((s) => s.path === path);
      expect(f, `${path} が見つからない`).toBeDefined();
      // タイトル・ログインは LegalFooter、新規登録は同意の一文が導線
      const reachable =
        f!.code.includes("LegalFooter") ||
        (f!.code.includes("/terms") && f!.code.includes("/privacy"));
      expect(reachable, `${path} から法務文書へ辿れない`).toBe(true);
    }
  });

  /**
   * PostgREST の予約語と同名のカラムを、引用符なしで絞り込みに使わない。
   *
   * `order` はクエリ文字列の予約語（並び替え指定）なので、
   * `.gte("order", 9000)` は `order=gte.9000` になり
   * 「gte.9000 という順序指定」と解釈されてエラーを返す。
   *
   * **エラーを確認しないと、何も起きずに素通りして見える。**
   * 実際これでテストの後片付けが効かず、本番テーブルに行が8件残った。
   * `.order("order")`（並び替え）は正しい使い方なので対象外。
   */
  it("I-398 予約語のカラムを引用符なしで絞り込んでいない", () => {
    const reserved = ["order", "select", "limit", "offset", "columns", "on_conflict"];
    const filters = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"];

    const targets = [...SOURCES, ...collectFrom("tests")];
    for (const f of targets) {
      for (const column of reserved) {
        for (const op of filters) {
          const pattern = new RegExp(`\\.${op}\\(\\s*["'\`]${column}["'\`]`);
          expect(
            f.code,
            `${f.path} が .${op}("${column}", …) を使っている。'"${column}"' のように引用符でくくること`,
          ).not.toMatch(pattern);
        }
      }
    }
  });

  /**
   * ソース自体に不可視文字を残さない。
   *
   * `app/api/score/route.ts` が「ここを生の文字ではなくコード表記で書いているのは、
   * ソースコード自体に不可視文字を残さないため（レビューで気づけなくなる）」と
   * わざわざ書いている方針。テストコードにも同じことが言える
   * ——実際、この検査を入れる前にテスト側へ生の NUL を書いてしまい、
   * grep がファイルをバイナリ扱いして検索から消えるという形で表面化した。
   *
   * 検査対象にテストも含める。`\u200B` のようなエスケープ表記は文字ではないので通る。
   */
  it("I-397 ソースに生の不可視文字が入っていない", () => {
    const targets = [...SOURCES, ...collectFrom("tests")];

    // 制御文字（タブ・改行・復帰を除く）/ 幅ゼロ・双方向制御 / BOM
    const invisible = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/;
    for (const f of targets) {
      const m = invisible.exec(f.text);
      const at = m ? f.text.slice(0, m.index).split("\n").length : 0;
      expect(
        m,
        `${f.path}:${at} に生の不可視文字（U+${m?.[0].codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}）がある。\\uXXXX 表記に直すこと`,
      ).toBeNull();
    }
  });
});
