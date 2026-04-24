-- ─────────────────────────────────────────────
-- milestones に fiscal_year 列を追加するマイグレーション
-- （既存DBには列が無いため、MilestonePage.jsx の .eq('fiscal_year', fy)
--  が "column milestones.fiscal_year does not exist" で失敗していた）
--
-- Supabase SQL Editor で1回だけ実行すればOK。
-- IF NOT EXISTS を付けているので、新規に supabase_milestones.sql から
-- テーブルを作り直した環境でも安全に再実行できる。
-- ─────────────────────────────────────────────
alter table milestones
  add column if not exists fiscal_year int not null default 2026;

-- 既存データが NULL で入っている場合の念のため埋め戻し
update milestones set fiscal_year = 2026 where fiscal_year is null;

-- 年度+組織で検索するケース用にインデックスを張っておく (任意)
create index if not exists milestones_fiscal_year_org_idx
  on milestones (fiscal_year, org_id);
