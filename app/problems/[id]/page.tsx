import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProgress } from "@/lib/progress/unlock";
import { highlightCode, PRE_CLASS } from "@/lib/code/highlight";
import { IconBook, IconChevronDown, IconClose } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";
import { MemoPad } from "./MemoPad";
import { ProblemForm } from "./ProblemForm";

/**
 * ダークなコードパネル。画面が明色でもコードは常にダーク（UXルール）。
 *
 * コードと実行結果で2回使うので、枠の見た目はここに1つだけ置く。
 * 別々に書くと片方だけに手が入って、並べたときに揃わなくなる。
 *
 * `html` が渡ってきたときは Shiki が色を付けた `<pre>` をそのまま置く。
 * **実行結果のパネルには渡さない。** エラー文やログはコードではないので、
 * 文法として色分けすると（キーワードに見える単語だけが光って）かえって読みにくい。
 */
function CodePanel({
  label,
  hint,
  body,
  html,
}: {
  label: string;
  hint: string;
  body: string;
  html?: string | null;
}) {
  return (
    <div
      data-code-panel
      className="overflow-hidden rounded-2xl border-b-5 border-code-edge bg-code-bg"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4.5 py-2.5 text-[11px] font-bold tracking-wider text-code-muted">
        <span>{label}</span>
        <span>{hint}</span>
      </div>
      {html ? (
        // 入れ物は display:contents なので、レイアウト上は
        // Shiki の <pre> がこのパネルの直下にいるのと同じ扱いになる
        <div className="contents" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className={`${PRE_CLASS} text-code-ink`}>
          <code>{body}</code>
        </pre>
      )}
    </div>
  );
}

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
    .select(
      "id, order, title, code, question, language, reading_type, context, prerequisite",
    )
    .eq("id", problemId)
    .single();

  if (!problem) notFound();

  // 色付けはここ（サーバー）で終わらせる。ブラウザには色の付いた HTML だけが届く。
  // 対応していない言語や、万一の失敗のときは null が返り、素のテキストで出る
  const codeHtml = await highlightCode(problem.code, problem.language);

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
        {/* 狭い画面ではタイトルを1行に切る（E8）。
            折り返させると、この帯だけで画面の高さの 1/7 を使ってしまい、
            さらに読解型のバッジが縦書きに潰れる（実測 375px で3行・97px）。
            タイトルは直前のマップで見えているので、ここで全文が読めなくても迷わない。
            `min-w-0` はこの列を縮められるようにするためで、
            付けないと truncate が効かない（flex の初期値が min-width:auto のため） */}
        <div className="flex min-w-0 items-center justify-center gap-2.5 text-sm font-extrabold">
          <span className="shrink-0 text-xs font-extrabold tracking-widest text-muted">
            STAGE {problem.order}
          </span>
          {/* lg 以上は truncate を丸ごと戻す。3つのプロパティの合成なので、
              whitespace だけ戻すと省略記号の指定が残る */}
          <span className="truncate lg:overflow-visible lg:text-clip lg:whitespace-normal">
            {problem.title ?? `Stage ${problem.order}`}
          </span>
          {problem.reading_type && (
            <span className="shrink-0 rounded-full bg-brand-tint px-2.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-brand-deep">
              {problem.reading_type}
            </span>
          )}
        </div>
        <span />
      </header>

      {/* lg 以上は「読む列 + メモ」の2列にする（オーナー判断 2026-08-19）。
          1088px = 余白24 + 読む列720 + すき間32 + メモ288 + 余白24 で、
          **1088 以上あれば読む列は今までと同じ 720**（コードの折り返しが変わらない）。
          1024〜1088 の間は読む列がそのぶん縮む。
          しきい値は MemoPad.tsx の SIDE_BY_SIDE と対（片方だけ動かさないこと）

          下の余白（`pb-44`）は固定フッターに隠れる分の逃げ（`ProblemForm` の footer）。
          **狭い画面ではフッターを固定していないので、逃がす必要がない**（E8）──
          そのまま残すと回答ボタンの下に 176px の空白が続く */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-9 pb-10 lg:max-w-[1088px] lg:flex-row lg:items-start lg:gap-8 lg:pb-44">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <CodePanel
            label={(problem.language ?? "js").toUpperCase()}
            hint="読んでみよう"
            body={problem.code}
            html={codeHtml}
          />

          {/* 実行結果。影響型（エラーの出力から原因の場所を特定する読み方）で使う。
              コードと同じ枠に混ぜるとエラー文がコードの一部に見えてしまうので、
              必ず別のパネルに出す。空の問題では枠ごと出さない */}
          {problem.context && (
            <CodePanel label="実行結果" hint="実行するとこう出た" body={problem.context} />
          )}

          {/* 設問。フェレットが問いかけている形にして、余白の多い画面に手がかりを置く。
              **狭い画面でも並べる（E11）。** 2026-08-21 まではフェレットを消していたが、
              問いかけの形はこの画面の手がかりそのもの（一方的な指示文に見えないための作り）で、
              消すとスマホだけ素の指示文になる。幅は 375px で実測して 48px
              （マスコット48 + すきま12 = 60px を引いても吹き出しに 267px 残る） */}
          <div className="flex items-start gap-3 sm:gap-4">
            <Mascot mood="thinking" className="w-12 shrink-0 sm:w-20" />
            <div className="relative flex-1 rounded-2xl border-2 border-line bg-panel px-5 py-4 before:absolute before:top-6 before:-left-2.5 before:size-4 before:rotate-45 before:border-b-2 before:border-l-2 before:border-line before:bg-panel">
              <p className="text-base font-extrabold leading-relaxed whitespace-pre-line">
                {problem.question}
              </p>
            </div>
          </div>

          {/* 前提知識。
              既定は閉じておく。読まなくても解ける人の画面を煩雑にしないためで、
              「不合格になってから開く」形にはしない（間違えないと助けが出ない形は
              装備獲得型の方針と合わない）。
              details なので JS なしで開閉でき、この画面はサーバーコンポーネントのまま。
              ここに答えは書かない（tasks/E4-問題データに欄を足す.md の注意） */}
          {problem.prerequisite && (
            <details className="group rounded-2xl border-2 border-line bg-panel px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-extrabold text-brand-deep [&::-webkit-details-marker]:hidden">
                <IconBook size={17} />
                ヒント
                <IconChevronDown
                  size={16}
                  className="ml-auto transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="mt-3 border-t-2 border-line pt-3 text-sm leading-loose whitespace-pre-line">
                {problem.prerequisite}
              </p>
            </details>
          )}

          {/* 回答入力（送信ボタンは画面下の固定フッター側にある） */}
          <ProblemForm
            problem={{
              id: problem.id,
              title: problem.title ?? `Stage ${problem.order}`,
              code: problem.code,
              question: problem.question,
            }}
          />
        </div>

        {/* メモ欄。**読む列の外**に置く（当初は回答欄の上・オーナー判断で 2026-08-19 に変更）。
            回答欄の上に縦に挟むと、コードを読み終えてから回答を書き始めるまでの間に
            メモの高さぶん画面が伸びて回答欄が下へ逃げる。横に置ける幅があるときは横へ、
            **足りないときは画面の上に貼り付く開閉できる帯**（E11。MemoPad.tsx の注）。
            **DOM 上は回答欄より後ろ。** ここを回答欄より前に戻すと、回答欄から Tab を
            押したときに当たるのがメモになり、E-455 で直した送信までの導線がまた1手増える
            （狭い画面で上に見えているのは `order-first` の効果で、DOM の順は動いていない）。
            **問題データは渡していない。** メモは端末の中だけで完結し、
            採点にも保存にも一切関わらない（MemoPad.tsx の冒頭コメント） */}
        <MemoPad problemId={problem.id} />
      </main>
    </div>
  );
}
