-- ─────────────────────────────────────────────────────────────
-- 共有・確認事項の通知用 Slack Webhook URL を organizations に追加
-- 実行方法: Supabase SQL エディタで貼り付けて RUN (本番・staging 両方)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slack_webhook_confirmations TEXT;

COMMENT ON COLUMN organizations.slack_webhook_confirmations IS
  '共有・確認事項のSlack通知専用 Incoming Webhook URL (UIから登録可能・組織ごと)';
