import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() はセッションの有効性をサーバーに問い合わせる。
  // getSession() だと Cookie の中身を信じるだけなので、ここでは使わない
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", request.url);
    // ログイン後に元の場所へ戻すため、行き先を持たせる
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return supabaseResponse;
}

export const config = {
  // 認証が要る画面すべて。
  // 各ページにも自前のガード（redirect("/login")）があるが、
  // ここで止めれば DB へのクエリが走る前に弾ける。
  // 追加でページを作ったらここにも足すこと
  matcher: ["/stages/:path*", "/problems/:path*", "/result/:path*", "/review/:path*"],
};
