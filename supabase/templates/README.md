# supabase/templates — 認証メールの文面

**ここにあるのは控え。実際に送られるのは Supabase 管理画面に貼った内容。**
（Authentication → Emails）

管理画面の内容は Git で追えないので、変更したら**必ずこちらも同じ内容に直すこと。**
片方だけ直すと、次の人が「文面を変えたのに反映されない」で時間を使う。

| ファイル | 管理画面のどれ | 件名 | 状態 |
|---|---|---|---|
| `confirm-signup.html` | Confirm signup | `Ferret のメールアドレス確認` | ✅ 使用中 |

**未着手の文面（既定の英語のまま）**

| 管理画面のどれ | いつ使われる | 誰が日本語化するか |
|---|---|---|
| Reset Password | パスワード再設定 | **C3**（画面がまだ無いので、いま送られることは無い） |
| Change Email Address | メールアドレス変更 | **C3**（同上） |
| Magic Link | パスワード無しのログイン | 未実装。導入を決めてから |
| Invite user | 招待 | 使う予定なし |

---

## リンクの形について（変えるときは必ず読む）

確認メールのリンクは、Supabase の既定である `{{ .ConfirmationURL }}` を**使っていない。**
代わりにこの形にしてある。

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup
```

**理由。** `{{ .ConfirmationURL }}` は、登録したブラウザに残る控え
（code verifier の Cookie）を使ってログインを成立させる仕組みに繋がっている。
つまり**パソコンで登録してスマホでメールを開くと、控えが無いのでログインできない。**
ユーザーからは理由の分からないエラー画面に見える。

`{{ .TokenHash }}` はリンクそのものに確認用の値が入っているので、
どの端末で開いてもログインできる。受け取り側は `app/auth/callback/route.ts`。

**`type` に書ける値は決め打ち。** ルート側で `signup` と `email` だけを通している。
これは「行き先を決めていない種別のリンクでログインが成立するのを防ぐ」ためで、
種別を足すときは**ルートとテストを同時に広げること**（`app/auth/callback/route.ts` のコメント）。

---

## `{{ .SiteURL }}` が指す先

管理画面の **Authentication → URL Configuration → Site URL** の値。
**この1か所を変えれば、文面を触らずに本番へ切り替わる。**

| いつ | Site URL |
|---|---|
| 開発中（いま） | `http://localhost:3000` |
| 公開後（C5） | 本番のURL |

> ⚠️ ローカルの開発サーバーが 3000 番以外で起動していると、リンクの行き先だけ 3000 番のままになる。
> 確認メールを試すときはポート番号を合わせること。

---

## config.toml から参照させるのは C5 で

`supabase/config.toml` にはテンプレートのパスを指定する仕組みがある
（`[auth.email.template.confirmation]` の `content_path`）。
**いまは使わない。**

`config.toml` の `[auth]` 以下は `supabase config push` で本番へ丸ごと上書きされ、
`site_url` がまだ `http://127.0.0.1:3000` のままだからである。
**push した瞬間、本番の確認メールのリンクが localhost を指す。** 部分適用の方法は CLI に無い。

本番URLが決まったら（C5）、`site_url` を直してから push に切り替えると、
文面もコードで管理できるようになる。
