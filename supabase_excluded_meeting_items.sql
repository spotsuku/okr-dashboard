-- ─────────────────────────────────────────────────────────────
-- 週次MTG セッションに「確認対象から除外する組織レベル(チーム/部署) ID」を保持
-- 実行方法: Supabase SQL エディタで貼り付けて RUN (本番・staging 両方)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE weekly_mtg_sessions
  ADD COLUMN IF NOT EXISTS excluded_level_ids BIGINT[] DEFAULT '{}'::bigint[];

-- 用途:
--   準備画面でファシリが「今回は確認しない」チーム/部署をオフにすると
--   そのレベルの id がここに格納される。
--   KR順送り / KA順送り のステップでは
--     filter(item => !excluded_level_ids.includes(item.level.id))
--   で除外する。
--
-- 旧仕様で個別の KR/KA ID を格納する案 (excluded_kr_ids/excluded_ka_ids) は
-- 粒度が細かすぎて運用しにくいため廃止。
-- 既に追加してしまった場合は以下を実行して削除しても良い:
--   ALTER TABLE weekly_mtg_sessions DROP COLUMN IF EXISTS excluded_kr_ids;
--   ALTER TABLE weekly_mtg_sessions DROP COLUMN IF EXISTS excluded_ka_ids;
