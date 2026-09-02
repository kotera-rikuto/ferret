import type { Metadata, MetadataRoute } from "next";
import { configuredAppOrigin } from "@/lib/http/origin";
import { ANSWER_MIN_CHARS, CLEAR_THRESHOLD } from "@/lib/ai/compose";
import { CHAPTERS } from "@/lib/stages/chapters";
import { READING_TYPES } from "@/lib/stages/reading-types";

/**
 * 検索エンジンと SNS に渡す「このサイトは何か」の一次情報。
 *
 * ここを唯一の出どころにしてあるのは、同じ文言が
 * `app/layout.tsx`（<head> のメタ情報）・`app/sitemap.ts`・`app/robots.ts`・
 * 各ページの canonical の4か所に散るため。散らすと、直したつもりの1か所だけが
 * 新しくなり、**検索結果には古い文言が出続ける**（画面を見ても気づけない）。
 *
 * **機械向けの2つ（C12・2026-09-02）も同じ出どころから組み立てる** ──
 * JSON-LD（`lib/seo/structured-data.ts`）と `/llms.txt`（`app/llms.txt/route.ts`）。
 * こちらは読み手が AI なので、食い違いの症状がさらに遠い
 * （**AI が矛盾した説明のどちらかを事実として答える**が、こちらからは見えない）。
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
 * カタカナ表記。「フェレット」で検索されたときの手掛かりで、`SITE_TITLE` にも入っている。
 * JSON-LD の `alternateName` に渡す（機械には「同じものの別名」だと明示しないと伝わらない）。
 */
export const SITE_ALTERNATE_NAME = "フェレット";

/**
 * 技術記事を出している場所（Zenn）。**JSON-LD の `sameAs` と `/llms.txt` に載せる。**
 *
 * C12 の中でここだけが「外」に効く。AI が答えるときに参照するのは
 * **他人が書いたもの**で、自分のサイトに何を書いても
 * 「本人がそう言っている」以上の重みは持たない（票 C12 の期待値の節）。
 * このリンクは、サイトと記事を**同じ主体のものとして結び付ける**ためだけにある。
 *
 * ⚠️ **記事ごとのURLを列挙しないこと（意図）。** 1本増えるたびに直す形にすると、
 * 追記を忘れた分だけ古い一覧を配り続けることになる。プロフィールのURLは記事が増えても正しい。
 */
export const ARTICLES_URL = "https://zenn.dev/ferretcode";

/**
 * いま全機能を無料で使えるか。**機械向けの申告の出どころ**
 * （JSON-LD の `isAccessibleForFree` / `offers` と `/llms.txt` の1行）。
 *
 * ⚠️ **課金を始める日（`tasks/D2`）にここを `false` にすること。**
 * JSON-LD に書いた値は AI がそのまま事実として答えるので、放置すると
 * **有料化した後も「無料で使える」と言われ続ける。** しかも自分の画面は正しい価格を
 * 出しているので、**サイトを見ても気づけない**（気づくのは AI に聞いた人だけ）。
 * LP の FAQ「お金はかかりますか？」（`app/page.tsx`）も対で直す。
 */
export const SITE_IS_FREE = true;

/**
 * 機械（AI・クローラー）に渡す事実の箇条書き。
 * **`/llms.txt` の本文と JSON-LD の `featureList` は、どちらもここから来る。**
 *
 * 分けて書かない理由は SITE_DESCRIPTION と同じ ── 2か所に書くと、
 * **AI が矛盾した説明を拾う**（票 C12 の手順4）。しかも食い違っても画面は何も変わらない。
 *
 * ⚠️ **実装済みのことだけ書くこと。** 段位・認定証・共有機能・振り返り画面はまだ無い。
 * ⚠️ **実績・利用者数・満足度を書かないこと。** AI は書いてあることをそのまま事実として
 * 答えるので、盛った数字はそのまま広まって取り消せない（票 C12 の注意）。
 *
 * **数字は定数から導く**（章の定義と採点の閾値）。ここに焼くと、
 * 章が増えた日にサイトの説明だけが古い数字を名乗る。
 */
export const SITE_FACTS: readonly string[] = [
  `全${CHAPTERS[CHAPTERS.length - 1].to}問・${CHAPTERS.length}章。コードは10行前後で、扱うのは JavaScript と TypeScript（フレームワークは扱わない）`,
  "コードを書く課題は無い。読む側だけに絞っている",
  `回答は日本語の自由記述（${ANSWER_MIN_CHARS}文字から）。選択肢は無く、自分の言葉で説明する`,
  "採点は AI（OpenAI）が自動で行い、点数と「よかったところ」「つぎの一歩」を返す",
  `100点満点で${CLEAR_THRESHOLD}点以上がクリア`,
  "AI が挙げたコードの引用は、サーバー側で実物と突き合わせてから点にする（合わなければ数えない）",
  "同じ回答なら同じ点数が返る（採点済みの回答を取り置いてある）",
  "採点に納得できないときは、リザルト画面から異議を送れる",
  ...(SITE_IS_FREE
    ? ["いまは全機能を無料で使える。クレジットカードの登録は要らない"]
    : []),
  "問題を解くにはログインが必要。ログインが要る画面はクローラーに公開していない",
];

/**
 * 読み方6種の1行説明。`/llms.txt` と JSON-LD の `teaches` に渡す。
 * 語そのものは `lib/stages/reading-types.ts`（DB の CHECK 制約が正）。
 */
export const READING_TYPE_LINES: readonly string[] = READING_TYPES.map(
  (t) => `${t.name} ── ${t.body}`,
);

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
  {
    path: "/",
    priority: 1,
    changeFrequency: "weekly",
    label: "トップ",
    summary: "何のサービスか・実際の画面と同じ部品で組んだデモ・よくある質問",
  },
  // 更新情報（E12）。**ログイン不要のページ**なので載せてよい。
  // ここが更新されていること自体が「動いているサービス」の材料になる（M1 と相性がある）
  {
    path: "/changelog",
    priority: 0.5,
    changeFrequency: "monthly",
    label: "更新情報",
    summary: "直したところと足した機能の記録",
  },
  {
    path: "/terms",
    priority: 0.3,
    changeFrequency: "yearly",
    label: "利用規約",
    summary: "禁止事項・免責・準拠法",
  },
  {
    path: "/privacy",
    priority: 0.3,
    changeFrequency: "yearly",
    label: "プライバシーポリシー",
    summary: "採点のため回答と問題文を OpenAI に送ることを含む、取り扱いの説明",
  },
] as const satisfies ReadonlyArray<{
  path: string;
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  /** `/llms.txt` の一覧に出す見出し。`sitemap.xml` は使わない */
  label: string;
  /** 同じ一覧の1行説明。**ページに実際に書いてあることだけ** */
  summary: string;
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
 * 共有カード（`app/opengraph-image.tsx`）に描く文字。**ここが唯一の出どころ。**
 *
 * 画像の中の文字は、あとから検索も差し替えもできない ── 貼られた先に残り、
 * SNS 側にキャッシュされる。だから LP（`app/page.tsx`）の見出しと同じ言葉にしてある。
 * 違う言葉を出すと、クリックした人が**別のサービスに来たように感じる**（C11 の注意書き）。
 *
 * ⚠️ **文字を足したら `python3 design/og/subset-font.py` を回し直すこと。**
 * カードのフォントは「このファイルに出てくる字」だけを切り出した実体で、
 * 入っていない字は豆腐（□）で描かれる。忘れると tests/unit/og-image.test.ts の U-845 が落ちる。
 */
export const OG_IMAGE_ALT = `${SITE_NAME}（フェレット）── 他人のコードが読める、AI時代のエンジニアに。`;

/**
 * カードの見出し。**節ごとに配列にしてある** ── 日本語はどこでも改行できるので、
 * 1本の文字列で渡すと画像の幅しだいで「読め / る、」のように語の途中で折れる
 * （LP の見出しで同じ手当てをしている）。
 */
export const OG_IMAGE_HEADLINE = [
  "他人のコードが読める、",
  "AI時代のエンジニアに。",
] as const;

/** 見出しの下の1行。何のサイトかを名乗る */
export const OG_IMAGE_TAGLINE = "コードリーディング特化のプログラミング学習サイト";

/**
 * og:（SNS に貼られたときのカード）の共通部分。
 *
 * **ページ側で `openGraph` を書くときは必ずこれを展開すること。**
 * Next.js は `openGraph` を階層ごとに混ぜず**まるごと上書き**するので、
 * 展開を忘れるとそのページだけ og:site_name も og:locale も消える
 * （`node_modules/next/dist/docs` の generate-metadata.md「Overwriting fields」）。
 *
 * **画像（og:image）をここに持たせているのは、まさにその上書きのため。**
 * 絵の実体は `app/opengraph-image.tsx` で、あのファイルを置くだけで Next.js が
 * og:image を足してくれる ── **ただし `openGraph` を書いていないページに限る。**
 * 実測（C11・2026-08-26）: 何も書いていない `/login` と `/register` には付き、
 * `publicPageMetadata` を通している `/terms` `/privacy` `/changelog` には**付かなかった。**
 * 下の階層で `openGraph` を丸ごと差し替えた時点で、足してもらった画像も一緒に消える。
 * だからここに URL を書き、全ページが必ず展開する形にしてある。
 *
 * `/opengraph-image` は `app/opengraph-image.tsx` が配られる場所。相対パスなので、
 * 本番では `metadataBase`（`app/layout.tsx`）が絶対URLに直す。基点が無いとき
 * （ローカル・プレビュー）はビルドが `http://localhost:3000` を仮に当てて警告を出す
 * ── **貼られるのは本番のURLだけ**なので、そのままにしてある。
 */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: OG_IMAGE_ALT,
} as const;

export const OPEN_GRAPH_BASE = {
  type: "website",
  siteName: SITE_NAME,
  locale: "ja_JP",
  images: [OG_IMAGE],
} as const satisfies NonNullable<Metadata["openGraph"]>;

/**
 * X（Twitter）のカードの共通部分。
 *
 * **`card: "summary_large_image"` が要点。** 既定は `summary` で、
 * せっかく 1200×630 の絵を出しても**左端の小さな四角に縮められる。**
 * 文言は og: と同じものを入れる ── X は twitter: があればそちらを優先するので、
 * 片方だけ直すと「タイムラインの見出し」と「他のSNSの見出し」が食い違う。
 *
 * 画像も og: と同じものを書く。`twitter` を書いたページでは
 * og: と同様に**足してもらった `twitter:image` が消える**（OPEN_GRAPH_BASE の実測を参照）。
 */
export const TWITTER_BASE = {
  card: "summary_large_image",
  images: [OG_IMAGE],
} as const satisfies NonNullable<Metadata["twitter"]>;


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
    // twitter: も openGraph: と同じく**まるごと上書き**される。
    // 書かなければ layout.tsx のもの（トップの文言）を受け継ぐので、
    // 規約のページを X に貼ると「見出しだけトップのまま」になる
    twitter: { ...TWITTER_BASE, title: ogTitle, description },
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
