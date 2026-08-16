import { createHash } from "node:crypto";
import { normalizeAnswer } from "./compose";

/**
 * 同一回答リプレイ用のキー。
 *
 * temperature:0 は決定性を保証しない（OpenAI 側の表現も "mostly deterministic"）。
 * 「同じ回答なら同じ点数」を保証できるのは、このハッシュで過去の結果を再利用することだけ。
 * grader_version を含めるのは、採点基準を変えたら再計算させるため。
 *
 * node:crypto に依存するのでファイルを分けてある。
 * compose.ts を依存ゼロに保つと、画面（サーバーコンポーネント）から
 * しきい値だけを安全に読み込める。
 */
export function answerHash(
  problemId: number,
  graderVersion: string,
  answer: string,
): string {
  return createHash("sha256")
    .update(`${problemId} ${graderVersion} ${normalizeAnswer(answer)}`)
    .digest("hex");
}
