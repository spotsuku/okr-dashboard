-- ─────────────────────────────────────────────────────────────
-- 終業報告(日報)の通知用 Slack Webhook URL を organizations に追加
-- 実行方法: Supabase SQL エディタで貼り付けて RUN (本番・staging 両方)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slack_webhook_daily_report TEXT;

COMMENT ON COLUMN organizations.slack_webhook_daily_report IS
  '終業報告(日報)のSlack通知専用 Incoming Webhook URL (UIから登録可能・組織ごと)';
