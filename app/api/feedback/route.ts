import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasJsonContentType, isCrossSiteRequest } from "@/lib/http/origin";
import {
  COMMENT_MAX_CHARS,
  COMMENT_MIN_CHARS,
  FEEDBACK_KINDS,
  type FeedbackKind,
} from "@/lib/feedback";
import { NextRequest, NextResponse } from "next/server";

/**
 * 採点への異議申し立て・問題の誤り報告の受け口。
 *
 * 保存するだけの単純な API だが、守り（CSRF・Content-Type・本文サイズ・認証）は
 * /api/score と同じ構えにしてある。「書き込みが起きる POST」の入口を
 * エンドポイントごとに緩くすると、緩いほうが攻撃の入口になるため。
 */

/** kind と数値ID程度しか入らないので 4KB で十分 */
const MAX_BODY_BYTES = 4 * 1024;

/**
 * 制御文字と不可視文字を落とす（/api/score の sanitize と同じ狙いの軽量版）。
 * 不可視文字をコード表記で書いているのは、ソースコード自体に不可視文字を
 * 残さないため（レビューで気づけなくなる）
 */
function cleanComment(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")
    .trim();
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { error: "このリクエストは受け付けられません。" },
      { status: 403 },
    );
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json(
      { error: "リクエストが不正です。" },
      { status: 415 },
    );
  }

  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "送信されたデータが大きすぎます。" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "送信されたデータが大きすぎます。" },
        { status: 413 },
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const problemId = Number(body.problem_id);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const kind = body.kind;
  if (typeof kind !== "string" || !FEEDBACK_KINDS.includes(kind as FeedbackKind)) {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  if (typeof body.comment !== "string") {
    return NextResponse.json({ error: "理由を書いてください。" }, { status: 400 });
  }
  const comment = cleanComment(body.comment);
  if (comment.length < COMMENT_MIN_CHARS) {
    return NextResponse.json(
      { error: `理由を ${COMMENT_MIN_CHARS} 文字以上で書いてください。` },
      { status: 400 },
    );
  }
  if (comment.length > COMMENT_MAX_CHARS) {
    return NextResponse.json(
      { error: `理由は ${COMMENT_MAX_CHARS} 文字までです。` },
      { status: 400 },
    );
  }

  // attempt_id は本人の行だと確認できたときだけ紐付ける。
  // session クライアント経由なので RLS で自分の行しか引けず、
  // 他人の attempt_id を送りつけても null に落ちる。
  // 確認に失敗しても報告自体は受け取る（紐付けは補助情報でしかない）
  let attemptId: string | null = null;
  if (typeof body.attempt_id === "string" && UUID_PATTERN.test(body.attempt_id)) {
    const { data: attempt } = await supabase
      .from("user_attempts")
      .select("id")
      .eq("id", body.attempt_id)
      .maybeSingle();
    attemptId = attempt?.id ?? null;
  }

  // unique (user_id, problem_id, kind) に当たる再送は「書き直し」として上書きする。
  // 無視（ignoreDuplicates）にすると、前回より詳しく書き直した理由が黙って捨てられる
  const admin = createAdminClient();
  const { error } = await admin.from("problem_feedback").upsert(
    {
      user_id: user.id,
      problem_id: problemId,
      attempt_id: attemptId,
      kind,
      comment,
    },
    { onConflict: "user_id,problem_id,kind" },
  );

  if (error) {
    return NextResponse.json(
      { error: "送信できませんでした。時間をおいてもう一度お試しください。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
