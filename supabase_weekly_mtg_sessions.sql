-- ─────────────────────────────────────────────
-- weekly_mtg_sessions: 週次MTGのファシリテーション進行状態
-- （朝会の morning_meetings と同設計。会議＋週で一意）
--
-- Supabase SQL Editor に貼り付けて1回RUN。IF NOT EXISTSなので再実行安全。
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weekly_mtg_sessions (
  id                 BIGSERIAL PRIMARY KEY,

  meeting_key        TEXT    NOT NULL,                -- 'kickoff-partner' 等
  week_start         DATE    NOT NULL,                -- 会議対象週の月曜日
  step               INT     NOT NULL DEFAULT 0,      -- 0:未開始 / 1:KR or KA順送り / 2:タスクor課題 / 3:確認事項 / 4:終了
  current_item_id    BIGINT,                          -- 現在フォーカス中の KR.id または KA (weekly_reports.id)
  current_team_id    BIGINT,                          -- KAフロー時、現在対象中のチーム levels.id
  completed_item_ids BIGINT[] DEFAULT '{}',           -- 済の KR.id または KA (weekly_reports.id) 配列
  facilitator        TEXT,                            -- ファシリ担当メンバー名 (開始時に記録)
  started_at         TIMESTAMPTZ DEFAULT NOW(),
  finished_at        TIMESTAMPTZ,

  UNIQUE(meeting_key, week_start)
);

-- 会議キー + 週 で素早く引けるように (UNIQUE 索引が既にあるので追加は不要)
CREATE INDEX IF NOT EXISTS weekly_mtg_sessions_week_idx
  ON weekly_mtg_sessions (week_start DESC);

-- ─────────────────────────────────────────────
-- RLS: 認証済みユーザーに全権限 (他の同系テーブルと同方針)
-- ─────────────────────────────────────────────
ALTER TABLE weekly_mtg_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_weekly_mtg_sessions" ON weekly_mtg_sessions;
CREATE POLICY "allow_all_weekly_mtg_sessions"
  ON weekly_mtg_sessions FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- Realtime 購読対象に追加
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_mtg_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
