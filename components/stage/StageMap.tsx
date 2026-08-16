"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chapterOf } from "@/lib/stages/chapters";
import {
  IconBook,
  IconCheck,
  IconChevronDown,
  IconLock,
  IconPaw,
} from "@/components/ui/icons";
import { Mascot } from "@/components/ui/Mascot";

export type Stage = {
  id: number;
  order: number;
  title: string;
  status: "cleared" | "current" | "locked";
};

const ROW_H = 145;
const PAD_TOP = 76;
/** 蛇行の横位置（%）。order で引くので、途中に問題を差し込んでも並びが崩れない */
const XS = [50, 28, 52, 72, 48, 28, 52, 72, 48, 28];
const xOf = (order: number) => XS[(order - 1) % XS.length];

type ChapterGroup = {
  no: number | null;
  title: string;
  /** order 昇順 */
  stages: Stage[];
};

/** order 昇順の stages を、連続する章ごとの塊にまとめる */
function groupByChapter(stages: Stage[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const s of stages) {
    const ch = chapterOf(s.order);
    const no = ch?.no ?? null;
    const last = groups[groups.length - 1];
    if (last && last.no === no) {
      last.stages.push(s);
    } else {
      groups.push({ no, title: ch?.title ?? "とくべつステージ", stages: [s] });
    }
  }
  return groups;
}

export function StageMap({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Stage | null>(null);

  const groups = groupByChapter(stages);
  // 下から上に登るマップなので、後の章ほど上に描く
  const displayGroups = [...groups].reverse();

  const current = stages.find((s) => s.status === "current") ?? null;
  const currentChapter = current ? chapterOf(current.order) : null;
  const [banner, setBanner] = useState<{ no: number | null; title: string }>({
    no: currentChapter?.no ?? groups[0]?.no ?? null,
    title: currentChapter?.title ?? groups[0]?.title ?? "",
  });

  const [fab, setFab] = useState<"hidden" | "up" | "down">("hidden");

  const bannerRef = useRef<HTMLDivElement>(null);
  const currentNodeRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    // 起動時は現在地が画面内に来るようにする（UI概要の要件）
    currentNodeRef.current?.scrollIntoView({ block: "center" });

    function sync() {
      // 章バナー: バナーのすぐ下に重なっている章を表示する
      const bannerRect = bannerRef.current?.getBoundingClientRect();
      if (bannerRect) {
        const y = bannerRect.bottom + 20;
        for (const sec of sectionRefs.current) {
          if (!sec) continue;
          const r = sec.getBoundingClientRect();
          if (r.top <= y && r.bottom >= y) {
            setBanner({
              no: sec.dataset.chapterNo ? Number(sec.dataset.chapterNo) : null,
              title: sec.dataset.chapterTitle ?? "",
            });
            break;
          }
        }
      }

      // 現在地が画面から出ているときだけ「現在地へ」を出す
      const node = currentNodeRef.current;
      if (node) {
        const r = node.getBoundingClientRect();
        if (r.bottom < 90) setFab("up");
        else if (r.top > window.innerHeight - 40) setFab("down");
        else setFab("hidden");
      }
    }

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  function handleStart() {
    if (!selected) return;
    router.push(`/problems/${selected.id}`);
  }

  return (
    <>
      {/* 章バナー: スクロールに追従して現在見えている章を示す */}
      <div
        ref={bannerRef}
        className="sticky top-4 z-20 flex items-center justify-between rounded-2xl border-b-5 border-brand-deep bg-gradient-to-br from-brand to-brand-soft px-6 py-4 text-white shadow-[0_8px_22px_rgba(196,112,0,0.18)]"
      >
        <div>
          {banner.no !== null && (
            <span className="block text-xs font-extrabold tracking-widest opacity-90">
              第{banner.no}章
            </span>
          )}
          <span className="text-lg font-extrabold">{banner.title}</span>
        </div>
        <IconBook size={26} />
      </div>

      <div className="relative">
        {displayGroups.map((group, gi) => {
          // 章の中も上ほど先のステージ（order 降順）
          const rows = [...group.stages].sort((a, b) => b.order - a.order);
          const height = rows.length * ROW_H + PAD_TOP;

          return (
            <div key={group.no ?? `extra-${gi}`}>
              <section
                ref={(el) => {
                  sectionRefs.current[gi] = el;
                }}
                data-chapter-no={group.no ?? ""}
                data-chapter-title={group.title}
                className="relative"
                style={{ height }}
              >
                {/* 道。クリアして通った区間は実線、その先は点線 */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                  {rows.map((s, i) => {
                    const next = rows[i + 1];
                    if (!next) return null;
                    const done = next.status === "cleared";
                    return (
                      <line
                        key={s.id}
                        x1={`${xOf(next.order)}%`}
                        y1={PAD_TOP + (i + 1) * ROW_H}
                        x2={`${xOf(s.order)}%`}
                        y2={PAD_TOP + i * ROW_H + 38}
                        strokeWidth={6}
                        strokeLinecap="round"
                        strokeDasharray={done ? undefined : "1 15"}
                        className={done ? "stroke-path-done" : "stroke-path-todo"}
                      />
                    );
                  })}
                </svg>

                {rows.map((s, i) => {
                  const isCurrent = s.status === "current";
                  const isOpen = selected?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      ref={isCurrent ? currentNodeRef : undefined}
                      className={`absolute flex w-36 -translate-x-1/2 flex-col items-center gap-2 ${
                        isOpen ? "z-40" : ""
                      }`}
                      style={{
                        top: PAD_TOP + i * ROW_H - (isCurrent ? 8 : 0),
                        left: `${xOf(s.order)}%`,
                      }}
                    >
                      {isCurrent && (
                        <>
                          <span className="absolute -top-12 animate-bob rounded-full border-2 border-brand bg-panel px-4 py-1.5 text-sm font-extrabold text-brand whitespace-nowrap">
                            スタート
                          </span>
                          <Mascot
                            className={`pointer-events-none absolute -top-1 w-20 drop-shadow-[0_4px_6px_rgba(74,59,40,0.2)] ${
                              xOf(s.order) > 50 ? "right-26" : "left-26"
                            }`}
                          />
                        </>
                      )}

                      <button
                        onClick={() => s.status !== "locked" && setSelected(s)}
                        disabled={s.status === "locked"}
                        className={`grid place-items-center rounded-full transition-transform ${
                          s.status === "cleared"
                            ? "size-19 border-b-6 border-[#d98a06] bg-brand-soft text-white cursor-pointer active:translate-y-[3px]"
                            : isCurrent
                              ? "relative size-23 border-5 border-b-10 border-brand bg-panel text-brand cursor-pointer active:translate-y-[3px]"
                              : "size-19 border-b-6 border-locked-edge bg-locked text-locked-ink cursor-not-allowed"
                        }`}
                      >
                        {isCurrent && (
                          <span className="pointer-events-none absolute -inset-1.5 animate-halo rounded-full border-4 border-brand" />
                        )}
                        {s.status === "cleared" && <IconCheck size={34} />}
                        {isCurrent && <IconPaw size={38} />}
                        {s.status === "locked" && <IconLock size={26} />}
                      </button>

                      <span className="text-center leading-snug">
                        <span className="block text-[11px] font-extrabold tracking-widest text-muted">
                          STAGE {s.order}
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            s.status === "locked" ? "text-locked-ink" : ""
                          }`}
                        >
                          {s.title}
                        </span>
                      </span>

                      {/* ノードにアンカーしたポップオーバー。外側タップで閉じる */}
                      {isOpen && (
                        <div className="absolute bottom-full left-1/2 mb-3 w-66 -translate-x-1/2 rounded-2xl border-2 border-line bg-panel p-5 shadow-[0_12px_32px_rgba(74,59,40,0.16)]">
                          <h2 className="text-base font-extrabold">{s.title}</h2>
                          <p className="mt-1 mb-3.5 text-xs font-bold text-muted">
                            STAGE {s.order}
                          </p>
                          <button
                            onClick={handleStart}
                            className={`w-full rounded-2xl py-3 text-[15px] font-extrabold tracking-wide active:translate-y-[3px] active:border-b-2 ${
                              s.status === "cleared"
                                ? "border-2 border-line border-b-5 bg-panel text-muted"
                                : "border-b-5 border-brand-deep bg-brand text-white"
                            }`}
                          >
                            {s.status === "cleared" ? "もう一度読む" : "挑む"}
                          </button>
                          <span className="absolute -bottom-2 left-1/2 -ml-1.75 size-3.5 rotate-45 border-r-2 border-b-2 border-line bg-panel" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              {gi < displayGroups.length - 1 && (
                <div className="mx-10 my-9 flex items-center gap-3.5 text-[13px] font-extrabold tracking-widest text-muted before:h-0.5 before:flex-1 before:rounded-full before:bg-line after:h-0.5 after:flex-1 after:rounded-full after:bg-line">
                  {group.no !== null ? `ここから 第${group.no}章` : `ここから ${group.title}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ポップオーバーの外側タップ判定 */}
      {selected && (
        <div className="fixed inset-0 z-30" onClick={() => setSelected(null)} />
      )}

      {/* 現在地へ戻る。左右対称レイアウトなので画面中央 = マップ列の中央 */}
      {fab !== "hidden" && (
        <button
          onClick={() =>
            currentNodeRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
          className="fixed bottom-7 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-b-5 border-brand bg-panel px-5.5 py-3 text-sm font-extrabold text-brand shadow-[0_8px_24px_rgba(196,112,0,0.22)] active:translate-y-[3px] active:border-b-2"
        >
          <IconChevronDown size={16} className={fab === "up" ? "rotate-180" : ""} />
          現在地へ
        </button>
      )}
    </>
  );
}
