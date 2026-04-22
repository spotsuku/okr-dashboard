-- ============================================================
-- user_integrations テーブル (Google 連携のトークン保存)
-- Gmail + Calendar の1セッション1行 (service='google')
-- 両方の Supabase (本番 / staging) で実行してください
-- ============================================================

CREATE TABLE IF NOT EXISTS user_integrations (
  id            BIGSERIAL PRIMARY KEY,
  owner         TEXT NOT NULL,
  service       TEXT NOT NULL,                 -- 'google' (Gmail + Calendar を含む)
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  scope         TEXT,                          -- Google から返った実際の scope
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- email など
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner, service)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_owner   ON user_integrations(owner);
CREATE INDEX IF NOT EXISTS idx_user_integrations_service ON user_integrations(service);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated ユーザーなら全行アクセス可 (フロント側で owner フィルタ)
-- 前回の「本人行のみ」ポリシーは service_role との相性問題でバグの温床になったため採用せず
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
