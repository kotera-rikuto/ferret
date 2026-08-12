import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProblemForm } from "./ProblemForm";

export default async function ProblemPage({
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

  // 表示に必要なカラムだけ取得する。
  // model_answer / ai_rubric を select しないことでクライアントへの流出を防ぐ
  const admin = createAdminClient();
  const { data: problem } = await admin
    .from("problems")
    .select("id, order, title, code, question")
    .eq("id", Number(id))
    .single();

  if (!problem) notFound();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-12 gap-8">
        <h1 className="text-zinc-50 text-xl font-bold">
          {problem.title ?? `Stage ${problem.order}`}
        </h1>

        {/* コード表示（将来 Shiki に置き換え。サーバーコンポーネントなので移行可能） */}
        <div className="bg-zinc-900 rounded-xl p-6">
          <pre className="text-zinc-300 text-sm font-mono leading-relaxed overflow-x-auto">
            <code>{problem.code}</code>
          </pre>
        </div>

        {/* 設問 */}
        <p className="text-zinc-300 text-sm">{problem.question}</p>

        {/* 回答入力 */}
        <ProblemForm
          problem={{
            id: problem.id,
            title: problem.title ?? `Stage ${problem.order}`,
            code: problem.code,
            question: problem.question,
          }}
        />
      </div>
    </div>
  );
}
