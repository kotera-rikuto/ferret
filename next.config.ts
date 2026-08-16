import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy。ブラウザに「このページで何を読み込んでよいか」を宣言する。
 *
 * ここを厚くしている理由は Supabase のセッション Cookie にある。
 * `@supabase/ssr` の既定は `httpOnly: false`、つまりページ上の JavaScript から
 * 中身を読める。ブラウザ側の Supabase クライアントが読む必要があるための仕様だが、
 * 裏を返すと **XSS が1つ通った時点でリフレッシュトークンごとセッションを持っていかれる。**
 * だから「XSS を作り込まない」だけでなく「起きても持ち出せない」層を用意しておく。
 *
 * script-src に 'unsafe-inline' が残っているのは、Next.js が画面復元用のデータを
 * インラインの <script> で埋め込むため。nonce 方式にすれば外せるが、
 * 全ページが動的レンダリングに変わる副作用がある。
 * それでも外部ドメインからのスクリプト読み込みは止まるので、
 * `<script src="https://evil.example/steal.js">` 型の持ち出しは塞げている。
 */
function buildCsp(): string {
  // ブラウザ側の Supabase クライアントの接続先だけを許可する。
  // ここを 'self' だけにするとログインが動かず、* にすると
  // 「盗んだデータを外部へ送る」経路を開けたままになる
  let supabase = "https://*.supabase.co wss://*.supabase.co";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    try {
      const { host } = new URL(url);
      supabase = `https://${host} wss://${host}`;
    } catch {
      // 環境変数が壊れている場合は既定のワイルドカードのまま
    }
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // <base> を差し込んで相対URLの解決先ごと乗っ取る手口を塞ぐ
    "base-uri": ["'self'"],
    // <object> / <embed> は一切使わない
    "object-src": ["'none'"],
    // 他サイトの iframe に埋め込ませない（クリックジャッキング対策）
    "frame-ancestors": ["'none'"],
    // フォームの送信先を自サイトに固定する。偽ログインフォームの外部送信を止める
    "form-action": ["'self'"],
    // 開発サーバーは HMR で eval を使うため、開発時だけ許可する
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    // next/font がフォントをビルド時に自前へ取り込むので外部は不要
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      supabase,
      ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };

  const parts = Object.entries(directives).map(([k, v]) =>
    v.length ? `${k} ${v.join(" ")}` : k,
  );
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: buildCsp() },

  // frame-ancestors を解釈しない古いブラウザ向けの重ね掛け
  { key: "X-Frame-Options", value: "DENY" },

  // 「拡張子や中身から型を推測する」ブラウザの挙動を止める。
  // ユーザー投稿を text として返したつもりが HTML として実行される事故を防ぐ
  { key: "X-Content-Type-Options", value: "nosniff" },

  // 外部サイトへ移動するとき、URL のパスやクエリを送らない。
  // /result/12 のような遷移元がそのまま外部に渡るのを防ぐ
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // 使わない端末機能は明示的に閉じておく
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), magnetometer=()",
  },

  // 誤ってページ外に出たクロスオリジンの参照を遮断する
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },

  // 本番のみ。http でのアクセスを以後ブラウザ側で https に強制する。
  // localhost の http 開発を壊さないよう開発時は付けない
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  // `X-Powered-By: Next.js` を消す。使っている技術と世代を無料で教える必要はない
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
