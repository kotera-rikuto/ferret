// 各問題の code を実際に実行して出力を出す。
//
//   node problems/run-code.mjs [データファイル]
//
// 模範解答に書いた「こう出力されます」が本当にそうなるかを、目でなく実行で確かめる。
// トレース型が大半なので、ここが違っていると問題そのものが成立しない。
// 機械検査（preflight.mjs）は書式しか見ないので、この確認だけは別に要る。
//
// ── 非同期の問題を扱えるようにした（2026-08-19・第9章のバッチ） ────────────
// 素の `vm` は同期実行しかしないので、そのままだと第9章（非同期）が全滅する。
//   1. `setTimeout` などは JS の機能ではなく実行環境が用意するもので、
//      新しいコンテキストには存在しない。**入れてやらないと ReferenceError になる**
//   2. `then` に渡した処理は、`runInNewContext` が戻ったあとに走る。
//      **戻った直後に出力すると、非同期の行がまるごと落ちる**
//   3. 誰も受け止めない拒否は Node の既定でプロセスを終わらせる。
//      **ステージ69 はまさにそれが答えの問題**なので、捕まえて出力に混ぜる

import { pathToFileURL } from "node:url";
import { createContext, runInNewContext } from "node:vm";
import { inspect } from "node:util";
import { stripTypeScriptTypes } from "node:module";

/** 非同期の出力を待つ時間。問題側の最長は 30ms（ステージ71）なので十分な余裕を取る */
const SETTLE_MS = 400;
const STEP_MS = 25;

const dataPath = process.argv[2] ?? "./problems/stage-006-014.data.mjs";
const { problems } = await import(pathToFileURL(dataPath).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const p of problems) {
  console.log(`\n=== order=${p.order}「${p.title}」 ===`);

  // 実行できない読み物（モジュール構文・package.json・テストファイルなど）は
  // データ側で `runnable: false` と宣言しておく。
  // **黙って SyntaxError を出すと「壊れている問題」と見分けが付かない**ので、
  // 対象外であることを明示する。第10章で初めて必要になった。
  if (p.runnable === false) {
    console.log(`  （実行対象外: ${p.notRunnableReason ?? "そのままでは動かせる形ではない"}）`);
    continue;
  }

  const out = [];
  const say = (...args) =>
    out.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" "));

  // 未処理の拒否はプロセスを落とすので、この問題のあいだだけ受け止めて出力に混ぜる
  const onUnhandled = (reason) => {
    const text = reason instanceof Error ? `${reason.name}: ${reason.message}` : inspect(reason);
    out.push(`【未処理の拒否】${text}`);
  };
  process.on("unhandledRejection", onUnhandled);

  const context = createContext({
    console: { log: say, warn: say, error: say, info: say },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
  });

  try {
    // TS は vm がそのままでは読めないので、型注釈だけを落としてから実行する。
    // **落とすのは型情報だけで、実行時の挙動は1つも変わらない**（消した部分は空白になる）。
    // これで TS 編でも「模範解答に書いた出力が本当にそうなるか」を確かめられる。
    // enum や namespace は落とせないので、使う問題は runnable: false にすること。
    const source = p.language === "ts" ? stripTypeScriptTypes(p.code) : p.code;
    runInNewContext(source, context);
    // 予約された処理が走り終わるのを待つ。出力が増えなくなったら早めに切り上げる
    let quiet = 0;
    for (let waited = 0; waited < SETTLE_MS && quiet < 3; waited += STEP_MS) {
      const before = out.length;
      await sleep(STEP_MS);
      quiet = out.length === before ? quiet + 1 : 0;
    }
    for (const line of out) console.log(`  ${line}`);
    if (out.length === 0) console.log("  （出力なし）");
  } catch (e) {
    // **例外の手前までの出力も出す。** 途中で止まる問題（TDZ など）は
    // 「どこまで出てから止まったか」が答えそのものなので、捨てると確認にならない
    await sleep(STEP_MS);
    for (const line of out) console.log(`  ${line}`);
    console.log(`  実行時エラー: ${e.constructor.name}: ${e.message}`);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}
