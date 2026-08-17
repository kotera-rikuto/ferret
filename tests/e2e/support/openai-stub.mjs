/**
 * OpenAI の代わりに立てるスタブサーバー。
 *
 * `OPENAI_BASE_URL` をここへ向けると、lib/ai/scorer.ts を1行も変えずに
 * 採点のリクエスト組み立て・再試行・スキーマ検証・user_attempts への保存まで
 * **本物のコードが最後まで走る**。E2E が見たいのはまさにそこ。
 *
 * 実APIを使わない理由は2つ。
 *   1. 1回 約¥0.04 かかる
 *   2. 同一回答でも点数が振れる（実測で 29点 / 53点）。テストの合否が運で決まる
 *
 * 制御用のエンドポイント（/__control）をテスト側から叩いて、
 * 「次に何を返すか」と「何回呼ばれたか」を出し入れする。
 *
 * 単体で起動する場合:  node tests/e2e/support/openai-stub.mjs
 */

import { createServer } from "node:http";

const PORT = Number(process.env.OPENAI_STUB_PORT ?? 4010);

/** 4観点すべて full・引用は回答に実在する想定の既定応答 */
const DEFAULT_OUTPUT = {
  core: { evidence: "const 宣言に再代入", verdict: "full" },
  ground: { evidence: "const 宣言に再代入", verdict: "full" },
  depth: { evidence: "const 宣言に再代入", verdict: "full" },
  articulation: { evidence: "const 宣言に再代入", verdict: "full" },
  contradiction: false,
  contradiction_evidence: "",
  matched_reject: "none",
  praise: "const の扱いまで読み取れています。",
  next_focus: "5行目の rate = 0.8 に注目してみてください。",
};

/** テストから差し込まれる状態 */
const state = {
  /** 1回だけ使う応答の待ち行列。空なら defaultOutput を返す */
  queue: [],
  /** 既定で返す採点結果 */
  defaultOutput: DEFAULT_OUTPUT,
  /** 呼び出し回数 */
  calls: 0,
  /** 受け取ったリクエスト本文（検証用） */
  requests: [],
  /** 応答を遅らせるミリ秒。タイムアウトの確認に使う */
  delayMs: 0,
};

function completion(output) {
  return {
    id: "chatcmpl-stub",
    object: "chat.completion",
    created: 0,
    model: "gpt-4o-mini-2024-07-18",
    system_fingerprint: "fp_stub",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(output), refusal: null },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1650,
      completion_tokens: 120,
      total_tokens: 1770,
      prompt_tokens_details: { cached_tokens: 1600 },
    },
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // --- 制御用 ---------------------------------------------------------------
  if (url.pathname === "/__control") {
    if (req.method === "GET") {
      return json(res, 200, { calls: state.calls, requests: state.requests });
    }
    if (req.method === "DELETE") {
      state.queue = [];
      state.defaultOutput = DEFAULT_OUTPUT;
      state.calls = 0;
      state.requests = [];
      state.delayMs = 0;
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST") {
      const body = (await readBody(req)) ?? {};
      // { queue: [...] } 1回ずつ消費する応答
      // { output: {...} } 既定の採点結果
      // { delayMs: n }   応答を遅らせる
      if (Array.isArray(body.queue)) state.queue = body.queue;
      if (body.output) state.defaultOutput = body.output;
      if (typeof body.delayMs === "number") state.delayMs = body.delayMs;
      return json(res, 200, { ok: true });
    }
  }

  // --- OpenAI 互換 ----------------------------------------------------------
  if (url.pathname.endsWith("/chat/completions") && req.method === "POST") {
    state.calls += 1;
    state.requests.push(await readBody(req));

    if (state.delayMs > 0) {
      await new Promise((r) => setTimeout(r, state.delayMs));
    }

    const next = state.queue.shift();

    // { status: 500 } のように書くと、その HTTP ステータスを返す
    if (next && typeof next.status === "number") {
      return json(res, next.status, { error: { message: "stubbed failure" } });
    }
    // { raw: "..." } のように書くと、その文字列をそのまま本文に入れる（壊れたJSONの再現）
    if (next && typeof next.raw === "string") {
      const body = completion({});
      body.choices[0].message.content = next.raw;
      return json(res, 200, body);
    }
    // { refusal: "..." } / { finish_reason: "length" } もそのまま反映する
    if (next && (next.refusal || next.finish_reason)) {
      const body = completion(state.defaultOutput);
      if (next.refusal) {
        body.choices[0].message.refusal = next.refusal;
        body.choices[0].message.content = null;
      }
      if (next.finish_reason) body.choices[0].finish_reason = next.finish_reason;
      return json(res, 200, body);
    }

    return json(res, 200, completion(next?.output ?? state.defaultOutput));
  }

  json(res, 404, { error: { message: `stub: ${req.method} ${url.pathname}` } });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[openai-stub] listening on http://127.0.0.1:${PORT}`);
});
