-- ① 既存データのstart_month/end_monthからstart_date/end_dateを補完
UPDATE milestone_themes
SET
  start_date = CASE
    WHEN start_month >= 4 THEN '2025-' || LPAD(start_month::text, 2, '0') || '-01'
    ELSE '2026-' || LPAD(start_month::text, 2, '0') || '-01'
  END
WHERE (start_date IS NULL OR start_date = '') AND start_month IS NOT NULL;

UPDATE milestone_themes
SET
  end_date = CASE
    WHEN end_month >= 4 THEN '2025-' || LPAD(end_month::text, 2, '0') || '-28'
    ELSE '2026-' || LPAD(end_month::text, 2, '0') || '-28'
  END
WHERE (end_date IS NULL OR end_date = '') AND end_month IS NOT NULL;

-- ② start_month/end_monthカラムを削除
ALTER TABLE milestone_themes DROP COLUMN IF EXISTS start_month;
ALTER TABLE milestone_themes DROP COLUMN IF EXISTS end_month;

-- ③ 確認
SELECT id, title, start_date, end_date, focus_level, status
FROM milestone_themes
ORDER BY org_id, sort_order;
