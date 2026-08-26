import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * パスワード再設定（C9）の「メールのリンクから来た」印。
 *
 * **サーバー側だけで使う。** 署名に特権キーを混ぜるので、
 * ブラウザへ渡る側（"use client" のファイル）から import しないこと。
 *
 * ## なぜ印が要るか
 *
 * `recovery` のリンクを開いた人は、その時点で**ログイン状態になる**
 * （`app/auth/callback/route.ts` のコメント）。つまり `/reset-password` を
 * 「ログインしていれば開ける画面」にすると、**いまのパスワードを知らない人でも
 * パスワードを差し替えられる画面**が1枚できる。
 *
 * これは `app/settings/PasswordForm.tsx` が塞いだ穴とまったく同じもので、
 * あちらのコメントが「ログインしたまま離席した端末を触った人が、パスワードだけ
 * 書き換えてアカウントごと持っていける」と書いている経路である。
 * せってい画面は「いまのパスワードでログインし直させる」ことで塞いでいるが、
 * **パスワードを忘れた人にはそれを求められない。** 代わりに求めるのが
 * 「メールを受け取れること」なので、その事実をこの Cookie で持ち回る。
 *
 * これで **「差し替えるには、いまのパスワードか、メールの受信のどちらかが要る」**
 * という性質が両方の入口で揃う。
 *
 * ## なぜ署名するか
 *
 * **`ferret-password-recovery=1` のような素の値では、印の意味が無い。**
 * 上で想定している相手は「ログイン中の端末を触れる人」で、その人は
 * ブラウザの開発者ツールから Cookie を自分で書ける。素の値なら1行打つだけで
 * 印が手に入り、**せってい画面が要求している「いまのパスワード」を回避できる。**
 * 署名してあれば、鍵を持たない側は印を作れない。
 *
 * 鍵は特権キー（`SUPABASE_SERVICE_ROLE_KEY`）から導出する。
 * **新しい環境変数を増やさないため**で、`tests/support/password.ts` が
 * テスト用パスワードを同じキーから導出しているのと同じ考え方
 * （特権キーを持っている人は元から何でもできるので、ここから新しく漏れるものは無い）。
 *
 * ## 属性の理由
 *
 * - `httpOnly` — 画面側の JavaScript から読む必要がない。読めなくしておけば、
 *   万一どこかにスクリプトを差し込まれても印を取り出せない
 * - `path` を `/reset-password` に絞る — この Cookie を使うのはその1枚だけ。
 *   他のリクエストに付いて回らせる理由がない
 * - `secure` は本番だけ — `lib/supabase/cookies.ts` と同じ理由（http の localhost に
 *   付けると開発時に読めなくなる）
 * - **消さずに短命にしてある。** 使い終わりに消すにはサーバー側の経路が
 *   もう1本必要になるが、残っていて増える危険は「同じブラウザで、10分のあいだに、
 *   もう一度パスワードを設定できる」だけ。そのブラウザは既にセッションを持っている
 *   （リンクを開いた本人の端末）ので、実質的に何も増えない
 * - **期限は署名の中にも入れてある。** Cookie の `maxAge` はブラウザ側の約束事で、
 *   中身を保存して後から入れ直せば無効化できる。**期限を印そのものに書いておけば、
 *   持ち出しても時間が過ぎれば通らない**
 */
export const RECOVERY_COOKIE = "ferret-password-recovery";

/**
 * 印の寿命（秒）。**リンク自体の有効期限（1時間）とは別物。**
 *
 * リンクの1時間は「メールを見るまでの猶予」、こちらは
 * 「画面が開いてから新しいパスワードを打ち終わるまでの猶予」なので、短くてよい。
 * 短くしてあるほど、リンクを開いたまま離席した端末が触られる時間が減る。
 * 期限が切れたら `/forgot-password` からもう一度送ってもらう（画面に案内がある）。
 */
export const RECOVERY_WINDOW_SECONDS = 600;

/** 再設定の画面。Cookie の `path` と行き先で同じ値を使うので定数にしてある */
export const RESET_PASSWORD_PATH = "/reset-password";

/** `NextResponse.cookies.set` に渡す属性。理由は `RECOVERY_COOKIE` のコメント */
export const RECOVERY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: RESET_PASSWORD_PATH,
  maxAge: RECOVERY_WINDOW_SECONDS,
} as const;

/**
 * 署名の鍵。**特権キーそのものは使わず、用途を混ぜた派生値にする。**
 * 万一この値が漏れても、そこから特権キーには戻れない。
 */
function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // 特権キーはこのアプリの前提（`lib/supabase/admin.ts` も採点も無いと動かない）。
    // 無い状態で素の印に落とすと、**守りが静かに外れて画面は普通に動く**ので、
    // 気づける形で止める
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が未設定です（パスワード再設定の印を署名できません）",
    );
  }
  return key;
}

function mac(expiresAt: number): string {
  return createHmac("sha256", signingKey())
    .update(`${RECOVERY_COOKIE}:${expiresAt}`)
    .digest("base64url");
}

/**
 * 印を1つ作る。中身は `期限(秒).署名`。
 *
 * 個人を特定できる値は入れない ── 誰のものかは**セッション側が持っている**（`updateUser` は
 * そのセッションのユーザーを変える）。ここに user_id を入れても判定は強くならず、
 * Cookie に増える情報が増えるだけ。
 */
export function signRecoveryMark(nowMs: number = Date.now()): string {
  const expiresAt = Math.floor(nowMs / 1000) + RECOVERY_WINDOW_SECONDS;
  return `${expiresAt}.${mac(expiresAt)}`;
}

/**
 * 印が本物で、まだ生きているか。**壊れていたら false**（例外にしない）。
 *
 * Cookie は誰でも好きな値を入れられる場所なので、
 * 「読めない値が来た」は異常ではなく想定内。判定は素通りさせず、画面は
 * 「メールのリンクからお進みください」に落とす（`app/reset-password/page.tsx`）。
 */
export function verifyRecoveryMark(
  value: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!value) return false;

  const [expiresPart, signature] = value.split(".");
  const expiresAt = Number(expiresPart);
  if (!signature || !Number.isSafeInteger(expiresAt)) return false;
  if (Math.floor(nowMs / 1000) > expiresAt) return false;

  // 期限は署名の対象に入っているので、**先に期限を見てから署名を照合しても
  // 期限だけ書き換えることはできない**（書き換えると署名が合わない）
  const expected = Buffer.from(mac(expiresAt));
  const actual = Buffer.from(signature);
  // timingSafeEqual は長さが違うと例外を投げる。長さの違いは
  // その場で不一致と分かるので、比較の前に落とす
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
