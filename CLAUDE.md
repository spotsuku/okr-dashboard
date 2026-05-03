# OKR Dashboard - Claude開発ガイド

このファイルはClaudeコードが自動で読み込む設定ファイルです。
開発を始める前に必ずこのルールに従ってください。

## プロジェクト概要

OKR管理ダッシュボードアプリ（Next.js 14 / Vercel）
- 本番URL: https://okr-dashboard-taupe.vercel.app
- GitHubリポジトリ: spotsuku/okr-dashboard

## ブランチ運用ルール（必須）

### 基本方針
- **開発は必ず `staging` ブランチで行う**
- **`main` への直接コミットは禁止**
- 機能完成・動作確認後に `staging` → `main` へのPRを作成する
- PRのマージは人間が確認してから行う（Claudeは自動マージしない）

### 作業手順
1. `staging` ブランチにチェックアウト: `git checkout staging`
2. 変更を実装
3. `staging` ブランチにコミット・push
4. Vercelのstagingプレビューで動作確認（URLは自動発行される）
5. 問題なければ `staging` → `main` へのPRを作成して報告する

### 実験的な機能を試す場合
- `staging` から新しいブランチを切る: `git checkout -b feature/xxx`
- 実装・確認後に `staging` へマージしてから `main` へ

## Vercel環境

| 環境 | ブランチ | URL |
|---|---|---|
| 本番 | `main` | okr-dashboard-taupe.vercel.app |
| ステージング | `staging` | Vercelが自動発行するプレビューURL |

## 技術スタック

- フレームワーク: Next.js 14 (App Router)
- スタイリング: Tailwind CSS
- データベース: Notion API
- 通知: Slack API
- デプロイ: Vercel

## コミットメッセージの書き方

日本語で具体的に記述する。
例:
- `feat: 週次MTGページに会議選択UIを追加`
- `fix: OKRドロップダウンがホバーで消える問題を修正`
- `chore: 不要なブランチ削除・CLAUDE.md追加`

## デザインシステム（必須遵守）

新しいコンポーネントやウィジェットを作る際、**必ず既存のデザインシステムを使うこと**。
inline style にハードコードしない。

### 中央管理ファイル

| ファイル | 内容 |
|---|---|
| `lib/themeTokens.js` | 色 (light/dark) / 影 / 角丸 / 余白 / タイポグラフィ / トランジションのトークン |
| `lib/iosStyles.js` | スタイルファクトリ関数 (cardStyle / btnPrimary / pillStyle 等) |

### 使うべきトークン (`lib/themeTokens.js` から import)

- 色: `T.bg / T.bgCard / T.border / T.text / T.textSub / T.textMuted / T.accent / T.success / T.warn / T.danger`
- `RADIUS` (xs=6 / sm=8 / md=10 / lg=14 / xl=18 / 2xl=22 / pill=99)
- `SPACING` (xs=4 / sm=8 / md=12 / lg=16 / xl=20 / 2xl=24 / 3xl=32)
- `TYPO` (largeTitle / title1 / title2 / title3 / headline / body / callout / subhead / footnote / caption)
- `SHADOWS` (xs / sm / md / lg / xl / hover(c) / hero(c))

### 使うべきファクトリ (`lib/iosStyles.js` から import)

| 用途 | 関数 |
|---|---|
| カード (汎用ラッパー) | `cardStyle({ T, accent, padding })` |
| ヒーローバナー (グラデ + オーブ) | `heroStyle({ color })` |
| 大型タイトル | `largeTitle({ T })` / `pageSubtitle({ T })` |
| カードヘッダー | `sectionHeaderStyle({ T, accent })` |
| 小バッジ / ピル | `pillStyle({ color, size, solid })` |
| ボタン (4種) | `btnPrimary` / `btnSecondary` / `btnGhost` / `btnDanger` ({ T, size, color }) |
| 入力欄 | `inputStyle({ T })` |
| グラスバー | `glassBarStyle({ T })` |
| アイコンタイル | `accentRingStyle({ color, size })` |
| 数字 (KPI) | `kpiNumber({ color, size })` |
| プログレスバー | `progressBarStyle({ T })` + `progressFillStyle({ color, value })` |

### NG パターン

```js
// ❌ ハードコード
<div style={{ background: '#1C1C1E', borderRadius: 14, padding: 16 }}>
  <span style={{ fontSize: 14, fontWeight: 800 }}>...</span>
</div>

// ❌ 独自グラデ
<div style={{ background: 'linear-gradient(135deg, #ecfdf5, #34d399)', ... }}>
```

### OK パターン

```js
import { cardStyle, accentRingStyle } from '../lib/iosStyles'
import { TYPO, SPACING } from '../lib/themeTokens'

<div style={cardStyle({ T, accent: T.accent, padding: SPACING.lg })}>
  <div style={accentRingStyle({ color: T.accent, size: 32 })}>📊</div>
  <span style={{ ...TYPO.headline, color: T.text }}>...</span>
</div>
```

### 例外的に独自スタイルが必要な場合

`PopGoalCard` (今月のテーマ等) のような特定の表現が必要な場合のみ独自グラデ可。ただし:
- `RADIUS` / `SPACING` / `TYPO` / `SHADOWS` のトークン値は必ず使う
- 色は `T.success / T.warn / T.danger / T.accent` から派生させる (固定 hex 直書き禁止)
- 新しい独自スタイルは原則 `lib/iosStyles.js` に関数として追加する

### デザイン判断時の参考

- 既存の `components/` 内のコンポーネントが同種の UI を持っているか先に検索する (例: 「カード」「ボタン」「リスト行」)
- ユーザーから「全体デザインからかけ離れている」と指摘されたら必ずこの章を再読する
