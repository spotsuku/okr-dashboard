-- ─────────────────────────────────────────────
-- ka_tasks に会議コンテキスト列を追加し、meeting_action_items を統合
-- 設計方針: タスクは ka_tasks 1テーブルで管理する。
-- 会議で作ったタスクは meeting_key/week_start/session_id を埋めるだけ。
-- KA との紐付けは ka_key/report_id で従来通り任意 (NULL 可)。
--
-- 注意: ka_tasks のスキーマは環境によって created_at/updated_at が無いケース
-- があるため、INSERT は最小列のみで行う。タイムスタンプはDBのデフォルトに任せる。
-- ─────────────────────────────────────────────

-- ① ka_tasks に会議コンテキスト用の列を追加
ALTER TABLE ka_tasks
  ADD COLUMN IF NOT EXISTS meeting_key TEXT,
  ADD COLUMN IF NOT EXISTS week_start  DATE,
  ADD COLUMN IF NOT EXISTS session_id  BIGINT;

CREATE INDEX IF NOT EXISTS ka_tasks_meeting_idx
  ON ka_tasks (meeting_key, week_start);

-- ② meeting_action_items が存在すればデータを移行 → ドロップ
--    タイムスタンプ列はDB側のデフォルトに任せる (バックアップDB等で列が無いケース対応)
DO $$
BEGIN
  IF to_regclass('public.meeting_action_items') IS NOT NULL THEN
    INSERT INTO ka_tasks (
      title, assignee, due_date, done,
      meeting_key, week_start, session_id
    )
    SELECT
      COALESCE(NULLIF(TRIM(content), ''), '(未記入)') AS title,
      assignee,
      due_date,
      done,
      meeting_key,
      week_start,
      session_id
    FROM meeting_action_items;

    DROP TABLE meeting_action_items;
    RAISE NOTICE 'meeting_action_items のデータを ka_tasks に移行し、テーブルを削除しました';
  ELSE
    RAISE NOTICE 'meeting_action_items は存在しません (新環境)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
