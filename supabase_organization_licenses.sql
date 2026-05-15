-- ─────────────────────────────────────────────────────────────────────────────
-- SaaS化 Phase 5: myAI ライセンスキー連携
--   - 組織単位で myAI 発行のライセンスキーを保持し、active か否かを定期検証する
--   - inactive 時はソフトロック (アプリ上部にバナー表示) で再契約を促す
--   - 一部組織 (neo-fukuoka など) は grandfathered として検証をスキップする
--
-- 適用後の運用:
--   1. organizations.license_grandfathered = TRUE の組織はライセンス不要で利用可
--   2. それ以外の組織は organization_licenses に有効なキーが必要
--   3. last_verified_at が古い (60秒以上) 場合、サーバー API が再検証する
--   4. 課金量 (seat_count_reported) は将来の従量課金エンドポイント実装で利用
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) organizations に grandfathered フラグを追加 (既存組織の免除用)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS license_grandfathered BOOLEAN NOT NULL DEFAULT FALSE;

-- 既存組織のホワイトリスト (リリース時点で利用中の組織)
UPDATE organizations
   SET license_grandfathered = TRUE
 WHERE slug IN ('neo-fukuoka');

-- 2) organization_licenses テーブル (組織 = 1 ライセンス)
CREATE TABLE IF NOT EXISTS organization_licenses (
  organization_id     BIGINT       PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  license_key         TEXT         NOT NULL,
  product_id          TEXT,
  buyer_external_id   TEXT,
  billing_type        TEXT,
  expires_at          TIMESTAMPTZ,
  active              BOOLEAN      NOT NULL DEFAULT FALSE,
  last_reason         TEXT,
  last_verified_at    TIMESTAMPTZ,
  seat_count_reported INT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_licenses_active_idx
  ON organization_licenses (active);

CREATE INDEX IF NOT EXISTS organization_licenses_buyer_idx
  ON organization_licenses (buyer_external_id);

-- updated_at を自動で進めるトリガー (既存テーブルで使っているパターン踏襲)
CREATE OR REPLACE FUNCTION set_organization_licenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organization_licenses_updated_at ON organization_licenses;
CREATE TRIGGER trg_organization_licenses_updated_at
  BEFORE UPDATE ON organization_licenses
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_licenses_updated_at();

-- 3) RLS (現状 Phase 1 の allow_all 方針に合わせる。詳細制御は service-role 経由 API でやる)
ALTER TABLE organization_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_organization_licenses ON organization_licenses;
CREATE POLICY allow_all_organization_licenses ON organization_licenses
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
