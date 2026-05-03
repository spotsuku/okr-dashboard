-- ════════════════════════════════════════════════════════════════════════════
-- Humano Robotics Inc. デモシード (国産ヒューマノイド企業想定)
-- 既存の demo データを置き換え or 新規投入
-- staging Supabase で実行
-- ════════════════════════════════════════════════════════════════════════════
--
-- Phase 1, 2 が実行済みであることを前提とする。
-- 既存の demo 組織がある場合は完全に削除して再シードする。
-- ════════════════════════════════════════════════════════════════════════════

-- 0. 既存の demo 組織を全削除 (CASCADE で全テーブルから消える)
DELETE FROM organizations WHERE slug='demo';

-- 1. Humano Robotics 組織を作成
INSERT INTO organizations (slug, name, plan, fiscal_year_default)
VALUES ('demo', 'Humano Robotics Inc.', 'demo', '2026');

CREATE OR REPLACE FUNCTION _demo_org_id() RETURNS BIGINT AS $$
  SELECT id FROM organizations WHERE slug='demo'
$$ LANGUAGE sql STABLE;

-- 2. ダミーメンバー (15名 + ゲスト)
INSERT INTO members (name, role, email, is_admin, organization_id) VALUES
  ('👀 ゲスト',      '見学者 (デモ用)',                    'guest@demo.local',     FALSE, _demo_org_id()),
  ('山田 太郎',      '代表取締役',                          'yamada@example.demo',  TRUE,  _demo_org_id()),
  ('鈴木 花子',      '副社長 兼 COO',                       'suzuki@example.demo',  TRUE,  _demo_org_id()),
  ('中村 葵',        '研究開発部 ハードウェア リーダー',     'nakamura@example.demo',FALSE, _demo_org_id()),
  ('小林 龍',        'ハードウェア エンジニア',             'kobayashi@example.demo',FALSE,_demo_org_id()),
  ('加藤 さくら',    'AI/ML エンジニア',                    'kato@example.demo',    FALSE, _demo_org_id()),
  ('伊藤 健',        'センシング エンジニア',                'ito@example.demo',     FALSE, _demo_org_id()),
  ('吉田 拓海',      '製造部 マネージャー',                  'yoshida@example.demo', FALSE, _demo_org_id()),
  ('山本 優子',      '製造ライン リーダー',                  'yamamoto@example.demo',FALSE, _demo_org_id()),
  ('田中 一郎',      '商業部 マネージャー',                  'tanaka@example.demo',  FALSE, _demo_org_id()),
  ('佐藤 美咲',      '法人営業 リーダー',                    'sato@example.demo',    FALSE, _demo_org_id()),
  ('渡辺 翔太',      'パートナーシップ',                     'watanabe@example.demo',FALSE, _demo_org_id()),
  ('高橋 由美',      '広報・マーケティング マネージャー',    'takahashi@example.demo',FALSE,_demo_org_id()),
  ('斎藤 隼人',      '事業企画',                             'saito@example.demo',   FALSE, _demo_org_id()),
  ('松本 千夏',      '管理部',                               'matsumoto@example.demo',FALSE,_demo_org_id()),
  ('森 大樹',        'カスタマーサクセス',                    'mori@example.demo',    FALSE, _demo_org_id());

-- organization_members
INSERT INTO organization_members (organization_id, member_id, role, is_default)
SELECT _demo_org_id(), m.id,
  CASE WHEN m.is_admin THEN 'admin' ELSE 'member' END,
  TRUE
FROM members m
WHERE m.organization_id = _demo_org_id();

-- 3. 組織階層
INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id)
VALUES ('Humano Robotics Inc.', '🤖', '#5856d6', NULL, '2026', _demo_org_id());

DO $$
DECLARE
  root_id_text TEXT;
  org BIGINT := _demo_org_id();
  rd_dept_text TEXT;
  mfg_dept_text TEXT;
  com_dept_text TEXT;
  pr_dept_text TEXT;
BEGIN
  SELECT id::TEXT INTO root_id_text FROM levels WHERE name='Humano Robotics Inc.' AND organization_id=org LIMIT 1;
  IF root_id_text IS NULL THEN RETURN; END IF;

  -- 4部署
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id) VALUES
    ('研究開発部',          '🔬', '#a855f7', root_id_text::BIGINT, '2026', org),
    ('製造部',              '🏭', '#10b981', root_id_text::BIGINT, '2026', org),
    ('商業部',              '💼', '#FF9500', root_id_text::BIGINT, '2026', org),
    ('広報・マーケティング部', '📢', '#ec4899', root_id_text::BIGINT, '2026', org);

  SELECT id::TEXT INTO rd_dept_text  FROM levels WHERE name='研究開発部' AND organization_id=org;
  SELECT id::TEXT INTO mfg_dept_text FROM levels WHERE name='製造部' AND organization_id=org;
  SELECT id::TEXT INTO com_dept_text FROM levels WHERE name='商業部' AND organization_id=org;
  SELECT id::TEXT INTO pr_dept_text  FROM levels WHERE name='広報・マーケティング部' AND organization_id=org;

  -- 各チーム
  INSERT INTO levels (name, icon, color, parent_id, fiscal_year, organization_id) VALUES
    -- 研究開発配下
    ('ハードウェア', '⚙️', '#7e22ce', rd_dept_text::BIGINT, '2026', org),
    ('AI/ソフトウェア', '🧠', '#06b6d4', rd_dept_text::BIGINT, '2026', org),
    ('センシング', '📡', '#5856d6', rd_dept_text::BIGINT, '2026', org),
    -- 製造配下
    ('組立ライン', '🔧', '#10b981', mfg_dept_text::BIGINT, '2026', org),
    ('品質保証', '✅', '#0ea5e9', mfg_dept_text::BIGINT, '2026', org),
    -- 商業配下
    ('法人営業', '🤝', '#ff6b6b', com_dept_text::BIGINT, '2026', org),
    ('パートナーシップ', '🌐', '#ffd166', com_dept_text::BIGINT, '2026', org),
    ('カスタマーサクセス', '💚', '#34d399', com_dept_text::BIGINT, '2026', org),
    -- 広報・マーケ配下
    ('PR', '📰', '#ec4899', pr_dept_text::BIGINT, '2026', org),
    ('コンテンツ', '📝', '#f97316', pr_dept_text::BIGINT, '2026', org);
END $$;

-- 4. メンバー所属チーム割当
DO $$
DECLARE org BIGINT := _demo_org_id();
BEGIN
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='Humano Robotics Inc.' AND organization_id=org)
    WHERE email IN ('yamada@example.demo','suzuki@example.demo','guest@demo.local') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='ハードウェア' AND organization_id=org)
    WHERE email IN ('nakamura@example.demo','kobayashi@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='AI/ソフトウェア' AND organization_id=org)
    WHERE email='kato@example.demo' AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='センシング' AND organization_id=org)
    WHERE email='ito@example.demo' AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='組立ライン' AND organization_id=org)
    WHERE email IN ('yoshida@example.demo','yamamoto@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='法人営業' AND organization_id=org)
    WHERE email IN ('tanaka@example.demo','sato@example.demo') AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='パートナーシップ' AND organization_id=org)
    WHERE email='watanabe@example.demo' AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='カスタマーサクセス' AND organization_id=org)
    WHERE email='mori@example.demo' AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='PR' AND organization_id=org)
    WHERE email='takahashi@example.demo' AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='事業企画部' AND organization_id=org)
    WHERE email='saito@example.demo' AND organization_id=org;
  UPDATE members SET level_id = (SELECT id FROM levels WHERE name='コンテンツ' AND organization_id=org)
    WHERE email='matsumoto@example.demo' AND organization_id=org;
END $$;

-- 5. チーム責任者 (manager_id)
DO $$
DECLARE org BIGINT := _demo_org_id();
BEGIN
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='nakamura@example.demo' AND organization_id=org)
    WHERE name='研究開発部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='nakamura@example.demo' AND organization_id=org)
    WHERE name='ハードウェア' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='kato@example.demo' AND organization_id=org)
    WHERE name='AI/ソフトウェア' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='ito@example.demo' AND organization_id=org)
    WHERE name='センシング' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='yoshida@example.demo' AND organization_id=org)
    WHERE name='製造部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='yamamoto@example.demo' AND organization_id=org)
    WHERE name='組立ライン' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='tanaka@example.demo' AND organization_id=org)
    WHERE name='商業部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='sato@example.demo' AND organization_id=org)
    WHERE name='法人営業' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='watanabe@example.demo' AND organization_id=org)
    WHERE name='パートナーシップ' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='mori@example.demo' AND organization_id=org)
    WHERE name='カスタマーサクセス' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='takahashi@example.demo' AND organization_id=org)
    WHERE name='広報・マーケティング部' AND organization_id=org;
  UPDATE levels SET manager_id = (SELECT id FROM members WHERE email='takahashi@example.demo' AND organization_id=org)
    WHERE name='PR' AND organization_id=org;
END $$;

-- 6. OKR (Objectives + KR) — 国産ヒューマノイド事業
DO $$
DECLARE
  org BIGINT := _demo_org_id();
  rd_id BIGINT;       hw_id BIGINT;     ai_id BIGINT;     mfg_id BIGINT;
  com_id BIGINT;      sales_id BIGINT;  pr_id BIGINT;
  obj_id BIGINT;
BEGIN
  SELECT id INTO rd_id    FROM levels WHERE name='研究開発部' AND organization_id=org;
  SELECT id INTO hw_id    FROM levels WHERE name='ハードウェア' AND organization_id=org;
  SELECT id INTO ai_id    FROM levels WHERE name='AI/ソフトウェア' AND organization_id=org;
  SELECT id INTO mfg_id   FROM levels WHERE name='製造部' AND organization_id=org;
  SELECT id INTO com_id   FROM levels WHERE name='商業部' AND organization_id=org;
  SELECT id INTO sales_id FROM levels WHERE name='法人営業' AND organization_id=org;
  SELECT id INTO pr_id    FROM levels WHERE name='広報・マーケティング部' AND organization_id=org;

  -- 全社 (rootに紐付ける)
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES ((SELECT id FROM levels WHERE name='Humano Robotics Inc.' AND organization_id=org),
            'annual', 'どうすれば国産ヒューマノイドのリーディングカンパニーとして世界に飛躍できるか', '山田 太郎', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '年間売上 13億円達成',           1300, 540, '百万円', '田中 一郎', org),
    (obj_id, '累計出荷台数 1,000台',          1000, 320, '台',     '吉田 拓海', org),
    (obj_id, '主要メディア露出 50件',           50,  18, '件',     '高橋 由美', org);

  -- 研究開発部
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (rd_id, 'q1', '次世代ヒューマノイド「HR-2」の試作完成度を高めるには', '中村 葵', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '主要関節モジュール 完成数',          12,   7, '個',  '中村 葵',     org),
    (obj_id, '自社開発部品比率 70%',                70,  52, '%',   '小林 龍',     org),
    (obj_id, '試作機の稼働時間 連続8時間',           8, 4.5, '時間','加藤 さくら', org);

  -- ハードウェアチーム
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (hw_id, 'q1', 'どうすれば歩行性能を世界水準にできるか', '中村 葵', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '最大歩行速度 5km/h',                  5, 3.2, 'km/h','中村 葵', org),
    (obj_id, '段差走破性能 30cm',                  30,  18, 'cm',  '小林 龍', org),
    (obj_id, '転倒復帰時間 10秒以内',              10,  22, '秒',  '小林 龍', org);

  -- AI/ソフトウェアチーム
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (ai_id, 'q1', '行動制御AIの精度を業界トップに', '加藤 さくら', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '物体把持成功率 95%',                  95,  82, '%',   '加藤 さくら', org),
    (obj_id, '音声指示理解率 90%',                  90,  76, '%',   '加藤 さくら', org),
    (obj_id, 'クラウドSDK 導入企業数 30社',         30,  12, '社',  '渡辺 翔太',   org);

  -- 製造部
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (mfg_id, 'q1', '量産体制を構築し品質を安定化させるには', '吉田 拓海', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '月産台数 50台',                        50,  28, '台',   '吉田 拓海', org),
    (obj_id, '不良品率 1%以下',                       1, 2.3, '%',    '山本 優子', org),
    (obj_id, '組立工数 80時間/台',                   80, 110, '時間', '山本 優子', org);

  -- 商業部
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (com_id, 'q1', '法人顧客100社にHR-1を導入してもらうには', '田中 一郎', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, '新規受注社数 30社',                    30,  11, '社',   '佐藤 美咲',   org),
    (obj_id, '商談化率 35%',                         35,  24, '%',    '佐藤 美咲',   org),
    (obj_id, '戦略パートナー契約 5社',                5,   2, '社',   '渡辺 翔太',   org),
    (obj_id, 'カスタマー継続率 90%',                 90,  85, '%',    '森 大樹',     org);

  -- 法人営業
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (sales_id, 'q1', '製造業へのヒューマノイド導入を加速させるには', '佐藤 美咲', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, 'PoC実施 15件',                         15,   6, '件',   '佐藤 美咲', org),
    (obj_id, '製造業向け案件単価 3,000万円',       3000,2100, '万円', '田中 一郎', org);

  -- 広報・マーケ
  INSERT INTO objectives (level_id, period, title, owner, organization_id)
    VALUES (pr_id, 'q1', 'どうすれば「国産ヒューマノイド=Humano」のブランドを確立できるか', '高橋 由美', org)
    RETURNING id INTO obj_id;
  INSERT INTO key_results (objective_id, title, target, current, unit, owner, organization_id) VALUES
    (obj_id, 'メディア露出件数 30件',                30,  14, '件',   '高橋 由美',  org),
    (obj_id, '展示会出展 5件',                        5,   2, '件',   '高橋 由美',  org),
    (obj_id, '公式SNSフォロワー 50,000人',        50000,18000,'人',   '松本 千夏',  org);
END $$;

-- 7. 業務一覧 (org_tasks)
DO $$
DECLARE
  org BIGINT := _demo_org_id();
  hw_id BIGINT;     ai_id BIGINT;     sens_id BIGINT;
  mfg_assy_id BIGINT;  qa_id BIGINT;
  sales_id BIGINT;  partner_id BIGINT;  cs_id BIGINT;
  pr_id BIGINT;     content_id BIGINT;
BEGIN
  SELECT id INTO hw_id       FROM levels WHERE name='ハードウェア' AND organization_id=org;
  SELECT id INTO ai_id       FROM levels WHERE name='AI/ソフトウェア' AND organization_id=org;
  SELECT id INTO sens_id     FROM levels WHERE name='センシング' AND organization_id=org;
  SELECT id INTO mfg_assy_id FROM levels WHERE name='組立ライン' AND organization_id=org;
  SELECT id INTO qa_id       FROM levels WHERE name='品質保証' AND organization_id=org;
  SELECT id INTO sales_id    FROM levels WHERE name='法人営業' AND organization_id=org;
  SELECT id INTO partner_id  FROM levels WHERE name='パートナーシップ' AND organization_id=org;
  SELECT id INTO cs_id       FROM levels WHERE name='カスタマーサクセス' AND organization_id=org;
  SELECT id INTO pr_id       FROM levels WHERE name='PR' AND organization_id=org;
  SELECT id INTO content_id  FROM levels WHERE name='コンテンツ' AND organization_id=org;

  INSERT INTO org_tasks (level_id, title, description, owner, organization_id) VALUES
    (hw_id,       '関節アクチュエータ設計',       '次世代モーター制御回路の設計と試作', '中村 葵',     org),
    (hw_id,       'バッテリーモジュール最適化', '稼働時間延長のためのリチウムイオン制御', '小林 龍',     org),
    (hw_id,       'フレーム軽量化検証',           'カーボン素材導入の試作と評価',         '小林 龍',     org),
    (ai_id,       '行動制御アルゴリズム改良',     '把持・歩行精度向上のためのモデル更新', '加藤 さくら', org),
    (ai_id,       '音声認識エンジン統合',         '日本語特化のSTT/TTS統合と精度測定',    '加藤 さくら', org),
    (sens_id,     'LiDAR感度向上',                '屋外環境での障害物検知精度改善',        '伊藤 健',     org),
    (sens_id,     '触覚センサー試作',             '指先の触覚フィードバック実装',          '伊藤 健',     org),
    (mfg_assy_id, '量産ラインの組立手順書整備', '新HR-2機の量産ライン用手順書作成',      '山本 優子',   org),
    (mfg_assy_id, '組立治具の改善',               '関節組立の所要時間短縮',                '山本 優子',   org),
    (qa_id,       '品質検査基準の策定',           '量産フェーズ向け品質チェックリスト',    '吉田 拓海',   org),
    (sales_id,    '製造業向けPoC営業',            '自動車・電機メーカー10社へのPoC提案',   '佐藤 美咲',   org),
    (sales_id,    '導入事例ヒアリング',           '既存導入企業からの事例収集',            '佐藤 美咲',   org),
    (partner_id,  'SI企業とのアライアンス',       '導入支援パートナー5社獲得',             '渡辺 翔太',   org),
    (partner_id,  'クラウドSDK外販',              '法人開発者向けSDK販売開始',             '渡辺 翔太',   org),
    (cs_id,       '導入後オンボーディング',       '新規導入企業への運用トレーニング',      '森 大樹',     org),
    (cs_id,       '故障対応SLA構築',              '24時間以内の現地対応体制',              '森 大樹',     org),
    (pr_id,       'CES2026 出展準備',             '海外展示会での新型機公開',              '高橋 由美',   org),
    (pr_id,       'メディアキャラバン',           '主要メディア20社訪問',                  '高橋 由美',   org),
    (content_id,  '企業ブランドサイト刷新',       'グローバル展開対応の多言語版',          '松本 千夏',   org),
    (content_id,  'YouTube公式チャンネル運用',    '月4本の技術解説動画リリース',           '松本 千夏',   org);
END $$;

-- 後片付け
DROP FUNCTION IF EXISTS _demo_org_id;

-- 確認
SELECT 'organizations' AS tbl, count(*) FROM organizations WHERE slug='demo'
UNION ALL SELECT 'members',     count(*) FROM members      WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo')
UNION ALL SELECT 'org_members', count(*) FROM organization_members WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo')
UNION ALL SELECT 'levels',      count(*) FROM levels       WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo')
UNION ALL SELECT 'objectives',  count(*) FROM objectives   WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo')
UNION ALL SELECT 'key_results', count(*) FROM key_results  WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo')
UNION ALL SELECT 'org_tasks',   count(*) FROM org_tasks    WHERE organization_id=(SELECT id FROM organizations WHERE slug='demo');
-- 期待: 1, 16, 16, 15, 8, 26, 20
