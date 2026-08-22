import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLEAR_THRESHOLD } from "@/lib/ai/compose";
import { toJstDate } from "@/lib/progress/streak";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { Mascot } from "@/components/ui/Mascot";
import { IconCheck } from "@/components/ui/icons";

/**
 * といた問題の一覧。左メニューの「ふりかえり」の行き先。
 *
 * ふりかえり本体（/review/[id]）は回答1件ごとの画面なので、
 * メニューから直接開ける入口がここに要る（オーナー判断・2026-08-19）。
 *
 * **1問につき1行。出すのは最新の回答。** ふりかえり本体も最新の回答を出すので、
 * ここで最高点を出すと、一覧の数字と開いた先の数字が食い違う回ができる
 * （100点でクリアしたあと復習で20点を取った場合など。I-382 と同じ事情）。
 *
 * 認証は proxy.ts の matcher（`/review/:path*`）でも止めている。
 */
export default async function ReviewIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 回答履歴は session クライアントで読む。RLS で自分の行だけに絞られるので、
  // 仮に RLS が壊れても「自分の履歴が少なく見える」側に倒れる
  const { data: rows } = await supabase
    .from("user_attempts")
    .select("problem_id, total_score, created_at")
    .eq("user_id", user.id)
    // 判定保留（レート上限時に層1のみで採点した回）には内訳が無いので出さない
    .eq("is_provisional", false);

  // problems は RLS ポリシーを持たないので service_role でしか読めない。
  // 一覧に要るのは表示用の3列だけ（模範解答も採点基準も読まない）
  const admin = createAdminClient();
  const { data: problems } = await admin
    .from("problems")
    .select("id, order, title");

  const problemById = new Map(
    (problems ?? []).map((p) => [p.id as number, p]),
  );

  // 問題ごとに最新の1件へまとめる。
  // 並び替えは DB ではなくここで行う（同着や取得順に左右されない）
  const latest = new Map<
    number,
    { problemId: number; score: number; at: string }
  >();
  for (const r of rows ?? []) {
    // 問題ごと消えている行は出さない。開いても表示するものが無い
    if (!problemById.has(r.problem_id)) continue;
    const current = latest.get(r.problem_id);
    if (!current || r.created_at > current.at) {
      latest.set(r.problem_id, {
        problemId: r.problem_id,
        score: r.total_score,
        at: r.created_at,
      });
    }
  }

  // 最近といた順。ふりかえりたいのはたいてい直近の回
  const items = [...latest.values()].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 gap-8 px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <AppSidebar email={user.email ?? null} current="review" />

      <main className="flex w-full max-w-2xl flex-col gap-5 py-5 pb-16">
        {/* lg 未満はサイドバーが消えるので、戻り道とログアウトを最低限のヘッダーで代用する */}
        <MobileHeader current="review" />

        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-extrabold">といた問題</h1>
          <p className="text-sm font-bold text-muted">
            どこを見て点がついたのか、あとから何度でも見返せます。
          </p>
        </div>

        {items.length === 0 ? (
          // 0件を空白にしない。まだ何も無いことと、次にどこへ行けばよいかを出す
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-line bg-panel px-6 py-14">
            <Mascot mood="thinking" className="w-24" />
            <p className="text-sm font-bold text-muted">
              といた問題がここに並びます。
            </p>
            <Link
              href="/stages"
              className="rounded-2xl border-b-4 border-brand-deep bg-brand px-6 py-3 text-[13px] font-extrabold text-white active:translate-y-[2px] active:border-b-2"
            >
              ステージへ
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const problem = problemById.get(item.problemId)!;
              const cleared = item.score >= CLEAR_THRESHOLD;
              return (
                <li key={item.problemId}>
                  <Link
                    href={`/review/${item.problemId}`}
                    className="flex items-center gap-4 rounded-2xl border-2 border-b-4 border-line bg-panel px-5 py-4 hover:border-brand-soft"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-2 text-[11px] font-extrabold tracking-widest text-muted">
                        STAGE {problem.order}
                        {cleared && (
                          <span className="flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 tracking-normal text-brand-deep">
                            <IconCheck size={11} />
                            クリア
                          </span>
                        )}
                      </span>
                      <span className="truncate text-sm font-extrabold">
                        {problem.title ?? `Stage ${problem.order}`}
                      </span>
                      <span className="text-[11px] font-bold text-locked-ink">
                        {toJstDate(item.at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="text-xl font-extrabold">{item.score}</span>
                      <span className="text-xs font-bold text-muted"> / 100</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
