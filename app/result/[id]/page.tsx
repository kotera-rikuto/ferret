import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CLEAR_THRESHOLD, PERFECT_THRESHOLD } from "@/lib/ai/compose";
import {
  bestScoreByProblem,
  totalXp,
  xpGain,
  xpView,
} from "@/lib/progress/level";
import { ResultView } from "./ResultView";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // URL の数字はユーザーが自由に書き換えられる。整数以外はここで落とす。
  // 素通しすると Number("abc") が NaN になり、そのまま問い合わせに乗る
  const problemId = Number(id);
  if (!Number.isInteger(problemId) || problemId <= 0) notFound();

  /*
   * **2つまとめて同時に投げる**（E14・2026-09-12）。
   *
   * 下の一覧（XP の材料）は上の1件を待つ必要がない ── どちらも `user.id` と
   * `problemId` だけで決まる。以前は上から順に `await` していたので、
   * DB との往復（本番の実測で1回あたり約0.2秒）が2回ぶん直列になっていた。
   *
   * 回答が1件も無ければ下の一覧は捨てることになるが、**それは問題画面へ
   * 戻される回だけ**（このリザルトを開く通常の道のりでは必ず1件ある）。
   * 捨てる回のために、毎回の往復を1回増やすほうが割に合わない。
   */
  const [{ data: attempt }, { data: scored }] = await Promise.all([
    // この問題に対する自分の最新の回答。
    // session クライアント経由なので RLS で自分の行だけに絞られる
    supabase
      .from("user_attempts")
      // contradiction は見せ方の分岐に使う（読み違いのときは点数を主役から降ろす・E6）。
      // ai_praise / ai_next_focus は2枠表示に使う。この欄が無かった頃の行は
      // どちらも NULL なので、つなげた ai_feedback を1枠で出す（E2）
      .select(
        "id, total_score, keyword_score, deep_score, ai_feedback, ai_praise, ai_next_focus, contradiction",
      )
      .eq("problem_id", problemId)
      // 判定保留（レート上限時に層1のみで採点した回）は合否を出さない
      .eq("is_provisional", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // XP は users.xp に貯めず、回答ログから毎回導出する（lib/progress/level.ts）。
    // ストリークと同じ方針で、カウンタ更新の失敗によるズレを構造的に無くしている。
    //
    // ここも session クライアントで読む。service_role にすると、
    // RLS が壊れたときに他人の行まで数えて XP が増える方向に転ぶ。
    // session なら「自分の行が読めなくなる＝XP が少なく出る」側に倒れる
    supabase
      .from("user_attempts")
      .select("id, problem_id, total_score")
      .eq("user_id", user.id)
      .eq("is_provisional", false),
  ]);

  // 未回答の問題のリザルトに直接来た場合は問題画面へ戻す
  if (!attempt) redirect(`/problems/${id}`);

  const rows = scored ?? [];

  // 問題ごとの最高点にまとめてから数える（1回ごとに足すと解き直しで無限に稼げる）
  const bestByProblem = bestScoreByProblem(rows);
  // いま表示している回答は必ず数に入れる。
  // 一覧の取得に失敗しても「+10 XP と出ているのに累計が0」という食い違いを作らない
  bestByProblem.set(
    problemId,
    Math.max(bestByProblem.get(problemId) ?? 0, attempt.total_score),
  );

  // この回答より前の、同じ問題での最高点。
  // リザルトは常に最新の回答を表示するので、「この回答以外」がそのまま「前まで」になる
  const previousBest = bestScoreByProblem(rows, attempt.id).get(problemId) ?? 0;

  return (
    <ResultView
      problemId={problemId}
      attemptId={attempt.id}
      totalScore={attempt.total_score}
      keywordScore={attempt.keyword_score}
      deepScore={attempt.deep_score}
      feedback={attempt.ai_feedback}
      praise={attempt.ai_praise}
      nextFocus={attempt.ai_next_focus}
      cleared={attempt.total_score >= CLEAR_THRESHOLD}
      perfect={attempt.total_score >= PERFECT_THRESHOLD}
      contradiction={attempt.contradiction === true}
      xp={xpView(
        totalXp(bestByProblem.values()),
        xpGain(previousBest, attempt.total_score),
      )}
    />
  );
}
