-- ─────────────────────────────────────────────────────────────────────────
-- SaaS 化 Phase 5: 会議カスタマイズ機能 (organization_meetings)
--
-- 組織が会議体を自由に作れる SaaS 化基盤。
-- 各会議は modules 配列で構成されるステップ式進行:
--   - individual_report  個人報告 (振り返り + 今日のタスク)
--   - ka_review          KA 確認
--   - kr_review          KR 確認
--   - shared_items       共有事項
--   - confirmations      確認事項
--   - next_actions       ネクストアクション
--
-- 既存運用 (lib/meetings.js の固定リスト) を neo-fukuoka 組織の seed として投入。
-- 既存 weekly_mtg_sessions.meeting_key とは文字列で論理紐付け (FK 制約はなし)。
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_meetings (
  id              BIGSERIAL  PRIMARY KEY,
  organization_id BIGINT     NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             TEXT       NOT NULL,
  title           TEXT       NOT NULL,
  icon            TEXT,
  color           TEXT,
  modules         JSONB      NOT NULL DEFAULT '[]'::jsonb,
  target_filter   JSONB,
  day_of_week     INT,
  sort_order      INT        DEFAULT 0,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_organization_meetings_org
  ON organization_meetings (organization_id, sort_order)
  WHERE archived_at IS NULL;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION set_organization_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organization_meetings_updated_at ON organization_meetings;
CREATE TRIGGER trg_organization_meetings_updated_at
  BEFORE UPDATE ON organization_meetings
  FOR EACH ROW EXECUTE FUNCTION set_organization_meetings_updated_at();

-- RLS (Phase 1 multitenant の allow_all パターン)
ALTER TABLE organization_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_organization_meetings ON organization_meetings;
CREATE POLICY allow_all_organization_meetings ON organization_meetings
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────────────────
-- neo-fukuoka 用 seed (既存 lib/meetings.js の MEETINGS を移行)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_org_id BIGINT;
  v_modules_morning  JSONB;
  v_modules_ka_first JSONB;
  v_modules_kr_first JSONB;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'neo-fukuoka';
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'neo-fukuoka organization not found, skipping seed';
    RETURN;
  END IF;

  -- モジュール構成テンプレート
  v_modules_morning := jsonb_build_array(
    jsonb_build_object('type', 'individual_report', 'sort_order', 1, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'shared_items',      'sort_order', 2, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'confirmations',     'sort_order', 3, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'next_actions',      'sort_order', 4, 'config', '{}'::jsonb)
  );

  v_modules_ka_first := jsonb_build_array(
    jsonb_build_object('type', 'ka_review',     'sort_order', 1, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'kr_review',     'sort_order', 2, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'shared_items',  'sort_order', 3, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'confirmations', 'sort_order', 4, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'next_actions',  'sort_order', 5, 'config', '{}'::jsonb)
  );

  v_modules_kr_first := jsonb_build_array(
    jsonb_build_object('type', 'kr_review',     'sort_order', 1, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'ka_review',     'sort_order', 2, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'shared_items',  'sort_order', 3, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'confirmations', 'sort_order', 4, 'config', '{}'::jsonb),
    jsonb_build_object('type', 'next_actions',  'sort_order', 5, 'config', '{}'::jsonb)
  );

  -- 朝会
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'morning', '朝会', '🌅', '#ff9f43',
    v_modules_morning, NULL, NULL, 0)
  ON CONFLICT (organization_id, key) DO NOTHING;

  -- 週次キックオフ (KA重点) — パートナー / ユース / コミュニティ
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'kickoff-partner', '週次キックオフ（パートナー事業部）', '🚀', '#4d9fff',
    v_modules_ka_first,
    jsonb_build_object('scope', 'teams-of', 'parentLevelName', 'パートナー事業部'),
    1, 10)
  ON CONFLICT (organization_id, key) DO NOTHING;

  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'kickoff-youth', '週次キックオフ（ユース事業部）', '🌱', '#ffd166',
    v_modules_ka_first,
    jsonb_build_object('scope', 'teams-of', 'parentLevelName', 'ユース事業部'),
    1, 20)
  ON CONFLICT (organization_id, key) DO NOTHING;

  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'kickoff-community', '週次キックオフ（コミュニティ事業部）', '🏛️', '#ff6b6b',
    v_modules_ka_first,
    jsonb_build_object('scope', 'teams-of', 'parentLevelName', 'コミュニティ事業部'),
    1, 30)
  ON CONFLICT (organization_id, key) DO NOTHING;

  -- 営業定例 (KA重点)
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'sales', '営業定例', '💰', '#FF9500',
    v_modules_ka_first,
    jsonb_build_object('scope', 'specific-team', 'teamName', 'セールス'),
    2, 40)
  ON CONFLICT (organization_id, key) DO NOTHING;

  -- マネージャー定例 (KR重点 + withDiscussion)
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'manager', 'マネージャー定例', '👔', '#00d68f',
    v_modules_kr_first,
    jsonb_build_object('scope', 'all-teams', 'withDiscussion', true, 'levelSelect', 'department'),
    3, 50)
  ON CONFLICT (organization_id, key) DO NOTHING;

  -- 経営企画会議 (KR重点)
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'planning', '経営企画会議', '📋', '#ffd166',
    v_modules_kr_first,
    jsonb_build_object('scope', 'teams-of', 'parentLevelName', '経営企画部'),
    4, 60)
  ON CONFLICT (organization_id, key) DO NOTHING;

  -- 役員会議 (KR重点 / 全事業部合同)
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'board', '役員会議', '🏛️', '#5856d6',
    v_modules_kr_first,
    jsonb_build_object('scope', 'all-departments'),
    4, 70)
  ON CONFLICT (organization_id, key) DO NOTHING;

  -- ディレクター確認会議 (KR重点)
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'director', 'ディレクター確認会議', '📊', '#a855f7',
    v_modules_kr_first,
    jsonb_build_object('scope', 'all-teams'),
    5, 80)
  ON CONFLICT (organization_id, key) DO NOTHING;

  -- プログラム別定例 (KA重点 / 全階層 / プログラムタグ必須)
  INSERT INTO organization_meetings (organization_id, key, title, icon, color, modules, target_filter, day_of_week, sort_order)
  VALUES (v_org_id, 'program-regular', 'プログラム別定例', '🏷', '#6B96C7',
    v_modules_ka_first,
    jsonb_build_object('scope', 'all-levels', 'requiresProgram', true),
    NULL, 90)
  ON CONFLICT (organization_id, key) DO NOTHING;

  RAISE NOTICE 'seeded organization_meetings for neo-fukuoka';
END $$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 検証クエリ
-- ─────────────────────────────────────────────────────────────────────────
-- select om.key, om.title, jsonb_array_length(om.modules) as module_count
--   from organization_meetings om
--   join organizations o on o.id = om.organization_id
--   where o.slug = 'neo-fukuoka'
--   order by om.sort_order;
