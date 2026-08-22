import type { NextRequest } from "next/server";

/**
 * 別サイトから送りつけられたリクエストかを判定する（CSRF 対策）。
 *
 * 攻撃の形はこう。攻撃者のページに「Ferret へ POST するフォーム」を仕込み、
 * ログイン中のユーザーにそのページを開かせる。ブラウザは Ferret のドメイン宛の
 * リクエストに Ferret の Cookie を自動で付けるので、ユーザー本人が操作したのと
 * 区別がつかないまま処理が通ってしまう。
 *
 * Supabase のセッション Cookie は SameSite=Lax なので、別サイトからの POST には
 * そもそも Cookie が付かず、認証チェックで 401 になる。ここはその上に重ねる2枚目で、
 * Cookie 設定が将来変わった場合や、「同一サイト」扱いになる別サブドメイン
 * （例: 攻撃者が乗っ取った blog.ferret.io）からの送信を止めるために置く。
 *
 * Origin ヘッダが無いリクエスト（curl・サーバー間通信・動作確認スクリプト）は通す。
 * ブラウザは POST に必ず Origin を付けるので「無い＝ブラウザ経由ではない」であり、
 * 他人の Cookie を勝手に使わせる CSRF は成立しないため。
 */
export function isCrossSiteRequest(request: NextRequest): boolean {
  // 近年のブラウザが自動で付ける送信元の種別。
  //   same-origin = 自サイト / none = アドレス直打ち等 / same-site = 別サブドメイン
  //   cross-site  = 完全に別のサイト
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true; // 壊れた Origin は通さない
  }
}

/**
 * リダイレクト先を組み立てるときの基点。
 *
 * `request.url` のホスト名は、リクエストの Host ヘッダから作られる。つまり
 * 「どこへ戻すか」を送信者側の申告に委ねている状態で、経路上でヘッダを差し替えられる
 * 構成だと、認証直後やログアウト直後に別サイトへ飛ばせてしまう。
 * `NEXT_PUBLIC_APP_URL`（Vercel の環境変数）を設定しておけばこちらが優先され、
 * 戻り先が自分たちで決めた1つに固定される。未設定なら従来どおりの挙動。
 */
export function appBaseUrl(request: NextRequest): string {
  return configuredAppOrigin() ?? new URL(request.url).origin;
}

/**
 * 「自分のサイトのURLはこれ」と設定してある値（`https://ferretcode.com`）。
 * **設定されていない・壊れているなら `null`。**
 *
 * `appBaseUrl` はリクエスト側へ落とせるが、リクエストの無い場所
 * （`app/robots.ts` / `app/sitemap.ts` / `app/layout.tsx` のメタ情報）は落とし先が無く、
 * 「分からない」を分からないまま扱う必要がある。**その判断の出どころをここ1か所にしてある。**
 *
 * ⚠️ **`NEXT_PUBLIC_APP_URL` は Vercel の Production にしか入っていない**（C5 の判断）。
 * プレビュー配信とローカルでは常に `null` が返る前提で呼ぶこと。
 * 使う側の扱いは `lib/seo/site.ts` を見る。
 */
export function configuredAppOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    // 設定が壊れている（URL として読めない）。値を信じるより「無い」ほうが安全
    return null;
  }
}

/**
 * JSON API に本当に JSON が送られてきたかを確認する。
 *
 * `request.json()` は Content-Type を見ずに本文を解析するため、これが無いと
 * HTML の `<form enctype="text/plain">` から JSON らしき本文を組み立てて
 * 送りつけられる。フォーム送信は CORS の事前確認（preflight）が不要なので、
 * 「JSON API だからブラウザが守ってくれる」は成り立たない。
 */
export function hasJsonContentType(request: NextRequest): boolean {
  const type = request.headers.get("content-type");
  if (!type) return false;
  return type.split(";")[0].trim().toLowerCase() === "application/json";
}
