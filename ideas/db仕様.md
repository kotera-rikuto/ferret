# DB仕様書 v3

- **日付:** 2026-08-12
- **DB:** Supabase (PostgreSQL)
- **対象:** Ferret MVP

> ### 適用状況
>
> **2026-08-16 に本番 DB へ適用済み**（`supabase db push`）。制約が実際に効くことを検証済み ── キーワード3スロット / 不正な `reading_type` / `core_reject` 1件 のいずれも `23514`（check violation）で拒否され、正しい行のみ通ることを確認した。
> Supabase CLI はリンク済みなので、今後のマイグレーションは `supabase/migrations/` にファイルを置いて `supabase db push` だけでよい。

> **v3 の変更点（2026-08-12）:** 採点システム v3 に対応。`problems` に `reading_type` / `rubric_items` を追加し、`keywords` を**4スロット固定**に制約。`user_attempts` に `axes` / `grader_version` / `answer_hash` / `is_provisional` / `contradiction` / `usage` を追加。**クリア閾値を 65 → 55 に変更し、80点以上をパーフェクト帯として新設。** 詳細は `採点システム仕様書v3草案.md`、SQL は `supabase/migrations/20260812010000_scoring_v3.sql` を参照。
>
> **v2 の変更点:** 採点システムが Embedding 層を廃止し2層構成になったことに伴い、`model_answer_embedding` を「未使用・保留」に変更。`scoring_method` の取りうる値を更新。`public.users` 自動生成トリガーを追記。

---

## テーブル一覧

| テーブル | 役割 |
|---|---|
| `users` | ユーザー情報・プラン（`xp` カラムは未使用。XP は `user_attempts` から導出する） |
| `problems` | 問題マスターデータ |
| `user_attempts` | 回答ログ・採点結果 |
| `problem_feedback` | 異議申し立て・問題の誤り報告（2026-08-17 追加。定義は `supabase/migrations/20260817100000_problem_feedback.sql`） |
| `subscriptions` | Stripe サブスクリプション情報（未使用） |

---

## users

Supabase Auth と 1:1 で紐付く。Auth 側にメアド・パスワードが入るので、ここには追加情報だけ持つ。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID | Supabase Auth の user.id と同じ値（主キー） |
| `plan` | TEXT | `free` / `pro` / `pro_plus` / `pack` |
| `xp` | INTEGER | **未使用（2026-08-18・E3）。** 累計 XP は `user_attempts` の最高点から毎回導出する（`lib/progress/level.ts`）。このカラムは常に 0 で、**読んでも書いてもいない** |
| `created_at` | TIMESTAMPTZ | 登録日時 |

> **`xp` を導出にした理由（2026-08-18・E3）:** カウンタを持つと
> 「採点結果は保存できたのに加算だけ失敗した」というズレが生まれ、画面は普通に描画される
> （数字が少し小さいだけ）ので気づけない。回答ログから導出すれば `user_attempts` が
> 唯一の真実のまま保てる。ストリーク（`lib/progress/streak.ts`）と同じ判断。
> **カラムは消していない** ── 消すには下のトリガーの `insert` も同時に直す必要があり、
> 全ユーザーの生成経路に触ることになるため。復活させるときは
> 「最高点から導出する」という前提ごと見直すこと。

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
| `id` | INTEGER | 永続的な識別子。URL・リレーションに使用。変えない。**`GENERATED ALWAYS AS IDENTITY`（自動採番）なので、insert 時に `id` を指定するとエラーになる**（`428C9`）。問題投入スクリプトでは `id` を渡さないこと |
| `order` | INTEGER | 表示順。問題を差し込む際はここを更新する |
| `title` | TEXT | ステージ名（例:「filter ─ 条件で絞り込む」）。ステージ選択画面・問題画面に表示。**2026-08-16 に NOT NULL 化。** 画面側が `title ?? "Stage N"` でフォールバックするため、入れ忘れても見た目には正常に見えてしまい気づけないため |
| `language` | TEXT | `js` / `ts` / `ruby` / `python` |
| `code` | TEXT | 問題として表示するコードスニペット |
| `context` | TEXT | **【2026-08-17 に追加】** 実行結果（エラーログ・スタックトレース・テスト出力など）。コードとは**別のパネル**に表示する。影響型など必要な問題だけ入れる。**NULL 可。NULL なら枠ごと出さない** |
| `prerequisite` | TEXT | **【2026-08-17 に追加】** 前提知識。数行の短い説明（**400字以内**の CHECK 制約）。問題画面で折りたたみを開くと読める。**表示専用で採点プロンプトには渡さない。NULL 可** |
| `question` | TEXT | 設問文 |
| `model_answer` | TEXT | 模範回答テキスト |
| ~~`model_answer_embedding`~~ | ─ | **【2026-08-16 に削除】** v2 では「将来の回答傾向分析用」として保留していたが、その分析で必要になるのは `user_attempts.answer` のベクトルであって模範解答のベクトルではなく、残す理由として挙げていた用途にも使えないため削除した。コードからの参照もゼロだった。必要になれば `add column model_answer_embedding vector(1536)` の1行で戻せる |
| `keywords` | JSONB | キーワードスロット配列（採点層1で使用）。**v3 でちょうど4個に制約** |
| `reading_type` | TEXT | **【v3 で追加】** `トレース` / `意図` / `ズレ` / `影響` / `命名` / `仕様`。層2 `depth` 観点の判定条件を切り替える。**NOT NULL・既定値なし** |
| `rubric_items` | JSONB | **【v3 で追加】** 4観点のルーブリック。**NOT NULL・既定値なし** |
| ~~`ai_rubric`~~ | ─ | **【2026-08-16 に削除】** `rubric_items` に置き換わり採点経路から外れた。残しておくと「埋めれば採点に効く」と誤解して記入され、しかし一切読まれないという状態になるため削除した（`supabase/migrations/20260816120000_drop_ai_rubric.sql`） |
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

**スロットは必ず4個。合計は常に 0/12/15/18/20**（2026-08-17 に均等5点から前寄せ配点へ変更。`lib/ai/compose.ts` の `KEYWORD_POINTS`）。4観点と1対1で対応させる。1〜2番目は「理解していればまず書く語」（対象名と結論語）に割り当て、3〜4番目を差がつく要素にする。

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

### model_answer_embedding の扱い（2026-08-16 に削除済み）

**v1 では採点の中核だったが、v2 で採点経路から外し、2026-08-16 にカラムごと削除した。**
理由は `採点システム仕様書.md` §7（要約: Embedding は「話題の近さ」しか測れず、「偶数」と「奇数」のような致命的な誤答を高類似度と判定してしまう）。

v2 では「将来ユーザー回答をベクトル化してつまずき傾向を分析する」用途で保留するとしていたが、
**その分析で必要になるのは `user_attempts.answer` のベクトルであって模範解答のベクトルではない。**
残す理由として挙げていた用途にも使えないため削除した。必要になれば1行で戻せる
（`alter table public.problems add column model_answer_embedding vector(1536);`）。

**pgvector 拡張だけは残してある**（有効なままでもコストは無く、将来 `user_attempts` 側で使う可能性があるため）。

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
| `ai_feedback` | TEXT | AI が生成したフィードバック文（下の2欄をつなげたもの）。**必ず保存すること。** この欄しか無い過去の行があるので消せない |
| `ai_praise` | TEXT | **【E2 で追加】** 「よかったところ」。NGワード検査後の本文。**NULL 可** — この欄が無かった頃の行、または検査で空になった回。空の枠は画面に出さない |
| `ai_next_focus` | TEXT | **【E2 で追加】** 「つぎの一歩」。NULL の扱いは `ai_praise` と同じ |
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

### ~~レート制限のクエリ（Free プラン・v3 で条件追加）~~ ── **採らなかった（D1・2026-08-22）**

```sql
-- 【使っていない】今日（JST）に AI 採点を消費した回数
select count(*)
from public.user_attempts
where user_id = $1
  and created_at >= (now() at time zone 'Asia/Tokyo')::date
  and scoring_method = 'ai'
  and (usage ->> 'replayed') is distinct from 'true';
```

**「別テーブル不要」としていたが、この方式では上限を守れない。** 実装は `ai_usage_daily` に置き換えた（下の節）。理由は2つ。

1. **`count → 判定 → 採点` が不可分ではない。** 並列で来たリクエストは全部が同じ古い件数を読んで通り抜ける。Vercel は同時に複数のインスタンスが動くので、アプリ側のメモリに錠前を置いても効かない（`app/api/score/route.ts` の `inFlight` はプロセス内だけの補助）。
2. **行の数は採点の回数ではない。** 採点を経由せずに入れた行（`problems/unlock-seed.mjs` の解放用）も `scoring_method = 'ai'` なので枠を食う。逆に**採点が失敗すると行が作られない**ので、失敗を誘発するループは1件も数えられずに OpenAI を叩ける。

**このクエリ自体は集計用としては正しい**（「きょう何回 AI 採点が成立したか」を後から数えるのに使える）。強制には使わない。

---

## ai_usage_daily

**【D1 で追加・2026-08-22】** AI 採点の1日（JST）あたりの使用量。上限の強制と残数の表示が同じ数字を見るための唯一の場所。

| カラム | 型 | 説明 |
|---|---|---|
| `jst_date` | DATE | 日本時間の日付。**決めるのは必ず SQL 側**（`(now() at time zone 'Asia/Tokyo')::date`）。アプリ側で計算すると「表示は昨日・強制は今日」のズレが入る |
| `user_id` | UUID | 主キーの一部。**`users` への外部キーは張らない** ── サービス全体の合計を同じ表の1行（全ゼロの UUID）で持つため |
| `used` | INTEGER | その日に成立した AI 採点の回数（0 以上） |
| `updated_at` | TIMESTAMPTZ | 最終更新 |

主キーは `(jst_date, user_id)`。RLS は有効で**ポリシーは0件**（`problems` と同じ扱い）。anon に UPDATE を許すと自分の `used` を 0 に戻せる ── 上限がそのまま無効になる。

**古い行は消していない。** 1ユーザー1日1行しか増えず、残しておくと「日ごとの利用状況」がそのまま読める。

### 関数（`supabase/migrations/20260822174900_ai_usage_daily.sql`）

| 関数 | 役割 |
|---|---|
| `consume_ai_quota(user_id, user_limit, global_limit)` | **OpenAI を呼ぶ直前に1回だけ呼ぶ。** 全体 → 本人の順に行ロックを取り、両方が上限未満のときだけ両方を +1 する。返り値は `(allowed, blocked_by, user_used, global_used)` |
| `refund_ai_quota(user_id)` | 確保を1回ぶん戻す。**呼ぶのは「トークンが課金されていない」と分かった失敗だけ。** 本人の行が実際に減ったときだけ全体の行も減らす（`20260822184000` で修正。**全体だけが減ると、その日に流せる総数が実際の消費より増える** ── 天井が静かに上へずれる。実DBの `I-685` が踏んだ） |
| `peek_ai_quota(user_id)` | 増やさずに読む。ステージ画面の残数表示用 |

**要点は `for update`（行ロック）。** これが並列リクエストを直列化する。素の `select` に変えると、同時に来た2件が同じ `used` を読んで両方通る。

**上限値は引数で渡す**（アプリ側の `lib/ai/quota.ts` が持つ）。SQL にも定数を書くと、片方だけ変えたときに画面の残数と実際の強制がズレる。

**EXECUTE 権限は `service_role` だけ。** Postgres は関数の EXECUTE を既定で PUBLIC に配り、Supabase の既定権限では `anon` / `authenticated` にも付く。取り上げないと、ブラウザの anon キーから `consume_ai_quota(<他人の id>, 1, 1)` を叩いて他人の枠を焼ける（全体行を膨らませれば全員を止められる）。マイグレーションの末尾で `revoke` している。

関数は `security definer` に**しない**。ポリシーが0件なので、万一 EXECUTE が漏れても RLS で INSERT が拒否されて例外になり、**通す方向には倒れない**。definer にするとその場合に「他人の枠を焼ける関数」になる。

### 何を1回と数えるか

| 行・事象 | 数える | 理由 |
|---|---|---|
| AI 採点が成立した | ✅ | 原価が出ている |
| OpenAI が 429 / 5xx を返した | ❌ 戻す | トークンが1つも課金されていない |
| 応答は返ったが使えなかった（JSON 壊れ・スキーマ違い等） | ✅ 戻さない | 課金済み。**ここを戻すと、失敗を誘発できる相手が無制限に叩ける** |
| タイムアウト | ✅ 戻さない | 課金されたか判定できないので安全側に置く |
| 同一回答のリプレイ | ❌ | API を呼んでいない |
| 判定保留（`is_provisional = true`） | ❌ | 層2を回していない。上限超過の結果そのもの |
| 手で入れた行（解放用の seed など） | ❌ | この表を通らないので構造的に数えられない |

**退会したら消す**（`lib/account.ts` の `DELETE_TARGETS`）。外部キーが無いので cascade では消えない。

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
      （ai_usage_daily は user_id を持つが**外部キーは張らない**。
        全体の合計を全ゼロの UUID の行で持つため。退会時の削除は明示的に行う）

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
| `ai_usage_daily` | **ポリシーなし** | 【D1】UPDATE を許すと自分の使用数を 0 に戻せる（上限が無効になる）。SELECT も許さない ── サーバー経由の残数表示だけで足りる |

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
