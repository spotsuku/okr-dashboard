-- ─────────────────────────────────────────────────────────────
-- levels テーブルに「チーム責任者 (= 週次サマリー記入担当)」を追加
-- 実行方法: Supabase SQL エディタで貼り付けて RUN (本番・staging 両方)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE levels
  ADD COLUMN IF NOT EXISTS manager_id BIGINT REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS levels_manager_id_idx ON levels (manager_id);

-- 用途:
--   各チーム/部署のリーダー (= マイページで「📊 今週のチームサマリー」
--   ウィジェットを編集できる人) を1人指定する。
--   組織ページ → 組織管理 から設定可能。
--   閲覧は誰でも可、編集は manager_id 本人 + 管理者 (members.is_admin) のみ。

NOTIFY pgrst, 'reload schema';
