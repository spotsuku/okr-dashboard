-- ════════════════════════════════════════════════════════════════════════════
-- coaching_profiles — ユーザーごとのコーチング傾向プロファイル (Phase 2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 仕様:
--   - MyCOO (AIコーチ) が会話のたびに、ユーザーの特徴を要約してDBに蓄積
--   - 次回以降の AI 呼び出しで systemPrompt に「【このユーザーの傾向】」として
--     注入し、応答をパーソナライズする
--
-- 構造:
--   - owner             : メンバー名 (PK)
--   - profile_summary   : AI が要約したユーザーの特徴 (Markdown)
--   - preferences       : {logical_emotional, numbers_stories, ...} の数値スコア
--   - last_updated_at   : 最後にプロファイルを更新した時刻
--   - updated_count     : 累計更新回数 (debug 用)
--   - is_user_edited    : ユーザーが手動編集した場合 true (AI 自動更新をスキップ)
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coaching_profiles (
  owner            TEXT PRIMARY KEY,
  profile_summary  TEXT,
  preferences      JSONB DEFAULT '{}'::jsonb,
  last_updated_at  TIMESTAMPTZ,
  updated_count    INTEGER NOT NULL DEFAULT 0,
  is_user_edited   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE coaching_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coaching_profiles_all ON coaching_profiles;
CREATE POLICY coaching_profiles_all ON coaching_profiles
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
