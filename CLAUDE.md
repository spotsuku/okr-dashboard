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
