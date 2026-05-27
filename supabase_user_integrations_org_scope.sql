-- ============================================================
-- user_integrations を「組織ごと」に分離する (Google 連携のテナント分離)
-- 背景: 従来は UNIQUE(owner, service) でユーザー単位に1行だったため、
--       同じログインIDのユーザーが複数組織に所属すると、どの組織を見ても
--       同じ Google 連携 (Gmail/Drive/Calendar) が使われ、組織を横断して
--       他組織のデータが見えてしまっていた。
-- 対応: organization_id を追加し、UNIQUE(owner, service, organization_id) に変更。
--       連携は「組織ごとに本人が個別に行う」運用とし、組織を絶対にまたがない。
--
-- 本番 / staging の両 Supabase で実行してください。
-- ============================================================

-- 1) 列を追加 (既存行は organization_id = NULL のまま)
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2) 旧ユニーク制約 (owner, service) を撤去
--    制約名は環境により異なるため、存在するものを動的に削除する
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'user_integrations'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE user_integrations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 念のため旧バージョンの既定制約名も明示的に削除
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_owner_service_key;

-- 3) 新しいユニーク制約 (owner, service, organization_id)
--    organization_id を含む複合ユニークインデックス。
--    既存の NULL 組織行は (owner, service, NULL) として一意に共存できる。
CREATE UNIQUE INDEX IF NOT EXISTS user_integrations_owner_service_org_key
  ON user_integrations (owner, service, organization_id);

CREATE INDEX IF NOT EXISTS idx_user_integrations_org
  ON user_integrations (organization_id);

-- 注意:
--  - 既存の連携行 (organization_id = NULL) は、新コードの組織スコープ検索には
--    マッチしません。各ユーザーは利用したい組織で「再連携」してください
--    (= 組織ごとに本人が Google 連携を行う、という新しい運用)。
--  - 古い NULL 行を残したくない場合は、確認のうえ手動で削除して構いません:
--      DELETE FROM user_integrations WHERE organization_id IS NULL;
