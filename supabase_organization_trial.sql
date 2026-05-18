-- ════════════════════════════════════════════════════════════════════════════
-- organizations.admin_first_login_at — 30日無料トライアル基準日
-- ════════════════════════════════════════════════════════════════════════════
--
-- 仕様:
--   - 管理者 (role=owner/admin) が初めて組織にアクセスした時刻を記録
--   - そこから 30 日間は組織全体が無料利用可能 (ライセンスキー不要)
--   - 30日経過後は組織全員 (管理者 + 招待メンバー) が LicenseGate でロック
--
-- 既存組織:
--   - license_grandfathered = true の組織は無関係 (常時 active)
--   - NEO福岡 (slug='neo-fukuoka') は永久に grandfathered=true を保証
--   - その他の既存 grandfathered=false 組織は SQL 適用時点を NOW() で初期化
--     (= 急に切られない、適用日から30日の猶予)
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS admin_first_login_at TIMESTAMPTZ;

-- NEO福岡は永久にライセンス不要 (grandfathered)
UPDATE organizations
  SET license_grandfathered = TRUE
  WHERE slug = 'neo-fukuoka';

-- 既存 grandfathered=false 組織で admin_first_login_at が未設定なら
-- 今この瞬間を初期値にする (適用日から30日の試用猶予)
UPDATE organizations
  SET admin_first_login_at = NOW()
  WHERE license_grandfathered = FALSE
    AND admin_first_login_at IS NULL;

NOTIFY pgrst, 'reload schema';
