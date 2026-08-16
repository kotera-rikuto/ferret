/**
 * ログイン後の戻り先として、自サイト内のパスだけを通す。
 *
 * `startsWith("/")` だけでは足りない。`//evil.example` はブラウザが
 * 「プロトコル相対URL」として解釈するため外部サイトへの移動になる。
 * つまり `/login?next=//evil.example` のリンクを踏ませると、ユーザーは
 * 本物の Ferret でログインした直後に攻撃者のサイトへ運ばれる（オープンリダイレクト）。
 * 「正規サイト経由で飛んできた」という事実がそのまま偽サイトの信用になるので、
 * フィッシングの踏み台として実際によく使われる。
 *
 * `\` を弾くのは、一部のブラウザが `/\evil.example` を `//evil.example` と
 * 同じに扱うため。制御文字を弾くのは、改行を混ぜてヘッダを偽装する手口を潰すため。
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/stages",
): string {
  if (!raw || raw.length > 512) return fallback;
  // 改行・タブ・NUL などの制御文字
  if (/[\x00-\x1F\x7F]/.test(raw)) return fallback;
  if (raw === "/") return raw;

  // 先頭が「/」1つで、2文字目が「/」でも「\」でもないものだけ許可する。
  // これで `//evil.example` `/\evil.example` `https://evil.example`
  // `javascript:alert(1)` がまとめて落ちる
  if (!/^\/[^/\\]/.test(raw)) return fallback;

  return raw;
}
