-- ─────────────────────────────────────────────────────────────
-- 週次MTG セッションに「確認対象から除外する KR/KA ID」を保持
-- 実行方法: Supabase SQL エディタで貼り付けて RUN (本番・staging 両方)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE weekly_mtg_sessions
  ADD COLUMN IF NOT EXISTS excluded_kr_ids BIGINT[] DEFAULT '{}'::bigint[],
  ADD COLUMN IF NOT EXISTS excluded_ka_ids BIGINT[] DEFAULT '{}'::bigint[];

-- 用途:
--   準備画面でファシリが「今回は確認しない」項目をオフにすると
--   そのKR/KAの id がここに格納される。
--   KR順送り / KA順送り のステップでは
--     filter(item => !excluded_*_ids.includes(item.id))
--   で除外する。
