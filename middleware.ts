import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase/cookies";
import { safeNextPath } from "@/lib/auth/redirect";
import { appBaseUrl } from "@/lib/http/origin";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // setAll が渡してくるヘッダを控えておく。
  // 未ログインで弾くときは別のレスポンス（redirect）を作り直すので、
  // ここに取っておかないとキャッシュ禁止の指示が落ちる
  const cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );

          // ライブラリが渡してくる「このレスポンスを絶対にキャッシュさせない」指示。
          //
          // **これを捨てると、セッションが他人に配られる可能性がある。**
          // ここは新しいログイン用 Cookie を発行しているレスポンスなので、
          // 途中のキャッシュ（CDN・社内プロキシなど）に保存されてしまうと、
          // 次に同じURLを開いた別の人へ、その Cookie ごと配られてしまう。
          // @supabase/ssr の型定義にも明記されている必須の処理。
          Object.entries(headers).forEach(([key, value]) => {
            cacheHeaders[key] = value;
            supabaseResponse.headers.set(key, value);
          });
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
    // ここは「ログイン画面へ送る」処理なので、行き先を乗っ取られると
    // そのまま偽ログイン画面になる。基点はこちらで決めた値を優先する
    const login = new URL("/login", appBaseUrl(request));
    // ログイン後に元の場所へ戻すため、行き先を持たせる。
    // 値はサーバー側で作っているので安全だが、受け取る側と同じ関門を通しておく
    login.searchParams.set("next", safeNextPath(request.nextUrl.pathname));

    const redirect = NextResponse.redirect(login);
    // 期限切れ判定の過程で書き換えられた Cookie を引き継ぐ。
    // 捨てると、無効になった Cookie がブラウザに残り続ける
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    // **Cookie を載せる以上、キャッシュ禁止も一緒に運ぶ。**
    // 上のブロックのコメントで「捨てるとセッションが他人に配られる」と書いている指示は、
    // 通過するときだけでなくここでも要る。Set-Cookie を持つレスポンスを
    // 途中のキャッシュに保存されると、次に同じURLを開いた別の人へ配られてしまう
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      redirect.headers.set(key, value);
    });
    return redirect;
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
