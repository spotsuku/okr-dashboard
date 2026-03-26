'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ══════════════════════════════════════════════════
// デフォルトデータ（Supabaseが空の場合のフォールバック）
// ══════════════════════════════════════════════════
const MEMBERS_RAW = [
  { id:'加藤翼', name:'加藤翼', dept:'コミュニティ事業部', team:'コミュニティ統括', avatar_color:['#1a56db','#ddeeff'],
    versions:[
      { period:'2024年11月', role:'シニアディレクター (SOCIO事業責任者)', emp:'業務委託', working:'週2日',
        role_desc:'SOCIOの可能性を常に探求し新しい付加価値をチームや企業、地域に創出する\nSOCIOを通じて地域価値を高めるスポーツチームを世界中に創出する\nSOCIOの収益向上と持続可能性を追求する',
        responsibility:'SOCIO事業の実行責任\nSOCIO事業の業務内容の決定\nSOCIO事業の人材配置',
        meetings:'・NEO全体定例（週1回）\n・NEO地域定例（週1回）\n・地域運営メンバーとの個別MTG（都度）',
        tasks:[
          {cat:'SOCIO事業', task:'SOCIOのコミュニティの基本設計と改善', status:'same'},
          {cat:'SOCIO事業', task:'SOCIOサービス内容の設計と改善', status:'same'},
          {cat:'SOCIO事業', task:'事業部の組織体制と業務内容の設計', status:'same'},
          {cat:'SOCIO事業', task:'SOCIO事業部のスタッフのアサインとマネジメント', status:'same'},
          {cat:'SOCIO事業', task:'新規採用候補の捜索', status:'same'},
          {cat:'SOCIO事業', task:'事業部のコスト管理', status:'same'},
        ]},
      { period:'2024年12月 〜2025年5月', role:'コミュニティ事業責任者', emp:'業務委託', working:'週2日',
        role_desc:'NEO福岡の１年間の運営を統括する\nNEOが福岡+2拠点（大阪・神奈川）合計３拠点でコミュニティ運営できる仕組みを構築する\nNEOを通じてコミュニティマネージャーの地位向上や雇用創出を促進する',
        responsibility:'コミュニティ事業部の成果責任\nコミュニティ事業部の業務実行責任（NSAの運営責任・応援カイギ運営責任）\nコミュニティ事業部の人材のマネジメント',
        meetings:'・NEO立上げ本部定例（毎週土日いずれか90分）\n・コミュニティ事業定例（毎週木曜13:30〜14:30）\n・応援カイギ定例（各地域週1回）\n・月次事業戦略会議（月末土日 180分）',
        tasks:[
          {cat:'SOCIO事業', task:'事業部の組織体制と業務内容の設計', status:'same'},
          {cat:'SOCIO事業', task:'事業部のコスト管理', status:'same'},
          {cat:'コミュニティ', task:'NEOのコミュニティの基本設計と改善', status:'new'},
          {cat:'コミュニティ', task:'NEOコミュニティのツール設計と運用', status:'new'},
          {cat:'プログラム', task:'NEOのプログラム内容の企画「応援カイギ」「NSA」など', status:'new'},
          {cat:'プログラム', task:'NEOのプログラムの運営方法の設計（PM計画書・WBSの作成）', status:'new'},
          {cat:'組織', task:'プロジェクトマネージャーのマネジメント', status:'new'},
          {cat:'組織', task:'コミュニティマネージャーのマネジメント', status:'new'},
        ]},
      { period:'2025年6月 〜現在', role:'コミュニティ事業責任者', emp:'業務委託', working:'週2日',
        role_desc:'NEO福岡の１年間の運営を統括する\nNEOが福岡+2拠点（大阪・神奈川）合計３拠点でコミュニティ運営できる仕組みを構築する\nNEOを通じてコミュニティマネージャーの地位向上や雇用創出を促進する\nNEOを通じて地域スポーツチームの新しい地方創生のあり方を構築する',
        responsibility:'コミュニティ事業部の成果責任\nコミュニティ事業部の業務実行責任（NEOアカデミア・応援カイギ運営責任）\nコミュニティ事業部の人材のマネジメント\n事業部のコスト管理',
        meetings:'・NEO立上げ本部定例（毎週土曜 9:00〜10:30）\n・コミュニティ事業定例（毎週水曜13:00〜14:00）\n・プログラム定例（毎週水曜15:00〜16:00）\n・チェックイン定例（毎週月曜朝 9:15〜9:45）\n・経営会議\n・月次事業戦略会議（月末土日 180分）',
        tasks:[
          {cat:'SOCIO事業', task:'事業部の組織体制と業務内容の設計', status:'same'},
          {cat:'SOCIO事業', task:'事業部のコスト管理', status:'same'},
          {cat:'コミュニティ', task:'NEOのコミュニティの基本設計と改善', status:'same'},
          {cat:'コミュニティ', task:'NEOコミュニティのツール設計と運用', status:'same'},
          {cat:'プログラム', task:'NEOのプログラム内容の企画「応援カイギ」「NEOアカデミア」など', status:'new'},
          {cat:'プログラム', task:'NEOのプログラムの運営方法の設計（PM計画書・WBSの作成）', status:'same'},
          {cat:'プログラム', task:'アワードの企画設計・PM計画書', status:'new'},
          {cat:'プログラム', task:'シティフェスの企画設計・PM計画書', status:'new'},
          {cat:'組織', task:'プロジェクトマネージャーのマネジメント', status:'same'},
          {cat:'組織', task:'コミュニティマネージャーのマネジメント', status:'same'},
        ]},
    ]},
  { id:'森朝香', name:'森朝香', dept:'コミュニティ事業部', team:'コミュニティ（教育）', avatar_color:['#059669','#d1fae5'],
    versions:[
      { period:'2025年3月 〜4月', role:'若手社会人集客リーダー', emp:'業務委託', working:'週5（逐次）',
        role_desc:'NEO福岡のアカデミア1期生の社会人集客企画\nNEO福岡のアカデミア1期生の社会人集客の実行\nNEO福岡のアカデミア1期生の説明会や面談の対応',
        responsibility:'NEO福岡のアカデミア1期生の社会人集客・応募着地責任（目標15名）',
        meetings:'・NEO地域定例（週1回）\n・若者集客チームの会議での報告\n・地域運営メンバーとの個別MTG（都度）',
        tasks:[
          {cat:'コミュニティ運営', task:'見込み会員とのコミュニケーション業務（立ち上げ準備含む）', status:'same'},
          {cat:'コミュニティ運営', task:'入会退会手続き業務', status:'same'},
          {cat:'コミュニティ運営', task:'会員エンゲージメント業務', status:'same'},
          {cat:'コミュニティ運営', task:'コミュニティイベントの集客', status:'same'},
          {cat:'集客PR', task:'集客PRのためのコンテンツディレクション', status:'same'},
          {cat:'集客PR', task:'応募フォーム管理', status:'same'},
        ]},
      { period:'2025年5月 〜6月', role:'コミュニティマネージャー (教育担当)', emp:'業務委託', working:'週5（常時）',
        role_desc:'NEOアカデミア受講生オンボーディング業務\n年間プログラムの受講生サポート（副担任）\nNEOアカデミア プログラムの企画・運用サポート（カリキュラム開発）',
        responsibility:'NEO福岡のアカデミア1期生のオンボーディング\n受講生に対するイベントの開催（都度MTGで判断）',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週1回）\n・チェックイン 朝15分\n・地域運営メンバーとの個別MTG（都度）',
        tasks:[
          {cat:'オンボーディング', task:'ユース会員候補とのコミュニケーション業務', status:'new'},
          {cat:'コミュニティ運営', task:'会員エンゲージメント業務', status:'same'},
          {cat:'コミュニティ運営', task:'コミュニティイベントの集客', status:'same'},
          {cat:'コミュニティ運営', task:'コミュニケーションプラットフォームの対応業務', status:'new'},
          {cat:'イベント運営', task:'現地イベント行事作成運営・イベント運営実務準備', status:'new'},
          {cat:'イベント運営', task:'ロジ作成・司会台本作成・会場手配・会場レイアウト', status:'new'},
          {cat:'集客PR', task:'集客PRのためのコンテンツディレクション', status:'del'},
        ]},
      { period:'2025年7月 〜現在', role:'コミュニティマネージャー (教育責任者)', emp:'業務委託', working:'週5（常時）',
        role_desc:'コミュニティチーム実行責任者（教育責任者業務含む）\n年間プログラムの受講生の受講状況の管理',
        responsibility:'NEO福岡のアカデミア1期生の受講マネジメント（楽しい学級を創る）\nアカデミア生からヒーローを創出する\n受講生に対するイベントの開催（都度MTGで判断）',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン\n・地域運営メンバーとの個別MTG（都度）',
        tasks:[
          {cat:'コミュニティ運営', task:'アカデミア生のカルテ情報の設計・最新アップデート', status:'new'},
          {cat:'コミュニティ運営', task:'ヒーローを目指すアカデミア生へのコーチング・KA', status:'new'},
          {cat:'コミュニティ運営', task:'入会退会手続き業務・入会オリエンテーション', status:'same'},
          {cat:'コミュニティ運営', task:'会員エンゲージメント業務', status:'same'},
          {cat:'コミュニティ運営', task:'コミュニティイベントの集客', status:'same'},
          {cat:'コミュニティ運営', task:'Playful研修の企画・開発・営業・運営', status:'new'},
          {cat:'イベント運営', task:'現地イベント行事作成運営・イベント運営実務準備', status:'same'},
        ]},
    ]},
  { id:'面川文香', name:'面川文香', dept:'コミュニティ事業部', team:'企業伴走 兼 総務', avatar_color:['#be185d','#fce7f3'],
    versions:[
      { period:'2025年6月 〜7月', role:'コミュニティマネージャー (教育担当兼総務)', emp:'業務委託', working:'週5',
        role_desc:'コミュニティ（教育）チームの教育担当兼総務\nアカデミア受講生への対応・総務業務を兼任',
        responsibility:'教育チーム実務の一部担当\n総務・事務局業務の実行',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン',
        tasks:[
          {cat:'コミュニティ運営', task:'コミュニティイベントの集客', status:'same'},
          {cat:'コミュニティ運営', task:'コミュニケーションプラットフォームの対応業務', status:'same'},
          {cat:'総務', task:'総務（事務作業・HP更新・郵送物管理・問い合わせ対応・経理連携）', status:'same'},
        ]},
      { period:'2025年7月 （正社員移行）', role:'コミュニティマネージャー (教育担当兼総務)', emp:'正社員', working:'週5',
        role_desc:'正社員として教育担当兼総務業務を継続\nアカデミア生への対応・企業会員コミュニケーション',
        responsibility:'教育チーム実務担当\n総務・事務局業務の実行責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン',
        tasks:[
          {cat:'コミュニティ運営', task:'コミュニティイベントの集客', status:'same'},
          {cat:'企業伴走', task:'会員企業への適切な量・質・頻度でのコミュニケーション', status:'new'},
          {cat:'企業伴走', task:'会員企業との面談の同行・メール・チャット対応', status:'new'},
          {cat:'総務', task:'総務（事務作業・HP更新・郵送物管理・問い合わせ対応・経理連携）', status:'same'},
          {cat:'広報', task:'会員企業インタビュー同席・記事執筆・web掲載', status:'new'},
        ]},
      { period:'2026年2月 〜現在', role:'企業伴走 兼 総務', emp:'正社員', working:'週5',
        role_desc:'企業伴走チームとして企業会員への密なコミュニケーション支援\n総務・事務局業務の中心担当',
        responsibility:'企業会員のNEO活用促進\n総務・事務局業務の実行責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン\n・企業個別MTG（随時）',
        tasks:[
          {cat:'企業伴走', task:'会員企業への適切な量・質・頻度でのコミュニケーション', status:'same'},
          {cat:'企業伴走', task:'会員企業との面談の同行・メール・チャット対応', status:'same'},
          {cat:'企業伴走', task:'会員企業インタビュー同席・記事執筆・web掲載', status:'same'},
          {cat:'企業伴走', task:'企業広報確認業務（素材集め・プレビュー作成・確認依頼）', status:'new'},
          {cat:'総務', task:'総務（事務作業・HP更新・郵送物管理・問い合わせ対応・経理連携）', status:'same'},
          {cat:'広報', task:'HPの更新業務', status:'new'},
        ]},
    ]},
  { id:'古野絢太', name:'古野絢太', dept:'コミュニティ事業部', team:'企業伴走 兼 事務局長補佐', avatar_color:['#0891b2','#cffafe'],
    versions:[
      { period:'2025年8月 〜2025年12月', role:'事務局インターン', emp:'業務委託', working:'週3〜4日',
        role_desc:'事務局業務のサポート・インターンとしての実務学習',
        responsibility:'事務局業務補助\n各種手続きサポート',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例',
        tasks:[
          {cat:'事務局', task:'各種手続き・書類管理のサポート', status:'same'},
          {cat:'事務局', task:'会員向け連絡・通知業務のサポート', status:'same'},
          {cat:'イベント運営', task:'イベント当日スタッフ業務', status:'same'},
          {cat:'データ管理', task:'会員情報・データ入力・管理', status:'same'},
        ]},
      { period:'2026年1月 〜3月', role:'企業伴走 兼 事務局長補佐', emp:'業務委託', working:'週3〜4日',
        role_desc:'企業会員への伴走支援・事務局長補佐として全体PM補助',
        responsibility:'担当企業会員のフォローアップ\n事務局長補佐業務',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例\n・毎朝チェックイン',
        tasks:[
          {cat:'企業伴走', task:'企業カルテの情報管理・企業公開情報のリサーチ・アップデート', status:'new'},
          {cat:'企業伴走', task:'会員企業との面談の同行・メール・チャット対応', status:'new'},
          {cat:'事務局補佐', task:'事務局長補佐（全体PM・資料作成・会議フィードバック）', status:'new'},
          {cat:'事務局補佐', task:'NEOアカデミアのPMシート更新・管理サポート', status:'new'},
          {cat:'事務局', task:'各種手続き・書類管理のサポート', status:'del'},
        ]},
      { period:'2026年4月 〜現在', role:'企業伴走 兼 事務局長補佐', emp:'業務委託', working:'週3〜4日',
        role_desc:'企業会員への密な伴走支援\n事務局長補佐として組織全体の業務管理補助',
        responsibility:'担当企業会員のサクセス支援\n事務局長補佐業務の実行',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例\n・毎朝チェックイン\n・企業個別MTG（随時）',
        tasks:[
          {cat:'企業伴走', task:'企業カルテの情報管理・企業公開情報のリサーチ・アップデート', status:'same'},
          {cat:'企業伴走', task:'会員企業との面談の同行・メール・チャット対応', status:'same'},
          {cat:'CS支援', task:'会員企業のサクセスロードマップ企画・実行・改善（補助）', status:'new'},
          {cat:'CS支援', task:'企業選抜生プロジェクトの組成支援・伴走・助言（補助）', status:'new'},
          {cat:'事務局補佐', task:'事務局長補佐（全体PM・資料作成・会議フィードバック）', status:'same'},
          {cat:'事務局補佐', task:'NEOアカデミアのPMシート更新・管理サポート', status:'same'},
        ]},
    ]},
  { id:'鬼木良輔', name:'鬼木良輔', dept:'コミュニティ事業部', team:'カスタマーサクセス', avatar_color:['#b45309','#fef3c7'],
    versions:[
      { period:'2025年10月 〜現在', role:'カスタマーサクセスチーム マネージャー', emp:'業務委託', working:'週2〜3日',
        role_desc:'NEO福岡のカスタマーサクセスチームのマネジメント\n会員企業のサクセスロードマップ設計・実行\nNEO合同AI研修・Playful研修の企画・運営',
        responsibility:'CSチームの成果責任（会員企業のサクセス・継続率）\n研修サービスの品質・売上責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・CS定例（週1〜2回）\n・毎朝チェックイン\n・担当企業との個別MTG（月1〜2回）',
        tasks:[
          {cat:'CS戦略', task:'会員企業のサクセスロードマップ企画・実行・改善', status:'same'},
          {cat:'CS戦略', task:'週次進捗ミーティングの運営・面談資料作成・フィードバック共有', status:'same'},
          {cat:'CS戦略', task:'課題抽出および改善提案の実行', status:'same'},
          {cat:'研修', task:'NEO合同AI研修の企画・運営・改善', status:'same'},
          {cat:'研修', task:'企業向け研修提案資料の作成・商談・プレゼン対応', status:'same'},
          {cat:'研修', task:'研修後の効果測定・改善提案サイクル構築', status:'same'},
          {cat:'プロジェクト', task:'企業選抜生プロジェクトの組成支援・伴走・助言', status:'same'},
        ]},
    ]},
  { id:'増田雄太朗', name:'増田雄太朗', dept:'経営企画部', team:'マーケティング', avatar_color:['#7c3aed','#ede9fe'],
    versions:[
      { period:'2025年8月 〜10月', role:'マーケティングマネージャー', emp:'業務委託', working:'週3〜4日',
        role_desc:'NEO福岡のマーケティング戦略の立案・実行\nユース向け集客・認知拡大\nデジタルマーケティング全般のディレクション',
        responsibility:'NEO福岡への新規会員獲得目標の達成\nマーケティング施策の品質・KPI責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・マーケ定例（週1回）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'マーケ戦略', task:'年間・四半期ごとのマーケティング計画（KPI設計・チャネル戦略）策定', status:'same'},
          {cat:'コンテンツ', task:'Instagram運用ディレクション（方針・素材・配信・分析）', status:'same'},
          {cat:'コンテンツ', task:'LP企画・LP制作（文章・デザイナー連携）', status:'same'},
          {cat:'コンテンツ', task:'LINE運用ディレクション（方針・素材・配信・分析）', status:'same'},
          {cat:'コンテンツ', task:'NEO公式サイト・note・SNS等のコンテンツ更新・効果分析', status:'same'},
          {cat:'集客', task:'各イベントの集客戦略・広告運用（SNS広告・パートナー連携）', status:'same'},
        ]},
      { period:'2025年11月 〜12月', role:'マーケティングマネージャー （フルタイム移行）', emp:'業務委託→正社員', working:'週5',
        role_desc:'フルタイム移行によりマーケティング全般をより深く担当\nNEOシティフェス・NEOアワードの告知クリエイティブ設計',
        responsibility:'マーケティング全般の実行責任（フルタイム）\n集客・認知拡大のKPI達成',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・マーケ定例（週1〜2回）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'マーケ戦略', task:'年間・四半期ごとのマーケティング計画（KPI設計・チャネル戦略）策定', status:'same'},
          {cat:'コンテンツ', task:'Instagram運用ディレクション（方針・素材・配信・分析）', status:'same'},
          {cat:'コンテンツ', task:'LINE運用ディレクション（方針・素材・配信・分析）', status:'same'},
          {cat:'集客', task:'NEOシティフェス・NEOアワードの告知クリエイティブ設計', status:'new'},
          {cat:'集客', task:'会員企業とのコラボキャンペーン企画・運営', status:'new'},
          {cat:'集客', task:'成果指標（リーチ数・集客数・反響率など）のレポーティング', status:'new'},
          {cat:'マネジメント', task:'マーケチームメンバーの進捗・品質管理', status:'new'},
        ]},
      { period:'2026年1月 〜現在', role:'マーケティングマネージャー （正社員）', emp:'正社員', working:'週5',
        role_desc:'正社員として全社マーケティングを統括\nユース事業部への移管を見据えたマーケ体制の構築',
        responsibility:'マーケティング全般の成果責任\nユース向け集客・認知拡大のKPI達成',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・マーケ定例（週1〜2回）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'マーケ戦略', task:'年間・四半期ごとのマーケティング計画（KPI設計・チャネル戦略）策定', status:'same'},
          {cat:'コンテンツ', task:'Instagram運用ディレクション（方針・素材・配信・分析）', status:'same'},
          {cat:'コンテンツ', task:'LINE運用ディレクション（方針・素材・配信・分析）', status:'same'},
          {cat:'コンテンツ', task:'NEO公式サイト・note・SNS等のコンテンツ更新・効果分析', status:'same'},
          {cat:'集客', task:'各イベントの集客戦略・広告運用（SNS広告・パートナー連携）', status:'same'},
          {cat:'集客', task:'成果指標のレポーティング', status:'same'},
          {cat:'マネジメント', task:'マーケチームメンバーの進捗・品質管理', status:'same'},
        ]},
    ]},
  { id:'菅雅也', name:'菅雅也', dept:'経営企画部', team:'広報・クリエイティブ', avatar_color:['#dc2626','#fee2e2'],
    versions:[
      { period:'2025年7月 〜現在', role:'クリエイティブマネージャー', emp:'業務委託', working:'週3〜4日',
        role_desc:'NEO福岡の動画・クリエイティブ制作全般のディレクション\nインスタリール・イベント動画・写真撮影の統括',
        responsibility:'NEO福岡のクリエイティブ品質の責任\n広報チームへのコンテンツ供給責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・広報チーム定例（週1回）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'動画制作', task:'NEO福岡の動画制作・監修・年間動画企画', status:'same'},
          {cat:'動画制作', task:'インスタリール動画素材・写真素材提供', status:'same'},
          {cat:'動画制作', task:'イベント当日の動画・写真撮影・カメラ手配・当日オペレーション', status:'same'},
          {cat:'広報', task:'インスタ投稿戦略のアドバイス', status:'same'},
          {cat:'広報', task:'広報委員会副顧問：メンバーの投稿素材作成・投稿支援', status:'same'},
        ]},
    ]},
  { id:'中島啓太', name:'中島啓太', dept:'パートナー事業部', team:'クラブパートナーシップ', avatar_color:['#0f766e','#ccfbf1'],
    versions:[
      { period:'2025年2月 〜6月', role:'クラブパートナーシップ ダイレクター', emp:'業務委託', working:'週2〜3日',
        role_desc:'NEO福岡と提携スポーツクラブとの戦略的パートナーシップ構築\nクラブとのコミュニティ連携プログラムの企画・実行',
        responsibility:'提携クラブとの関係構築・維持責任\nクラブパートナーシップからの価値創出',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・パートナー定例（週1回）\n・提携クラブとの個別MTG（月1〜2回）',
        tasks:[
          {cat:'パートナー開発', task:'提携スポーツチームとの中長期戦略の作成・合意形成', status:'same'},
          {cat:'パートナー開発', task:'スポーツチームとの提携内容の設計・資料作成・進捗管理（WBS）', status:'same'},
          {cat:'プログラム連携', task:'アカデミア（HR）カリキュラム企画・スポーツ連携座組み企画', status:'same'},
          {cat:'プログラム連携', task:'NEO提携チームへのコンサルティング業務', status:'same'},
        ]},
      { period:'2025年7月 〜現在', role:'クラブパートナーシップ ダイレクター', emp:'業務委託', working:'週2〜3日',
        role_desc:'提携スポーツクラブとの戦略深化\nNEOアカデミア（HR）へのスポーツ連携カリキュラム強化',
        responsibility:'提携クラブとの長期関係維持・拡大\nアカデミアへのスポーツ連携価値提供',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・パートナー定例（週1回）\n・提携クラブとの個別MTG（月1〜2回）',
        tasks:[
          {cat:'パートナー開発', task:'提携スポーツチームとの中長期戦略の作成・合意形成', status:'same'},
          {cat:'パートナー開発', task:'スポーツチームとの提携内容の設計・資料作成・進捗管理（WBS）', status:'same'},
          {cat:'プログラム連携', task:'アカデミア（HR）カリキュラム企画・スポーツ連携座組み企画', status:'same'},
          {cat:'プログラム連携', task:'NEO提携チームへのコンサルティング業務', status:'same'},
        ]},
    ]},
  { id:'中道稔', name:'中道稔', dept:'コミュニティ事業部', team:'イベントチーム', avatar_color:['#ea580c','#ffedd5'],
    versions:[
      { period:'〜2026年3月', role:'プログラム強化担当 （旧役職）', emp:'業務委託', working:'週4〜5日',
        role_desc:'NEO福岡のイベント・研修プログラムの強化担当\n運営実務全般のサポート',
        responsibility:'イベント運営の品質維持\nプログラム強化への貢献',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・イベント定例（週1〜2回）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'イベント運営', task:'現地イベントロジ作成・運営実務準備', status:'same'},
          {cat:'イベント運営', task:'司会台本作成・会場手配・会場レイアウト', status:'same'},
          {cat:'イベント運営', task:'応募フォーム管理・出席者管理', status:'same'},
          {cat:'イベント運営', task:'年間イベントの実行', status:'same'},
          {cat:'研修', task:'研修チームのセールスへの同行', status:'same'},
          {cat:'研修', task:'研修当日の運営・ホスピタリティ管理', status:'same'},
          {cat:'CS連携', task:'受講生情報のキャッチアップとイベントチームへの連携', status:'same'},
        ]},
      { period:'2026年4月 〜8月', role:'イベントチームリーダー', emp:'業務委託', working:'週4〜5日',
        role_desc:'イベントチームリーダーとしてイベント全般を統括\n年間イベント計画の策定・実行',
        responsibility:'イベント品質・NPS向上責任\nイベント予算・スケジュール管理責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・イベント定例（週1〜2回）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'イベント運営', task:'現地イベントロジ作成・運営実務準備', status:'same'},
          {cat:'イベント運営', task:'司会台本作成・会場手配・会場レイアウト', status:'same'},
          {cat:'イベント運営', task:'応募フォーム管理・出席者管理', status:'same'},
          {cat:'イベント運営', task:'年間イベントの実行', status:'same'},
          {cat:'チームリード', task:'イベントチームのリーダーシップ・指示出し', status:'new'},
          {cat:'チームリード', task:'イベント振り返り・改善提案', status:'new'},
        ]},
      { period:'2026年9月 〜（予定）', role:'イベントチームリーダー （正社員）', emp:'正社員予定', working:'週5',
        role_desc:'正社員として安定的にイベントチームを統括\nNEO福岡の主要イベントの継続的改善',
        responsibility:'イベントチームの長期的な品質・体制確立\nNEO年間イベントの成功責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・イベント定例（週1〜2回）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'イベント運営', task:'現地イベントロジ作成・運営実務準備', status:'same'},
          {cat:'イベント運営', task:'司会台本作成・会場手配・会場レイアウト', status:'same'},
          {cat:'イベント運営', task:'年間イベントの実行', status:'same'},
          {cat:'チームリード', task:'イベントチームのリーダーシップ・指示出し', status:'same'},
          {cat:'チームリード', task:'イベント振り返り・改善提案', status:'same'},
        ]},
    ]},
  { id:'元美和', name:'元美和', dept:'パートナー事業部', team:'NEO九州未来評議会', avatar_color:['#9333ea','#f3e8ff'],
    versions:[
      { period:'2026年3月 〜現在', role:'コミュニティプロデューサー （NEO九州未来評議会専任）', emp:'業務委託', working:'週3〜4日',
        role_desc:'NEO九州未来評議会の企画・運営・拡大\n評議会メンバー（企業・経営者）とのリレーション構築\n若者との接点設計・スクリーニング',
        responsibility:'NEO九州未来評議会の参加企業数・満足度の向上責任\n評議会を通じた若者発掘・スクリーニング責任',
        meetings:'・毎週土曜 9:00〜10:30 定例参加\n・評議会準備定例（月2〜3回）\n・評議会メンバー個別MTG（随時）\n・チェックイン（毎週月曜朝）',
        tasks:[
          {cat:'評議会運営', task:'NEO九州未来評議会の当日進行設計・台本作成・ファシリテーション補助', status:'same'},
          {cat:'評議会運営', task:'参加企業フォローアップ・ゲスト登壇者対応', status:'same'},
          {cat:'評議会拡大', task:'新規参加候補リスト作成・紹介ルート開拓・法人営業', status:'same'},
          {cat:'評議会管理', task:'会費管理・出欠管理・会場手配・レポート作成・ポータル投稿管理', status:'same'},
          {cat:'若者連携', task:'若者選定面談・NEO2期生候補応募者の第一スクリーニング', status:'same'},
        ]},
    ]},
]

const DEPTS_RAW = [
  { name:'コミュニティ事業部', teams:[
    {name:'コミュニティ（教育）', status:'active', desc:'アカデミア生の受講状況管理・ヒーロー創出を担うチーム', members:['森朝香']},
    {name:'イベントチーム', status:'active', desc:'研修・イベント全般の企画・ロジ・当日運営を担うチーム', members:['中道稔']},
    {name:'企業伴走 兼 総務', status:'active', desc:'企業会員とのコミュニケーション・イベント運営サポート・総務を担うチーム', members:['面川文香','古野絢太']},
    {name:'カスタマーサクセス', status:'active', desc:'会員企業の活用支援・研修サービス・プロジェクト伴走を担うチーム', members:['鬼木良輔']},
    {name:'プロジェクトチーム', status:'future', desc:'会員が立ち上げるプロジェクトの立ち上げから伴走・サクセスまでをサポートするチーム', members:[]},
    {name:'クラブパートナーシップ', status:'future', desc:'提携スポーツクラブとの中長期戦略策定・連携推進を担うチーム（移管予定）', members:['中島啓太']},
  ]},
  { name:'ユース事業部', teams:[
    {name:'コンテンツ', status:'future', desc:'LINE・インスタ・webのコンテンツ企画・ディレクションを担うチーム', members:['増田雄太朗','菅雅也']},
    {name:'集客（マーケティング）', status:'future', desc:'ユース向け集客・広告運用・イベント集客戦略を担うチーム', members:['増田雄太朗']},
    {name:'団体連携', status:'future', desc:'外部団体・学校・行政との連携窓口・協働を担うチーム', members:[]},
  ]},
  { name:'パートナー事業部', teams:[
    {name:'評議会チーム', status:'expanding', desc:'NEO九州未来評議会の運営・拡大を担うチーム', members:['元美和']},
    {name:'アカデミアチーム（CS・企業伴走統合）', status:'future', desc:'カスタマーサクセスと企業伴走を統合したアカデミア運営チーム', members:[]},
    {name:'研修チーム', status:'future', desc:'法人向け研修サービスの企画・営業・運営を担うチーム', members:[]},
  ]},
  { name:'経営企画部', teams:[
    {name:'プログラム企画（コミュニティ設計）', status:'expanding', desc:'NEO全体のコミュニティ設計・プログラム企画を担うチーム', members:['加藤翼']},
    {name:'広報チーム', status:'expanding', desc:'NEO福岡のブランディング・メディア対応・コンテンツ発信を担うチーム', members:['菅雅也','面川文香']},
    {name:'基金チーム', status:'future', desc:'NEO基金の設計・運用・会計管理を担うチーム', members:[]},
  ]},
]

const ALL_TASKS_RAW = [
  {dept:'コミュニティ事業部', team:'コミュニティ（教育）', task:'アカデミア生のカルテ情報の設計・最新アップデート', owner:'森朝香', support:'古野絢太'},
  {dept:'コミュニティ事業部', team:'コミュニティ（教育）', task:'ヒーローを目指すアカデミア生へのコーチング・KA', owner:'森朝香', support:''},
  {dept:'コミュニティ事業部', team:'コミュニティ（教育）', task:'アカデミア生に対するコミュニケーション計画の作成・実行', owner:'森朝香', support:'面川文香'},
  {dept:'コミュニティ事業部', team:'コミュニティ（教育）', task:'入会退会手続き業務・入会オリエンテーション', owner:'森朝香', support:'面川文香'},
  {dept:'コミュニティ事業部', team:'コミュニティ（教育）', task:'会員エンゲージメント業務', owner:'森朝香', support:'面川文香・古野絢太'},
  {dept:'コミュニティ事業部', team:'コミュニティ（教育）', task:'コミュニティイベントの集客', owner:'森朝香', support:''},
  {dept:'コミュニティ事業部', team:'コミュニティ（教育）', task:'Playful研修の企画・開発・営業・運営', owner:'森朝香', support:'古野絢太'},
  {dept:'コミュニティ事業部', team:'イベントチーム', task:'現地イベントロジ作成・運営実務準備', owner:'中道稔', support:'面川文香'},
  {dept:'コミュニティ事業部', team:'イベントチーム', task:'司会台本作成・会場手配・会場レイアウト', owner:'中道稔', support:'面川文香'},
  {dept:'コミュニティ事業部', team:'イベントチーム', task:'応募フォーム管理・出席者管理', owner:'中道稔', support:'面川文香'},
  {dept:'コミュニティ事業部', team:'イベントチーム', task:'年間イベントの実行', owner:'中道稔', support:'面川文香'},
  {dept:'コミュニティ事業部', team:'イベントチーム', task:'研修チームのセールスへの同行', owner:'中道稔', support:''},
  {dept:'コミュニティ事業部', team:'イベントチーム', task:'受講生情報のキャッチアップとイベントチームへの連携', owner:'中道稔', support:''},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'会員企業への適切な量・質・頻度でのコミュニケーション', owner:'面川文香', support:'古野絢太'},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'会員企業との面談の同行・メール・チャット対応', owner:'面川文香', support:'古野絢太'},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'会員企業インタビュー同席・記事執筆・web掲載', owner:'面川文香', support:''},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'企業広報確認業務（素材集め・プレビュー作成・確認依頼）', owner:'面川文香', support:'古野絢太'},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'企業カルテの情報管理・企業公開情報のリサーチ・アップデート', owner:'古野絢太', support:'面川文香'},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'事務局長補佐（全体PM・資料作成・会議フィードバック）', owner:'古野絢太', support:''},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'NEOアカデミアのPMシート更新・管理サポート', owner:'古野絢太', support:''},
  {dept:'コミュニティ事業部', team:'企業伴走 兼 総務', task:'総務（事務作業・HP更新・郵送物管理・問い合わせ対応・経理連携）', owner:'面川文香', support:''},
  {dept:'コミュニティ事業部', team:'カスタマーサクセス', task:'会員企業のサクセスロードマップ企画・実行・改善', owner:'鬼木良輔', support:'古野絢太'},
  {dept:'コミュニティ事業部', team:'カスタマーサクセス', task:'週次進捗ミーティングの運営・面談資料作成・フィードバック共有', owner:'鬼木良輔', support:'古野絢太・面川文香'},
  {dept:'コミュニティ事業部', team:'カスタマーサクセス', task:'課題抽出および改善提案の実行', owner:'鬼木良輔', support:''},
  {dept:'コミュニティ事業部', team:'カスタマーサクセス', task:'NEO合同AI研修の企画・運営・改善', owner:'鬼木良輔', support:'森朝香'},
  {dept:'コミュニティ事業部', team:'カスタマーサクセス', task:'企業向け研修提案資料の作成・商談・プレゼン対応', owner:'鬼木良輔', support:''},
  {dept:'コミュニティ事業部', team:'カスタマーサクセス', task:'研修後の効果測定・改善提案サイクル構築', owner:'鬼木良輔', support:''},
  {dept:'コミュニティ事業部', team:'カスタマーサクセス', task:'企業選抜生プロジェクトの組成支援・伴走・助言', owner:'鬼木良輔', support:'古野絢太'},
  {dept:'コミュニティ事業部', team:'プロジェクトチーム', task:'会員プロジェクトの立ち上げ支援・座組み設計', owner:'（未定）', support:''},
  {dept:'コミュニティ事業部', team:'プロジェクトチーム', task:'プロジェクト進行中の伴走・助言・課題解決支援', owner:'（未定）', support:''},
  {dept:'コミュニティ事業部', team:'クラブパートナーシップ', task:'提携スポーツチームとの中長期戦略の作成・合意形成', owner:'中島啓太', support:''},
  {dept:'コミュニティ事業部', team:'クラブパートナーシップ', task:'スポーツチームとの提携内容の設計・資料作成・進捗管理（WBS）', owner:'中島啓太', support:''},
  {dept:'コミュニティ事業部', team:'クラブパートナーシップ', task:'アカデミア（HR）カリキュラム企画・スポーツ連携座組み企画', owner:'中島啓太', support:''},
  {dept:'コミュニティ事業部', team:'クラブパートナーシップ', task:'NEO提携チームへのコンサルティング業務', owner:'中島啓太', support:''},
  {dept:'ユース事業部', team:'コンテンツ', task:'年間・四半期ごとのマーケティング計画（KPI設計・チャネル戦略）策定', owner:'増田雄太朗', support:''},
  {dept:'ユース事業部', team:'コンテンツ', task:'Instagram運用ディレクション（方針・素材・配信・分析）', owner:'増田雄太朗', support:'菅雅也'},
  {dept:'ユース事業部', team:'コンテンツ', task:'LP企画・LP制作（文章・デザイナー連携）', owner:'増田雄太朗', support:''},
  {dept:'ユース事業部', team:'コンテンツ', task:'LINE運用ディレクション（方針・素材・配信・分析）', owner:'増田雄太朗', support:''},
  {dept:'ユース事業部', team:'コンテンツ', task:'NEO公式サイト・note・SNS等のコンテンツ更新・効果分析', owner:'増田雄太朗', support:''},
  {dept:'ユース事業部', team:'コンテンツ', task:'デザイン・コピー・トーン＆マナーの統一管理', owner:'増田雄太朗', support:'菅雅也'},
  {dept:'ユース事業部', team:'コンテンツ', task:'NEO福岡の動画制作・監修・年間動画企画', owner:'菅雅也', support:''},
  {dept:'ユース事業部', team:'コンテンツ', task:'イベント当日の動画・写真撮影・カメラ手配・当日オペレーション', owner:'菅雅也', support:''},
  {dept:'ユース事業部', team:'集客（マーケティング）', task:'各イベントの集客戦略・広告運用（SNS広告・パートナー連携）', owner:'増田雄太朗', support:'菅雅也'},
  {dept:'ユース事業部', team:'集客（マーケティング）', task:'NEOシティフェス・NEOアワードの告知クリエイティブ設計', owner:'増田雄太朗', support:'菅雅也'},
  {dept:'ユース事業部', team:'集客（マーケティング）', task:'会員企業とのコラボキャンペーン企画・運営', owner:'増田雄太朗', support:''},
  {dept:'ユース事業部', team:'集客（マーケティング）', task:'成果指標（リーチ数・集客数・反響率など）のレポーティング', owner:'増田雄太朗', support:''},
  {dept:'ユース事業部', team:'集客（マーケティング）', task:'マーケチームメンバーの進捗・品質管理', owner:'増田雄太朗', support:''},
  {dept:'ユース事業部', team:'団体連携', task:'連携団体の開拓・関係構築', owner:'（未定）', support:''},
  {dept:'ユース事業部', team:'団体連携', task:'連携先との協働プログラムの設計・実行', owner:'（未定）', support:''},
  {dept:'パートナー事業部', team:'評議会チーム', task:'NEO九州未来評議会の当日進行設計・台本作成・ファシリテーション補助', owner:'元美和', support:''},
  {dept:'パートナー事業部', team:'評議会チーム', task:'参加企業フォローアップ・ゲスト登壇者対応', owner:'元美和', support:''},
  {dept:'パートナー事業部', team:'評議会チーム', task:'新規参加候補リスト作成・紹介ルート開拓・法人営業', owner:'元美和', support:''},
  {dept:'パートナー事業部', team:'評議会チーム', task:'会費管理・出欠管理・会場手配・レポート作成・ポータル投稿管理', owner:'元美和', support:''},
  {dept:'パートナー事業部', team:'評議会チーム', task:'若者選定面談・NEO2期生候補応募者の第一スクリーニング', owner:'元美和', support:''},
  {dept:'パートナー事業部', team:'アカデミアチーム（CS・企業伴走統合）', task:'会員企業のサクセスロードマップ企画・実行・改善', owner:'鬼木良輔', support:'古野絢太'},
  {dept:'パートナー事業部', team:'アカデミアチーム（CS・企業伴走統合）', task:'企業別CS進捗・課題の把握と報告', owner:'鬼木良輔', support:'古野絢太'},
  {dept:'パートナー事業部', team:'研修チーム', task:'「NEO合同AI研修」の企画・運営・改善', owner:'鬼木良輔', support:'森朝香'},
  {dept:'パートナー事業部', team:'研修チーム', task:'企業向け研修提案資料の作成・商談・プレゼン対応', owner:'鬼木良輔', support:''},
  {dept:'パートナー事業部', team:'研修チーム', task:'Playful研修の企画・開発・営業', owner:'森朝香', support:''},
  {dept:'パートナー事業部', team:'研修チーム', task:'研修当日の運営・ホスピタリティ管理', owner:'中道稔', support:'面川文香'},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'NEOのコミュニティの基本設計と改善', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'NEOのプログラム内容の企画（応援カイギ・NEOアカデミア等）', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'NEOのプログラムの運営方法の設計（PM計画書・WBS作成）', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'アワードの企画設計・PM計画書', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'シティフェスの企画設計・PM計画書', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'事業部の組織体制と業務内容の設計', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'PMのマネジメント・コミュニティマネージャーのマネジメント', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'プログラム企画（コミュニティ設計）', task:'事業部のコスト管理', owner:'加藤翼', support:''},
  {dept:'経営企画部', team:'広報チーム', task:'NEO福岡の動画制作・監修・年間動画企画', owner:'菅雅也', support:''},
  {dept:'経営企画部', team:'広報チーム', task:'インスタリール動画素材・写真素材提供', owner:'菅雅也', support:''},
  {dept:'経営企画部', team:'広報チーム', task:'インスタ投稿戦略のアドバイス', owner:'菅雅也', support:''},
  {dept:'経営企画部', team:'広報チーム', task:'イベント当日の動画・写真撮影・カメラ手配・当日オペレーション', owner:'菅雅也', support:''},
  {dept:'経営企画部', team:'広報チーム', task:'広報委員会副顧問：メンバーの投稿素材作成・投稿支援', owner:'菅雅也', support:'増田雄太朗'},
  {dept:'経営企画部', team:'広報チーム', task:'会員企業インタビュー同席・記事執筆・web掲載', owner:'面川文香', support:''},
  {dept:'経営企画部', team:'広報チーム', task:'HPの更新業務', owner:'面川文香', support:''},
  {dept:'経営企画部', team:'基金チーム', task:'基金の設計・スキーム構築', owner:'（未定）', support:''},
  {dept:'経営企画部', team:'基金チーム', task:'基金への資金調達・寄付者対応', owner:'（未定）', support:''},
]

// ══════════════════════════════════════════════════
// 定数
// ══════════════════════════════════════════════════
const DEPT_COLORS = {
  'コミュニティ事業部': '#1a56db',
  'ユース事業部':       '#059669',
  'パートナー事業部':   '#7c3aed',
  '経営企画部':         '#d97706',
}
const STATUS_BADGE = {
  active:    { label:'🔵 現役',     bg:'rgba(59,130,246,0.15)',  color:'#3b82f6', border:'rgba(59,130,246,0.3)' },
  expanding: { label:'🟡 拡充中',   bg:'rgba(202,138,4,0.15)',   color:'#ca8a04', border:'rgba(202,138,4,0.3)' },
  future:    { label:'🟣 追加予定', bg:'rgba(168,85,247,0.15)',  color:'#a855f7', border:'rgba(168,85,247,0.3)' },
}
const EMP_BADGE = {
  '業務委託':        { bg:'rgba(99,102,241,0.15)',  color:'#6366f1' },
  '正社員':          { bg:'rgba(16,185,129,0.15)',  color:'#10b981' },
  '業務委託→正社員': { bg:'rgba(245,158,11,0.15)',  color:'#f59e0b' },
  '正社員予定':      { bg:'rgba(245,158,11,0.15)',  color:'#f59e0b' },
}
const TASK_STATUS_OPTS = ['same', 'new', 'del']
const EMP_OPTS = ['業務委託', '正社員', '業務委託→正社員', '正社員予定']

function getEmpBadge(emp) {
  const key = Object.keys(EMP_BADGE).find(k => emp && emp.includes(k)) || '業務委託'
  return EMP_BADGE[key]
}

// ══════════════════════════════════════════════════
// 共通UIパーツ
// ══════════════════════════════════════════════════
function Avatar({ name, colors, size = 40 }) {
  const [fg, bg] = colors || ['#4d9fff', '#ddeeff']
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.44, fontWeight: 800, color: bg, flexShrink: 0 }}>
      {name ? name[0] : '?'}
    </div>
  )
}

function SaveBtn({ saving, saved, onClick, label = '保存' }) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: saved ? '#00d68f' : '#4d9fff', color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.3s', opacity: saving ? 0.6 : 1 }}>
      {saved ? '✓ 保存済み' : saving ? '保存中...' : label}
    </button>
  )
}

// インライン編集用テキスト入力
function InlineInput({ value, onChange, style = {} }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(77,159,255,0.4)', borderRadius: 5, padding: '4px 8px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%', ...style }}
    />
  )
}

// ══════════════════════════════════════════════════
// タブ1: 組織図（表示のみ）
// ══════════════════════════════════════════════════
function OrgChart({ onMemberClick }) {
  return (
    <div>
      {DEPTS_RAW.map(dept => {
        const color = DEPT_COLORS[dept.name] || '#4d9fff'
        return (
          <div key={dept.name} style={{ marginBottom: 24, border: `1px solid ${color}30`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: `linear-gradient(135deg, ${color}18, ${color}06)`, borderBottom: `2px solid ${color}30`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 16, fontWeight: 700, color }}>{dept.name}</span>
              <span style={{ fontSize: 11, color: '#606880', marginLeft: 'auto' }}>{dept.teams.length}チーム</span>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 12 }}>
              {dept.teams.map(team => {
                const sb = STATUS_BADGE[team.status] || STATUS_BADGE.active
                return (
                  <div key={team.name} style={{ background: '#111828', border: `1px solid ${color}20`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#dde0ec', flex: 1, lineHeight: 1.4 }}>{team.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0, background: sb.bg, color: sb.color, border: `1px solid ${sb.border}` }}>{sb.label}</span>
                    </div>
                    {team.desc && <p style={{ fontSize: 11, color: '#606880', margin: '0 0 10px', lineHeight: 1.5 }}>{team.desc}</p>}
                    {team.members.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {team.members.map(name => {
                          const m = MEMBERS_RAW.find(x => x.name === name)
                          return (
                            <div key={name} onClick={() => m && onMemberClick(m)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: `${color}15`, border: `1px solid ${color}30`, fontSize: 11, fontWeight: 600, color, cursor: m ? 'pointer' : 'default', transition: 'all 0.15s' }}
                              onMouseEnter={e => { if (m) e.currentTarget.style.background = `${color}28` }}
                              onMouseLeave={e => { if (m) e.currentTarget.style.background = `${color}15` }}
                            >
                              {m && <Avatar name={name} colors={m.avatar_color} size={18} />}
                              {name}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ2: 業務一覧（管理者は編集可）
// ══════════════════════════════════════════════════
function TaskList({ onMemberClick, isAdmin, members }) {
  const [tasks, setTasks] = useState(null)   // null = loading
  const [filterDept, setFilterDept] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editBuf, setEditBuf] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingTeam, setAddingTeam] = useState(null) // {dept, team}
  const [newTaskBuf, setNewTaskBuf] = useState({ task: '', owner: '', support: '' })

  // Supabaseからデータ取得（なければデフォルトを使用）
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('org_tasks')
        .select('*')
        .order('id')
      if (!error && data && data.length > 0) {
        setTasks(data)
      } else {
        // デフォルトデータを初期シードとして使用
        setTasks(ALL_TASKS_RAW.map((t, i) => ({ ...t, id: i + 1 })))
      }
    }
    load()
  }, [])

  const memberNames = members.map(m => m.name)
  const allDepts = [...new Set((tasks || []).map(t => t.dept))]
  const allOwners = [...new Set((tasks || []).map(t => t.owner).filter(o => o && o !== '（未定）'))]

  const filtered = (tasks || []).filter(t =>
    (!filterDept || t.dept === filterDept) &&
    (!filterOwner || t.owner === filterOwner || (t.support && t.support.includes(filterOwner))) &&
    (!query || t.task.includes(query) || t.team.includes(query))
  )

  const grouped = {}
  filtered.forEach(t => {
    if (!grouped[t.dept]) grouped[t.dept] = {}
    if (!grouped[t.dept][t.team]) grouped[t.dept][t.team] = []
    grouped[t.dept][t.team].push(t)
  })

  // 既存行を更新
  const startEdit = (t) => { setEditingId(t.id); setEditBuf({ task: t.task, owner: t.owner, support: t.support }) }
  const cancelEdit = () => { setEditingId(null); setEditBuf({}) }

  const saveEdit = async (t) => {
    setSaving(true)
    const updated = { ...t, task: editBuf.task, owner: editBuf.owner, support: editBuf.support }
    // Supabaseに保存（idが数値かつ既存レコードの場合upsert）
    const { error } = await supabase.from('org_tasks').upsert([updated])
    if (!error) {
      setTasks(prev => prev.map(x => x.id === t.id ? updated : x))
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    }
    setSaving(false); setEditingId(null)
  }

  const deleteTask = async (t) => {
    if (!window.confirm(`「${t.task}」を削除しますか？`)) return
    await supabase.from('org_tasks').delete().eq('id', t.id)
    setTasks(prev => prev.filter(x => x.id !== t.id))
  }

  // 新規行追加
  const addTask = async (dept, team) => {
    if (!newTaskBuf.task.trim()) return
    const newRow = { dept, team, task: newTaskBuf.task.trim(), owner: newTaskBuf.owner, support: newTaskBuf.support }
    const { data, error } = await supabase.from('org_tasks').insert([newRow]).select().single()
    if (!error && data) {
      setTasks(prev => [...prev, data])
    } else {
      // ローカルのみ追加（Supabaseテーブル未作成時のフォールバック）
      setTasks(prev => [...prev, { ...newRow, id: Date.now() }])
    }
    setNewTaskBuf({ task: '', owner: '', support: '' })
    setAddingTeam(null)
  }

  const sel = { background: '#111828', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#e8eaf0', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }

  if (!tasks) return <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>

  return (
    <div>
      {/* フィルター */}
      <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#606880' }}>フィルター</span>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={sel}>
          <option value="">事業部：すべて</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={sel}>
          <option value="">担当者：すべて</option>
          {allOwners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="🔍 業務・チームで検索..."
          style={{ ...sel, width: 200, background: 'rgba(255,255,255,0.05)' }}
          onFocus={e => e.target.style.borderColor = '#4d9fff'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
        />
        <span style={{ fontSize: 11, color: '#606880', marginLeft: 'auto' }}>{filtered.length}件</span>
        {isAdmin && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,209,102,0.15)', color: '#ffd166', border: '1px solid rgba(255,209,102,0.3)', fontWeight: 700 }}>👑 管理者モード</span>}
        {(filterDept || filterOwner || query) && (
          <button onClick={() => { setFilterDept(''); setFilterOwner(''); setQuery('') }} style={{ ...sel, color: '#4d9fff', border: '1px solid rgba(77,159,255,0.3)' }}>クリア</button>
        )}
      </div>

      {Object.entries(grouped).map(([dept, teams]) => {
        const color = DEPT_COLORS[dept] || '#4d9fff'
        return (
          <div key={dept} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 14px', background: `${color}12`, border: `1px solid ${color}25`, borderRadius: 8, borderLeft: `4px solid ${color}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{dept}</span>
            </div>
            {Object.entries(teams).map(([team, teamTasks]) => {
              const isAddingHere = addingTeam?.dept === dept && addingTeam?.team === team
              return (
                <div key={team} style={{ marginBottom: 16, marginLeft: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#a0a8be', marginBottom: 8 }}>└ {team}</div>
                  <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: '#606880', width: 110, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>責任者</th>
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: '#606880', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>業務内容</th>
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: '#606880', width: 120, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>担当（サポート）</th>
                          {isAdmin && <th style={{ width: 80, borderBottom: '1px solid rgba(255,255,255,0.07)' }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {teamTasks.map((t, i) => {
                          const isEditing = editingId === t.id
                          const ownerM = MEMBERS_RAW.find(m => m.name === t.owner)
                          const ownerColor = ownerM ? ownerM.avatar_color[0] : '#606880'
                          return (
                            <tr key={t.id} style={{ borderBottom: i < teamTasks.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: isEditing ? 'rgba(77,159,255,0.06)' : 'transparent' }}>
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? (
                                  <select value={editBuf.owner} onChange={e => setEditBuf(b => ({ ...b, owner: e.target.value }))}
                                    style={{ width: '100%', background: '#0e1420', border: '1px solid rgba(77,159,255,0.4)', borderRadius: 5, padding: '4px 6px', color: '#e8eaf0', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">（未定）</option>
                                    {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                ) : (
                                  t.owner && t.owner !== '（未定）' ? (
                                    <span onClick={() => ownerM && onMemberClick(ownerM)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: `${ownerColor}18`, color: ownerColor, fontSize: 11, fontWeight: 600, cursor: ownerM ? 'pointer' : 'default' }}>
                                      {ownerM && <Avatar name={t.owner} colors={ownerM.avatar_color} size={16} />}
                                      {t.owner}
                                    </span>
                                  ) : <span style={{ fontSize: 11, color: '#404660' }}>{t.owner}</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? (
                                  <InlineInput value={editBuf.task} onChange={v => setEditBuf(b => ({ ...b, task: v }))} />
                                ) : (
                                  <span style={{ fontSize: 12, color: '#c0c4d8', lineHeight: 1.5 }}>{t.task}</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? (
                                  <InlineInput value={editBuf.support} onChange={v => setEditBuf(b => ({ ...b, support: v }))} style={{ fontSize: 11 }} />
                                ) : (
                                  t.support && <span style={{ fontSize: 11, color: '#606880', padding: '2px 7px', background: 'rgba(255,255,255,0.05)', borderRadius: 5 }}>{t.support}</span>
                                )}
                              </td>
                              {isAdmin && (
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => saveEdit(t)} disabled={saving}
                                        style={{ padding: '3px 10px', borderRadius: 5, background: '#4d9fff', border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                                      <button onClick={cancelEdit}
                                        style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#a0a8be', fontSize: 10, cursor: 'pointer' }}>✕</button>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => startEdit(t)}
                                        style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(77,159,255,0.1)', border: '1px solid rgba(77,159,255,0.25)', color: '#4d9fff', fontSize: 10, cursor: 'pointer' }}>✎</button>
                                      <button onClick={() => deleteTask(t)}
                                        style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', fontSize: 10, cursor: 'pointer' }}>✕</button>
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        {/* 新規行追加フォーム */}
                        {isAdmin && isAddingHere && (
                          <tr style={{ background: 'rgba(0,214,143,0.05)', borderTop: '1px dashed rgba(0,214,143,0.25)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <select value={newTaskBuf.owner} onChange={e => setNewTaskBuf(b => ({ ...b, owner: e.target.value }))}
                                style={{ width: '100%', background: '#0e1420', border: '1px solid rgba(0,214,143,0.4)', borderRadius: 5, padding: '4px 6px', color: '#e8eaf0', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                                <option value="">（未定）</option>
                                {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <InlineInput value={newTaskBuf.task} onChange={v => setNewTaskBuf(b => ({ ...b, task: v }))} style={{ borderColor: 'rgba(0,214,143,0.4)' }} />
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <InlineInput value={newTaskBuf.support} onChange={v => setNewTaskBuf(b => ({ ...b, support: v }))} style={{ fontSize: 11, borderColor: 'rgba(0,214,143,0.4)' }} />
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => addTask(dept, team)}
                                  style={{ padding: '3px 10px', borderRadius: 5, background: '#00d68f', border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>追加</button>
                                <button onClick={() => { setAddingTeam(null); setNewTaskBuf({ task: '', owner: '', support: '' }) }}
                                  style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#a0a8be', fontSize: 10, cursor: 'pointer' }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {/* 業務追加ボタン */}
                    {isAdmin && !isAddingHere && (
                      <div onClick={() => { setAddingTeam({ dept, team }); setNewTaskBuf({ task: '', owner: '', support: '' }) }}
                        style={{ padding: '8px 12px', fontSize: 11, color: '#00d68f', cursor: 'pointer', background: 'rgba(0,214,143,0.04)', borderTop: '1px dashed rgba(0,214,143,0.15)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        ＋ 業務を追加
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ3: メンバーJD（管理者は編集可）
// ══════════════════════════════════════════════════
function MemberGrid({ initialMember, onClear, isAdmin, members }) {
  const [selected, setSelected] = useState(initialMember || null)
  const [verIdx, setVerIdx] = useState(null)
  const [jdData, setJdData] = useState(null)

  // Supabaseからカスタムデータ取得
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('org_member_jd').select('*')
      if (!error && data && data.length > 0) {
        // member_id + version_idx をキーにしてマージ
        const overrides = {}
        data.forEach(row => { overrides[`${row.member_id}__${row.version_idx}`] = row })
        setJdData(overrides)
      } else {
        setJdData({})
      }
    }
    load()
  }, [])

  // デフォルトデータにDBのオーバーライドをマージ
  const getMergedMember = (m) => {
    if (!jdData) return m
    const versions = m.versions.map((v, vi) => {
      const key = `${m.id}__${vi}`
      const ov = jdData[key]
      if (!ov) return v
      return {
        ...v,
        role: ov.role ?? v.role,
        emp: ov.emp ?? v.emp,
        working: ov.working ?? v.working,
        role_desc: ov.role_desc ?? v.role_desc,
        responsibility: ov.responsibility ?? v.responsibility,
        meetings: ov.meetings ?? v.meetings,
        tasks: ov.tasks ? JSON.parse(ov.tasks) : v.tasks,
      }
    })
    return { ...m, versions }
  }

  if (!jdData) return <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>

  if (selected) {
    const merged = getMergedMember(selected)
    return (
      <MemberDetail
        member={merged}
        rawMember={selected}
        verIdx={verIdx !== null ? verIdx : merged.versions.length - 1}
        setVerIdx={setVerIdx}
        onBack={() => { setSelected(null); setVerIdx(null); onClear && onClear() }}
        isAdmin={isAdmin}
        members={members}
        onSaved={(memberId, vi, updatedVer) => {
          setJdData(prev => ({ ...prev, [`${memberId}__${vi}`]: { member_id: memberId, version_idx: vi, ...updatedVer } }))
        }}
      />
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
      {MEMBERS_RAW.map(m => {
        const merged = getMergedMember(m)
        const lv = merged.versions[merged.versions.length - 1]
        const [fg, bg] = m.avatar_color
        const empB = getEmpBadge(lv.emp)
        return (
          <div key={m.id} onClick={() => setSelected(m)}
            style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = fg + '60' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar name={m.name} colors={m.avatar_color} size={48} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#dde0ec' }}>{m.name}</div>
                <div style={{ fontSize: 10, color: '#606880', marginTop: 2 }}>{m.dept.replace('（→', '').replace('へ移管予定）', '')}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, background: fg, color: bg, marginBottom: 10, lineHeight: 1.4 }}>{lv.role}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: empB.bg, color: empB.color }}>{lv.emp.split('→')[0]}</span>
              {lv.working && <span style={{ fontSize: 10, color: '#606880' }}>{lv.working}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#606880', fontWeight: 700 }}>{merged.versions.length}バージョン</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MemberDetail({ member: m, rawMember, verIdx, setVerIdx, onBack, isAdmin, members, onSaved }) {
  const ver = m.versions[verIdx]
  const [fg, bg] = m.avatar_color || ['#4d9fff', '#ddeeff']
  const empB = getEmpBadge(ver.emp)

  // 編集用ステート
  const [editing, setEditing] = useState(false)
  const [editVer, setEditVer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const startEdit = () => {
    setEditVer({
      role: ver.role,
      emp: ver.emp,
      working: ver.working,
      role_desc: ver.role_desc || '',
      responsibility: ver.responsibility || '',
      meetings: ver.meetings || '',
      tasks: JSON.parse(JSON.stringify(ver.tasks || [])),
    })
    setEditing(true)
  }
  const cancelEdit = () => { setEditing(false); setEditVer(null) }

  const saveEdit = async () => {
    setSaving(true)
    const payload = {
      member_id: m.id,
      version_idx: verIdx,
      role: editVer.role,
      emp: editVer.emp,
      working: editVer.working,
      role_desc: editVer.role_desc,
      responsibility: editVer.responsibility,
      meetings: editVer.meetings,
      tasks: JSON.stringify(editVer.tasks),
    }
    const { error } = await supabase.from('org_member_jd').upsert([payload], { onConflict: 'member_id,version_idx' })
    if (!error) {
      onSaved(m.id, verIdx, payload)
      setSaved(true); setTimeout(() => setSaved(false), 1500)
      setEditing(false)
    }
    setSaving(false)
  }

  // タスク編集用
  const updateTask = (i, field, val) => {
    setEditVer(prev => {
      const tasks = [...prev.tasks]
      tasks[i] = { ...tasks[i], [field]: val }
      return { ...prev, tasks }
    })
  }
  const addTask = () => setEditVer(prev => ({ ...prev, tasks: [...prev.tasks, { cat: '', task: '', status: 'new' }] }))
  const removeTask = (i) => setEditVer(prev => ({ ...prev, tasks: prev.tasks.filter((_, idx) => idx !== i) }))

  const displayVer = editing ? editVer : ver
  const activeTasks = displayVer.tasks.filter(t => t.status !== 'del')
  const allTasksView = [...activeTasks, ...displayVer.tasks.filter(t => t.status === 'del')]

  const box = { background: '#111828', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
  const ta = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(77,159,255,0.35)', borderRadius: 6, padding: '8px 10px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#a0a8be', fontFamily: 'inherit' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(77,159,255,0.1)'; e.currentTarget.style.color = '#4d9fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#a0a8be' }}
        >← メンバー一覧に戻る</button>
        {isAdmin && !editing && (
          <button onClick={startEdit}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', border: '1px solid rgba(255,209,102,0.35)', background: 'rgba(255,209,102,0.1)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#ffd166', fontFamily: 'inherit' }}>
            👑 このバージョンを編集
          </button>
        )}
        {isAdmin && editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <SaveBtn saving={saving} saved={saved} onClick={saveEdit} label="変更を保存" />
            <button onClick={cancelEdit} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#a0a8be', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          </div>
        )}
      </div>

      {/* プロフィールヘッダー */}
      <div style={{ background: `linear-gradient(135deg, ${fg}, ${fg}bb)`, borderRadius: 12, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <Avatar name={m.name} colors={[bg, fg]} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>{m.name}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{m.dept.replace('（→', '').replace('へ移管予定）', '')} / {m.team}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {editing ? (
              <>
                <input value={editVer.role} onChange={e => setEditVer(p => ({ ...p, role: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 5, padding: '3px 10px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit', minWidth: 180 }} />
                <select value={editVer.emp} onChange={e => setEditVer(p => ({ ...p, emp: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, padding: '3px 8px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                  {EMP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input value={editVer.working} onChange={e => setEditVer(p => ({ ...p, working: e.target.value }))}
                  placeholder="稼働量"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, padding: '3px 8px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: 100 }} />
              </>
            ) : (
              <>
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }}>{displayVer.role}</span>
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: empB.bg, color: empB.color, fontWeight: 700 }}>{displayVer.emp}</span>
                {displayVer.working && <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>{displayVer.working}</span>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* バージョンタブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {m.versions.map((v, i) => {
          const isA = i === verIdx
          return (
            <button key={i} onClick={() => { setVerIdx(i); setEditing(false) }} style={{ padding: '8px 16px', fontSize: 11, fontWeight: isA ? 700 : 500, color: isA ? bg : '#606880', background: isA ? fg : '#111828', border: `1px solid ${isA ? fg : 'rgba(255,255,255,0.1)'}`, borderRadius: '6px 6px 0 0', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              V{i + 1}: {v.period}
            </button>
          )
        })}
      </div>

      {/* 役割・責任範囲 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={box}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#606880', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 役割</div>
          {editing ? (
            <textarea value={editVer.role_desc} onChange={e => setEditVer(p => ({ ...p, role_desc: e.target.value }))} rows={5} style={ta} />
          ) : (
            <div style={{ fontSize: 12, color: '#a0a8be', lineHeight: 1.8, background: `${fg}12`, padding: 12, borderRadius: 8 }}>
              {displayVer.role_desc ? displayVer.role_desc.split('\n').map((l, i) => <div key={i}>• {l}</div>) : <span style={{ color: '#404660' }}>—</span>}
            </div>
          )}
        </div>
        <div style={box}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#606880', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 責任範囲</div>
          {editing ? (
            <textarea value={editVer.responsibility} onChange={e => setEditVer(p => ({ ...p, responsibility: e.target.value }))} rows={5} style={ta} />
          ) : (
            <div style={{ fontSize: 12, color: '#a0a8be', lineHeight: 1.8, background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8 }}>
              {displayVer.responsibility ? displayVer.responsibility.split('\n').map((l, i) => <div key={i}>• {l}</div>) : <span style={{ color: '#404660' }}>—</span>}
            </div>
          )}
        </div>
      </div>

      {/* 主要定例 */}
      <div style={{ ...box, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#606880', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 主要定例</div>
        {editing ? (
          <textarea value={editVer.meetings} onChange={e => setEditVer(p => ({ ...p, meetings: e.target.value }))} rows={5} style={ta} />
        ) : (
          displayVer.meetings ? (
            <div style={{ fontSize: 12, color: '#a0a8be', lineHeight: 1.8, whiteSpace: 'pre-line', background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8 }}>{displayVer.meetings}</div>
          ) : <span style={{ fontSize: 12, color: '#404660' }}>—</span>
        )}
      </div>

      {/* 業務一覧 */}
      <div style={{ ...box, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#606880', letterSpacing: '2px', textTransform: 'uppercase' }}>▶ 業務内容一覧（{activeTasks.length}件）</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {verIdx > 0 && (
              <div style={{ display: 'flex', gap: 6, fontSize: 10 }}>
                <span style={{ padding: '2px 8px', background: '#d5f5e3', color: '#059669', borderRadius: 4 }}>🟢 新規</span>
                <span style={{ padding: '2px 8px', background: '#fdecea', color: '#dc2626', borderRadius: 4 }}>🔴 削除</span>
                <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.06)', color: '#64748b', borderRadius: 4 }}>⚪ 継続</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: '#606880', width: 120, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>カテゴリ</th>
                <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: '#606880', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>業務内容</th>
                {editing && <th style={{ width: 80, borderBottom: '1px solid rgba(255,255,255,0.07)' }} />}
              </tr>
            </thead>
            <tbody>
              {(editing ? editVer.tasks : allTasksView).map((t, i) => {
                const isNew = t.status === 'new'
                const isDel = t.status === 'del'
                return (
                  <tr key={i} style={{ borderBottom: i < (editing ? editVer.tasks : allTasksView).length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: isNew ? 'rgba(5,150,105,0.06)' : isDel ? 'rgba(220,38,38,0.06)' : 'transparent', opacity: isDel && !editing ? 0.55 : 1 }}>
                    <td style={{ padding: '7px 12px' }}>
                      {editing ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <select value={t.status} onChange={e => updateTask(i, 'status', e.target.value)}
                            style={{ background: '#0e1420', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '3px 5px', color: '#e8eaf0', fontSize: 10, outline: 'none', fontFamily: 'inherit' }}>
                            {TASK_STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'new' ? '🟢' : s === 'del' ? '🔴' : '⚪'} {s}</option>)}
                          </select>
                          <InlineInput value={t.cat} onChange={v => updateTask(i, 'cat', v)} style={{ fontSize: 10, width: 80 }} />
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: isNew ? '#d5f5e3' : isDel ? '#fdecea' : 'rgba(255,255,255,0.06)', color: isNew ? '#059669' : isDel ? '#dc2626' : '#64748b' }}>
                          {isNew ? '🟢 ' : isDel ? '🔴 ' : '⚪ '}{t.cat}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '7px 12px', textDecoration: isDel && !editing ? 'line-through' : 'none' }}>
                      {editing ? (
                        <InlineInput value={t.task} onChange={v => updateTask(i, 'task', v)} />
                      ) : (
                        <span style={{ fontSize: 12, color: '#c0c4d8', lineHeight: 1.5 }}>{t.task}</span>
                      )}
                    </td>
                    {editing && (
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <button onClick={() => removeTask(i)}
                          style={{ padding: '2px 7px', borderRadius: 4, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', fontSize: 10, cursor: 'pointer' }}>✕</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {editing && (
            <div onClick={addTask}
              style={{ padding: '8px 12px', fontSize: 11, color: '#00d68f', cursor: 'pointer', background: 'rgba(0,214,143,0.04)', borderTop: '1px dashed rgba(0,214,143,0.2)', display: 'flex', alignItems: 'center', gap: 5 }}>
              ＋ 業務を追加
            </div>
          )}
        </div>
        {editing && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <SaveBtn saving={saving} saved={saved} onClick={saveEdit} label="変更を保存" />
            <button onClick={cancelEdit} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#a0a8be', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          </div>
        )}
      </div>

      {/* タイムライン */}
      <div style={box}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#606880', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>▶ 役職推移タイムライン</div>
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 2, background: `${fg}35`, borderRadius: 1 }} />
          {m.versions.map((v, i) => {
            const isLatest = i === m.versions.length - 1
            const isCurrent = i === verIdx
            return (
              <div key={i} onClick={() => { setVerIdx(i); setEditing(false) }}
                style={{ position: 'relative', marginBottom: i < m.versions.length - 1 ? 16 : 0, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', background: isCurrent ? `${fg}18` : 'transparent', border: `1px solid ${isCurrent ? fg + '40' : 'transparent'}`, transition: 'all 0.15s' }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ position: 'absolute', left: -20, top: 14, width: 12, height: 12, borderRadius: '50%', background: isLatest ? fg : 'rgba(255,255,255,0.2)', border: `2px solid ${isLatest ? fg : 'rgba(255,255,255,0.25)'}`, boxShadow: isLatest ? `0 0 8px ${fg}70` : 'none' }} />
                {isLatest && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: fg, color: bg, marginBottom: 4, display: 'inline-block' }}>最新</span>}
                <div style={{ fontSize: 11, color: isCurrent ? fg : '#606880', fontWeight: isCurrent ? 700 : 400 }}>{v.period}</div>
                <div style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#dde0ec' : '#a0a8be', lineHeight: 1.4, marginTop: 2 }}>{v.role}</div>
                <div style={{ fontSize: 10, color: '#606880', marginTop: 4 }}>{v.emp}{v.working ? ` / ${v.working}` : ''}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// メインページ
// ══════════════════════════════════════════════════
export default function OrgPage({ themeKey = 'dark', user }) {
  const [activeTab, setActiveTab] = useState('chart')
  const [jumpMember, setJumpMember] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [members, setMembers] = useState([])

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.email) return
      const { data } = await supabase.from('members').select('name,is_admin').eq('email', user.email).single()
      if (data?.is_admin) setIsAdmin(true)
    }
    const loadMembers = async () => {
      const { data } = await supabase.from('members').select('id,name,email').order('name')
      if (data) setMembers(data)
    }
    checkAdmin()
    loadMembers()
  }, [user])

  const handleMemberClick = (m) => {
    setJumpMember(m)
    setActiveTab('members')
  }

  const tabs = [
    { id: 'chart',   icon: '🏗', label: '組織図' },
    { id: 'tasks',   icon: '📋', label: '業務一覧' },
    { id: 'members', icon: '👤', label: 'メンバーJD' },
  ]

  const bg = themeKey === 'light' ? '#f0f2f7' : '#090d18'

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: bg, color: '#e8eaf0', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#4d9fff', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>Organization</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>🏢 組織</div>
            {isAdmin && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(255,209,102,0.15)', color: '#ffd166', border: '1px solid rgba(255,209,102,0.3)', fontWeight: 700 }}>👑 管理者</span>}
          </div>
          <div style={{ fontSize: 13, color: '#606880', marginTop: 4 }}>NEO福岡の組織図・業務一覧・メンバー別JDを確認できます</div>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          {tabs.map(t => {
            const isA = activeTab === t.id
            return (
              <button key={t.id}
                onClick={() => { setActiveTab(t.id); if (t.id !== 'members') setJumpMember(null) }}
                style={{ padding: '10px 24px', fontSize: 13, fontWeight: isA ? 700 : 500, color: isA ? '#4d9fff' : '#606880', borderBottom: `3px solid ${isA ? '#4d9fff' : 'transparent'}`, marginBottom: -2, cursor: 'pointer', border: 'none', background: isA ? 'rgba(77,159,255,0.08)' : 'transparent', borderRadius: '8px 8px 0 0', transition: 'all 0.15s', fontFamily: 'inherit' }}
              >{t.icon} {t.label}</button>
            )
          })}
        </div>

        {activeTab === 'chart'   && <OrgChart onMemberClick={handleMemberClick} />}
        {activeTab === 'tasks'   && <TaskList onMemberClick={handleMemberClick} isAdmin={isAdmin} members={members} />}
        {activeTab === 'members' && <MemberGrid initialMember={jumpMember} onClear={() => setJumpMember(null)} isAdmin={isAdmin} members={members} />}
      </div>
    </div>
  )
}
