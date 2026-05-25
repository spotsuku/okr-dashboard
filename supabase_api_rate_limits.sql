-- ════════════════════════════════════════════════════════════════════════════
-- API レート制限テーブル (lib/apiGuard の checkRateLimit が使用)
-- ════════════════════════════════════════════════════════════════════════════
-- 無料公開SaaSで AI/外部API の乱用(コスト)を防ぐため、bucket(例 ai:<userId>)ごとに
-- 直近ウィンドウのリクエスト数を数える。service role からのみ読み書きする。
create table if not exists public.api_rate_limits (
  id          bigserial primary key,
  bucket      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists api_rate_limits_bucket_ts
  on public.api_rate_limits (bucket, created_at);

-- RLS 有効化。ポリシー未定義 = anon/authenticated からはアクセス不可、
-- service role (APIルート) のみ操作可能。
alter table public.api_rate_limits enable row level security;

-- 古い行の掃除 (任意・cron 推奨):
--   delete from public.api_rate_limits where created_at < now() - interval '1 day';
