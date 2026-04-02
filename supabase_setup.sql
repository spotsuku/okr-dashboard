-- ============================================================
-- OKR Dashboard - Supabase セットアップ SQL
-- Supabase の「SQL Editor」に貼り付けて実行してください
-- ============================================================

-- 1. levels テーブル
CREATE TABLE IF NOT EXISTS levels (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  icon              TEXT DEFAULT '📁',
  color             TEXT DEFAULT '#4d9fff',
  parent_id         BIGINT REFERENCES levels(id) ON DELETE SET NULL,
  slack_webhook_url TEXT,
  fiscal_year       TEXT DEFAULT '2026'
);

-- 2. objectives テーブル
CREATE TABLE IF NOT EXISTS objectives (
  id        BIGSERIAL PRIMARY KEY,
  level_id  BIGINT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  period    TEXT NOT NULL DEFAULT 'q1',
  title     TEXT NOT NULL,
  owner     TEXT DEFAULT '',
  parent_objective_id BIGINT REFERENCES objectives(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. key_results テーブル
CREATE TABLE IF NOT EXISTS key_results (
  id              BIGSERIAL PRIMARY KEY,
  objective_id    BIGINT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  target          FLOAT8 DEFAULT 100,
  current         FLOAT8 DEFAULT 0,
  unit            TEXT DEFAULT '',
  lower_is_better BOOLEAN DEFAULT FALSE,
  owner           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. members テーブル
CREATE TABLE IF NOT EXISTS members (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT DEFAULT '',
  email         TEXT,
  level_id      BIGINT REFERENCES levels(id) ON DELETE SET NULL,
  sub_level_ids BIGINT[] DEFAULT '{}',
  avatar_url    TEXT DEFAULT '',
  is_admin      BOOLEAN DEFAULT FALSE,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 5. key_actions テーブル
CREATE TABLE IF NOT EXISTS key_actions (
  id              BIGSERIAL PRIMARY KEY,
  key_result_id   BIGINT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  type            TEXT DEFAULT 'normal',
  week_start      DATE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 6. weekly_reports テーブル
CREATE TABLE IF NOT EXISTS weekly_reports (
  id            BIGSERIAL PRIMARY KEY,
  week_start    DATE NOT NULL,
  level_id      BIGINT REFERENCES levels(id) ON DELETE SET NULL,
  objective_id  BIGINT REFERENCES objectives(id) ON DELETE CASCADE,
  kr_id         BIGINT REFERENCES key_results(id) ON DELETE SET NULL,
  kr_title      TEXT DEFAULT '',
  ka_title      TEXT DEFAULT '',
  status        TEXT DEFAULT 'normal',
  good          TEXT DEFAULT '',
  more          TEXT DEFAULT '',
  focus_output  TEXT DEFAULT '',
  owner         TEXT DEFAULT '',
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ka_tasks テーブル
CREATE TABLE IF NOT EXISTS ka_tasks (
  id          BIGSERIAL PRIMARY KEY,
  report_id   BIGINT REFERENCES weekly_reports(id) ON DELETE CASCADE,
  title       TEXT DEFAULT '',
  done        BOOLEAN DEFAULT FALSE,
  assignee    TEXT DEFAULT '',
  due_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 8. kr_weekly_reviews テーブル
CREATE TABLE IF NOT EXISTS kr_weekly_reviews (
  id           BIGSERIAL PRIMARY KEY,
  kr_id        BIGINT REFERENCES key_results(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  weather      INT DEFAULT 0,
  good         TEXT DEFAULT '',
  more         TEXT DEFAULT '',
  focus        TEXT DEFAULT '',
  focus_output TEXT DEFAULT '',
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(kr_id, week_start)
);

-- 9. org_tasks テーブル（業務タスク）
CREATE TABLE IF NOT EXISTS org_tasks (
  id          BIGSERIAL PRIMARY KEY,
  dept        TEXT DEFAULT '',
  team        TEXT DEFAULT '',
  task        TEXT DEFAULT '',
  owner       TEXT DEFAULT '',
  support     TEXT DEFAULT '',
  level_id    BIGINT,
  sort_order  INT DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 10. org_task_history テーブル（担当変更履歴）
CREATE TABLE IF NOT EXISTS org_task_history (
  id          BIGSERIAL PRIMARY KEY,
  task_id     BIGINT,
  from_owner  TEXT DEFAULT '',
  to_owner    TEXT DEFAULT '',
  changed_by  TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 11. org_team_meta テーブル（チームメタ情報）
CREATE TABLE IF NOT EXISTS org_team_meta (
  id          BIGSERIAL PRIMARY KEY,
  level_id    BIGINT UNIQUE,
  status      TEXT DEFAULT 'active',
  desc_text   TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 12. org_member_jd テーブル（メンバーJD）
CREATE TABLE IF NOT EXISTS org_member_jd (
  id              BIGSERIAL PRIMARY KEY,
  member_id       TEXT NOT NULL,
  version_idx     INT NOT NULL DEFAULT 0,
  period          TEXT DEFAULT '',
  role            TEXT DEFAULT '',
  emp             TEXT DEFAULT '',
  working         TEXT DEFAULT '',
  role_desc       TEXT DEFAULT '',
  responsibility  TEXT DEFAULT '',
  meetings        TEXT DEFAULT '',
  tasks           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, version_idx)
);

-- 13. org_task_manuals テーブル（業務マニュアル）
CREATE TABLE IF NOT EXISTS org_task_manuals (
  id          BIGSERIAL PRIMARY KEY,
  task_id     BIGINT NOT NULL,
  title       TEXT DEFAULT '',
  content     TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  sort_order  INT DEFAULT 0,
  updated_by  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 初期データ（組織階層のサンプル）
-- 必要に応じて編集してください
-- ============================================================

INSERT INTO levels (name, icon, color, parent_id) VALUES
  ('経営',               '🏢', '#a855f7', NULL);

INSERT INTO levels (name, icon, color, parent_id) VALUES
  ('プロダクト部',         '🚀', '#4d9fff', (SELECT id FROM levels WHERE name = '経営')),
  ('エンジニアリング部',   '⚙️', '#00d68f', (SELECT id FROM levels WHERE name = '経営')),
  ('セールス部',          '💼', '#ff6b6b', (SELECT id FROM levels WHERE name = '経営'));

INSERT INTO levels (name, icon, color, parent_id) VALUES
  ('フロントエンドチーム', '🎨', '#ffd166', (SELECT id FROM levels WHERE name = 'エンジニアリング部'));

-- ============================================================
-- Row Level Security（全ログインユーザーが読み書き可能）
-- ============================================================

ALTER TABLE levels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectives   ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_results  ENABLE ROW LEVEL SECURITY;

-- levels: 認証済みユーザーは全操作可
DROP POLICY IF EXISTS "auth users can manage levels" ON levels;
CREATE POLICY "auth users can manage levels"
  ON levels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- objectives: 認証済みユーザーは全操作可
DROP POLICY IF EXISTS "auth users can manage objectives" ON objectives;
CREATE POLICY "auth users can manage objectives"
  ON objectives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- key_results: 認証済みユーザーは全操作可
DROP POLICY IF EXISTS "auth users can manage key_results" ON key_results;
CREATE POLICY "auth users can manage key_results"
  ON key_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- key_actions
ALTER TABLE key_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage key_actions" ON key_actions;
CREATE POLICY "auth users can manage key_actions"
  ON key_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- members
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage members" ON members;
CREATE POLICY "auth users can manage members"
  ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- weekly_reports
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage weekly_reports" ON weekly_reports;
CREATE POLICY "auth users can manage weekly_reports"
  ON weekly_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ka_tasks
ALTER TABLE ka_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage ka_tasks" ON ka_tasks;
CREATE POLICY "auth users can manage ka_tasks"
  ON ka_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- kr_weekly_reviews
ALTER TABLE kr_weekly_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage kr_weekly_reviews" ON kr_weekly_reviews;
CREATE POLICY "auth users can manage kr_weekly_reviews"
  ON kr_weekly_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- org_tasks
ALTER TABLE org_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage org_tasks" ON org_tasks;
CREATE POLICY "auth users can manage org_tasks"
  ON org_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- org_task_history
ALTER TABLE org_task_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage org_task_history" ON org_task_history;
CREATE POLICY "auth users can manage org_task_history"
  ON org_task_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- org_team_meta
ALTER TABLE org_team_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage org_team_meta" ON org_team_meta;
CREATE POLICY "auth users can manage org_team_meta"
  ON org_team_meta FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- org_member_jd
ALTER TABLE org_member_jd ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage org_member_jd" ON org_member_jd;
CREATE POLICY "auth users can manage org_member_jd"
  ON org_member_jd FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- org_task_manuals
ALTER TABLE org_task_manuals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can manage org_task_manuals" ON org_task_manuals;
CREATE POLICY "auth users can manage org_task_manuals"
  ON org_task_manuals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 既存DBマイグレーション用SQL
-- テーブルが既に存在するが level_id 等のカラムが不足している場合に使用
-- 必要な部分だけ Supabase SQL Editor で実行してください
-- ============================================================
--
-- テーブルが存在しない場合は上記の CREATE TABLE 文をそのまま実行してください。
--
-- org_tasks テーブルに level_id カラムを追加（既存環境向け・冪等）:
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS level_id BIGINT;
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
--
-- levels テーブルに fiscal_year カラムを追加:
-- ALTER TABLE levels ADD COLUMN IF NOT EXISTS fiscal_year TEXT DEFAULT '2026';
--
-- objectives テーブルに parent_objective_id カラムを追加:
-- ALTER TABLE objectives ADD COLUMN IF NOT EXISTS parent_objective_id BIGINT REFERENCES objectives(id) ON DELETE SET NULL;
--
-- kr_weekly_reviews テーブルに updated_at カラムを追加:
-- ALTER TABLE kr_weekly_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
--
-- kr_weekly_reviews テーブルに UNIQUE 制約を追加:
-- ALTER TABLE kr_weekly_reviews ADD CONSTRAINT kr_weekly_reviews_kr_id_week_start_key UNIQUE (kr_id, week_start);
--
-- org_task_history テーブルを新規作成（上記 CREATE TABLE 文を使用）
-- org_team_meta テーブルを新規作成（上記 CREATE TABLE 文を使用）
-- org_member_jd テーブルを新規作成（上記 CREATE TABLE 文を使用）
