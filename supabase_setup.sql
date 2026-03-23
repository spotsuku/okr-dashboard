-- ============================================================
-- OKR Dashboard - Supabase セットアップ SQL
-- Supabase の「SQL Editor」に貼り付けて実行してください
-- ============================================================

-- 1. levels テーブル
CREATE TABLE IF NOT EXISTS levels (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '📁',
  color      TEXT DEFAULT '#4d9fff',
  parent_id  BIGINT REFERENCES levels(id) ON DELETE SET NULL
);

-- 2. objectives テーブル
CREATE TABLE IF NOT EXISTS objectives (
  id        BIGSERIAL PRIMARY KEY,
  level_id  BIGINT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  period    TEXT NOT NULL DEFAULT 'q1',
  title     TEXT NOT NULL,
  owner     TEXT DEFAULT '',
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
  created_at   TIMESTAMPTZ DEFAULT NOW()
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
CREATE POLICY "auth users can manage levels"
  ON levels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- objectives: 認証済みユーザーは全操作可
CREATE POLICY "auth users can manage objectives"
  ON objectives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- key_results: 認証済みユーザーは全操作可
CREATE POLICY "auth users can manage key_results"
  ON key_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- key_actions
ALTER TABLE key_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users can manage key_actions"
  ON key_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- members
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users can manage members"
  ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- weekly_reports
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users can manage weekly_reports"
  ON weekly_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ka_tasks
ALTER TABLE ka_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users can manage ka_tasks"
  ON ka_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- kr_weekly_reviews
ALTER TABLE kr_weekly_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users can manage kr_weekly_reviews"
  ON kr_weekly_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);
