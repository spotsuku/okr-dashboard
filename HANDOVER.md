# HANDOVER.md - OKR Dashboard

## プロジェクト概要

社内OKR（Objectives and Key Results）管理ダッシュボード。組織階層ごとにOKRを設定・追跡し、達成率を可視化するWebアプリケーション。

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 14.2.3 (App Router) |
| UI | React 18 (CSS-in-JS、インラインスタイル) |
| バックエンド/DB | Supabase (PostgreSQL + Auth + RLS) |
| AI連携 | Anthropic Claude API (claude-opus-4-6) |
| デプロイ | Vercel |

## ディレクトリ構成

```
okr-dashboard/
├── app/
│   ├── layout.jsx          # ルートレイアウト（lang=ja）
│   ├── page.jsx            # エントリーポイント（認証チェック → LoginPage or Dashboard）
│   └── api/
│       ├── ai/route.js           # AI CSV解析API
│       ├── ai-feedback/route.js  # AIフィードバックAPI
│       ├── csv-analyze/route.js  # CSV解析API（OKR/メンバー両対応）
│       └── admin-users/route.js  # ユーザー管理API（Service Role使用）
├── components/
│   ├── Dashboard.jsx       # メインダッシュボード（ナビ、テーマ、全体制御）
│   ├── LoginPage.jsx       # ログイン画面
│   ├── MyOKRPage.jsx       # 個人OKR管理ページ
│   ├── CsvPage.jsx         # CSV一括インポートページ
│   ├── BulkRegisterPage.jsx # 一括登録ページ
│   ├── MemberPage.jsx      # メンバー管理ページ
│   ├── WeeklyMTGPage.jsx   # 週次MTGページ
│   ├── AnnualView.jsx      # 年間ビュー
│   └── AIPanel.jsx         # AIアシスタントパネル
├── lib/
│   └── supabase.js         # Supabaseクライアント初期化
├── supabase_setup.sql      # DBスキーマ + 初期データ + RLSポリシー
├── next.config.js          # Next.js設定（デフォルト）
└── package.json
```

## データベース構成

### テーブル

- **levels** - 組織階層（経営 → 事業部 → チーム）。`parent_id` で木構造を表現
- **objectives** - 目標。`level_id` で組織に紐づけ、`period`（q1〜q4, annual）で期間管理
- **key_results** - 成果指標。`objective_id` に紐づく。`target` / `current_value` で進捗管理。`lower_is_better` フラグ対応

### RLSポリシー

全テーブルで認証済みユーザーに全操作（SELECT/INSERT/UPDATE/DELETE）を許可。

## 主要機能

1. **ダッシュボード** - 組織階層ツリーでOKR達成率を可視化（ダーク/ライトテーマ対応）
2. **OKR管理** - Objective / Key Result のCRUD操作
3. **達成率評価** - 6段階評価（★0〜★5: 未達〜奇跡）
4. **CSV一括インポート** - AIによるCSV自動解析・補正・登録
5. **AIフィードバック** - OKRの質に対するAIアドバイス
6. **週次MTG** - 進捗共有用のMTGビュー
7. **年間ビュー** - 通期での達成状況俯瞰
8. **メンバー管理** - Supabase Auth連携のユーザー管理
9. **一括登録** - OKRの一括登録機能

## 環境変数

| 変数名 | 用途 | 必須 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトURL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー（管理者API用） | ✅ |
| `ANTHROPIC_API_KEY` | Anthropic API キー（AI機能用） | ✅ |

## セットアップ手順

1. `supabase_setup.sql` を Supabase SQL Editor で実行
2. `.env.local` に環境変数を設定
3. `npm install && npm run dev`
4. http://localhost:3000 でアクセス

## 現在の状態

- 基本的なOKR管理機能は実装済み
- AI連携（CSV解析・フィードバック）実装済み
- ダーク/ライトテーマ対応済み
- Supabase Auth によるログイン機能実装済み

## 既知の課題・改善候補

- CSS-in-JS がインラインスタイルで統一されており、コンポーネントが大きい（Dashboard.jsx が特に巨大）
- テストコードなし
- TypeScript 未導入
- エラーハンドリングが最小限
- RLSポリシーが全許可のため、きめ細かなアクセス制御が未実装

## 評価基準

| 星 | ラベル | 達成率 |
|---|---|---|
| ★5 | 奇跡 | 150%以上 |
| ★4 | 変革 | 120%以上 |
| ★3 | 順調以上 | 100%以上 |
| ★2 | 順調 | 80%以上 |
| ★1 | 最低限 | 60%以上 |
| ★0 | 未達 | 60%未満 |
