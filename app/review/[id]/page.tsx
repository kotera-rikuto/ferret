import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLEAR_THRESHOLD } from "@/lib/ai/compose";
import { highlightCode, PRE_CLASS } from "@/lib/code/highlight";
import { parseStoredAxes, VERDICT_LABELS } from "@/lib/review/axes";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Mascot } from "@/components/ui/Mascot";
import { IconBook, IconCheck } from "@/components/ui/icons";

/**
 * ふりかえり画面。**「なぜその点数になったのか」だけを担当する。**
 *
 * リザルト画面（/result/[id]）は点数と演出と AI の文章、こちらは採点の内訳。
 * 文章まで両方に出すと、片方だけ直したときに同じ回答について
 * 違うことを言う2画面ができる。行き来はリンクで足りる。
 *
 * URL の `id` は**問題の id**（回答の id ではない）。リザルトと同じ数え方で、
 * どちらも「その問題の最新の回答」を出す。ここだけ回答ごとの URL にすると、
 * 同じ「ふりかえる」ボタンが押した時期によって別の回を指すことになる。
 *
 * **模範解答は常に見せる**（オーナー判断・2026-08-19）。Ferret が売っているのは
 * 読める状態そのもので、答えを伏せること自体には値打ちが無いという判断。
 * ただし `rubric_items`（採点基準）は渡さない。あれが見えると、
 * 並べるべき語がそのまま分かってしまい、キーワードだけで点が取れる。
 *
 * 認証は proxy.ts の matcher（`/review/:path*`）でも止めている。
 */
export default async function ReviewPage({
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

  // 自分の最新の回答。session クライアント経由なので RLS で自分の行だけに絞られる。
  //
  // **解放状態（loadProgress）は見ない。** リザルト画面と同じ考え方で、
  // 「自分の回答が残っている＝そのステージは開いていた」ので二重に判定しない
  // （tests/integration の I-379b）。模範解答を出す画面だが、
  // 回答の有無という条件のほうが解放判定より強いので、これで漏れない。
  const { data: attempt } = await supabase
    .from("user_attempts")
    .select(
      "id, answer, total_score, keyword_score, deep_score, axes, contradiction, created_at",
    )
    .eq("user_id", user.id)
    .eq("problem_id", problemId)
    // 判定保留（レート上限時に層1のみで採点した回）には内訳が無い
    .eq("is_provisional", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // まだ解いていない問題のふりかえりに直接来た場合は問題画面へ送る。
  // **ここが模範解答の関門。** 回答が無ければこの先へは進まない
  if (!attempt) redirect(`/problems/${id}`);

  // problems は RLS ポリシーを持たないので service_role でしか読めない。
  // **rubric_items は select しない**（上のコメントの理由）
  const admin = createAdminClient();
  const { data: problem } = await admin
    .from("problems")
    .select("id, order, title, code, language, question, model_answer, reading_type")
    .eq("id", problemId)
    .single();

  if (!problem) notFound();

  // コードもこの画面に出す。**お手本の読み方はコードの中の名前を指すので、
  // コードが無いと読めない**（実データで確認・2026-08-19）。
  // 色付けはサーバー側で終わらせる。ブラウザには色の付いた HTML だけが届く
  const codeHtml = await highlightCode(problem.code, problem.language);

  const breakdown = parseStoredAxes(attempt.axes, attempt.answer ?? "");
  const cleared = attempt.total_score >= CLEAR_THRESHOLD;

  const stats = [
    { label: "スコア", value: attempt.total_score, max: 100 },
    { label: "キーワード", value: attempt.keyword_score, max: 20 },
    { label: "AI 採点", value: attempt.deep_score, max: 80 },
  ];

  /**
   * 観点の点数を足しても合計に届かない回の理由。
   *
   * 上限が働いた回では内訳の合計と実際の点数がずれる。**黙ってずれていると
   * 採点の不具合に見える**ので、言える理由はここで言う。
   * 読み違いを先に置くのは、そのときいちばん効いている上限だから。
   */
  const capNotes: string[] = [];
  if (attempt.contradiction === true) {
    capNotes.push(
      "コードの動きとは逆向きに読めている箇所がありました。そのぶん、上の内訳より点数を低く見ています。",
    );
  }
  if (breakdown?.caps.evidenceCapped) {
    capNotes.push(
      "判断の手がかりとしてそのまま引ける部分が、回答の中に見つかりませんでした。キーワードぶんの点をここで抑えています。",
    );
  }
  if (breakdown?.caps.fabricationSuspected) {
    capNotes.push(
      "引用として挙がった箇所が回答の中に見あたりませんでした。AI 採点ぶんの点をここで抑えています。",
    );
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 gap-8 px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <AppSidebar email={user.email ?? null} current="review" />

      <main className="flex w-full max-w-3xl flex-col gap-5 py-5 pb-16">
        {/* lg 未満はサイドバーが消えるので、戻り道とログアウトを最低限のヘッダーで代用する */}
        <header className="flex items-center justify-between lg:hidden">
          <Link href="/stages" className="flex items-center gap-2 text-xl font-extrabold">
            <Mascot className="w-7 h-7" />
            Ferret
          </Link>
          <LogoutButton />
        </header>

        <div className="flex flex-col gap-1.5">
          <Link
            href="/review"
            className="self-start text-xs font-extrabold text-muted hover:text-ink"
          >
            ← といた問題
          </Link>
          <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-extrabold">
            ふりかえり
            {cleared && (
              <span className="flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-extrabold text-brand-deep">
                <IconCheck size={13} />
                クリア
              </span>
            )}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
            <span className="text-xs font-extrabold tracking-widest">
              STAGE {problem.order}
            </span>
            <span className="text-ink">
              {problem.title ?? `Stage ${problem.order}`}
            </span>
            {problem.reading_type && (
              <span className="rounded-full bg-bg-deep px-2.5 py-0.5 text-[11px] font-extrabold">
                {problem.reading_type}
              </span>
            )}
          </p>
        </div>

        {/* 点数。リザルトと同じ3つを同じ並びで出す（画面をまたいで数字が動かないように） */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border-2 border-line bg-panel px-5 py-4">
          {stats.map((s) => (
            <span key={s.label} className="text-sm font-bold">
              <span className="text-muted">{s.label}</span>{" "}
              <span className="text-lg font-extrabold text-ink">{s.value}</span>
              <span className="text-xs text-locked-ink"> / {s.max}</span>
            </span>
          ))}
        </div>

        {/* 読んだコード。画面が明色でもコードは常にダーク（UXルール）。
            問題画面の CodePanel をそのまま持ってこないのは、あちらが
            「コードと実行結果を並べる」ための枠で、この画面には実行結果を出さないため。
            色付けの実体（lib/code/highlight.ts）は同じものを使っている */}
        <div className="overflow-hidden rounded-2xl border-b-5 border-code-edge bg-code-bg">
          <div className="flex items-center justify-between border-b border-white/10 px-4.5 py-2.5 text-[11px] font-bold tracking-wider text-code-muted">
            <span>{(problem.language ?? "js").toUpperCase()}</span>
            <span>このコードを読んだ</span>
          </div>
          {codeHtml ? (
            <div className="contents" dangerouslySetInnerHTML={{ __html: codeHtml }} />
          ) : (
            <pre className={`${PRE_CLASS} text-code-ink`}>
              <code>{problem.code}</code>
            </pre>
          )}
        </div>

        <section className="flex flex-col gap-2.5 rounded-2xl border-2 border-line bg-panel p-6">
          <h2 className="text-sm font-extrabold">きかれていたこと</h2>
          <p className="text-sm leading-loose whitespace-pre-line">
            {problem.question}
          </p>
        </section>

        <section className="flex flex-col gap-2.5 rounded-2xl border-2 border-line bg-panel p-6">
          <h2 className="text-sm font-extrabold">あなたの回答</h2>
          <p className="text-sm leading-loose whitespace-pre-line">
            {attempt.answer}
          </p>
        </section>

        {/* 採点の内訳。**この画面の本体。**
            観点ごとに、判定・点数・その判定のもとになった引用を並べる */}
        <section className="flex flex-col gap-4 rounded-2xl border-2 border-line bg-panel p-6">
          <h2 className="flex items-center gap-2 text-sm font-extrabold">
            <Mascot className="w-6.5 h-6.5" />
            どこを見て点をつけたか
          </h2>

          {breakdown ? (
            <>
              <ul className="flex flex-col gap-3.5">
                {breakdown.axes.map((a) => (
                  <li
                    key={a.axis}
                    className="flex flex-col gap-2 rounded-xl border-2 border-line px-4 py-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-extrabold">{a.label}</span>
                      <span className="flex items-baseline gap-2.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                            a.verdict === "full"
                              ? "bg-brand-tint text-brand-deep"
                              : a.verdict === "partial"
                                ? "bg-bg-deep text-ink"
                                : "bg-locked text-locked-ink"
                          }`}
                        >
                          {VERDICT_LABELS[a.verdict]}
                        </span>
                        <span className="text-xs font-bold text-muted">
                          <span className="text-sm font-extrabold text-ink">
                            {a.points}
                          </span>
                          {" / "}
                          {a.max}
                        </span>
                      </span>
                    </div>

                    {/* 引用は回答の中に実在するものだけが渡ってくる（lib/review/axes.ts）。
                        同じ引用が複数の観点に出ることがあるが、そのまま出す
                        ── その一文が2つの役目を果たしたという事実でもあるため
                        （オーナー判断・2026-08-19） */}
                    {a.quote && (
                      <p className="border-l-3 border-brand-soft pl-3 text-sm leading-relaxed text-muted">
                        「{a.quote}」
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {capNotes.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl bg-bg-deep px-4 py-3.5">
                  {capNotes.map((note) => (
                    <p key={note} className="text-xs font-bold leading-relaxed text-muted">
                      {note}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            // 採点の仕組みを変える前に解いた回。内訳が残っていない。
            // **4観点すべて「まだ」として描かない**（記録が無いことと、
            // 全部まだであることは意味が違う。lib/review/axes.ts）
            <p className="text-sm leading-loose text-muted">
              この回は、採点のしくみを入れかえる前に解いたものです。観点ごとの内訳は
              残っていません。もう一度挑むと、今のしくみで内訳が出ます。
            </p>
          )}
        </section>

        {/* 模範解答。**採点基準（rubric_items）は渡していない**（冒頭のコメント） */}
        <section className="flex flex-col gap-2.5 rounded-2xl border-2 border-line bg-panel p-6">
          <h2 className="flex items-center gap-2 text-sm font-extrabold">
            <IconBook size={17} className="text-brand-deep" />
            お手本の読み方
          </h2>
          <p className="text-sm leading-loose whitespace-pre-line">
            {problem.model_answer}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 text-[13px] font-extrabold">
          <Link
            href={`/problems/${problemId}`}
            className="rounded-2xl border-b-4 border-brand-deep bg-brand px-6 py-3 text-white active:translate-y-[2px] active:border-b-2"
          >
            もう一度挑む
          </Link>
          <Link href={`/result/${problemId}`} className="text-muted hover:text-ink">
            この回の結果を見る
          </Link>
          <Link href="/stages" className="text-muted hover:text-ink">
            ステージにもどる
          </Link>
        </div>
      </main>
    </div>
  );
}
