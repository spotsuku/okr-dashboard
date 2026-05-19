-- ════════════════════════════════════════════════════════════════════════════
-- monthly_1on1 — 月次 1on1 (上司⇄部下の KPT + 成長テーマ)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 仕様:
--   - 部下と上司の両方が「部下 (= owner) の月次 KPT」を書く
--   - 部下はセルフ評価、上司は部下を見た評価。1on1 でこの 2 つを見合わせる
--   - KR進捗 / KR・KA 記入率 (バッジ集計値) を参考に振り返り
--   - 月次の成長テーマを双方で合意 (共同編集)
--
-- 構造:
--   - owner       : 1on1 行の所有者 = 部下メンバー名 (PK 一部)
--   - supervisor  : 上司メンバー名 (NULL なら未設定)
--   - month       : 'YYYY-MM' (PK 一部)
--   - self_*      : 部下が自分について書いたセルフ KPT
--   - boss_*      : 上司が部下を見て書いた KPT
--   - growth_theme: 月次の成長テーマ (双方が編集可)
--   - status      : 'draft' (記入中) / 'shared' (双方公開) / 'completed' (1on1済)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS monthly_1on1 (
  id              BIGSERIAL PRIMARY KEY,
  owner           TEXT NOT NULL,
  supervisor      TEXT,
  month           TEXT NOT NULL,
  self_keep       TEXT,
  self_problem    TEXT,
  self_try        TEXT,
  boss_keep       TEXT,
  boss_problem    TEXT,
  boss_try        TEXT,
  growth_theme    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner, month)
);

CREATE INDEX IF NOT EXISTS monthly_1on1_owner_month_idx
  ON monthly_1on1 (owner, month DESC);

ALTER TABLE monthly_1on1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_1on1_all ON monthly_1on1;
CREATE POLICY monthly_1on1_all ON monthly_1on1
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
