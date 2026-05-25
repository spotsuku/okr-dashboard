-- ════════════════════════════════════════════════════════════════════════════
-- 新規組織で「初期ユーザー (オーナー) が出ない」問題のバックフィル
-- ════════════════════════════════════════════════════════════════════════════
-- 背景:
--   members は per-org 行 (organization_id を持つ)。だが旧 email グローバル一意
--   制約 (members_email_lower_uniq) のため、既存ユーザーが新組織を作成/招待
--   されても「新組織用の members 行」を作れず、org/create のフォールバックで
--   「別組織の members 行」を organization_members.member_id に流用していた。
--   結果: 新組織のメンバー一覧 (members を organization_id で絞る) が 0 件になる。
--   → 画面上「メンバー (0)」となり、オーナー本人すら表示されない。
--
-- 対応 (この 1 本で完結・冪等):
--   1) email 一意制約を「グローバル一意」→「組織ごとに一意」へ変更
--      (supabase_org_member_peruser.sql と同等。今後の新規組織作成を正常化)
--   2) organization_members が指す members 行の organization_id が組織と
--      食い違う/欠けている場合、その組織用の members 行を作成
--   3) organization_members.member_id を「その組織の members 行」へ貼り替え
--
-- 安全性:
--   - neo-fukuoka 等、既に organization_id が正しい組織は一切変更されない
--     (organization_id が一致する行は条件にヒットしないため)
--   - 冪等。複数回流しても結果は同じ。
--   実行: Supabase SQL Editor で staging で確認 → 本番。
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) email 一意制約を per-org へ ─────────────────────────────────────────────
DROP INDEX IF EXISTS members_email_lower_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS members_email_org_lower_uniq
  ON public.members (lower(email), organization_id)
  WHERE email IS NOT NULL AND email <> '';

-- ── 2) 組織に属する members 行が無ければ作成 ──────────────────────────────────
--    organization_members が「別組織の members 行」を指している (= フォールバック
--    の痕跡) ものについて、その組織用の members 行を補完する。
WITH need AS (
  SELECT DISTINCT
         om.organization_id AS org_id,
         m.email            AS email,
         m.name             AS name,
         m.is_admin         AS is_admin
  FROM organization_members om
  JOIN members m ON m.id = om.member_id
  WHERE m.organization_id IS DISTINCT FROM om.organization_id
    AND m.email IS NOT NULL AND m.email <> ''
)
INSERT INTO members (email, name, is_admin, organization_id)
SELECT n.email, n.name, COALESCE(n.is_admin, false), n.org_id
FROM need n
WHERE NOT EXISTS (
  SELECT 1 FROM members m2
  WHERE lower(m2.email) = lower(n.email)
    AND m2.organization_id = n.org_id
)
ON CONFLICT DO NOTHING;

-- ── 3) organization_members.member_id を「その組織の members 行」へ貼り替え ──────
UPDATE organization_members om
SET member_id = m2.id
FROM members m_old, members m2
WHERE om.member_id = m_old.id
  AND m_old.organization_id IS DISTINCT FROM om.organization_id
  AND m_old.email IS NOT NULL AND m_old.email <> ''
  AND lower(m2.email) = lower(m_old.email)
  AND m2.organization_id = om.organization_id;

-- ── 確認クエリ (任意) ─────────────────────────────────────────────────────────
--   各組織のメンバー数を確認:
--     SELECT o.slug, o.name, count(m.id) AS member_rows
--     FROM organizations o
--     LEFT JOIN members m ON m.organization_id = o.id
--     GROUP BY o.id ORDER BY o.created_at;
--   organization_members と members の組織が食い違う残骸が無いか (0 行ならOK):
--     SELECT om.* FROM organization_members om
--     JOIN members m ON m.id = om.member_id
--     WHERE m.organization_id IS DISTINCT FROM om.organization_id;
