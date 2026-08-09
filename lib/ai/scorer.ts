import OpenAI from "openai";

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

// DBから取得する問題データの型
export type KeywordSlot = {
  match: string[];
};

export type ProblemForScoring = {
  code: string;
  question: string;
  model_answer: string;
  keywords: KeywordSlot[];
  ai_rubric: string;
};

export type ScoringResult = {
  total: number;
  keyword_score: number;
  deep_score: number;
  ai_feedback: string;
  scoring_method: "ai" | "keyword_only";
};

// 層1: キーワードスコアリング（0〜20点）
function scoreByKeywords(answer: string, keywords: KeywordSlot[]): number {
  const pointPerSlot = 20 / keywords.length;
  return keywords.reduce((total, slot) => {
    const hit = slot.match.some((kw) => answer.includes(kw));
    return total + (hit ? pointPerSlot : 0);
  }, 0);
}

// AI採点は 0/20/40/60/80 の5段階のみ。
// 中間値はモデルの気分に左右されて一貫性がないため離散化する
const ALLOWED_DEEP_SCORES = [0, 20, 40, 60, 80];

// 指示に反した値が返ってきた場合に最も近い段階へ丸める
function normalizeDeepScore(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  return ALLOWED_DEEP_SCORES.reduce((best, v) =>
    Math.abs(v - n) < Math.abs(best - n) ? v : best,
  );
}

// 層2: GPT-4o miniスコアリング（0〜80点 + フィードバック文）
async function scoreByAI(
  answer: string,
  problem: ProblemForScoring,
): Promise<{ score: number; feedback: string }> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    // 採点者にランダム性は不要。未指定だとデフォルト1.0になり点数が揺れる
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `あなたはコードリーディングの採点者です。
以下の採点基準に従って回答を採点し、JSONで返してください。

【問題のコード】
${problem.code}

【設問】
${problem.question}

【模範回答】
${problem.model_answer}

【採点基準】
${problem.ai_rubric}

scoreは 0, 20, 40, 60, 80 の5段階のみ。

feedback は日本語で、回答者が次にどこを読めばよいかが分かる前向きな文章にしてください。
以下の語は絶対に使わないでください: 「弱点」「間違い」「初心者」「勉強」「失敗」「正しい読み方」
できていない点を指摘する場合も、否定ではなく「次に注目するとよい箇所」として書いてください。

出力形式: { "score": number, "feedback": string }`,
      },
      {
        role: "user",
        content: answer,
      },
    ],
  });

  const result = JSON.parse(response.choices[0].message.content ?? "{}");
  return {
    score: normalizeDeepScore(result.score),
    feedback: typeof result.feedback === "string" ? result.feedback : "",
  };
}

// メイン採点関数
export async function scoreAnswer(
  answer: string,
  problem: ProblemForScoring,
): Promise<ScoringResult> {
  // 層1: 常に実行（API呼び出しなし）
  const keywordScore = Math.round(scoreByKeywords(answer, problem.keywords));

  // 層2: 常に実行。事前フィルタや高速パスは設けない
  const { score: deepScore, feedback } = await scoreByAI(answer, problem);

  return {
    total: keywordScore + deepScore,
    keyword_score: keywordScore,
    deep_score: deepScore,
    ai_feedback: feedback,
    scoring_method: "ai",
  };
}
