import { createClient } from "@/lib/supabase/server";
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
 */
export async function POST(request: NextRequest) {
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

  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 にしないと、リダイレクト先へ POST のまま飛んでしまう
    status: 303,
  });
}
