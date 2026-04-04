-- ─────────────────────────────────────────────
-- start_date カラム追加（バー表示を日単位にするため）
-- ─────────────────────────────────────────────
alter table milestones add column if not exists start_date date;

-- 既存レコードに start_date を start_month の1日として設定
update milestones
set start_date = make_date(
  case
    when start_month >= 4 then fiscal_year
    else fiscal_year + 1
  end,
  start_month,
  1
)
where start_date is null;

-- due_date が null の既存レコードには end_month の末日を設定
update milestones
set due_date = (
  make_date(
    case
      when end_month >= 4 then fiscal_year
      else fiscal_year + 1
    end,
    end_month,
    1
  ) + interval '1 month' - interval '1 day'
)::date
where due_date is null;
