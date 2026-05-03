-- ============================================================
-- coaching_chats を拡張して MyCOO (ぺろっぺ) の履歴も保存できるようにする
--
-- 既存の coaching_chats は MyCoachPage の OKR コーチ専用だったが、
-- COOTab (ぺろっぺ) の履歴も同じテーブルに kind カラムで分離して保存する。
--
-- kind の取りうる値:
--   'mycoach' (デフォルト) — MyCoachPage の OKR AIコーチ
--   'coo'                   — MyCOO タブの ぺろっぺ
--
-- metadata は COO 側で actions (tool calls) や mode を保存するための JSONB。
-- ============================================================

ALTER TABLE coaching_chats
  ADD COLUMN IF NOT EXISTS kind     TEXT DEFAULT 'mycoach',
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 既存行は kind='mycoach' のままでOK (デフォルト値で backfill 済)

-- (owner, kind, created_at) 複合インデックスで履歴ロードを高速化
CREATE INDEX IF NOT EXISTS coaching_chats_kind_owner_idx
  ON coaching_chats (kind, owner, created_at);

-- 確認
SELECT
  kind,
  count(*) AS rows
FROM coaching_chats
GROUP BY kind
ORDER BY kind;
