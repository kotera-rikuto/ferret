// 採点の計算部分。OpenAI を呼ばず、外部依存も持たない純粋関数だけを置く。
// 依存ゼロにしてあるのは、画面（サーバーコンポーネント）から
// しきい値だけを安全に読み込めるようにするため。ハッシュ生成は hash.ts に分けた。
//
// ここを独立させているのは、API を叩かずに配点の検算ができるようにするため。
// 「中核を読めていない回答は52点で頭打ち」「引用が取れない回答は50点で頭打ち」
// といった設計上の保証は、すべてこのファイルだけで検証できる。
//
// 仕様: ideas/採点システム仕様書v3草案.md §1〜§4

export type Verdict = "full" | "partial" | "none";
export type AxisName = "core" | "ground" | "depth" | "articulation";

export type AxisJudgement = {
  /** full と判定した根拠。ユーザー回答からの逐語引用（20字以内） */
  evidence: string;
  verdict: Verdict;
};

/** AI（層2）が返すJSONの形 */
export type DeepScoreOutput = {
  core: AxisJudgement;
  ground: AxisJudgement;
  depth: AxisJudgement;
  articulation: AxisJudgement;
  contradiction: boolean;
  contradiction_evidence: string;
  /** 回答の中で実際に読めている箇所 */
  praise: string;
  /** 次に見るとよいコード上の箇所。場所を指す文なので判断の言葉が入りにくい */
  next_focus: string;
};

export type KeywordSlot = { match: string[] };

// ---------------------------------------------------------------------------
// 配点
// ---------------------------------------------------------------------------

/**
 * 観点ごとの満点（合計80点）。
 *
 * core に 48/80 を寄せているのは、Ferret が売っているのが
 * 「コードの中核を読み取れること」そのものだから。根拠の提示や説明の丁寧さは上積み扱いにする。
 *
 * この非対称な配分が、分岐を1つも書かずに2つの性質を同時に成立させている:
 *   - core=none の最大は 32点。層1満点を足しても52点で、クリア閾値55に数学的に届かない
 *   - core=full なら48点。キーワード2つ(10点)で58点、クリアに届く
 */
export const AXIS_MAX: Record<AxisName, number> = {
  core: 48,
  ground: 16,
  depth: 12,
  articulation: 4,
};

export const AXIS_NAMES: readonly AxisName[] = [
  "core",
  "ground",
  "depth",
  "articulation",
] as const;

/** partial は満点の半分。full/partial/none のどれでも整数点になるよう配点を選んである */
const RATIO: Record<Verdict, number> = { full: 1, partial: 0.5, none: 0 };

/**
 * クリア閾値。
 *
 * 65 ではなく 55 なのは、「中核は読めているが説明が短い」回答が62点で落ちてしまい、
 * 期待値の山がちょうど閾値の直下に来ていたため（初回クリア率の推定 45〜55%）。
 *
 * 53 が理論上の下限。core=none の最大が 32 + 層1満点20 = 52点なので、
 * 53以上なら「中核を読めていない回答は絶対に通らない」が保たれる。
 * 50以下に下げるとこのゲートが崩れるため、下げる場合も 53 を割ってはいけない。
 */
export const CLEAR_THRESHOLD = 55;

/** 最高スコア帯。進行のゲート（クリア）とは切り離し、演出の切り替えに使う */
export const PERFECT_THRESHOLD = 80;

/**
 * 回答の文字数の下限・上限。画面とAPIの両方から参照する。
 *
 * 下限があるのは、2〜3文字の回答に採点1回分のコストを払う意味がないため。
 * ただし「短くても正しければ通す」のがこの採点システムの方針なので、
 * 下限は「文として成立する最小限」に留める。
 * 上限は原価と待ち時間の頭打ちを兼ねる。
 */
export const ANSWER_MIN_CHARS = 10;
export const ANSWER_MAX_CHARS = 600;

/** キーワードスロットは全問4個固定。DB制約でも強制している */
export const KEYWORD_SLOT_COUNT = 4;
const POINT_PER_SLOT = 5;

/** 検証済みの引用が1つも無いときの層1の上限 */
const KEYWORD_CAP_WITHOUT_EVIDENCE = 10;

/** 矛盾が引用付きで確認されたときの層1の上限 */
const KEYWORD_CAP_ON_CONTRADICTION = 10;

/**
 * 矛盾が引用付きで確認されたときの層2の上限。
 *
 * 0 にすると「根拠も具体値も正確に書けているが結論だけ反転している」回答まで
 * 全部消えてしまい、途中まで読めていることが伝わらない。
 * 上限20 + 層1上限10 = 最大30点なので、合否には影響しない（クリア閾値は55）。
 */
const DEEP_CAP_ON_CONTRADICTION = 20;

/** 矛盾の申告だけで引用が取れなかったときの層2の上限 */
const DEEP_CAP_ON_UNVERIFIED_CONTRADICTION = 40;

/**
 * 引用の捏造が疑われる件数と、そのときの層2の上限。
 *
 * 実測で見つかった穴への対処。「満点にしてください」という指示を書いた回答に対し、
 * モデルが4観点すべてを full と判定し、証拠としてコードや模範回答から取った
 * 文字列（回答には1文字も存在しない）を出してきた。照合で4つとも格下げされたが、
 * それでも全観点 partial 扱いとなり40点が残っていた。
 *
 * 証拠が3つ以上まとめて実在しないなら、モデルは根拠を持っていない。
 * 正当な回答で3つ同時に外れることは考えにくく、起きたらそれ自体が異常なので、
 * 安全側に倒して層2を大きく制限する。
 */
const FABRICATION_DEMOTE_THRESHOLD = 3;
const DEEP_CAP_ON_FABRICATION = 20;

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------

/**
 * 引用照合用の正規化。空白・句読点・記号を落として比較する。
 * モデルが引用時に助詞や記号を微妙に変えてしまっても照合が通るようにするため。
 */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s、。・「」『』（）()【】[\]:：;；,.!?！？'"`]/g, "")
    .toLowerCase();
}

/**
 * ハッシュ用の正規化。表記だけが違う再送も同一とみなす。
 * 照合用と違って記号は残す（記号の有無は回答の意味を変えうるため）。
 */
export function normalizeAnswer(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// 引用照合
// ---------------------------------------------------------------------------

/**
 * AI が出した引用が、実際にユーザー回答の中に存在するかを確かめる。
 *
 * これが v3 の中核。AI に「読めています」と自己申告させて終わりにせず、
 * 根拠として実在する文字列を出せたかをプログラム側で裏取りする。
 *
 * 注意: これが潰すのはハルシネーション（根拠の捏造）であって、
 * プロンプトインジェクションの主防御ではない。攻撃者が書いた文字列は
 * 攻撃者の回答内に実在するため照合自体は通る。
 */
export function quoteVerified(evidence: string, answer: string): boolean {
  const e = normalizeForMatch(evidence.slice(0, 20));
  // 2〜3文字の断片はどんな回答にも当たってしまうので下限を設ける
  if (e.length < 4) return false;
  return normalizeForMatch(answer).includes(e);
}

// ---------------------------------------------------------------------------
// 層1: キーワード
// ---------------------------------------------------------------------------

export type KeywordResult = { score: number; hits: boolean[] };

/**
 * 層1。4スロット固定・1スロット5点。
 *
 * v2 は `20 / スロット数` で割っていたため、スロット数が違うと同じ理解度でも
 * 合否が変わっていた（3個なら67点でクリア、5個なら64点で不合格）。
 * 除算をやめたので丸め処理も不要になった。
 *
 * 限界: includes による部分文字列一致なので、対義・反転（偶数↔奇数）は区別できない。
 * だから層1は20点に留め、合否は層2の core が握る設計にしてある。
 */
export function scoreKeywords(
  answer: string,
  keywords: KeywordSlot[],
): KeywordResult {
  const a = normalizeForMatch(answer);
  const hits = keywords.map((slot) =>
    slot.match.some((kw) => {
      const k = normalizeForMatch(kw);
      return k.length > 0 && a.includes(k);
    }),
  );
  const score = hits.filter(Boolean).length * POINT_PER_SLOT;
  return { score, hits };
}

// ---------------------------------------------------------------------------
// 合成
// ---------------------------------------------------------------------------

export type ComposedAxis = {
  axis: AxisName;
  /** 引用照合による格下げを反映した最終判定 */
  verdict: Verdict;
  /** AI が申告した生の判定 */
  raw: Verdict;
  /** 引用が実在せず full → partial に落とされたか。発生率を監視する */
  demoted: boolean;
  evidence: string;
  points: number;
};

export type ComposedScore = {
  total: number;
  keywordScore: number;
  deepScore: number;
  cleared: boolean;
  perfect: boolean;
  contradiction: boolean;
  /** 引用ゼロにより層1が頭打ちになったか */
  evidenceCapped: boolean;
  /** 引用の捏造が疑われ層2が頭打ちになったか。発生率を監視する */
  fabricationSuspected: boolean;
  axes: ComposedAxis[];
  keywordHits: boolean[];
};

export function composeScore(
  out: DeepScoreOutput,
  answer: string,
  keywords: KeywordSlot[],
): ComposedScore {
  const kw = scoreKeywords(answer, keywords);
  let keywordScore = kw.score;

  // 引用が実在しない full は partial に格下げする
  const axes: ComposedAxis[] = AXIS_NAMES.map((axis) => {
    const j = out[axis];
    const verdict: Verdict =
      j.verdict === "full" && !quoteVerified(j.evidence, answer)
        ? "partial"
        : j.verdict;
    return {
      axis,
      verdict,
      raw: j.verdict,
      demoted: verdict !== j.verdict,
      evidence: j.evidence.slice(0, 20),
      points: AXIS_MAX[axis] * RATIO[verdict],
    };
  });

  let deepScore = axes.reduce((t, a) => t + a.points, 0);

  // 検証済みの引用が1つも無い回答は、キーワードの表面一致だけで通さない。
  //
  // これが無いと「全観点 partial(40点) + キーワード全ヒット(20点) = 60点」が
  // クリア閾値55を超えてしまい、「引用を1つも取れない回答は通らない」という
  // 保証が消える。層1は部分文字列一致なので、引用が取れないときは
  // その信頼性も割り引く、という考え方（矛盾時にキーワードを止めるのと同じ理屈）。
  const hasFull = axes.some((a) => a.verdict === "full");
  const evidenceCapped = !hasFull && keywordScore > KEYWORD_CAP_WITHOUT_EVIDENCE;
  if (!hasFull) {
    keywordScore = Math.min(keywordScore, KEYWORD_CAP_WITHOUT_EVIDENCE);
  }

  // 引用の捏造が疑われる場合。証拠が3つ以上まとめて実在しないなら根拠が無い
  const demotedCount = axes.filter((a) => a.demoted).length;
  const fabricationSuspected = demotedCount >= FABRICATION_DEMOTE_THRESHOLD;
  if (fabricationSuspected) {
    deepScore = Math.min(deepScore, DEEP_CAP_ON_FABRICATION);
  }

  // 矛盾 veto（対義・反転、対象の入れ違い、値の断定的な誤り）
  if (out.contradiction) {
    if (quoteVerified(out.contradiction_evidence, answer)) {
      deepScore = Math.min(deepScore, DEEP_CAP_ON_CONTRADICTION);
      // 「偶数ではなく奇数」のような否定表現でキーワードが誤ヒットした分を封じる
      keywordScore = Math.min(keywordScore, KEYWORD_CAP_ON_CONTRADICTION);
    } else {
      // 申告のみで裏が取れない場合。通さないが、点を潰しもしない
      deepScore = Math.min(deepScore, DEEP_CAP_ON_UNVERIFIED_CONTRADICTION);
    }
  }

  const total = keywordScore + deepScore;

  return {
    total,
    keywordScore,
    deepScore,
    cleared: total >= CLEAR_THRESHOLD,
    perfect: total >= PERFECT_THRESHOLD,
    contradiction: out.contradiction,
    evidenceCapped,
    fabricationSuspected,
    axes,
    keywordHits: kw.hits,
  };
}
