import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service_role キーは RLS を完全にバイパスする。サーバー専用。
//
// このクライアントは「誰が呼んでいるか」を一切確認しない。
// 呼び出し側で必ず認証チェック（server.ts の auth.getUser()）を先に行うこと。
// クライアントコンポーネントから絶対に呼ばないこと。
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // オーナーは特定のユーザーの代理ではないのでセッションを持たない
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
