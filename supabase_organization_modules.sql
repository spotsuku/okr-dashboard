-- 組織別モジュール ON/OFF / プラン管理のマイグレーション
-- SaaS 化 Phase C の中核。SAAS_STRATEGY.md と MODULE_MIGRATION_PLAN.md を参照。
--
-- 実行方法:
--   Supabase の SQL エディタでこの SQL を貼り付けて RUN。
--   staging で先に検証してから本番適用。
--
-- 前提:
--   supabase_organization_licenses.sql (PR #120) が先に適用されていること。
--   ※ license_grandfathered カラムをここでも参照する。

-- ─────────────────────────────────────────────────────
-- 1. organizations にプランとモジュール ON/OFF を追加
-- ─────────────────────────────────────────────────────

alter table organizations
  add column if not exists plan text default 'free_trial'
    check (plan in ('free_trial', 'standard', 'standard_plus', 'enterprise'));

alter table organizations
  add column if not exists enabled_modules jsonb default '{}'::jsonb;

-- enabled_modules の構造 (アプリ側で参照するキー):
--   {
--     "google_integration": true,   -- Gmail / Calendar / Drive
--     "ai_chat": true,              -- AIPanel
--     "meeting_integration": true,  -- Notion 議事録 / Slack 通知
--     "okr_full": false,            -- 組織階層 / 親子 OKR / 全社サマリー / AI フィードバック
--     "milestones": false,          -- プロジェクト管理 Add-on
--     "coo_knowledge": false,       -- CFO ナレッジベース (将来 Add-on / 当面 NEO 福岡専用)
--     "workforce": false,           -- 工数管理 (NEO 福岡専用)
--     "portal_neo": false           -- PortalPage 外部リンク集 (NEO 福岡専用)
--   }
--
-- 未定義のキーは false 扱い。

-- 組織レベルラベルの汎用化 (層ラベルが業種で違うため)
alter table organizations
  add column if not exists level_labels jsonb default '{"l1":"経営","l2":"事業部","l3":"チーム"}'::jsonb;

-- ─────────────────────────────────────────────────────
-- 2. neo-fukuoka は grandfathered として全モジュール ON
-- ─────────────────────────────────────────────────────

update organizations
set
  plan = 'enterprise',
  enabled_modules = jsonb_build_object(
    'google_integration', true,
    'ai_chat', true,
    'meeting_integration', true,
    'okr_full', true,
    'milestones', true,
    'coo_knowledge', true,
    'workforce', true,
    'portal_neo', true
  )
where slug = 'neo-fukuoka';

-- ─────────────────────────────────────────────────────
-- 3. 新規組織の既定値 (Standard プラン相当)
-- ─────────────────────────────────────────────────────

-- 注: 上記 update 後に他の組織がある場合の埋め戻し
update organizations
set enabled_modules = jsonb_build_object(
  'google_integration', false,
  'ai_chat', false,
  'meeting_integration', false,
  'okr_full', false,
  'milestones', false,
  'coo_knowledge', false,
  'workforce', false,
  'portal_neo', false
)
where slug <> 'neo-fukuoka'
  and (enabled_modules is null or enabled_modules = '{}'::jsonb);

-- ─────────────────────────────────────────────────────
-- 4. 取得用ヘルパー関数 (アプリから参照しやすく)
-- ─────────────────────────────────────────────────────

create or replace function is_module_enabled(p_org_id uuid, p_module text)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select (enabled_modules ->> p_module)::boolean from organizations where id = p_org_id),
    false
  );
$$;

-- ─────────────────────────────────────────────────────
-- 5. PostgREST スキーマキャッシュリロード
-- ─────────────────────────────────────────────────────

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────
-- 検証クエリ (適用後に実行)
-- ─────────────────────────────────────────────────────
-- select slug, plan, enabled_modules from organizations;
-- select is_module_enabled('<org_uuid>', 'google_integration');
