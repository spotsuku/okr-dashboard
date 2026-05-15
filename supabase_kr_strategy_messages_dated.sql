-- ─────────────────────────────────────────────────────────────────
-- 経営メッセージを日付付き履歴で保存
--
-- 既存: kr_strategies (kr_id 一意。編集すると上書き = 履歴消失)
-- 新規: kr_strategy_messages
--   - (kr_id, message_date) UNIQUE
--   - 同じ日に複数回保存 → 上書き
--   - 別の日に保存 → 新規行 → タブで切替閲覧
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kr_strategy_messages (
  id            BIGSERIAL PRIMARY KEY,
  kr_id         BIGINT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  message_date  DATE   NOT NULL,           -- JST の日付
  message       TEXT   NOT NULL DEFAULT '',
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (kr_id, message_date)
);

CREATE INDEX IF NOT EXISTS idx_kr_strategy_messages_kr_date
  ON kr_strategy_messages (kr_id, message_date DESC);

COMMENT ON TABLE  kr_strategy_messages IS '経営からのメッセージ (KR×日付ごとの履歴)';
COMMENT ON COLUMN kr_strategy_messages.message_date IS '保存日 (JST)。同じ日の編集は上書き、別の日は新規履歴';

-- 既存 kr_strategies のメッセージを「今日 (JST)」の履歴として移行 (重複は無視)
INSERT INTO kr_strategy_messages (kr_id, message_date, message, updated_by, updated_at)
SELECT
  kr_id,
  (NOW() AT TIME ZONE 'Asia/Tokyo')::date,
  message,
  updated_by,
  COALESCE(updated_at, NOW())
FROM kr_strategies
WHERE message IS NOT NULL AND length(trim(message)) > 0
ON CONFLICT (kr_id, message_date) DO NOTHING;
