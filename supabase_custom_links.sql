-- ════════════════════════════════════════════════════════════════════════════
-- カスタムリンク (ホーム画面) を localStorage から Supabase に昇格
-- ════════════════════════════════════════════════════════════════════════════
-- 2 レーン:
--   ・個人リンク: user_email にログインユーザーのメールが入る。自分しか見えない / 編集可
--   ・組織共有リンク: user_email が NULL。組織メンバー全員が閲覧、owner/admin のみ編集
--
-- RLS は許可ベース (allow_all_authenticated)。
-- 「他人のリンクを編集できないか」「共有リンクを一般メンバーが編集できないか」は
-- クライアントの UI で制御 (組織メンバーシップに依存するロジックは API で強化可能)。
-- 既存テーブル (organization_members 等) と同じ方針で運用負荷を上げない。
--
-- 冪等 (IF NOT EXISTS) なので何度実行しても安全。

create table if not exists public.custom_links (
  id              bigserial primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  user_email      text,                -- NULL = 組織共有リンク
  title           text not null,
  url             text not null,
  color           text default 'accent',
  sort_order      int  default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists custom_links_org_user_idx
  on public.custom_links (organization_id, user_email, sort_order);

alter table public.custom_links enable row level security;

drop policy if exists custom_links_all_authenticated on public.custom_links;
create policy custom_links_all_authenticated
  on public.custom_links for all to authenticated
  using (true) with check (true);
