-- ─────────────────────────────────────────────
-- milestones テーブル
-- ─────────────────────────────────────────────
create table if not exists milestones (
  id            bigint generated always as identity primary key,
  fiscal_year   int     not null default 2026,

  -- 既存の levels テーブルを参照
  org_id        bigint  references levels(id) on delete cascade,

  -- バー描画用：会計年度の月番号（4=4月, 5=5月 ... 12=12月, 1=1月, 2=2月, 3=3月）
  start_month   int     not null check (start_month between 1 and 12),
  end_month     int     not null check (end_month   between 1 and 12),

  -- 期日（残日数カウントダウン用）
  due_date      date,

  title         text    not null,

  -- focus=濃色（最注力フェーズ）/ normal=薄色（進行中）
  focus_level   text    not null default 'normal'
                check (focus_level in ('focus', 'normal')),

  -- 完了・遅延ステータス
  status        text    not null default 'pending'
                check (status in ('pending', 'done', 'delayed')),

  -- 同じ事業部・同じ月内での表示順
  sort_order    int     not null default 0,

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- RLS（Row Level Security）
-- ─────────────────────────────────────────────
alter table milestones enable row level security;

-- 閲覧：ログイン済みユーザー全員
create policy "milestones_select"
  on milestones for select
  using (auth.role() = 'authenticated');

-- 編集：adminロールのみ（membersテーブルで判定）
create policy "milestones_insert"
  on milestones for insert
  with check (
    exists (
      select 1 from members
      where members.email = auth.jwt()->>'email'
        and members.is_admin = true
    )
  );

create policy "milestones_update"
  on milestones for update
  using (
    exists (
      select 1 from members
      where members.email = auth.jwt()->>'email'
        and members.is_admin = true
    )
  );

create policy "milestones_delete"
  on milestones for delete
  using (
    exists (
      select 1 from members
      where members.email = auth.jwt()->>'email'
        and members.is_admin = true
    )
  );

-- ─────────────────────────────────────────────
-- updated_at 自動更新トリガー
-- ─────────────────────────────────────────────
create or replace function update_milestones_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger milestones_updated_at
  before update on milestones
  for each row execute function update_milestones_updated_at();

-- ─────────────────────────────────────────────
-- 初期データ投入
-- ─────────────────────────────────────────────
do $$
declare
  id_mgmt      bigint;
  id_partner   bigint;
  id_youth     bigint;
  id_community bigint;
  id_event     bigint;
begin

  select id into id_mgmt
    from levels where name ilike '%経営企画%' limit 1;

  select id into id_partner
    from levels where name ilike '%パートナー%' limit 1;

  select id into id_youth
    from levels where name ilike '%ユース%' limit 1;

  select id into id_community
    from levels
    where name ilike '%コミュニティ%'
      and parent_id is null
    limit 1;

  select id into id_event
    from levels where name ilike '%イベント%' limit 1;

  -- ── 経営企画 ────────────────────────────────
  insert into milestones
    (fiscal_year, org_id, start_month, end_month, due_date, title, focus_level, sort_order)
  values
    (2026, id_mgmt, 4, 5, '2026-05-31', '体制整備・基金着手',       'focus',  1),
    (2026, id_mgmt, 6, 6, '2026-06-30', '全社OKR・業務一覧 完成',   'normal', 2),
    (2026, id_mgmt, 7, 9, '2026-09-30', '黒字化確立・大学連携',     'normal', 1),
    (2026, id_mgmt, 10,12, '2026-12-31', 'NEO CM・3期仕込み',       'normal', 1),
    (2026, id_mgmt, 1, 3,  '2027-03-31', '基金公表・4/30記者会見',  'focus',  1);

  -- ── パートナー事業部 ────────────────────────
  insert into milestones
    (fiscal_year, org_id, start_month, end_month, due_date, title, focus_level, sort_order)
  values
    (2026, id_partner, 4, 4, '2026-04-30', '会員24社×300万円 確定',           'focus',  1),
    (2026, id_partner, 5, 5, '2026-05-31', 'オンボーディング完了',             'focus',  2),
    (2026, id_partner, 6, 6, '2026-06-30', '研修納品開始・AIキャンプ170人',    'normal', 3),
    (2026, id_partner, 7, 9, '2026-09-30', 'AI研修 350人・5,000万円',         'normal', 1),
    (2026, id_partner, 10,11,'2026-11-30', '受注1億達成・契約更新',            'focus',  1),
    (2026, id_partner, 12, 3, '2027-02-28', '継続率100%・Gate4×2社',          'normal', 1);

  -- ── ユース事業部 ────────────────────────────
  insert into milestones
    (fiscal_year, org_id, start_month, end_month, due_date, title, focus_level, sort_order)
  values
    (2026, id_youth, 4, 4, '2026-04-17', '4/17 キックオフ開催',              'focus',  1),
    (2026, id_youth, 5, 6, '2026-06-30', '3期生36名確定・説明会5回完了',      'focus',  2),
    (2026, id_youth, 7, 9, '2026-09-30', 'プレNEOユース500人・リスト1,200人', 'normal', 1),
    (2026, id_youth, 10,12, '2026-12-31', 'アワード310人来場・3期サイト公開', 'normal', 1),
    (2026, id_youth, 1, 3,  '2027-02-28', '卒業72名・1期生ヒーロー認定発表',  'focus',  1);

  -- ── コミュニティ事業部 ──────────────────────
  insert into milestones
    (fiscal_year, org_id, start_month, end_month, due_date, title, focus_level, sort_order)
  values
    (2026, id_community, 4, 6, '2026-06-30', '委員会立ち上げ・OB/OG組織確立',     'focus', 1),
    (2026, id_community, 7, 9, '2026-09-30', '12〜14PJ組成・リーダー20名面談',    'focus', 1),
    (2026, id_community, 10,12,'2026-12-31', 'POC完了・アワード（投資ピッチ）',   'focus', 1),
    (2026, id_community, 1, 3, '2027-03-31', 'ヒーロー1名創出・継続率90%',        'normal',1);

  -- ── イベントチーム（コミュニティ配下） ────────
  insert into milestones
    (fiscal_year, org_id, start_month, end_month, due_date, title, focus_level, sort_order)
  values
    (2026, id_event, 4, 4, '2026-04-10', 'KO集客開始',                       'focus',  1),
    (2026, id_event, 5, 6, '2026-06-30', 'HL運営体制確立・協議会1発目',       'normal', 2),
    (2026, id_event, 7, 9, '2026-09-30', '協議会×4回 満足度90点・長崎訪問',   'normal', 1),
    (2026, id_event, 10,12,'2026-12-31', 'シティフェス動画収集・アワード運営', 'focus',  1),
    (2026, id_event, 1, 3, '2027-02-28', 'イヤーエンド（ホテル）運営',        'normal', 1);

end $$;
