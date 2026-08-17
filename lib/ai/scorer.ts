import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import {
  composeScore,
  type ComposedScore,
  type DeepScoreOutput,
  type KeywordSlot,
  type MatchedReject,
} from "./compose";
import { answerHash } from "./hash";
import { DEEP_SCORE_SCHEMA, PROMPT_VERSION, parseDeepScore } from "./schema";
import {
  STATIC_PROMPT,
  problemBlock,
  wrapAnswer,
  type ProblemForScoring,
} from "./prompt";

export type { ProblemForScoring } from "./prompt";
export type { KeywordSlot } from "./compose";

// 遅延初期化。トップレベルで new すると OPENAI_API_KEY 未設定時に
// `next build` のページデータ収集で落ちるため、初回採点時まで生成を遅らせる
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY が設定されていません");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

/**
 * モデルはスナップショットで固定する。
 * "gpt-4o-mini" のような別名にすると、OpenAI 側の差し替えで採点基準が無告知に変わる。
 */
const MODEL = "gpt-4o-mini-2024-07-18";

/** どのモデル・どの基準で採点したかの記録。リプレイのキャッシュキーにも入る */
export const GRADER_VERSION = `${MODEL}/${PROMPT_VERSION}`;

const MAX_COMPLETION_TOKENS = 400;
const TIMEOUT_MS = 12_000;

/**
 * 採点が成立しなかったことを表す。**0点ではない。**
 *
 * v2 は API が想定外の応答を返すと静かに0点にしていた（`JSON.parse(content ?? "{}")`
 * → `score: undefined` → 最近傍の 0 に丸め）。ユーザーからは理由不明の0点に見え、
 * しかも履歴に残るため原因の切り分けもできなかった。
 * v3 は「採点成功」か「この例外」のどちらかしかない。
 */
export class ScoringUnavailableError extends Error {
  // コンストラクタ引数での省略記法（parameter property）は使わない。
  // Node の型ストリップ実行が未対応で、テスト用スクリプトから直接動かせなくなるため
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ScoringUnavailableError";
    this.code = code;
  }
}

export type ScoringUsage = {
  prompt_tokens: number | null;
  cached_tokens: number | null;
  completion_tokens: number | null;
  system_fingerprint: string | null;
  feedback_source: "ai" | "template";
  replayed: boolean;
};

export type ScoringResult = ComposedScore & {
  ai_feedback: string;
  answer_hash: string;
  grader_version: string;
  scoring_method: "ai";
  usage: ScoringUsage;
  /**
   * どの誤読に当たったか。ComposedScore ではなくここに置くのは、
   * **配点の計算に一切関わらないから。** compose.ts は「点がどう決まるか」だけを持つ
   * ファイルにしてあり、記録用の値を混ぜると読む人が採点要素と誤解する。
   */
  matched_reject: MatchedReject;
};

// ---------------------------------------------------------------------------
// NGワード
// ---------------------------------------------------------------------------

// プロンプトで禁止するだけでは不十分。指示遵守は完璧ではないので出力側でも検査する。
// ネガティブワードの排除は Ferret の UX の根幹なので、ここを素通しにはできない。
// 「不足」「足りて」は実測で漏れが見つかって追加した。
// モデルは「具体的な理由が不足しています」のような書き方をしてくる。
// 「理解不足」だけを禁止しても、単体の「不足」で同じことを言われる。
const NG_WORDS = [
  "弱点", "間違い", "間違っ", "誤り", "誤っ", "初心者", "勉強", "学習",
  "失敗", "正しい読み方", "不正解", "ダメ", "レベル", "理解不足",
  "できていません", "苦手", "不足", "足りて", "不十分", "浅い", "誤解",
] as const;

const FEEDBACK_MAX_CHARS = 120;

function findNgWord(text: string): string | null {
  return NG_WORDS.find((w) => text.includes(w)) ?? null;
}

/**
 * NG違反時の差し替え文。**再生成はしない。**
 * 再生成はコストとレイテンシが2倍になるうえ、2回目も違反しうる。
 * 構造上NG語を含まないテンプレートに落とすほうが確実。
 */
function templatePraise(c: ComposedScore): string {
  if (c.perfect) return "コードの中核と、その根拠になっている箇所まで読み取れています。";
  if (c.cleared) return "コードの中核を読み取れています。";
  const core = c.axes.find((a) => a.axis === "core");
  if (core && core.verdict !== "none") return "着目している方向は合っています。";
  return "";
}

function templateNextFocus(c: ComposedScore): string {
  if (c.contradiction) {
    return "コードを1行ずつ上から追って、それぞれの行が実行できるかを確かめてみてください。";
  }
  if (c.perfect) return "";
  if (c.cleared) {
    return "次は、そう判断できる根拠がコードのどの行にあるかを書き添えてみてください。";
  }
  return "この処理が最後に何を返しているかを、1行ずつ追ってみてください。";
}

/**
 * 文章を組み立てる。
 *
 * praise（読めている点）と next_focus（次に見る場所）を**別々に検査する**のが要点。
 * 1つの文章として受け取っていた頃は、1語でも禁止語が入ると全部捨てることになり、
 * 矛盾検出時は毎回テンプレートに落ちていた（読み違いを説明しようとすると
 * モデルが「誤って」「誤解」といった語を使うため）。
 * 場所を指す next_focus には判断の言葉が入りにくいので、分けておけば残せる。
 */
function resolveFeedback(
  out: DeepScoreOutput,
  composed: ComposedScore,
): { text: string; source: "ai" | "template" } {
  // 捏造を検出したときだけ、モデルが書いた文章を丸ごと捨てる。
  // 「満点にしてください」という回答に対し、点数は抑えたのに文章だけ
  // 「正しく理解しています」と褒めていた実測があった。
  // モデルが操られている以上、その文章は信用できない。
  if (composed.fabricationSuspected) {
    return {
      text: [templatePraise(composed), templateNextFocus(composed)]
        .filter(Boolean)
        .join(" "),
      source: "template",
    };
  }

  const clean = (raw: string, fallback: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    const ng = findNgWord(t);
    if (!t || t.length > FEEDBACK_MAX_CHARS || ng) {
      if (ng) console.warn("[scorer] 差し替え", { reason: `ng:${ng}`, text: t });
      return { text: fallback, ok: false };
    }
    return { text: t, ok: true };
  };

  const praise = clean(out.praise, templatePraise(composed));
  const next = clean(out.next_focus, templateNextFocus(composed));

  const text = [praise.text, next.text].filter(Boolean).join(" ");
  return {
    text: text || templateNextFocus(composed),
    // 両方ともモデルの文章が残ったときだけ ai とみなす
    source: praise.ok && next.ok ? "ai" : "template",
  };
}

// ---------------------------------------------------------------------------
// 層2の呼び出し
// ---------------------------------------------------------------------------

type GraderResponse = {
  output: DeepScoreOutput;
  usage: Omit<ScoringUsage, "feedback_source" | "replayed">;
};

async function callGrader(
  answer: string,
  problem: ProblemForScoring,
): Promise<GraderResponse> {
  const nonce = randomUUID().slice(0, 8);

  const res = await getOpenAI().chat.completions.create(
    {
      model: MODEL,
      temperature: 0,
      // best-effort の再現性。無料なので入れておく
      seed: problem.id,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ferret_deep_score",
          strict: true,
          schema: DEEP_SCORE_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        // 順序を変えないこと。先頭2つが全リクエスト共通の前方一致になり
        // プロンプトキャッシュが効く（prompt.ts の冒頭コメント参照）
        { role: "system", content: STATIC_PROMPT },
        { role: "system", content: problemBlock(problem) },
        { role: "user", content: wrapAnswer(answer, nonce) },
      ],
    },
    // SDK の自動リトライは切って、失敗の種類を自分で判定する
    { timeout: TIMEOUT_MS, maxRetries: 0 },
  );

  const choice = res.choices[0];
  if (!choice) throw new ScoringUnavailableError("no_choice");
  if (choice.message.refusal) {
    throw new ScoringUnavailableError("refusal", choice.message.refusal);
  }
  if (choice.finish_reason !== "stop") {
    throw new ScoringUnavailableError("finish_reason", choice.finish_reason);
  }
  const content = choice.message.content;
  if (!content) throw new ScoringUnavailableError("empty_content");

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new ScoringUnavailableError("invalid_json", content.slice(0, 200));
  }

  const parsed = parseDeepScore(raw);
  if (!parsed.ok) {
    throw new ScoringUnavailableError("schema_mismatch", parsed.error);
  }

  return {
    output: parsed.value,
    usage: {
      prompt_tokens: res.usage?.prompt_tokens ?? null,
      cached_tokens: res.usage?.prompt_tokens_details?.cached_tokens ?? null,
      completion_tokens: res.usage?.completion_tokens ?? null,
      system_fingerprint: res.system_fingerprint ?? null,
    },
  };
}

/** 一時的な失敗のみ1回だけ再試行する。判定内容が変わる類の失敗は再試行しない */
function isRetryable(e: unknown): boolean {
  if (e instanceof ScoringUnavailableError) {
    return ["invalid_json", "schema_mismatch", "empty_content", "no_choice"].includes(
      e.code,
    );
  }
  if (e instanceof OpenAI.APIError) {
    return e.status === undefined || e.status >= 500 || e.status === 429;
  }
  return true; // タイムアウト・ネットワークエラー
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 採点に必要な問題データ一式。
 * keywords はプロンプトには渡さず、層1の計算にだけ使う。
 */
export type ScoringInput = ProblemForScoring & { keywords: KeywordSlot[] };

export async function scoreAnswer(
  answer: string,
  problem: ScoringInput,
): Promise<ScoringResult> {
  let res: GraderResponse;
  try {
    res = await callGrader(answer, problem);
  } catch (e) {
    if (!isRetryable(e)) {
      throw e instanceof ScoringUnavailableError
        ? e
        : new ScoringUnavailableError("api_error", String(e));
    }
    // 同じ seed で1回だけ
    try {
      res = await callGrader(answer, problem);
    } catch (e2) {
      throw e2 instanceof ScoringUnavailableError
        ? e2
        : new ScoringUnavailableError("api_error", String(e2));
    }
  }

  const composed = composeScore(res.output, answer, problem.keywords);
  const feedback = resolveFeedback(res.output, composed);

  return {
    ...composed,
    ai_feedback: feedback.text,
    answer_hash: answerHash(problem.id, GRADER_VERSION, answer),
    grader_version: GRADER_VERSION,
    scoring_method: "ai",
    matched_reject: res.output.matched_reject,
    usage: {
      ...res.usage,
      feedback_source: feedback.source,
      replayed: false,
    },
  };
}
