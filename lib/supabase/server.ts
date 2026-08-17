import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_COOKIE_OPTIONS } from "./cookies";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // 3つのクライアントで同じ属性を使う（lib/supabase/cookies.ts 参照）
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // サーバーコンポーネントの描画中は Cookie を書けないので例外になる。
            // セッションの更新は proxy が毎リクエスト行っているため、
            // ここで書けなくても実害はない。握りつぶしてよい唯一の箇所。
          }
        },
      },
    },
  );
}
