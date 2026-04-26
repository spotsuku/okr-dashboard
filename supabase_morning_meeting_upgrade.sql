-- ─────────────────────────────────────────────
-- 朝会 (morning_meetings) のアップグレード
--   ① facilitator 列 (ファシリ担当メンバー名)
--   ② duration_minutes 列 (会議予定時間 / デフォルト 30 分)
--   ③ ステップ番号シフト
--      旧: 1=個別報告 / 2=確認事項タイム / 3=終了
--      新: 1=個別報告 / 2=確認事項タイム / 3=ネクストアクション / 4=終了
--      → 既存の step=3 (終了) のレコードを step=4 にシフトする
--
-- IF NOT EXISTS 主体なので再実行しても安全。
-- ステップシフトは step=3 のみが対象なので二重シフトは起きない
-- (3→4 にシフト後は WHERE step = 3 にマッチしない)。
-- ─────────────────────────────────────────────

-- ① ファシリ担当 + ② 予定時間 (30分デフォルト)
ALTER TABLE morning_meetings
  ADD COLUMN IF NOT EXISTS facilitator      TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INT NOT NULL DEFAULT 30;

COMMENT ON COLUMN morning_meetings.facilitator IS
  '朝会のファシリテーター担当 (members.name と一致)';
COMMENT ON COLUMN morning_meetings.duration_minutes IS
  '朝会の予定時間 (分)。残り時間表示と10分前アラートに利用。デフォルト 30';

-- ③ 旧 step=3 (終了) を新 step=4 (終了) にシフト
UPDATE morning_meetings
SET step = 4
WHERE step = 3;

NOTIFY pgrst, 'reload schema';
