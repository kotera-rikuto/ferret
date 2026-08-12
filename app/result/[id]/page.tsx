import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// クリア判定のしきい値（採点システム仕様書 §4）
const CLEAR_SCORE = 65;

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

  // この問題に対する自分の最新の回答を取得する。
  // session クライアント経由なので RLS で自分の行だけに絞られる
  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("total_score, keyword_score, deep_score, ai_feedback")
    .eq("problem_id", Number(id))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 未回答の問題のリザルトに直接来た場合は問題画面へ戻す
  if (!attempt) redirect(`/problems/${id}`);

  const score = attempt.total_score;
  const cleared = score >= CLEAR_SCORE;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* スコア */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-zinc-400 text-sm">スコア</span>
          <span className="text-amber-400 text-9xl font-bold">{score}</span>
          <span className="text-zinc-500 text-sm">/ 100</span>
        </div>

        {/* 合否 */}
        <div
          className={`px-6 py-2 rounded-full text-sm font-semibold ${
            cleared
              ? "bg-amber-400/20 text-amber-400"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {cleared ? "クリア！" : "もう一度挑戦しよう"}
        </div>

        {/* 内訳 */}
        <div className="flex gap-6 text-xs text-zinc-500">
          <span>キーワード {attempt.keyword_score} / 20</span>
          <span>説明 {attempt.deep_score} / 80</span>
        </div>

        {/* AIフィードバック */}
        {attempt.ai_feedback && (
          <div className="bg-zinc-900 rounded-xl p-5 w-full">
            <p className="text-zinc-300 text-sm leading-relaxed">
              {attempt.ai_feedback}
            </p>
          </div>
        )}

        {/* ボタン */}
        <div className="flex flex-col gap-3 w-full">
          {/* 振り返りボタン: MVP後に追加
          <Link href={`/review/${id}`} className="...">振り返る</Link> */}
          <Link
            href={`/problems/${id}`}
            className="border border-amber-400 text-amber-400 font-semibold py-3 rounded-full hover:bg-amber-400/10 transition-colors text-center"
          >
            もう一度挑む
          </Link>
          <Link
            href="/stages"
            className="bg-amber-400 text-zinc-950 font-semibold py-3 rounded-full hover:bg-amber-300 transition-colors text-center"
          >
            ステージに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
