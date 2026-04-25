-- ─────────────────────────────────────────────
-- team_weekly_summary: チーム単位の週次 Good/More/Focus サマリー
-- マネージャー定例で各チームのまとめを記録するための専用テーブル。
-- weekly_reports とは独立 (KA 0件のチームでも記入できる)
--
-- Supabase SQL Editor に貼って RUN。staging/本番 両方で実行してください。
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_weekly_summary (
  id          BIGSERIAL PRIMARY KEY,
  level_id    BIGINT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  week_start  DATE   NOT NULL,
  good        TEXT,
  more        TEXT,
  focus       TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(level_id, week_start)
);

CREATE INDEX IF NOT EXISTS team_weekly_summary_week_idx
  ON team_weekly_summary (week_start DESC);

-- RLS
ALTER TABLE team_weekly_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_weekly_summary" ON team_weekly_summary;
CREATE POLICY "allow_all_team_weekly_summary"
  ON team_weekly_summary FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- Realtime publication 追加
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_weekly_summary;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
