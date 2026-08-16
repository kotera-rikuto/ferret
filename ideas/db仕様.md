# DB仕様書 v3

- **日付:** 2026-08-12
- **DB:** Supabase (PostgreSQL)
- **対象:** Ferret MVP

> ### ⚠️ 適用状況（2026-08-12 時点）
>
> **本書は v3 のスキーマを記述しているが、本番 DB にはまだ適用されていない。**
> マイグレーションファイルは `supabase/migrations/20260812010000_scoring_v3.sql` に作成済み、`supabase init` も完了。残りは `supabase login` → `supabase link --project-ref pbisrsrfmhzmmdmufhsj` → `supabase db push`。
> **適用が済んだらこのブロックを消すこと。**

> **v3 の変更点（2026-08-12）:** 採点システム v3 に対応。`problems` に `reading_type` / `rubric_items` を追加し、`keywords` を**4スロット固定**に制約。`user_attempts` に `axes` / `grader_version` / `answer_hash` / `is_provisional` / `contradiction` / `usage` を追加。**クリア閾値を 65 → 55 に変更し、80点以上をパーフェクト帯として新設。** 詳細は `採点システム仕様書v3草案.md`、SQL は `supabase/migrations/20260812010000_scoring_v3.sql` を参照。
>
> **v2 の変更点:** 採点システムが Embedding 層を廃止し2層構成になったことに伴い、`model_answer_embedding` を「未使用・保留」に変更。`scoring_method` の取りうる値を更新。`public.users` 自動生成トリガーを追記。

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
| `title` | TEXT | ステージ名（例:「filter ─ 条件で絞り込む」）。ステージ選択画面・問題画面に表示。v2 で追加 |
| `language` | TEXT | `js` / `ts` / `ruby` / `python` |
| `code` | TEXT | 問題として表示するコードスニペット |
| `question` | TEXT | 設問文 |
| `model_answer` | TEXT | 模範回答テキスト |
| `model_answer_embedding` | VECTOR(1536) | **【v2 で未使用】** 採点では参照しない。将来の回答傾向分析用に保留（NULL のままでよい） |
| `keywords` | JSONB | キーワードスロット配列（採点層1で使用）。**v3 でちょうど4個に制約** |
| `reading_type` | TEXT | **【v3 で追加】** `トレース` / `意図` / `ズレ` / `影響` / `命名` / `仕様`。層2 `depth` 観点の判定条件を切り替える。**NOT NULL・既定値なし** |
| `rubric_items` | JSONB | **【v3 で追加】** 4観点のルーブリック。**NOT NULL・既定値なし** |
| `ai_rubric` | TEXT | **【v3 で採点経路から外した】** 任意の補足メモ。プロンプトには送らない。採点基準は `rubric_items` を使う |
| `difficulty` | INTEGER | 難易度 1〜5（1が最易） |
| `created_at` | TIMESTAMPTZ | 作成日時 |

`reading_type` と `rubric_items` に既定値を付けていない理由: 既定値があると指定を忘れた問題が黙って通り、判定条件がズレたまま**エラーも出ず点数も普通に出る**ため気づけない。必ず明示させる。

### keywords カラムの構造（v3 で4スロット固定）

```json
[
  { "match": ["getEvens", "この関数", "戻り値", "返り値"] },
  { "match": ["偶数", "2で割り切れる", "2の倍数"] },
  { "match": ["filter", "フィルタ", "%", "剰余", "余り"] },
  { "match": ["[2, 4]", "[2,4]", "2と4", "新しい配列"] }
]
```

**スロットは必ず4個。1スロット5点固定**（合計は常に 0/5/10/15/20）。4観点と1対1で対応させる。1〜2番目は「理解していればまず書く語」（対象名と結論語）に割り当て、3〜4番目を差がつく要素にする。

v2 は `20 / スロット数` で配点していたため、スロット数の違いで**同じ理解度でも合否が変わっていた**（3個なら67点でクリア、5個なら64点で不合格）。v3 は DB 制約で4個を強制する。

```sql
-- keywords が NULL だと CHECK をすり抜けるため is not null を明示している
alter table public.problems
  add constraint problems_keywords_exactly_4 check (
    keywords is not null
    and jsonb_typeof(keywords) = 'array'
    and jsonb_array_length(keywords) = 4
  );
```

### rubric_items カラムの構造（v3 で追加）

```json
{
  "core":   "偶数だけを取り出しているという結論を指していれば満たす",
  "ground": "filter のコールバックの n % 2 === 0 に触れていれば満たす",
  "depth":  "新しい配列を返す（元の配列が変わらない）点、または [1,2,3,4]→[2,4] のような具体値に触れていれば満たす",
  "core_reject": ["奇数を取り出していると読んでいる", "元の配列を書き換えていると読んでいる"]
}
```

`articulation` 観点は全問共通の固定文なので含めない。`core_reject` は2件以上必須（DB制約）。

**`core` には結論を1つだけ書く。** 2要素以上を詰めると、正しいが短い回答が `partial`（24点）に落ちて不合格になる。2つ目以降は `depth` に回す。

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
| `scoring_method` | TEXT | `ai`（通常）/ `keyword_only`（レート制限超過時に層1のみで判定）。v3 で CHECK 制約を追加 |
| `axes` | JSONB | **【v3 で追加】** 4観点の判定内訳 `{ core: { verdict, evidence, demoted }, ... }`。**「なぜこの点数か」を振り返り画面に出す唯一の材料。** `keyword_only` 時は NULL |
| `grader_version` | TEXT | **【v3 で追加】** 例 `gpt-4o-mini-2024-07-18/p3`。モデル差し替え時に旧採点と新採点が混ざるのを防ぐ |
| `answer_hash` | TEXT | **【v3 で追加・NOT NULL】** `sha256(problem_id + grader_version + 正規化した回答)`。同一回答の再送を API を呼ばずに再現する |
| `is_provisional` | BOOLEAN | **【v3 で追加】** 判定保留フラグ（既定 false）。`keyword_only` の試行に立てる |
| `contradiction` | BOOLEAN | **【v3 で追加】** 矛盾 veto の発動（既定 false）。特定問題で多発したら模範回答かルーブリックが壊れているサイン |
| `usage` | JSONB | **【v3 で追加】** `{ prompt_tokens, cached_tokens, completion_tokens, system_fingerprint, feedback_source, replayed }`。原価とキャッシュ命中率の実測用。**細かいフラグは全部ここに入れてカラムを増やさない** |
| `created_at` | TIMESTAMPTZ | 回答日時（レート制限の集計に使用） |

点数の範囲は DB 制約で守る（`keyword_score` 0〜20 / `deep_score` 0〜80 / `total_score` 0〜100）。範囲外が入るのは算出ロジックが壊れているときなので、静かに保存させない。

### なぜ `answer_hash` が NOT NULL なのか

`temperature: 0` は決定性を保証しない（API 側の表現も "mostly deterministic"）。**「同じ回答なら同じ点数」を保証できるのは、このハッシュによるリプレイだけ。** 入れ忘れて「揺れが静かに戻る」ほうが有害なので、DB で必須にしている。

### クリア判定のクエリ（v3 で閾値変更）

```sql
-- クリア（次のステージへ進める）: 55点以上
select coalesce(max(total_score), 0) >= 55 as cleared
from public.user_attempts
where user_id = $1 and problem_id = $2 and is_provisional = false;

-- パーフェクト（マップ上の演出を変える）: 80点以上
select coalesce(max(total_score), 0) >= 80 as perfect
from public.user_attempts
where user_id = $1 and problem_id = $2 and is_provisional = false;
```

一度クリアしたら再挑戦で低いスコアを出してもクリア状態は維持される。**この非対称性は意図的**で、採点の揺れが「再挑戦で救う方向」にしか働かないようにしている。

**閾値を 65 → 55 に下げた理由:** 65 では「中核は読めているが説明が短い」回答が62点で不合格になり、**期待値の山がちょうど閾値の直下に来る**ため初回クリア率が45〜55%に沈む。55 なら65〜72%になる。

**55 が下限に近い根拠:** `core` 観点が `none`（中核を読めていない）のときの理論上の最大は `0+16+12+4 = 32`、層1満点を足して **52点**。したがって **閾値53以上なら「中核を読めていない回答は絶対に通らない」が保たれる。** 50以下に下げるとこのゲートが崩れる。

**`is_provisional = false` で絞る理由:** レート上限時のフォールバック（層1のみ・最大20点）はクリア閾値55に永久に届かない。不合格として扱うと上限到達ユーザーに理由不明の全問不合格が並ぶため、判定保留としてクリア判定から除外する。

### レート制限のクエリ（Free プラン・v3 で条件追加）

```sql
-- 今日（JST）に AI 採点を消費した回数
select count(*)
from public.user_attempts
where user_id = $1
  and created_at >= (now() at time zone 'Asia/Tokyo')::date
  and scoring_method = 'ai'
  and (usage ->> 'replayed') is distinct from 'true';
```

別テーブル不要。このカウントが 3 以上なら AI 採点を行わない（Free プラン）。

**v2 からの変更:** 全試行をカウントしていたため、**API を1回も呼んでいないリプレイ（同一回答の再送）や層1のみの試行まで無料枠を消費していた。** `scoring_method = 'ai'` かつリプレイでないものだけを数える。

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

## RLS ポリシー（2026-08-11 設定済み）

4テーブルすべてで RLS 有効。**ユーザーには読み取りのみ許可し、書き込みポリシーは意図的に1つも作らない。**

| テーブル | ポリシー | 理由 |
|---|---|---|
| `user_attempts` | SELECT 自分の行のみ | 書き込みを許すとブラウザから直接 `total_score: 100` を挿入でき、段位・認定証の価値が消える |
| `users` | SELECT 自分の行のみ | `plan` の自己書き換えを防ぐ |
| `subscriptions` | SELECT 自分の行のみ | 書き込みは Stripe Webhook（service_role）のみ |
| `problems` | **ポリシーなし** | SELECT を許すと anon キーで `model_answer` を直接読めてしまう。サーバー経由（admin + カラム明示）でのみ読む |

```sql
create policy "自分の回答だけ閲覧できる" on public.user_attempts
  for select to authenticated using (auth.uid() = user_id);

create policy "自分のユーザー情報だけ閲覧できる" on public.users
  for select to authenticated using (auth.uid() = id);

create policy "自分の契約情報だけ閲覧できる" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);
```

**キーの使い分け:** 採点（`problems` 読み取り・`user_attempts` 書き込み）は `lib/supabase/admin.ts` の service_role クライアントで行う。RLS をバイパスするため、呼び出し側で必ず `auth.getUser()` による本人確認を先に行うこと。

---

## 未実装（将来追加）

- レベルシステム（XP の閾値・レベルアップ演出）
- 管理画面（問題の追加・編集UI）
- 駆け込みパックの使用期限管理カラム
