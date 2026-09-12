// ステージ 15・53・59・78 の「場面」（A4）。
//
// **このファイルには場面しか入っていない。** 他のステージの場面は
// それぞれの `stage-*.data.mjs` の中（`reading_type` と `code` のあいだ）にある。
// この4問だけ別置きなのは、**A1（読解型の検証）で1問ずつ投入した分で
// `data.mjs` が無い**ため（記録は `problems/stage-015-053-059-078.sql` / `.md`）。
// 4・5問目が `problems/scenario-004-005.data.mjs` にあるのと同じ事情。
//
// 投入は**場面だけを書き替える専用スクリプト**で行う。
//
//   node problems/scenario-update.mjs problems/scenario-015-053-059-078.data.mjs
//
// ⚠️ **`update.mjs` に渡さないこと。** あちらは1問まるごと差し替えるので、
// このファイルを渡すと `context` と `prerequisite` が null で潰れる
// （`update.mjs` の先頭にその状態を弾くガードを置いてある）。
//
// ⚠️ **`preflight.mjs` も通らない**（keywords / rubric_items が無いため）。
// 場面そのものの検査（長さ・NG語・空文字列）は `scenario-update.mjs` が持っていて、
// 模範解答の写し・キーワード漏れは投入後に `npm run test:db`（I-819 / I-820）が見る。

export const problems = [
  {
    order: 15,
    scenario: `送料の決まり方について、サポートから問い合わせが来た。
コードを見て説明することになった。`,
  },

  {
    order: 53,
    scenario: `新しく入ったチームで、記事まわりを担当することになった。
まずファイルを開いて、全体を眺めてみる。`,
  },

  {
    order: 59,
    scenario: `承認の通知まわりを見てほしいと頼まれた。
手元には、そのときの実行結果が残っている。`,
  },

  {
    order: 78,
    scenario: `引き継いだコードから、まだ使ったことのない部品を呼ぶことになった。
手元にあるのはテストだけなので、そこから読む。`,
  },
];
