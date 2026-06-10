-- ════════════════════════════════════════════════════════════════════════════
-- 利用分析イベントテーブル (lib/track.js が記録 / app/api/analytics が集計)
-- ════════════════════════════════════════════════════════════════════════════
-- 「どのユーザーが・どれくらい・どの機能を使っているか」を可視化するための
-- 行動ログ。画面遷移 (page_view) / ログイン (login) などを 1 行ずつ記録する。
--
-- 書き込み: ログイン済みユーザーがクライアントから直接 insert (RLS で許可)。
-- 読み取り: ポリシー未定義 = service role (= API ルート) のみ。
--   組織内 admin 分析 / 組織横断 super 分析はどちらも service role で集計する。
create table if not exists public.analytics_events (
  id              bigserial primary key,
  organization_id bigint references public.organizations(id) on delete set null,
  user_email      text,
  event_type      text not null,              -- 'page_view' | 'login' | (将来: 'feature' 等)
  page            text,                        -- 画面/機能キー (例 'okr' 'weekly' 'mytasks')
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- 集計でよく使う軸にインデックス
create index if not exists analytics_events_org_ts
  on public.analytics_events (organization_id, created_at desc);
create index if not exists analytics_events_org_email_ts
  on public.analytics_events (organization_id, user_email, created_at desc);
create index if not exists analytics_events_ts
  on public.analytics_events (created_at desc);

-- RLS 有効化
alter table public.analytics_events enable row level security;

-- ログイン済みユーザーは自分の行動ログを insert できる (select は不可)。
-- select ポリシーは定義しない → anon/authenticated からは読めず、
-- service role (API ルート) のみが集計のために読み取る。
drop policy if exists analytics_events_insert_authenticated on public.analytics_events;
create policy analytics_events_insert_authenticated
  on public.analytics_events for insert to authenticated
  with check (true);

-- 古い行の掃除 (任意・cron 推奨。例: 1 年より古いものを削除):
--   delete from public.analytics_events where created_at < now() - interval '365 days';
