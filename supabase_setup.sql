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
  created_at      TIMESTAMPTZ DEFAULT NOW()
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

-- ============================================================
-- メンバーの複数所属（兼任）対応
-- 既存の level_id は主所属として維持
-- sub_level_ids に副所属（兼任先）の level_id 配列を格納
-- ============================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS sub_level_ids BIGINT[] DEFAULT '{}';

-- KR担当者カラムの追加
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT '';

-- weekly_reports 担当者カラムの追加
ALTER TABLE weekly_reports ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT '';

-- ka_tasks 担当者カラムの追加
ALTER TABLE ka_tasks ADD COLUMN IF NOT EXISTS assignee TEXT DEFAULT '';
ALTER TABLE ka_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE ka_tasks ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT FALSE;

-- key_results の current_value → current へのリネーム（カラム名不一致修正）
-- 既にcurrentカラムの場合はスキップ
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='key_results' AND column_name='current_value') THEN
    ALTER TABLE key_results RENAME COLUMN current_value TO current;
  END IF;
END $$;

-- weekly_reports 並び順カラムの追加
ALTER TABLE weekly_reports ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
