import { createClient } from "@/lib/supabase/server";
import { appBaseUrl } from "@/lib/http/origin";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 失敗時はログイン画面へ戻す。
 *
 * 理由は**固定の合言葉**でしか渡さない。プロバイダから返ってきた文言を
 * そのまま URL に載せて画面に出すと、`?error=<好きな文章>` のリンクを配るだけで
 * 「本物の Ferret の画面に攻撃者の文章を表示させる」ことができてしまう
 * （「セキュリティ確認のためパスワードを再入力してください」など）。
 */
function backToLogin(request: NextRequest, code: string) {
  const url = new URL("/login", appBaseUrl(request));
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

/**
 * メールのリンクから受け取ってよい種別。**ここに並べたものだけを通す。**
 *
 * `type` は URL のクエリなので、誰でも好きな値を書いて来られる。
 * そのまま `verifyOtp` に渡すと、まだ画面を用意していない種別
 * （`recovery` = パスワード再設定、`email_change` = メールアドレス変更）の
 * リンクでもログインが成立してしまう。**リンクを開いた人がログイン状態になる**という
 * 性質は種別によらず同じなので、行き先の設計が済んでいない種別は受け取らない。
 *
 * `signup` と `email` の両方を許すのは、確認メールの文面に書く `type` の値として
 * Supabase の公式例が `email`、実際に発行されるトークンの種別が `signup` で、
 * どちらが通るかは実際に送って確かめるまで確定しないため
 * （tasks/C1 の作業記録）。どちらで来ても同じ確認メールなので、扱いは同じでよい。
 *
 * C3（パスワード変更・メールアドレス変更）で種別を足すときは、
 * **足すと同時に「確認後どこへ送るか」を決めること。** いまは一律 /stages へ送っている。
 */
const CONFIRM_TYPES = ["signup", "email"] as const;
type ConfirmType = (typeof CONFIRM_TYPES)[number];

function isConfirmType(value: string | null): value is ConfirmType {
  return value !== null && (CONFIRM_TYPES as readonly string[]).includes(value);
}

/**
 * 認証の受け口。**2つの経路が入ってくる。**
 *
 * ① `code`       — ブラウザ側で始めた認証の続き（OAuth と、PKCE 形式のメールリンク）。
 *                  引き換えには**登録したブラウザに残る控え**（code verifier の Cookie）が要る。
 * ② `token_hash` — メールのリンクに埋め込まれた確認用の値。控えが要らないので、
 *                  **登録した端末と別の端末でメールを開いてもログインできる。**
 *
 * ②を足したのは、①だけだと「パソコンで登録してスマホでメールを開く」が
 * 成立しないため。控えが無いので引き換えが失敗し、ユーザーには理由の分からない
 * エラー画面が出る。確認メールの文面は ②を使う形にしてある（supabase/templates/）。
 * ①は OAuth（Google / GitHub）でこれからも使うので消さない。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Supabase / OAuth プロバイダは失敗時にここへエラーを付けて戻してくる。
  // 以前はこれを見ずに /stages へ流していたため、proxy に弾かれて
  // ログイン画面に戻るだけになり、何が起きたのか誰にも分からなかった
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    console.error("認証コールバックがエラーを返しました:", providerError);
    return backToLogin(request, "auth_callback");
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");

  const supabase = await createClient();

  // 同時に来ることはない。両方あるときは既存の経路（code）を優先する
  let error: { message: string } | null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash) {
    const type = searchParams.get("type");
    if (!isConfirmType(type)) {
      // 値そのものはログに残さない。URL のクエリは攻撃者が自由に書ける場所なので、
      // ログを読む人の画面に相手の文字列を出さない
      console.error("認証コールバックの type が対象外です");
      return backToLogin(request, "auth_callback");
    }
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    console.error("認証コールバックに code も token_hash もありません");
    return backToLogin(request, "auth_callback");
  }

  if (error) {
    // 失敗の理由はサーバーのログにだけ残す。画面に出すと、
    // 認証基盤の内部事情を攻撃者に教えることになる。
    // ここには「リンクの期限切れ」「一度使ったリンクの再利用」も入る
    console.error("セッションの引き換えに失敗しました:", error.message);
    return backToLogin(request, "auth_callback");
  }

  return NextResponse.redirect(new URL("/stages", appBaseUrl(request)));
}
