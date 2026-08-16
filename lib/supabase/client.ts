import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_COOKIE_OPTIONS } from "./cookies";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // サーバー側と同じ属性で書く（lib/supabase/cookies.ts 参照）。
    // ここだけ属性が違うと、同じ名前で中身の違う Cookie が二重にできる
    { cookieOptions: SUPABASE_COOKIE_OPTIONS },
  );
}
