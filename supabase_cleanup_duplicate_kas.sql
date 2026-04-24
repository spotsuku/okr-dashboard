-- 【事前】owner の NULL を '' に正規化 (コード側 .eq() の NULL 取りこぼし対策)
--   以降の重複判定・削除が正しく機能するように先にこれを実行してください
UPDATE weekly_reports SET owner = '' WHERE owner IS NULL;
UPDATE weekly_reports SET ka_title = '' WHERE ka_title IS NULL;

-- 重複した weekly_reports を整理する SQL (任意実行)
--
-- 対象: 同じ (kr_id, ka_title, owner, objective_id, week_start) で複数レコードが
--      存在する状態を、1 件だけ残して他を削除する。
--
-- 残す行の優先順位:
--   1. 本文 (good + more + focus_output) が最も充実している行
--   2. それでも同順なら 最も古い id を残す
-- 削除対象:
--   ka_tasks が紐づく行は外部キー CASCADE で一緒に消えるので、
--   事前にタスクが付いている重複行に注意 (プレースホルダー側から消す)
--
-- 実行前に必ず ① で件数・内容を確認してから ② を実行してください。

-- ① 重複しているグループを一覧
SELECT
  kr_id, ka_title, owner, objective_id, week_start,
  COUNT(*) AS dup_count,
  ARRAY_AGG(id ORDER BY id) AS ids
FROM weekly_reports
GROUP BY kr_id, ka_title, owner, objective_id, week_start
HAVING COUNT(*) > 1
ORDER BY dup_count DESC, ka_title;

-- ② 実際の削除 (上記で納得いく件数なら実行)
--    「残す1件」の決め方: 本文の合計文字数が最大 → 同点なら id 最小
WITH ranked AS (
  SELECT id, kr_id, ka_title, owner, objective_id, week_start,
         ROW_NUMBER() OVER (
           PARTITION BY kr_id, ka_title, owner, objective_id, week_start
           ORDER BY
             (COALESCE(LENGTH(good),0) + COALESCE(LENGTH(more),0) + COALESCE(LENGTH(focus_output),0)) DESC,
             id ASC
         ) AS rn
    FROM weekly_reports
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM weekly_reports
 WHERE id IN (SELECT id FROM to_delete);

-- ③ 再度 ① のクエリで 結果 0行になっていることを確認
