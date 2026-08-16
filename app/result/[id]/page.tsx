import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CLEAR_THRESHOLD, PERFECT_THRESHOLD } from "@/lib/ai/compose";
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
    .select("total_score, keyword_score, deep_score, ai_feedback")
    .eq("problem_id", problemId)
    // 判定保留（レート上限時に層1のみで採点した回）は合否を出さない
    .eq("is_provisional", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 未回答の問題のリザルトに直接来た場合は問題画面へ戻す
  if (!attempt) redirect(`/problems/${id}`);

  return (
    <ResultView
      problemId={problemId}
      totalScore={attempt.total_score}
      keywordScore={attempt.keyword_score}
      deepScore={attempt.deep_score}
      feedback={attempt.ai_feedback}
      cleared={attempt.total_score >= CLEAR_THRESHOLD}
      perfect={attempt.total_score >= PERFECT_THRESHOLD}
    />
  );
}
