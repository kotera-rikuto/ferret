-- 採点システム v3 対応
-- 作成: 2026-08-12
-- 仕様: ideas/採点システム仕様書v3草案.md §8
--
-- 【前提】全テーブル 0件の状態で適用する。
--   reading_type / rubric_items / answer_hash は DEFAULT なしの NOT NULL にしてある。
--   既存行があると失敗する（これは意図した挙動。黙って誤った既定値が入るより良い）。
--   万一行がある場合は、行を消してから再実行すること。
--
-- 【適用】supabase db push

begin;

-- ============================================================
-- problems: 読解型と4観点ルーブリック
-- ============================================================

-- 読解型。層2の depth 観点の判定条件をこの値で切り替える。
-- DEFAULT を付けない理由: 付けると reading_type の指定を忘れた問題が
-- 黙って 'トレース' 扱いになり、depth の判定条件が丸ごとズレる。
-- しかもエラーは出ず点数は普通に出るため気づけない。必ず明示させる。
alter table public.problems
  add column reading_type text not null
    check (reading_type in ('トレース', '意図', 'ズレ', '影響', '命名', '仕様'));

-- 4観点のルーブリック。articulation は全問共通の固定文なので含めない。
--   {
--     "core":        "<どういう結論を指していれば満たすか。結論は1つだけ書く>",
--     "ground":      "<コードのどの箇所を根拠に挙げていれば満たすか>",
--     "depth":       "<読解型別の踏み込み条件>",
--     "core_reject": ["<惜しいが両立しない読み方>", "<同>"]
--   }
alter table public.problems
  add column rubric_items jsonb not null;

alter table public.problems
  add constraint problems_rubric_items_shape check (
    jsonb_typeof(rubric_items) = 'object'
    and rubric_items ? 'core'
    and rubric_items ? 'ground'
    and rubric_items ? 'depth'
    and jsonb_typeof(rubric_items -> 'core_reject') = 'array'
    and jsonb_array_length(rubric_items -> 'core_reject') >= 2
  );

-- キーワードスロットは必ず4個（1スロット5点固定）。
-- v2 は「20 / スロット数」で配点していたため、スロット数の違いで同じ理解度でも
-- 合否が変わっていた（3個なら67点クリア、5個なら64点で不合格）。
-- コメントや規約ではなく DB が拒否することで、再発を物理的に防ぐ。
--
-- is not null を明示する理由: CHECK は結果が NULL のとき「満たしている」と
-- 判定されるため、keywords が NULL だと jsonb_array_length も NULL になり
-- 制約をすり抜ける。
alter table public.problems
  add constraint problems_keywords_exactly_4 check (
    keywords is not null
    and jsonb_typeof(keywords) = 'array'
    and jsonb_array_length(keywords) = 4
  );

comment on column public.problems.reading_type is
  '読解型。層2 depth の判定条件を切り替える';
comment on column public.problems.rubric_items is
  '4観点ルーブリック { core, ground, depth, core_reject[] }。core には結論を1つだけ書く';
comment on column public.problems.ai_rubric is
  'v3 で採点経路から外した。任意の補足メモでプロンプトには送らない。採点基準は rubric_items を使う';

-- ============================================================
-- user_attempts: 4観点の内訳・再現性・判定保留
-- ============================================================

-- 4観点の判定内訳。
--   { "core": { "verdict": "full", "evidence": "偶数だけ取り出す", "demoted": false }, ... }
-- 「なぜこの点数か」を振り返り画面に出す唯一の材料であり、
-- ルーブリック改善の一次データでもある。keyword_only の試行では NULL。
alter table public.user_attempts add column axes jsonb;

-- 採点したモデルとプロンプト版。例: 'gpt-4o-mini-2024-07-18/p3'
-- モデル差し替え時に旧採点と新採点が混ざるのを防ぐ唯一の手段。
alter table public.user_attempts add column grader_version text;

-- sha256(problem_id + grader_version + 正規化した回答)
-- 同一回答の再送を API を呼ばずに再現する。temperature:0 は決定性を保証しないため、
-- 「同じ回答なら同じ点数」を保証できるのはこのリプレイだけ。
-- NOT NULL にしてあるのは、入れ忘れると「揺れが静かに戻る」ほうが有害だから。
alter table public.user_attempts add column answer_hash text not null;

-- レート上限時の「判定保留」。
-- 層1のみ（最大20点）ではクリア閾値55に永久に届かないため、
-- 不合格として記録すると上限到達ユーザーに理由不明の全問不合格が並ぶ。
-- 保留として扱い、クリア判定から除外する。
alter table public.user_attempts
  add column is_provisional boolean not null default false;

-- 矛盾 veto（対義・反転などの決定的な食い違い）の発動記録。
-- 特定の problem_id で多発したら、模範回答かルーブリックが壊れているサイン。
alter table public.user_attempts
  add column contradiction boolean not null default false;

-- 実測用。
--   { "prompt_tokens": n, "cached_tokens": n, "completion_tokens": n,
--     "system_fingerprint": "...", "feedback_source": "ai"|"template",
--     "replayed": true|false }
-- 細かいフラグは全部ここに入れてカラムを増やさない。
alter table public.user_attempts add column usage jsonb;

-- 点数の範囲。層1は5点刻みで 0..20、層2は4観点の重み合成で 0..80。
-- 範囲外が入ったら算出ロジックが壊れているので、DB で止める。
alter table public.user_attempts
  add constraint user_attempts_keyword_score_range check (keyword_score between 0 and 20),
  add constraint user_attempts_deep_score_range    check (deep_score    between 0 and 80),
  add constraint user_attempts_total_score_range   check (total_score   between 0 and 100);

alter table public.user_attempts
  add constraint user_attempts_scoring_method_check
    check (scoring_method in ('ai', 'keyword_only'));

-- 同一回答リプレイの検索用
create index if not exists user_attempts_replay_idx
  on public.user_attempts (user_id, problem_id, answer_hash);

-- レート制限の集計用（JST 当日分のカウント）
create index if not exists user_attempts_rate_limit_idx
  on public.user_attempts (user_id, created_at desc);

commit;

-- ============================================================
-- 参照: v3 で変わるクエリ（実装はアプリ側。ここには置かない）
-- ============================================================
--
-- ● クリア判定（閾値 65 → 55、判定保留を除外）
--   select coalesce(max(total_score), 0) >= 55 as cleared
--   from public.user_attempts
--   where user_id = $1 and problem_id = $2 and is_provisional = false;
--
-- ● パーフェクト判定（マップ上の演出を変える）
--   select coalesce(max(total_score), 0) >= 80 as perfect
--   from public.user_attempts
--   where user_id = $1 and problem_id = $2 and is_provisional = false;
--
-- ● レート制限（リプレイと判定保留は無料枠を消費しない）
--   select count(*)
--   from public.user_attempts
--   where user_id = $1
--     and created_at >= (now() at time zone 'Asia/Tokyo')::date
--     and scoring_method = 'ai'
--     and (usage ->> 'replayed') is distinct from 'true';
--
-- ============================================================
-- 巻き戻し（必要な場合のみ手で実行）
-- ============================================================
--
-- begin;
-- drop index if exists public.user_attempts_rate_limit_idx;
-- drop index if exists public.user_attempts_replay_idx;
-- alter table public.user_attempts
--   drop constraint if exists user_attempts_scoring_method_check,
--   drop constraint if exists user_attempts_total_score_range,
--   drop constraint if exists user_attempts_deep_score_range,
--   drop constraint if exists user_attempts_keyword_score_range,
--   drop column if exists usage,
--   drop column if exists contradiction,
--   drop column if exists is_provisional,
--   drop column if exists answer_hash,
--   drop column if exists grader_version,
--   drop column if exists axes;
-- alter table public.problems
--   drop constraint if exists problems_keywords_exactly_4,
--   drop constraint if exists problems_rubric_items_shape,
--   drop column if exists rubric_items,
--   drop column if exists reading_type;
-- commit;
