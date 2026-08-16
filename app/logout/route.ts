import { createClient } from "@/lib/supabase/server";
import { appBaseUrl, isCrossSiteRequest } from "@/lib/http/origin";
import { NextResponse, type NextRequest } from "next/server";

/**
 * ログアウト。
 *
 * クライアント側で `supabase.auth.signOut()` を呼ぶ形にしないのは、
 * サーバーコンポーネントが読むのは Cookie に入ったセッションであり、
 * ブラウザ側の状態だけを消してもサーバー側が古いセッションを見続けるため。
 * サーバー経由で消せば Cookie の削除まで確実に行える。
 *
 * GET ではなく POST 限定にしているのは、`<img src="/logout">` のような
 * 仕込みで意図せずログアウトさせられるのを防ぐため。
 * POST でも別サイトのフォームからは送れてしまうので、送信元も確認する。
 */
export async function POST(request: NextRequest) {
  // 他サイトに置かれたフォームから勝手にログアウトさせられるのを防ぐ。
  // 被害は「作業中に突然ログアウトさせられる」程度だが、止められるものは止める
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("ログアウトに失敗:", error);
      return NextResponse.json(
        { error: "ログアウトに失敗しました" },
        { status: 500 },
      );
    }
  }

  // 戻り先はリクエストの Host ではなく、こちらで決めた基点から組み立てる
  // （lib/http/origin.ts の appBaseUrl 参照）
  return NextResponse.redirect(new URL("/login", appBaseUrl(request)), {
    // 303 にしないと、リダイレクト先へ POST のまま飛んでしまう
    status: 303,
  });
}
