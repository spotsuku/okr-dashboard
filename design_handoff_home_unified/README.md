# Handoff: ホームページ（統一トンマナ）

## Overview

ログインユーザー向けの **ホーム** ページのリデザイン。
本ページの役割は「自分の業務に入る前のエントリポイント」。マイページ / 全社ダッシュボードへの分岐と、よく使うツールへのカスタムリンクのみに絞る。

- **マイページ** と **全社ダッシュボード** に進むのが主な動線
- **OKR ダッシュボード** / **週次MTG** への導線は **置かない**（上部ナビからのみ遷移）
- **カスタムリンク** で社員が個別に外部ツールを追加できる

`lib/themeTokens.js` + `lib/iosStyles.js` のトークン経由で実装する。デザイン方向性は変えない（既存トンマナの徹底）。

## About the Design Files

`ホーム.html` は単一 HTML のデザインリファレンス。CSS は `:root` の変数で `T.*` 相当を表現。本番では必ずトークン経由で参照する（hex 直書き禁止）。

## Fidelity

**High-fidelity**。色・サイズ・余白・状態まで指定済み。仕様の `[厳守] / [目安]` で固定要素と裁量を示す。

---

## 1. 基準トンマナ

- **背景** [厳守]: 静かな Glass（淡い青グレー 1 エッジ）
- **カード** [厳守]: `T.bgCard` (rgba(255,255,255,.78)) + backdrop-blur 20 + 1px `T.border` + `RADIUS.lg`
- **ブランドグラデ** = マイページ行き先カードのアイコンタイル + プライマリ CTA のみ
- **絵文字全廃** — Icon.jsx の単色ラインに置換
- **左 4px 縦線ボーダー禁止** [厳守]

---

## 2. ページ構造

```
┌── Header (glass-bar, sticky) ──────────────────────────┐
│ [Logo] AI WORKSPACE NEO福岡  ホーム(active)/WS/OKR/週次/朝会/組織 ⌘K 年度 ⚙ 👤
├─────────────────────────────────────────────────────────┤
│ Welcome strip                                           │
│  [Av] おかえりなさい、三木智弘さん  5/23(土) ● 稼働中 10:26〜  経過 3h 48m
├─────────────────────────────────────────────────────────┤
│ Destination grid (1:1)                                  │
│  ┌─ マイページ ───┐ ┌─ 全社ダッシュボード ─┐             │
│  │ 行き先カード   │ │ 行き先カード         │             │
│  └────────────────┘ └──────────────────────┘             │
├─────────────────────────────────────────────────────────┤
│ Custom links 4-col grid (+ 追加カード)                  │
├─────────────────────────────────────────────────────────┤
│ Info grid (1:1)                                         │
│  ┌─ 最近の動き ─┐ ┌─ お知らせ ────┐                     │
│  └──────────────┘ └────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Welcome strip [厳守]

```
display: flex / align-items: center / gap: 14 / margin-bottom: 24

[アバター 48×48]
  border-radius: 14
  background: linear-gradient(135deg, #3b82f6, #1e3a8a)
  shadow: 0 4px 12px rgba(30,58,138,.28)
  font: 18 / 700 / #fff

[テキスト]
  h1 "おかえりなさい、{name}さん" (22 / 700 / -0.015em)
  sub:
    "5/23(土) · 土曜日です"
    "● 稼働中 10:26〜" (success / 緑ドット + ハロー)

[右]
  経過時間ピル "経過 3h 48m" (mono / rgba 7 white bg)
```

---

## 4. Destination cards [厳守]

2 つの大行き先カード。**他に置かない** こと（OKR / 週次MTG / 朝会 などへのカードは作らない）。

```
コンテナ:
  display: grid / grid-template-columns: 1fr 1fr / gap: 18 / margin-bottom: 24

各カード (.dest):
  background: T.bgCard + backdrop-blur 20
  border: 1px solid T.border
  border-radius: RADIUS.xl (18)
  shadow: SHADOWS.card
  padding: 24
  cursor: pointer
  hover: translateY(-2px) + shadow + border-color borderMid

[アイコンタイル 48×48]
  border-radius: 12
  マイページ:        bg brand-cta / shadow rgba(37,99,235,.28)
  全社ダッシュボード: bg linear-gradient(135deg, #10b981, #059669) / shadow rgba(5,150,105,.28)

[ヘッダブロック]
  h2 (18 / 700 / -0.005em)
  desc (12.5 / sub / 1.6 / 2 行)

[統計行] (mt: auto / pt: 14 / border-top T.border)
  display: grid / 3 columns / gap: 10
  各 stat:
    lbl: 10.5 / 600 / muted / 0.04em / uppercase
    val: 18 / 700 / monospace / 状態色 (warn/success/accent/danger)
    unit: 11 / muted (件 / % など)

[右上 "開く →" ピル] (absolute / top:24 / right:24)
  padding: 5 11 / 11.5 / 600 / radius 99
  bg: rgba(255,255,255,.7) → hover: #fff
```

### マイページ カード仕様
- 統計: 今日のタスク (warn) / 期限切れ (danger) / 未読メール (accent)
- desc: 「今日のタスク・自分の目標・振り返り。業務を一括で見渡せる、毎日の起点になる画面。」

### 全社ダッシュボード カード仕様
- 統計: KR達成率 (success) / タスク完了率 (accent) / 未対応確認事項 (warn)
- desc: 「事業部の進捗・KR の達成状況・タスク完了率を一目で。経営層・マネージャー向けのサマリー画面。」

---

## 5. カスタムリンク [厳守]

```
セクションヘッダ:
  h3 "カスタムリンク" + 「リンクアイコン」
  desc: "よく使うツール・社内ドキュメント・外部サービスをここに追加できます"
  右: [管理] (ghost ボタン / 歯車アイコン)

グリッド: repeat(4, 1fr) / gap: 10

リンクカード (.link-card):
  background: T.bgCard + backdrop-blur 20
  border: 1px T.border / border-radius: RADIUS.md
  padding: 14
  display: flex / align-items: center / gap: 10
  href: 外部リンク (target="_blank" 推奨)
  hover: translateY(-1) + border-color borderMid

  [アイコンタイル 34×34]
    border-radius: 9
    各サービスの代表色を淡色背景で表現 (12% alpha)
    例:
      Gmail        → danger-bg / danger
      カレンダー   → accent-bg / accent-text
      Notion       → purple-bg / purple-text
      Slack        → warn-bg / warn
      Drive        → success-bg / success
      ChatGPT      → indigo-bg / indigo
      freee 等     → accent-bg / accent-text

  [info]
    nm:  12.5 / 600 / ellipsis 1 行
    url: 10.5 / muted / monospace / ellipsis 1 行

  [ext アイコン] 右端 (外部リンクの矢印)

追加カード (.link-add):
  background: rgba(255,255,255,.4)
  border: 1.5px dashed borderMid
  border-radius: RADIUS.md
  padding: 14
  色: muted → hover: accent-text
  "[+] リンクを追加"
```

### 追加モーダル仕様

「リンクを追加」をクリックで開く中央モーダル：

```
backdrop: rgba(15,23,42,.4) + backdrop-blur 4

モーダル:
  width: 420
  background: #fff
  border: 1px T.border / border-radius: 14
  shadow: 0 24px 60px rgba(15,23,42,.18)

  ヘッダ:
    "カスタムリンクを追加" + ✕ icon-btn

  ボディ (gap: 12):
    [表示名] input  placeholder "例: 経費精算"
    [URL]    input  placeholder "https://..."
    [アイコン色] 5 色スウォッチ (24×24 角丸 6, クリックで選択)

  フッタ:
    [キャンセル] secondary
    [追加する] primary (brand-cta)
```

---

## 6. 情報グリッド（下部）

```
display: grid / 2 columns / gap: 14 / margin-top: 18
```

### 最近の動きカード
- 直近 24 時間のチーム動向
- 各行: アバター + 「{who} が {what}」+ 時刻
- 解決・KA更新・議事録投稿 など

### お知らせカード
- 期限が近い社内通知（OKR入力期限など）
- 未解決の確認事項リマインド
- info / warn の小アイコン + 本文 + 期限表示

---

## 7. DO / DON'T

**DO**
- マイページと全社ダッシュボードの 2 カードに動線を集中
- アイコンタイルの色 = 行き先の性質を表す（個人 = brand-cta / 全社 = success）
- カスタムリンクは追加・編集・削除を「管理」ボタンで行う
- アイコンは Icon.jsx の単色ラインのみ

**DON'T**
- OKR ダッシュボードや週次MTGへのカードを置かない（ナビバーで十分）
- 朝会へのカードも置かない
- 絵文字を本番 UI に残さない
- 左 4px 縦線ボーダーで意味付けしない
- ブランドグラデを行き先カード以外に広げない（占有面積を抑える）

---

## 8. Acceptance Checklist

- [ ] Welcome strip にアバター + 挨拶 + 稼働中バッジ + 経過時間
- [ ] 行き先カードが正確に 2 枚（マイページ / 全社ダッシュボード）
- [ ] 各行き先カードに統計 3 つ + 「開く →」ピル
- [ ] OKR / 週次MTG / 朝会への大型カードが **無い**
- [ ] カスタムリンクが 4 列グリッド、最後に「+ リンクを追加」点線カード
- [ ] 「リンクを追加」クリックでモーダル展開（名前 / URL / アイコン色）
- [ ] 「管理」ボタンでリンクの編集・並び替え・削除モーダルへ
- [ ] 下部に「最近の動き」「お知らせ」の 2 カード
- [ ] 絵文字 0 件 / 左 4px ボーダー新規 0 件
- [ ] ブランドグラデ占有面積が画面の 10〜15% 以内

---

## 9. State Management

```ts
type HomeData = {
  user: { id: string; name: string; avatarUrl?: string };
  workSession: { startedAt: Date; elapsedSec: number };
  myStats: {
    todayTasks: number;
    overdueTasks: number;
    unreadMails: number;
  };
  companyStats: {
    krCompletionPct: number;
    taskCompletionPct: number;
    openConfirmations: number;
  };
  customLinks: Array<{
    id: string;
    name: string;
    url: string;
    iconKind: 'mail' | 'calendar' | 'docs' | 'chat' | 'drive' | 'ai' | 'custom';
    color: 'accent' | 'success' | 'warn' | 'danger' | 'purple' | 'indigo';
    order: number;
  }>;
  recentActivity: Array<{ userId: string; action: string; ts: Date }>;
  announcements: Array<{ kind: 'info' | 'warn'; body: string; ts: Date }>;
};
```

- カスタムリンクは **ユーザーごと** に保存（共有しない、組織共通の固定リンクは別途）
- 並び替えは `order` フィールド、ドラッグで永続化

---

## 10. Files

| Path | Purpose |
|---|---|
| `ホーム.html` | デザインリファレンス（単一 HTML） |
