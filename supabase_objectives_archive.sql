-- ════════════════════════════════════════════════════════════════════════════
-- objectives.archived_at — Objective のソフトデリート (アーカイブ + 復元) 列
-- ════════════════════════════════════════════════════════════════════════════
--
-- 既存挙動: handleDelete() で即時 DELETE (10秒 Undo トーストのみ復元手段)
-- 新挙動  : 削除ボタン → archived_at=NOW() を UPDATE (ソフトデリート)
--           archived_at IS NULL のレコードのみが UI に表示される
--           「📦 アーカイブ」モーダルから復元可能 (UPDATE archived_at=NULL)
--
-- 子の key_results は無変更。親 objective が archive されると自動的に
-- 一緒に表示から消える (loadAll が objectives を SELECT するときに
-- archived_at でフィルタしているため、親が archive されると子の KR の
-- objective_id が in 句に含まれず、自然に取得されない)
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS objectives_archived_idx
  ON objectives (archived_at);

NOTIFY pgrst, 'reload schema';
