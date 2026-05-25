# Handoff: 朝会ページ（統一トンマナ）

## Overview

「朝会」タブのリデザイン。本番の **4 状態**（会議準備 → 個別報告 → 共有事項 → 確認事項 → ネクストアクション）を Glass トンマナで統一する。

ロジック・DOM・state は変更しない。見た目のみ `lib/themeTokens.js` + `lib/iosStyles.js` 経由に統一する。

## About the Design Files

`朝会.html` は単一 HTML のデザインリファレンス。`:root` の CSS 変数で `T.*` 相当を表現。

## Fidelity

**High-fidelity**。色・タイポ・余白・状態まで指定済み。

---

## 1. 基準トンマナ

- **背景**: 静かな Glass
- **カード**: 半透明白 + backdrop-blur
- **ブランドグラデ**: 「会議をはじめる」「Notion を開く」「共有事項を追加」「完了」「発表中」バッジのみ
- **絵文字全廃**: 🌅 / 📝 / 📅 / 🟠 / ✅ / 🎉 など全部単色ライン SVG
- **左 4px 縦線ボーダー禁止** [厳守]

---

## 2. State 一覧（4 状態）

### 2-1. 会議準備
- ヒーロー（ブランドブルー → シアン、旧オレンジ廃止）
- Notion CTA（通常の白カード、左 4px は使わない）
- 会議の流れ 4 ステップ
- 参加メンバー 17 人グリッド（4 列）
- ファシリテーター（輪番制バッジ + 変更ボタン）

### 2-2. 個別報告（Step 1）
- リセットボタン
- タイマー（残り 29 分 / 経過 1 分 / 予定 30 分）+ progress bar (brand-cta)
- ファシリ表示
- ステップナビ 4 段（active = brand-cta、done = success、pending = neutral）
- メンバー進行状況 (1/17)：完了は success-bg + チェック、進行中は accent-bg + 脈動、未着手は中性
- **発表中メンバーカード**:
  - 旧オレンジヘッダ → アクセント色のソフトグラデ背景
  - アバター 52×52 ブランドグラデタイル
  - 「発表中」バッジ = brand-cta + 白ドット脈動アニメ
  - 「前回の振り返り」セクション（空状態は dashed 枠）
  - 「今日のタスク」 完了 / 全件 + 期限切れピル（danger）
  - 期限切れ行: 淡赤背景 + 赤枠 + 赤い期限ピル（旧の真っ赤背景塗りはやめる）

### 2-3. 共有事項タイム（Step 2）
- 未解決の共有事項アラート（warn-bg ベタ + warn 枠、左 4px なし）
- 件数バッジ（warn 円形ピル）
- 宛先 select + 「共有事項を追加」primary CTA
- 各共有事項: from → to + 本文 + 「返信」/「確認済みにする」

### 2-4. ネクストアクション（Step 4）
- 警告アラート（warn-bg + warn）
- **全社の停滞タスクレビュー**:
  - 期限切れ件数表示（109件 / 本日期限 1件 / 合計未完 110件）
  - 担当者ごとにグルーピング (未アサイン / 三木智弘 / ... )
  - 各タスク行:
    - 超過日数バッジ（今日 / 1日超過 / 3日超過 / 9日超過）— 色を段階的に強める（warn → light-red → red → dark-red）
    - 日付 (monospace)
    - タスクタイトル
    - ステータス select
    - **完了ボタン** (success 緑 + ✓ アイコン)
- 折りたたみボタン

---

## 3. ヒーロー [厳守]

旧オレンジヒーロー → ブランドブルー → シアンに切替。

```
background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #22d3ee 100%)
border-radius: 22
padding: 24 28
color: #fff
shadow: 0 10px 30px rgba(37,99,235,.22)

要素:
  アイコンタイル 64×64 半透明ガラス + sun SVG (#fff)
  曜日ピル "平日毎日"
  h2 "朝会" (32 / 700 / -0.02em)
  メタ: "本日 5/23(土) · 所要 30 分 · 17 名参加"
```

---

## 4. 発表中カード [厳守]

```
ヘッダ:
  padding: 18 20
  background: linear-gradient(120deg, rgba(14,165,233,.08), rgba(14,165,233,.02) 40%, transparent)
  
  アバター 52×52: brand-cta gradient / 白文字 / shadow 0 4px 12px rgba(30,58,138,.28)
  名前 (18 / 700)
  役職 (11.5 / muted)
  
  発表中バッジ (right):
    padding: 4 12
    bg: brand-cta
    color: #fff
    border-radius: 99
    shadow: 0 2px 6px rgba(37,99,235,.28)
    ●ドット (白) blink 1.4s animation
```

「発表中」バッジは brand-cta を使う唯一の例外。CTA と同等の重要シグナルなので強調する。

---

## 5. 期限切れタスク行 [厳守]

旧: 真っ赤の背景塗り → 控えめに。

```
.task-row.overdue {
  background: rgba(225,29,72,.04);    /* very light red */
  border: 1px solid rgba(225,29,72,.15);
  border-radius: 8;
}
.task-row.overdue .cb {
  border-color: var(--danger);
}
.task-row.overdue .du {
  font-size: 10.5; font-weight: 600;
  background: var(--danger-bg);
  color: var(--danger);
  padding: 2 8;
  border-radius: 5;
  font-family: ui-monospace;
}
```

danger は **背景塗りではなく文字色＋淡背景＋アイコン** で表現。

---

## 6. 完了ボタン（停滞レビュー） [厳守]

```
.done-btn {
  display: inline-flex; align-items: center; gap: 4;
  padding: 5 10;
  font-size: 11; font-weight: 600;
  background: var(--success);
  color: #fff;
  border: none;
  border-radius: 5;
  shadow: 0 1px 3px rgba(5,150,105,.3);
}
```

success 緑のソリッドボタン（brand-cta ではない）。「その場で完了化」の明確なアクションシグナル。

---

## 7. 超過日数バッジ [厳守]

```
.badge.today  { bg: warn-bg / fg: warn }         /* 今日 */
.badge.day1   { bg: rgba(248,113,113,.18) / fg: #dc2626 }  /* 1〜2日 */
.badge.day3   { bg: rgba(239,68,68,.18)   / fg: #b91c1c }  /* 3〜8日 */
.badge.day9   { bg: rgba(220,38,38,.22)   / fg: #991b1b }  /* 9日以上 */
```

経過日数で 4 段階に色を強める。読み手に「焦りの度合い」を一目で伝える。

---

## 8. DO / DON'T

**DO**
- ヒーローはブランドブルー → シアン
- 発表中バッジは brand-cta + 白ドット脈動
- 期限切れは「淡赤背景 + 赤枠 + 赤ピル」のセットで控えめに
- 完了ボタンは success 緑ソリッド
- アイコンは Icon.jsx の単色ライン

**DON'T**
- オレンジヒーロー禁止
- タスク行の **背景全面赤塗り** 禁止（控えめな淡赤に）
- 左 4px 縦線ボーダーで意味付けしない
- 絵文字を本番 UI に残さない

---

## 9. Acceptance Checklist

- [ ] ヒーローが #1e3a8a → #2563eb → #22d3ee
- [ ] ステップナビ active のみ brand-cta、done = success
- [ ] 発表中バッジが brand-cta + 白ドット脈動アニメ
- [ ] 期限切れタスク行が「淡赤背景 + 赤枠 + 赤ピル」（真っ赤塗りではない）
- [ ] 停滞レビューの超過バッジが 4 段階で色強度が上がる
- [ ] 完了ボタンが success 緑ソリッド
- [ ] 絵文字 0 件 / 左 4px ボーダー新規 0 件

## 10. Files

| Path | Purpose |
|---|---|
| `朝会.html` | デザインリファレンス（4 状態を 1 ファイルに） |
