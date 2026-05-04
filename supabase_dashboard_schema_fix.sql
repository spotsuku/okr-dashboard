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

-- ════════════════════════════════════════════════════════════════════════════
-- 5. kr_progress_snapshots: KR の current 値を週次でスナップショット
--    「KR 前進王」(先週から今週で前進した KR の件数) ランキング用。
--    key_results.current が更新されるたびに該当週 (JST 月曜起点) の行を upsert。
--    週内に複数回更新があった場合はその週の最終値が残る = 週末スナップショット。
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kr_progress_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  kr_id         BIGINT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  week_start    DATE   NOT NULL,
  current_value NUMERIC,
  taken_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (kr_id, week_start)
);

CREATE INDEX IF NOT EXISTS kr_progress_snapshots_week_idx
  ON kr_progress_snapshots (week_start DESC);

-- RLS は他テーブルと整合させて allow_all (Phase 2 の org-scoped 移行時に再設定可)
ALTER TABLE kr_progress_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_kr_progress_snapshots" ON kr_progress_snapshots;
CREATE POLICY "allow_all_kr_progress_snapshots"
  ON kr_progress_snapshots FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- JST 月曜日を返すヘルパ関数
CREATE OR REPLACE FUNCTION jst_monday(ts TIMESTAMPTZ) RETURNS DATE AS $$
DECLARE
  jst_date DATE := (ts AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  -- DOW: 0=Sun, 1=Mon, ..., 6=Sat
  -- offset to monday: (DOW + 6) % 7  → Mon=0, Tue=1, ..., Sun=6
  RETURN jst_date - ((EXTRACT(DOW FROM jst_date)::int + 6) % 7);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- key_results.current 更新時にスナップショットを upsert
CREATE OR REPLACE FUNCTION snapshot_kr_progress() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current IS DISTINCT FROM OLD.current THEN
    INSERT INTO kr_progress_snapshots (kr_id, week_start, current_value)
    VALUES (NEW.id, jst_monday(NOW()), NEW.current)
    ON CONFLICT (kr_id, week_start) DO UPDATE
      SET current_value = EXCLUDED.current_value,
          taken_at      = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshot_kr_progress_trg ON key_results;
CREATE TRIGGER snapshot_kr_progress_trg
  AFTER UPDATE OF current ON key_results
  FOR EACH ROW EXECUTE FUNCTION snapshot_kr_progress();

-- INSERT 時 (新規 KR 作成) も初期値を当週のスナップショットとして記録
CREATE OR REPLACE FUNCTION snapshot_kr_progress_insert() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current IS NOT NULL THEN
    INSERT INTO kr_progress_snapshots (kr_id, week_start, current_value)
    VALUES (NEW.id, jst_monday(NOW()), NEW.current)
    ON CONFLICT (kr_id, week_start) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshot_kr_progress_insert_trg ON key_results;
CREATE TRIGGER snapshot_kr_progress_insert_trg
  AFTER INSERT ON key_results
  FOR EACH ROW EXECUTE FUNCTION snapshot_kr_progress_insert();

-- 既存全 KR の current を「今週のスナップショット」として backfill
-- (1 週後の比較から「KR 前進王」が機能し始める)
INSERT INTO kr_progress_snapshots (kr_id, week_start, current_value)
SELECT id, jst_monday(NOW()), current
  FROM key_results
 WHERE current IS NOT NULL
ON CONFLICT (kr_id, week_start) DO NOTHING;

NOTIFY pgrst, 'reload schema';
