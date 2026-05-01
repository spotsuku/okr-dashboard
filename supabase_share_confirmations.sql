-- ─────────────────────────────────────────────────────────────
-- 共有・確認システムの拡張 + KR/KA記入時の参考URL対応
-- 実行方法: Supabase SQL エディタで貼り付けて RUN (本番・staging 両方)
-- ─────────────────────────────────────────────────────────────

-- 1. member_confirmations 拡張: 共有事項 (kind='share') + 会議紐付け + 参考URL
-- ─────────────────────────────────────────────────────────────
ALTER TABLE member_confirmations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'confirmation',
  ADD COLUMN IF NOT EXISTS meeting_keys TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS reference_urls JSONB DEFAULT '[]'::jsonb;

-- kind は 'confirmation' (既存の確認事項) | 'share' (新: 共有事項)
-- reference_urls 形式: [{ "url": "https://...", "label": "..." }, ...]
-- meeting_keys は MEETINGS の key の配列 (例: ['planning','board','manager'])
-- 全体宛 (to_name='') を許可するため NOT NULL を残しつつ空文字を全体宛とみなす運用とする

CREATE INDEX IF NOT EXISTS member_confirmations_kind_idx
  ON member_confirmations (kind, status, created_at DESC);

CREATE INDEX IF NOT EXISTS member_confirmations_meeting_keys_idx
  ON member_confirmations USING GIN (meeting_keys);

-- 2. kr_weekly_reviews / weekly_reports に参考URL対応
-- ─────────────────────────────────────────────────────────────
ALTER TABLE kr_weekly_reviews
  ADD COLUMN IF NOT EXISTS reference_urls JSONB DEFAULT '[]'::jsonb;

ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS reference_urls JSONB DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────
-- 既存データの整合: kind 未設定行は 'confirmation' で埋める (DEFAULT 適用済のはず)
UPDATE member_confirmations SET kind = 'confirmation' WHERE kind IS NULL;
