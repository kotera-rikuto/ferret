import type { Metadata, MetadataRoute } from "next";
import { configuredAppOrigin } from "@/lib/http/origin";

/**
 * 検索エンジンと SNS に渡す「このサイトは何か」の一次情報。
 *
 * ここを唯一の出どころにしてあるのは、同じ文言が
 * `app/layout.tsx`（<head> のメタ情報）・`app/sitemap.ts`・`app/robots.ts`・
 * 各ページの canonical の4か所に散るため。散らすと、直したつもりの1か所だけが
 * 新しくなり、**検索結果には古い文言が出続ける**（画面を見ても気づけない）。
 *
 * 文言は `app/page.tsx` の本文から取っている。タイトル画面には
 * 「他人のコードが読める、AI時代のエンジニアに。」「コードリーディング特化
 * プログラミング学習サイト。」と書いてあるのに、メタ情報側では `title: "Ferret"` の
 * 1語しか名乗っていなかった ── 検索エンジンから見ると、このサイトが
 * 何のサイトなのかを示す材料が1つも無い状態だった（C8）。
 */

/** サイト名。`title.template` の接尾辞と og:site_name に使う */
export const SITE_NAME = "Ferret";

/**
 * トップページのタイトル（検索結果の見出しになる1行）。
 *
 * 「フェレット」を併記してあるのは、カタカナで検索されたときの手掛かりにするため。
 * 動物と同名で先客（ferret-plus.com）が強いので**この1行で勝てるわけではない**が、
 * 名乗っていなければ候補にすら入らない。
 *
 * 全角30文字を超える分は検索結果の表示で切られるが、切られるのは見た目だけで、
 * 語そのものは検索エンジンに渡る。
 */
export const SITE_TITLE = "Ferret（フェレット）| コードリーディング特化のプログラミング学習サイト";

/** 検索結果の説明文と og:description。1文目はコアコピー（CLAUDE.md） */
export const SITE_DESCRIPTION =
  "他人のコードが読める、AI時代のエンジニアに。コードを読んで日本語で説明し、AI がフィードバックを返す、コードリーディング特化のプログラミング学習サイトです。";

/**
 * `sitemap.xml` に載せるページ ── **ログインが要らないページだけ。**
 *
 * ⚠️ **認証が要るページを足さないこと。** sitemap は「このURLを見に来てください」と
 * 自分から配る一覧なので、守っているURLを載せるのは構造の外部公開にあたる。
 * 機械的な歯止めは tests/unit/seo.test.ts の U-830（`proxy.ts` の matcher と突き合わせる）。
 *
 * `/login` と `/register` を**入れていないのはオーナー判断**（2026-08-22・C8）。
 * 検索から来た人の入口はトップ（`/`）に寄せる ── そこには説明と「はじめる」があり、
 * 登録フォームだけが単独で検索結果に出ても、何のサービスか分からないまま終わる。
 */
export const SITEMAP_PATHS = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
] as const satisfies ReadonlyArray<{
  path: string;
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
}>;

/**
 * クローラーに巡回させないパス。
 *
 * 1行目〜5行目は `proxy.ts` の `matcher` と同じ範囲（＝ログインが要る画面）。
 * どうせログイン画面へ飛ばされるが、**列挙しないと巡回の予算をそこで使われる**うえ、
 * 「ログイン画面へのリダイレクト」自体が索引に載ることがある。
 *
 * 残りはページですらないもの。`/api` は JSON、`/logout` は POST 限定、
 * `/auth/callback` は確認メールのリンクの着地点で、いずれも人が読む画面ではない。
 *
 * ⚠️ **`proxy.ts` の matcher に画面を足したら、ここにも足すこと。**
 * 忘れると tests/unit/seo.test.ts の U-831 が落ちる（そのための検査）。
 *
 * 書き方は前方一致。`/stages` と書けば `/stages/3` も含む。
 */
export const CRAWL_DISALLOW = [
  "/stages",
  "/problems",
  "/result",
  "/review",
  "/settings",
  "/api",
  "/logout",
  "/auth",
] as const;

/**
 * 公開URLの基点（`https://ferretcode.com`）。**分からなければ `null`。**
 *
 * `NEXT_PUBLIC_APP_URL` は **Vercel の Production にしか入れていない**（C5 の判断）。
 * つまりプレビュー配信とローカルでは常に `null` になる。ここで本番URLを
 * 固定値で書いてしまうと、**プレビューのページが本番URLを名乗り**、
 * 「どちらが正か」の宣言（canonical）が本番を指したまま複数の場所に存在することになる。
 *
 * 返り値が `null` のときの各所のふるまいは、それぞれの呼び出し側に書いてある。
 */
export function siteOrigin(): string | null {
  return configuredAppOrigin();
}

/**
 * og:（SNS に貼られたときのカード）の共通部分。
 *
 * **ページ側で `openGraph` を書くときは必ずこれを展開すること。**
 * Next.js は `openGraph` を階層ごとに混ぜず**まるごと上書き**するので、
 * 展開を忘れるとそのページだけ og:site_name も og:locale も消える
 * （`node_modules/next/dist/docs` の generate-metadata.md「Overwriting fields」）。
 *
 * 画像（og:image）は入れていない。**無くても検索には載る**ので、
 * 見た目を決める M2（LPページ）に回した ── オーナー判断（2026-08-22・C8）。
 */
export const OPEN_GRAPH_BASE = {
  type: "website",
  siteName: SITE_NAME,
  locale: "ja_JP",
} as const satisfies NonNullable<Metadata["openGraph"]>;

/**
 * ログイン不要のページ1枚ぶんのメタ情報。
 *
 * **canonical をここで組み立てているのが要点。**
 * `app/layout.tsx` に置くと、Next.js の合成規則によって
 * **`alternates` を書いていない全ページがその値を受け継ぐ** ──
 * つまり `/terms` も `/privacy` も「正しいURLはトップページ」と申告することになり、
 * 検索エンジンから見ると2枚ともトップの複製になる（索引から外れうる）。
 * canonical はページごとに違う値でなければ意味がないので、入口をこの関数に1本化した。
 *
 * canonical を出す価値は「同じ中身が複数のURLで見える」のを止めること。
 * 本番は `ferretcode.com` だけでなく Vercel が配る `*.vercel.app` でも同じ画面が開くので、
 * 宣言が無いと2つが別ページとして扱われ、評価が割れる。
 *
 * 基点が分からないとき（プレビュー・ローカル）は canonical も og:url も**出さない**。
 * 相対パス（`"/terms"` など）を書く手もあるが、
 * **`metadataBase` が無い状態の相対パスは Next.js 16 ではビルドが失敗する**ので、
 * 「本番だけ絶対URL・それ以外は無宣言」に寄せてある。
 */
export function publicPageMetadata({
  path,
  title,
  description = SITE_DESCRIPTION,
}: {
  /** `/` から始まるパス。`SITEMAP_PATHS` と同じ値を渡す */
  path: string;
  /** 省略するとトップ扱い（`layout.tsx` の `title.default` を使う） */
  title?: string;
  description?: string;
}): Metadata {
  const origin = siteOrigin();
  // 末尾のスラッシュを重ねない。`/` は基点そのもの
  const url = origin ? (path === "/" ? origin : `${origin}${path}`) : null;

  // og:title には `title.template` が効かない（あれは <title> だけの仕組み）。
  // 貼られたときに何のサイトか分かるよう、ここで同じ形に組み立てておく
  const ogTitle = title ? `${title} | ${SITE_NAME}` : SITE_TITLE;

  return {
    ...(title ? { title } : {}),
    description,
    openGraph: {
      ...OPEN_GRAPH_BASE,
      title: ogTitle,
      description,
      ...(url ? { url } : {}),
    },
    ...(url ? { alternates: { canonical: url } } : {}),
  };
}

/**
 * 検索結果に**出さない**ページのメタ情報（ログイン・新規登録）。
 *
 * `sitemap.xml` に載せないだけでは足りない。sitemap は「見に来てほしい一覧」であって
 * 「これ以外を見るな」ではなく、**トップページから両方にリンクが張ってある**ので、
 * 検索エンジンはリンクを辿って普通に見つける。
 *
 * `robots.txt` で塞ぐのも違う ── 塞ぐと中身を読めなくなるだけで、
 * 外からリンクされていれば**説明文の無い URL だけの結果**として出ることがある。
 * 「読ませたうえで、載せないでくれと伝える」のが正しい形なので、
 * `CRAWL_DISALLOW` には入れず、ここで `index: false` を宣言する。
 *
 * `follow: true` は「このページのリンクは辿ってよい」。切ると、
 * ログイン画面から張ってある利用規約とプライバシーポリシーへの経路が細くなる。
 *
 * 入口をトップ（`/`）に寄せるのはオーナー判断（2026-08-22・C8）。
 * 登録フォームが単独で検索結果に出ても、何のサービスか分からないまま終わる。
 */
export function unlistedPageMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  return {
    // 「| Ferret」は layout.tsx の title.template が付ける
    title,
    description,
    robots: { index: false, follow: true },
  };
}
