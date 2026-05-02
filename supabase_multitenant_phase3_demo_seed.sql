-- ════════════════════════════════════════════════════════════════════════════
-- Phase 3a: Demo 組織のシードデータ
-- ════════════════════════════════════════════════════════════════════════════
--
-- 仮想会社「Sample Inc.」(slug='demo') を作成し、ダミーデータを投入。
-- 公開デモで visitor が自由に見学・編集できる組織。
--
-- 前提: Phase 1 + Phase 2 マイグレーション済み
-- 実行: staging で実行後、本番でも同じ SQL を実行
--
-- 一括リセットしたい場合: 末尾の <RESET> セクション参照
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Demo 組織を作成
-- ─────────────────────────────────────────────
INSERT INTO organizations (slug, name, plan, fiscal_year_default)
VALUES ('demo', 'Sample Inc.', 'demo', '2026')
ON CONFLICT (slug) DO NOTHING;

-- 以降の INSERT で参照する Demo org の id を取得しやすくするため一時関数
CREATE OR REPLACE FUNCTION _demo_org_id() RETURNS BIGINT AS $$
  SELECT id FROM organizations WHERE slug='demo'
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────
-- 2. ダミーメンバー (15名) — 「ゲスト」を含む
-- ─────────────────────────────────────────────
-- guest@demo.local: 公開デモで visitor が自動ログインするユーザー
-- (Supabase Auth 側にも guest@demo.local を作成する必要あり: 詳細は別ドキュメント)
INSERT INTO members (name, role, email, is_admin, organization_id) VALUES
  ('👀 ゲスト',     '見学者 (デモ用)',           'guest@demo.local',     FALSE, _demo_org_id()),
  ('山田 太郎',     '代表取締役',                 'yamada@example.demo',  TRUE,  _demo_org_id()),
  ('鈴木 花子',     '副社長',                     'suzuki@example.demo',  TRUE,  _demo_org_id()),
  ('田中 一郎',     '営業部 マネージャー',        'tanaka@example.demo',  FALSE, _demo_org_id()),
  ('佐藤 美咲',     '営業部 リーダー',            'sato@example.demo',    FALSE, _demo_org_id()),
  ('伊藤 健',       '営業部 メンバー',            'ito@example.demo',     FALSE, _demo_org_id()),
  ('高橋 由美',     'マーケティング部 マネージャー','takahashi@example.demo', FALSE, _demo_org_id()),
  ('渡辺 翔太',     'マーケティング部 メンバー',  'watanabe@example.demo',FALSE, _demo_org_id()),
  ('中村 葵',       '開発部 マネージャー',        'nakamura@example.demo',FALSE, _demo_org_id()),
  ('小林 龍',       '開発部 メンバー',            'kobayashi@example.demo',FALSE,_demo_org_id()),
  ('加藤 さくら',   '開発部 メンバー',            'kato@example.demo',    FALSE, _demo_org_id()),
  ('吉田 拓海',     '管理部 マネージャー',        'yoshida@example.demo', FALSE, _demo_org_id()),
  ('山本 優子',     '管理部 メンバー',            'yamamoto@example.demo',FALSE, _demo_org_id()),
  ('斎藤 隼人',     '事業企画部 リーダー',        'saito@example.demo',   FALSE, _demo_org_id()),
  ('松本 千夏',     '事業企画部 メンバー',        'matsumoto@example.demo',FALSE,_demo_org_id())
ON CONFLICT DO NOTHING;

-- 上記メンバーを organization_members に登録 (admin / member ロールで)
INSERT INTO organization_members (organization_id, member_id, role, is_default)
SELECT _demo_org_id(), m.id,
  CASE WHEN m.is_admin THEN 'admin'
       WHEN m.email = 'guest@demo.local' THEN 'member'
       ELSE 'member' END,
  TRUE
FROM members m
WHERE m.email LIKE '%@example.demo' OR m.email = 'guest@demo.local'
ON CONFLICT (organization_id, member_id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. ダミー組織階層 (root=会社, depth1=部署, depth2=チーム)
-- ─────────────────────────────────────────────
-- 全社 (root)
INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
VALUES ('Sample Inc.', '🏢', '#4d9fff', NULL, '2026', _demo_org_id())
ON CONFLICT DO NOTHING;

-- 事業部 4つ
DO $$
DECLARE
  root_id BIGINT;
  org BIGINT := _demo_org_id();
  sales_dept_id BIGINT;
  mkt_dept_id BIGINT;
  dev_dept_id BIGINT;
  bus_dept_id BIGINT;
BEGIN
  SELECT id INTO root_id FROM levels WHERE name='Sample Inc.' AND organization_id=org LIMIT 1;
  IF root_id IS NULL THEN RETURN; END IF;

  -- 営業部
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('営業部', '💼', '#FF9500', root_id, '2026', org)
    ON CONFLICT DO NOTHING;
  SELECT id INTO sales_dept_id FROM levels WHERE name='営業部' AND parent_id=root_id;

  -- マーケティング部
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('マーケティング部', '📢', '#a855f7', root_id, '2026', org)
    ON CONFLICT DO NOTHING;
  SELECT id INTO mkt_dept_id FROM levels WHERE name='マーケティング部' AND parent_id=root_id;

  -- 開発部
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('開発部', '💻', '#00d68f', root_id, '2026', org)
    ON CONFLICT DO NOTHING;
  SELECT id INTO dev_dept_id FROM levels WHERE name='開発部' AND parent_id=root_id;

  -- 事業企画部
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('事業企画部', '📊', '#5856d6', root_id, '2026', org)
    ON CONFLICT DO NOTHING;
  SELECT id INTO bus_dept_id FROM levels WHERE name='事業企画部' AND parent_id=root_id;

  -- 営業部 配下: 新規開拓 / 既存顧客
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('新規開拓', '🎯', '#ff6b6b', sales_dept_id, '2026', org),
           ('既存顧客', '🤝', '#ffd166', sales_dept_id, '2026', org)
    ON CONFLICT DO NOTHING;

  -- マーケ配下: コンテンツ / 広告
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('コンテンツ', '📝', '#a855f7', mkt_dept_id, '2026', org),
           ('広告運用', '📈', '#ec4899', mkt_dept_id, '2026', org)
    ON CONFLICT DO NOTHING;

  -- 開発配下: フロントエンド / バックエンド
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('フロントエンド', '🎨', '#06b6d4', dev_dept_id, '2026', org),
           ('バックエンド', '⚙️', '#10b981', dev_dept_id, '2026', org)
    ON CONFLICT DO NOTHING;

  -- 事業企画配下: 戦略 / オペレーション
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
    VALUES ('戦略企画', '🧭', '#5856d6', bus_dept_id, '2026', org),
           ('オペレーション', '🛠️', '#7e22ce', bus_dept_id, '2026', org)
    ON CONFLICT DO NOTHING;
END $$;

-- ─────────────────────────────────────────────
-- 4. メンバーの所属チーム (level_id) を割当
-- ─────────────────────────────────────────────
DO $$
DECLARE
  org BIGINT := _demo_org_id();
BEGIN
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='Sample Inc.' AND organization_id=org)
    WHERE email IN ('yamada@example.demo','suzuki@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='新規開拓' AND organization_id=org)
    WHERE email IN ('tanaka@example.demo','sato@example.demo','ito@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='コンテンツ' AND organization_id=org)
    WHERE email IN ('takahashi@example.demo','watanabe@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='バックエンド' AND organization_id=org)
    WHERE email IN ('nakamura@example.demo','kobayashi@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='フロントエンド' AND organization_id=org)
    WHERE email='kato@example.demo' AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='オペレーション' AND organization_id=org)
    WHERE email IN ('yoshida@example.demo','yamamoto@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='戦略企画' AND organization_id=org)
    WHERE email IN ('saito@example.demo','matsumoto@example.demo') AND organization_id=org;
  -- ゲストはルートに置く
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='Sample Inc.' AND organization_id=org)
    WHERE email='guest@demo.local' AND organization_id=org;
END $$;

-- ─────────────────────────────────────────────
-- 5. チーム責任者 (manager_id) 割当
-- ─────────────────────────────────────────────
DO $$
DECLARE
  org BIGINT := _demo_org_id();
BEGIN
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='tanaka@example.demo' AND organization_id=org)
    WHERE name='営業部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='takahashi@example.demo' AND organization_id=org)
    WHERE name='マーケティング部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='nakamura@example.demo' AND organization_id=org)
    WHERE name='開発部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='saito@example.demo' AND organization_id=org)
    WHERE name='事業企画部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='sato@example.demo' AND organization_id=org)
    WHERE name='新規開拓' AND organization_id=org;
END $$;

-- ─────────────────────────────────────────────
-- 6. ダミー OKR (Objectives + KR)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  org BIGINT := _demo_org_id();
  sales_id BIGINT;
  mkt_id BIGINT;
  dev_id BIGINT;
  obj_id BIGINT;
BEGIN
  SELECT id INTO sales_id FROM levels WHERE name='営業部' AND organization_id=org;
  SELECT id INTO mkt_id   FROM levels WHERE name='マーケティング部' AND organization_id=org;
  SELECT id INTO dev_id   FROM levels WHERE name='開発部' AND organization_id=org;

  -- 営業部
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (sales_id, 'q1', 'どうすれば新規顧客を倍増できるか', '田中 一郎', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '新規受注数 30件達成',     30, 12, '件',  '佐藤 美咲', org),
    (obj_id, '商談化率 40%以上',        40, 28, '%',   '伊藤 健',   org),
    (obj_id, '平均契約単価 200万円',  200, 165, '万円','田中 一郎', org);

  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (sales_id, 'annual', '営業組織として継続的成長基盤を作るには', '田中 一郎', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '年間売上 1.2億円',       12000, 4500, '万円', '田中 一郎', org),
    (obj_id, '受注継続率 85%',           85,    72, '%',    '佐藤 美咲', org);

  -- マーケ
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (mkt_id, 'q1', 'リード獲得効率を最大化する', '高橋 由美', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '月間リード 500件',  500, 320, '件',  '高橋 由美', org),
    (obj_id, 'CV率 5%以上',         5, 3.8, '%',   '渡辺 翔太', org);

  -- 開発
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (dev_id, 'q1', '開発生産性を3倍にする', '中村 葵', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '主要機能リリース 12件',  12,  4, '件',  '中村 葵',     org),
    (obj_id, 'バグ件数 月10件以下',     10, 17, '件',  '小林 龍',     org),
    (obj_id, 'デプロイ頻度 週5回',       5,  2, '回/週','加藤 さくら', org);
END $$;

-- ─────────────────────────────────────────────
-- 7. 後片付け
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS _demo_org_id;

-- ════════════════════════════════════════════════════════════════════════════
-- 検証
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT slug, name FROM organizations;                       -- neo-fukuoka, demo の2件
-- SELECT count(*) FROM members WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo'); -- 15件
-- SELECT count(*) FROM levels WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo'); -- 13件 (1+4+8)
-- SELECT count(*) FROM key_results WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo'); -- 9件

-- ════════════════════════════════════════════════════════════════════════════
-- <RESET> Demo 組織を完全に削除して再シードしたい場合
-- ════════════════════════════════════════════════════════════════════════════
-- DELETE FROM organizations WHERE slug='demo';
-- (ON DELETE CASCADE で organization_members / 全テーブルの demo データも消える)
-- 上記実行後、このSQL全体を再実行で再シード可能。
