-- ════════════════════════════════════════════════════════════════════════════
-- 全社ダッシュボードで参照しているが production DB に欠落しているスキーマを補修
-- ════════════════════════════════════════════════════════════════════════════
-- 症状:
--   "[CompanyDashboardSummary] weeklyRevs エラー: column kr_weekly_reviews.focus_output does not exist"
--   "[CompanyDashboardSummary] lwDone エラー: column ka_tasks.created_at does not exist"
--   "[CompanyDashboardSummary] teamSums エラー: Could not find the table 'public.team_weekly_summary'"
--
-- 原因:
--   旧 schema で作成された DB に、後から追加された列/テーブルが反映されていない。
--   supabase_setup.sql 自体は最新だが、本番 DB は当時の古いバージョンで初期化された後
--   ALTER 系マイグレーションが実行されないままになっている。
--
-- 実行:
--   Supabase SQL Editor に貼って RUN。production と staging の両方で実行してください。
--   全て IF NOT EXISTS / CREATE OR REPLACE なので冪等です。
-- ════════════════════════════════════════════════════════════════════════════

-- 1. ka_tasks.created_at: タスク作成日時 (週間ランキング集計用)
ALTER TABLE ka_tasks
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 既存行に NULL があった場合は updated_at か due_date を fallback で埋める
UPDATE ka_tasks
   SET created_at = COALESCE(due_date::timestamptz, NOW())
 WHERE created_at IS NULL;

-- 2. kr_weekly_reviews.focus_output: 先週Focusの実績欄
ALTER TABLE kr_weekly_reviews
  ADD COLUMN IF NOT EXISTS focus_output TEXT DEFAULT '';

-- 3. ka_tasks.completed_at: done=true になった日時 (タスク完了王 集計用)
ALTER TABLE ka_tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 既存 done=true 行は backfill: due_date があればそれを、無ければ created_at を採用。
-- 厳密な「完了日時」ではないが履歴が無いので最良近似。
UPDATE ka_tasks
   SET completed_at = COALESCE(due_date::timestamptz, created_at, NOW())
 WHERE done = TRUE AND completed_at IS NULL;

-- done フラグが false→true に変わったタイミングで completed_at を自動セット
-- (true→false に戻された場合は NULL に戻す)
CREATE OR REPLACE FUNCTION set_ka_tasks_completed_at() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.done = TRUE AND NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.done IS DISTINCT FROM NEW.done) THEN
      IF NEW.done = TRUE THEN
        NEW.completed_at := NOW();
      ELSE
        NEW.completed_at := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ka_tasks_completed_at_trg ON ka_tasks;
CREATE TRIGGER set_ka_tasks_completed_at_trg
  BEFORE INSERT OR UPDATE ON ka_tasks
  FOR EACH ROW EXECUTE FUNCTION set_ka_tasks_completed_at();

-- 4. team_weekly_summary: チーム単位の週次サマリーテーブル
--    (supabase_team_weekly_summary.sql と同等。ここに同梱して一括実行できるように)
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

-- RLS (Phase 2 で org_scoped に再設定されるが、未実行環境向けに allow_all を一旦付与)
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

-- PostgREST のスキーマキャッシュを即時リロード
NOTIFY pgrst, 'reload schema';
