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

  // この問題に対する自分の最新の回答を取得する。
  // session クライアント経由なので RLS で自分の行だけに絞られる
  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("id, total_score, keyword_score, deep_score, ai_feedback")
    .eq("problem_id", problemId)
    // 判定保留（レート上限時に層1のみで採点した回）は合否を出さない
    .eq("is_provisional", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 未回答の問題のリザルトに直接来た場合は問題画面へ戻す
  if (!attempt) redirect(`/problems/${id}`);

  // XP は users.xp に貯めず、回答ログから毎回導出する（lib/progress/level.ts）。
  // ストリークと同じ方針で、カウンタ更新の失敗によるズレを構造的に無くしている。
  //
  // ここも session クライアントで読む。service_role にすると、
  // RLS が壊れたときに他人の行まで数えて XP が増える方向に転ぶ。
  // session なら「自分の行が読めなくなる＝XP が少なく出る」側に倒れる
  const { data: scored } = await supabase
    .from("user_attempts")
    .select("id, problem_id, total_score")
    .eq("user_id", user.id)
    .eq("is_provisional", false);

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
      cleared={attempt.total_score >= CLEAR_THRESHOLD}
      perfect={attempt.total_score >= PERFECT_THRESHOLD}
      xp={xpView(
        totalXp(bestByProblem.values()),
        xpGain(previousBest, attempt.total_score),
      )}
    />
  );
}
