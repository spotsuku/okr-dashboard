-- ════════════════════════════════════════════════════════════════════════════
-- analytics_events にサブ機能識別子 (feature) カラムを追加
-- ════════════════════════════════════════════════════════════════════════════
-- ページ単位 (page) の粒度では「マイページの中でメールを開いたのか MyCOO を
-- 使ったのか」が分からないので、ページ内のサブ機能を識別する feature 列を追加。
--
-- 例:
--   page = 'mycoach',  feature = 'tab_mail'      (マイページの「メール」タブを開いた)
--   page = 'mycoach',  feature = 'tab_coo'       (マイページの「MyCOO」タブを開いた)
--   page = 'mycoo_orb', feature = 'chat_send'    (右下 MyCOO オーブから AI に送信)
--
-- event_type は新たに 'feature' を使用 (既存の 'page_view' / 'login' は維持)。
-- 何度実行しても安全 (if not exists)。

alter table public.analytics_events
  add column if not exists feature text;

create index if not exists analytics_events_org_feature_ts
  on public.analytics_events (organization_id, feature, created_at desc)
  where feature is not null;
