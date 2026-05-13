-- ─────────────────────────────────────────────────────────────────
-- Phase 4: Notion 連携を per-org 化
--
-- 現状: NOTION_API_KEY / NOTION_*_DB_ID は環境変数で組織共通だった。
-- これを organizations テーブルの notion_api_key + notion_db_ids (JSONB) に移し、
-- 組織ごとに別の Notion workspace / DB に接続できるようにする。
--
-- 既存の env var は移行期間中は fallback として残る (lib/notionForOrg.js)。
-- 全 org に Supabase 上の設定が揃ったら env var は廃止可能。
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS notion_api_key TEXT,
  -- meetingKey → Notion DB ID のマップ
  -- 例: {
  --   "morning": "abc123...",
  --   "kickoff-partner": "def456...",
  --   "manager": "...",
  --   ...
  -- }
  ADD COLUMN IF NOT EXISTS notion_db_ids JSONB DEFAULT '{}'::jsonb;

-- 既存 org に env var の値を初期値として書き込みたい場合は手動で:
--
-- UPDATE organizations SET
--   notion_api_key = '<env value>',
--   notion_db_ids  = jsonb_build_object(
--     'morning',           '<env NOTION_MORNING_MEETING_DB_ID>',
--     'kickoff-partner',   '<env NOTION_KICKOFF_PARTNER_DB_ID>',
--     'kickoff-youth',     '<env NOTION_KICKOFF_YOUTH_DB_ID>',
--     'kickoff-community', '<env NOTION_KICKOFF_COMMUNITY_DB_ID>',
--     'manager',           '<env NOTION_MANAGER_DB_ID>',
--     'director',          '<env NOTION_DIRECTOR_DB_ID>',
--     'planning',          '<env NOTION_PLANNING_DB_ID>',
--     'board',             '<env NOTION_BOARD_DB_ID>',
--     'program-regular',   '<env NOTION_PROGRAM_REGULAR_DB_ID>'
--   )
-- WHERE slug = 'neo-fukuoka';
--
-- ※ notion_api_key は機密情報なので Supabase Vault 等で暗号化することを推奨。
--    本マイグレーションではプレーン TEXT で導入し、Phase 4.5 で暗号化に移行する想定。

COMMENT ON COLUMN organizations.notion_api_key IS 'Notion Integration の Internal Integration Secret。Phase 4 で env var から移行';
COMMENT ON COLUMN organizations.notion_db_ids  IS 'meetingKey → Notion DB ID のマップ (JSONB)。lib/meetings.js の MEETINGS.key と対応';
