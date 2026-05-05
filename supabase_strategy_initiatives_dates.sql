-- ============================================================
-- 経営戦略の施策に「検証期間」(start_date / end_date) を追加
-- 既存の kr_initiatives テーブルに 2 カラム追加するだけの軽量マイグレーション
-- ============================================================

ALTER TABLE kr_initiatives
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date   DATE;

CREATE INDEX IF NOT EXISTS kr_initiatives_period_idx
  ON kr_initiatives (start_date, end_date);

NOTIFY pgrst, 'reload schema';
