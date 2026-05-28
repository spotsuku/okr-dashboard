# OKR Dashboard - Claude開発ガイド

このファイルはClaudeコードが自動で読み込む設定ファイルです。
開発を始める前に必ずこのルールに従ってください。

## プロジェクト概要

OKR管理ダッシュボードアプリ（Next.js 14 App Router / Vercel）。
当初は単一組織（NEO福岡）向けだったが、現在は**マルチテナント SaaS**（1ユーザーが複数組織に所属できる Slack 風 UI）へ拡張済み。

- 本番URL: https://aiworkspace.jp (旧: okr-dashboard-taupe.vercel.app — 308リダイレクトで残存)
- GitHubリポジトリ: spotsuku/okr-dashboard
- 製品名: **AI WorkSpace**

## ブランチ運用ルール（必須・絶対遵守）

### 基本方針
- **開発は必ず `staging` ブランチで行う**
- **`main` への直接コミットは禁止**
- 機能完成・動作確認後に `staging` → `main` へのPRを作成する

### main マージは禁止 (重要・絶対遵守)
- **Claude は `main` への merge_pull_request を絶対に実行してはならない**
- PR の作成 (gh pr create / mcp__github__create_pull_request) までで作業は完了
- ユーザーから「マージして」と明示的に指示があった**そのPRのみ**マージ可
- 「ついでに」「次も同じ作業だから」等の推測でのマージは禁止
- 1セッションで複数のPRをマージしないこと (毎回明示確認必須)
- 過去にこのルールを繰り返し破った実績あり。**例外なし**

### 作業手順
1. `staging` ブランチにチェックアウト: `git checkout staging`
2. 変更を実装
3. `staging` ブランチにコミット・push
4. Vercelのstagingプレビューで動作確認（URLは自動発行される）
5. 問題なければ `staging` → `main` へのPRを作成して報告する

### 実験的な機能を試す場合
- `staging` から新しいブランチを切る: `git checkout -b feature/xxx`
- 実装・確認後に `staging` へマージしてから `main` へ

> ※ Claude Code on the web のセッションでは、指定された作業ブランチ（例: `claude/...`）で
> 開発・push する。その場合も `main` への直接 push / merge は禁止。

## 技術スタック

- **フレームワーク**: Next.js 14.2 (App Router)
- **言語**: JavaScript（TypeScript は不使用）。全コンポーネントが `'use client'`
- **スタイリング**: インライン style + 自前のデザイントークン（Tailwind は導入されていない）
- **データベース / 認証**: **Supabase**（Postgres + Auth + RLS）。Google OAuth ログイン
- **外部連携**: Google (Calendar / Drive / Gmail) OAuth、Slack Webhook、Notion API（会議ノート取込）、Anthropic Claude API（AIコーチ・分析）、Resend（招待メール）
- **デプロイ**: Vercel（cron 1件）

> ⚠️ 旧版の CLAUDE.md では「DB: Notion」と記載していたが**誤り**。
> 現在の正本 DB は **Supabase**。Notion は会議ノート取込などの**補助連携**に過ぎない。

## ローカル開発

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 本番ビルド
npm run start    # ビルド済みを起動
```

必須の環境変数は `.env.local` に置く（最低限 `NEXT_PUBLIC_SUPABASE_URL` と
`NEXT_PUBLIC_SUPABASE_ANON_KEY`）。詳細は下の「環境変数」を参照。
（lint / test スクリプトは未設定。動作確認は dev サーバ or Vercel プレビューで行う）

## ディレクトリ構成

```
okr-dashboard/
├── app/                       # App Router（ページ + APIルート）
│   ├── layout.jsx             # ルートレイアウト（フォント・背景グラデ・メタ）
│   ├── page.jsx               # ルート: セッション確認→既定組織へリダイレクト
│   ├── [orgSlug]/page.jsx     # 組織別ダッシュボード本体（?page=, ?fy= 対応）
│   ├── signin / lp / terms / privacy / tour   # 公開ページ
│   └── api/                   # 46本のサーバールート（route.js）
│       ├── ai/ …              # Claude コーチ・チーム要約
│       ├── integrations/      # google / gmail / drive / calendar / slack / coo
│       │   └── _shared.js     # 連携共通ヘルパー（admin client / token refresh）
│       ├── org/ …             # 組織作成・招待・ロール・公開情報
│       ├── license/ …         # myAI ライセンス検証
│       ├── analytics/ …       # 組織内 / 組織横断の利用分析
│       └── create-next-week/  # 週次コンテナ自動生成（Vercel cron）
├── components/                # 69個の .jsx（全て React コンポーネント）
│   ├── AppRoot.jsx            # SaaS 入口（セッション→組織解決→OrgProvider/LicenseProvider）
│   ├── Dashboard.jsx          # 旧メインシェル（タブ: OKR/年間/週次MTG/組織 等）
│   ├── MyPageShell.jsx        # 個人ワークスペース（My OKR/Tasks/Calendar/Drive/COO…）
│   ├── OrgPage.jsx            # 組織管理（組織ツリー/戦略/メンバー/設定）
│   ├── WeeklyMTGFacilitation.jsx  # 週次MTG進行フロー
│   ├── okr/                   # OKR表示の細粒度コンポーネント群
│   └── meetings/modules/      # 会議モジュール（個人報告/KAレビュー/確認事項 等）
├── lib/                       # 32個のロジック/ユーティリティ
├── scripts/nightly-analysis.mjs   # 毎晩のAIコードレビュー（GitHub Actions）
├── docs/ , *.md               # 設計・引継ぎドキュメント（下記参照）
├── supabase_*.sql             # 61本のスキーマ/マイグレーション SQL
├── next.config.js             # キャッシュ無効化設定
└── vercel.json                # cron 定義
```

### ファイル拡張子の慣習
- React コンポーネント / コンテキスト: **`.jsx`**
- APIルート・フック・ユーティリティ: **`.js`**
- GitHub Actions スクリプトのみ: **`.mjs`**
- TypeScript は使わない。

## lib/ の主要モジュール

| ファイル | 役割 |
|---|---|
| `supabase.js` | ブラウザ用 Supabase クライアント（anon key, RLS 有効） |
| `mgmtSupabase.js` | 別 DB（neo-mg 労務管理）への副クライアント |
| `okrData.js` | **OKR データアクセス層の単一窓口**（objectives/key_results/weekly_reports/ka_tasks）。年度フィルタもここ |
| `orgContext.js` | `useCurrentOrg()` — マルチ組織コンテキスト。組織解決の優先順位: URL slug > localStorage > is_default > 先頭 |
| `apiGuard.js` | サーバ側ガード（Bearer 認証 + DBレート制限）。`/api/ai` 等で使用 |
| `authedFetch.js` | クライアントから保護APIを叩く fetch ラッパー（access_token 自動付与） |
| `featureFlags.js` | `organizations.enabled_modules` (jsonb) + `plan` によるモジュールON/OFF。`useFeatureFlag()` / `FeatureGate` |
| `themeTokens.js` | **デザイントークン中央管理**（色/影/角丸/余白/タイポ） |
| `iosStyles.js` | **スタイルファクトリ関数**（cardStyle / btnPrimary 等） |
| `iosUI.jsx` | iOS 風 UI コンポーネント（SegmentedControl / SheetModal 等） |
| `okrColors.js` | 達成率→ステータス色の単一ソース（未達/要注意/順調/達成） |
| `aiCall.js` | Anthropic Messages API ラッパー（指数バックオフ自動リトライ） |
| `track.js` | 利用ログを `analytics_events` へ fire-and-forget 挿入 |
| `useAutoSave.js` | 800ms デバウンス自動保存フック |
| `useResponsive.js` | ブレークポイント判定（mobile/tablet/desktop） |
| `meetings.js` / `orgMeetings.js` | 会議定義（固定 + DB管理 `organization_meetings`） |
| `notionForOrg.js` | 組織ごとの Notion 設定解決（org DB > env フォールバック） |
| `superAdmin.js` | `SUPER_ADMIN_EMAILS` による運営判定 |
| `demoMocks.js` | `DEMO_MODE` 時のモックデータ（Google連携が無くても動かす） |

## データモデル（Supabase）

主要テーブル（詳細は `supabase_setup.sql` ほか各 `supabase_*.sql` を参照）:

| テーブル | 用途 |
|---|---|
| `organizations` | テナント。`slug` / `plan` / `enabled_modules` / `level_labels` |
| `members` | メンバー（name, role, level_id, email, is_admin, slack_user_id） |
| `organization_members` | ユーザー↔組織の所属とロール（owner/admin/member） |
| `levels` | 組織階層（parent_id, fiscal_year で年度別管理） |
| `objectives` | OKR目標（owner, level_id, period, parent_objective_id） |
| `key_results` | KR（target, current, unit, lower_is_better, objective_id） |
| `weekly_reports` | KA（Good/More/Focus, status, kr_id, week_start） |
| `ka_tasks` | KA配下のタスク（assignee, due_date, done） |
| `milestones` | 年間マイルストーン |
| `user_integrations` | Google等のOAuthトークン（owner+service+organization_id で一意） |
| `analytics_events` | 利用ログ |

### period キーと年度の対応（重要な落とし穴）
- 現行年度 2026: `q1` / `q2` / `q3` / `q4` / `annual`
- 過去年度は `YYYY_` プレフィックス付き: 2025 なら `2025_q1` … `2025_annual`
- 年度フィルタは `okrData.js` に集約されている。直接クエリを書かず `okrData.js` 経由で取得する。

## マルチテナント / 組織コンテキスト

- URL は `/[orgSlug]?page=...&fy=...` 形式。`AppRoot.jsx` がセッション→組織解決→
  `OrgProvider` + `LicenseProvider` でラップする。
- コンポーネント内では `useCurrentOrg()` で現在組織を取得。`currentOrg.id` を
  クエリやAPI呼び出しに渡し、**組織を絶対にまたがない**こと（`_shared.js` の
  `getIntegration` も `organization_id` 必須でこれを担保）。
- 機能のON/OFFは `featureFlags.js`（`enabled_modules`）と `plan` で制御。
  新機能を出すときは既存の `FeatureGate` / `useFeatureFlag()` パターンに合わせる。

## 認証・認可

- Supabase Auth（Google OAuth）。クライアントは `supabase.auth.getSession()` で確認。
- 公開ページ: `/lp` `/signin` `/terms` `/privacy` `/tour`。それ以外は要ログイン。
- 認可レベル: 一般メンバー / 組織 admin・owner / **super admin**（`SUPER_ADMIN_EMAILS`）。
- 保護APIはクライアントから `authedFetch`（access_token 付与）で呼び、
  サーバ側は `apiGuard.js` の `guardAi()` 等で Bearer 検証 + レート制限（`/api/ai` は 30 req/min）。
- APIルートで特権操作をするときは `_shared.js` の `getAdminClient()`（service role）を使う。

## 外部連携

- **Google**: `/api/integrations/google/{start,callback,disconnect}` で OAuth。
  トークンは `user_integrations` に保存し、`_shared.js` が期限切れ自動リフレッシュ + 401再試行。
  Calendar / Drive / Gmail それぞれに取得・AIアシスト用ルートあり。
- **Slack**: 組織ごとの incoming webhook（`org-webhook`）+ ユーザーID同期（`sync-users`）。
- **Notion**: 会議ノート取込（`/api/notion-import`, `/api/notion-meeting`）。
  組織別設定は `notionForOrg.js` が解決。
- **Claude (Anthropic)**: AIコーチ（`/api/ai`）・チーム要約・カレンダー/Drive/Gmail/COO の
  ツール利用アシスト。呼び出しは `aiCall.js` 経由（リトライ込み）。
- **Resend**: 招待メール送信（`sendInviteEmail.js`、env 未設定時はスキップ）。

## 環境変数

`NEXT_PUBLIC_*` はクライアントに露出する。それ以外はサーバ専用（漏らさないこと）。

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase（必須） |
| `SUPABASE_SERVICE_ROLE_KEY` | APIルートの特権操作（サーバのみ） |
| `NEXT_PUBLIC_MGMT_SUPABASE_URL` / `..._ANON_KEY` | 副DB（neo-mg 労務管理） |
| `ANTHROPIC_API_KEY` / `AI_MODEL` / `AI_MODEL_DEMO` | Claude API |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `SLACK_BOT_TOKEN` / `SLACK_WEBHOOK_URL` / `SLACK_WEBHOOK_URL_CONFIRMATIONS` | Slack |
| `NOTION_API_KEY` / `NOTION_*_DB_ID` | Notion 会議DB（種別ごと） |
| `RESEND_API_KEY` / `INVITE_FROM_EMAIL` / `INVITE_BASE_URL` | 招待メール |
| `SUPER_ADMIN_EMAILS` | 運営（組織横断分析など） |
| `CRON_SECRET` | cron / debug エンドポイント保護 |
| `MYAI_VERIFY_URL` / `MYAI_EXPECTED_PRODUCT_ID` | ライセンス検証 |
| `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | デモモード |
| `NEXT_PUBLIC_*_URL`（各会議URL）, `NEO_FUKUOKA_DRIVE_ID` 等 | 個別設定 |

## コミットメッセージの書き方

日本語で具体的に記述する。Conventional Commits 風のプレフィックスを使う。
例:
- `feat: 週次MTGページに会議選択UIを追加`
- `feat(analytics): 組織横断の全体分析ページを追加`
- `fix: OKRドロップダウンがホバーで消える問題を修正`
- `chore: 不要なブランチ削除・CLAUDE.md追加`

## Vercel環境 / デプロイ

| 環境 | ブランチ | URL |
|---|---|---|
| 本番 | `main` | aiworkspace.jp |
| ステージング | `staging` | Vercelが自動発行するプレビューURL |

- `next.config.js` で Router Cache の staleTime を 0、レスポンスを `no-store` に強制している。
  これは「連携前の空レスポンスが固定キャッシュされる」問題への対策。**安易に外さない**。
- `vercel.json`: 毎週木曜 23:00 に `/api/create-next-week`（週次コンテナ生成）を実行。

## CI / 自動コードレビュー

- `.github/workflows/nightly-analysis.yml`: 毎日 22:00 JST（cron `0 13 * * *`）+ 手動実行。
- `scripts/nightly-analysis.mjs` が直近のコミット/変更を Claude に渡し、
  bug / improvement / missing_feature を JSON で受け取り、確信度 0.7 以上を
  GitHub Issue（label: `bot/finding`）として自動起票（重複はタイトル一致でスキップ）。
- 詳細は `scripts/README_nightly.md`。

## 重要な落とし穴・注意点

- **`.single()` / `.maybeSingle()` を信用しない**: 1行存在しても null を返すケースが
  確認済み。配列取得（`.limit(1)`）して自前で `rows[0]` を取る（`_shared.js` 参照）。
- **キャッシュ**: APIルートの fetch は `cache:'no-store'` を徹底（`getAdminClient()` が強制）。
- **組織スコープ**: 連携・データ取得は必ず `organization_id` を渡す。
- **年度 period キー**: 直接 `q1` 決め打ちせず `okrData.js` 経由で年度を解決する。

## 参考ドキュメント（リポジトリ内）

| ファイル | 内容 |
|---|---|
| `README.md` | セットアップ手順・評価基準（★の達成率定義） |
| `HANDOVER.md` | 開発引継ぎ（テーブル構成・設計メモ） |
| `MULTITENANT_GUIDE.md` / `MULTITENANT_PHASE1.md` | マルチテナント設計 |
| `SAAS_STRATEGY.md` | SaaS 化の方針 |
| `INTEGRATIONS_SETUP.md` | Google/Slack/Notion 連携セットアップ |
| `MODULE_MIGRATION_PLAN.md` | 会議モジュール移行計画 |
| `docs/REDESIGN_BRIEF.md` | デザイン刷新ブリーフ |

---

# デザインシステム（必須遵守）

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
