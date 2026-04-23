-- ka_tasks.ka_key カラム追加 (2026-04-13 に導入されたがマイグレーション未作成だったもの)
--
-- 背景:
--   コミット 93157dd で「週を跨いで同じタスクを保持する」ために ka_key を導入。
--   形式: "{kr_id}|{ka_title}|{owner}|{objective_id}"
--   lib/kaKey.js computeKAKey() が組み立てる。
--
--   しかしコード変更のみ commit され、DB スキーマへの ALTER TABLE が作られなかった。
--   結果、ka_tasks への insert 全て「Could not find the 'ka_key' column」で 400 になる。
--
-- 実行方法:
--   Supabase の SQL エディタでこの SQL を貼り付けて RUN。
--   本番と staging の両方で実行すること。

ALTER TABLE ka_tasks ADD COLUMN IF NOT EXISTS ka_key TEXT;

-- PostgREST のスキーマキャッシュを即時リロード (既存 API クライアントに反映させる)
NOTIFY pgrst, 'reload schema';
