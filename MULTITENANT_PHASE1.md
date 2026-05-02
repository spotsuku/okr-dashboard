# マルチテナント化 Phase 1: スキーマ拡張

## 概要
組織 (organization) 概念を導入する最初のフェーズ。**破壊的変更なし**でアプリは引き続き動作します。

## 設計判断 (確定済)
- **ユーザー所属モデル**: 1ユーザー = 1組織（複合PKで将来複数所属に拡張可能）
- **組織作成**: オーナーが招待制で作成（Phase 4で実装）
- **URLスキーム**: 既存URL互換、Cookie/Context で組織判定（Phase 2で実装）
- **権限**: Owner / Admin / Member の3段階。既存 `is_admin=true` は `admin` ロールに自動マッピング

## Phase 1 で導入されるもの

### 新規テーブル
- `organizations` — 組織マスタ（slug, name, plan, fiscal_year_default）
- `organization_members` — ユーザー × 組織 × ロール

### 既存テーブルへの追加
全 22 テーブル に `organization_id BIGINT REFERENCES organizations(id)` 列を追加:
- levels, members, objectives, key_results, weekly_reports, ka_tasks
- kr_weekly_reviews, team_weekly_summary, member_confirmations,
  member_confirmation_replies, morning_meetings, weekly_mtg_sessions
- coaching_logs, org_tasks, org_team_meta, org_task_history,
  org_task_manuals, org_member_jd
- milestones, user_integrations, ai_premises, coo_knowledge

### デフォルト組織の自動作成と backfill
- `organizations` に `slug='neo-fukuoka', name='NEO福岡'` を1件 INSERT
- 全既存メンバーを NEO福岡 org に所属させる（`is_admin=true` は admin、それ以外は member）
- 全テーブルの既存行に `organization_id = NEO福岡.id` を backfill

### INSERT トリガ
全データテーブルに「`organization_id` が NULL なら NEO福岡 を自動付与する」BEFORE INSERT トリガを設置。
これにより Phase 1 完了時点では:
- アプリ側コードは `organization_id` を一切意識しない
- 新規 INSERT も自動で NEO福岡 に紐付く
- 既存ユーザーの体験は完全に同じ

## 実行手順

### 1. staging で実行 (本番のミラーバックアップ)

```sh
# Supabase staging Dashboard → SQL Editor
# supabase_multitenant_phase1.sql の中身を貼り付けて Run
```

### 2. 検証クエリ

```sql
-- 組織が1件あるか
SELECT * FROM organizations;
-- 期待値: id=1, slug='neo-fukuoka', name='NEO福岡'

-- 全メンバーが org に紐付いているか
SELECT count(*) AS total FROM members;
SELECT count(*) AS in_org FROM organization_members;
-- total と in_org が一致すれば OK

-- backfill 漏れがないか (各テーブル null_count=0 が正常)
SELECT 'levels'                AS tbl, count(*) FILTER (WHERE organization_id IS NULL) AS null_count, count(*) AS total FROM levels
UNION ALL SELECT 'members',                count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM members
UNION ALL SELECT 'objectives',             count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM objectives
UNION ALL SELECT 'key_results',            count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM key_results
UNION ALL SELECT 'weekly_reports',         count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM weekly_reports
UNION ALL SELECT 'ka_tasks',               count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM ka_tasks
UNION ALL SELECT 'kr_weekly_reviews',      count(*) FILTER (WHERE organization_id IS NULL), count(*) FROM kr_weekly_reviews;
-- ... 他テーブルも同様
```

### 3. アプリ動作確認 (staging Vercel preview)
- 組織図、OKR、KR/KA、朝会、週次MTG、確認・共有、組織責任者、AIサマリー など全機能の動作確認
- **既存挙動から変化が無いこと**を確認（org_id を意識した変更はまだ無いはず）

### 4. 本番に適用
- 上記 staging 確認後、本番 Supabase で同じ SQL を実行
- 同じ検証クエリを実行

## ロールバック
SQL ファイル末尾の `<ROLLBACK>` セクションに DOWN マイグレーションを記載。
データ消失はありません（追加した列とトリガを削除するだけ）。

## 次のフェーズ予告

### Phase 2: クエリ層の組織対応 (3-5日)
- `OrgContext` を新設、現在の組織IDを保持
- 全 supabase クエリに `organization_id` フィルタを追加
- RLS ポリシーを「自分の所属org のみアクセス可」に強化
- 既存の `member.is_admin` を `organization_members.role` に統合

### Phase 3: 組織切替UI + デモ組織 (2-3日)
- ヘッダに組織切替 dropdown
- `Demo Inc.` org をシードしてダミーデータ投入
- DEMO_MODE で公開URL対応 + Google系モック
