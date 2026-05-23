# Handoff: 週次MTGページ（統一トンマナ）

## Overview

「週次MTG」タブのリデザイン。本番の **7 状態**（会議選択 → 会議準備 → KA順送り → 共有事項 → 確認事項 → ネクストアクション → 会議終了）を Glass トンマナで統一する。

ロジック・DOM 構造・state 管理は変更しない。見た目（色・余白・タイポ・アイコン・装飾）のみを `lib/themeTokens.js` + `lib/iosStyles.js` 経由に寄せる。

## About the Design Files

`週次MTG.html` は単一 HTML のデザインリファレンス。CSS は `:root` の変数で `T.*` 相当を表現。本番では必ずトークン経由で参照する（hex 直書き禁止）。

## Fidelity

**High-fidelity**。色・余白・状態遷移・キーボード操作まで指定済み。

---

## 1. 基準トンマナ

- **背景**: 静かな Glass（オーロラ 3 色は禁止）
- **カード**: 半透明白 + backdrop-blur + 1px T.border + RADIUS.lg
- **ブランドグラデ**: 「会議をはじめる」「Notion を開く」「新規作成」「会議を終了」など主要 CTA のみ
- **絵文字全廃**: 🚀 / 📋 / 📢 / 📬 / 🎉 / ✅ など全部 Icon.jsx の単色ライン SVG

---

## 2. State 一覧（7 状態）

| # | 状態 | 主な要素 |
|---|---|---|
| 1 | 会議選択 | 9 種類の会議カード（picker grid 4 列）。各カード = ブランドグラデアイコンタイル + 両方/チームサマリー scope ピル + 曜日 + 「会議を開始 →」 |
| 2 | 会議準備 | コンテキストバー（会議名/担当/状態凡例）+ ヒーロー（ブランドブルー）+ モードピル + Notion CTA + 会議の流れ + 今回確認する KA（チームチェックボックス） |
| 3 | KA順送り | 時間超過アラート（danger）+ ステップナビ（active = brand-cta）+ 進捗バー + KA レビューカード（Good / More / Focus 3 列入力） |
| 4 | 共有事項 | section banner（accent 左 4px なし → 通常カード）+ 共有事項一覧 + 「新規作成」CTA |
| 5 | 確認事項 | （同上、warn 寄り） |
| 6 | ネクストアクション | 警告 section banner（warn）+ NA テーブル + 「アクションを追加」「Notion から取り込み」 |
| 7 | 会議終了 | ブランドグラデのスパークルタイル + サマリーカード（ファシリ / 開始 / 終了 / 所要）+ 「もう一度開始」「一覧モードで詳細確認」 |

---

## 3. 会議カード（picker） [厳守]

```
display: grid / grid-template-columns: repeat(4, 1fr) / gap: 14

各カード:
  background: T.bgCard + backdrop-blur 20
  border: 1px solid T.border
  border-radius: RADIUS.lg
  padding: 16
  cursor: pointer
  hover: translateY(-2px) + shadow

scope ピル (右上 absolute):
  両方: bg accent-bg / fg accent-text
  チームサマリー: bg success-bg / fg success
  部署: bg purple-bg / fg purple

アイコンタイル 38×38:
  各会議のブランドグラデ（会議の性質で色を決める。チームの色とは別軸）

「会議を開始 →」リンク (左下):
  font-size: 12 / weight: 600
  通常: T.accentText
  warn (これから着手): T.warn
```

---

## 4. ヒーロー（会議準備） [厳守]

```
background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #22d3ee 100%)
border-radius: RADIUS.2xl (22)
padding: 24 28
color: #fff
shadow: 0 10px 30px rgba(37,99,235,.22)

装飾:
  右上 radial 白丸グロー
  左下 radial 緑丸グロー

要素:
  [アイコンタイル 54×54 半透明ガラス]
  [text]
    曜日ピル "月曜" (rgba(255,255,255,.15) + 1px 白半透明)
    h2 "週次キックオフ（パートナー事業部）" (24 / 700 / -0.015em)
    対象週ピル "対象週: 5/18 〜 24"
```

---

## 5. KA レビューカード（中核機能） [厳守]

```
コンテナ:
  T.bgCard + backdrop-blur 20 + 1px T.border + RADIUS.lg

ヘッダバー:
  パンくず: 通期 · KR: 参加者継続率90%以上
  右側: その週に更新が不要なら「スキップ」して下さい

タイトル行:
  ステータスピル (none/good/more/focus) + KA タイトル

オーナー行:
  完了ピル (success) + Avatar + 名前

3 列入力 (gmf):
  display: grid / 3 columns / no gap / borders for separation
  各セル:
    ヘッダ: ●ドット + ラベル (Good / More / Focus 各色) + 期間サブ
    textarea:
      min-height: 72
      bg: rgba(255,255,255,.7)
      border: 1px T.border
      radius: 7
      placeholder italic (例: "良かったこと・続けたいこと")
```

---

## 6. ステップナビ [厳守]

水平 5 ステップ（KA順送り / 共有 / 確認 / NA / 終了）。

```
コンテナ: T.bgCard + 1px T.border + radius 12 + padding 8

各ステップ:
  flex: 1
  padding: 10 12 / font 12.5 / weight 600
  border-radius: 8
  
  done:    bg success-bg / fg success / border rgba(5,150,105,.2)
  active:  bg brand-cta / fg #fff / border #2563eb / shadow
  pending: bg rgba(255,255,255,.6) / fg T.textSub / border T.border

ステップ番号 (.nu) 20×20 円: 状態に応じて色変化
```

---

## 7. アラート帯（時間超過 / セクション説明）

**時間超過 [danger]**:
- bg: danger-bg / 1px danger / 左 4px なし（淡背景＋枠で意味付け）
- 22×22 円形 danger 塗りアイコン

**セクション説明 [neutral / warn]**:
- 通常: rgba(255,255,255,.85) + 1px T.border
- warn (NA確定): warn-bg ベタ + warn 枠

---

## 8. 会議終了画面 [厳守]

```
コンテナ: T.bgCard + 1px T.border + RADIUS.lg + padding 36 24 + center

アイコンタイル 64×64:
  brand-cta グラデ / 白スパークル SVG / shadow 0 8px 22px rgba(37,99,235,.28)

h2 "お疲れ様でした" (22 / 700)
サブ "週次キックオフ（パートナー事業部）を完了しました"

サマリーカード (max-w 520):
  bg: rgba(255,255,255,.6) + 1px T.border + radius 12
  
  グリッド 2 列:
    ファシリ / 開始 / 終了 / 所要

actions (center):
  [もう一度開始] secondary
  [一覧モードで詳細確認] primary
```

旧「🎉 大絵文字」は廃止。ブランドグラデのスパークルタイルで静かに祝う。

---

## 9. DO / DON'T

**DO**
- 主要 CTA だけブランドグラデ
- アラート帯は背景塗り＋枠で意味付け、左 4px ボーダー禁止
- KA レビューの 3 列（Good/More/Focus）の順序・色・プレースホルダ厳守

**DON'T**
- オレンジヒーロー禁止（旧 design）
- 黄色ピル（KA重点 / 2026年度）の混在禁止 — 統一ピル仕様で
- 絵文字を本番 UI に残さない

---

## 10. Acceptance Checklist

- [ ] 9 種類の会議 picker カードがブランドグラデアイコンタイル + Glass トーン
- [ ] ヒーローが #1e3a8a → #2563eb → #22d3ee
- [ ] ステップナビ active のみ brand-cta、done = success、pending = neutral
- [ ] KA レビューが 3 列（担当 / Good / More / Focus の構造維持）
- [ ] 会議終了画面が ブランドグラデのスパークル + 静かなサマリー
- [ ] 絵文字 0 件 / 左 4px ボーダー新規追加 0 件

## 11. Files

| Path | Purpose |
|---|---|
| `週次MTG.html` | デザインリファレンス（単一 HTML） |
