-- ============================================================
-- Humano Robotics Inc. デモ用 個人タスクシード
-- 全 16 名 (ゲスト + 15 メンバー) に ka_tasks を投入する
--
-- 構造:
--   weekly_reports (週次レポート、KR紐付け)
--     └─ ka_tasks (個人タスク。assignee=メンバー名)
--
-- 何度実行しても同じ結果になるよう、demo org の既存
-- weekly_reports/ka_tasks を一旦削除して再投入する。
-- (本番組織のデータには影響しない)
-- ============================================================

-- demo 組織 ID 取得用ヘルパ
CREATE OR REPLACE FUNCTION _demo_org_id() RETURNS BIGINT AS $$
  SELECT id FROM organizations WHERE slug = 'demo' LIMIT 1
$$ LANGUAGE SQL STABLE;

-- 1. 既存のデモ用 weekly_reports / ka_tasks を削除 (CASCADE で ka_tasks も消える)
DELETE FROM ka_tasks
  WHERE organization_id = _demo_org_id();
DELETE FROM weekly_reports
  WHERE organization_id = _demo_org_id();

-- 2. 各メンバーの weekly_report と ka_tasks を投入
DO $$
DECLARE
  org BIGINT := _demo_org_id();
  -- 今週の月曜
  wk DATE := (date_trunc('week', CURRENT_DATE))::DATE;
  -- KR ID (実在する KR をタイトルで取得)
  kr_module      BIGINT;  -- 主要関節モジュール 完成数
  kr_uptime      BIGINT;  -- 試作機の稼働時間 連続8時間
  kr_walk        BIGINT;  -- 最大歩行速度 5km/h
  kr_grip        BIGINT;  -- 物体把持成功率 95%
  kr_voice       BIGINT;  -- 音声指示理解率 90%
  kr_sdk         BIGINT;  -- クラウドSDK 導入企業数 30社
  kr_monthly_qty BIGINT;  -- 月産台数 50台
  kr_defect      BIGINT;  -- 不良品率 1%以下
  kr_assy_hours  BIGINT;  -- 組立工数 80時間/台
  kr_new_clients BIGINT;  -- 新規受注社数 30社
  kr_partner     BIGINT;  -- 戦略パートナー契約 5社
  kr_retention   BIGINT;  -- カスタマー継続率 90%
  kr_poc         BIGINT;  -- PoC実施 15件
  kr_unit_price  BIGINT;  -- 製造業向け案件単価 3,000万円
  kr_media       BIGINT;  -- メディア露出件数 30件
  kr_expo        BIGINT;  -- 展示会出展 5件
  kr_sns         BIGINT;  -- 公式SNSフォロワー 50,000人
  kr_revenue     BIGINT;  -- 年間売上 13億円達成
  kr_shipments   BIGINT;  -- 累計出荷台数 1,000台
  rid BIGINT;
BEGIN
  SELECT id INTO kr_module      FROM key_results WHERE organization_id=org AND title='主要関節モジュール 完成数' LIMIT 1;
  SELECT id INTO kr_uptime      FROM key_results WHERE organization_id=org AND title='試作機の稼働時間 連続8時間' LIMIT 1;
  SELECT id INTO kr_walk        FROM key_results WHERE organization_id=org AND title='最大歩行速度 5km/h' LIMIT 1;
  SELECT id INTO kr_grip        FROM key_results WHERE organization_id=org AND title='物体把持成功率 95%' LIMIT 1;
  SELECT id INTO kr_voice       FROM key_results WHERE organization_id=org AND title='音声指示理解率 90%' LIMIT 1;
  SELECT id INTO kr_sdk         FROM key_results WHERE organization_id=org AND title='クラウドSDK 導入企業数 30社' LIMIT 1;
  SELECT id INTO kr_monthly_qty FROM key_results WHERE organization_id=org AND title='月産台数 50台' LIMIT 1;
  SELECT id INTO kr_defect      FROM key_results WHERE organization_id=org AND title='不良品率 1%以下' LIMIT 1;
  SELECT id INTO kr_assy_hours  FROM key_results WHERE organization_id=org AND title='組立工数 80時間/台' LIMIT 1;
  SELECT id INTO kr_new_clients FROM key_results WHERE organization_id=org AND title='新規受注社数 30社' LIMIT 1;
  SELECT id INTO kr_partner     FROM key_results WHERE organization_id=org AND title='戦略パートナー契約 5社' LIMIT 1;
  SELECT id INTO kr_retention   FROM key_results WHERE organization_id=org AND title='カスタマー継続率 90%' LIMIT 1;
  SELECT id INTO kr_poc         FROM key_results WHERE organization_id=org AND title='PoC実施 15件' LIMIT 1;
  SELECT id INTO kr_unit_price  FROM key_results WHERE organization_id=org AND title='製造業向け案件単価 3,000万円' LIMIT 1;
  SELECT id INTO kr_media       FROM key_results WHERE organization_id=org AND title='メディア露出件数 30件' LIMIT 1;
  SELECT id INTO kr_expo        FROM key_results WHERE organization_id=org AND title='展示会出展 5件' LIMIT 1;
  SELECT id INTO kr_sns         FROM key_results WHERE organization_id=org AND title='公式SNSフォロワー 50,000人' LIMIT 1;
  SELECT id INTO kr_revenue     FROM key_results WHERE organization_id=org AND title='年間売上 13億円達成' LIMIT 1;
  SELECT id INTO kr_shipments   FROM key_results WHERE organization_id=org AND title='累計出荷台数 1,000台' LIMIT 1;

  -- ─────────────────────────────────────────────
  -- ゲスト (👀 ゲスト) - 見学者向けの軽いタスク
  -- ─────────────────────────────────────────────
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_module, 'デモ環境を一通り触る', '👀 ゲスト', org)
    RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '🎯 OKRページを開いて Q1 進捗を確認する',          'in_progress', FALSE, '👀 ゲスト', CURRENT_DATE,                     org),
    (rid, '📅 週次MTGページの議題テンプレを確認する',        'not_started', FALSE, '👀 ゲスト', CURRENT_DATE + INTERVAL '1 day',  org),
    (rid, '📊 工数管理ページで部署別の業務負荷を見る',        'not_started', FALSE, '👀 ゲスト', CURRENT_DATE + INTERVAL '2 day',  org),
    (rid, '🤝 確認依頼の流れを試す (確認依頼タブ)',           'not_started', FALSE, '👀 ゲスト', CURRENT_DATE + INTERVAL '3 day',  org),
    (rid, '✅ ホームのカスタムリンク機能で URL を 1 件登録する','done',       TRUE,  '👀 ゲスト', CURRENT_DATE - INTERVAL '1 day',  org);

  -- ─────────────────────────────────────────────
  -- 山田 太郎 (代表取締役)
  -- ─────────────────────────────────────────────
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_revenue, '経営アジェンダ 5月', '山田 太郎', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, 'シリーズB 主要VC 3社との 2nd ミーティング',                 'in_progress', FALSE, '山田 太郎', CURRENT_DATE + INTERVAL '2 day',  org),
    (rid, 'Q1 取締役会資料 最終チェック',                              'not_started', FALSE, '山田 太郎', CURRENT_DATE + INTERVAL '5 day',  org),
    (rid, 'CES2027 出展テーマ 経営方針の決定',                          'not_started', FALSE, '山田 太郎', CURRENT_DATE + INTERVAL '14 day', org),
    (rid, '財務省 産業政策室 表敬訪問の段取り (秘書経由)',              'done',        TRUE,  '山田 太郎', CURRENT_DATE - INTERVAL '3 day',  org);

  -- 鈴木 花子 (COO)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_monthly_qty, 'COO 全社オペ 週次', '鈴木 花子', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '部門責任者 1on1 (今週6名)',                                  'in_progress', FALSE, '鈴木 花子', CURRENT_DATE + INTERVAL '4 day', org),
    (rid, '製造ライン稼働率レポートのレビュー',                         'not_started', FALSE, '鈴木 花子', CURRENT_DATE + INTERVAL '2 day', org),
    (rid, 'Q2 部門間KPI調整 ドラフト',                                  'not_started', FALSE, '鈴木 花子', CURRENT_DATE + INTERVAL '7 day', org),
    (rid, '人事評価制度 v2 経営承認の取付',                             'done',        TRUE,  '鈴木 花子', CURRENT_DATE - INTERVAL '2 day', org);

  -- 中村 葵 (ハードウェア リーダー)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_module, 'H7 試作 #08 量産前最終評価', '中村 葵', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '関節アクチュエータ 試作 #08 評価レポート作成',                'in_progress', FALSE, '中村 葵', CURRENT_DATE + INTERVAL '3 day', org),
    (rid, '減速機 EOL 代替部品 比較表 経営承認用にまとめる',             'in_progress', FALSE, '中村 葵', CURRENT_DATE + INTERVAL '5 day', org),
    (rid, 'BOM v2.4 リリース後の差分レビュー (機構部とMTG)',             'not_started', FALSE, '中村 葵', CURRENT_DATE + INTERVAL '6 day', org),
    (rid, '研究開発部 月例会の議題出し',                                  'not_started', FALSE, '中村 葵', CURRENT_DATE + INTERVAL '8 day', org),
    (rid, '特許出願ドラフト (関節制御方式) 法務レビュー依頼',             'done',        TRUE,  '中村 葵', CURRENT_DATE - INTERVAL '4 day', org);

  -- 小林 龍 (ハードウェア エンジニア)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_uptime, 'バッテリー稼働時間 8時間達成', '小林 龍', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, 'リチウムイオン制御 ファームウェア v3.2 検証',                'in_progress', FALSE, '小林 龍', CURRENT_DATE + INTERVAL '2 day', org),
    (rid, 'カーボンフレーム軽量化 試作品の重量計測',                    'not_started', FALSE, '小林 龍', CURRENT_DATE + INTERVAL '4 day', org),
    (rid, '熱対策シミュレーション結果のまとめ',                          'not_started', FALSE, '小林 龍', CURRENT_DATE + INTERVAL '6 day', org),
    (rid, '部品ベンダーA社へのサンプル発注',                            'done',        TRUE,  '小林 龍', CURRENT_DATE - INTERVAL '2 day', org);

  -- 加藤 さくら (AI/ML エンジニア)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_grip, '把持成功率 95% 達成', '加藤 さくら', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '次世代 LLM 動作計画モデル の社内ベンチ評価',                  'in_progress', FALSE, '加藤 さくら', CURRENT_DATE + INTERVAL '1 day',  org),
    (rid, '把持失敗ログのアノテーション (週500件分)',                    'in_progress', FALSE, '加藤 さくら', CURRENT_DATE + INTERVAL '3 day',  org),
    (rid, '日本語特化STT/TTS 統合の API 仕様レビュー',                   'not_started', FALSE, '加藤 さくら', CURRENT_DATE + INTERVAL '5 day',  org),
    (rid, 'Q3 ロードマップ提案 v0.1',                                    'not_started', FALSE, '加藤 さくら', CURRENT_DATE + INTERVAL '10 day', org),
    (rid, 'GPU クラスタ追加発注の稟議',                                  'done',        TRUE,  '加藤 さくら', CURRENT_DATE - INTERVAL '5 day',  org);

  -- 伊藤 健 (センシング エンジニア)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_voice, 'センシング 屋外検知精度', '伊藤 健', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '屋外フィールド試験 (週末、晴天/雨天 2 ケース)',                'in_progress', FALSE, '伊藤 健', CURRENT_DATE + INTERVAL '4 day', org),
    (rid, '触覚センサー 試作品 #03 の評価',                                'not_started', FALSE, '伊藤 健', CURRENT_DATE + INTERVAL '6 day', org),
    (rid, 'センサーフュージョン アルゴリズム改良',                        'not_started', FALSE, '伊藤 健', CURRENT_DATE + INTERVAL '9 day', org),
    (rid, 'IMU 校正治具 発注完了確認',                                    'done',        TRUE,  '伊藤 健', CURRENT_DATE - INTERVAL '3 day', org);

  -- 吉田 拓海 (製造部 マネージャー)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_defect, '品質検査基準 v1.0 リリース', '吉田 拓海', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '量産フェーズ向け品質チェックリスト v1.0 確定',                 'in_progress', FALSE, '吉田 拓海', CURRENT_DATE + INTERVAL '3 day',  org),
    (rid, 'ライン責任者 (山本) との週次レビュー',                         'in_progress', FALSE, '吉田 拓海', CURRENT_DATE + INTERVAL '2 day',  org),
    (rid, '工場ISO 9001 内部監査の段取り',                                'not_started', FALSE, '吉田 拓海', CURRENT_DATE + INTERVAL '14 day', org),
    (rid, '不良率 月次レポート 4月分まとめ',                              'done',        TRUE,  '吉田 拓海', CURRENT_DATE - INTERVAL '2 day',  org);

  -- 山本 優子 (製造ライン リーダー)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_assy_hours, '組立工数 80時間/台', '山本 優子', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '組立手順書 v3.1 への改定 (関節組立を10分短縮)',                'in_progress', FALSE, '山本 優子', CURRENT_DATE + INTERVAL '2 day', org),
    (rid, '新治具の現場テスト (2ライン分)',                                'not_started', FALSE, '山本 優子', CURRENT_DATE + INTERVAL '5 day', org),
    (rid, 'ライン作業者 5名のスキルマップ更新',                           'not_started', FALSE, '山本 優子', CURRENT_DATE + INTERVAL '7 day', org),
    (rid, '4月不良ログの傾向分析',                                        'done',        TRUE,  '山本 優子', CURRENT_DATE - INTERVAL '4 day', org);

  -- 田中 一郎 (商業部 マネージャー)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_revenue, '受注金額 4億達成', '田中 一郎', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, 'Tier1 製造業A社 PoC 提案書 v2 作成',                           'in_progress', FALSE, '田中 一郎', CURRENT_DATE + INTERVAL '3 day', org),
    (rid, '営業チーム 週次パイプラインレビュー',                          'in_progress', FALSE, '田中 一郎', CURRENT_DATE + INTERVAL '1 day', org),
    (rid, '導入事例ヒアリング 3社分のまとめ',                             'not_started', FALSE, '田中 一郎', CURRENT_DATE + INTERVAL '5 day', org),
    (rid, 'Q2 売上着地見込み 経営報告',                                    'not_started', FALSE, '田中 一郎', CURRENT_DATE + INTERVAL '7 day', org),
    (rid, '顧客B社 訪問報告書',                                            'done',        TRUE,  '田中 一郎', CURRENT_DATE - INTERVAL '1 day', org);

  -- 佐藤 美咲 (法人営業 リーダー)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_poc, 'PoC 案件 15件獲得', '佐藤 美咲', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '製造業 X社 経営層商談 (来週水曜)',                             'in_progress', FALSE, '佐藤 美咲', CURRENT_DATE + INTERVAL '4 day', org),
    (rid, 'PoC 提案資料 テンプレ整備',                                    'in_progress', FALSE, '佐藤 美咲', CURRENT_DATE + INTERVAL '2 day', org),
    (rid, '5月の展示会 商談アポ 8件確保',                                  'not_started', FALSE, '佐藤 美咲', CURRENT_DATE + INTERVAL '6 day', org),
    (rid, 'Y社 NDA 締結 法務レビュー依頼',                                'done',        TRUE,  '佐藤 美咲', CURRENT_DATE - INTERVAL '2 day', org);

  -- 渡辺 翔太 (パートナーシップ)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_partner, 'SI企業アライアンス 5社', '渡辺 翔太', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, 'SI企業 候補3社との初回MTG設定',                                'in_progress', FALSE, '渡辺 翔太', CURRENT_DATE + INTERVAL '3 day', org),
    (rid, 'クラウドSDK 外販プラン v0.3 ドラフト',                          'in_progress', FALSE, '渡辺 翔太', CURRENT_DATE + INTERVAL '5 day', org),
    (rid, 'パートナー契約 共通テンプレ 法務確認',                          'not_started', FALSE, '渡辺 翔太', CURRENT_DATE + INTERVAL '7 day', org),
    (rid, '既存パートナー4社への定期レポート送付',                        'done',        TRUE,  '渡辺 翔太', CURRENT_DATE - INTERVAL '2 day', org);

  -- 高橋 由美 (広報・マーケ マネージャー)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_media, 'メディア露出 30件達成', '高橋 由美', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '日経クロステック 取材対応 (CTO 同席)',                          'in_progress', FALSE, '高橋 由美', CURRENT_DATE + INTERVAL '2 day', org),
    (rid, 'CES2026 出展ブース 設計レビュー',                                'in_progress', FALSE, '高橋 由美', CURRENT_DATE + INTERVAL '6 day', org),
    (rid, '主要メディア20社 訪問計画 (5月分)',                              'not_started', FALSE, '高橋 由美', CURRENT_DATE + INTERVAL '8 day', org),
    (rid, '4月プレスリリース 効果測定レポート',                             'done',        TRUE,  '高橋 由美', CURRENT_DATE - INTERVAL '3 day', org);

  -- 斎藤 隼人 (事業企画)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_revenue, 'シリーズB 30億調達', '斎藤 隼人', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, 'シリーズB 投資家向け事業計画 v3.2 仕上げ',                      'in_progress', FALSE, '斎藤 隼人', CURRENT_DATE + INTERVAL '4 day',  org),
    (rid, '海外進出 (北米) シナリオ分析',                                  'not_started', FALSE, '斎藤 隼人', CURRENT_DATE + INTERVAL '10 day', org),
    (rid, '競合分析レポート v2 (Tesla / Figure / 国産)',                  'not_started', FALSE, '斎藤 隼人', CURRENT_DATE + INTERVAL '7 day',  org),
    (rid, '4月マンスリーレビュー資料',                                     'done',        TRUE,  '斎藤 隼人', CURRENT_DATE - INTERVAL '5 day',  org);

  -- 松本 千夏 (管理部 / コンテンツ)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_sns, '公式SNSフォロワー 50,000人', '松本 千夏', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, 'YouTube 公式 5月分動画台本 4本確定',                             'in_progress', FALSE, '松本 千夏', CURRENT_DATE + INTERVAL '3 day', org),
    (rid, '企業ブランドサイト 多言語版 翻訳発注',                           'in_progress', FALSE, '松本 千夏', CURRENT_DATE + INTERVAL '5 day', org),
    (rid, '採用イベント 物販ノベルティ手配',                                'not_started', FALSE, '松本 千夏', CURRENT_DATE + INTERVAL '7 day', org),
    (rid, 'X (旧Twitter) 月次運用レポート',                                 'done',        TRUE,  '松本 千夏', CURRENT_DATE - INTERVAL '2 day', org);

  -- 森 大樹 (カスタマーサクセス)
  INSERT INTO weekly_reports (week_start, kr_id, ka_title, owner, organization_id)
    VALUES (wk, kr_retention, 'カスタマー継続率 90% 維持', '森 大樹', org) RETURNING id INTO rid;
  INSERT INTO ka_tasks (report_id, title, status, done, assignee, due_date, organization_id) VALUES
    (rid, '導入企業A社 オンボーディング (現地3日間)',                      'in_progress', FALSE, '森 大樹', CURRENT_DATE + INTERVAL '4 day', org),
    (rid, '故障対応SLA ナレッジベース整備 (FAQ 30件)',                     'in_progress', FALSE, '森 大樹', CURRENT_DATE + INTERVAL '6 day', org),
    (rid, '24h コールセンター業者選定 (3社比較)',                          'not_started', FALSE, '森 大樹', CURRENT_DATE + INTERVAL '8 day', org),
    (rid, '4月 顧客満足度アンケート 集計',                                  'done',        TRUE,  '森 大樹', CURRENT_DATE - INTERVAL '3 day', org);
END $$;

-- 後片付け
DROP FUNCTION IF EXISTS _demo_org_id;

-- 確認
SELECT 'weekly_reports' AS tbl, count(*) AS cnt FROM weekly_reports
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
UNION ALL
SELECT 'ka_tasks (total)', count(*) FROM ka_tasks
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
UNION ALL
SELECT 'ka_tasks (done)', count(*) FROM ka_tasks
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo') AND done = TRUE
UNION ALL
SELECT 'ka_tasks (open)', count(*) FROM ka_tasks
  WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo') AND done = FALSE;

-- 期待: weekly_reports=16, ka_tasks=68 (done=16, open=52)

-- 各メンバーごとのタスク数確認
SELECT assignee, count(*) AS tasks
FROM ka_tasks
WHERE organization_id = (SELECT id FROM organizations WHERE slug='demo')
GROUP BY assignee
ORDER BY assignee;
