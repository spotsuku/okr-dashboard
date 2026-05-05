-- ════════════════════════════════════════════════════════════════════════════
-- KR 階層化 + 集計タイプ
-- ════════════════════════════════════════════════════════════════════════════
-- 通期 KR と Q 期 KR を parent_kr_id で親子紐付けし、
-- 通期 KR の集計方法 (累積/平均/最新/手動) を aggregation_type で指定する。
--
-- 全社ダッシュボード「年間ブレイクダウン」のマトリクス表示で
-- 「通期 KR 行 × Q1〜Q4 列」を成立させるためのスキーマ追加。
--
-- 実行: Supabase SQL Editor に貼って RUN。staging / production の両方で実行。
-- 全て IF NOT EXISTS なので冪等。
-- ════════════════════════════════════════════════════════════════════════════

-- 1. parent_kr_id: Q 期 KR がどの通期 KR の子かを保持
--    通期 KR は NULL のまま運用。SET NULL で親が消されても子は残る。
ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS parent_kr_id BIGINT REFERENCES key_results(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS key_results_parent_kr_idx
  ON key_results (parent_kr_id);

-- 2. aggregation_type: 通期 KR が子から自動集計する方法
--    'manual'     - 集計しない、手動入力 (デフォルト・既存挙動)
--    'cumulative' - 子の current 合計 (粗利・新規獲得数 等)
--    'average'    - 子の current 平均 (満足度・達成率 等)
--    'latest'     - 直近の Q 期 (Q4→Q3→Q2→Q1 の順で最初に値ある子) (NPS・在籍人数 等)
ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS aggregation_type TEXT DEFAULT 'manual'
    CHECK (aggregation_type IN ('manual','cumulative','average','latest'));

NOTIFY pgrst, 'reload schema';
