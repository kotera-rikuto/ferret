"use client";

import { useState, useSyncExternalStore } from "react";
import { IconPencil } from "@/components/ui/icons";

/**
 * 問題を読みながら書き留めるメモ欄。
 *
 * **メモは採点に送らない。** この部品は回答欄（ProblemForm）と完全に別で、
 * 中身が /api/score へ渡る経路がどこにも無い。同じ部品にまとめると
 * 「送る文字列」と「送らない文字列」が1つの state に同居することになり、
 * 後から片方だけを送り忘れる／送ってしまう事故が起きうる。
 * メモには考えの途中経過（誤った仮説を含む）が入るので、送ると点が変わる。
 *
 * 保存先は端末の中だけ（オーナー判断 2026-08-19・案A）。
 * 端末をまたいで見る用途は薄く、DB とAPIを増やさずに済むため。
 * サーバー側からは見えないので、「メモが消えた」に対して復元する手段は無い。
 */

/**
 * 1件あたりの上限。
 *
 * 上限を置く目的は端末の保存領域を有界にすること。**100問 × 2000字でも
 * 約400KB で、ブラウザの上限（5MB 前後）の1割に届かない。** だから
 * 「古いメモを消す」仕組みは入れていない ── 消す仕組みは、書いたはずのメモが
 * 黙って消える経路をこちら側で作ることでもあるので、必要になるまで持たない。
 *
 * 回答欄（ANSWER_MAX_CHARS = 600）より大きいのは、メモが下書きだから。
 * 回答より短くしか書けないメモ欄は用をなさない。
 */
export const MEMO_MAX_CHARS = 2000;

/** 残り文字数を出し始める割合。常時出すと、採点される欄のように見えるため */
const COUNTER_FROM = 0.8;

/** localStorage を初回描画で読むための購読なしストア。サーバー描画時は null */
const subscribeNothing = () => () => {};

export function MemoPad({ problemId }: { problemId: number }) {
  // 回答の下書き（ferret:draft:{id}）とは別の名前にする。
  // 混ざると、メモを開いたら回答が出てくる（またはその逆）ことになる
  const memoKey = `ferret:memo:${problemId}`;

  // 復元のしかたは ProblemForm の下書きと同じ。
  // effect での setState は lint（react-hooks/set-state-in-effect）で禁止なので、
  // 「編集前は保存済み、編集し始めたら編集値」の合成で復元する
  const storedMemo = useSyncExternalStore(
    subscribeNothing,
    () => localStorage.getItem(memoKey),
    () => null,
  );
  const [edited, setEdited] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const memo = edited ?? storedMemo ?? "";
  const restored = edited === null && Boolean(storedMemo);

  function handleChange(value: string) {
    // 保存に失敗しても入力は画面に残す。先に state を更新しておくことで、
    // 「保存できません」と出ている間もメモを書き続けられる
    setEdited(value);
    try {
      if (value) localStorage.setItem(memoKey, value);
      else localStorage.removeItem(memoKey);
      setSaveFailed(false);
    } catch {
      // 端末の保存領域が一杯のとき（同じアドレスで動く他のアプリが使い切っている等）。
      // 黙って握りつぶすと、書いたメモが保存されたと思ったまま消える
      setSaveFailed(true);
    }
  }

  const length = memo.length;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-panel px-5 py-4">
      <div className="flex items-center gap-2 text-sm font-extrabold">
        <IconPencil size={17} className="text-brand-deep" />
        メモ
        {/* 採点されない欄であることを、書き始める前に見える場所に置く。
            置かないと回答欄と取り違えて、書いたのに送られない事故になる */}
        <span className="text-[11px] font-bold text-muted">
          （採点には送りません）
        </span>
      </div>

      <textarea
        value={memo}
        onChange={(e) => handleChange(e.target.value)}
        maxLength={MEMO_MAX_CHARS}
        placeholder="変数の値を追う、気になった行を控える、回答の下書きにする..."
        rows={4}
        aria-label="メモ（採点には送りません）"
        // 回答欄と見た目を変えてある。同じ白い枠を2つ並べると、
        // どちらに書けば採点されるのかが見て分からない
        className="resize-y rounded-xl bg-bg-deep px-4 py-3 text-sm leading-loose outline-none focus:ring-2 focus:ring-brand placeholder:text-locked-ink"
      />

      <div className="flex items-center justify-between text-xs font-bold text-muted">
        <span>
          {saveFailed
            ? "この端末には保存できませんでした。書いた内容は画面を閉じるまで残ります。"
            : restored
              ? "前回のメモを表示しています"
              : " "}
        </span>
        {/* 上限に近づいたときだけ出す */}
        {length >= MEMO_MAX_CHARS * COUNTER_FROM && (
          <span className="shrink-0">
            {length} / {MEMO_MAX_CHARS}
          </span>
        )}
      </div>
    </div>
  );
}
