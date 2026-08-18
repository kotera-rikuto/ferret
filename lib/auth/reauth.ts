import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * 「いま操作しているのが本人か」をパスワードの再入力で確かめる。
 *
 * **なぜサーバー側で確かめるのか。**
 * 退会は service_role キー（`lib/supabase/admin.ts`）でアカウントを消す。
 * あのクライアントは「誰が呼んでいるか」を一切見ないので、
 * 本人確認を画面側だけに置くと、API を直接叩ける人には確認が存在しないのと同じになる。
 * 画面のパスワード欄は押し間違い防止にはなるが、**守りとしては数えられない。**
 *
 * **なぜクライアントを別に作るのか。**
 * `lib/supabase/server.ts` のクライアントで `signInWithPassword` を呼ぶと、
 * 確認のためのログインがセッション Cookie を書き換えてしまう。
 * ここは確認だけしたいので、Cookie を持たない（`persistSession: false`）
 * 使い捨てのクライアントを作って、セッションには一切触れない。
 */
export type ReauthResult =
  | { ok: true }
  /** パスワードが違う。呼び出し側は 401 を返す */
  | { ok: false; reason: "invalid" }
  /** 確認そのものができなかった（通信不良・送信制限・設定不足）。呼び出し側は 503 */
  | { ok: false; reason: "unavailable" };

export async function verifyPassword(
  email: string,
  password: string,
  /**
   * セッションから読んだユーザー ID。
   * 返ってきたユーザーが本当に同じ人かをここで突き合わせる。
   * メールアドレスはセッション由来なので普通は一致するが、
   * 一致しないものを通す理由が無いので確かめる。
   */
  expectedUserId: string,
): Promise<ReauthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // 設定が無いときに「確認できたこと」にはしない
  if (!url || !key) return { ok: false, reason: "unavailable" };

  const client = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    // パスワードが違うのか、確認自体ができなかったのかを分ける。
    // 一緒にすると、正しいパスワードを入れた人が理由の分からない拒否を受ける
    const status = error.status ?? 0;
    const wrongCredentials =
      error.code === "invalid_credentials" || status === 400 || status === 401;
    return { ok: false, reason: wrongCredentials ? "invalid" : "unavailable" };
  }

  if (!data.user || data.user.id !== expectedUserId) {
    return { ok: false, reason: "invalid" };
  }

  // 確認のためのログインで発行されたトークンは、この関数を抜けた時点でどこにも残らない
  // （`persistSession: false` なので Cookie にも書かれない）。
  // ただし認証基盤側のセッションは有効期限まで残るので、**退会以外の用途で使うなら**
  // 呼び出し側で始末を考えること。退会では直後にアカウントごと消えるため問題にならない。
  return { ok: true };
}
