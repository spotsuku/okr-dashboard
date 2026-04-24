-- メンバー確認機能 + 朝会タブ 用テーブル
-- 実行方法: Supabase の SQL エディタに貼り付けて RUN (本番・staging 両方)

-- ─────────────────────────────────────────────
-- 1. member_confirmations: メンバー間の確認事項 (DM 的扱い)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_confirmations (
  id          BIGSERIAL PRIMARY KEY,
  from_name   TEXT NOT NULL,              -- 送信者のメンバー名
  to_name     TEXT NOT NULL,              -- 宛先メンバー名
  content     TEXT NOT NULL,              -- 確認事項本文
  status      TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS member_confirmations_to_idx
  ON member_confirmations (to_name, status, created_at DESC);

CREATE INDEX IF NOT EXISTS member_confirmations_from_idx
  ON member_confirmations (from_name, created_at DESC);

-- ─────────────────────────────────────────────
-- 2. member_confirmation_replies: 確認事項への返信スレッド
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_confirmation_replies (
  id              BIGSERIAL PRIMARY KEY,
  confirmation_id BIGINT NOT NULL REFERENCES member_confirmations(id) ON DELETE CASCADE,
  from_name       TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_confirmation_replies_conf_idx
  ON member_confirmation_replies (confirmation_id, created_at ASC);

-- ─────────────────────────────────────────────
-- 3. morning_meetings: 朝会の進行状態 (全メンバー同期用)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS morning_meetings (
  id                 BIGSERIAL PRIMARY KEY,
  meeting_date       DATE NOT NULL UNIQUE,  -- 1日1レコード
  step               INT NOT NULL DEFAULT 1, -- 1: 個別報告中 / 2: 確認事項タイム / 3: 終了
  current_speaker    TEXT,                   -- 現在発表中のメンバー名 (ステップ1)
  completed_speakers TEXT[] DEFAULT '{}',    -- 発表完了済みメンバー名の配列
  started_at         TIMESTAMPTZ DEFAULT NOW(),
  finished_at        TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- RLS: 認証済みユーザーに全権限 (他テーブルと同じ方針)
-- ─────────────────────────────────────────────
ALTER TABLE member_confirmations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_confirmation_replies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_meetings             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_member_confirmations" ON member_confirmations;
CREATE POLICY "allow_all_member_confirmations"
  ON member_confirmations FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_member_confirmation_replies" ON member_confirmation_replies;
CREATE POLICY "allow_all_member_confirmation_replies"
  ON member_confirmation_replies FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_morning_meetings" ON morning_meetings;
CREATE POLICY "allow_all_morning_meetings"
  ON morning_meetings FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- Realtime 購読対象に追加 (既に入っていれば duplicate_object で skip)
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'member_confirmations','member_confirmation_replies','morning_meetings'
  ])
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
