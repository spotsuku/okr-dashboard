-- ════════════════════════════════════════════════════════════════════════════
-- members の email 一意制約を「グローバル一意」→「組織ごとに一意」へ変更
-- ════════════════════════════════════════════════════════════════════════════
-- 背景:
--   members は organization_id を持つ per-org 行。だが email がグローバル一意
--   (members_email_lower_uniq) だったため、既存ユーザーが新しい組織を作成/招待
--   されても「新組織用のメンバー行」を作れず、組織図/メンバーJD が 0 人になった。
--
-- 変更:
--   旧: UNIQUE (lower(email))                    ← 1人につき全社で1行のみ
--   新: UNIQUE (lower(email), organization_id)   ← 組織ごとに1行 (複数組織に所属可)
--
-- 既存データは email がグローバル一意なので、新indexでも衝突しない (安全)。
-- 冪等。実行: staging で確認 → 本番。
-- ════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS members_email_lower_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS members_email_org_lower_uniq
  ON public.members (lower(email), organization_id)
  WHERE email IS NOT NULL AND email <> '';

-- 確認: 同一 email が複数組織に存在できるか
--   SELECT lower(email), count(*) FROM members WHERE email <> '' GROUP BY 1 HAVING count(*) > 1;
--   → これは「複数組織に所属する人」が出てくるだけで正常 (旧indexでは不可能だった)
