-- ════════════════════════════════════════════════════════════════════════════
-- マルチテナント化 Phase 2: RLS 強化 + 組織自動解決
-- ════════════════════════════════════════════════════════════════════════════
--
-- このマイグレーションは:
--   1. current_org_ids() 関数を作成 (auth.jwt() の email から所属org解決)
--   2. 全データテーブルの RLS ポリシーを「自分の所属org のみ」に強化
--   3. INSERT トリガを更新して「現在ユーザーの org」を自動付与
--
-- 前提: Phase 1 (supabase_multitenant_phase1.sql) が実行済み
-- 実行: staging で実行・動作確認 → 本番にも適用
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. current_org_ids(): JWT から所属orgリストを返すヘルパ関数
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_org_ids() RETURNS SETOF BIGINT AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Supabase Auth の JWT から email を取得
  BEGIN
    user_email := auth.jwt() ->> 'email';
  EXCEPTION WHEN OTHERS THEN
    user_email := NULL;
  END;

  IF user_email IS NULL OR user_email = '' THEN
    -- 未認証 (anon) の場合: アクセス拒否のため空集合
    RETURN;
  END IF;

  RETURN QUERY
  SELECT om.organization_id
  FROM organization_members om
  JOIN members m ON m.id = om.member_id
  WHERE LOWER(m.email) = LOWER(user_email);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- 2. INSERT トリガを更新: 現在ユーザーの org を自動付与
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_default_organization_id() RETURNS TRIGGER AS $$
DECLARE
  default_org_id BIGINT;
BEGIN
  IF NEW.organization_id IS NULL THEN
    -- 現在ユーザーの所属orgの先頭を採用
    SELECT id INTO default_org_id FROM current_org_ids() AS oid(id) LIMIT 1;
    -- フォールバック: NEO福岡
    IF default_org_id IS NULL THEN
      SELECT id INTO default_org_id FROM organizations WHERE slug='neo-fukuoka';
    END IF;
    NEW.organization_id := default_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- 3. 全テーブルの RLS ポリシーを org-scoped に差し替え
-- ─────────────────────────────────────────────
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
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY table_list LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name=tbl AND table_schema='public') THEN
      -- 既存のRLSポリシーを全削除 (allow_all などが残っていることを想定)
      FOR policy_name IN
        SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', tbl)::regclass
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);
      END LOOP;
      -- RLS 有効化 (再確認)
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      -- org-scoped ポリシー: SELECT は所属org一致 / WRITE も同じ
      EXECUTE format(
        'CREATE POLICY org_scoped ON public.%I FOR ALL TO authenticated, anon
           USING (organization_id IN (SELECT current_org_ids()))
           WITH CHECK (organization_id IN (SELECT current_org_ids()))',
        tbl
      );
      RAISE NOTICE 'RLS hardened: %', tbl;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- 4. organizations / organization_members の RLS
-- ─────────────────────────────────────────────
-- organizations: 自分が所属しているorgのみ閲覧可
DROP POLICY IF EXISTS "allow_all_organizations" ON organizations;
DROP POLICY IF EXISTS "org_self_view" ON organizations;
CREATE POLICY org_self_view ON organizations FOR SELECT TO authenticated, anon
  USING (id IN (SELECT current_org_ids()));
-- 書込はサーバ経由のみ (RPC や service_role) を想定し、anon/authenticated には許可しない
-- → owner/admin のロール判定は API ルートで実施

-- organization_members: 自分の所属orgメンバーのみ閲覧可
DROP POLICY IF EXISTS "allow_all_organization_members" ON organization_members;
DROP POLICY IF EXISTS "org_members_view" ON organization_members;
CREATE POLICY org_members_view ON organization_members FOR SELECT TO authenticated, anon
  USING (organization_id IN (SELECT current_org_ids()));

-- ─────────────────────────────────────────────
-- 5. 検証用ビュー (optional)
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW my_orgs AS
  SELECT o.* FROM organizations o
  WHERE o.id IN (SELECT current_org_ids());

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- 検証クエリ
-- ════════════════════════════════════════════════════════════════════════════
-- ログイン状態でブラウザからアプリを開き、以下を確認:
--   1. 既存データが全て読める (NEO福岡 org の data 全部見える)
--   2. 新規 INSERT が NEO福岡 org に自動的に紐付く (トリガ動作)
--   3. SELECT * FROM my_orgs; → NEO福岡 が1件返る (Supabase SQL Editor は service_role なので
--      実際の検証はアプリ経由で)
-- ════════════════════════════════════════════════════════════════════════════
