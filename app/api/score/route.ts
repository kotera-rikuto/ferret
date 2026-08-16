import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreAnswer } from "@/lib/ai/scorer";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { problem_id, answer } = await request.json();

  const supabase = await createClient();

  // ログイン確認。ここだけユーザーのセッション（anon キー）で行う。
  // 以降のDB操作は admin（service_role）なので RLS が効かない。
  // このチェックを外すと誰でも他人のスコアを書き込めるAPIになる
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // DBから問題データを取得。
  // model_answer / ai_rubric を含むため anon では読ませない
  const { data: problem } = await admin
    .from("problems")
    .select("*")
    .eq("id", problem_id)
    .single();

  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  // 採点
  const result = await scoreAnswer(answer, {
    code: problem.code,
    question: problem.question,
    model_answer: problem.model_answer,
    keywords: problem.keywords,
    ai_rubric: problem.ai_rubric,
  });

  // 結果をDBに保存。
  // ユーザー自身に書かせるとスコアを偽装できるため admin で書く
  const { error: insertError } = await admin.from("user_attempts").insert({
    user_id: user.id,
    problem_id: problem.id,
    answer,
    keyword_score: result.keyword_score,
    deep_score: result.deep_score,
    total_score: result.total,
    ai_feedback: result.ai_feedback,
    scoring_method: result.scoring_method,
  });

  // 保存に失敗したらスコアを返さない。
  // 返してしまうと採点は成功したように見えるのに履歴が残らず、
  // 症状がリザルト画面やステージ画面に出て原因の切り分けが困難になる
  if (insertError) {
    console.error("採点結果の保存に失敗:", insertError);
    return NextResponse.json(
      { error: "採点結果の保存に失敗しました" },
      { status: 500 },
    );
  }

  return NextResponse.json({ score: result.total });
}
