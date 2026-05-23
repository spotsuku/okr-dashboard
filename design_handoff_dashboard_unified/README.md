# Handoff: ダッシュボード（統一トンマナ）

## Overview

ワークスペース内「ダッシュボード」サブタブのリデザイン。
既存デザインシステム（`lib/themeTokens.js` + `lib/iosStyles.js` + `components/Icon.jsx`）に全要素を寄せ、
**絵文字を全廃** し、**ブランドグラデは主要 CTA と AI ボタンのみ** に絞り、
背景は **静かな Glass（淡い青グレー 1 エッジ）** に統一する。

本番のレイアウト（ミニ組織レール / メンバーレール / サブタブ / 3 カラム）は **変更しない**。
変えるのは見た目（色・余白・タイポ・アイコン・装飾）のみ。

## About the Design Files

`Dashboard.html` は **デザインリファレンス**（単一 HTML、CSS は :root の変数で `T.*` 相当を表現）。
本番では `T.*` / SPACING / RADIUS / SHADOWS / TYPO を経由して参照すること。
hex 直書き・独自グラデ新設は禁止。

`Background Comparison.html` は背景の強さ比較資料（A 現状 / B 推奨 / C フラット / D グリッド）。**B 採用**。

## Fidelity

**High-fidelity**。色・タイポ・余白・装飾・状態・キーボード操作まで指定済み。
仕様の右側 **[厳守] / [目安] / [任意]** タグで固定要素と裁量範囲を示す。

---

## 1. 基準トンマナ

- **背景 [厳守]**: 静かな Glass（左上だけ薄い radial、ベースはほぼオフホワイト）
  ```css
  background:
    radial-gradient(900px 600px at 0% 0%, rgba(226,232,240,.5), transparent 55%),
    linear-gradient(180deg, #fbfcfe 0%, #f5f7fa 100%);
  ```
- **カード [厳守]**: 半透明白 + `backdrop-filter: blur(20px) saturate(160%)` + `T.border` + `RADIUS.lg` (14px)
- **アクセント**: `T.accent` = `#0ea5e9` 単色。差し色 / アクティブピル / 統計アイコンに使う
- **ブランドグラデ [厳守]**: `BRAND_GRADIENT.cta = linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)`
  - 使用箇所のみ:
    1. 「終業する」プライマリボタン
    2. Gmail 行の「AI返信」ボタン
    3. マイOKR「KR記入」プライマリボタン
    4. 右下の AI（MyCOO）オーブ（深い青グラデ）
    5. ブランドマーク（左上 26×26）
    6. 年度トグルのアクティブ側
  - **占有面積は画面の 10〜15% 以内**
- **絵文字禁止 [厳守]**: 全アイコンを `<Icon name>` の単色ライン SVG（24×24 viewBox / stroke 1.6〜1.8 / currentColor）

---

## 2. レイアウト構造（本番と同じ）

```
┌── org rail (56px, #0f172a, 組織アイコン縦並び) ──┐
│ ┌──────────────────────────────────────────┐ │
│ │ Sticky Header (glass-bar 50px)            │ │
│ │ [ロゴ│AI WORKSPACE NEO福岡][nav 6項目]…検索 年度 ⚙ 👤 │ │
│ ├──────────────┬───────────────────────────┤ │
│ │ Member rail  │ Sub-tabs (44px)            │ │
│ │ 240px        │ ダッシュ/共有/タスク/メール/OKR/カレ/ドライブ/MyCOO/振り返り/連携 [編集可]│
│ │ 全社サマリー  ├───────────────────────────┤ │
│ │ 三木智弘 ●    │ Content (3-column grid)    │ │
│ │ 三木浩江 ○    │  ┌─Greeting (avatar+稼働中+終業する)─┐
│ │ 森朝香 ●     │  └────────────────────────┘ │
│ │ ...          │  ┌─Col1─┬─Col2────────┬─Col3──┐ │
│ │              │  │今日 │Gmail (5)    │マイOKR│ │
│ │              │  │今週 │カレンダー    │バッジ │ │
│ │              │  └─────┴─────────────┴───────┘ │
│ └──────────────┴───────────────────────────┘ │
│                                          [AI orb FAB]
└────────────────────────────────────────────────┘
```

---

## 3. Header (glassBarStyle) [厳守]

```
高さ 50px / padding 10px 20px
background: rgba(255,255,255,.7)
backdrop-filter: blur(18px) saturate(160%)
border-bottom: 1px solid T.border

[ロゴマーク 26×26 brand-cta] | NEO福岡
[nav.main]: ホーム/ワークスペース(active)/OKR/週次MTG/朝会/組織
  各項目: padding 5px 11px / radius 7 / 12px / weight 500 / sub
  active: bg navActiveBg / 色 navActiveTx / weight 600

→ Search (200px幅, ⌘K キーバインド表示)
→ 年度トグル [2025年度|2026年度] アクティブはブランドグラデ
→ テーマ切替 icon-btn
→ ユーザー icon-btn
```

---

## 4. Member rail [厳守]

```
width 240 / 半透明 + backdrop-blur 20

ヘッダ (border-bottom):
  "メンバー (17)" + 折り畳み chevron
  検索チップ "名前で検索"

メンバー行:
  padding 8px 10px / radius 8
  active: bg accentBg / 名前 accentText / weight 600
  avatar 28×28 円 / dot 8×8 (right-bottom):
    on=success / off=muted
  特殊: "全社サマリー" は organization icon タイル
```

---

## 5. Sub-tabs [厳守]

```
44px / padding 0 16px / glass barbar / border-bottom T.border
横スクロール許可

各タブ:
  padding 6px 11px / radius 7 / 12px / weight 500 / sub
  active: bg #fff / text / weight 600 / sh-xs

タブ:
  ダッシュボード (active) / 共有・確認 / タスク / メール [5badge] /
  OKR / カレンダー / ドライブ / MyCOO / 振り返り / 連携

右端: "編集可" 緑ピル
```

メール badge は `danger` 色 (#e11d48) の小ピル、padding 1px 6px / 9.5px / 700。

---

## 6. Greeting strip [厳守]

```
padding 12px 14px
カード（glass）

[アバター 36 円 (グラデ色)]
[タイトル + サブ]
  おはようございます、{name}さん (14 / 600)
  5/23(土) | ●稼働中 10:26〜 (success pill)
[終業する] btn-primary ← ブランドグラデ使用箇所
[⚙ icon-btn]
```

---

## 7. 3 カラムグリッド [厳守]

```
grid-template-columns: 1fr 1.05fr 1fr
gap: 14
```

### Col 1: タスク
- **今日やること** カード（empty 状態テキスト: "今日のタスクはありません"）
- **今週やること** カード

### Col 2: コミュニケーション
- **Gmail (要対応 5件)** カード
  - 各行: subject (1 行 ellipsis) + preview (1 行 ellipsis) + 右に [既読][AI返信] 縦並び
  - subject の `<span class="from">` 部分は太字 (700)
  - `既読` = success-bg + success / 4px radius / 64px min-width
  - `AI返信` = ブランドグラデ + #fff / 4px radius / 64px min-width / 影
- **Google カレンダー (直近8時間)** カード
  - cal-time (mono 42px幅) + cal-title + 「参加」success ピル

### Col 3: 目標達成
- **マイOKR** カード
  - KR記入漏れ 3 件（中性カード、border + bg-soft）
  - 下部 2 ボタン: `[KR記入 (17) →]` ブランドグラデ / `[KA記入 (28) →]` ghost
  - フッタ: 「一覧で見る →」
- **バッジコレクション** カード (1/7)
  - 2 列グリッドのバッジセル × 7
  - 獲得済（Google 連携）は `2 列フル幅` + `bg-success / 金グラデアイコン` + `✓獲得` ピル
  - 未獲得は中性カード（icon は muted）

---

## 8. AI オーブ（FAB） [厳守]

本番の現行デザインを **絶対変えない**。

```
固定: position: fixed; bottom:22; right:22

ring (animated halo):
  position: absolute; inset: -10
  background: radial-gradient(circle, rgba(99,102,241,.22), transparent 70%)
  border-radius: 99
  animation: ai-pulse 3s ease-in-out infinite
    @keyframes { 0%,100% {opacity:.5; scale:1} 50% {opacity:1; scale:1.15} }

orb (button):
  54×54 / border-radius: 99
  background: linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)
  border: 3px solid rgba(255,255,255,.92)
  box-shadow:
    0 8px 24px rgba(30,58,138,.32),
    inset 0 1px 0 rgba(255,255,255,.3),
    inset 0 -2px 4px rgba(30,58,138,.4)
  中央に sparkle SVG (24×24, fill #fff)
  hover: translateY(-2px)
```

このボタンだけは別の deep blue グラデ (`#3b82f6 → #1e3a8a`) を使用。
通常 CTA の `brand-cta` グラデとは色を分けて、MyCOO の「特別な存在感」を出している。

---

## 9. Buttons / Pills 一覧

### Buttons
```
.btn-primary  → bg: var(--brand-cta) / 白文字 / #2563eb 枠 / 影
.btn-secondary → bg: white-85 / text / borderStrong
.btn-ghost    → bg: transparent / sub
.icon-btn     → 30×30 円ボタン (header utility)
```

### Pills
```
.pill         → default neutral (rgba(15,23,42,.05) / sub)
.pill.success → success-bg / success
.pill.accent  → accent-bg / accent-text
.pill.danger  → danger color
```

### Mail action buttons (Gmail row 専用)
```
.mail-action       → 64px min-width / 6px radius / 10.5px / 500 / pad 3px 8px
.mail-action.read  → success-bg / success / 5,150,105,.25 枠
.mail-action.ai    → brand-cta / #fff / #2563eb 枠 / 影 0 1px 3px rgba(37,99,235,.22) / 600
```

---

## 10. Icon mapping (要 Icon.jsx 追加)

旧絵文字 → 新 Icon name（無ければ Icon.jsx に 24×24 / stroke 1.6 で追加してから使う）

| 旧 | 新 (Icon name) | 用途 |
|---|---|---|
| ☀ | morning / sun | 朝会タブ |
| 📅 | calendar | 週次MTG / カレンダー |
| 🏠 | home | ホーム |
| ≡ | menu / workspace | ワークスペース |
| ◎ | target | OKR |
| 🏛 | building | 組織 |
| 🔍 | search | 検索 |
| ⚙ | settings | 設定 |
| 👤 | user | ユーザー |
| 📊 | chart | ダッシュボード |
| 📬 | mail / inbox | メール |
| ✓ | check | 既読 / 完了 |
| 💾 | drive | ドライブ |
| ✦ | sparkle / ai | MyCOO / AI 返信 |
| 🔄 | refresh | 振り返り |
| 🔗 | link | 連携 / Google 連携 |
| 🎯 | target | KR / 目標 |
| 🌙 | clock | 終業 |
| ⚡ | bolt | クイック追加 |
| ⭐ | star | バッジ |
| 🚀 | rocket | 事業部アイコン |

---

## 11. DO / DON'T

**DO**
- 背景は静かな Glass（B 案）
- カードは半透明 + backdrop-blur
- ブランドグラデは主要 CTA / AI 返信 / マイOKR primary / MyCOO オーブのみ
- AI オーブは本番デザインそのまま（深い青グラデ + 白スパークル + ハロー）
- 全アイコンを単色ライン SVG に置換
- レイアウト（メンバーレール / サブタブ / 3 カラム）は本番を維持

**DON'T**
- 3 色オーロラ背景に戻さない（A 案）
- ブランドグラデを通常カードや背景に広げない
- 絵文字を残さない・画像絵文字に置換しない
- AI オーブの色を `brand-cta` (#2563eb→#22d3ee) に合わせない（独自の deep blue を維持）
- カード内に生 SVG を散らさない（Icon.jsx に集約）
- ロジック / DOM 構造 / props / データ取得を変更しない

---

## 12. Acceptance Checklist

### 背景・トンマナ
- [ ] 背景が B（静かな Glass）。3 色オーロラは出現しない
- [ ] カードがすべて backdrop-blur 半透明 + T.border + RADIUS.lg

### ヘッダ・ナビ
- [ ] ロゴマーク 26×26 がブランドグラデ
- [ ] 年度トグルのアクティブ側がブランドグラデ
- [ ] サブタブのメール badge が danger 色の小ピル

### カード
- [ ] Greeting の「終業する」がブランドグラデの btn-primary
- [ ] Gmail 行が 2 行構成（件名 1 行 ellipsis + プレビュー 1 行 ellipsis）
- [ ] Gmail 行の右に「既読」「AI返信」が縦並びで 64px min-width
- [ ] AI返信ボタンがブランドグラデ、既読ボタンが success-bg
- [ ] マイOKR の「KR記入 (17) →」がブランドグラデ、「KA記入 (28) →」が ghost で改行しない (white-space: nowrap)
- [ ] バッジコレクションは 6 セル + 「Google 連携」獲得済が 2 列フル幅で金グラデ
- [ ] FAB（右下）が deep blue グラデ + 白スパークル + ハロー（脈動）

### 絵文字
- [ ] `grep -r "[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]" components/` で 0 件
- [ ] 全アイコンが Icon.jsx 経由

### Don'ts
- [ ] ブランドグラデの占有面積が画面の 10〜15% 以内
- [ ] 通常カード背景にブランドグラデが使われていない

---

## 13. Files in This Bundle

| Path | Purpose |
|---|---|
| `Dashboard.html` | ダッシュボード単体のデザインリファレンス（背景は B 採用） |
| `Background Comparison.html` | 背景 4 パターン比較（A 現状 / B 推奨 / C フラット / D グリッド） |
| `README.md` | この仕様書 |

## 14. Out of Scope

- 他のサブタブ（共有・確認 / タスク / メール / OKR / カレンダー / ドライブ / MyCOO / 振り返り / 連携）の中身
- メンバーレールの折り畳み挙動
- データ取得・state 管理・ルーティング
- ダークモード（別ハンドオフ）

---

## 15. 実装手順（推奨）

1. **背景を差し替え** — `lib/themeTokens.js` の `T.bg` を B 案の値に変更
2. **AI オーブを別コンポーネント化** — `components/MyCOOOrb.jsx` を作成、`<AppShell>` 直下に常駐
3. **Gmail 行を 2 行構成に** — 既存の `<MailRow>` を subject + preview に変更、ボタン縦並びに
4. **マイOKR ボタンを `white-space: nowrap` + flex で固定** — 改行を防ぐ
5. **絵文字を Icon.jsx に置換** — 1 コンポーネント = 1 コミット
6. **ブランドグラデの使用箇所を `<BrandCtaButton>` でラップ** — 占有面積を可視化して管理

各ステップ完了時に light/dark 両方で確認、機能リグレッションなしを確認してから次へ。
