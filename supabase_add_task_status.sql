-- ka_tasks テーブルに status カラムを追加
-- status: 'not_started' (未着手), 'in_progress' (進行中), 'done' (完了)
ALTER TABLE ka_tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not_started';

-- 既存データの移行: done=true のタスクは status='done' に
UPDATE ka_tasks SET status = 'done' WHERE done = true AND (status IS NULL OR status = 'not_started');
-- done=false のタスクは status='not_started' のまま
