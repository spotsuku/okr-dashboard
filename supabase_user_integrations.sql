-- ============================================================
-- user_integrations テーブル (外部サービス連携のトークン保存)
-- Supabase の SQL Editor で実行してください。
-- ============================================================

CREATE TABLE IF NOT EXISTS user_integrations (
  id            BIGSERIAL PRIMARY KEY,
  owner         TEXT NOT NULL,
  service       TEXT NOT NULL,                 -- 'google_gmail' | 'google_calendar' | 'slack' | 'line'
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  scope         TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- email / workspace_name / user_id など
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner, service)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_owner ON user_integrations(owner);
CREATE INDEX IF NOT EXISTS idx_user_integrations_service ON user_integrations(service);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全ての連携状態を閲覧・管理可能
-- (内部ツール想定。外部連携なので厳密な他人トークン隠蔽はサービスロールキー経由のサーバー側で担保)
DROP POLICY IF EXISTS "auth users can manage user_integrations" ON user_integrations;
CREATE POLICY "auth users can manage user_integrations"
  ON user_integrations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_user_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_integrations_updated_at ON user_integrations;
CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_user_integrations_updated_at();
