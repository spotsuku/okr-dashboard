-- ════════════════════════════════════════════════════════════════════════════
-- マルチテナント Phase 5: RLS 包括ハードニング (他組織データ漏洩の構造的封じ込め)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 目的:
--   「クライアントを信用せず、DB が他組織の行を物理的に返さない」標準 SaaS 方式を
--   全 org スコープテーブルに徹底する。phase2 を内包しつつ、phase2 のリストから
--   漏れていたテーブル (organization_meetings / organization_licenses / kr_strategies /
--   kr_initiatives / coaching_chats / program_definitions / monthly_1on1 /
--   coaching_profiles / kr_progress_snapshots / kr_strategy_messages) も対象に追加する。
--
-- このマイグレーションは自己完結 (phase1 で organization_id 列が付与済みである前提のみ)。
-- phase2 を未適用でも、本ファイル単体で全テーブルが org_scoped になる。
--
-- ⚠️ 適用前の必須確認 (RLS は auth.jwt() の email と members.email の一致で所属orgを解決):
--   下記を実行し、ログイン email と members.email がズレているメンバーがいないか確認する。
--   ズレているとそのユーザーは自分のデータも見えなくなる。
--     -- Supabase Auth のユーザー一覧 (auth.users) と members.email の突合
--     SELECT u.email AS auth_email, m.email AS member_email, m.name
--       FROM auth.users u
--       LEFT JOIN members m ON LOWER(m.email) = LOWER(u.email)
--      WHERE m.id IS NULL;   -- ここに出る auth ユーザーは members と紐づかない (要手当て)
--
-- 実行手順:
--   1. staging で実行 → 主要メンバー (各組織1名以上) でログインし全画面が正常表示されるか確認
--   2. 問題なければ本番で実行
--   全て冪等 (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS)。
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. current_org_ids(): JWT(email) から所属組織を解決 (phase2 と同一・冪等)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_org_ids() RETURNS SETOF BIGINT AS $$
DECLARE
  user_email TEXT;
BEGIN
  BEGIN
    user_email := auth.jwt() ->> 'email';
  EXCEPTION WHEN OTHERS THEN
    user_email := NULL;
  END;
  IF user_email IS NULL OR user_email = '' THEN
    RETURN;  -- 未認証 (anon) はアクセス不可
  END IF;
  RETURN QUERY
  SELECT om.organization_id
    FROM organization_members om
    JOIN members m ON m.id = om.member_id
   WHERE LOWER(m.email) = LOWER(user_email);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- 2. INSERT 時に現在ユーザーの org を自動付与 (phase2 と同一・冪等)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_default_organization_id() RETURNS TRIGGER AS $$
DECLARE
  default_org_id BIGINT;
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT id INTO default_org_id FROM current_org_ids() AS oid(id) LIMIT 1;
    IF default_org_id IS NULL THEN
      SELECT id INTO default_org_id FROM organizations WHERE slug = 'neo-fukuoka';
    END IF;
    NEW.organization_id := default_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- 3. phase2 リスト漏れテーブルに organization_id 列を追加 + backfill
--    (既存データは現状すべて NEO福岡 のため、解決できないものは NEO福岡 にフォールバック)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  neo_id BIGINT;
BEGIN
  SELECT id INTO neo_id FROM organizations WHERE slug = 'neo-fukuoka';

  -- monthly_1on1 (owner = メンバー名)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='monthly_1on1') THEN
    ALTER TABLE public.monthly_1on1 ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS monthly_1on1_org_idx ON public.monthly_1on1 (organization_id);
    UPDATE public.monthly_1on1 t
       SET organization_id = COALESCE(
         (SELECT m.organization_id FROM members m WHERE m.name = t.owner AND m.organization_id IS NOT NULL LIMIT 1),
         neo_id)
     WHERE t.organization_id IS NULL;
  END IF;

  -- coaching_profiles (owner = メンバー名, PK=owner なので将来は (owner,org) 化が望ましい)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='coaching_profiles') THEN
    ALTER TABLE public.coaching_profiles ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS coaching_profiles_org_idx ON public.coaching_profiles (organization_id);
    UPDATE public.coaching_profiles t
       SET organization_id = COALESCE(
         (SELECT m.organization_id FROM members m WHERE m.name = t.owner AND m.organization_id IS NOT NULL LIMIT 1),
         neo_id)
     WHERE t.organization_id IS NULL;
  END IF;

  -- kr_progress_snapshots (kr_id → key_results.organization_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kr_progress_snapshots') THEN
    ALTER TABLE public.kr_progress_snapshots ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS kr_progress_snapshots_org_idx ON public.kr_progress_snapshots (organization_id);
    UPDATE public.kr_progress_snapshots t
       SET organization_id = COALESCE(
         (SELECT k.organization_id FROM key_results k WHERE k.id = t.kr_id),
         neo_id)
     WHERE t.organization_id IS NULL;
  END IF;

  -- kr_strategy_messages (kr_id → key_results.organization_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kr_strategy_messages') THEN
    ALTER TABLE public.kr_strategy_messages ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS kr_strategy_messages_org_idx ON public.kr_strategy_messages (organization_id);
    UPDATE public.kr_strategy_messages t
       SET organization_id = COALESCE(
         (SELECT k.organization_id FROM key_results k WHERE k.id = t.kr_id),
         neo_id)
     WHERE t.organization_id IS NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 4. 全 org スコープテーブルに org_scoped RLS + INSERT トリガを適用
--    (organization_id 列を持つテーブルだけを対象にする安全ガード付き)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
  table_list TEXT[] := ARRAY[
    -- phase1/phase2 の 22 テーブル
    'levels', 'members', 'objectives', 'key_results',
    'weekly_reports', 'ka_tasks', 'kr_weekly_reviews', 'team_weekly_summary',
    'member_confirmations', 'member_confirmation_replies',
    'morning_meetings', 'weekly_mtg_sessions',
    'coaching_logs', 'org_tasks', 'org_team_meta', 'org_task_history', 'org_task_manuals', 'org_member_jd',
    'milestones', 'user_integrations', 'ai_premises', 'coo_knowledge',
    -- phase2 から漏れていた追加テーブル
    'organization_meetings', 'organization_licenses',
    'kr_strategies', 'kr_initiatives', 'coaching_chats', 'program_definitions',
    'monthly_1on1', 'coaching_profiles', 'kr_progress_snapshots', 'kr_strategy_messages'
  ];
BEGIN
  FOREACH tbl IN ARRAY table_list LOOP
    -- テーブルが存在し、かつ organization_id 列を持つ場合のみ適用
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=tbl AND column_name='organization_id'
    ) THEN
      -- 既存ポリシーを全削除 (allow_all 等の素通しを除去)
      FOR policy_name IN
        SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', tbl)::regclass
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format(
        'CREATE POLICY org_scoped ON public.%I FOR ALL TO authenticated, anon
           USING (organization_id IN (SELECT current_org_ids()))
           WITH CHECK (organization_id IN (SELECT current_org_ids()))',
        tbl
      );

      -- INSERT 時の org 自動付与トリガ (org 未指定でも現在ユーザーの org に入る)
      EXECUTE format('DROP TRIGGER IF EXISTS set_default_org_id_%I ON public.%I', tbl, tbl);
      EXECUTE format('CREATE TRIGGER set_default_org_id_%I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION set_default_organization_id()', tbl, tbl);

      RAISE NOTICE 'RLS hardened: %', tbl;
    ELSE
      RAISE NOTICE 'skipped (no organization_id or table missing): %', tbl;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- 5. organizations / organization_members は「所属組織のみ閲覧」(phase2 と同一)
-- ─────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_organizations" ON organizations;
DROP POLICY IF EXISTS "org_self_view" ON organizations;
CREATE POLICY org_self_view ON organizations FOR SELECT TO authenticated, anon
  USING (id IN (SELECT current_org_ids()));

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_organization_members" ON organization_members;
DROP POLICY IF EXISTS "org_members_view" ON organization_members;
CREATE POLICY org_members_view ON organization_members FOR SELECT TO authenticated, anon
  USING (organization_id IN (SELECT current_org_ids()));

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- 適用後の検証 (手動)
-- ════════════════════════════════════════════════════════════════════════════
--   -- 各テーブルに org_scoped ポリシーが付いているか
--   SELECT relname, polname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
--    WHERE polname='org_scoped' ORDER BY relname;
--   -- backfill 漏れ (NULL org) がないか (追加4テーブル)
--   SELECT 'monthly_1on1' t, count(*) FROM monthly_1on1 WHERE organization_id IS NULL
--   UNION ALL SELECT 'coaching_profiles', count(*) FROM coaching_profiles WHERE organization_id IS NULL
--   UNION ALL SELECT 'kr_progress_snapshots', count(*) FROM kr_progress_snapshots WHERE organization_id IS NULL
--   UNION ALL SELECT 'kr_strategy_messages', count(*) FROM kr_strategy_messages WHERE organization_id IS NULL;
--
-- 既知の残課題 (別途対応):
--   - coaching_profiles の PK が owner 単独。別組織に同名メンバーがいると衝突するため、
--     将来的に PK を (owner, organization_id) へ変更するのが望ましい。
--   - service role を使う API ルート (coo/ai, ai/team-summary 等) は RLS をバイパスするため、
--     アプリ側で organization_id フィルタを明示する必要がある (Step 2 で対応)。
-- ════════════════════════════════════════════════════════════════════════════
