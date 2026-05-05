# Nightly Analysis (毎日22時の自動コードレビュー)

毎日 22:00 JST に GitHub Actions が走り、Claude API でコードを解析して **GitHub Issue を自動作成**します。

## 仕組み

1. cron `0 13 * * *` (= 22:00 JST) に発火 (手動実行も可: Actions タブ → Run workflow)
2. `scripts/nightly-analysis.mjs` が実行される
3. 直近 14 日のコミット履歴 / ファイル変更頻度 / 構造を Claude に渡す
4. Claude は **bug / improvement / missing_feature** を JSON で返す
5. **確信度 0.7 以上** (デフォルト) のものだけを Issue 化
6. 既存の open Issue とタイトル一致するものはスキップ (重複防止)

## 必要な GitHub 設定

### Secrets
リポジトリの **Settings → Secrets and variables → Actions → Secrets** に追加:

- `ANTHROPIC_API_KEY` — Anthropic Console で取得
  - **重要**: 専用キーを発行し、月次予算 (例: $50) を設定推奨

### Variables (任意)
**Settings → Secrets and variables → Actions → Variables** に追加 (省略時はデフォルト):

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AI_MODEL` | `claude-sonnet-4-5` | コスト抑えるなら `claude-haiku-4-5-20251001` |
| `MIN_CONFIDENCE` | `0.7` | 0.0〜1.0。低くすると Issue が増える |

## 運用フロー

```
22:00 JST
   ↓
GitHub Actions が解析 → Issue を生成 (label: bot/finding)
   ↓
あなたが朝に Issue を確認
   ↓ (やる)              ↓ (やらない)
'approved' ラベル付与    そのまま放置 or close
   ↓
人間 or Claude Code で実装 → staging push → main マージ
```

## ラベル規則

| ラベル | 意味 |
|---|---|
| `bot/finding` | このスクリプトが自動生成した Issue (全件) |
| `bug` | バグ候補 |
| `enhancement` | 改善提案 / 新機能提案 |
| `priority/high` | severity=high のとき自動付与 |
| `approved` | (人手) 採用決定 → 実装フェーズへ |

## コスト目安

- Sonnet 4.5: 1 回の解析で $0.05〜0.20 程度 (入力 ~5000 token + 出力 ~2000 token)
- 月 30 回 = **約 $1.5〜6** (200〜900 円)
- Haiku 4.5 に切替で 1/10 程度

## 動作確認

1. Secrets 設定後、Actions タブで `Nightly Analysis (Claude AI)` を選択
2. **Run workflow** ボタンで手動実行
3. 完了後、Issues タブで `bot/finding` ラベルを確認

## 落とし穴

- **`ANTHROPIC_API_KEY` 未設定**: workflow が `process.exit(1)` で失敗。Secrets 確認。
- **Issue が 0 件**: confidence 全て 0.7 未満の可能性。`MIN_CONFIDENCE=0.5` に下げて様子見。
- **同じ Issue が毎日量産される**: タイトル一致で重複防止しているが、Claude が微妙に違うタイトルを生成すると別判定になる。気になるなら open Issue を closed にせず残す運用に。

## トラブルシュート

```bash
# ローカルで動作確認 (手動 cron テスト)
ANTHROPIC_API_KEY=sk-ant-... \
GITHUB_TOKEN=ghp_... \
GITHUB_REPOSITORY=spotsuku/okr-dashboard \
node scripts/nightly-analysis.mjs
```
