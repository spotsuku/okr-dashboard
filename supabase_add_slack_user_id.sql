-- members テーブルに Slack User ID カラムを追加
-- (方式A: Bot Token 方式の Slack 連携用)
-- 本番・staging 両方で実行してください

ALTER TABLE members ADD COLUMN IF NOT EXISTS slack_user_id TEXT;

-- PostgREST スキーマキャッシュを即時リロード
NOTIFY pgrst, 'reload schema';
