-- ════════════════════════════════════════════════════════════════════════════
-- マルチテナント化 Phase 1: スキーマ拡張 (破壊的変更なし)
-- ════════════════════════════════════════════════════════════════════════════
--
-- このマイグレーションは「組織 (organization)」概念を追加します。
-- 既存のクエリ・アプリ動作は変更しません (アプリ側はまだ org_id を意識しない)。
--
-- 実行手順:
--   1. 必ず staging Supabase で先に実行・動作確認 (本番のミラーバックアップ)
--   2. 問題が無ければ本番でも実行
--
-- ロールバック: 末尾の <ROLLBACK> セクション参照
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. organizations テーブル (組織マスタ)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,           -- 'neo-fukuoka', 'demo' など
  name        TEXT NOT NULL,                   -- 表示名 'NEO福岡' 'Demo Inc.' など
  plan        TEXT NOT NULL DEFAULT 'standard',-- 'standard' | 'demo' | 将来の課金プラン
  fiscal_year_default TEXT DEFAULT '2026',     -- 既定の年度
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (allow_all - Phase 2で本格的なポリシーに差し替え)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_organizations" ON organizations;
CREATE POLICY "allow_all_organizations" ON organizations FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- 2. organization_members テーブル (ユーザーの組織所属 + 役割)
-- ─────────────────────────────────────────────
-- Phase 1 設計: 1 ユーザー = 1 組織 (Slack 方式の複数所属は将来拡張)
-- ただし PRIMARY KEY 構造は (org, member) 複合にして将来複数所属に拡張可能
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id       BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  is_default      BOOLEAN DEFAULT TRUE,            -- Phase 1 では常に TRUE (1ユーザー1組織)
  invited_by      TEXT,                            -- 招待者の email など (将来用)
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, member_id)
);

CREATE INDEX IF NOT EXISTS organization_members_member_idx ON organization_members (member_id);
CREATE INDEX IF NOT EXISTS organization_members_role_idx   ON organization_members (organization_id, role);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_organization_members" ON organization_members;
CREATE POLICY "allow_all_organization_members" ON organization_members FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- 3. デフォルト組織「NEO福岡」を作成
-- ─────────────────────────────────────────────
INSERT INTO organizations (slug, name, plan, fiscal_year_default)
VALUES ('neo-fukuoka', 'NEO福岡', 'standard', '2026')
ON CONFLICT (slug) DO NOTHING;

-- 既存メンバー全員を NEO福岡 org に所属させる (is_admin から role を導出)
INSERT INTO organization_members (organization_id, member_id, role, is_default)
SELECT
  (SELECT id FROM organizations WHERE slug='neo-fukuoka'),
  m.id,
  CASE WHEN m.is_admin THEN 'admin' ELSE 'member' END,
  TRUE
FROM members m
ON CONFLICT (organization_id, member_id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 4. 全データテーブルに organization_id を追加
-- ─────────────────────────────────────────────
-- Phase 1 ではすべて NULL 許可 + デフォルト値で NEO福岡 自動付与
-- Phase 2 で NOT NULL 制約に変更予定

DO $$
DECLARE
  default_org_id BIGINT;
  tbl TEXT;
  table_list TEXT[] := ARRAY[
    'levels', 'members', 'objectives', 'key_results',
    'weekly_reports', 'ka_tasks', 'kr_weekly_reviews', 'team_weekly_summary',
    'member_confirmations', 'member_confirmation_replies',
    'morning_meetings', 'weekly_mtg_sessions',
    'coaching_logs', 'org_tasks', 'org_team_meta', 'org_task_history', 'org_task_manuals', 'org_member_jd',
    'milestones', 'user_integrations', 'ai_premises', 'coo_knowledge'
  ];
BEGIN
  SELECT id INTO default_org_id FROM organizations WHERE slug='neo-fukuoka';

  FOREACH tbl IN ARRAY table_list LOOP
    -- テーブルが存在する場合のみ ALTER 実行
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name=tbl AND table_schema='public') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE', tbl);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organization_id)', tbl || '_org_idx', tbl);
      -- 既存データを NEO福岡 org に backfill (NULL のものだけ)
      EXECUTE format('UPDATE %I SET organization_id = $1 WHERE organization_id IS NULL', tbl) USING default_org_id;
      RAISE NOTICE 'Added organization_id to: %', tbl;
    ELSE
      RAISE NOTICE 'Table not found, skipped: %', tbl;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- 5. INSERT 時に organization_id 未指定なら NEO福岡 を自動付与するトリガ
-- ─────────────────────────────────────────────
-- Phase 1 ではアプリ側は org_id を明示しないので、
-- すべての新規行は自動的に NEO福岡 に紐付く。
-- Phase 2 でアプリが org_id を渡すようになったらこのトリガは外す or 残してフォールバック。

CREATE OR REPLACE FUNCTION set_default_organization_id() RETURNS TRIGGER AS $$
DECLARE
  default_org_id BIGINT;
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT id INTO default_org_id FROM organizations WHERE slug='neo-fukuoka';
    NEW.organization_id := default_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
  table_list TEXT[] := ARRAY[
    'levels', 'members', 'objectives', 'key_results',
    'weekly_reports', 'ka_tasks', 'kr_weekly_reviews', 'team_weekly_summary',
    'member_confirmations', 'member_confirmation_replies',
    'morning_meetings', 'weekly_mtg_sessions',
    'coaching_logs', 'org_tasks', 'org_team_meta', 'org_task_history', 'org_task_manuals', 'org_member_jd',
    'milestones', 'user_integrations', 'ai_premises', 'coo_knowledge'
  ];
BEGIN
  FOREACH tbl IN ARRAY table_list LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name=tbl AND table_schema='public') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_default_org_id_%I ON %I', tbl, tbl);
      EXECUTE format('CREATE TRIGGER set_default_org_id_%I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_default_organization_id()', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- 6. Realtime publication にも追加 (組織関連)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- 検証クエリ (実行後に手動チェック)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT * FROM organizations;                                  -- NEO福岡 が1件
-- SELECT count(*) FROM organization_members;                    -- 全メンバー数と一致
-- SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_count, count(*) AS total FROM levels;
-- SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_count, count(*) AS total FROM members;
-- ... 他テーブルも同様、null_count = 0 が正常

-- ════════════════════════════════════════════════════════════════════════════
-- <ROLLBACK> Phase 1 を取り消す場合
-- ════════════════════════════════════════════════════════════════════════════
-- 全テーブルから organization_id とトリガを削除し、organizations / organization_members を破棄。
-- データ消失はないが、再実行する場合は backfill が再度走る。
--
-- DO $$
-- DECLARE tbl TEXT;
-- BEGIN
--   FOR tbl IN SELECT unnest(ARRAY[
--     'levels','members','objectives','key_results','weekly_reports','ka_tasks',
--     'kr_weekly_reviews','team_weekly_summary','member_confirmations',
--     'member_confirmation_replies','morning_meetings','weekly_mtg_sessions',
--     'coaching_logs','org_tasks','org_team_meta','org_task_history',
--     'org_task_manuals','org_member_jd','milestones','user_integrations',
--     'ai_premises','coo_knowledge'
--   ]) LOOP
--     IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name=tbl AND table_schema='public') THEN
--       EXECUTE format('DROP TRIGGER IF EXISTS set_default_org_id_%I ON %I', tbl, tbl);
--       EXECUTE format('DROP INDEX IF EXISTS %I', tbl || '_org_idx');
--       EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS organization_id', tbl);
--     END IF;
--   END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS set_default_organization_id;
-- DROP TABLE IF EXISTS organization_members;
-- DROP TABLE IF EXISTS organizations;
