-- ─────────────────────────────────────────────
-- weekly_reports の自動掃除 + アーカイブ整備
--
-- 動作:
--   1) weekly_reports_archive テーブルを準備（無ければ作る）
--   2) cleanup_weekly_reports() 関数を定義
--      - 完了(done) かつ 14日以上経過 → archive へ移動して本体から削除
--      - プレースホルダ「新しいKA」かつ7日以上未編集 → 削除
--   3) （任意）pg_cron で週次自動実行を仕込む
--   4) いま1回だけ手動実行
--
-- Supabase SQL Editor で1回 RUN。再実行安全。
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 1) アーカイブテーブル
--    元 weekly_reports と同じスキーマ + archived_at / archive_reason
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_reports_archive (LIKE weekly_reports);

ALTER TABLE weekly_reports_archive
  ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE weekly_reports_archive
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- 振り返りクエリ用インデックス
CREATE INDEX IF NOT EXISTS weekly_reports_archive_owner_idx
  ON weekly_reports_archive (owner, archived_at DESC);
CREATE INDEX IF NOT EXISTS weekly_reports_archive_kr_idx
  ON weekly_reports_archive (kr_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS weekly_reports_archive_obj_idx
  ON weekly_reports_archive (objective_id, archived_at DESC);

-- RLS: 認証ユーザー全員に SELECT のみ許可（編集系は不可）
ALTER TABLE weekly_reports_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "weekly_reports_archive_select" ON weekly_reports_archive;
CREATE POLICY "weekly_reports_archive_select"
  ON weekly_reports_archive FOR SELECT TO authenticated, anon
  USING (true);

-- ─────────────────────────────────────────────
-- 2) クリーンアップ関数
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_weekly_reports(
  done_age_days        INT DEFAULT 14,
  placeholder_age_days INT DEFAULT 7
)
RETURNS TABLE (archived_count INT, deleted_placeholder_count INT) AS $$
DECLARE
  arch_count INT;
  ph_count   INT;
BEGIN
  -- (a) 完了(done) で done_age_days 日以上経過したものを archive へ移動
  WITH moved AS (
    DELETE FROM weekly_reports
     WHERE status = 'done'
       AND created_at < NOW() - (done_age_days || ' days')::INTERVAL
    RETURNING *
  ), inserted AS (
    INSERT INTO weekly_reports_archive (
      id, week_start, level_id, objective_id, kr_id, kr_title, ka_title,
      owner, status, good, more, focus_output, sort_order, created_at,
      archive_reason
    )
    SELECT
      id, week_start, level_id, objective_id, kr_id, kr_title, ka_title,
      owner, status, good, more, focus_output, sort_order, created_at,
      'done_aged'
    FROM moved
    RETURNING id
  )
  SELECT COUNT(*) INTO arch_count FROM inserted;

  -- (b) 「新しいKA」プレースホルダで placeholder_age_days 日以上未編集
  --     条件: title=='新しいKA' / owner空 / good/more/focus空 / status='normal'
  WITH deleted AS (
    DELETE FROM weekly_reports
     WHERE ka_title = '新しいKA'
       AND COALESCE(NULLIF(TRIM(owner), ''), '') = ''
       AND COALESCE(NULLIF(TRIM(good), ''), '') = ''
       AND COALESCE(NULLIF(TRIM(more), ''), '') = ''
       AND COALESCE(NULLIF(TRIM(focus_output), ''), '') = ''
       AND status = 'normal'
       AND created_at < NOW() - (placeholder_age_days || ' days')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*) INTO ph_count FROM deleted;

  RETURN QUERY SELECT arch_count, ph_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_weekly_reports IS
  '完了(done)KAをアーカイブ移動＋プレースホルダ「新しいKA」を削除する週次掃除関数。'
  'デフォルトは done >= 14日 / placeholder >= 7日。';

-- ─────────────────────────────────────────────
-- 3) （任意）pg_cron で毎週月曜 02:00 UTC (JST 11:00) 自動実行
--    Supabase Dashboard → Database → Extensions で pg_cron を有効化してから実行。
--    手動運用するなら下のブロックは無視してOK。
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 既存ジョブがあれば一旦解除
    PERFORM cron.unschedule('weekly_reports_cleanup')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly_reports_cleanup');

    PERFORM cron.schedule(
      'weekly_reports_cleanup',
      '0 2 * * 1',                      -- 月曜 02:00 UTC
      $cron$SELECT cleanup_weekly_reports();$cron$
    );
    RAISE NOTICE 'pg_cron に weekly_reports_cleanup を登録しました（毎週月曜 02:00 UTC = JST 11:00）';
  ELSE
    RAISE NOTICE 'pg_cron 未インストール。手動運用なら問題ありません。';
    RAISE NOTICE '自動化したい場合: Supabase Dashboard → Database → Extensions で pg_cron を有効化 → このSQL再実行';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 4) いま1回だけ手動実行（既存の溜まり分を片付ける）
-- ─────────────────────────────────────────────
SELECT * FROM cleanup_weekly_reports();
-- → archived_count / deleted_placeholder_count が表示される

-- 確認用
SELECT 'weekly_reports total' AS label, COUNT(*) AS n FROM weekly_reports
UNION ALL
SELECT 'weekly_reports_archive total', COUNT(*) FROM weekly_reports_archive;
