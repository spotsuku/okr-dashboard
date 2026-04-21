-- ============================================================
-- user_integrations RLS 強化 (本人行のみアクセス可)
-- 既存の supabase_user_integrations.sql 適用後に実行してください
-- ============================================================

-- ─── 既存のゆるいポリシーを削除 ──────────────────────
DROP POLICY IF EXISTS "auth users can manage user_integrations" ON user_integrations;

-- ─── 本人行のみ操作可能 ──────────────────────────────
-- owner (members.name) と認証ユーザーの email → name を突合
CREATE POLICY "own rows - select" ON user_integrations
  FOR SELECT TO authenticated
  USING (owner = (SELECT name FROM members WHERE email = auth.email() LIMIT 1));

CREATE POLICY "own rows - insert" ON user_integrations
  FOR INSERT TO authenticated
  WITH CHECK (owner = (SELECT name FROM members WHERE email = auth.email() LIMIT 1));

CREATE POLICY "own rows - update" ON user_integrations
  FOR UPDATE TO authenticated
  USING (owner = (SELECT name FROM members WHERE email = auth.email() LIMIT 1))
  WITH CHECK (owner = (SELECT name FROM members WHERE email = auth.email() LIMIT 1));

CREATE POLICY "own rows - delete" ON user_integrations
  FOR DELETE TO authenticated
  USING (owner = (SELECT name FROM members WHERE email = auth.email() LIMIT 1));

-- ─── 他メンバーの「接続されているか」を見る公開 View ─────
-- access_token / refresh_token は含めない (機密情報)
-- scope / metadata は含める (画面表示用)
-- View は所有者権限で実行されるため RLS をバイパス
CREATE OR REPLACE VIEW user_integrations_status AS
  SELECT
    owner,
    service,
    expires_at,
    connected_at,
    scope,
    metadata,
    (expires_at IS NULL OR expires_at > NOW()) AS is_active
  FROM user_integrations;

GRANT SELECT ON user_integrations_status TO authenticated;

-- ─── コメント ───────────────────────────────────────
COMMENT ON VIEW user_integrations_status IS
  'トークンを含まない公開ビュー。他メンバーの連携状態 (接続/非接続) だけ参照可';
