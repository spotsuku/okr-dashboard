# マルチテナント化 完全ガイド

## 全体像

```
[本番]                     [staging (本番ミラー)]            [demo (公開デモ)]
┌─────────────────┐        ┌─────────────────┐              ┌─────────────────┐
│ Supabase 本番   │        │ Supabase staging │              │ 同じ DB を流用   │
│ org=neo-fukuoka │        │ org=neo-fukuoka  │              │ org=demo (新規)  │
└─────────────────┘        └─────────────────┘              └─────────────────┘
        ↑                          ↑                                ↑
   Vercel main              Vercel staging                   Vercel demo
   認証必須                 認証必須                         DEMO_MODE=true
                                                            ゲスト自動ログイン
```

`organizations` テーブルで複数組織が共存。RLS で自動的に「自分の所属org のみ」が見える。

## SQL マイグレーション (3ファイル順番に実行)

### Phase 1 — `supabase_multitenant_phase1.sql`
- `organizations`, `organization_members` テーブル作成
- 全 22 テーブルに `organization_id` 列追加
- 既存データを「NEO福岡」org に backfill
- INSERT トリガで未指定時に NEO福岡 を自動付与

### Phase 2 — `supabase_multitenant_phase2.sql`
- `current_org_ids()` 関数: JWT email から所属org解決
- 全テーブルの RLS を `org-scoped` に強化
- INSERT トリガを更新: 現在ユーザーの org を自動付与
- `my_orgs` ビュー追加

### Phase 3 — `supabase_multitenant_phase3_demo_seed.sql`
- `Sample Inc.` (slug='demo') 組織を作成
- 仮想15メンバー (`👀 ゲスト` を含む) を投入
- 4事業部 × 8チーム の組織階層
- ダミー OKR / KR (各部署2-3件)
- 責任者 (manager_id) を割当

## Supabase Auth 側の準備

Supabase Dashboard → Authentication → Users で以下を作成:
- email: `guest@demo.local`
- password: 任意の文字列 (これを後ほど `NEXT_PUBLIC_DEMO_GUEST_PASSWORD` に設定)
- メール確認: スキップ (Confirm User)

このゲストの email は `members` テーブルにも `guest@demo.local` で登録されているため、ログイン後 Demo org にRLS 経由でアクセスできる。

## Vercel 環境変数

### 既存 (本番 / staging) — 変更不要

### 新規 (demo Vercel project) — 追加が必要

```
NEXT_PUBLIC_SUPABASE_URL          = (既存と同じ Supabase)
NEXT_PUBLIC_SUPABASE_ANON_KEY     = (既存と同じ)
SUPABASE_SERVICE_ROLE_KEY         = (既存と同じ)
NEXT_PUBLIC_DEMO_MODE             = true
NEXT_PUBLIC_DEMO_GUEST_EMAIL      = guest@demo.local
NEXT_PUBLIC_DEMO_GUEST_PASSWORD   = <Supabase Auth で設定したゲストPW>
```

Google / Slack / LINE の env vars は demo では不要 (モック化)。

## デモ用 Vercel プロジェクト作成手順

1. Vercel Dashboard → New Project
2. Import from GitHub: 同リポジトリ (spotsuku/okr-dashboard)
3. Project Name: `okr-demo`
4. Production Branch: `main` (または `staging` どちらでも)
5. 上記の環境変数を設定
6. Deploy
7. URL: `okr-demo.vercel.app` (任意のカスタムドメインも設定可)

## 機能

### 通常ユーザー
- ログイン後、自動的に自分の所属組織を解決 (`OrgProvider`)
- ヘッダ右上に組織切替ドロップダウン (複数所属時)
- ⚙️ 設定ボタンから組織管理パネル

### 管理者 (owner / admin)
- 組織管理パネルで:
  - メンバー一覧表示
  - 招待 (email + name + role)
  - ロール変更 (owner / admin / member)
  - メンバー削除

### ゲスト (デモモード)
- ログイン画面なし、自動で `guest@demo.local` セッション
- Demo Inc. 組織のデータを自由に編集
- 上部に 🎭 デモモードバナー
- Google系 (Gmail/Calendar/Drive) はモックデータ
- Slack 通知は ok=true で no-op

## API ルート

### 既存
- `/api/ai/*` — 影響なし
- `/api/integrations/*` — DEMO_MODE 時にモック応答
  - `gmail/threads`, `calendar/multi-events`, `drive/list`, `drive/search`
  - `confirmations/notify`

### 新規
- `POST /api/org/invite` — 組織への招待 (admin/owner のみ)
- `PATCH /api/org/role` — メンバーのロール変更
- `DELETE /api/org/role` — メンバー削除

## ロールバック

各 SQL ファイル末尾に `<ROLLBACK>` セクション。
コード側は `NEXT_PUBLIC_DEMO_MODE` を未設定にすれば従来動作に戻る。

## 検証チェックリスト

### Phase 1 後
- [ ] `SELECT * FROM organizations;` → NEO福岡 1件
- [ ] 全テーブルで `organization_id IS NULL` の行が0
- [ ] アプリにログインして全機能が従来通り動作

### Phase 2 後
- [ ] 同じ確認に加え、`SELECT * FROM my_orgs;` でログインユーザーが NEO福岡 を見える
- [ ] アプリ動作変化なし (NEO員員から見ると同じ)

### Phase 3 後
- [ ] `SELECT slug, name FROM organizations;` → neo-fukuoka, demo の2件
- [ ] Supabase Auth に guest@demo.local 登録
- [ ] DEMO_MODE Vercel から開いて自動ログイン → Sample Inc. 組織が見える
- [ ] 編集してリロード → 編集が永続化される
- [ ] Google系のタブでモックデータが表示される

## 既知の制約

1. **Google OAuth** は visitor が自分のアカウントで連携できない (デモではモック表示のみ)
2. **デモデータの汚染**: visitor が好き放題編集できるため、定期リセット推奨 (週1で `supabase_multitenant_phase3_demo_seed.sql` の `<RESET>` セクション → 再シード)
3. **ロール owner/admin の重複定義**: 当面は `members.is_admin` と `organization_members.role` の両方を見る (Phase 5 で is_admin 廃止予定)
