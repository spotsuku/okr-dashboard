-- ─────────────────────────────────────────────
-- weekly_mtg_sessions に duration_minutes 列を追加
-- 会議予定時間 (分) を保存し、残り時間表示と10分前アラートに使う
-- ─────────────────────────────────────────────

ALTER TABLE weekly_mtg_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes INT NOT NULL DEFAULT 30;

COMMENT ON COLUMN weekly_mtg_sessions.duration_minutes IS
  '会議予定時間 (分)。Step 0 で設定し、Step 1〜3 で残り時間表示。デフォルト 30';

NOTIFY pgrst, 'reload schema';
