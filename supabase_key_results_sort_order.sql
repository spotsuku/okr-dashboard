-- ============================================================
-- key_results.sort_order 列の追加
-- ============================================================
-- 本番 (supabase_setup.sql 由来) には key_results.sort_order が
-- 存在しないため、KR の並び替え機能 (▲▼ ボタン) で 400 エラーが
-- 発生する。本マイグレーションで列を追加する。
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。
-- ============================================================

ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS key_results_sort_idx
  ON key_results (objective_id, sort_order);

NOTIFY pgrst, 'reload schema';
