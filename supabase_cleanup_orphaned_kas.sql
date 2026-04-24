-- 未完成の「新しいKA」プレースホルダーを一掃する (任意実行)
-- 条件: ka_title='新しいKA' かつ owner 空 かつ good/more/focus_output が全て空
-- 実行前に SELECT で件数確認してから DELETE を実行してください

-- ① 対象件数を確認
SELECT COUNT(*) AS orphaned_count
  FROM weekly_reports
 WHERE COALESCE(TRIM(ka_title), '') = '新しいKA'
   AND COALESCE(TRIM(owner), '') = ''
   AND COALESCE(TRIM(good), '') = ''
   AND COALESCE(TRIM(more), '') = ''
   AND COALESCE(TRIM(focus_output), '') = '';

-- ② 対象を一覧確認 (任意)
SELECT id, week_start, kr_id, kr_title, ka_title, owner, status
  FROM weekly_reports
 WHERE COALESCE(TRIM(ka_title), '') = '新しいKA'
   AND COALESCE(TRIM(owner), '') = ''
   AND COALESCE(TRIM(good), '') = ''
   AND COALESCE(TRIM(more), '') = ''
   AND COALESCE(TRIM(focus_output), '') = ''
 ORDER BY week_start, id;

-- ③ 実際の削除 (上記結果を確認してから実行)
DELETE FROM weekly_reports
 WHERE COALESCE(TRIM(ka_title), '') = '新しいKA'
   AND COALESCE(TRIM(owner), '') = ''
   AND COALESCE(TRIM(good), '') = ''
   AND COALESCE(TRIM(more), '') = ''
   AND COALESCE(TRIM(focus_output), '') = '';
