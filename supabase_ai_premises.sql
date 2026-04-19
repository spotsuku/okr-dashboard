-- ─────────────────────────────────────────────
-- ai_premises テーブル（AI前提条件）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_premises (
  id          BIGSERIAL PRIMARY KEY,
  content     TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_premises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage ai_premises" ON ai_premises;
CREATE POLICY "auth users can manage ai_premises"
  ON ai_premises FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 初期データ
INSERT INTO ai_premises (content, sort_order) VALUES
('通期のKAとQ期のKAは重複しない。両方のKA数を合計して「忙しすぎる」と判断しないこと。', 1),
('月末（25日以降）には、Q期のKAが通期OKRの達成にどうつながっているか確認を促す。', 2),
('OKRはストレッチ目標なので、達成率70%程度が健全。100%未満でも過度に危機感を煽らない。', 3),
('KAは四半期の中期アクション。MoreのKAは打ち手として有効でない可能性がある。具体的な代替アクションや見直しを提案すること。', 4);

-- ─────────────────────────────────────────────
-- coaching_logs テーブル（AIコーチングログ）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coaching_logs (
  id          BIGSERIAL PRIMARY KEY,
  owner       TEXT NOT NULL DEFAULT '',
  week_start  DATE NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  log_type    TEXT NOT NULL DEFAULT 'action_plan',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coaching_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage coaching_logs" ON coaching_logs;
CREATE POLICY "auth users can manage coaching_logs"
  ON coaching_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
