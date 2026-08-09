# DB仕様書 v2

- **日付:** 2026-08-10
- **DB:** Supabase (PostgreSQL)
- **対象:** Ferret MVP

> **v2 の変更点:** 採点システムが Embedding 層を廃止し2層構成になったことに伴い、`model_answer_embedding` を「未使用・保留」に変更。`scoring_method` の取りうる値を更新。`public.users` 自動生成トリガーを追記。詳細は `採点システム仕様書.md` §7 を参照。

---

## テーブル一覧

| テーブル | 役割 |
|---|---|
| `users` | ユーザー情報・プラン・XP |
| `problems` | 問題マスターデータ |
| `user_attempts` | 回答ログ・採点結果 |
| `subscriptions` | Stripe サブスクリプション情報 |

---

## users

Supabase Auth と 1:1 で紐付く。Auth 側にメアド・パスワードが入るので、ここには追加情報だけ持つ。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID | Supabase Auth の user.id と同じ値（主キー） |
| `plan` | TEXT | `free` / `pro` / `pro_plus` / `pack` |
| `xp` | INTEGER | 累計経験値（デフォルト 0）。レベルシステムは将来実装 |
| `created_at` | TIMESTAMPTZ | 登録日時 |

### 行の自動生成トリガー（必須・設置済み）

Supabase Auth のサインアップが行を作るのは `auth.users` のみで、この `public.users` には**何も起きない**。一方 `user_attempts.user_id` はこのテーブルへの外部キーを持つため、行が無いと採点結果の保存が外部キー違反で失敗する。

そのため `auth.users` への insert をトリガーに `public.users` の行を自動生成する。2026-08-09 設置済み。

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, plan, xp)
  values (new.id, 'free', 0)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**アプリ側ではなく DB 側に置く理由:** ユーザーが生まれる経路はメール登録・Google OAuth・GitHub OAuth・Magic Link と複数あり、今後も増える。アプリ側に書くと経路追加のたびに書き漏らすが、`auth.users` への insert は全経路で必ず発生するため確実に1回通る。

設置確認:

```sql
select
  (select count(*) from pg_proc  where proname = 'handle_new_user')       as 関数,
  (select count(*) from pg_trigger where tgname = 'on_auth_user_created') as トリガー;
-- 両方 1 なら設置済み
```

---

## problems

問題マスター。問題の追加・編集は Supabase ダッシュボードから直接行う（MVP では管理画面なし）。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | INTEGER | 永続的な識別子。URL・リレーションに使用。変えない |
| `order` | INTEGER | 表示順。問題を差し込む際はここを更新する |
| `language` | TEXT | `js` / `ts` / `ruby` / `python` |
| `code` | TEXT | 問題として表示するコードスニペット |
| `question` | TEXT | 設問文 |
| `model_answer` | TEXT | 模範回答テキスト |
| `model_answer_embedding` | VECTOR(1536) | **【v2 で未使用】** 採点では参照しない。将来の回答傾向分析用に保留（NULL のままでよい） |
| `keywords` | JSONB | キーワードスロット配列（採点層1で使用） |
| `ai_rubric` | TEXT | GPT-4o mini に渡す採点基準テキスト |
| `difficulty` | INTEGER | 難易度 1〜5（1が最易） |
| `created_at` | TIMESTAMPTZ | 作成日時 |

### keywords カラムの構造

```json
[
  { "match": ["初期化", "initialize", "0にセット", "ゼロ代入"] },
  { "match": ["ループ", "繰り返し", "for文", "while"] },
  { "match": ["戻り値", "return", "返す"] }
]
```

スロット数は問題ごとに自由。1スロットの配点 = `20 / スロット数` で自動計算。

### model_answer_embedding の扱い（v2 で変更）

**v1 では採点の中核だったが、v2 で採点経路から外した。**問題を登録する際に埋める必要はなく、NULL のままでよい。事前計算スクリプトも不要。

理由は `採点システム仕様書.md` §7 を参照（要約: Embedding は「話題の近さ」しか測れず、「偶数」と「奇数」のような致命的な誤答を高類似度と判定してしまうため）。

カラムと pgvector 拡張は**削除せず保留する。** 将来、ユーザー回答をベクトル化してつまずき傾向を分析する用途で再利用する可能性があるため。

### VECTOR 型の有効化（設定済み）

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Supabase では SQL エディターから一度実行するだけで使えるようになる。2026-08-09 時点で有効化済み。

---

## user_attempts

ユーザーの回答ログ。採点結果もここに保存する。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID | 主キー |
| `user_id` | UUID | `users.id` への参照 |
| `problem_id` | INTEGER | `problems.id` への参照 |
| `answer` | TEXT | ユーザーが入力した回答 |
| `keyword_score` | INTEGER | 層1（正規表現）スコア 0〜20 |
| `deep_score` | INTEGER | 層2（AI採点）スコア 0〜80 |
| `total_score` | INTEGER | 合計スコア 0〜100 |
| `ai_feedback` | TEXT | AI が生成したフィードバック文（リザルト画面に表示）。**必ず保存すること** |
| `scoring_method` | TEXT | `ai`（通常）/ `keyword_only`（レート制限超過時などに層1のみで判定した場合・未実装） |
| `created_at` | TIMESTAMPTZ | 回答日時（レート制限の集計に使用） |

### クリア判定のクエリ

```sql
-- あるユーザーが問題をクリアしているか（最高スコアで判定）
SELECT MAX(total_score) >= 65
FROM user_attempts
WHERE user_id = $1 AND problem_id = $2;
```

一度クリアしたら再挑戦で低いスコアを出してもクリア状態は維持される。

### レート制限のクエリ（Free プラン）

```sql
-- 今日（JST）の回答数
SELECT COUNT(*)
FROM user_attempts
WHERE user_id = $1
AND created_at >= (NOW() AT TIME ZONE 'Asia/Tokyo')::date;
```

別テーブル不要。このカウントが 3 以上なら回答を受け付けない。

---

## subscriptions

Stripe のサブスクリプション情報。Pro・Pro Plus へのアップグレード時に Stripe Webhook で作成・更新される。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID | 主キー |
| `user_id` | UUID | `users.id` への参照 |
| `stripe_customer_id` | TEXT | Stripe の顧客 ID |
| `stripe_subscription_id` | TEXT | Stripe のサブスクリプション ID |
| `plan` | TEXT | `pro` / `pro_plus` / `pack` |
| `status` | TEXT | `active` / `canceled` / `past_due` |
| `current_period_end` | TIMESTAMPTZ | 現在の契約期間の終了日 |
| `created_at` | TIMESTAMPTZ | 作成日時 |

---

## リレーション図

```
users
 ├─── user_attempts (user_id)
 └─── subscriptions (user_id)

problems
 └─── user_attempts (problem_id)
```

---

## 未実装（将来追加）

- レベルシステム（XP の閾値・レベルアップ演出）
- 管理画面（問題の追加・編集UI）
- 駆け込みパックの使用期限管理カラム
