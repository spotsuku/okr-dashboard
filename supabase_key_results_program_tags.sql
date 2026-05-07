-- ════════════════════════════════════════════════════════════════════════════
-- key_results.program_tags — KR レベルでのプログラム横断タグ
-- ════════════════════════════════════════════════════════════════════════════
--
-- 経緯:
--   objectives.program_tags だけだと「1人のオブジェクティブ責任者が複数の
--   プログラムの KR 責任を持つ」ケースに対応できない (1 obj に 1 program しか
--   付かないため)。KR 単位でタグを付けられるようにする。
--
-- フィルタ仕様 (週次MTG):
--   KR が表示されるのは「kr.program_tags に T が含まれる」 OR 「親 obj の
--   program_tags に T が含まれる (継承)」のいずれか。obj は「タグ付き or
--   matching な KR を 1 つ以上持つ」場合に表示される。
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS program_tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS key_results_program_tags_gin_idx
  ON key_results USING GIN (program_tags);

NOTIFY pgrst, 'reload schema';
