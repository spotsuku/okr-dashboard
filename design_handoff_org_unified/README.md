# Handoff: 組織ページ（統一トンマナ）

## Overview

「組織」タブのリデザイン。6 サブタブ（組織図 / 工数管理 / 業務一覧 / 業務マニュアル / メンバー JD / ユーザー管理）を Glass トンマナで統一、初回ログインユーザー向けに **セットアップチェックリスト** を上部に常駐。

本番のレイアウト・ロジック・データ構造は変更しない。色・余白・タイポ・アイコンのみを `lib/themeTokens.js` + `lib/iosStyles.js` 経由に統一する。

## About the Design Files

`reference/org.jsx` は React コンポーネントのデザインリファレンス。本番では `T.*` / `cardStyle` / `btnPrimary` 経由で再現する。
`themes.css` には Glass パレットの CSS 変数定義を含む。

## Fidelity

**High-fidelity**。色・サイズ・余白・状態まで指定済み。仕様の `[厳守] / [目安]` で固定要素と裁量を示す。

---

## 1. 基準トンマナ

- **背景 [厳守]**: 静かな Glass（淡い青グレー 1 エッジ）
  ```css
  radial-gradient(900px 600px at 0% 0%, rgba(226,232,240,.5), transparent 55%),
  linear-gradient(180deg, #fbfcfe 0%, #f5f7fa 100%);
  ```
- **カード [厳守]**: `rgba(255,255,255,.78)` + `backdrop-filter: blur(20px) saturate(160%)` + 1px `T.border` + `RADIUS.lg` (14px)
- **ブランドグラデ** = primary CTA のみ（オンボーディング「次のステップへ」/「組織を管理」/「メンバーを追加」「Slack 同期」）
- **絵文字全廃** — 全アイコンを Icon.jsx の単色ラインに置換
- **左ボーダー縦線アクセント禁止** [厳守] — `border-left: 4px solid xxx` 系の装飾は使わない。意味付けは背景の淡色グラデで表現

---

## 2. ページ構造

```
┌── Header (Glass bar, sticky) ─────────────────┐
│ [ロゴ] AI WORKSPACE NEO福岡  ホーム/WS/OKR/週次/朝会/組織(active) … 検索 年度  ⚙ 👤
├────────────────────────────────────────────────┤
│ ┌── Title strip ─────────────────────────────┐│
│ │ [Org icon 56] 組織 / 2026年度 · 6サブタブ説明││
│ │   ● リアルタイム同期中    [管理者] [プログラム管理] [組織を管理]│
│ └────────────────────────────────────────────┘│
│ ┌── Onboarding Checklist (初回のみ) ─────────┐│
│ │ [Rocket icon] 組織のセットアップ  2/5 完了  [次は「メンバーJD」へ →]│
│ │ ────────── progress bar ───────────────── ✕││
│ │ STEP 1 ● 招待  STEP 2 ● 組織図  STEP 3 ○ JD  STEP 4 ○ 業務  STEP 5 ○ マニュアル│
│ └────────────────────────────────────────────┘│
│ ┌── サブタブ (segment) ──────────────────────┐│
│ │ 組織図(active) / 工数管理 / 業務一覧 / マニュアル / JD / ユーザー管理│
│ └────────────────────────────────────────────┘│
│ ┌── タブ別コンテンツ ────────────────────────┐│
│ └────────────────────────────────────────────┘│
└────────────────────────────────────────────────┘
```

---

## 3. オンボーディングチェックリスト [厳守]

初回ログイン時に表示。すべてのステップが完了したら自動で `dismiss=true` に。手動で ✕ で閉じることも可。

```
コンテナ:
  background: rgba(255,255,255,.78) + backdrop-blur 20
  border: 1px solid T.border
  border-radius: RADIUS.xl (18px)
  shadow: SHADOWS.card

ヘッダ (padding 14 18 / 上部):
  背景: linear-gradient(120deg, rgba(37,99,235,.08), rgba(34,211,238,.08))
  下罫線: 1px T.border
  
  [Rocket icon タイル 32×32 ブランドグラデ]
  [タイトル + 進捗バー]
    "組織のセットアップ" (14 / 700) + "2 / 5 完了" (11.5 / sub)
    プログレスバー 4px (sunken bg → brand-cta 塗り)
  [Primary CTA] "次は「メンバーJD」へ →"  ← brand-cta
  [✕ dismiss]

5 ステップグリッド (gap 1px / bg T.border):
  各セル: padding 14px 14px 12px / 白背景 / クリック可
    上行: 完了チェック ○/✓ + "STEP N" (10.5 / 700 / muted) + 件数 (10 / monospace)
    タイトル (13 / 600)
    説明 (11 / sub / 1.5)
  
  完了時: チェック ✓ が success 色の塗りつぶし
  未完了: 1.5px dashed の枠だけ
```

---

## 4. サブタブ (Segment) [厳守]

```
コンテナ:
  display: inline-flex / gap 4
  padding: 4
  background: rgba(255,255,255,.55) + backdrop-blur 16
  border: 1px solid T.border
  border-radius: RADIUS.lg (12)

各タブ:
  padding: 8 14 / font-size: 12.5 / weight: 500
  border-radius: RADIUS.sm (8)
  通常: bg transparent / color T.textSub
  active: bg #fff / color T.accentText / weight 600 / shadow SHADOWS.xs
```

旧設計の絵文字（🏗️ / 📊 / ✅ / 🔄 / 👤 / 🏛）はすべて Icon.jsx の単色ラインに置換。

---

## 5. タブ別仕様

### 5-1. 組織図
- 事業部カードを Glass トーンの統一カードに（旧: 緑・橙・青・紫のカラフルアクセント色を**完全に統一**）
- 事業部色は **左上のアイコンタイルのグラデ色** だけに留める
- チームカード: padding 14 / 1px border / radius 12 / 白背景
- 責任者未設定: 「未設定 — クリックして指定」を warn-bg + warn 文字 + dashed 枠で

### 5-2. 工数管理
- セグメント切替「担当可視化 / 数値記入」
- 役割色凡例を上部に常時表示（営業/運営/CS/企画/総務/PR の 6 色固定）
- 数値記入モード: グリッド塗り強度で工数の重みを表現（rgba(37,99,235,.04 〜 .08)）

### 5-3. 業務一覧
- フィルタ行 + 件数バッジ + 管理者ピル（warn-bg）
- 事業部ヘッダにブランドグラデの淡色バンド
- 各業務行: 担当（オレンジ）+ タイトル + サポート（灰チップ）+ 編集/リンク/削除アイコン
- 行クリックで詳細パネル

### 5-4. 業務マニュアル
- 左 280px: チーム一覧（事業部別にグループ化）
- 右: 詳細 or 空状態
- **空状態**: 「左のチームを選んでください」だけでなく、テンプレ候補 4 件のチップで誘導
- 旧 emoji（💼 / ✏️ / 🤝 / 🎯）は全廃

### 5-5. メンバー JD
- カードグリッド (`repeat(auto-fill, minmax(240px, 1fr))`)
- 各カード: メンバーアイコン + 役職 + メイン JD ピル + 役割タグ + 雇用形態
- 色は **メンバーのメインカラー 1 色** に集約

### 5-6. ユーザー管理
- Slack 同期カード（primary CTA）
- 共有・確認の Slack Webhook 設定
- 統計 3 カード（AUTH 総数 / 連携済 / 未紐付け）
- 未紐付け警告 (warn-bg + warn 円形アイコン)
- ユーザー行（アバター + 名前 + 管理者ピル + 役職 + メール + 最終ログイン）

---

## 6. DO / DON'T

**DO**
- 背景は静かな Glass のみ
- ブランドグラデは primary CTA のみ
- アイコンは Icon.jsx の単色ライン
- 状態は `T.warn-bg` / `T.success-bg` の淡色背景で表現

**DON'T**
- `border-left: 4px solid xxx` の縦線アクセントを新規に追加しない
- 絵文字を本番 UI に残さない
- カラフルパステル（緑/橙/水色など複数の同時使用）禁止
- 「責任者未設定」を muted で隠さない（warn で目立たせる）

---

## 7. Acceptance Checklist

- [ ] 全タブが Glass の半透明白カード + backdrop-blur
- [ ] 背景が静かな Glass（オーロラ 3 色禁止）
- [ ] サブタブが segment 形式（active のみ白カード + shadow）
- [ ] オンボーディングチェックリストが上部、5 ステップ、進捗バー、dismiss ✕
- [ ] 工数管理に役割色凡例（6 色固定）が常時表示
- [ ] 責任者未設定が warn-bg + dashed 枠で明示
- [ ] 旧絵文字（🏗️🚀💼💡✏️🤝🎯🟢🟠など）が 0 件
- [ ] ブランドグラデ占有面積が画面の 10〜15% 以内

## 8. Files

| Path | Purpose |
|---|---|
| `reference/org.jsx` | 全 6 タブの React 実装 |
| `reference/components.jsx` | 共通プリミティブ |
| `reference/themes.css` | Glass パレット |
