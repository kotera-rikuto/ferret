# TASKS.md

Ferret 実装タスク一覧

**最終更新: 2026-08-09** — 約1ヶ月ぶりの再開にあたり、実コード・ビルド・DB接続を実際に確認して棚卸しした。

---

## 🚨 再開時のブロッカー（これを直さないと何も動かない）

- [x] ~~Supabase プロジェクトが停止していた~~ → **2026-08-09 復旧確認済み**。4テーブルとも健在、スキーマは `ideas/db仕様.md` と完全一致、`model_answer_embedding` も `vector(1536)` で生きている（pgvector 有効）
- [ ] **`problems` テーブルが 0件** — 全テーブル空（service_role で確認）。問題データが1件もないため採点フローを通しで試せない。まず検証用に1問投入する
- [x] ~~`npm run build` が失敗する~~ → **2026-08-09 修正済み**。`lib/ai/scorer.ts` を遅延初期化（`getOpenAI()`）に変更し、キー未設定でもビルドが通ることを確認。障害範囲が `/api/score` 内に閉じるようになった
- [x] ~~`OPENAI_API_KEY` を設定する~~ → **2026-08-11 設定・疎通確認済み**。専用プロジェクト `ferret` のキー（`ferret-key`）を発行。gpt-4o-mini への実リクエストが成功し、JSONモード・`temperature: 0` も含めて動作確認済み
- [x] ~~Next.js 16 の `params` / `searchParams` が Promise 化~~ → **2026-08-09 修正済み**。両画面を `use()` で unwrap。`?score=80` → 80点「クリア！」、`?score=40` → 40点「もう一度挑戦しよう」を実測で確認
- [x] ~~git が未初期化~~ → **2026-08-10 解消**。`kotera-rikuto/ferret` に push 済み（Public）。事業系3点（仕様書・需要分析・プレゼン資料）は `.gitignore` で除外、`.env.local` も未追跡であることを確認済み

---

## 環境構築

- [x] Next.js セットアップ（TypeScript・Tailwind CSS v4・ESLint・App Router）※実際は **Next.js 16.2.7**（当初想定の15ではない）
- [x] Supabase パッケージインストール（@supabase/supabase-js 2.107 ・@supabase/ssr 0.10.3）
- [x] `openai` パッケージインストール（^6.43.0）
- [x] Supabase プロジェクト作成・接続（.env.local 設定）※2026-08-09 に停止から復旧、疎通確認済み
- [x] DB テーブル作成（users・problems・user_attempts・subscriptions）※スキーマ健在・仕様書と一致。ただし全テーブル 0件
- [x] pgvector 拡張有効化 ※`model_answer_embedding` が `vector(1536)` として存在することを確認
- [ ] `middleware.ts` → `proxy.ts` への移行（Next.js 16 で deprecation warning が出ている）

---

## 認証

- [ ] Supabase Auth で Google OAuth 設定（※クレカ登録が必要なため後回し。UIボタンは実装済みだが未設定なので押しても失敗する）
- [ ] Supabase Auth で GitHub OAuth 設定（※同上）
- [ ] Magic Link（メール認証）設定
- [x] ログイン処理実装（`signInWithPassword`）
- [x] 新規登録処理実装（`signUp` + 確認メール案内画面）
- [ ] **ログアウト処理実装** — `signOut()` を呼ぶ箇所がコード上に存在しない（旧TASKS.mdでは完了扱いだった）
- [x] 認証コールバック（`/auth/callback`）実装
- [x] **`public.users` 自動生成トリガー設置**（2026-08-09）— `auth.users` への insert 時に `public.users` へ `plan='free', xp=0` の行を作る `on_auth_user_created` トリガー。これが無いと `user_attempts` の外部キー制約違反で採点結果が保存できない。設置済みを `pg_proc` / `pg_trigger` で確認済み
- [x] ミドルウェア実装 → **⚠️ リダイレクト処理が `middleware.ts:33-35` でコメントアウトされ無効化中**（開発中の一時措置。リリース前に必ず戻す）

---

## 画面実装

- [x] タイトル画面（`/`）— ロゴ + キャラクター画像 + ログイン/新規登録ボタン
- [x] ログイン画面（`/login`）— メアド・パスワード + OAuth ボタン
- [x] 新規登録画面（`/register`）— メアド・パスワード + 確認メール案内
- [x] ステージ選択画面（`/stages`）— ジグザグマップ・クリア状態表示。**2026-08-11 DB接続完了**（`problems` + 自分の `user_attempts` からクリア状態を算出）
- [x] 問題画面（`/problems/[id]`）— コード表示 + 回答入力 + 採点API呼び出し。**2026-08-11 DB接続完了**（サーバーコンポーネント化・モック撤去）※Shiki 未使用（`<pre>` 直書き）
- [x] リザルト画面（`/result/[id]`）— **2026-08-11 DB接続完了**。`user_attempts` から実スコア・内訳・`ai_feedback` を表示。`?score=` のURL渡しを廃止（偽装不可に）※XPバー未実装

> **⚠️ 画面と採点APIのちぐはぐに注意**
> 採点API（`/api/score`）は最初から DB ベースで動く。一方で問題画面は `mockProblem` を表示しつつ、送信だけ `problem_id: Number(params.id)` を API に投げる（`app/problems/[id]/page.tsx:29`）。
> このため **DB に問題を入れた瞬間、「画面に映っているモックのコード」と「採点に使われる DB の問題」が食い違う**。問題データ投入と問題画面のDB接続はセットで行うこと。
> （現状は params バグで `Number(undefined)` → NaN → JSON化で `null` になり、`.eq("id", null)` が空振りして 404 が返るだけ）
- [ ] 振り返り画面（`/review/[id]`）— 回答・解説・正解例（MVP後。リザルト画面に導線ボタンがコメントアウトで残置）

### 画面まわりの残タスク（新規）

- [ ] ステージ選択画面を DB 接続（`problems` + `user_attempts` からクリア状態を算出。判定は `MAX(total_score) >= 65`）
- [ ] 問題画面を DB 接続（モック `mockProblem` を撤去）
- [ ] 問題画面のコード表示を Shiki に置き換え
- [ ] **リザルト画面を DB 接続** — 現在 Supabase の import すら無く、スコアを URL クエリ `?score=` で受け取っているだけ（`app/result/[id]/page.tsx:25`）。`user_attempts` から該当回答を読む形に変える
- [ ] リザルト画面に AI フィードバック（`user_attempts.ai_feedback`）を表示 ※上記DB接続 +『採点システム』の `ai_feedback` 保存タスクが前提
- [ ] リザルト画面の XP バー実装

---

## 採点システム

> **2026-08-10 設計変更: 3層 → 2層。** Embedding 層を廃止（「偶数」と「奇数」のような致命的な誤答を高類似度と判定し、AI検証を素通りして満点を与える構造的欠陥のため）。詳細は `ideas/採点システム仕様書.md` v2 §7。

- [x] 層1: 正規表現スコアリング（キーワード部分点・20点）— `lib/ai/scorer.ts`
- [x] 層2: GPT-4o mini スコアリング（JSON出力・5段階・80点）— 同上
- [x] **`scorer.ts` を2層構成に書き換え**（2026-08-10）— Embedding 層と `cosineSimilarity` を削除、`temperature: 0` を明示、`feedback` を取得。想定外のスコアが返った場合に 0/20/40/60/80 へ丸める `normalizeDeepScore` を追加
- [x] **`ai_feedback` を `user_attempts` に保存**（2026-08-10）— API 側で feedback を受け取って insert に含めるよう修正
- [x] ~~模範回答の Embedding 事前計算スクリプト~~ → **設計変更により不要**
- [x] 採点APIエンドポイント（`POST /api/score`）— 認証チェック + 問題取得 + 採点 + `user_attempts` 保存
- [x] **OpenAI API の疎通確認**（2026-08-11）— gpt-4o-mini への実リクエスト成功
- [ ] **採点フローを通しで検証** — `problems` に問題を投入し、サインアップ → 問題 → 採点 → リザルトを1周させる。`public.users` トリガー・`ai_feedback` 保存・AI採点の精度がここで初めて実地検証される
- [x] **保存失敗を握りつぶさない**（2026-08-09）— `/api/score` が `user_attempts` の insert エラーを検査せず捨てていたのを修正。失敗時は 500 を返す。あわせて問題画面側にも `res.ok` チェックを追加（従来は 500 でも `?score=undefined` に遷移し「NaN点」と表示されていた）
- [ ] OpenAI API 障害時のエラー処理・入力保持
- [x] AI採点プロンプトへの NGワード禁止指示の追加（2026-08-10）— 「弱点」「間違い」「初心者」「勉強」「失敗」「正しい読み方」を禁止し、否定ではなく「次に注目するとよい箇所」として書くようシステムプロンプトに明記
- [ ] PII 自動スキャン（仕様書 §9.5 の法務要件）
- [ ] ユーザー回答が外部AIに送信される旨のUI表示（同上）

---

## RLS とキーの使い分け

RLS は4テーブルすべてで**有効**（2026-08-11 に `pg_class.relrowsecurity` で確認）。ポリシーが無いため anon キーからは何も読めない状態。

**設計方針:** 採点は「サーバーの仕事」として service_role で行い、ユーザー（anon）には自分のデータの**読み取りのみ**許す。anon に `user_attempts` の書き込みを許すとブラウザから直接 `total_score: 100` を挿入でき、段位・認定証の価値が消えるため。

- [x] **`lib/supabase/admin.ts` 作成**（2026-08-11）— service_role クライアント。`.env.local` にキーはあったが読むコードが1行も無かった
- [x] **`/api/score` をキー分離**（2026-08-11）— `auth.getUser()` は anon、`problems` 読み取りと `user_attempts` 書き込みは admin。ビルド成果物を検索し service_role がクライアントバンドルに含まれないことを確認済み
- [x] **RLS ポリシー作成**（2026-08-11）— SELECT 3件のみ作成、書き込みポリシーは意図的に0件
  - `user_attempts`: SELECT 自分の行のみ
  - `users`: SELECT 自分の行のみ
  - `subscriptions`: SELECT 自分の行のみ（書き込みは Stripe Webhook = service_role）
  - `problems`: **ポリシーを作らない**（`model_answer` を含むため server 経由でのみ読む）
- [x] **問題表示用の安全な読み取り経路**（2026-08-11）— 各ページをサーバーコンポーネント化し、admin クライアントで `select("id, order, title, code, question")` と明示。`model_answer` / `ai_rubric` はクライアントに渡らない

---

## レート制限

- [ ] Free プラン 1日3問制限（JST 深夜0時リセット）
- [ ] Pro プラン 月200問制限
- [ ] 制限超過時のUI表示
- [ ] `users.plan` の参照ロジック（現在 `/api/score` はプランを一切見ずに無制限で採点する）

---

## 決済（Stripe）

- [ ] Stripe アカウント設定・価格プラン作成
- [ ] Stripe パッケージインストール（`stripe`）
- [ ] Checkout セッション生成（Pro アップグレード）
- [ ] Webhook 実装（`/api/webhooks/stripe`）— subscriptions テーブル更新
- [ ] 駆け込みパック（単発購入）フロー

---

## その他

- [ ] shadcn/ui セットアップ（未導入。現状は Tailwind 直書き）
- [ ] Lottie マスコットアニメーション（lottie-react インストール・実装）
- [ ] XP・レベルシステム（将来実装）
- [ ] 問題コンテンツ作成（JS編 20〜30問）+ 各問題の `keywords` / `ai_rubric` / `model_answer` 整備

---

## ドキュメント整合性

- [ ] **`CLAUDE.md` が実態と乖離している** — 要更新
  - 「実装はまだ始まっていない。プランニングフェーズ」→ 実際は6画面中6画面が形になっている
  - 「Next.js 15」→ 実際は 16.2.7
  - 「Claude Haiku で AI採点」「パターンマッチ 70-80%」→ 実際は OpenAI GPT-4o mini + Embedding の3層構成（`ideas/採点システム仕様書.md` が正）
  - 環境変数 `ANTHROPIC_API_KEY` → 実際は `OPENAI_API_KEY`
  - 想定ディレクトリ構成に `lib/glicko2`・`components/` 等の未着手項目が混在
- [ ] `環境構築メモ.md` の「未インストール」リストが古い（`openai` は導入済み）

---

## リリース前チェック

- [ ] RLS ポリシー設定（各テーブル）※現在の有効/無効は外部からは判別不能（全テーブル空のため）。ダッシュボードで要確認。RLS が無効だとブラウザに配られる anon キーで `problems` の模範回答が丸見えになり、`user_attempts` も書き換え可能になる
- [ ] `middleware.ts` の認証リダイレクトを有効化に戻す
- [ ] .env.local.example の最終確認
- [ ] Vercel デプロイ設定
- [ ] 本番環境の環境変数設定
