import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLEAR_THRESHOLD, PERFECT_THRESHOLD } from "@/lib/ai/compose";
import { SHARE_CARD, SITE_HOST, SITE_NAME } from "@/lib/seo/site";

/**
 * クリアした回の結果を1枚の絵にして返す（G1・共有機能）。
 *
 * **公開URLではない。** ログイン必須で、**自分の回答の行しか読まない。**
 * G1 の最大の論点は「共有は本人以外にも読ませることなので、
 * いまの『本人だけが読める・誰も書けない』設計に穴を開ける」だった。
 * **絵を渡すだけにしたので、その穴が要らなくなっている** ──
 * 公開しているデータが1件も無いため、共有の取り消しという概念も発生しない。
 *
 * ⚠️ **ここを「URLを知っていれば誰でも見られる」に変えると、その前提が消える。**
 * そうするなら推測できないURL・取り消し・公開範囲の3点が同時に必要になる
 * （`tasks/G1-共有機能.md` の §なぜこの形なら安全か）。
 *
 * ⚠️ **コード・模範解答・回答文を絵に入れないこと。**
 * 答えが他人のタイムラインに載り、SNS 側にキャッシュもされる
 * （`app/opengraph-image.tsx` と同じ注意書き）。
 */

// フォントとマスコットをディスクから読む。Edge では動かない
export const runtime = "nodejs";

/**
 * **問題名を描くので、切り出したフォントでは足りない。**
 *
 * `MPLUSRounded1c-Bold.subset.ttf`（186KB）は `lib/seo/site.ts` に出てくる字だけを
 * 収めたもので、**問題タイトルはDBにあるから対象外。** 実測（2026-09-11）で
 * **106件中85件が豆腐（□）になる**ことを確認している（不足126字）。
 *
 * 足りない字だけ足す案は採らなかった ── **問題を1問足すたびに壊れる**うえ、
 * satori はフォントに無い字をエラーにせず豆腐で描くので、
 * **SNS に流れてから気づく**ことになる。丸ごと持てば二度と壊れない。
 *
 * 3.4MB あるが**ブラウザには1バイトも配られない**（サーバーが絵を描くときに読むだけ）。
 * LP のカード（`app/opengraph-image.tsx`）は文言がコードにあって U-845 で検査できるので、
 * あちらは切り出したものを使い続ける。
 *
 * ⚠️ `next.config.ts` の `outputFileTracingIncludes` にこの2つを挙げてある。
 * **`process.cwd()` 越しの読み込みは Next.js の追跡が効かない**ので、
 * 外すと本番だけ 500 になる（手元では動く）。
 */
const fontPromise = readFile(
  join(process.cwd(), "assets/fonts/MPLUSRounded1c-Bold.ttf"),
);
const mascotPromise = readFile(
  join(process.cwd(), "public/character_nobg.png"),
).then((b) => `data:image/png;base64,${b.toString("base64")}`);

// 配色は app/opengraph-image.tsx と同じ（globals.css の明るいテーマのトークン）。
// **暗いテーマは作らない** ── 貼られた先の設定が分からないので1つに決める
const BG = "#fdf8ec";
const INK = "#4a3b28";
const MUTED = "#8a7960";
const BRAND = "#f59e0b";
const BRAND_DEEP = "#c47000";
const BRAND_TINT = "#fdeac0";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 見つからない・見せてよい回ではない、をすべて 404 にまとめる。
 *
 * 「行はあるがクリアしていない」と「行が無い」を区別して返すと、
 * **他人の attemptId を総当たりして『その回答は存在する』を引き出せる。**
 * UUID なので現実的な総当たりではないが、区別して返す理由も無い。
 */
function notFound() {
  return NextResponse.json({ error: "見つかりませんでした。" }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  if (!UUID_PATTERN.test(attemptId)) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  // **session クライアントで読む。admin を使わないこと。**
  // RLS が「自分の行だけ」に絞ってくれる。admin にすると、RLS が壊れたときに
  // 「他人の点数の絵が出る」側へ倒れる。session なら「自分の行が読めない＝絵が出ない」側に倒れる
  // （app/result/[id]/page.tsx の XP 取得と同じ理由）。
  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("problem_id, total_score")
    .eq("id", attemptId)
    // 判定保留（上限時に層1だけで採点した回）は合否が出ていないので共有させない
    .eq("is_provisional", false)
    .maybeSingle();

  if (!attempt) return notFound();
  // クリアした回だけ（オーナー判断・2026-09-11）。
  // しきい値は lib/ai/compose.ts から読む。**画面にもここにも数字を書かない**
  if (attempt.total_score < CLEAR_THRESHOLD) return notFound();

  // 問題名は admin ＋ カラム明示で読む。`problems` は RLS ポリシーが0件なので
  // session では読めない。**`model_answer` を select に入れないこと**（CLAUDE.md）
  const admin = createAdminClient();
  const { data: problem } = await admin
    .from("problems")
    .select("title")
    .eq("id", attempt.problem_id)
    .maybeSingle();

  if (!problem) return notFound();

  const [font, mascotSrc] = await Promise.all([fontPromise, mascotPromise]);
  const perfect = attempt.total_score >= PERFECT_THRESHOLD;

  return new ImageResponse(
    (
      // 端は切られる。**大事なものを外周60px以内に置かない**
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
        {/* マスコットの後ろの丸。絵の輪郭が薄いクリーム色なので、下地が無いと空きに見える */}
        <div
          style={{
            position: "absolute",
            display: "flex",
            top: 96,
            right: 56,
            width: 400,
            height: 400,
            borderRadius: 400,
            background: BRAND_TINT,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 68px",
            width: 760,
          }}
        >
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 7, color: BRAND_DEEP }}>
            {SITE_NAME}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", marginTop: 22 }}>
            <div style={{ display: "flex", fontSize: 64, color: BRAND_DEEP }}>
              {perfect ? SHARE_CARD.headlinePerfect : SHARE_CARD.headline}
            </div>
          </div>

          {/* 点数。**絵の主役はここ** */}
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 10 }}>
            <div style={{ display: "flex", fontSize: 104, lineHeight: 1.1 }}>
              {attempt.total_score}
            </div>
            <div style={{ display: "flex", fontSize: 34, marginLeft: 6 }}>点</div>
            <div style={{ display: "flex", fontSize: 24, color: MUTED, marginLeft: 14 }}>
              / 100
            </div>
          </div>

          {/* 問題名。**ここが丸ごとのフォントを要求している箇所。**
              2行に収まらない長さは satori が省略しないので、こちらで切る */}
          <div
            style={{
              fontSize: 25,
              lineHeight: 1.5,
              color: MUTED,
              marginTop: 24,
              // satori は display:flex 以外を既定にしないので明示する
              display: "flex",
            }}
          >
            {truncate(problem.title, SHARE_CARD.titleMaxChars)}
          </div>
        </div>

        {/* satori（絵を描く側）の <img> であって、ブラウザの要素ではない。
            next/image はブラウザ向けの部品なのでここでは使えない */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mascotSrc} width={380} height={380} style={{ marginTop: 116 }} alt="" />

        {/* **画像だけが流れたときに辿り着ける手掛かりはここだけ。**
            リンクの無い絵にしないために焼き込んでいる（G1 の目的は宣伝） */}
        <div
          style={{
            position: "absolute",
            display: "flex",
            left: 68,
            bottom: 52,
            fontSize: 22,
            color: BRAND_DEEP,
          }}
        >
          {SITE_HOST}
        </div>

        {/* 下端の帯。飾りだけ（切られても意味は失われない） */}
        <div
          style={{
            position: "absolute",
            display: "flex",
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
      width: 1200,
      height: 630,
      fonts: [
        { name: "Rounded Mplus 1c", data: font, style: "normal", weight: 700 },
      ],
      headers: {
        // 個人の点数なので、途中のキャッシュ（CDN・社内プロキシ）に残さない
        "Cache-Control": "private, no-store",
      },
    },
  );
}

/** 長すぎる問題名を切る。satori は溢れても省略記号を付けないので自前で行う */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
