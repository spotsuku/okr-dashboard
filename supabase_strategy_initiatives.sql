-- ============================================================
-- 経営戦略ページ用テーブル
--   1. kr_strategies   — KRごとの「経営からのメッセージ」(narrative)
--   2. kr_initiatives  — KRに紐づく施策 (深化/探索, 検証中/成功/失敗 等)
--
-- 狙い: 「重要KRをどう達成するか」を社員が見て理解できる。
--   - 経営の戦略意図 (テキスト)
--   - 試している施策と現在のステータス
--   - 失敗した施策の理由 (社員の納得感)
-- ============================================================

CREATE TABLE IF NOT EXISTS kr_strategies (
  id              BIGSERIAL PRIMARY KEY,
  kr_id           BIGINT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  message         TEXT NOT NULL DEFAULT '',
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(kr_id)
);
CREATE INDEX IF NOT EXISTS kr_strategies_kr_idx ON kr_strategies(kr_id);
CREATE INDEX IF NOT EXISTS kr_strategies_org_idx ON kr_strategies(organization_id);

CREATE TABLE IF NOT EXISTS kr_initiatives (
  id              BIGSERIAL PRIMARY KEY,
  kr_id           BIGINT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  -- mode: 'exploit'=深化(既存パターンを伸ばす) / 'explore'=探索(新しい打ち手)
  mode            TEXT NOT NULL DEFAULT 'exploit'
                    CHECK (mode IN ('exploit', 'explore')),
  -- status: 検証中 / 成功 / 失敗 / 停止
  status          TEXT NOT NULL DEFAULT 'testing'
                    CHECK (status IN ('testing', 'success', 'failure', 'paused')),
  failure_reason  TEXT DEFAULT '',           -- status='failure' のときの理由
  target_value    NUMERIC,                    -- この施策の寄与目標 (単位はKRに従う)
  actual_value    NUMERIC,                    -- 実績
  unit            TEXT DEFAULT '',
  owner           TEXT,                       -- 推進担当
  sort_order      INT DEFAULT 0,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS kr_initiatives_kr_idx ON kr_initiatives(kr_id, sort_order);
CREATE INDEX IF NOT EXISTS kr_initiatives_status_idx ON kr_initiatives(status);
CREATE INDEX IF NOT EXISTS kr_initiatives_org_idx ON kr_initiatives(organization_id);

-- マルチテナント default org トリガ (既存の set_default_organization_id() を流用)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_default_organization_id') THEN
    DROP TRIGGER IF EXISTS set_org_id_kr_strategies ON kr_strategies;
    EXECUTE 'CREATE TRIGGER set_org_id_kr_strategies
             BEFORE INSERT ON kr_strategies
             FOR EACH ROW EXECUTE FUNCTION set_default_organization_id()';
    DROP TRIGGER IF EXISTS set_org_id_kr_initiatives ON kr_initiatives;
    EXECUTE 'CREATE TRIGGER set_org_id_kr_initiatives
             BEFORE INSERT ON kr_initiatives
             FOR EACH ROW EXECUTE FUNCTION set_default_organization_id()';
  END IF;
END $$;

-- RLS
ALTER TABLE kr_strategies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kr_initiatives  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kr_strategies_all   ON kr_strategies;
DROP POLICY IF EXISTS kr_initiatives_all  ON kr_initiatives;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_org_ids') THEN
    -- マルチテナント: 自組織のみ
    EXECUTE 'CREATE POLICY kr_strategies_all ON kr_strategies
             FOR ALL USING (organization_id IN (SELECT current_org_ids()))
                       WITH CHECK (organization_id IN (SELECT current_org_ids()))';
    EXECUTE 'CREATE POLICY kr_initiatives_all ON kr_initiatives
             FOR ALL USING (organization_id IN (SELECT current_org_ids()))
                       WITH CHECK (organization_id IN (SELECT current_org_ids()))';
  ELSE
    -- フォールバック (current_org_ids 未定義環境): 全許可
    EXECUTE 'CREATE POLICY kr_strategies_all ON kr_strategies FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY kr_initiatives_all ON kr_initiatives FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.kr_strategies;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.kr_initiatives;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

-- 確認
SELECT 'kr_strategies' AS table_name, count(*) AS rows FROM kr_strategies
UNION ALL SELECT 'kr_initiatives', count(*) FROM kr_initiatives;
