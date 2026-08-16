import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    // 幅ゼロ・双方向制御。見えない文字で指示を埋め込む手口を潰す
    .replace(/[​-‏‪-‮⁠﻿]/g, "")
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

function containsPii(s: string): boolean {
  return PII_PATTERNS.some((re) => re.test(s));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }
  const { problem_id, answer: rawAnswer } = (body ?? {}) as {
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

  const admin = createAdminClient();

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
    .eq("user_id", user.id)
    .eq("problem_id", problem.id)
    .eq("answer_hash", hash)
    .eq("is_provisional", false)
    .limit(1)
    .maybeSingle();

  let row: Record<string, unknown>;
  let payload: Record<string, unknown>;

  if (prev) {
    row = {
      user_id: user.id,
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
      user_id: user.id,
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
