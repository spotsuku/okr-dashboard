-- ============================================================
-- Humano Robotics Inc. デモ用 組織タブ データシード
--   1. 業務一覧 (org_tasks)         — 既存に加えて idempotent に再投入
--   2. メンバーJD (org_member_jd)   — 16 名分
--   3. 業務マニュアル                — 主要 4 チーム分
--      ・org_manual_phases (フェーズ)
--      ・org_manual_steps  (各フェーズのステップ)
--      ・org_manual_mindsets (心構え)
--      ・org_manual_meta   (役割・スタンス)
--
-- 何度実行しても同じ結果になるよう、demo org の既存データを
-- 一旦削除して再投入する (本番組織には影響しない)。
-- ============================================================

-- demo 組織 ID 取得用ヘルパ
CREATE OR REPLACE FUNCTION _demo_org_id() RETURNS BIGINT AS $$
  SELECT id FROM organizations WHERE slug = 'demo' LIMIT 1
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- Part 0: テーブル存在確認 (org_manual_* は別環境で未作成の可能性)
--   既存テーブルがあれば IF NOT EXISTS で何もしない
-- ============================================================
CREATE TABLE IF NOT EXISTS org_task_manuals (
  id          BIGSERIAL PRIMARY KEY,
  task_id     BIGINT NOT NULL,
  title       TEXT DEFAULT '',
  content     TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  sort_order  INT DEFAULT 0,
  updated_by  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_manual_meta (
  id          BIGSERIAL PRIMARY KEY,
  level_id    BIGINT UNIQUE,
  role        TEXT DEFAULT '',
  stance      JSONB DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_manual_phases (
  id          BIGSERIAL PRIMARY KEY,
  level_id    BIGINT NOT NULL,
  sort_order  INT DEFAULT 0,
  badge       TEXT DEFAULT '',
  badge_class TEXT DEFAULT 'operate',
  title       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_manual_steps (
  id          BIGSERIAL PRIMARY KEY,
  phase_id    BIGINT NOT NULL REFERENCES org_manual_phases(id) ON DELETE CASCADE,
  sort_order  INT DEFAULT 0,
  title       TEXT DEFAULT '',
  owner       TEXT DEFAULT '',
  tool        TEXT DEFAULT '',
  urls        JSONB DEFAULT '[]'::jsonb,
  condition   TEXT DEFAULT '',
  caution     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_manual_mindsets (
  id          BIGSERIAL PRIMARY KEY,
  level_id    BIGINT NOT NULL,
  sort_order  INT DEFAULT 0,
  content     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_manual_concept_steps (
  id          BIGSERIAL PRIMARY KEY,
  level_id    BIGINT NOT NULL,
  sort_order  INT DEFAULT 0,
  content     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- organization_id を全テーブルに付与 (既にあればスキップ)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'org_task_manuals','org_manual_meta','org_manual_phases',
    'org_manual_steps','org_manual_mindsets','org_manual_concept_steps'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organization_id)', tbl || '_org_idx', tbl);
  END LOOP;
END $$;

-- ============================================================
-- Part 1: 業務一覧 (org_tasks) を再投入
--   既存の supabase_demo_humano_robotics.sql と同じ 20 行を冪等に保証
-- ============================================================
DELETE FROM org_tasks WHERE organization_id = _demo_org_id();

DO $$
DECLARE
  org BIGINT := _demo_org_id();
  hw_id BIGINT;     ai_id BIGINT;     sens_id BIGINT;
  mfg_assy_id BIGINT;  qa_id BIGINT;
  sales_id BIGINT;  partner_id BIGINT;  cs_id BIGINT;
  pr_id BIGINT;     content_id BIGINT;
BEGIN
  SELECT id INTO hw_id       FROM levels WHERE name='ハードウェア'      AND organization_id=org;
  SELECT id INTO ai_id       FROM levels WHERE name='AI/ソフトウェア'   AND organization_id=org;
  SELECT id INTO sens_id     FROM levels WHERE name='センシング'        AND organization_id=org;
  SELECT id INTO mfg_assy_id FROM levels WHERE name='組立ライン'        AND organization_id=org;
  SELECT id INTO qa_id       FROM levels WHERE name='品質保証'          AND organization_id=org;
  SELECT id INTO sales_id    FROM levels WHERE name='法人営業'          AND organization_id=org;
  SELECT id INTO partner_id  FROM levels WHERE name='パートナーシップ'  AND organization_id=org;
  SELECT id INTO cs_id       FROM levels WHERE name='カスタマーサクセス' AND organization_id=org;
  SELECT id INTO pr_id       FROM levels WHERE name='PR'                AND organization_id=org;
  SELECT id INTO content_id  FROM levels WHERE name='コンテンツ'         AND organization_id=org;

  INSERT INTO org_tasks (dept, team, task, owner, level_id, organization_id) VALUES
    ('研究開発部',           'ハードウェア',       '関節アクチュエータ設計 / 次世代モーター制御回路の設計と試作',     '中村 葵',     hw_id, org),
    ('研究開発部',           'ハードウェア',       'バッテリーモジュール最適化 / 稼働時間延長のためのリチウムイオン制御', '小林 龍',  hw_id, org),
    ('研究開発部',           'ハードウェア',       'フレーム軽量化検証 / カーボン素材導入の試作と評価',                '小林 龍',     hw_id, org),
    ('研究開発部',           'AI/ソフトウェア',    '行動制御アルゴリズム改良 / 把持・歩行精度向上のためのモデル更新',  '加藤 さくら', ai_id, org),
    ('研究開発部',           'AI/ソフトウェア',    '音声認識エンジン統合 / 日本語特化のSTT/TTS統合と精度測定',         '加藤 さくら', ai_id, org),
    ('研究開発部',           'センシング',         'LiDAR感度向上 / 屋外環境での障害物検知精度改善',                    '伊藤 健',     sens_id, org),
    ('研究開発部',           'センシング',         '触覚センサー試作 / 指先の触覚フィードバック実装',                   '伊藤 健',     sens_id, org),
    ('製造部',               '組立ライン',         '量産ラインの組立手順書整備 / 新HR-2機の量産ライン用手順書作成',     '山本 優子',   mfg_assy_id, org),
    ('製造部',               '組立ライン',         '組立治具の改善 / 関節組立の所要時間短縮',                            '山本 優子',   mfg_assy_id, org),
    ('製造部',               '品質保証',           '品質検査基準の策定 / 量産フェーズ向け品質チェックリスト',           '吉田 拓海',   qa_id, org),
    ('商業部',               '法人営業',           '製造業向けPoC営業 / 自動車・電機メーカー10社へのPoC提案',           '佐藤 美咲',   sales_id, org),
    ('商業部',               '法人営業',           '導入事例ヒアリング / 既存導入企業からの事例収集',                    '佐藤 美咲',   sales_id, org),
    ('商業部',               'パートナーシップ',   'SI企業とのアライアンス / 導入支援パートナー5社獲得',                 '渡辺 翔太',   partner_id, org),
    ('商業部',               'パートナーシップ',   'クラウドSDK外販 / 法人開発者向けSDK販売開始',                        '渡辺 翔太',   partner_id, org),
    ('商業部',               'カスタマーサクセス', '導入後オンボーディング / 新規導入企業への運用トレーニング',         '森 大樹',     cs_id, org),
    ('商業部',               'カスタマーサクセス', '故障対応SLA構築 / 24時間以内の現地対応体制',                         '森 大樹',     cs_id, org),
    ('広報・マーケティング部', 'PR',                'CES2026 出展準備 / 海外展示会での新型機公開',                        '高橋 由美',   pr_id, org),
    ('広報・マーケティング部', 'PR',                'メディアキャラバン / 主要メディア20社訪問',                         '高橋 由美',   pr_id, org),
    ('広報・マーケティング部', 'コンテンツ',         '企業ブランドサイト刷新 / グローバル展開対応の多言語版',             '松本 千夏',   content_id, org),
    ('広報・マーケティング部', 'コンテンツ',         'YouTube公式チャンネル運用 / 月4本の技術解説動画リリース',           '松本 千夏',   content_id, org);
END $$;

-- ============================================================
-- Part 2: メンバーJD (org_member_jd) — 16 名分
--   member_id は名前文字列をそのまま使う (アプリ仕様に従う)
-- ============================================================
DELETE FROM org_member_jd
  WHERE member_id IN (
    '👀 ゲスト','山田 太郎','鈴木 花子','中村 葵','小林 龍','加藤 さくら','伊藤 健',
    '吉田 拓海','山本 優子','田中 一郎','佐藤 美咲','渡辺 翔太','高橋 由美',
    '斎藤 隼人','松本 千夏','森 大樹'
  );

INSERT INTO org_member_jd (member_id, version_idx, period, role, emp, working, role_desc, responsibility, meetings, tasks, organization_id) VALUES

('👀 ゲスト', 0, '2026年5月 〜 (デモ)', '見学者ロール (デモ用)', '見学', '随時',
 'デモ環境の見学者として、Humano Robotics の業務管理ツールを一通り体験する',
 '・デモ各タブを見て学ぶ\n・気付きをフィードバック',
 '特になし',
 '[{"cat":"見学","task":"OKR/週次MTG/組織/朝会の各タブを見る","status":"same"},{"cat":"見学","task":"カスタムリンク機能を試す","status":"same"}]',
 _demo_org_id()),

('山田 太郎', 0, '2024年4月 〜 現在', '代表取締役 CEO', '正社員', '週5 (常駐)',
 'Humano Robotics の経営全般を統括し、ビジョン「日本発・世界トップクラスのヒューマノイドメーカー」を実現する',
 '・全社業績の最終責任 (売上・損益)\n・調達 (シリーズB 30億円) の主導\n・取締役会の議長',
 '・取締役会 (月次)\n・経営会議 (週次)\n・全社朝会 (毎日)',
 '[{"cat":"資金調達","task":"シリーズB 主要VCとの定期MTG","status":"same"},{"cat":"経営","task":"四半期事業計画レビュー","status":"same"},{"cat":"対外","task":"省庁・自治体との関係構築","status":"same"}]',
 _demo_org_id()),

('鈴木 花子', 0, '2024年7月 〜 現在', '副社長 兼 COO', '正社員', '週5',
 '全社オペレーションを統括。研究開発・製造・商業・広報の各部門のKPI達成を支援',
 '・部門間KPI調整\n・人事評価制度の運用責任\n・全社オペ品質',
 '・部門責任者 1on1 (週次)\n・部門間調整会議 (隔週)\n・経営会議 (週次)',
 '[{"cat":"オペ","task":"部門別KPI 月次レビュー","status":"same"},{"cat":"人事","task":"評価制度 v2 運用","status":"same"},{"cat":"組織","task":"Q2 部門間KPI調整","status":"new"}]',
 _demo_org_id()),

('中村 葵', 0, '2024年4月 〜 現在', '研究開発部 ハードウェアリーダー', '正社員', '週5',
 '関節アクチュエータ・フレーム等のハードウェア設計を統括し、量産可能な完成度に到達させる',
 '・H7 試作機の機構設計責任\n・部品BOMの最終承認\n・サプライチェーン (機構部品) の関係維持',
 '・研究開発部 月例会\n・機構レビュー (週次)\n・部品ベンダー定例 (月次)',
 '[{"cat":"設計","task":"関節アクチュエータ #08 評価","status":"same"},{"cat":"調達","task":"減速機 EOL 代替部品の選定","status":"new"},{"cat":"知財","task":"関節制御方式の特許出願","status":"same"}]',
 _demo_org_id()),

('小林 龍', 0, '2024年9月 〜 現在', 'ハードウェアエンジニア', '正社員', '週5',
 'バッテリー制御とフレーム軽量化を担当。試作機の稼働時間延長と重量削減を実現する',
 '・リチウムイオン制御FW\n・カーボンフレーム評価\n・試作品の実機検証',
 '・機構レビュー (週次)\n・部品調達MTG (隔週)',
 '[{"cat":"開発","task":"電源FW v3.2 検証","status":"same"},{"cat":"評価","task":"カーボンフレーム重量計測","status":"same"}]',
 _demo_org_id()),

('加藤 さくら', 0, '2024年10月 〜 現在', 'AI/ML エンジニア', '正社員', '週5',
 '行動制御アルゴリズム・音声認識エンジンの開発を主導。ヒューマノイドの「賢さ」を実装する',
 '・把持・歩行アルゴリズムの精度向上\n・LLM 動作計画モデルの社内ベンチ運用',
 '・AI週次定例\n・研究開発部 月例会',
 '[{"cat":"開発","task":"次世代 LLM 動作計画モデル評価","status":"same"},{"cat":"データ","task":"把持失敗ログのアノテーション","status":"same"},{"cat":"統合","task":"日本語STT/TTS API 統合","status":"new"}]',
 _demo_org_id()),

('伊藤 健', 0, '2025年2月 〜 現在', 'センシングエンジニア', '正社員', '週5',
 'LiDAR・触覚センサーの精度向上と屋外運用への適用を担当',
 '・センサーフュージョン アルゴリズム\n・屋外フィールド試験',
 '・センシング週次定例',
 '[{"cat":"試験","task":"屋外フィールド試験 (晴天/雨天)","status":"same"},{"cat":"開発","task":"触覚センサー試作 #03 評価","status":"same"}]',
 _demo_org_id()),

('吉田 拓海', 0, '2024年6月 〜 現在', '製造部 マネージャー', '正社員', '週5',
 '量産工場のマネジメント。月産50台、不良率1%以下を達成する',
 '・量産ラインの稼働率責任\n・品質保証基準の運用\n・ISO9001 準拠',
 '・製造部 週次MTG\n・ライン責任者 1on1\n・品質月例レビュー',
 '[{"cat":"品質","task":"検査基準 v1.0 確定","status":"same"},{"cat":"監査","task":"ISO9001 内部監査","status":"new"},{"cat":"報告","task":"4月不良率レポート","status":"same"}]',
 _demo_org_id()),

('山本 優子', 0, '2024年8月 〜 現在', '製造ライン リーダー', '正社員', '週5 (現場常駐)',
 '組立ラインの現場責任者。組立工数80時間/台への短縮を主導',
 '・組立手順書の整備\n・ライン作業者のスキルマップ管理\n・治具改善',
 '・現場朝礼 (毎日)\n・製造部 週次MTG',
 '[{"cat":"改善","task":"手順書 v3.1 改定","status":"same"},{"cat":"治具","task":"新治具の現場テスト","status":"new"},{"cat":"育成","task":"作業者スキルマップ更新","status":"same"}]',
 _demo_org_id()),

('田中 一郎', 0, '2024年5月 〜 現在', '商業部 マネージャー', '正社員', '週5',
 '営業・パートナーシップ・カスタマーサクセスを統括。年間売上13億円を達成する',
 '・売上 P&L 責任\n・営業戦略の策定\n・主要顧客との関係維持',
 '・商業部 週次MTG\n・パイプラインレビュー (週次)\n・顧客訪問 (月10件以上)',
 '[{"cat":"営業","task":"Tier1製造業A社 PoC 提案","status":"same"},{"cat":"管理","task":"営業パイプライン週次レビュー","status":"same"},{"cat":"報告","task":"Q2 売上着地見込み","status":"new"}]',
 _demo_org_id()),

('佐藤 美咲', 0, '2024年9月 〜 現在', '法人営業 リーダー', '正社員', '週5',
 '製造業向けPoC営業の最前線。新規受注社数30社・PoC実施15件を達成する',
 '・新規顧客の開拓\n・PoC 提案資料の整備\n・展示会での商談獲得',
 '・営業週次MTG\n・パイプラインレビュー',
 '[{"cat":"商談","task":"製造業X社 経営層商談","status":"same"},{"cat":"資料","task":"PoC 提案テンプレ整備","status":"same"},{"cat":"展示会","task":"5月の展示会 商談アポ獲得","status":"new"}]',
 _demo_org_id()),

('渡辺 翔太', 0, '2025年1月 〜 現在', 'パートナーシップ担当', '正社員', '週5',
 'SI企業とのアライアンスを構築し、戦略パートナー契約 5社を獲得する',
 '・SI企業候補のリストアップと開拓\n・クラウドSDK 外販プラン策定\n・パートナー契約交渉',
 '・パートナー定例 (月次)\n・営業週次MTG',
 '[{"cat":"開拓","task":"SI企業候補3社との初回MTG","status":"same"},{"cat":"プラン","task":"SDK 外販プラン v0.3","status":"new"},{"cat":"運用","task":"既存4社への定期レポート","status":"same"}]',
 _demo_org_id()),

('高橋 由美', 0, '2024年7月 〜 現在', '広報・マーケティング マネージャー', '正社員', '週5',
 '「国産ヒューマノイド = Humano」のブランド確立を主導',
 '・メディア露出 30件 / 四半期\n・展示会出展\n・プレスリリース',
 '・広報週次MTG\n・取材対応 (随時)',
 '[{"cat":"取材","task":"日経クロステック 取材対応","status":"same"},{"cat":"展示会","task":"CES2026 出展ブース設計","status":"same"},{"cat":"報告","task":"4月効果測定レポート","status":"same"}]',
 _demo_org_id()),

('斎藤 隼人', 0, '2024年11月 〜 現在', '事業企画', '正社員', '週5',
 '中長期事業戦略・資金調達・競合分析を担当。経営に対する戦略提言を行う',
 '・事業計画ドキュメントの維持\n・競合 (Tesla/Figure等) の分析\n・シリーズB 資料作成',
 '・経営会議 (週次)\n・投資家向けMTG (随時)',
 '[{"cat":"資金調達","task":"シリーズB 事業計画 v3.2","status":"same"},{"cat":"分析","task":"競合分析レポート v2","status":"new"},{"cat":"報告","task":"4月マンスリーレビュー","status":"same"}]',
 _demo_org_id()),

('松本 千夏', 0, '2025年3月 〜 現在', '管理部 (コンテンツ担当)', '正社員', '週5',
 'コーポレートサイト・SNS・YouTube運用を担当',
 '・公式SNSフォロワー 50,000人達成\n・YouTube公式チャンネル運用',
 '・広報週次MTG',
 '[{"cat":"動画","task":"YouTube 5月分動画 4本","status":"same"},{"cat":"サイト","task":"多言語版 翻訳発注","status":"new"},{"cat":"運用","task":"X 月次運用レポート","status":"same"}]',
 _demo_org_id()),

('森 大樹', 0, '2025年4月 〜 現在', 'カスタマーサクセス担当', '正社員', '週5',
 '導入企業のオンボーディングと運用支援。継続率90%を維持する',
 '・現地オンボーディング\n・故障対応SLA (24時間以内) 構築\n・FAQナレッジ整備',
 '・CS週次MTG\n・顧客との定期レビュー (月次)',
 '[{"cat":"導入","task":"A社オンボーディング (現地3日)","status":"same"},{"cat":"ナレッジ","task":"FAQ 30件整備","status":"new"},{"cat":"調達","task":"24h コールセンター業者選定","status":"same"}]',
 _demo_org_id());

-- ============================================================
-- Part 3: 業務マニュアル
--   主要 4 チーム (ハードウェア / 法人営業 / 組立ライン / カスタマーサクセス) について
--   フェーズ + ステップ + 心構え + 役割 を投入
-- ============================================================
-- 既存マニュアルの削除 (demo org の levels に紐づくもの全て)
DELETE FROM org_manual_steps WHERE phase_id IN (
  SELECT p.id FROM org_manual_phases p
  JOIN levels l ON l.id = p.level_id
  WHERE l.organization_id = _demo_org_id()
);
DELETE FROM org_manual_phases WHERE level_id IN (
  SELECT id FROM levels WHERE organization_id = _demo_org_id()
);
DELETE FROM org_manual_mindsets WHERE level_id IN (
  SELECT id FROM levels WHERE organization_id = _demo_org_id()
);
DELETE FROM org_manual_meta WHERE level_id IN (
  SELECT id FROM levels WHERE organization_id = _demo_org_id()
);

DO $$
DECLARE
  org BIGINT := _demo_org_id();
  hw_id BIGINT;  sales_id BIGINT;  assy_id BIGINT;  cs_id BIGINT;
  ph_id BIGINT;
BEGIN
  SELECT id INTO hw_id    FROM levels WHERE name='ハードウェア'      AND organization_id=org;
  SELECT id INTO sales_id FROM levels WHERE name='法人営業'          AND organization_id=org;
  SELECT id INTO assy_id  FROM levels WHERE name='組立ライン'        AND organization_id=org;
  SELECT id INTO cs_id    FROM levels WHERE name='カスタマーサクセス' AND organization_id=org;

  ----------------------------------------------------------
  -- ハードウェアチーム
  ----------------------------------------------------------
  INSERT INTO org_manual_meta (level_id, role, stance, organization_id) VALUES
    (hw_id, '次世代ヒューマノイドの機構設計を担い、量産可能な完成度に到達させる',
     '["数値で語る (推測ではなく実測)","部品の量産性を初期から意識","壊して学ぶ。試作費用はケチらない"]'::jsonb, org);

  INSERT INTO org_manual_mindsets (level_id, sort_order, content, organization_id) VALUES
    (hw_id, 0, 'ヒトに似せることが目的ではなく、現場で使えることが目的', org),
    (hw_id, 1, '部品調達リードタイムを常に意識する。EOL に備えて代替品を持つ', org),
    (hw_id, 2, 'CAD のバージョン管理は厳格に。BOM とのズレが量産事故に繋がる', org);

  -- フェーズ1: 構想・要件定義
  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (hw_id, 0, '構想', 'plan', '機構要件の定義と試作計画', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '機構要件の整理 (動作範囲・耐荷重・可動角)', '中村 葵', 'Notion / Excel', '[]'::jsonb,
     '営業からの仕様要望が確定済み', '量産性 (組立工数) を最初から織り込む', org),
    (ph_id, 1, '試作スケジュールの策定', '中村 葵', 'Asana', '[]'::jsonb,
     '部品納期の見積もりが完了', '部品納期に2週間のバッファを必ず確保', org);

  -- フェーズ2: 設計・試作
  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (hw_id, 1, '試作', 'operate', '3D設計と試作部品発注', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '関節モジュールの3D CAD 設計', '中村 葵', 'Fusion360', '[]'::jsonb,
     '要件定義が完了', '隣接部品との干渉チェックを必ず3視点で', org),
    (ph_id, 1, 'BOMリスト作成・部品ベンダー発注', '小林 龍', 'Excel + 発注システム', '[]'::jsonb,
     'CAD完成', '減速機など EOL リスクのある部品は代替品 1 件以上を併発注', org),
    (ph_id, 2, '試作品の実機組立 (社内ラボ)', '小林 龍', '工作室', '[]'::jsonb,
     '部品納入完了', '組立ログを Notion に残す (後の量産手順書の元になる)', org);

  -- フェーズ3: 評価・改善
  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (hw_id, 2, '評価', 'review', '実機評価とフィードバック反映', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '機構性能の実機計測 (トルク・耐久・可動角)', '中村 葵', '計測機 + Excel', '[]'::jsonb,
     '試作組立完了', '計測条件は再現可能な形でログ化', org),
    (ph_id, 1, '評価レポート作成と次バージョンへの設計修正', '中村 葵', 'Notion', '[]'::jsonb,
     '実機計測完了', 'AI/SW チームへの仕様変更影響を必ず通知', org);

  ----------------------------------------------------------
  -- 法人営業チーム
  ----------------------------------------------------------
  INSERT INTO org_manual_meta (level_id, role, stance, organization_id) VALUES
    (sales_id, '製造業向けに H シリーズの新規導入を獲得し、年間売上目標を達成する',
     '["顧客の現場課題を聞く (技術自慢にしない)","PoC で価値を示し、本契約に繋げる","契約後はCSに丁寧に引き継ぐ"]'::jsonb, org);

  INSERT INTO org_manual_mindsets (level_id, sort_order, content, organization_id) VALUES
    (sales_id, 0, 'デモは「動くこと」より「業務に組み込めること」を見せる', org),
    (sales_id, 1, '価格交渉の前に必ず「価値の合意」をとる', org),
    (sales_id, 2, '失注理由は必ず文章で記録し、月次で全員にシェア', org);

  -- フェーズ1: リード獲得
  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (sales_id, 0, 'リード', 'plan', 'リード獲得とアプローチ', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, 'ターゲット企業リストの作成 (Tier1製造業 100社)', '佐藤 美咲', 'Salesforce / Spreadsheet', '[]'::jsonb,
     '営業戦略が確定', '同業他社との競合状況を必ず確認', org),
    (ph_id, 1, '初回コンタクト (メール → 電話)', '佐藤 美咲', 'Gmail / 電話', '[]'::jsonb,
     'リスト作成完了', '広報の資料リリースタイミングと連動させる', org);

  -- フェーズ2: 商談 / PoC
  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (sales_id, 1, '商談', 'operate', '商談 → PoC 提案', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '初回ヒアリング (現場課題の把握)', '佐藤 美咲', 'Zoom / 現地訪問', '[]'::jsonb,
     '初回コンタクト成功', '現場担当者と決裁者の両方にヒアリング', org),
    (ph_id, 1, 'PoC 提案書 v1 作成 (技術部レビュー込み)', '佐藤 美咲', 'Google Slides', '[]'::jsonb,
     'ヒアリング完了', '提案価格は CFO 承認を経てから提示', org),
    (ph_id, 2, 'PoC 実施 (現地3日 + 社内分析)', '佐藤 美咲 / CS', '実機', '[]'::jsonb,
     'PoC契約締結', 'PoC期間中の故障対応は CS と分担', org);

  -- フェーズ3: 契約・引き継ぎ
  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (sales_id, 2, '契約', 'review', '本契約 → CS引き継ぎ', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '本契約の交渉と契約書ドラフト', '佐藤 美咲 / 法務', 'Word / 法務システム', '[]'::jsonb,
     'PoC完了 + 顧客満足', '契約条項の SLA は CS とすり合わせ済みであること', org),
    (ph_id, 1, 'CSチームへの引き継ぎMTG (現場/技術仕様)', '佐藤 美咲', 'Notion 引き継ぎテンプレ', '[]'::jsonb,
     '本契約締結', '顧客のキーパーソン全員を CS に紹介する', org);

  ----------------------------------------------------------
  -- 組立ラインチーム
  ----------------------------------------------------------
  INSERT INTO org_manual_meta (level_id, role, stance, organization_id) VALUES
    (assy_id, '量産ラインの安定稼働と工数削減を担う',
     '["手順書の通りに作る (現場アレンジ禁止)","異常があれば即ライン停止","KAIZEN は手順書経由でしか反映しない"]'::jsonb, org);

  INSERT INTO org_manual_mindsets (level_id, sort_order, content, organization_id) VALUES
    (assy_id, 0, '時間を計測する。改善の根拠は感覚ではなく秒単位のデータ', org),
    (assy_id, 1, '不良ゼロより「不良が起きてもすぐ気付ける」体制を', org);

  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (assy_id, 0, '準備', 'plan', '日次の準備と部品ピッキング', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '当日生産計画の確認', '山本 優子', 'WMS', '[]'::jsonb, '前日終業', 'シフト人員の充足を必ずチェック', org),
    (ph_id, 1, '部品ピッキングと治具セットアップ', '組立担当', '台車・治具', '[]'::jsonb, '生産計画OK', 'ロット番号の控えを忘れずに', org);

  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (assy_id, 1, '組立', 'operate', '組立工程 (関節 → 胴体 → 通電試験)', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '関節モジュール組立 (12箇所)', '組立担当', 'トルクドライバ + 治具', '[]'::jsonb, 'ピッキング完了', '締付トルクは校正済み工具で', org),
    (ph_id, 1, '胴体・四肢組立', '組立担当', '組立架台', '[]'::jsonb, '関節組立完了', '配線の取り回しは手順書通りに', org),
    (ph_id, 2, '通電試験 (電源ON → 自己診断)', '組立担当', '試験用PC', '[]'::jsonb, '組立完了', '異常コード発生時は即ライン停止', org);

  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (assy_id, 2, '出荷', 'review', '出荷検査と梱包', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '出荷検査 (32項目チェックリスト)', '吉田 拓海', 'チェックシート', '[]'::jsonb, '通電試験OK', '1項目でも NG なら出荷見送り', org),
    (ph_id, 1, '梱包・出荷ラベル発行', '出荷担当', '梱包資材', '[]'::jsonb, '検査合格', 'シリアル番号を必ず控える (CS引き継ぎ用)', org);

  ----------------------------------------------------------
  -- カスタマーサクセスチーム
  ----------------------------------------------------------
  INSERT INTO org_manual_meta (level_id, role, stance, organization_id) VALUES
    (cs_id, '導入企業がHシリーズを「現場の戦力」として使い続けられる状態を維持する',
     '["故障は事前予測 (予防保守)","顧客の現場担当に密着","営業と密に連携してアップセル機会を発掘"]'::jsonb, org);

  INSERT INTO org_manual_mindsets (level_id, sort_order, content, organization_id) VALUES
    (cs_id, 0, '導入後3ヶ月の活用度がその後の継続率を決める', org),
    (cs_id, 1, '故障 = 失注リスク。SLA 24h を死守する', org);

  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (cs_id, 0, '導入', 'plan', 'オンボーディング (導入後30日)', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '営業からの引き継ぎMTG', '森 大樹', 'Notion', '[]'::jsonb, '本契約締結', '顧客のキーパーソンを全員把握', org),
    (ph_id, 1, '現地オンボーディング (3日)', '森 大樹', '実機 + 操作マニュアル', '[]'::jsonb, '機材搬入完了', '現場作業者全員に研修を実施', org),
    (ph_id, 2, '稼働状況のモニタリング (30日)', '森 大樹', '稼働ログDB', '[]'::jsonb, '稼働開始', '異常パターンが出れば即現地訪問', org);

  INSERT INTO org_manual_phases (level_id, sort_order, badge, badge_class, title, organization_id)
    VALUES (cs_id, 1, '運用', 'operate', '定期運用支援 (導入30日〜)', org) RETURNING id INTO ph_id;
  INSERT INTO org_manual_steps (phase_id, sort_order, title, owner, tool, urls, condition, caution, organization_id) VALUES
    (ph_id, 0, '月次サクセスレビュー', '森 大樹', 'Zoom + ダッシュボード', '[]'::jsonb, 'オンボーディング完了', '稼働率と業務改善KPIをセットで報告', org),
    (ph_id, 1, '故障対応 (SLA 24h)', '森 大樹 / 24hコールセンター', 'チケットシステム', '[]'::jsonb, '通報受信', '重大故障は山田/鈴木への即報告', org);
END $$;

-- 後片付け
DROP FUNCTION IF EXISTS _demo_org_id;

-- ============================================================
-- 確認
-- ============================================================
SELECT 'org_tasks'         AS tbl, count(*) AS cnt FROM org_tasks
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
UNION ALL
SELECT 'org_member_jd', count(*) FROM org_member_jd
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
UNION ALL
SELECT 'org_manual_meta', count(*) FROM org_manual_meta
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
UNION ALL
SELECT 'org_manual_phases', count(*) FROM org_manual_phases
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
UNION ALL
SELECT 'org_manual_steps', count(*) FROM org_manual_steps
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
UNION ALL
SELECT 'org_manual_mindsets', count(*) FROM org_manual_mindsets
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo');

-- 期待: org_tasks=20, org_member_jd=16, org_manual_meta=4,
--       org_manual_phases=11, org_manual_steps=26, org_manual_mindsets=10
