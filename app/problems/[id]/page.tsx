import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProgress } from "@/lib/progress/unlock";
import { IconClose } from "@/components/ui/icons";
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

  // URL の数字はユーザーが自由に書き換えられる。整数以外はここで落とす
  const problemId = Number(id);
  if (!Number.isInteger(problemId) || problemId <= 0) notFound();

  const admin = createAdminClient();

  // まだ開いていないステージは、URL を直接打っても開かせない。
  // マップ上の鍵アイコンはブラウザ側の見た目でしかなく、
  // アドレスバーに /problems/42 と打てば素通りできてしまうため。
  // 判定は採点API と同じ関数を使う（片方だけ直してズレるのを防ぐ）
  const progress = await loadProgress(admin, supabase, user.id);
  if (!progress.unlockedIds.has(problemId)) notFound();

  // 表示に必要なカラムだけ取得する。
  // model_answer / rubric_items を select しないことでクライアントへの流出を防ぐ
  const { data: problem } = await admin
    .from("problems")
    .select("id, order, title, code, question, language, reading_type")
    .eq("id", problemId)
    .single();

  if (!problem) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      {/* 上部バー: × は「中断してマップへ」。クイズ系の定石に合わせて戻る矢印ではなく × */}
      <header className="sticky top-0 z-20 grid grid-cols-[56px_1fr_56px] items-center border-b-2 border-line bg-bg px-5 py-3.5">
        <Link
          href="/stages"
          aria-label="中断してマップへ"
          className="grid size-10 place-items-center rounded-xl text-muted hover:bg-brand-tint hover:text-ink"
        >
          <IconClose size={22} />
        </Link>
        <div className="flex items-center justify-center gap-2.5 text-sm font-extrabold">
          <span className="text-xs font-extrabold tracking-widest text-muted">
            STAGE {problem.order}
          </span>
          {problem.title ?? `Stage ${problem.order}`}
          {problem.reading_type && (
            <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[11px] font-extrabold text-brand-deep">
              {problem.reading_type}
            </span>
          )}
        </div>
        <span />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-9 pb-44">
        {/* コードパネル。画面は明色でも、コードは常にダーク（UXルール）。
            Shiki によるハイライトは未導入で、当面は素のテキスト（design/移植残タスク.md） */}
        <div className="overflow-hidden rounded-2xl border-b-5 border-code-edge bg-code-bg">
          <div className="flex items-center justify-between border-b border-white/10 px-4.5 py-2.5 text-[11px] font-bold tracking-wider text-code-muted">
            <span>{(problem.language ?? "js").toUpperCase()}</span>
            <span>読んでみよう</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm leading-loose text-code-ink">
            <code>{problem.code}</code>
          </pre>
        </div>

        {/* 設問 */}
        <p className="text-base font-extrabold leading-relaxed whitespace-pre-line">
          {problem.question}
        </p>

        {/* 回答入力（送信ボタンは画面下の固定フッター側にある） */}
        <ProblemForm
          problem={{
            id: problem.id,
            title: problem.title ?? `Stage ${problem.order}`,
            code: problem.code,
            question: problem.question,
          }}
        />
      </main>
    </div>
  );
}
