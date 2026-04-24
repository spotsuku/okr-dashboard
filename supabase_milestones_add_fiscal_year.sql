-- ─────────────────────────────────────────────
-- milestones テーブルを現行コード互換スキーマに揃えるマイグレーション
--
-- 背景:
--   本番/staging DB は旧設計のまま残っており、以下のズレがある。
--   ・欠落: fiscal_year / org_id / start_month / end_month / start_date
--   ・旧列: theme_id (NOT NULL) ← 現行コードは使わずINSERTで送らないので NULL 不可だと失敗
--   ・due_date 型: text (現行コードは 'YYYY-MM-DD' 文字列を送るのでそのままでも動く)
--
-- 全文 IF NOT EXISTS / IF EXISTS / DO blocks を使って何度流しても安全。
-- ─────────────────────────────────────────────

-- ① 現行コードが参照する列を追加
alter table milestones add column if not exists fiscal_year  int  not null default 2026;
alter table milestones add column if not exists org_id       bigint;
alter table milestones add column if not exists start_month  int;
alter table milestones add column if not exists end_month    int;
alter table milestones add column if not exists start_date   date;

-- ② org_id に FK を張る (既に張られていれば飛ばす)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'milestones_org_id_fkey'
  ) then
    alter table milestones
      add constraint milestones_org_id_fkey
      foreign key (org_id) references levels(id) on delete cascade;
  end if;
end $$;

-- ③ CHECK 制約 (start_month / end_month が 1..12)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'milestones_start_month_check') then
    alter table milestones add constraint milestones_start_month_check
      check (start_month is null or start_month between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'milestones_end_month_check') then
    alter table milestones add constraint milestones_end_month_check
      check (end_month   is null or end_month   between 1 and 12);
  end if;
end $$;

-- ④ 旧列 theme_id を INSERT で送らなくても通るように NOT NULL を解除
--    (既存データは保持。列削除までは行わない。不要になった後、別マイグレで drop 予定)
do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='milestones' and column_name='theme_id'
       and is_nullable='NO'
  ) then
    alter table milestones alter column theme_id drop not null;
  end if;
end $$;

-- ⑤ 既存行の fiscal_year 欠損を 2026 で埋める
update milestones set fiscal_year = 2026 where fiscal_year is null;

-- ⑥ 年度+組織で検索するケース用のインデックス
create index if not exists milestones_fiscal_year_org_idx
  on milestones (fiscal_year, org_id);
