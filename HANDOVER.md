# OKRダッシュボード 開発引継ぎ文書

Claude Code引継ぎ用（2026-03-16）

## プロジェクト基本情報

| 項目 | 値 |
|------|-----|
| GitHub | spotsuku/okr-dashboard（Public） |
| Vercel URL | https://okr-dashboard-taupe.vercel.app/ |
| Supabase | dzqxwbdjvgdkayisasyg.supabase.co（NEO福岡） |
| Framework | Next.js + React（'use client'） |
| 認証 | Supabase Auth（Google OAuth） |

## ディレクトリ構成

```
okr-dashboard/
├── app/
│   ├── api/
│   │   ├── csv-analyze/route.js     # AI解析API（OKR・KA両対応）
│   │   └── admin-users/route.js     # Supabase Admin APIラッパー
│   └── page.tsx
├── components/
│   ├── Dashboard.jsx                # メインコンポーネント（年度切替・ナビ）
│   ├── LoginPage.jsx                # Googleログイン
│   ├── AnnualView.jsx               # 年間ブレイクダウンビュー
│   ├── MyOKRPage.jsx                # マイOKRページ
│   ├── WeeklyMTGPage.jsx            # KAレビューページ（週次MTG）
│   ├── MemberPage.jsx               # 組織図・ユーザー管理
│   ├── CsvPage.jsx                  # CSV一括登録（OKR/KA）
│   └── BulkRegisterPage.jsx         # フォーム一括登録（OKR/KA）
└── lib/
    └── supabase.js
```

## Supabaseテーブル構成

### 主要テーブル

| テーブル | 用途 | 主なカラム |
|----------|------|-----------|
| levels | 組織階層 | id, name, icon, parent_id, fiscal_year |
| members | メンバー | id, name, role, level_id, email, avatar_url, is_admin |
| objectives | OKR目標 | id, title, owner, level_id, period, parent_objective_id |
| key_results | KR | id, title, target, current, unit, lower_is_better, objective_id, owner |
| weekly_reports | KA | id, ka_title, owner, status, level_id, objective_id, kr_id, kr_title, week_start |
| kr_weekly_reviews | KRのGood/More記録 | id, kr_id, week_start, weather, good, more, focus |
| ka_tasks | KA配下のタスク | id, report_id, title, assignee, due_date, done |

## 重要な設計メモ

### 年度とperiodキーの対応

- 2026年度（現行）: `q1`, `q2`, `q3`, `q4`, `annual`
- 2025年度: `2025_q1`, `2025_q2`, `2025_q3`, `2025_q4`, `2025_annual`
- levelsテーブルは `fiscal_year` カラムで年度別管理

### KAのステータス（weekly_reports.status）

- `normal`（未分類）/ `focus`（注力）/ `good`（Good）/ `more`（More）/ `done`（完了・非表示）

### KAの管理方針

- 週単位ではなく期間（1〜3ヶ月）単位で管理
- `week_start` カラムは残しているが週フィルタは使っていない
- `status='done'` のKAは折りたたみ表示

## 環境変数（Vercel）

```
NEXT_PUBLIC_SUPABASE_URL=https://dzqxwbdjvgdkayisasyg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=（設定済み）
ANTHROPIC_API_KEY=（設定済み・csv-analyze APIで使用）
SUPABASE_SERVICE_ROLE_KEY=（設定済み・admin-users APIで使用）
```

## 実装済みの主要機能

### Dashboard.jsx

- 年度切替（2025/2026）
- 組織階層サイドバー
- period フィルタ（すべて/通期/Q1〜Q4）
- OKR追加・編集・削除モーダル
- ライト/ダークテーマ切替
- `fetchForLevel` で `period='all'` の場合は全period一括取得

### WeeklyMTGPage.jsx（KAレビュー）

- KAは全件表示（週フィルタなし）
- 完了KA（status=done）は折りたたみ
- 達成済みObjective（全KR 100%以上）は折りたたみ
- KAタイトルのインライン編集（ownerのみ・Enterキー無効・✓ボタンで保存）
- KA担当者の割り振り（展開エリアのselectで変更）
- Objective/KR/KAに担当者アイコン表示

### MyOKRPage.jsx

- 自分がowner/KR担当/KA担当/タスク担当のOKRをすべて表示
- バッジで関与タイプを表示（🎯Owner / 📊KR担当 / 📋KA担当 / ✅タスク担当）
- KAの週フィルタ廃止（完了除く全件表示）

### MemberPage.jsx

- 組織図タブ：部署別メンバー管理
- ユーザー一覧タブ：Supabase Authアカウント一覧
  - 管理者（members.is_admin=true）のみ管理機能使用可
  - 管理機能：紐付け変更・ロール変更・アカウント削除・管理者権限付与

### CsvPage.jsx

- OKR登録タブ：AI解析（列名ゆれ・部署名補正・期間変換）
- KA登録タブ：AI解析（複雑なシート形式対応・KA1:〜を個別行に展開）

### BulkRegisterPage.jsx

- OKR一括登録：フォームで複数OKR+KRを入力→プレビュー→登録
- KA一括登録：フォームで複数KA入力→プレビュー→登録

## PENDING（未実装・要対応）

### 優先度高

1. **AnnualView.jsxのfiscalYear対応** → 実装済みのファイルをGitHubに反映要
2. **kr_weekly_reviews / ka_tasksテーブル作成** → Supabaseで以下のSQLを実行要：

```sql
CREATE TABLE IF NOT EXISTS kr_weekly_reviews (
  id bigint generated always as identity primary key,
  kr_id bigint references key_results(id) on delete cascade,
  week_start date not null,
  weather int default 0,
  good text, more text, focus text,
  updated_at timestamptz default now(),
  unique(kr_id, week_start)
);

CREATE TABLE IF NOT EXISTS ka_tasks (
  id bigint generated always as identity primary key,
  report_id bigint references weekly_reports(id) on delete cascade,
  title text, assignee text, due_date date, done boolean default false
);
```

### 優先度中

1. Slack通知機能（週次チェックインリマインダー）
2. 全体進捗ダッシュボード（全社・事業部の達成率一画面）

## よく使うコードパターン

### 年度対応periodキー変換

```javascript
const toPeriodKey = (period, fiscalYear) =>
  fiscalYear === '2026' ? period : `${fiscalYear}_${period}`

const fromPeriodKey = (periodKey) => {
  if (periodKey.includes('_')) return periodKey.split('_').pop()
  return periodKey
}
```

### テーマ取得

```javascript
// Dashboard.jsx内でthemeKeyをpropsとして受け取る
// getT() または wT() で現在テーマのカラー定義を取得
```

### アバターカラー

```javascript
const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
```

## ファイル更新状況（最新版）

以下のファイルは最新版がGitHubに反映済み（または反映待ち）：

| ファイル | 状態 | 主な変更 |
|----------|------|----------|
| Dashboard.jsx | 反映待ち | period='all'対応・すべてタブ追加 |
| WeeklyMTGPage.jsx | 反映待ち | KA期間管理・達成OKR折りたたみ・Enterキー無効 |
| MyOKRPage.jsx | 反映待ち | KA/KR/タスク担当者も表示 |
| AnnualView.jsx | 反映待ち | fiscalYear対応（年度別データ取得） |
| MemberPage.jsx | 反映待ち | ユーザー一覧タブ・管理者機能 |
| CsvPage.jsx | 反映待ち | KA AI解析対応 |
| BulkRegisterPage.jsx | 反映待ち | 新規・OKR/KA一括登録 |
| app/api/csv-analyze/route.js | 反映待ち | KAモード追加・max_tokens 8000 |
| app/api/admin-users/route.js | 反映待ち | 新規・Supabase Admin API |
