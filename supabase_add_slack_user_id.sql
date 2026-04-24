-- members テーブルに Slack User ID カラムを追加
-- (方式2: Bot Token は User ID 同期のみ、投稿は Webhook 経由)
-- 本番・staging 両方で実行してください

ALTER TABLE members ADD COLUMN IF NOT EXISTS slack_user_id TEXT;

-- PostgREST スキーマキャッシュを即時リロード
NOTIFY pgrst, 'reload schema';
