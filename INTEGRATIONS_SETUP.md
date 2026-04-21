# 外部サービス連携セットアップガイド

このドキュメントは、OKR Dashboard の「🔌 連携」タブから Gmail / Google Calendar / Slack / LINE を利用できるようにするための管理者向け設定手順です。

## 前提

- `supabase_user_integrations.sql` を Supabase SQL Editor で実行済みであること
- `supabase_user_integrations_rls_tighten.sql` を続けて実行すること (RLS強化 + 公開ビュー作成)
- Vercel にデプロイ済みであること
- Supabase の `SUPABASE_SERVICE_ROLE_KEY` が Vercel 環境変数に設定済み

## 必須 Vercel 環境変数 (一覧)

| 環境変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバーサイドでトークン保存・参照 |
| `GOOGLE_CLIENT_ID` | Google トークン自動リフレッシュ用 (Supabaseに登録したものと同じ) |
| `GOOGLE_CLIENT_SECRET` | 同上 |
| `SLACK_CLIENT_ID` | Slack OAuth |
| `SLACK_CLIENT_SECRET` | 同上 |
| `LINE_CHANNEL_ID` | LINE OAuth + リフレッシュ |
| `LINE_CHANNEL_SECRET` | 同上 |

---

## 1. Google (Gmail + Calendar) の設定

### 1-1. Google Cloud Console で API 有効化

1. https://console.cloud.google.com/ にアクセス
2. プロジェクトを作成（既存があればそれを選択）
3. **APIとサービス → ライブラリ** で以下を検索して **有効化**:
   - Gmail API
   - Google Calendar API

### 1-2. OAuth 同意画面

1. **APIとサービス → OAuth同意画面**
2. ユーザータイプ: 「内部」推奨（社内のみ）
3. スコープ追加:
   - `.../auth/gmail.readonly`
   - `.../auth/calendar.readonly`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
4. テストユーザー追加（テスト中の場合）

### 1-3. Supabase の Google Provider に scope を追加

Supabase Dashboard → **Authentication → Providers → Google** を開き:

- **Authorized Client IDs**: Google Cloud Console で発行した OAuth Client ID
- **Client Secret**: 同上
- **Additional Scopes**: 空のままでOK（アプリ側で動的に要求するため）

### 1-4. 連携する

- ユーザーがマイページの「🔌 連携」タブで「Gmail と連携」または「Google Calendar と連携」をクリック
- Google 同意画面が表示され、Gmail / Calendar のスコープが要求される
- 承認すると自動的に `user_integrations` テーブルに保存される

**注意**: 既にログイン済みの場合も再認証が走ります。スコープ追加のためです。

---

## 2. Slack の設定

### 2-1. Slack App 作成

1. https://api.slack.com/apps → **Create New App → From scratch**
2. App Name: `NEO Dashboard` (任意)
3. Workspace を選択

### 2-2. OAuth & Permissions を設定

App の **OAuth & Permissions** ページで:

**Redirect URLs** に以下を追加:
```
https://okr-dashboard-taupe.vercel.app/api/integrations/slack/callback
https://<staging-preview-url>/api/integrations/slack/callback
```

**User Token Scopes** (自分の未読を見るため) に以下を追加:
- `channels:read`
- `channels:history`
- `groups:read`
- `im:read`
- `im:history`
- `users:read`
- `users:read.email`

### 2-3. Client ID / Secret を Vercel に設定

Slack App の **Basic Information → App Credentials** から取得:

Vercel → Settings → Environment Variables:
```
SLACK_CLIENT_ID = <Client ID>
SLACK_CLIENT_SECRET = <Client Secret>
```

環境は Production / Preview 両方にチェック。

### 2-4. 連携する

マイページ「🔌 連携」タブ → 「Slack と連携」クリック → Slack 認可画面 → 完了

---

## 3. LINE の設定

### 3-1. LINE Developers Console で Channel 作成

1. https://developers.line.biz/console/ にアクセス
2. プロバイダーを作成（なければ）
3. **新規チャネル作成 → LINEログイン**
4. Channel name, description を入力

### 3-2. Callback URL を設定

Channel の **LINE Login設定** で:

**Callback URL** に追加:
```
https://okr-dashboard-taupe.vercel.app/api/integrations/line/callback
https://<staging-preview-url>/api/integrations/line/callback
```

**OpenID Connect** を有効化（メール取得に必要）

### 3-3. Channel ID / Secret を Vercel に設定

Channel の **Basic Settings** から取得:

Vercel → Settings → Environment Variables:
```
LINE_CHANNEL_ID = <Channel ID>
LINE_CHANNEL_SECRET = <Channel Secret>
```

### 3-4. 連携する

マイページ「🔌 連携」タブ → 「LINE と連携」クリック → LINE 認可画面 → 完了

---

## トラブルシューティング

### 「SLACK_CLIENT_ID が未設定です」エラー
→ Vercel の Environment Variables を確認。設定後は Redeploy が必要。

### Google 連携後に「トークンが取得できませんでした」
→ Supabase Auth の Google Provider の Scope 設定を確認。`access_type=offline` を強制するために `prompt: 'consent'` を渡しているので、通常は問題なし。

### Slack 連携は成功するが期限切れ表示
→ Slack の User Token は本来期限が長い。expires_at が null なら「期限切れ」表示されないはず。

### LINE の profile 取得失敗
→ Channel 設定で OpenID Connect を有効化しているか確認。

---

## 連携解除

ユーザーは「🔌 連携」タブでいつでも「連携解除」ボタンを押して自分の連携を削除できます。削除時はトークンを `user_integrations` から完全に除去します。

## セキュリティ

- OAuth トークンは `user_integrations` テーブルに保存（RLS有効）
- サービス ロール キー（サーバー側のみ）を使って保存・読み出し
- **RLS**: `supabase_user_integrations_rls_tighten.sql` 適用後は本人の行のみ操作可
  (owner = 認証ユーザーの members.name のみ許可)
- 他メンバーの「連携状態 (接続/非接続)」のみ `user_integrations_status` ビュー経由で閲覧可
  (トークン本体は含まない)

## トークン自動リフレッシュ

- `getIntegration()` (app/api/integrations/_shared.js) が API 呼び出しのたびに
  expires_at をチェックし、期限 60 秒以内なら自動リフレッシュします
- **Google**: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` を使って
  `https://oauth2.googleapis.com/token` にリフレッシュトークンで再取得
- **LINE**: `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` を使って
  `https://api.line.me/oauth2/v2.1/token` で再取得
- **Slack**: user_token は既定で無期限のためリフレッシュ不要
- リフレッシュ失敗時は API が 401 で失敗理由を返す → 再連携促す

