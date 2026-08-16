import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasJsonContentType, isCrossSiteRequest } from "@/lib/http/origin";
import { loadProgress } from "@/lib/progress/unlock";
import {
  scoreAnswer,
  ScoringUnavailableError,
  GRADER_VERSION,
  type ScoringInput,
} from "@/lib/ai/scorer";
import {
  CLEAR_THRESHOLD,
  PERFECT_THRESHOLD,
  ANSWER_MIN_CHARS,
  ANSWER_MAX_CHARS,
} from "@/lib/ai/compose";
import { answerHash } from "@/lib/ai/hash";
import { NextRequest, NextResponse } from "next/server";

/**
 * 本文の上限。
 *
 * 回答は600字までなので、JSON の入れ物込みでも 16KB を超えることはない。
 * 上限が無いと、4MB の JSON を投げつけるだけで「600字を超えています」と
 * 弾かれる**前に**全部メモリへ展開させられる。検証は body を読んだ後にしかできないので、
 * 読む前に Content-Length で足切りしておく。
 */
const MAX_BODY_BYTES = 16 * 1024;

async function readJsonBody(
  request: NextRequest,
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const tooLarge = {
    ok: false as const,
    status: 413,
    error: "送信されたデータが大きすぎます。",
  };

  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) return tooLarge;

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "リクエストが不正です。" };
  }

  // Content-Length を付けずに小分けで送る手口があるので、読み終えた後にも確かめる。
  // ここまで来る本文のサイズはホスティング側の上限（Vercel は 4.5MB）で頭打ちになる
  if (text.length > MAX_BODY_BYTES) return tooLarge;

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "リクエストが不正です。" };
  }
}

/**
 * 送信前に落とす。長さ超過は原価と待ち時間の上限をここで確定させる意味もある
 * （制限が無いと、長文を投げるだけで採点1回あたりの原価が何十倍にもなる）。
 */
function sanitize(raw: unknown):
  | { ok: true; value: string }
  | { ok: false; code: string; message: string } {
  if (typeof raw !== "string") {
    return { ok: false, code: "invalid_answer", message: "回答を入力してください。" };
  }
  const s = raw
    .normalize("NFKC")
    // 制御文字
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // 幅ゼロ文字・双方向制御文字。画面には何も表示されないのに
    // AI への指示を紛れ込ませられるため落とす。
    // ここを生の文字ではなくコード表記で書いているのは、
    // ソースコード自体に不可視文字を残さないため（レビューで気づけなくなる）
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")
    // 区切り記号の偽装
    .replace(/<{2,}|>{2,}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (s.length < ANSWER_MIN_CHARS) {
    return {
      ok: false,
      code: "answer_too_short",
      message: `もう少し詳しく書いてみてください（${ANSWER_MIN_CHARS}字以上）。`,
    };
  }
  if (s.length > ANSWER_MAX_CHARS) {
    return {
      ok: false,
      code: "answer_too_long",
      message: `${ANSWER_MAX_CHARS}字以内にまとめてみてください。`,
    };
  }
  return { ok: true, value: s };
}

// 仕様書 §9.5 の法務要件。外部AIに送る前に落とす
const PII_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.]{2,}/, // メール
  /\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/, // 電話
  /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}\b/, // APIキー
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, // AWS
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, // GitHub
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/**
 * クレジットカード番号らしき並び。
 *
 * 正規表現だけで判定すると、コードに出てくる長い数字（タイムスタンプ、ID など）を
 * 誤って弾いてしまう。カード番号は必ず Luhn という検算式を通るので、
 * 桁の並びを見つけたうえで検算し、通ったものだけを拒否する。
 * これで「本物のカード番号」以外を巻き込む確率がほぼ無くなる。
 */
function looksLikeCardNumber(s: string): boolean {
  for (const m of s.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
    const digits = m[0].replace(/[^\d]/g, "");
    if (digits.length < 13 || digits.length > 19) continue;

    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

function containsPii(s: string): boolean {
  return PII_PATTERNS.some((re) => re.test(s)) || looksLikeCardNumber(s);
}

// ---------------------------------------------------------------------------
// 使いすぎの安全網
// ---------------------------------------------------------------------------

/**
 * 1回の採点は OpenAI に実費が出る（実測 約¥0.04）。
 * ここが無いと、ログインさえすれば1アカウントで採点を無限に回せる。
 * 攻撃者の狙いは情報を盗むことではなく、**こちらの請求書を膨らませること**と
 * **API の枠を使い切らせて全ユーザーの採点を止めること**になる。
 *
 * これは「普通に使う分には絶対に当たらない」高さの安全網であって、
 * 商品としての上限（Free 1日3問 / Pro 月200問…）ではない。
 * そちらは課金開始時に別途入れる（このファイル末尾の TODO）。
 */
const RATE_LIMITS = [
  { windowMs: 60_000, max: 10 },
  { windowMs: 60 * 60_000, max: 60 },
  { windowMs: 24 * 60 * 60_000, max: 300 },
] as const;

/** 直近24時間分だけ見れば足りる。300件の上限より多めに取っておく */
const RATE_WINDOW_MS = 24 * 60 * 60_000;
const RATE_FETCH_LIMIT = 500;

/**
 * 同じユーザーの採点を同時に1件までに絞る錠前。
 *
 * 下の件数チェックは「保存済みの行」を数えるので、同時に大量のリクエストが来ると
 * 全部が保存前の数を見て通り抜けてしまう（1回分のバーストだけは抜けられる）。
 * このメモリ上の錠前があれば、少なくとも同じサーバーに届いた並列リクエストは止まる。
 * サーバーが複数に分かれると効かないので、あくまで件数チェックの補助。
 */
const inFlight = new Set<string>();

type RateVerdict =
  | { ok: true }
  | { ok: false; retryAfterSec: number }
  | { ok: "unavailable" };

async function checkRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<RateVerdict> {
  const now = Date.now();

  // 件数を数えるのはユーザー本人のクライアントではなく service_role で行う。
  // RLS の設定ミスで0件が返ると上限が効かなくなり、
  // 「守りが静かに無効化される」という一番まずい壊れ方をするため
  const { data, error } = await admin
    .from("user_attempts")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", new Date(now - RATE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(RATE_FETCH_LIMIT);

  // 数えられなかったときは通さない。
  // どのみち採点結果の保存も同じ DB に書くので、通しても最後に失敗する
  if (error) {
    console.error("利用状況の確認に失敗:", error);
    return { ok: "unavailable" };
  }

  const times = (data ?? []).map((r) => new Date(r.created_at).getTime());

  for (const limit of RATE_LIMITS) {
    const from = now - limit.windowMs;
    const inWindow = times.filter((t) => t >= from);
    if (inWindow.length >= limit.max) {
      // 一番古い1件が窓から外れれば1枠空く
      const oldest = Math.min(...inWindow);
      const waitMs = Math.max(1_000, oldest + limit.windowMs - now);
      return { ok: false, retryAfterSec: Math.ceil(waitMs / 1000) };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 別サイトに置かれたページから、ログイン中のユーザーの Cookie を使って
  // 勝手に採点を走らせられるのを防ぐ
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // JSON API には JSON だけを受け付ける。
  // これが無いと HTML フォームからでも本文を組み立てて送れてしまう
  if (!hasJsonContentType(request)) {
    return NextResponse.json(
      { error: "リクエストが不正です。" },
      { status: 415 },
    );
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { problem_id, answer: rawAnswer } = (parsed.value ?? {}) as {
    problem_id?: unknown;
    answer?: unknown;
  };

  const problemId = Number(problem_id);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return NextResponse.json({ error: "問題が指定されていません。" }, { status: 400 });
  }

  const clean = sanitize(rawAnswer);
  if (!clean.ok) {
    return NextResponse.json({ error: clean.message, code: clean.code }, { status: 400 });
  }
  const answer = clean.value;

  if (containsPii(answer)) {
    return NextResponse.json(
      {
        error:
          "メールアドレスや認証キーらしき文字列が含まれています。取り除いてから送信してください。",
        code: "pii_detected",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // ログイン確認。ここだけユーザーのセッション（anon キー）で行う。
  // 以降のDB操作は admin（service_role）なので RLS が効かない。
  // このチェックを外すと誰でも他人のスコアを書き込めるAPIになる
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 並列で叩かれたときに、ここから先を1人1件に絞る
  if (inFlight.has(user.id)) {
    return NextResponse.json(
      {
        error: "前の採点がまだ進行中です。結果が出るまでお待ちください。",
        code: "already_scoring",
      },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }
  inFlight.add(user.id);
  try {
    return await handleScoring(supabase, user.id, problemId, answer);
  } finally {
    // 例外で抜けても必ず外す。外し忘れるとそのユーザーが二度と採点できなくなる
    inFlight.delete(user.id);
  }
}

async function handleScoring(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  problemId: number,
  answer: string,
) {
  const admin = createAdminClient();

  const rate = await checkRateLimit(admin, userId);
  if (rate.ok === "unavailable") {
    return NextResponse.json(
      {
        error: "採点が混み合っています。入力はそのままなので、もう一度お試しください。",
        code: "scoring_unavailable",
      },
      { status: 503 },
    );
  }
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: "採点のリクエストが続いています。少し時間をおいてからお試しください。",
        code: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  // ステージの解放状態を確認する。
  // 画面のマップで鍵がかかっていても、このAPIを直接叩けば任意の問題を採点できてしまう。
  // 「鍵は見た目だけ」の状態は、無料プランと有料プランを分ける時点で
  // そのまま課金の回避経路になる。判定は画面と同じ関数を使う
  const progress = await loadProgress(admin, supabase, userId);
  if (!progress.problems.some((p) => p.id === problemId)) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }
  if (!progress.unlockedIds.has(problemId)) {
    return NextResponse.json(
      {
        error: "この問題はまだ開いていません。ステージを順に進めてください。",
        code: "problem_locked",
      },
      { status: 403 },
    );
  }

  // 必要な列だけ取る。`select("*")` だと使わない列まで毎回引くことになる
  const { data: problem } = await admin
    .from("problems")
    .select("id, code, question, model_answer, reading_type, rubric_items, keywords")
    .eq("id", problemId)
    .single();

  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const hash = answerHash(problem.id, GRADER_VERSION, answer);

  // 同一回答リプレイ。
  // temperature:0 は決定性を保証しないため、同じ回答を出し直したときに
  // 点数が変わりうる。過去の結果をそのまま返すことでそれを防ぐ。API も呼ばないので原価ゼロ。
  const { data: prev } = await admin
    .from("user_attempts")
    .select("total_score, keyword_score, deep_score, ai_feedback, axes, contradiction")
    .eq("user_id", userId)
    .eq("problem_id", problem.id)
    .eq("answer_hash", hash)
    .eq("is_provisional", false)
    .limit(1)
    .maybeSingle();

  let row: Record<string, unknown>;
  let payload: Record<string, unknown>;

  if (prev) {
    row = {
      user_id: userId,
      problem_id: problem.id,
      answer,
      keyword_score: prev.keyword_score,
      deep_score: prev.deep_score,
      total_score: prev.total_score,
      ai_feedback: prev.ai_feedback,
      scoring_method: "ai",
      axes: prev.axes,
      grader_version: GRADER_VERSION,
      answer_hash: hash,
      is_provisional: false,
      contradiction: prev.contradiction,
      usage: { replayed: true },
    };
    payload = {
      score: prev.total_score,
      keyword_score: prev.keyword_score,
      deep_score: prev.deep_score,
      feedback: prev.ai_feedback,
      axes: prev.axes,
      cleared: (prev.total_score ?? 0) >= CLEAR_THRESHOLD,
      perfect: (prev.total_score ?? 0) >= PERFECT_THRESHOLD,
      replayed: true,
    };
  } else {
    let result;
    try {
      result = await scoreAnswer(answer, problem as unknown as ScoringInput);
    } catch (e) {
      // 「採点が動かなかった」を0点として保存しない。
      // 行を作らないので履歴も汚れず、無料枠も消費しない
      if (e instanceof ScoringUnavailableError) {
        console.error("採点不成立", {
          code: e.code,
          problem_id: problem.id,
          grader_version: GRADER_VERSION,
          message: e.message,
        });
        return NextResponse.json(
          {
            error: "採点が混み合っています。入力はそのままなので、もう一度お試しください。",
            code: "scoring_unavailable",
          },
          { status: 503 },
        );
      }
      throw e;
    }

    row = {
      user_id: userId,
      problem_id: problem.id,
      answer,
      keyword_score: result.keywordScore,
      deep_score: result.deepScore,
      total_score: result.total,
      ai_feedback: result.ai_feedback,
      scoring_method: result.scoring_method,
      axes: {
        axes: result.axes,
        keyword_hits: result.keywordHits,
        evidence_capped: result.evidenceCapped,
      },
      grader_version: result.grader_version,
      answer_hash: result.answer_hash,
      is_provisional: false,
      contradiction: result.contradiction,
      usage: result.usage,
    };
    payload = {
      score: result.total,
      keyword_score: result.keywordScore,
      deep_score: result.deepScore,
      feedback: result.ai_feedback,
      axes: result.axes,
      cleared: result.cleared,
      perfect: result.perfect,
      replayed: false,
    };
  }

  // 結果をDBに保存。
  // ユーザー自身に書かせるとスコアを偽装できるため admin で書く
  const { error: insertError } = await admin.from("user_attempts").insert(row);

  // 保存に失敗したらスコアを返さない。
  // 返してしまうと採点は成功したように見えるのに履歴が残らず、
  // 症状がリザルト画面やステージ画面に出て原因の切り分けが困難になる
  if (insertError) {
    console.error("採点結果の保存に失敗:", insertError);
    return NextResponse.json(
      { error: "採点結果の保存に失敗しました" },
      { status: 500 },
    );
  }

  return NextResponse.json(payload);
}

// TODO(課金開始前に必須): プラン別のAI採点上限。
//   Free 1日3問 / Pro 月200問 / Pro Plus 月500問。
//   超過時は層2をスキップし、is_provisional = true・scoring_method = 'keyword_only'
//   で保存する（層1は最大20点でクリア閾値55に届かないため、不合格ではなく判定保留にする）。
//   カウントのクエリは ideas/db仕様.md の「レート制限のクエリ」を参照。
//   上の RATE_LIMITS は使いすぎを止める安全網であって、商品としての上限ではない。
