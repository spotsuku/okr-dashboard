-- ぺろっぺ (MyCOO) の組織知識テーブル
-- 三木CEOが追加・編集する「ぺろっぺ」が常に参照する組織知識

CREATE TABLE IF NOT EXISTS coo_knowledge (
  id              BIGSERIAL PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('text', 'drive_file')),
  title           TEXT NOT NULL,
  content         TEXT,                 -- kind='text' のとき本文
  drive_file_id   TEXT,                 -- kind='drive_file' のとき Drive ファイル ID
  drive_cached_text   TEXT,             -- Drive 取得結果のキャッシュ
  drive_cached_at     TIMESTAMPTZ,      -- 最終取得時刻 (古ければ再取得)
  drive_cache_error   TEXT,             -- 直近の取得エラー (あれば)
  priority        INT NOT NULL DEFAULT 0,  -- 並び順 (大きいほど先頭、AIに重要として伝わる)
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS coo_knowledge_priority_idx
  ON coo_knowledge (enabled, priority DESC, id ASC);

-- RLS: 全 authenticated ユーザーが閲覧可、書き込みは別途アプリ側で is_admin チェック
ALTER TABLE coo_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth users can read coo_knowledge" ON coo_knowledge;
CREATE POLICY "auth users can read coo_knowledge"
  ON coo_knowledge FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth users can write coo_knowledge" ON coo_knowledge;
CREATE POLICY "auth users can write coo_knowledge"
  ON coo_knowledge FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- ※ admin チェックは API サーバ側 (next.js route) で実施する想定

-- シードデータ (CEO 編集前のたたき台)
INSERT INTO coo_knowledge (kind, title, content, priority, updated_by)
VALUES
  ('text', 'NEO福岡の組織概要',
   E'NEO福岡は2事業部制の組織です。\n- Sports Nation 事業部: スポーツ関連事業\n- NEO ACADEMIA 事業部: 次世代リーダー育成事業\n他に経営企画部、コミュニティ事業部、パートナー事業部があります。',
   100, 'system_seed'),
  ('text', '三木智弘 CEO の経営哲学 (たたき台)',
   E'(三木CEOが編集してください)\n- 顧客起点で考える\n- 本質を見極める\n- 実行スピード重視\n- メンバーの成長を支援する',
   90, 'system_seed'),
  ('text', 'ぺろっぺの役割',
   E'ぺろっぺは三木CEOの右腕として、メンバー全員のコーチング・壁打ち相手を務めます。GROWモデル (Goal/Reality/Options/Will) で問いかけ、即答せずに本人の中にある答えを引き出すことを優先します。',
   80, 'system_seed')
ON CONFLICT DO NOTHING;
