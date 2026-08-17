import type { CookieOptions } from "@supabase/ssr";

/**
 * セッション Cookie の共通設定。**3つのクライアントで必ず同じものを使う。**
 *
 * ブラウザ用・サーバー用・proxy 用で属性が食い違うと、同じ名前で属性違いの
 * Cookie が二重にでき、片方だけが更新されて古いセッションを読み続ける、という
 * 追いかけにくい不具合になる。だから1箇所に置いて共有する。
 *
 * `secure` を付ける理由:
 *   これが無い Cookie は、暗号化されていない http の通信にも一緒に送られる。
 *   同じ Wi-Fi にいる人や経路上の機器から、そのままログイン状態を盗める。
 *   `@supabase/ssr` の既定では付かないので、こちらで指定する。
 *
 * 開発時（http://localhost）に付けるとログインできなくなるため本番だけ。
 * 手元で `next start`（本番ビルド）を http で動かすときも同じ理由でログインできない。
 * その場合は `npm run dev` を使うこと。
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  secure: process.env.NODE_ENV === "production",
};
