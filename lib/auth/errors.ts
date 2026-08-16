/**
 * Supabase Auth のエラーを日本語にする。
 *
 * 「登録に失敗しました」だけだと、パスワードが短いのか・既に登録済みなのか・
 * メール確認が済んでいないのかが分からず、原因の切り分けができない。
 * 実際に何が起きたかを伝える。
 */
export function authErrorMessage(
  error: { message?: string; code?: string; status?: number } | null,
  fallback: string,
): string {
  if (!error) return fallback;

  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "メールアドレスの確認がまだ済んでいません。届いている確認メールのリンクを開いてください。";
  }
  if (code === "user_already_exists" || msg.includes("already registered")) {
    return "このメールアドレスは登録済みです。ログイン画面からお進みください。";
  }
  if (code === "weak_password" || msg.includes("password should be at least")) {
    return "パスワードをもう少し長くしてください（6文字以上）。";
  }
  if (code === "validation_failed" || msg.includes("unable to validate email")) {
    return "メールアドレスの形式をご確認ください。";
  }
  if (code === "over_email_send_rate_limit" || msg.includes("rate limit")) {
    return "送信の間隔をあけて、しばらくしてからもう一度お試しください。";
  }
  if (code === "provider_disabled" || msg.includes("provider is not enabled")) {
    return "このログイン方法はまだ準備中です。メールアドレスでお進みください。";
  }
  if (error.status === 0 || msg.includes("failed to fetch")) {
    return "通信が届きませんでした。接続を確認してもう一度お試しください。";
  }

  // 想定外は原文も添える。開発中に原因を追えなくなるほうが困る。
  //
  // ただし本番では出さない。ここに来る文言は認証基盤が生成した英語のメッセージで、
  // 使っているサービス・内部の状態・設定ミスの内容までそのまま画面に出る。
  // 攻撃者にとっては「どこを押せば何が壊れるか」の手がかりになるし、
  // ユーザーから見ても意味の分からない英文が出るだけで得がない
  if (process.env.NODE_ENV === "production") return fallback;
  return error.message ? `${fallback}（${error.message}）` : fallback;
}

/**
 * OAuth プロバイダの有効・無効。
 * Supabase 側で設定するまで押しても失敗するので、UI 側で止めておく。
 * 設定が済んだら true にする。
 */
export const OAUTH_ENABLED = {
  google: false,
  github: false,
} as const;
