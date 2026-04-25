-- ─────────────────────────────────────────────
-- meeting_action_items: 会議で決まったネクストアクション (誰がいつまでに何をやるか)
-- 週次MTG / 朝会など全会議共通で使う前提。
-- 加えて、weekly_mtg_sessions の step を 0..4 に拡張
-- (3 = ネクストアクション / 4 = 終了 に再定義)
-- ─────────────────────────────────────────────

-- ① meeting_action_items テーブル
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id          BIGSERIAL PRIMARY KEY,
  meeting_key TEXT   NOT NULL,                  -- 'kickoff-partner' / 'manager' / 'morning' 等
  week_start  DATE,                             -- 週次MTGの場合は対象週月曜
  meeting_date DATE,                            -- 朝会など日次会議の場合の開催日
  session_id  BIGINT,                           -- weekly_mtg_sessions.id への参照 (nullable)
  assignee    TEXT,                             -- 担当者 (members.name)
  due_date    DATE,                             -- 期日
  content     TEXT   NOT NULL DEFAULT '',       -- 内容
  done        BOOLEAN NOT NULL DEFAULT false,
  done_at     TIMESTAMPTZ,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meeting_action_items_session_idx
  ON meeting_action_items (meeting_key, week_start, meeting_date);
CREATE INDEX IF NOT EXISTS meeting_action_items_assignee_idx
  ON meeting_action_items (assignee, done, due_date);

ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_meeting_action_items" ON meeting_action_items;
CREATE POLICY "allow_all_meeting_action_items"
  ON meeting_action_items FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_action_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ② weekly_mtg_sessions の step 値を 0..4 に拡張
--    既存 finished_at が入っている step=3 行は新しい意味の「終了 (=4)」に移行
UPDATE weekly_mtg_sessions SET step = 4
 WHERE step = 3 AND finished_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
