# OKR ダッシュボード

社内OKR管理ツール。Next.js + Supabase で構築。

## セットアップ手順

### 1. Supabase の設定
1. `supabase_setup.sql` の内容を Supabase の **SQL Editor** に貼り付けて実行
2. `Settings > API` から URL と anon key をコピー

### 2. 環境変数の設定
`.env.local.example` をコピーして `.env.local` を作成：
```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. ローカル起動
```bash
npm install
npm run dev
```
→ http://localhost:3000 で確認

### 4. Vercel にデプロイ
1. GitHub にプッシュ
2. vercel.com で「New Project」→ リポジトリを選択
3. Environment Variables に上記2つを入力
4. Deploy！

## 評価基準
| 星 | ラベル | 達成率 |
|---|---|---|
| ★5 | 奇跡 | 150%以上 |
| ★4 | 変革 | 120%以上 |
| ★3 | 順調以上 | 100%以上 |
| ★2 | 順調 | 80%以上 |
| ★1 | 最低限 | 60%以上 |
| ★0 | 未達 | 60%未満 |
