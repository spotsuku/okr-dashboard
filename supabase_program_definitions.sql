-- ════════════════════════════════════════════════════════════════════════════
-- program_definitions — プログラムタグのマスタテーブル
-- ════════════════════════════════════════════════════════════════════════════
--
-- 目的:
--   objectives.program_tags / key_results.program_tags を free-form 入力に
--   していると表記ゆれ (「プログラム A」「プログラムＡ」「Program A」等)
--   が発生する。事前定義した program_definitions のみを選択可能にする
--   ことで一貫性を担保する。
--
-- 仕様:
--   - 1 organization につき 1 マスタ (organization_id でスコープ)
--   - name は org 内で UNIQUE
--   - 既存データから自動 seed (objectives + key_results の program_tags
--     から distinct な name を抽出して INSERT)
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS program_definitions (
  id              BIGSERIAL PRIMARY KEY,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,                              -- 任意 (UI のチップ色)
  description     TEXT,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS program_definitions_org_idx
  ON program_definitions (organization_id);

-- ─── RLS (Phase 2 と同じ org-scoped ポリシー) ─────────────────────────
ALTER TABLE program_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_scoped ON program_definitions;
CREATE POLICY org_scoped ON program_definitions FOR ALL TO authenticated, anon
  USING (organization_id IN (SELECT current_org_ids()))
  WITH CHECK (organization_id IN (SELECT current_org_ids()));

-- ─── INSERT トリガで organization_id を自動付与 (Phase 2 と同じ仕組み) ─
DROP TRIGGER IF EXISTS set_default_org_id_program_definitions ON program_definitions;
CREATE TRIGGER set_default_org_id_program_definitions
  BEFORE INSERT ON program_definitions
  FOR EACH ROW EXECUTE FUNCTION set_default_organization_id();

-- ─── 既存タグから自動 seed ─────────────────────────────────────────
-- objectives.program_tags と key_results.program_tags から distinct な
-- (organization_id, name) を抽出し、program_definitions に INSERT する
-- (重複は ON CONFLICT で無視)。
INSERT INTO program_definitions (organization_id, name)
SELECT DISTINCT o.organization_id, t AS name
FROM objectives o
CROSS JOIN LATERAL UNNEST(COALESCE(o.program_tags, '{}'::TEXT[])) AS t
WHERE o.program_tags IS NOT NULL AND array_length(o.program_tags, 1) > 0
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO program_definitions (organization_id, name)
SELECT DISTINCT k.organization_id, t AS name
FROM key_results k
CROSS JOIN LATERAL UNNEST(COALESCE(k.program_tags, '{}'::TEXT[])) AS t
WHERE k.program_tags IS NOT NULL AND array_length(k.program_tags, 1) > 0
ON CONFLICT (organization_id, name) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- 検証クエリ
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT * FROM program_definitions ORDER BY organization_id, name;
-- SELECT count(*) FROM program_definitions;  -- 既存タグ数と一致するはず
