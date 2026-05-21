-- ════════════════════════════════════════════════════════════════════════════
-- ka_tasks.assignee_email — 担当者を「実ユーザ(email)」で突合するための安定キー
-- ════════════════════════════════════════════════════════════════════════════
--
-- 背景:
--   従来 WS は ka_tasks.assignee (表示名 TEXT) の文字列一致で「自分のタスク」を
--   特定していた。表記揺れ・同名同姓に弱く、別アプリ(PM)との一元化が不安定。
--
-- 方針:
--   両アプリとも Google ログイン → email が横断の安定キー。
--   assignee (表示名) は表示用に残しつつ、assignee_email を突合キーとして併設する。
--   読み取りは「assignee_email 一致 OR assignee(名前) 一致」で移行期も両対応。
--   書き込みは assignee + assignee_email の両方を入れる。
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE ka_tasks
  ADD COLUMN IF NOT EXISTS assignee_email TEXT;

CREATE INDEX IF NOT EXISTS ka_tasks_assignee_email_idx
  ON ka_tasks (assignee_email);

-- 既存タスクの backfill: 表示名 (assignee) を members 経由で email に解決
UPDATE ka_tasks t
   SET assignee_email = lower(m.email)
  FROM members m
 WHERE t.assignee_email IS NULL
   AND t.assignee = m.name
   AND m.email IS NOT NULL AND m.email <> '';

-- 補足 (任意・手動推奨):
--   members.email を突合キーとして堅くするなら、重複 email を解消したうえで
--   下記の一意制約を追加する (重複データがあると失敗するため自動実行はしない):
--     CREATE UNIQUE INDEX members_email_lower_uniq
--       ON members (lower(email)) WHERE email IS NOT NULL AND email <> '';

NOTIFY pgrst, 'reload schema';
