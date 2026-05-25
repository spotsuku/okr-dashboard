// ════════════════════════════════════════════════════════════════════════════
// OKR 共通: 達成率(%) → 状態色マッピング (4ビュー / 会議 / マイページで共有する単一の正)
// ════════════════════════════════════════════════════════════════════════════
//   0-29%  → danger
//   30-59% → warn
//   60-99% → success
//   100+%  → accent
//   null   → 未算出 (textFaint)
// 色はテーマトークン (T) から派生する。hex 直書きはしない。

export function pctColorKey(pct) {
  if (pct == null || Number.isNaN(pct)) return null
  if (pct >= 100) return 'accent'
  if (pct >= 60)  return 'success'
  if (pct >= 30)  return 'warn'
  return 'danger'
}

// 値色 (進捗バー fill / 大%数値)。T はテーマトークンオブジェクト。
export function pctColor(T, pct) {
  const k = pctColorKey(pct)
  return k ? T[k] : (T.textFaint || T.textMuted)
}

// 淡背景 (pill 用)
export function pctColorBg(T, pct) {
  const k = pctColorKey(pct)
  const map = { accent: 'accentBg', success: 'successBg', warn: 'warnBg', danger: 'dangerBg' }
  return k ? T[map[k]] : (T.sectionBg || 'transparent')
}

// 達成状況ラベル
export function pctStatusLabel(pct) {
  if (pct == null || Number.isNaN(pct)) return '−'
  if (pct >= 100) return '達成'
  if (pct >= 60)  return '順調'
  if (pct >= 30)  return '要注意'
  return '未達'
}
