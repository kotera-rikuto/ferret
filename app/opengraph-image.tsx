import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  OG_IMAGE_ALT,
  OG_IMAGE_HEADLINE,
  OG_IMAGE_TAGLINE,
  SITE_NAME,
} from "@/lib/seo/site";

/**
 * SNS・Slack にリンクを貼ったときに出る絵（1200×630）。
 *
 * **このファイルを置いてあるだけで、全ページの og:image になる。**
 * `app/` の直下にあるものは下の階層へ受け継がれるので、`/terms` でも `/changelog` でも
 * 同じ絵が出る ── **`openGraph` を書いていないページに限る。**
 * `publicPageMetadata` を通しているページ（`/terms` など）は `openGraph` を丸ごと
 * 差し替えるので、足してもらった og:image も一緒に消える（C11 で実測）。
 * そのため `lib/seo/site.ts` の `OPEN_GRAPH_BASE` から**このルートのURLを名指し**してある。
 *
 * **文字は絵の中に焼き込まれる。** 貼られた先に残り、SNS 側にキャッシュもされるので、
 * 文言は `lib/seo/site.ts` の `OG_IMAGE_*`（LP の見出しと同じ言葉）を使う。
 *
 * ⚠️ **問題の中身（コード・模範解答）をここに出さないこと。** 答えが検索結果と
 * タイムラインに載ることになる（C11 の注意書き）。
 *
 * 生成はビルド時に1回だけ（リクエストごとの値を読んでいないので静的に焼かれる）。
 * 実行時に走らないので、下の `readFile` はビルドの間だけ動く。
 */
export const alt = OG_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * 絵とフォントはモジュールの読み込み時に1回だけ読む（Next.js のドキュメント
 * opengraph-image.md「Using Node.js runtime with local assets」の書き方）。
 *
 * マスコットは**元の素材をそのまま**読む。縮小した複製を置くと、
 * 絵を差し替えたときに片方だけ古いままになる。
 * `character_nobg.png`（neutral）を使うのは、happy / thinking には透かしが
 * 焼き込まれていて、色の付いた面に載せると出るため（design/README.md）。
 *
 * フォントは切り出した実体（`design/og/subset-font.py` が作る）。
 * `next/font/google` は CSS の仕組みなので、**画像を描くときには効かない。**
 */
const mascot = await readFile(join(process.cwd(), "public/character_nobg.png"), "base64");
const mascotSrc = `data:image/png;base64,${mascot}`;
const rounded = await readFile(
  join(process.cwd(), "assets/fonts/MPLUSRounded1c-Bold.subset.ttf"),
);

// 配色は app/globals.css の明るいテーマのトークンと同じ値。
// **カードに暗いテーマは無い**（貼られた先の設定は分からないので、1つに決める）
const BG = "#fdf8ec"; // --color-bg
const INK = "#4a3b28"; // --color-ink
const MUTED = "#8a7960"; // --color-muted より少し濃い。小さい字なので読みを優先する
const BRAND = "#f59e0b"; // --color-brand
const BRAND_DEEP = "#c47000"; // --color-brand-deep
const BRAND_TINT = "#fdeac0"; // --color-brand-tint

export default function Image() {
  return new ImageResponse(
    (
      // 端は切られる。**大事なものを外周から 60px 以内に置かない**
      // （切り取られる範囲はサービスごとに違う）
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BG,
          fontFamily: "Rounded Mplus 1c",
          color: INK,
        }}
      >
        {/* マスコットの後ろに敷く丸。**絵の輪郭が薄いクリーム色**なので、
            下地が無いと右半分が白い空きに見える */}
        <div
          style={{
            position: "absolute",
            top: 78,
            right: 52,
            width: 442,
            height: 442,
            borderRadius: 442,
            background: BRAND_TINT,
          }}
        />

        {/* 文字。左半分に収める（右にマスコットが入る） */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 68px",
            width: 740,
          }}
        >
          <div
            style={{
              fontSize: 28,
              letterSpacing: 7,
              color: BRAND_DEEP,
            }}
          >
            {SITE_NAME}
          </div>
          {/* 見出しは節ごとに1行。1本の文字列にすると語の途中で折れる。
              **字の大きさは「いちばん長い節が1行に収まるか」で決まっている** ──
              全角11文字（約11em）なので、この列の内寸 604px では 52px が上限。
              上げると「読め / る、」の位置で折れる（実際に 62px で折れた） */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
            {OG_IMAGE_HEADLINE.map((line) => (
              <div key={line} style={{ fontSize: 52, lineHeight: 1.34 }}>
                {line}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 23, color: MUTED, marginTop: 24 }}>
            {OG_IMAGE_TAGLINE}
          </div>
        </div>

        {/* マスコット。丸の中に収める */}
        <img src={mascotSrc} width={404} height={404} style={{ marginTop: 96 }} alt="" />

        {/* 下端の帯。**飾りだけ**（切られても意味は失われない） */}
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: 14,
            background: BRAND,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Rounded Mplus 1c", data: rounded, style: "normal", weight: 700 }],
    },
  );
}
