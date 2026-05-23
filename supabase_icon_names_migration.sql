-- ════════════════════════════════════════════════════════════════════════════
-- アイコンのデータ移行: 旧絵文字 → アイコン名 (デザイン浸透・絵文字全廃)
-- ════════════════════════════════════════════════════════════════════════════
-- 対象: levels.icon (部署/チーム), organization_meetings.icon (会議タイプ)
-- アプリ側は <DataIcon value={icon}/> で旧絵文字も新名も描画できるため、本SQL未適用でも
-- 表示は壊れない (旧絵文字はクライアントのマップで名前解決される)。本SQLはデータを
-- 名前へ正規化し、新規保存も名前で行えるようにするためのもの。冪等。
-- 実行: staging で確認 → 本番。components/Icon.jsx の LEGACY_ICON_MAP と一致させること。
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  pair TEXT[];
  pairs TEXT[][] := ARRAY[
    ARRAY['🏢','building'], ARRAY['🏛️','building'], ARRAY['🏛','building'], ARRAY['🏬','building'],
    ARRAY['🚀','rocket'],
    ARRAY['⚙️','settings'], ARRAY['⚙','settings'],
    ARRAY['💼','briefcase'],
    ARRAY['👥','users'], ARRAY['👤','user'], ARRAY['👔','user'],
    ARRAY['📊','chart'], ARRAY['📈','chart'], ARRAY['📉','chartDown'],
    ARRAY['🎯','target'], ARRAY['◎','target'],
    ARRAY['💡','bulb'],
    ARRAY['🌟','star'], ARRAY['⭐','star'], ARRAY['★','star'],
    ARRAY['🔥','fire'],
    ARRAY['🤝','handshake'],
    ARRAY['📁','folder'], ARRAY['📂','folder'],
    ARRAY['🌅','sun'], ARRAY['☀️','sun'], ARRAY['☀','sun'], ARRAY['🌤','partly'], ARRAY['🌤️','partly'],
    ARRAY['🌱','leaf'],
    ARRAY['💰','coin'],
    ARRAY['📋','note'], ARRAY['📝','note'], ARRAY['🗒️','note'],
    ARRAY['🏷','tag'], ARRAY['🏷️','tag'],
    ARRAY['📅','calendar'], ARRAY['🗓️','calendar'], ARRAY['🗓','calendar'],
    ARRAY['⚡','bolt'],
    ARRAY['🔔','bell'], ARRAY['📬','inbox'], ARRAY['✅','check'],
    ARRAY['🎤','msg'], ARRAY['📢','msg'], ARRAY['💬','msg'],
    ARRAY['🔗','link'], ARRAY['📮','mail']
  ];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='levels' AND column_name='icon') THEN
      UPDATE levels SET icon = pair[2] WHERE icon = pair[1];
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organization_meetings' AND column_name='icon') THEN
      UPDATE organization_meetings SET icon = pair[2] WHERE icon = pair[1];
    END IF;
  END LOOP;
END $$;

-- 残った「アイコン名でも上記絵文字でもない」値は既定アイコンに寄せる
-- (アプリの ICON_PATHS に存在しない値は DataIcon が fallback するが、データも正規化しておく)
-- ※ 既知のアイコン名一覧はアプリ側に依存するため、ここでは NULL/空のみ既定化に留める。
UPDATE levels SET icon = 'folder' WHERE icon IS NULL OR icon = '';
UPDATE organization_meetings SET icon = 'note' WHERE icon IS NULL OR icon = '';

-- 新規行の既定値も名前に変更
ALTER TABLE levels ALTER COLUMN icon SET DEFAULT 'folder';

-- ════════════════════════════════════════════════════════════════════════════
-- 確認: SELECT DISTINCT icon FROM levels;  /  SELECT DISTINCT icon FROM organization_meetings;
--   → すべてアルファベットのアイコン名になっていれば成功。
-- ════════════════════════════════════════════════════════════════════════════
