-- ============================================================
-- coaching_chats: MyCOO の AI チャット履歴を永続化するテーブル
--
-- 目的: ユーザーが自分の過去の質問とAI回答を後から見返せるようにする
--
-- 1ユーザーごとに role='user'/'assistant' の交互ログを保存
-- 表示は created_at 昇順で読み込んで時系列復元
-- ============================================================

CREATE TABLE IF NOT EXISTS coaching_chats (
  id              BIGSERIAL PRIMARY KEY,
  owner           TEXT NOT NULL,              -- 質問者 (members.name)
  role            TEXT NOT NULL,              -- 'user' or 'assistant'
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS coaching_chats_owner_idx
  ON coaching_chats (owner, created_at);
CREATE INDEX IF NOT EXISTS coaching_chats_org_idx
  ON coaching_chats (organization_id);

-- マルチテナント default org トリガを既存 set_default_organization_id() に追従させる
-- (Phase1 で他テーブルに付けた仕組みと同じ)
DROP TRIGGER IF EXISTS set_org_id_coaching_chats ON coaching_chats;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_default_organization_id') THEN
    EXECUTE 'CREATE TRIGGER set_org_id_coaching_chats
             BEFORE INSERT ON coaching_chats
             FOR EACH ROW EXECUTE FUNCTION set_default_organization_id()';
  END IF;
END $$;

-- RLS: current_org_ids() を持つ環境ではマルチテナント分離、無い環境では誰でも読み書き可
ALTER TABLE coaching_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coaching_chats_select ON coaching_chats;
DROP POLICY IF EXISTS coaching_chats_insert ON coaching_chats;
DROP POLICY IF EXISTS coaching_chats_delete ON coaching_chats;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_org_ids') THEN
    -- マルチテナント版: 自分の所属組織内のみ
    EXECUTE 'CREATE POLICY coaching_chats_select ON coaching_chats
             FOR SELECT USING (organization_id = ANY(current_org_ids()))';
    EXECUTE 'CREATE POLICY coaching_chats_insert ON coaching_chats
             FOR INSERT WITH CHECK (organization_id = ANY(current_org_ids()))';
    EXECUTE 'CREATE POLICY coaching_chats_delete ON coaching_chats
             FOR DELETE USING (organization_id = ANY(current_org_ids()))';
  ELSE
    -- フォールバック: 認証済みなら全許可
    EXECUTE 'CREATE POLICY coaching_chats_select ON coaching_chats FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY coaching_chats_insert ON coaching_chats FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY coaching_chats_delete ON coaching_chats FOR DELETE USING (true)';
  END IF;
END $$;
