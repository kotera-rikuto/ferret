/**
 * 作者への通知メール（Resend・E13）。
 *
 * アプリのコードから Resend を呼ぶのはここだけ。認証メール（確認・再設定）は
 * 今までどおり Supabase が送るので、この経路とは別物。
 *
 * 送信元は認証済みドメインのアドレス（C6 で到達確認済み）。
 * 宛先は環境変数から読む ── 公開リポジトリなので、個人のアドレスを
 * コードに直書きすると迷惑メールの標的になる。
 *
 * **失敗しても投げない。** 呼び出し側は DB への保存が済んでから呼ぶ想定で、
 * メールは「早く気づくための通知」でしかない。ここで投げると、
 * 意見は保存できているのにユーザーに失敗が見える。
 */

const FROM = "Ferret <noreply@ferretcode.com>";

export async function notifyOwner(subject: string, text: string): Promise<boolean> {
  const to = process.env.FEEDBACK_NOTIFY_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    // 未設定は落とさず記録だけ。意見は DB に残っているので失われない
    console.warn(
      "mail: FEEDBACK_NOTIFY_EMAIL / RESEND_API_KEY が未設定のため通知を送らなかった",
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    if (!res.ok) {
      console.error(`mail: Resend が ${res.status} を返した`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("mail: 通知の送信に失敗した", error);
    return false;
  }
}
