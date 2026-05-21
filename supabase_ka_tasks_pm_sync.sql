-- ════════════════════════════════════════════════════════════════════════════
-- ka_tasks PM連携 DB対応 (WS 側 / canonical キー = email 小文字)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 前提:
--   - 自分のタスク = ka_tasks。本人特定の canonical キーは email(小文字)。
--   - PM 側は assignee_email 補完済み (PM 0041)。連携は pm_task_id で吸収。
--   - id(bigint) / organization_id(bigint) は PM(uuid) と型が違うので揃えない。
--
-- このファイルは旧 supabase_ka_tasks_assignee_email.sql を包含 (idempotent)。
-- そちらを実行済みでも、本ファイルを実行すれば不足分だけ追加される。
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. ka_tasks 拡張 (email キー + PM連携列) ────────────────────────────────
alter table public.ka_tasks
  add column if not exists assignee_email text,                          -- 跨ぎ突合キー(小文字)
  add column if not exists source         text not null default 'ws',    -- 'ws' | 'pm'
  add column if not exists pm_task_id      uuid,                          -- PM tasks.id への紐づけ
  add column if not exists project_id      uuid,                          -- PM プロジェクトID(PM由来用)
  add column if not exists project_name    text;                         -- 表示用に複製

-- 突合用インデックス (保存値は常に小文字だが lower() クエリにも対応する関数インデックス)
create index if not exists ka_tasks_assignee_email_lower_idx
  on public.ka_tasks (lower(assignee_email));

-- PM由来タスクを冪等に upsert するための一意キー
create unique index if not exists ka_tasks_pm_task_id_uniq
  on public.ka_tasks (pm_task_id) where pm_task_id is not null;

-- ── 2. members.email を正規化キーに (事前チェック済・重複なし) ───────────────
create unique index if not exists members_email_lower_uniq
  on public.members (lower(email)) where email is not null;

-- ── 3. 既存 ka_tasks の backfill (name → email、誤紐付け防止) ────────────────
--     同名が複数いる member は曖昧なので除外し、一意に決まる名前だけ埋める。
with uniq as (
  select name, max(lower(email)) as email
    from public.members
   where email is not null and name is not null and name <> ''
   group by name
  having count(*) = 1
)
update public.ka_tasks t
   set assignee_email = uniq.email
  from uniq
 where t.assignee_email is null
   and t.assignee = uniq.name;

notify pgrst, 'reload schema';

-- ── 4. 移行漏れ確認 (実行後に手動で。マイグレーションではない) ──────────────
--   ここに出た名前は 表記揺れ / 同名 / member 未登録 のいずれか。
--   手当てするか、本人が再保存すれば埋まる。
-- select assignee, count(*)
--   from public.ka_tasks
--  where assignee_email is null and assignee is not null
--  group by 1 order by 2 desc;
