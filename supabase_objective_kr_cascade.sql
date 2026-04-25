-- ─────────────────────────────────────────────
-- Objective / KR 削除時の CASCADE 整備 + 既存孤児データ掃除
--
-- 背景: Objective を削除しても key_results / weekly_reports / ka_tasks /
--       kr_weekly_reviews が親無しで残ってしまうリスクが調査で判明。
--       FK に ON DELETE CASCADE を設定し、さらに既に孤児になっている行を
--       (確認の上で) 一括削除する。
--
-- Supabase SQL Editor で1回 RUN。IF 文 + EXCEPTION で何度流しても安全。
-- DRY-RUN したいときは末尾の DELETE 文の前に ROLLBACK を入れて BEGIN/ROLLBACK
-- で囲ってください。
-- ─────────────────────────────────────────────

-- ────────────────────────────────────────────
-- 1) 現状の孤児レコード数を確認（情報表示用）
-- ────────────────────────────────────────────
DO $$
DECLARE
  orphan_kr          INT;
  orphan_wr_obj      INT;
  orphan_wr_kr       INT;
  orphan_review_kr   INT;
  orphan_tasks_report INT;
BEGIN
  SELECT COUNT(*) INTO orphan_kr
    FROM key_results kr
    LEFT JOIN objectives o ON o.id = kr.objective_id
    WHERE o.id IS NULL;

  SELECT COUNT(*) INTO orphan_wr_obj
    FROM weekly_reports wr
    LEFT JOIN objectives o ON o.id = wr.objective_id
    WHERE wr.objective_id IS NOT NULL AND o.id IS NULL;

  SELECT COUNT(*) INTO orphan_wr_kr
    FROM weekly_reports wr
    LEFT JOIN key_results kr ON kr.id = wr.kr_id
    WHERE wr.kr_id IS NOT NULL AND kr.id IS NULL;

  -- kr_weekly_reviews は存在するテーブルの場合のみチェック
  IF to_regclass('public.kr_weekly_reviews') IS NOT NULL THEN
    SELECT COUNT(*) INTO orphan_review_kr
      FROM kr_weekly_reviews rv
      LEFT JOIN key_results kr ON kr.id = rv.kr_id
      WHERE rv.kr_id IS NOT NULL AND kr.id IS NULL;
  ELSE
    orphan_review_kr := 0;
  END IF;

  -- ka_tasks は report_id / ka_key 両方参照するので report_id だけ見る
  IF to_regclass('public.ka_tasks') IS NOT NULL THEN
    SELECT COUNT(*) INTO orphan_tasks_report
      FROM ka_tasks t
      LEFT JOIN weekly_reports r ON r.id = t.report_id
      WHERE t.report_id IS NOT NULL AND r.id IS NULL;
  ELSE
    orphan_tasks_report := 0;
  END IF;

  RAISE NOTICE '孤児レコード数 → key_results(親Obj不在): %, weekly_reports(親Obj不在): %, weekly_reports(親KR不在): %, kr_weekly_reviews(親KR不在): %, ka_tasks(親report不在): %',
    orphan_kr, orphan_wr_obj, orphan_wr_kr, orphan_review_kr, orphan_tasks_report;
END $$;

-- ────────────────────────────────────────────
-- 2) FK に ON DELETE CASCADE を設定
--    既存の FK を DROP → 同名で CASCADE 付きで再作成
-- ────────────────────────────────────────────

-- key_results.objective_id → objectives.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'key_results'
      AND constraint_name = 'key_results_objective_id_fkey'
  ) THEN
    ALTER TABLE key_results DROP CONSTRAINT key_results_objective_id_fkey;
  END IF;
  ALTER TABLE key_results
    ADD CONSTRAINT key_results_objective_id_fkey
    FOREIGN KEY (objective_id) REFERENCES objectives(id) ON DELETE CASCADE;
END $$;

-- weekly_reports.objective_id → objectives.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'weekly_reports'
      AND constraint_name = 'weekly_reports_objective_id_fkey'
  ) THEN
    ALTER TABLE weekly_reports DROP CONSTRAINT weekly_reports_objective_id_fkey;
  END IF;
  -- objective_id は NULL 許容のまま（既存行の互換）
  ALTER TABLE weekly_reports
    ADD CONSTRAINT weekly_reports_objective_id_fkey
    FOREIGN KEY (objective_id) REFERENCES objectives(id) ON DELETE CASCADE;
END $$;

-- weekly_reports.kr_id → key_results.id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'weekly_reports'
      AND constraint_name = 'weekly_reports_kr_id_fkey'
  ) THEN
    ALTER TABLE weekly_reports DROP CONSTRAINT weekly_reports_kr_id_fkey;
  END IF;
  ALTER TABLE weekly_reports
    ADD CONSTRAINT weekly_reports_kr_id_fkey
    FOREIGN KEY (kr_id) REFERENCES key_results(id) ON DELETE CASCADE;
END $$;

-- kr_weekly_reviews.kr_id → key_results.id
DO $$
BEGIN
  IF to_regclass('public.kr_weekly_reviews') IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'kr_weekly_reviews'
      AND constraint_name = 'kr_weekly_reviews_kr_id_fkey'
  ) THEN
    ALTER TABLE kr_weekly_reviews DROP CONSTRAINT kr_weekly_reviews_kr_id_fkey;
  END IF;
  ALTER TABLE kr_weekly_reviews
    ADD CONSTRAINT kr_weekly_reviews_kr_id_fkey
    FOREIGN KEY (kr_id) REFERENCES key_results(id) ON DELETE CASCADE;
END $$;

-- ka_tasks.report_id → weekly_reports.id
DO $$
BEGIN
  IF to_regclass('public.ka_tasks') IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'ka_tasks'
      AND constraint_name = 'ka_tasks_report_id_fkey'
  ) THEN
    ALTER TABLE ka_tasks DROP CONSTRAINT ka_tasks_report_id_fkey;
  END IF;
  ALTER TABLE ka_tasks
    ADD CONSTRAINT ka_tasks_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES weekly_reports(id) ON DELETE CASCADE;
END $$;

-- ────────────────────────────────────────────
-- 3) 既存孤児データの掃除
--    （FK の CASCADE は「今後の」削除にしか効かない。
--     今ある孤児は手動で消す必要がある）
--
--  念のため、以下は先に "1) 孤児レコード数" のログを見て
--  件数が想定内なことを確認してから実行してください。
--  DRY-RUN したければ BEGIN; ... ROLLBACK; で囲めます。
-- ────────────────────────────────────────────

-- key_results: 親 Obj が居ない行
DELETE FROM key_results kr
WHERE NOT EXISTS (SELECT 1 FROM objectives o WHERE o.id = kr.objective_id);

-- weekly_reports: 親 Obj が非NULLなのに不在
DELETE FROM weekly_reports wr
WHERE wr.objective_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM objectives o WHERE o.id = wr.objective_id);

-- weekly_reports: 親 KR が非NULLなのに不在
DELETE FROM weekly_reports wr
WHERE wr.kr_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM key_results kr WHERE kr.id = wr.kr_id);

-- kr_weekly_reviews: 親 KR が不在
DO $$
BEGIN
  IF to_regclass('public.kr_weekly_reviews') IS NOT NULL THEN
    DELETE FROM kr_weekly_reviews rv
    WHERE rv.kr_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM key_results kr WHERE kr.id = rv.kr_id);
  END IF;
END $$;

-- ka_tasks: 親 weekly_reports 行が不在
DO $$
BEGIN
  IF to_regclass('public.ka_tasks') IS NOT NULL THEN
    DELETE FROM ka_tasks t
    WHERE t.report_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM weekly_reports r WHERE r.id = t.report_id);
  END IF;
END $$;

-- ────────────────────────────────────────────
-- 4) 仕上げ
-- ────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- 再実行して「孤児レコード数 → ... 0, 0, 0, 0, 0」と出れば完了
DO $$
DECLARE
  orphan_kr          INT;
  orphan_wr_obj      INT;
  orphan_wr_kr       INT;
  orphan_review_kr   INT;
  orphan_tasks_report INT;
BEGIN
  SELECT COUNT(*) INTO orphan_kr FROM key_results kr
    LEFT JOIN objectives o ON o.id = kr.objective_id WHERE o.id IS NULL;
  SELECT COUNT(*) INTO orphan_wr_obj FROM weekly_reports wr
    LEFT JOIN objectives o ON o.id = wr.objective_id
    WHERE wr.objective_id IS NOT NULL AND o.id IS NULL;
  SELECT COUNT(*) INTO orphan_wr_kr FROM weekly_reports wr
    LEFT JOIN key_results kr ON kr.id = wr.kr_id
    WHERE wr.kr_id IS NOT NULL AND kr.id IS NULL;
  IF to_regclass('public.kr_weekly_reviews') IS NOT NULL THEN
    SELECT COUNT(*) INTO orphan_review_kr FROM kr_weekly_reviews rv
      LEFT JOIN key_results kr ON kr.id = rv.kr_id
      WHERE rv.kr_id IS NOT NULL AND kr.id IS NULL;
  ELSE
    orphan_review_kr := 0;
  END IF;
  IF to_regclass('public.ka_tasks') IS NOT NULL THEN
    SELECT COUNT(*) INTO orphan_tasks_report FROM ka_tasks t
      LEFT JOIN weekly_reports r ON r.id = t.report_id
      WHERE t.report_id IS NOT NULL AND r.id IS NULL;
  ELSE
    orphan_tasks_report := 0;
  END IF;
  RAISE NOTICE '掃除後の孤児 → key_results: %, wr/Obj: %, wr/KR: %, reviews: %, tasks: %',
    orphan_kr, orphan_wr_obj, orphan_wr_kr, orphan_review_kr, orphan_tasks_report;
END $$;
