-- マイルストーンに責任者（owner）カラムを追加
alter table milestones add column if not exists owner text;
