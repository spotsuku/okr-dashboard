-- ============================================================
-- OKR Dashboard - Staging Supabase 初期化SQL (idempotent)
-- バックアップSupabase (https://smedjmzygislopekhhln.supabase.co) の
-- SQL Editor に全体を貼り付けて1回実行してください。
-- すべて IF NOT EXISTS / IF EXISTS で冪等（複数回実行OK）。
-- 初期データINSERTは末尾の [OPTIONAL] セクションにまとめています。
-- ============================================================

-- ─────────────────────────────────────────────
-- [REQUIRED] 1. 基本テーブル
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS levels (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  icon              TEXT DEFAULT '📁',
  color             TEXT DEFAULT '#4d9fff',
  parent_id         BIGINT REFERENCES levels(id) ON DELETE SET NULL,
  slack_webhook_url TEXT,
  fiscal_year       TEXT DEFAULT '2026'
);
ALTER TABLE levels ADD COLUMN IF NOT EXISTS fiscal_year TEXT DEFAULT '2026';

CREATE TABLE IF NOT EXISTS objectives (
  id        BIGSERIAL PRIMARY KEY,
  level_id  BIGINT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  period    TEXT NOT NULL DEFAULT 'q1',
  title     TEXT NOT NULL,
  owner     TEXT DEFAULT '',
  parent_objective_id BIGINT REFERENCES objectives(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS parent_objective_id BIGINT REFERENCES objectives(id) ON DELETE SET NULL;

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

CREATE TABLE IF NOT EXISTS key_actions (
  id              BIGSERIAL PRIMARY KEY,
  key_result_id   BIGINT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  type            TEXT DEFAULT 'normal',
  week_start      DATE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS ka_tasks (
  id          BIGSERIAL PRIMARY KEY,
  report_id   BIGINT REFERENCES weekly_reports(id) ON DELETE CASCADE,
  title       TEXT DEFAULT '',
  done        BOOLEAN DEFAULT FALSE,
  status      TEXT DEFAULT 'not_started',
  assignee    TEXT DEFAULT '',
  due_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- status: 'not_started' (未着手), 'in_progress' (進行中), 'done' (完了)
ALTER TABLE ka_tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not_started';

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
ALTER TABLE kr_weekly_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS level_id BIGINT;
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE org_tasks ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS org_task_history (
  id          BIGSERIAL PRIMARY KEY,
  task_id     BIGINT,
  from_owner  TEXT DEFAULT '',
  to_owner    TEXT DEFAULT '',
  changed_by  TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_team_meta (
  id          BIGSERIAL PRIMARY KEY,
  level_id    BIGINT UNIQUE,
  status      TEXT DEFAULT 'active',
  desc_text   TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

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

-- ─────────────────────────────────────────────
-- [REQUIRED] 2. AI関連テーブル (coaching_logs を含む)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_premises (
  id          BIGSERIAL PRIMARY KEY,
  content     TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coaching_logs (
  id          BIGSERIAL PRIMARY KEY,
  owner       TEXT NOT NULL DEFAULT '',
  week_start  DATE NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  log_type    TEXT NOT NULL DEFAULT 'action_plan',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- log_type の取りうる値: 'action_plan' / 'work_log' / 'kpt' / 'monthly_theme'

-- ─────────────────────────────────────────────
-- [REQUIRED] 3. マイルストーン
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS milestones (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fiscal_year   INT     NOT NULL DEFAULT 2026,
  org_id        BIGINT  REFERENCES levels(id) ON DELETE CASCADE,
  start_month   INT     NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  end_month     INT     NOT NULL CHECK (end_month   BETWEEN 1 AND 12),
  due_date      DATE,
  title         TEXT    NOT NULL,
  focus_level   TEXT    NOT NULL DEFAULT 'normal'
                CHECK (focus_level IN ('focus', 'normal')),
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'done', 'delayed')),
  sort_order    INT     NOT NULL DEFAULT 0,
  owner         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS owner TEXT;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestones_updated_at ON milestones;
CREATE TRIGGER milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_milestones_updated_at();

-- ─────────────────────────────────────────────
-- [REQUIRED] 4. RLS（認証済みユーザー全員に読み書き許可）
-- ─────────────────────────────────────────────

ALTER TABLE levels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectives        ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_actions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ka_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE kr_weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_task_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_team_meta     ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_member_jd     ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_task_manuals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_premises       ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'levels','objectives','key_results','key_actions','members',
    'weekly_reports','ka_tasks','kr_weekly_reviews',
    'org_tasks','org_task_history','org_team_meta','org_member_jd','org_task_manuals',
    'ai_premises','coaching_logs'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth users can manage %I" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth users can manage %I" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- milestones のRLS（is_admin判定）
DROP POLICY IF EXISTS "milestones_select" ON milestones;
CREATE POLICY "milestones_select" ON milestones FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "milestones_insert" ON milestones;
CREATE POLICY "milestones_insert" ON milestones FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM members WHERE members.email = auth.jwt()->>'email' AND members.is_admin = true)
);

DROP POLICY IF EXISTS "milestones_update" ON milestones;
CREATE POLICY "milestones_update" ON milestones FOR UPDATE USING (
  EXISTS (SELECT 1 FROM members WHERE members.email = auth.jwt()->>'email' AND members.is_admin = true)
);

DROP POLICY IF EXISTS "milestones_delete" ON milestones;
CREATE POLICY "milestones_delete" ON milestones FOR DELETE USING (
  EXISTS (SELECT 1 FROM members WHERE members.email = auth.jwt()->>'email' AND members.is_admin = true)
);

-- ============================================================
-- [OPTIONAL] 初期データ投入
-- 空DBの場合のみ実行してください。既存データがあると重複します。
-- 実行する場合は先頭の /* と末尾の */ を削除してください。
-- ============================================================

/*
-- ai_premises 初期プロンプト
INSERT INTO ai_premises (content, sort_order) VALUES
('通期のKAとQ期のKAは重複しない。両方のKA数を合計して「忙しすぎる」と判断しないこと。', 1),
('月末（25日以降）には、Q期のKAが通期OKRの達成にどうつながっているか確認を促す。', 2),
('OKRはストレッチ目標なので、達成率70%程度が健全。100%未満でも過度に危機感を煽らない。', 3),
('KAは四半期の中期アクション。MoreのKAは打ち手として有効でない可能性がある。具体的な代替アクションや見直しを提案すること。', 4);
*/
