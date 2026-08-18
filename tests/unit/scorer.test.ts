/**
 * lib/ai/scorer.ts の単体テスト。
 * ケース定義は tests/unit/テストケース.md の §5。
 *
 * OpenAI SDK をまるごと差し替えて、実 API を1度も叩かずに
 * リクエストの組み立て・再試行・失敗の扱い・文章の整形を検証する。
 *
 * このモジュールの設計上の核は「採点成功」か「例外」しかないこと。
 * 0点として保存される経路が存在しないことを §5-2 で確認する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import OpenAI from "openai";
import { STATIC_PROMPT } from "@/lib/ai/prompt";
import { PROMPT_VERSION } from "@/lib/ai/schema";
import type { DeepScoreOutput } from "@/lib/ai/compose";
import {
  scoreAnswer,
  ScoringUnavailableError,
  GRADER_VERSION,
  type ScoringInput,
} from "@/lib/ai/scorer";

// ---------------------------------------------------------------------------
// OpenAI SDK のモック
// ---------------------------------------------------------------------------

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("openai", () => {
  class APIError extends Error {
    status: number | undefined;
    constructor(status?: number, message = "mocked api error") {
      super(message);
      this.name = "APIError";
      this.status = status;
    }
  }
  class MockOpenAI {
    chat = { completions: { create: createMock } };
    static APIError = APIError;
  }
  return { default: MockOpenAI, APIError };
});

/** モックの APIError を任意のステータスで作る */
function apiError(status?: number): Error {
  const Ctor = OpenAI.APIError as unknown as new (s?: number) => Error;
  return new Ctor(status);
}

// getOpenAI() は遅延初期化なので、テスト開始前に入っていれば足りる
process.env.OPENAI_API_KEY = "sk-test-dummy";

// ---------------------------------------------------------------------------
// 固定データ
// ---------------------------------------------------------------------------

const ANSWER =
  "5行目の const 宣言に再代入しているため TypeError で停止し、console.log は実行されません";

const EVIDENCE_REAL = "const 宣言に再代入";
const EVIDENCE_FAKE = "元の配列を書き換えている";

const CLEAN_PRAISE = "const の扱いまで読み取れています。";
const CLEAN_NEXT = "5行目の rate = 0.8 に注目してみてください。";

/** lib/ai/scorer.ts の NG_WORDS の写し（export されていないため複製） */
const NG_WORDS = [
  "弱点", "間違い", "間違っ", "誤り", "誤っ", "初心者", "勉強", "学習",
  "失敗", "正しい読み方", "不正解", "ダメ", "レベル", "理解不足",
  "できていません", "苦手", "不足", "足りて", "不十分", "浅い", "誤解",
];

const PROBLEM: ScoringInput = {
  id: 5,
  code: "const rate = 0.9;\nrate = 0.8;",
  question: "このコードを実行すると何が起きますか。",
  model_answer: "const の rate に再代入しているため TypeError で止まります。",
  reading_type: "トレース",
  rubric_items: {
    core: "const の rate への再代入でエラーになるという結論を指していれば満たす",
    ground: "rate = 0.8 が const 宣言への再代入である点に触れていれば満たす",
    depth: "TypeError という具体的なエラー名に触れていれば満たす",
    core_reject: ["900 が出力されると読んでいる", "let の total が問題だと読んでいる"],
  },
  keywords: [
    { match: ["5行目"] },
    { match: ["const"] },
    { match: ["再代入"] },
    { match: ["TypeError"] },
  ],
};

type Verdicts = ["full" | "partial" | "none", "full" | "partial" | "none", "full" | "partial" | "none", "full" | "partial" | "none"];

function deepOutput(
  verdicts: Verdicts = ["full", "full", "full", "full"],
  opts: {
    evidence?: string;
    contradiction?: boolean;
    contradictionEvidence?: string;
    praise?: string;
    next_focus?: string;
    matched_reject?: DeepScoreOutput["matched_reject"];
  } = {},
): DeepScoreOutput {
  const ev = opts.evidence ?? EVIDENCE_REAL;
  const axis = (v: Verdicts[number]) => ({
    verdict: v,
    evidence: v === "full" ? ev : "",
  });
  const [core, ground, depth, articulation] = verdicts;
  return {
    core: axis(core),
    ground: axis(ground),
    depth: axis(depth),
    articulation: axis(articulation),
    contradiction: opts.contradiction ?? false,
    contradiction_evidence: opts.contradictionEvidence ?? "",
    matched_reject: opts.matched_reject ?? "none",
    praise: opts.praise ?? CLEAN_PRAISE,
    next_focus: opts.next_focus ?? CLEAN_NEXT,
  };
}

/** 正常なレスポンス */
function ok(out: DeepScoreOutput = deepOutput()) {
  return {
    choices: [
      {
        message: { content: JSON.stringify(out), refusal: null },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1650,
      prompt_tokens_details: { cached_tokens: 1600 },
      completion_tokens: 120,
    },
    system_fingerprint: "fp_test",
  };
}

/** 中身を差し替えた異常なレスポンス */
function broken(patch: Record<string, unknown>) {
  const base = ok();
  return { ...base, ...patch };
}

beforeEach(() => {
  createMock.mockReset();
});

// ---------------------------------------------------------------------------
// §5-1 リクエストの組み立て
// ---------------------------------------------------------------------------

describe("§5-1 リクエストの組み立て", () => {
  beforeEach(() => {
    createMock.mockResolvedValue(ok());
  });

  it("U-200 モデルはスナップショットで固定されている", async () => {
    await scoreAnswer(ANSWER, PROBLEM);
    expect(createMock.mock.calls[0][0].model).toBe("gpt-4o-mini-2024-07-18");
  });

  it("U-201 GRADER_VERSION がモデル名とプロンプト版でできている", () => {
    expect(GRADER_VERSION).toBe(`gpt-4o-mini-2024-07-18/${PROMPT_VERSION}`);
  });

  it("U-202 temperature: 0 を明示している（未指定だと点が揺れる）", async () => {
    await scoreAnswer(ANSWER, PROBLEM);
    expect(createMock.mock.calls[0][0].temperature).toBe(0);
  });

  it("U-203 seed に problem.id を渡している", async () => {
    await scoreAnswer(ANSWER, PROBLEM);
    expect(createMock.mock.calls[0][0].seed).toBe(PROBLEM.id);
  });

  it("U-204 出力トークン数に上限を付けている", async () => {
    await scoreAnswer(ANSWER, PROBLEM);
    expect(createMock.mock.calls[0][0].max_completion_tokens).toBe(400);
  });

  it("U-205 Structured Outputs を strict で使っている", async () => {
    await scoreAnswer(ANSWER, PROBLEM);
    const rf = createMock.mock.calls[0][0].response_format;
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.required).toContain("core");
  });

  it("U-206 メッセージの順序がキャッシュの効く並びになっている", async () => {
    await scoreAnswer(ANSWER, PROBLEM);
    const messages = createMock.mock.calls[0][0].messages;
    expect(messages).toHaveLength(3);
    // 先頭2つが全リクエスト共通の前方一致になる
    expect(messages[0]).toEqual({ role: "system", content: STATIC_PROMPT });
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain(PROBLEM.code);
    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toMatch(/^<<<ANSWER_BEGIN:/);
  });

  it("U-207 タイムアウトを付け、SDK の自動リトライを切っている", async () => {
    await scoreAnswer(ANSWER, PROBLEM);
    expect(createMock.mock.calls[0][1]).toEqual({ timeout: 12_000, maxRetries: 0 });
  });

  it("U-208 呼び出しごとに nonce が変わる", async () => {
    createMock.mockReset();
    createMock
      .mockResolvedValueOnce(broken({ choices: [] }))
      .mockResolvedValueOnce(ok());
    await scoreAnswer(ANSWER, PROBLEM);

    const nonceOf = (i: number) =>
      /<<<ANSWER_BEGIN:([0-9a-f]+)>>>/.exec(
        createMock.mock.calls[i][0].messages[2].content,
      )?.[1];
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(nonceOf(0)).toBeTruthy();
    expect(nonceOf(0)).not.toBe(nonceOf(1));
  });

  it("U-210 OpenAI が使用量を返さなくても落ちない", async () => {
    // usage は SDK の型上も任意。欠けたときに null で埋まることを確かめる。
    // ここが例外になると、採点は成功しているのに 503 になる
    createMock.mockReset();
    createMock.mockResolvedValue({
      choices: [
        {
          message: { content: JSON.stringify(deepOutput()), refusal: null },
          finish_reason: "stop",
        },
      ],
    });

    const r = await scoreAnswer(ANSWER, PROBLEM);
    expect(r.total).toBe(100);
    expect(r.usage).toMatchObject({
      prompt_tokens: null,
      cached_tokens: null,
      completion_tokens: null,
      system_fingerprint: null,
    });
  });

  it("U-211 使用量の一部だけが欠けても残りは拾う", async () => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      choices: [
        {
          message: { content: JSON.stringify(deepOutput()), refusal: null },
          finish_reason: "stop",
        },
      ],
      // prompt_tokens_details（キャッシュ命中数）だけが無いケース
      usage: { prompt_tokens: 1650, completion_tokens: 120 },
      system_fingerprint: "fp_test",
    });

    const r = await scoreAnswer(ANSWER, PROBLEM);
    expect(r.usage.prompt_tokens).toBe(1650);
    expect(r.usage.cached_tokens).toBeNull();
  });

  /**
   * matched_reject は「どの誤読に当たったか」の記録（残課題 §3）。
   * scorer は加工せずそのまま通す。**配点には一切関わらない。**
   */
  it("U-212 matched_reject をそのまま結果に載せる", async () => {
    createMock.mockResolvedValue(
      ok(deepOutput(["full", "full", "full", "full"], { matched_reject: "2" })),
    );
    const r = await scoreAnswer(ANSWER, PROBLEM);
    expect(r.matched_reject).toBe("2");
  });

  it("U-213 matched_reject は点数を変えない", async () => {
    createMock.mockResolvedValue(ok(deepOutput(["full", "partial", "none", "none"])));
    const none = await scoreAnswer(ANSWER, PROBLEM);

    createMock.mockResolvedValue(
      ok(deepOutput(["full", "partial", "none", "none"], { matched_reject: "1" })),
    );
    const matched = await scoreAnswer(ANSWER, PROBLEM);

    expect(matched.total).toBe(none.total);
    expect(matched.deepScore).toBe(none.deepScore);
    expect(matched.keywordScore).toBe(none.keywordScore);
    expect(matched.cleared).toBe(none.cleared);
  });

  it("U-209 結果に採点の出所が記録される", async () => {
    const r = await scoreAnswer(ANSWER, PROBLEM);
    expect(r.grader_version).toBe(GRADER_VERSION);
    expect(r.scoring_method).toBe("ai");
    expect(r.answer_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.usage).toMatchObject({
      prompt_tokens: 1650,
      cached_tokens: 1600,
      completion_tokens: 120,
      system_fingerprint: "fp_test",
      replayed: false,
    });
  });
});

// ---------------------------------------------------------------------------
// §5-2 失敗の扱い
// ---------------------------------------------------------------------------

describe("§5-2 失敗の扱い", () => {
  async function expectFailure(code: string) {
    const e = await scoreAnswer(ANSWER, PROBLEM).catch((err) => err);
    expect(e).toBeInstanceOf(ScoringUnavailableError);
    expect((e as ScoringUnavailableError).code).toBe(code);
    return e as ScoringUnavailableError;
  }

  it("U-220 choices が空なら no_choice で、再試行する", async () => {
    createMock.mockResolvedValue(broken({ choices: [] }));
    await expectFailure("no_choice");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("U-221 refusal は再試行せずに落とす", async () => {
    createMock.mockResolvedValue(
      broken({
        choices: [{ message: { refusal: "お断りします" }, finish_reason: "stop" }],
      }),
    );
    await expectFailure("refusal");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("U-222 finish_reason が stop 以外なら再試行せずに落とす", async () => {
    createMock.mockResolvedValue(
      broken({
        choices: [
          {
            message: { content: "{}", refusal: null },
            finish_reason: "length",
          },
        ],
      }),
    );
    await expectFailure("finish_reason");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("U-223 本文が空なら empty_content で、再試行する", async () => {
    createMock.mockResolvedValue(
      broken({
        choices: [{ message: { content: null, refusal: null }, finish_reason: "stop" }],
      }),
    );
    await expectFailure("empty_content");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("U-224 JSON として壊れていたら invalid_json で、再試行する", async () => {
    createMock.mockResolvedValue(
      broken({
        choices: [
          {
            message: { content: "これはJSONではありません", refusal: null },
            finish_reason: "stop",
          },
        ],
      }),
    );
    await expectFailure("invalid_json");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("U-225 スキーマに合わなければ schema_mismatch で、再試行する", async () => {
    createMock.mockResolvedValue(
      broken({
        choices: [
          {
            message: { content: JSON.stringify({ core: "壊れている" }), refusal: null },
            finish_reason: "stop",
          },
        ],
      }),
    );
    await expectFailure("schema_mismatch");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("U-226 1回目が失敗しても2回目が通れば成功する", async () => {
    createMock
      .mockResolvedValueOnce(
        broken({
          choices: [
            { message: { content: "壊れたJSON", refusal: null }, finish_reason: "stop" },
          ],
        }),
      )
      .mockResolvedValueOnce(ok());
    const r = await scoreAnswer(ANSWER, PROBLEM);
    expect(r.total).toBe(100);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["500", 500],
    ["503", 503],
    ["429", 429],
    ["ステータス不明", undefined],
  ])("U-227/228 APIError（%s）は再試行する", async (_label, status) => {
    createMock.mockRejectedValue(apiError(status));
    await expectFailure("api_error");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("U-229 APIError（400）は再試行しない", async () => {
    createMock.mockRejectedValue(apiError(400));
    await expectFailure("api_error");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("U-230 タイムアウト・ネットワークエラーは再試行する", async () => {
    createMock.mockRejectedValue(new Error("ETIMEDOUT"));
    await expectFailure("api_error");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("U-231 2回とも失敗したら ScoringUnavailableError になる", async () => {
    createMock.mockRejectedValue(new Error("boom"));
    const e = await expectFailure("api_error");
    expect(e.message).toContain("boom");
  });

  it("U-232 どの失敗でも 0点の結果を返さない", async () => {
    const failures = [
      broken({ choices: [] }),
      broken({
        choices: [{ message: { content: null, refusal: null }, finish_reason: "stop" }],
      }),
      broken({
        choices: [
          { message: { content: "壊れたJSON", refusal: null }, finish_reason: "stop" },
        ],
      }),
    ];
    for (const res of failures) {
      createMock.mockReset();
      createMock.mockResolvedValue(res);
      const r = await scoreAnswer(ANSWER, PROBLEM).catch((e) => e);
      expect(r).toBeInstanceOf(ScoringUnavailableError);
      expect(r).not.toHaveProperty("total");
    }
  });

  it("U-233 OPENAI_API_KEY が無ければ呼び出し時に落ちる（読み込み時ではない）", async () => {
    const saved = process.env.OPENAI_API_KEY;
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    try {
      const fresh = await import("@/lib/ai/scorer");
      const e = await fresh.scoreAnswer(ANSWER, PROBLEM).catch((err) => err);
      expect(e).toBeInstanceOf(Error);
      expect(String(e)).toContain("OPENAI_API_KEY");
      expect(createMock).not.toHaveBeenCalled();
    } finally {
      process.env.OPENAI_API_KEY = saved;
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// §5-3 フィードバックの整形
// ---------------------------------------------------------------------------

describe("§5-3 フィードバックの整形", () => {
  async function feedbackOf(out: DeepScoreOutput) {
    createMock.mockReset();
    createMock.mockResolvedValue(ok(out));
    return scoreAnswer(ANSWER, PROBLEM);
  }

  it("U-250 正常な文章は2つとも残り、出所は ai になる", async () => {
    const r = await feedbackOf(deepOutput());
    expect(r.ai_feedback).toBe(`${CLEAN_PRAISE} ${CLEAN_NEXT}`);
    expect(r.usage.feedback_source).toBe("ai");
  });

  it("U-251 praise に NG語があればそこだけ差し替える", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "full"], {
        praise: "理解不足のところがあります。",
      }),
    );
    expect(r.ai_feedback).not.toContain("理解不足");
    expect(r.ai_feedback).toContain(CLEAN_NEXT);
    expect(r.usage.feedback_source).toBe("template");
  });

  it("U-252 next_focus に NG語があればそこだけ差し替える", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "full"], {
        next_focus: "読み方が間違っています。",
      }),
    );
    expect(r.ai_feedback).toContain(CLEAN_PRAISE);
    expect(r.ai_feedback).not.toContain("間違っ");
    expect(r.usage.feedback_source).toBe("template");
  });

  it("U-253 120字を超える文章は差し替える", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "full"], { praise: "あ".repeat(121) }),
    );
    expect(r.ai_feedback).not.toContain("あ".repeat(121));
    expect(r.usage.feedback_source).toBe("template");
  });

  it("U-254 空の文章は差し替える", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "full"], { praise: "" }),
    );
    expect(r.ai_feedback.length).toBeGreaterThan(0);
    expect(r.usage.feedback_source).toBe("template");
  });

  /**
   * 残課題 §1 の修正が戻っていないことの回帰テスト。
   *
   * 以前は捏造と矛盾を同じ扱いにしていたため、誤読した学習者には
   * 場所を示さない定型文しか出なかった。矛盾は「AI が正しく検出した」状態で、
   * その文章はむしろ有用なので捨ててはいけない。
   */
  it("U-255 矛盾を検出しても AI の文章は残す（回帰）", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "none", "none", "none"], {
        contradiction: true,
        contradictionEvidence: EVIDENCE_REAL,
      }),
    );
    expect(r.contradiction).toBe(true);
    expect(r.ai_feedback).toBe(`${CLEAN_PRAISE} ${CLEAN_NEXT}`);
    expect(r.usage.feedback_source).toBe("ai");
  });

  it("U-256 引用の捏造を検出したら AI の文章を丸ごと捨てる", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "none"], {
        evidence: EVIDENCE_FAKE,
        praise: "完璧に正しく理解しています。",
      }),
    );
    expect(r.fabricationSuspected).toBe(true);
    expect(r.ai_feedback).not.toContain("完璧に正しく理解しています");
    expect(r.usage.feedback_source).toBe("template");
  });

  it.each(NG_WORDS)("U-257 NG語「%s」を含む文章は差し替えられる", async (ng) => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "full"], { praise: `この点は${ng}です。` }),
    );
    expect(r.ai_feedback).not.toContain(ng);
    expect(r.usage.feedback_source).toBe("template");
  });

  /**
   * 🟡 NG語がカリキュラム上の正式な技術用語を巻き込む。
   * 「浅いコピー」は ideas/問題構成案.md 第1章に登場する用語。
   * 現状を固定するだけにして、緩和するかはオーナーの判断に残す。
   */
  it("U-258 【要判断】「浅いコピー」が NG語「浅い」で差し替えられる", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "full"], {
        praise: "浅いコピーである点まで読み取れています。",
      }),
    );
    expect(r.ai_feedback).not.toContain("浅いコピー");
    expect(r.usage.feedback_source).toBe("template");
  });

  /** 🟡 同上。「トップレベル」は JS の一般的な用語 */
  it("U-259 【要判断】「トップレベル」が NG語「レベル」で差し替えられる", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "full"], {
        praise: "トップレベルで宣言されている点を捉えています。",
      }),
    );
    expect(r.ai_feedback).not.toContain("トップレベル");
    expect(r.usage.feedback_source).toBe("template");
  });

  it("U-260 どの帯域でもフィードバックが空にならない", async () => {
    const scenarios: Verdicts[] = [
      ["full", "full", "full", "full"], // パーフェクト
      ["full", "none", "none", "full"], // クリア
      ["partial", "none", "none", "none"], // 不合格
      ["none", "none", "none", "none"], // 中核なし
    ];
    for (const verdicts of scenarios) {
      const r = await feedbackOf(
        deepOutput(verdicts, { praise: "", next_focus: "" }),
      );
      expect(r.ai_feedback.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * scorer.ts の `text || templateNextFocus(composed)` が**到達しない**ことの確認。
   *
   * text が空になるには praise と next_focus の両方が空である必要がある。
   *   - next が空 → templateNextFocus が "" → perfect かつ矛盾なし のときだけ
   *   - praise が空 → templatePraise が "" → perfect でも cleared でもなく core=none のときだけ
   * この2つは同時に成立しない。つまり最後の `||` は構造上入れない。
   *
   * 全81通り（4観点 × 3段階）× 矛盾あり/なし を総当たりして、
   * 「フィードバックが空にならない」ことを実際に確かめる。
   * 到達不能な行を消すかどうかはオーナーの判断なので、テストは事実の記録に留める。
   */
  it("U-262 全帯域を総当たりしてもフィードバックが空にならない", async () => {
    const levels: Verdicts[number][] = ["full", "partial", "none"];
    let checked = 0;

    for (const core of levels)
      for (const ground of levels)
        for (const depth of levels)
          for (const articulation of levels)
            for (const contradiction of [false, true]) {
              const r = await feedbackOf(
                deepOutput([core, ground, depth, articulation], {
                  contradiction,
                  contradictionEvidence: contradiction ? EVIDENCE_REAL : "",
                  // AI の文章を両方空にして、必ずテンプレートに落とす
                  praise: "",
                  next_focus: "",
                }),
              );
              expect(
                r.ai_feedback.trim().length,
                `core=${core} ground=${ground} depth=${depth} artic=${articulation} 矛盾=${contradiction} で空になった`,
              ).toBeGreaterThan(0);
              checked += 1;
            }

    expect(checked).toBe(162);
  });

  it("U-261 差し替え用のテンプレート自体が NG語を含まない", async () => {
    const scenarios: Array<[Verdicts, Record<string, unknown>]> = [
      [["full", "full", "full", "full"], {}],
      [["full", "none", "none", "full"], {}],
      [["partial", "none", "none", "none"], {}],
      [["none", "none", "none", "none"], {}],
      [
        ["full", "none", "none", "none"],
        { contradiction: true, contradictionEvidence: EVIDENCE_REAL },
      ],
    ];
    for (const [verdicts, opts] of scenarios) {
      // 両方を NG 入りにして、必ずテンプレートに落とす
      const r = await feedbackOf(
        deepOutput(verdicts, { ...opts, praise: "弱点です", next_focus: "失敗です" }),
      );
      for (const ng of NG_WORDS) {
        expect(r.ai_feedback, `テンプレートに NG語「${ng}」が含まれる`).not.toContain(
          ng,
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // 2つに分けたまま返す（tasks/E2）
  // -------------------------------------------------------------------------

  /**
   * つなげた文章しか返していなかった頃は、画面で2枠に分けられず、
   * 禁止語でどちらが差し替えられたのかも追えなかった。
   *
   * ここで固定するのは「分けたまま返る」ことと、**つなげた文章が2つから導ける**こと。
   * 後者が無いと、片方だけを直して両者が食い違う作りに戻せてしまう。
   */
  it("U-263 2つを分けたまま返し、つなげた文章と一致する", async () => {
    const r = await feedbackOf(deepOutput());
    expect(r.ai_praise).toBe(CLEAN_PRAISE);
    expect(r.ai_next_focus).toBe(CLEAN_NEXT);
    expect(r.ai_feedback).toBe(`${r.ai_praise} ${r.ai_next_focus}`);
  });

  /**
   * 差し替え先のテンプレートが空の帯域（core=none の低得点帯に「よかったところ」は無い）。
   * 空文字のまま返し、枠を出さない判断は画面に任せる。
   * ここで無理に文章を作ると、読めていない回答を褒めることになる。
   */
  it("U-264 差し替え先が空の帯域では、その枠だけ空になる", async () => {
    const r = await feedbackOf(
      deepOutput(["none", "none", "none", "none"], { praise: "弱点です" }),
    );
    expect(r.ai_praise).toBe("");
    expect(r.ai_next_focus).toBe(CLEAN_NEXT);
    expect(r.ai_feedback).toBe(CLEAN_NEXT);
  });

  it("U-265 捏造を検出したら2つともテンプレートに置き換わる", async () => {
    const r = await feedbackOf(
      deepOutput(["full", "full", "full", "none"], {
        evidence: EVIDENCE_FAKE,
        praise: "完璧に正しく理解しています。",
        next_focus: "そのままの読み方で問題ありません。",
      }),
    );
    expect(r.fabricationSuspected).toBe(true);
    expect(r.ai_praise).not.toContain("完璧に");
    expect(r.ai_next_focus).not.toContain("そのままの読み方");
    expect(r.ai_praise.length).toBeGreaterThan(0);
    expect(r.ai_next_focus.length).toBeGreaterThan(0);
  });

  /** 帯域と差し替えの組み合わせを回して、2枠と1枠の本文が食い違わないことを見る */
  it("U-266 どの帯域でも、つなげた文章は2つの枠から導ける", async () => {
    const scenarios: Verdicts[] = [
      ["full", "full", "full", "full"],
      ["full", "none", "none", "full"],
      ["partial", "none", "none", "none"],
      ["none", "none", "none", "none"],
    ];
    const substitutions = [
      {},
      { praise: "弱点です" },
      { next_focus: "失敗です" },
      { praise: "弱点です", next_focus: "失敗です" },
    ];
    for (const verdicts of scenarios) {
      for (const opts of substitutions) {
        const r = await feedbackOf(deepOutput(verdicts, opts));
        const label = `verdicts=${verdicts.join("/")} opts=${JSON.stringify(opts)}`;
        expect(
          [r.ai_praise, r.ai_next_focus].filter(Boolean).join(" "),
          `${label} で2枠とつなげた文章が食い違った`,
        ).toBe(r.ai_feedback);
        expect(r.ai_feedback.trim().length, `${label} で空になった`).toBeGreaterThan(0);
      }
    }
  });
});
