import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPreviewProblems } from "@/lib/progress/preview";

/**
 * ログイン前に読める問題を、**公開ページの一覧に混ぜられる形**にして返す（C13）。
 *
 * `lib/seo/site.ts` の `SITEMAP_PATHS` は定数の配列だが、こちらは定数にできない ──
 * 公開するかどうかは `problems.order` で決めているのに、URL に出るのは `id` で、
 * その対応は DB にしか無い（実データではステージ1の id は 8）。
 * **固定値で書くと、問題を入れ直した日に存在しないURLを配り始める。**
 *
 * これで C8 が「事業判断」として保留していた
 * 「検索に出るページが5枚しかない」が動く。
 *
 * ⚠️ **読めなかったときは空で返す。** sitemap と `/llms.txt` はビルド時に組み立てるので、
 * ここで投げると**ビルドごと落ちる。** 1行足りない配信のほうが、配信できないより軽い。
 */
export type PublicPage = {
  /** `/` から始まるパス */
  path: string;
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  /** `/llms.txt` の一覧に出す見出し */
  label: string;
  /** 同じ一覧の1行説明。**ページに実際に書いてあることだけ** */
  summary: string;
};

export async function previewPages(): Promise<PublicPage[]> {
  try {
    const problems = await listPreviewProblems(createAdminClient());

    return problems.map((p) => ({
      path: `/problems/${p.id}`,
      // トップ（1）と更新情報（0.5）の間。入口ではないが、
      // 規約やポリシーより先に見てほしいページではある
      priority: 0.6,
      // 問題の中身は入れ替えない前提なので、更新頻度は低く申告する
      changeFrequency: "monthly" as const,
      label: `ステージ${p.order}: ${p.title ?? `Stage ${p.order}`}`,
      summary:
        "登録しなくても読めるコードリーディングの問題。コードと設問が出る（採点を受けるにはログインが必要）",
    }));
  } catch {
    return [];
  }
}
