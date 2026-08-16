/**
 * 越えてはいけない境界の静的検査。
 * ケース定義は tests/integration/テストケース.md の §11。
 *
 * ソースを文字列として読んで確かめる、ちょっと変わったテスト。
 * ケース数は少ないが、壊れたときの被害が大きいものだけを置く。
 *   - service_role キーがブラウザに渡る
 *   - 模範解答がクライアントコンポーネントに渡る
 *   - 新しく作った保護画面を middleware の matcher に足し忘れる
 * どれも「動くので気づけない」種類の事故で、実行時テストでは拾いにくい。
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "@/middleware";

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

function collectSources(): SourceFile[] {
  const files: SourceFile[] = [];
  for (const dir of SOURCE_DIRS) {
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

const SOURCES = collectSources();
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
   * 保護画面を新しく作ったとき、middleware の matcher に足し忘れると
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
      expect(covered, `${f.path} が middleware の matcher に無い`).toBe(true);
    }
  });

  it("I-396 .env 系がリポジトリに含まれない設定になっている", () => {
    const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.env\*?/m);
  });
});
