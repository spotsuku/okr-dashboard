-- ════════════════════════════════════════════════════════════════════════════
-- key_results.archived_at — KR (Key Result) のソフトデリート (アーカイブ + 復元) 列
-- ════════════════════════════════════════════════════════════════════════════
--
-- 用途: 完了した KR を「アーカイブ」して各画面のカードから非表示にする。
--   archived_at IS NULL の KR のみが UI に表示される。
--   「📦 アーカイブ」画面から復元 (UPDATE archived_at=NULL) / 完全削除が可能。
--
-- 非表示対象の画面:
--   - 週次MTG (会議) の KR カード
--   - 担当ビュー (年間×個人) の KR カード
--   - マイOKR (週次×個人) の KR
--   - マイページの OKR 記入モーダル
--   - 全社 OKR (年間) ビュー
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS key_results_archived_idx
  ON key_results (archived_at);

NOTIFY pgrst, 'reload schema';
