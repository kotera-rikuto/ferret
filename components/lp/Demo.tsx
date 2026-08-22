import { Mascot } from "@/components/ui/Mascot";
import { CodePanel } from "@/components/lp/CodePanel";
import { Card } from "@/components/lp/parts";

/**
 * 「1問の流れ」。読む → 書く → 返ってくる、の3段を本物の画面と同じ部品で組む。
 *
 * **入力欄は置かない（`<textarea>` にしない）。** 押せそうに見えて何も起きない箱は、
 * 説明として成立していないうえ、ここで採点まで動かすなら OpenAI に原価が出る。
 * 「回答の例」と書いた紙として見せ、実際に打つのは登録した後にする。
 */

type Props = {
  code: string;
  language: string;
  /** パネル左上に出す言語名 */
  languageLabel: string;
  question: string;
  answer: string;
  answerMaxChars: number;
  praise: string;
  nextFocus: string;
  score: { label: string; value: number; max: number; accent: string }[];
  cleared: boolean;
};

/** 段の見出し。丸い番号 + ラベル */
function Step({
  no,
  label,
  children,
}: {
  no: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-full bg-brand text-[13px] font-extrabold text-white">
          {no}
        </span>
        <span className="text-[13px] font-extrabold tracking-wide">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

export async function Demo({
  code,
  language,
  languageLabel,
  question,
  answer,
  answerMaxChars,
  praise,
  nextFocus,
  score,
  cleared,
}: Props) {
  return (
    /*
     * パソコン幅は2列。**①②を左、③を右に置く。** ①だけを左に置くと、
     * 右の列のほうがずっと背が高くなり、左の下に画面1つ分の空白が残る。
     * `[&>*]:min-w-0` が無いと、列の幅が中のコードの横幅に引っ張られて画面から溢れる。
     */
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-8 [&>*]:min-w-0">
      <div className="flex flex-col gap-6">
        <Step no={1} label="コードを読む">
          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <CodePanel
              label={languageLabel}
              hint="読んでみよう"
              code={code}
              language={language}
            />
            <p className="text-[15px] leading-relaxed font-extrabold">
              {question}
            </p>
          </Card>
        </Step>

        <Step no={2} label="日本語で説明する">
          <Card className="flex flex-col gap-2 p-5 sm:p-6">
            {/* 本物の回答欄と同じ枠・同じ行間にしてある（app/problems/[id]/ProblemForm.tsx） */}
            <div className="rounded-2xl border-2 border-line bg-bg-deep px-4.5 py-4 text-[15px] leading-loose font-medium">
              {answer}
            </div>
            <span className="self-end text-[11px] font-bold text-muted">
              回答の例 ・ {answer.length} / {answerMaxChars}
            </span>
          </Card>
        </Step>
      </div>

      <Step no={3} label="読み取れたところが返ってくる">
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex gap-2.5 sm:gap-3.5">
            {score.map((s) => (
              <div
                key={s.label}
                className="flex-1 overflow-hidden rounded-2xl border-2 border-b-5 border-line bg-panel text-center"
              >
                <span
                  className={`block ${s.accent} py-1.5 text-[10px] font-extrabold tracking-widest text-white`}
                >
                  {s.label}
                </span>
                <span className="block px-1 py-3 text-[26px] font-extrabold">
                  {s.value}
                  <span className="text-[12px] font-bold text-muted">
                    {" "}
                    / {s.max}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border-2 border-line bg-bg-deep p-5">
            <h3 className="flex items-center gap-2 text-sm font-extrabold">
              <Mascot className="w-6.5 h-6.5" />
              フェレットのメモ
              {/* クリアかどうかは lib/ai/compose.ts のしきい値から出す。
                  ここに数字を書くと、閾値を変えたときに LP だけ古い判定を出し続ける */}
              {cleared ? (
                <span className="ml-auto rounded-full bg-brand-tint px-2.5 py-[3px] text-[11px] font-extrabold text-brand-deep">
                  クリア
                </span>
              ) : null}
            </h3>
            {[
              { tag: "よかったところ", text: praise },
              { tag: "つぎの一歩", text: nextFocus },
            ].map((b) => (
              <div key={b.tag} className="flex flex-col gap-1.5">
                <span className="self-start rounded-full bg-brand-tint px-2.5 py-[3px] text-[11px] font-extrabold text-brand-deep">
                  {b.tag}
                </span>
                <p className="text-sm leading-loose">{b.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </Step>
    </div>
  );
}
