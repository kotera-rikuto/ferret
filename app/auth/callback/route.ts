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
  if (!code) {
    console.error("認証コールバックに code がありません");
    return backToLogin(request, "auth_callback");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // 失敗の理由はサーバーのログにだけ残す。画面に出すと、
    // 認証基盤の内部事情を攻撃者に教えることになる
    console.error("セッションの引き換えに失敗しました:", error.message);
    return backToLogin(request, "auth_callback");
  }

  return NextResponse.redirect(new URL("/stages", appBaseUrl(request)));
}
