# モジュール化 実装計画 (Phase C)

最終更新: 2026-05-14

このドキュメントは `SAAS_STRATEGY.md` のモジュール構造を **実装に落とすためのマッピング表と実装手順** をまとめたものです。Phase C (2〜3 週間) の作業項目です。

---

## 1. データモデル

`supabase_organization_modules.sql` を適用する。主な追加カラム:

| カラム | 型 | 用途 |
|---|---|---|
| `organizations.plan` | text | `free_trial` / `standard` / `standard_plus` / `enterprise` |
| `organizations.enabled_modules` | jsonb | モジュールキー → boolean のマップ |
| `organizations.level_labels` | jsonb | 層ラベルの汎用化 (`l1`/`l2`/`l3` → 表示名) |

### モジュールキー一覧

| キー | 内容 | プラン | 既定 ON 組織 |
|---|---|---|---|
| `google_integration` | Gmail / Calendar / Drive | Standard | neo-fukuoka |
| `ai_chat` | AIPanel (Claude 相談) | Standard | neo-fukuoka |
| `meeting_integration` | Notion 議事録 / Slack 通知 | Standard | neo-fukuoka |
| `okr_full` | 組織階層 / 親子 OKR / 全社サマリー | Add-on | neo-fukuoka |
| `milestones` | プロジェクト管理 | Add-on | neo-fukuoka |
| `coo_knowledge` | CFO ナレッジベース | Add-on (将来) / 当面 neo-fukuoka 専用 | neo-fukuoka |
| `workforce` | 工数管理 (6 ロール固定) | neo-fukuoka 専用 | neo-fukuoka |
| `portal_neo` | PortalPage (外部リンク集) | neo-fukuoka 専用 | neo-fukuoka |

未定義キーは false 扱い。

---

## 2. featureFlag インフラ

新規ファイル: `lib/featureFlags.js`

```js
// 現在組織のモジュール ON/OFF を取得 (React hook)
export function useFeatureFlag(moduleKey) {
  const { org } = useCurrentOrg();
  return !!org?.enabled_modules?.[moduleKey];
}

// 複数キーを一括取得 (パフォーマンス)
export function useFeatureFlags() {
  const { org } = useCurrentOrg();
  return org?.enabled_modules || {};
}

// プラン判定
export function usePlan() {
  const { org } = useCurrentOrg();
  return org?.plan || 'free_trial';
}

// JSX ラッパー
export function FeatureGate({ flag, children, fallback = null }) {
  const enabled = useFeatureFlag(flag);
  return enabled ? children : fallback;
}

// サーバーサイド (API ルート) 用
export async function isModuleEnabled(supabase, orgId, moduleKey) {
  const { data } = await supabase
    .from('organizations')
    .select('enabled_modules')
    .eq('id', orgId)
    .single();
  return !!data?.enabled_modules?.[moduleKey];
}
```

`useCurrentOrg` は既存の組織コンテキストフックを利用 (新規実装不要)。

---

## 3. UI 制御マッピング表

各モジュールがどの UI / API を制御するか。実装時はこの表に沿って `<FeatureGate flag="...">` で包む。

### 3.1 `google_integration`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `components/IntegrationsPanel.jsx` の Google 連携セクション | `<FeatureGate flag="google_integration">` で包む |
| UI | `components/CalendarTab.jsx` 全体 | 親側のタブメニューから「カレンダー」項目を flag で非表示 |
| UI | `components/DriveTab.jsx` 全体 | 同上「ドライブ」非表示 |
| UI | Gmail タブ (該当コンポーネント) | 同上「メール」非表示 |
| UI | `MyPageShell.jsx` のサイドバータブ定義 (行 276 周辺) | タブ配列を flag でフィルタ |
| API | `app/api/integrations/google/*` | サーバー側で `isModuleEnabled` チェック、無効なら 403 |
| API | `app/api/integrations/gmail/*` | 同上 |
| API | `app/api/integrations/calendar/*` | 同上 |
| API | `app/api/integrations/drive/*` | 同上 |

### 3.2 `ai_chat`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `components/AIPanel.jsx` のトリガーボタン | 親コンポーネントで flag を見てボタン自体を非表示 |
| UI | `MyCoachPage.jsx` | ページ自体を flag で非表示 (ルート判定) |
| API | `app/api/ai/route.js` | サーバー側 flag チェック |
| API | `app/api/ai-feedback/route.js` | 同上 |
| API | `app/api/integrations/gmail/ai-draft/route.js` | 同上 |
| API | `app/api/integrations/calendar/ai/route.js` | 同上 |
| API | `app/api/integrations/drive/ai/route.js` | 同上 |

### 3.3 `meeting_integration`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `IntegrationsPanel.jsx` の Notion / Slack 設定セクション | `<FeatureGate>` で包む |
| UI | `MorningMeetingPage.jsx` の Notion インポート / Slack 通知ボタン | flag で非表示 |
| UI | `WeeklyMTGPage.jsx`, `WeeklyMTGFacilitation.jsx` の同類ボタン | 同上 |
| UI | `MeetingImport.jsx` 全体 | 同上 |
| API | `app/api/notion-import/route.js`, `notion-meeting/route.js` | サーバー側 flag |
| API | `app/api/integrations/slack/*` | 同上 |
| API | `app/api/integrations/confirmations/notify/route.js` | 同上 |

朝会・週次 MTG **本体はコア** なので動く。Notion 連携と Slack 通知だけ消える。

### 3.4 `okr_full`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `components/AnnualView.jsx` | ページ自体 flag、非表示時は MyOKRPage にリダイレクト |
| UI | `components/OwnerOKRView.jsx` | 同上 |
| UI | `components/CompanySummaryPage.jsx` | flag で非表示 (`/summary` ルート) |
| UI | `components/Dashboard.jsx` | 全社ダッシュボード、flag で非表示 |
| UI | `MyOKRPage.jsx` の親子 OKR セクション | `parent_objective_id` / `parent_kr_id` を表示する部分のみ flag |
| UI | `MyPageShell.jsx` ナビ「OKR」「全社サマリー」「ダッシュボード」 | flag でナビ項目フィルタ |
| API | `app/api/ai/team-summary/route.js` | サーバー側 flag |
| 機能 | `levels` テーブル (組織階層) の編集 UI | flag で隠す |

→ `okr_full=false` でも `MyOKRPage` (個人 OKR ライト) は使える。

### 3.5 `milestones`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `components/MilestonePage.jsx` | `/milestone` ルート flag |
| UI | ナビ「マイルストーン」 | flag でナビ項目フィルタ |

### 3.6 `coo_knowledge`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `components/COOTab.jsx` 全体 | flag で非表示 |
| UI | サイドバー / ナビの「MyCOO」項目 | flag でナビ項目フィルタ |
| API | `app/api/coo/knowledge/*` | サーバー側 flag |
| API | `app/api/integrations/coo/ai/route.js` | 同上 |

### 3.7 `workforce`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `components/WorkforceTab.jsx` 全体 | flag で非表示 |
| UI | サイドバー / ナビの「工数」項目 | flag でナビ項目フィルタ |

### 3.8 `portal_neo`

| 種別 | 対象 | 制御方法 |
|---|---|---|
| UI | `components/PortalPage.jsx` 全体 | flag で非表示 (`/portal` ルートで `notFound()`) |
| UI | ナビ「ポータル」 | flag でナビ項目フィルタ |

`PortalPage.jsx` 行 11-18 のハードコードされた `orgSlugs: ['neo-fukuoka']` チェックは削除し、flag に置き換える。

---

## 4. 自社固有テキストの neo-fukuoka 専用化

UI 制御とは別に、AI prompt 等のテキストに NEO 福岡の社名が混ざっている箇所がある。これは `license_grandfathered` または `portal_neo` flag で条件分岐する。

| 場所 | 内容 | 対応 |
|---|---|---|
| `app/api/ai/route.js` 行 26-45 | 自社紹介文 / Humano Robotics デモ文脈 | `is_module_enabled(orgId, 'portal_neo')` で条件分岐、汎用版を別途用意 |
| `components/DriveTab.jsx` 行 159 | Drive デフォルトフォルダ名「ネオ福岡」 | `organizations.drive_root_folder_name` カラム追加 (将来) / 当面 flag |
| `supabase_setup.sql` 行 184-186 | 初期部門 (プロダクト / エンジニアリング / セールス) | 既に neo-fukuoka 限定の挿入のはず、念のため確認 |

---

## 5. ハードコード汎用化 (Phase B と一部重複)

`SAAS_STRATEGY.md` の 4.4 / 4.5 で扱う「層ラベル」「工数ロール」等は Phase B の作業範囲。`organizations.level_labels` JSON で対応する例:

```js
// 旧
const labels = ['経営', '事業部', 'チーム']

// 新
const labels = [org.level_labels?.l1 ?? '経営', org.level_labels?.l2 ?? '事業部', org.level_labels?.l3 ?? 'チーム']
```

該当ファイル例: `components/Dashboard.jsx` (行 117), `BulkRegisterPage.jsx` 等。

---

## 6. 実装手順 (推奨順)

### Step C-1: 基盤 (2 日)
1. `supabase_organization_modules.sql` を staging 適用
2. `lib/featureFlags.js` 実装
3. `MyPageShell.jsx` のサイドバータブ定義を flag フィルタに対応
4. neo-fukuoka でログインして既存通り全機能が見えることを確認

### Step C-2: Standard モジュール (3 日)
1. `google_integration` を組み込み (Gmail / Calendar / Drive)
2. `ai_chat` を組み込み (AIPanel / MyCoachPage)
3. `meeting_integration` を組み込み (Notion / Slack)
4. API ルート側にもサーバー flag チェック追加

### Step C-3: Add-on モジュール (3 日)
1. `okr_full` を組み込み (AnnualView / CompanySummaryPage / 親子 UI)
2. `milestones` を組み込み (MilestonePage)
3. `MyOKRPage` の OKR ライト動作を全 OFF 環境で確認

### Step C-4: neo-fukuoka 専用 (2 日)
1. `coo_knowledge` (COOTab)
2. `workforce` (WorkforceTab)
3. `portal_neo` (PortalPage)
4. AI prompt の自社紹介文を flag 分岐

### Step C-5: 検証 (3 日)
1. 「全モジュール OFF」テナントを作成 (`plan = 'free_trial'`)
2. コア機能だけで朝会・タスク管理・始業強制・振り返り強制が動くことを確認
3. neo-fukuoka 環境がリグレッションなしで動くことを確認
4. `okr_full` だけ ON にした「中間プラン」テナントで OKR + タスク管理が動くことを確認

合計 **13 日 ≒ 2.5 週間**

---

## 7. 削除対象 (Phase B と同時に処理)

以下は flag 化ではなく **完全削除**:

- `pages/csv` または `app/csv/` (CsvPage.jsx)
- `pages/bulk` または `app/bulk/` (BulkRegisterPage.jsx)
- `app/api/csv-analyze/route.js`
- `app/api/fix-orphan-okr/route.js`
- `app/api/restore-ka-carryover/route.js`
- `supabase_demo_humano_*.sql` 系
- `app/api/admin-users/route.js` (テスト用)

---

## 8. 差別化機能の新規実装 (Phase 1、モジュール化と並行可)

`SAAS_STRATEGY.md` セクション 9 で確定した実装項目。モジュール化が終わってからではなく **並行で進められる**。

| 機能 | 実装場所 | 詳細 |
|---|---|---|
| 粒度警告 | `MyTasksPage.jsx` の `save` 関数 (行 214 周辺), `MyPageShell.jsx` の今日やる追加モーダル (行 1716 周辺) | タスク title / due_date / estimated_minutes (新規カラム?) から「3 時間以上 = 警告」「30 分未満 = 分割推奨」 |
| 曖昧動詞検出 | 同上 | title 中の「検討する / 確認する / 進める / 対応する / やる」を正規表現で検出、警告 or 書き直しモーダル |
| AI 「今日やる」提案 5 件 | `MyPageShell.jsx` の始業モーダル (行 1605 周辺) | 既存 AI Panel ロジックを流用、優先度スコア (期限 / OKR 紐付け / 所要時間 / ブロッカー / 繰越) で 5 件選出 + 理由併記 |

---

## 9. 関連ファイル

| 関心事 | ファイル |
|---|---|
| 戦略全体 | `SAAS_STRATEGY.md` |
| マイグレーション SQL | `supabase_organization_modules.sql` |
| ライセンス基盤 (前提) | `supabase_organization_licenses.sql` (PR #120) |
| feature flag 実装先 | `lib/featureFlags.js` (新規) |

---

## 改訂履歴

- v1 (2026-05-14): 初版。Phase C の実装計画。
