import { createClient } from "@/lib/supabase/server";
import { appBaseUrl } from "@/lib/http/origin";
import {
  RECOVERY_COOKIE,
  RECOVERY_COOKIE_OPTIONS,
  RESET_PASSWORD_PATH,
  signRecoveryMark,
} from "@/lib/auth/recovery";
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
 * メールアドレスの確認のリンク。確認できたら /stages へ送る。
 *
 * `signup` と `email` の両方を許すのは、確認メールの文面に書く `type` の値として
 * Supabase の公式例が `email`、実際に発行されるトークンの種別が `signup` で、
 * どちらが通るかは実際に送って確かめるまで確定しないため
 * （tasks/C1 の作業記録）。どちらで来ても同じ確認メールなので、扱いは同じでよい。
 */
const CONFIRM_TYPES = ["signup", "email"] as const;

/**
 * パスワード再設定のリンク（C9）。**確認できたら /reset-password へ送る。**
 *
 * これだけ行き先が違うので、種別の一覧とは別の定数にしてある。
 * 一緒にすると「通してよい種別」と「どこへ送るか」が1つの配列に混ざり、
 * 次に種別を足す人が行き先を決めずに足せてしまう。
 */
const RECOVERY_TYPE = "recovery" as const;

/**
 * メールのリンクから受け取ってよい種別。**ここに並べたものだけを通す。**
 *
 * `type` は URL のクエリなので、誰でも好きな値を書いて来られる。
 * そのまま `verifyOtp` に渡すと、まだ画面を用意していない種別
 * （`email_change` = メールアドレス変更）のリンクでもログインが成立してしまう。
 * **リンクを開いた人がログイン状態になる**という性質は種別によらず同じなので、
 * 行き先の設計が済んでいない種別は受け取らない。
 *
 * 種別を足すときは、**足すと同時に「確認後どこへ送るか」を決めること。**
 * `recovery` を足した C9 では、それが `/reset-password` と
 * 「メールを受け取れた印」の Cookie（`lib/auth/recovery.ts`）になった。
 */
const LINK_TYPES = [...CONFIRM_TYPES, RECOVERY_TYPE] as const;
type LinkType = (typeof LINK_TYPES)[number];

function isLinkType(value: string | null): value is LinkType {
  return value !== null && (LINK_TYPES as readonly string[]).includes(value);
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
  // パスワード再設定のリンクだったか。行き先が /stages ではなくなる
  let recovery = false;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash) {
    const type = searchParams.get("type");
    if (!isLinkType(type)) {
      // 値そのものはログに残さない。URL のクエリは攻撃者が自由に書ける場所なので、
      // ログを読む人の画面に相手の文字列を出さない
      console.error("認証コールバックの type が対象外です");
      return backToLogin(request, "auth_callback");
    }
    recovery = type === RECOVERY_TYPE;
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

  // パスワード再設定（C9）だけ、新しいパスワードを決める画面へ送る。
  //
  // **一緒に「メールを受け取れた印」を持たせる。** 確認が済んだ時点でこの人は
  // ログイン状態になっているので、印が無いと `/reset-password` は
  // 「ログインしていれば誰でもパスワードを差し替えられる画面」になってしまう
  // （理由は lib/auth/recovery.ts のコメント）。
  //
  // ⚠️ **ここに来るのは `token_hash` の経路だけ。** メールの文面を Supabase の既定
  // （`{{ .ConfirmationURL }}`）に戻すと、リンクは上の `code` の経路へ入り、
  // **パスワードを決める画面を通らずに /stages へ入ってしまう**（忘れた人は結局入れない）。
  // 文面は `supabase/templates/reset-password.html` の形を保つこと。
  if (recovery) {
    const toReset = NextResponse.redirect(
      new URL(RESET_PASSWORD_PATH, appBaseUrl(request)),
    );
    // 値は**署名してある**（素の "1" では、開発者ツールから1行打つだけで
    // 印が手に入る。理由は lib/auth/recovery.ts の「なぜ署名するか」）
    toReset.cookies.set(RECOVERY_COOKIE, signRecoveryMark(), RECOVERY_COOKIE_OPTIONS);
    return toReset;
  }

  return NextResponse.redirect(new URL("/stages", appBaseUrl(request)));
}
