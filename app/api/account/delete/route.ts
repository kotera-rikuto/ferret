import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasJsonContentType, isCrossSiteRequest } from "@/lib/http/origin";
import { verifyPassword } from "@/lib/auth/reauth";
import { DELETE_CONFIRM_WORD, DELETE_TARGETS } from "@/lib/account";
import { NextRequest, NextResponse } from "next/server";

/**
 * 退会（アカウント削除）。
 *
 * **取り消せない操作を、特権キーで実行する唯一の API。**
 * service_role（`lib/supabase/admin.ts`）は「誰が呼んでいるか」を見ないので、
 * 本人確認をこの中で必ず自分で行う。ここを抜くと
 * **誰でも他人のアカウントを消せる API** になる。
 *
 * 守りの構えは `/api/score` `/api/feedback` と揃えてある（送信元・Content-Type・
 * 本文サイズ・認証）。入口ごとに緩さが違うと、緩いほうが攻撃の入口になる。
 *
 * 消す範囲は法務文書（利用規約 第12条・プライバシーポリシー 第7条）が
 * 先に約束している。対象と順番は `lib/account.ts` の `DELETE_TARGETS` を正とする。
 */

/** 確認の語とパスワードしか入らないので 4KB で足りる（/api/feedback と同じ） */
const MAX_BODY_BYTES = 4 * 1024;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json(
      { error: "このリクエストは受け付けられません。" },
      { status: 403 },
    );
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 415 });
  }

  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "送信されたデータが大きすぎます。" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    // Content-Length を付けずに小分けで送る手口があるので、読み終えた後にも確かめる
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "送信されたデータが大きすぎます。" },
        { status: 413 },
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const supabase = await createClient();

  // ログイン確認。ここだけユーザーのセッション（anon キー）で行う
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  // 確認の語。全角/半角の違いだけで弾かれないよう正規化してから比べる
  const confirm =
    typeof body.confirm === "string" ? body.confirm.normalize("NFKC").trim() : "";
  if (confirm !== DELETE_CONFIRM_WORD) {
    return NextResponse.json(
      {
        error: `確認のため「${DELETE_CONFIRM_WORD}」と入力してください。`,
        code: "confirm_mismatch",
      },
      { status: 400 },
    );
  }

  if (typeof body.password !== "string" || body.password.length === 0) {
    return NextResponse.json(
      { error: "パスワードを入力してください。", code: "password_required" },
      { status: 400 },
    );
  }

  // パスワードで確認できないアカウント（将来の OAuth 専用など）。
  // 黙って通すと本人確認の無い退会になるので、ここで止めて連絡してもらう
  if (!user.email) {
    return NextResponse.json(
      {
        error:
          "この画面からは退会の手続きができません。プライバシーポリシーの窓口までご連絡ください。",
        code: "password_unsupported",
      },
      { status: 400 },
    );
  }

  const reauth = await verifyPassword(user.email, body.password, user.id);
  if (!reauth.ok) {
    if (reauth.reason === "unavailable") {
      return NextResponse.json(
        {
          error:
            "いま確認ができませんでした。アカウントはそのままです。時間をおいてもう一度お試しください。",
          code: "reauth_unavailable",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "パスワードが違います。", code: "password_mismatch" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  // 子 → 親の順に消す。**途中で失敗したら止める。**
  //
  // 続けても外部キーで失敗するだけだが、それ以上に
  // 「一部だけ消えてログインはできる」状態を作らないことが大事。
  // 中途半端に消えた状態は、本人にも運営にも何が残っているのか分からなくなる。
  for (const target of DELETE_TARGETS) {
    const { error } = await admin
      .from(target.table)
      .delete()
      .eq(target.column, user.id);

    if (error) {
      console.error("退会の削除に失敗:", {
        table: target.table,
        user_id: user.id,
        message: error.message,
      });
      return NextResponse.json(
        {
          error:
            "退会の手続きが完了しませんでした。データはそのまま残っています。時間をおいてもう一度お試しください。",
          code: "delete_failed",
        },
        { status: 500 },
      );
    }
  }

  // 最後にログイン情報そのものを消す。
  // ここまで来て失敗すると「データは消えたがログインはできる」状態になるので、
  // 画面には残っているものが無いことを伝える
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error("退会のアカウント削除に失敗:", {
      user_id: user.id,
      message: authError.message,
    });
    return NextResponse.json(
      {
        error:
          "退会の手続きが途中で止まりました。回答の記録は削除済みです。お手数ですが、もう一度お試しください。",
        code: "auth_delete_failed",
      },
      { status: 500 },
    );
  }

  // セッション Cookie を落とす。
  //
  // `scope: "local"` にするのは、アカウントがもう存在せず、
  // 認証基盤へのログアウト要求が失敗するため。ここでやりたいのは
  // **ブラウザに残った Cookie を消すこと**だけなので、通信は要らない。
  // 消さずに返すと、無効な Cookie を持ったまま画面を開き続けることになる
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.json({ ok: true });
}
