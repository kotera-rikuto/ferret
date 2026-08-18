// 各問題の code を実際に実行して出力を出す。
//
// 模範解答に書いた「こう出力されます」が本当にそうなるかを、目でなく実行で確かめる。
// トレース型が9問中8問あるので、ここが違っていると問題そのものが成立しない。
// 機械検査（preflight.mjs）は書式しか見ないので、この確認だけは別に要る。

import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { inspect } from "node:util";

const dataPath = process.argv[2] ?? "./problems/stage-006-014.data.mjs";
const { problems } = await import(pathToFileURL(dataPath).href);

for (const p of problems) {
  console.log(`\n=== order=${p.order}「${p.title}」 ===`);
  const out = [];
  try {
    runInNewContext(p.code, {
      console: {
        log: (...args) =>
          out.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" ")),
      },
    });
    for (const line of out) console.log(`  ${line}`);
    if (out.length === 0) console.log("  （出力なし）");
  } catch (e) {
    // **例外の手前までの出力も出す。** 途中で止まる問題（TDZ など）は
    // 「どこまで出てから止まったか」が答えそのものなので、捨てると確認にならない
    for (const line of out) console.log(`  ${line}`);
    console.log(`  実行時エラー: ${e.constructor.name}: ${e.message}`);
  }
}
