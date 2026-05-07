-- ════════════════════════════════════════════════════════════════════════════
-- objectives.program_tags — プログラム横断タグ
-- ════════════════════════════════════════════════════════════════════════════
--
-- 用途:
--   組織図は機能別 (セールス/イベント運営/CS 等) なので、プログラム単位
--   (例: "プログラムA" "新規事業X") で会議する際に、複数部署のメンバーが
--   関わる OKR を横断で抽出したい。
--
-- 設計:
--   - 1 OKR は複数プログラムに所属可 (TEXT[] で多値)
--   - 階層も持たせず、フリーテキストの array (フリーフォーム + サジェスト)
--   - KR にはタグを付けず、親 objective のタグを継承する形でフィルタする
--   - 週次 MTG で「🏷 プログラムで絞る」 → このタグでフィルタ
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS program_tags TEXT[] DEFAULT '{}';

-- 配列内検索用の GIN インデックス (program_tags && ARRAY['X'] が高速化される)
CREATE INDEX IF NOT EXISTS objectives_program_tags_gin_idx
  ON objectives USING GIN (program_tags);

NOTIFY pgrst, 'reload schema';
