// ─────────────────────────────────────────────────────────────────────────────
// 🪄 iOS スタイル ファクトリ (中央管理)
//
// 全画面の inline style はここで定義した関数を使う。
// 「カードの角丸 / 影 / ボタンのサイズ」などのトンマナ調整は
// このファイルの 1 箇所を変えれば全ページに伝播する。
//
//   cardStyle({ T, accent })       — 立体感あるカード
//   heroStyle({ color })           — ヒーローバナー (グラデ + オーブ)
//   sectionHeaderStyle({ T })      — カードヘッダー
//   pillStyle({ color, size })     — 小バッジ / ピル
//   btnPrimary({ T, size })        — 主ボタン (グラデ + シャドウ)
//   btnSecondary({ T, size })      — 副ボタン (透明 + 枠)
//   btnGhost({ T, size })          — 影なしのテキストボタン
//   btnDanger({ T, size })
//   inputStyle({ T })              — フォーム入力欄
//   glassBarStyle({ T })           — 半透明 backdrop-blur のヘッダー
//   accentRingStyle({ color, size })— 色付きアイコンタイル (グラデ + 影)
// ─────────────────────────────────────────────────────────────────────────────

import { SHADOWS, RADIUS, SPACING, TYPO, TRANSITION, GLASS } from './themeTokens'

// ─── カード (汎用ラッパー) ───────────────────────────────────────────────
// accent カラーを渡すと: 縦カラーチントグラデ + 色付きボーダー
export function cardStyle({ T, accent, padding = SPACING.lg, raised = true }) {
  return {
    background: accent ? `linear-gradient(180deg, ${T.bgCard} 0%, ${accent}06 100%)` : T.bgCard,
    border: `1px solid ${accent ? accent + '1f' : T.border}`,
    borderRadius: RADIUS.lg,
    padding,
    boxShadow: raised ? SHADOWS.md : SHADOWS.xs,
    transition: TRANSITION.base,
    position: 'relative',
    overflow: 'hidden',
  }
}

// クリック可能カードのホバー効果 (使用例: onMouseEnter で applyHover)
export function cardHover({ accent, color }) {
  const c = color || accent
  return {
    transform: 'translateY(-3px)',
    boxShadow: c ? SHADOWS.hover(c) : SHADOWS.lg,
  }
}

// ─── ヒーローバナー ──────────────────────────────────────────────────────
export function heroStyle({ color = '#6B96C7' }) {
  return {
    padding: '26px 26px 22px',
    background: `linear-gradient(135deg, ${color}f5 0%, ${color}c0 60%, ${color}80 100%)`,
    borderRadius: RADIUS['2xl'],
    color: '#FFFFFF',
    position: 'relative', overflow: 'hidden',
    boxShadow: SHADOWS.hero(color),
  }
}

// ─── セクションヘッダー (カード内のヘッダー帯) ──────────────────────────
export function sectionHeaderStyle({ T, accent }) {
  return {
    padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`,
    background: accent ? `${accent}0d` : T.sectionBg,
    borderBottom: `1px solid ${T.border}`,
    fontSize: TYPO.subhead.fontSize,
    fontWeight: 800,
    color: T.text,
    letterSpacing: '-0.01em',
    display: 'flex', alignItems: 'center', gap: SPACING.sm,
    flexShrink: 0,
  }
}

// ─── ピル / バッジ (小ラベル) ────────────────────────────────────────────
export function pillStyle({ color = '#6B96C7', size = 'sm', solid = false }) {
  const s = size === 'lg' ? { padding: '4px 12px', fontSize: 12 }
          : size === 'md' ? { padding: '3px 10px', fontSize: 11 }
          :                  { padding: '2px 8px',  fontSize: 10 }
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.pill,
    background: solid ? color : `${color}1f`,
    color: solid ? '#FFFFFF' : color,
    fontWeight: 800,
    whiteSpace: 'nowrap',
    ...s,
  }
}

// ─── ボタン (4種) ────────────────────────────────────────────────────────
const btnSizes = {
  sm: { padding: '6px 12px', fontSize: 11, borderRadius: RADIUS.sm },
  md: { padding: '8px 16px', fontSize: 13, borderRadius: RADIUS.md },
  lg: { padding: '10px 22px', fontSize: 14, borderRadius: RADIUS.md },
}

export function btnPrimary({ T, size = 'md', color }) {
  const c = color || T.accent
  return {
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    background: `linear-gradient(135deg, ${c} 0%, ${c}d0 100%)`,
    color: '#FFFFFF', fontWeight: 800,
    boxShadow: `0 2px 6px ${c}55, 0 1px 2px rgba(0,0,0,0.06)`,
    transition: TRANSITION.fast,
    ...btnSizes[size],
  }
}

export function btnSecondary({ T, size = 'md' }) {
  return {
    border: `1px solid ${T.border}`, cursor: 'pointer', fontFamily: 'inherit',
    background: 'transparent', color: T.textSub, fontWeight: 700,
    transition: TRANSITION.fast,
    ...btnSizes[size],
  }
}

export function btnGhost({ T, size = 'md' }) {
  return {
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    background: 'rgba(120,120,128,0.12)', color: T.textSub, fontWeight: 700,
    transition: TRANSITION.fast,
    ...btnSizes[size],
  }
}

export function btnDanger({ T, size = 'md' }) {
  const c = T.danger
  return {
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    background: `linear-gradient(135deg, ${c} 0%, ${c}d0 100%)`,
    color: '#FFFFFF', fontWeight: 800,
    boxShadow: `0 2px 6px ${c}55, 0 1px 2px rgba(0,0,0,0.06)`,
    transition: TRANSITION.fast,
    ...btnSizes[size],
  }
}

// ─── 入力欄 ──────────────────────────────────────────────────────────────
export function inputStyle({ T }) {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', fontSize: 14,
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: RADIUS.md, color: T.text,
    fontFamily: 'inherit', outline: 'none',
    transition: TRANSITION.fast,
  }
}

// ─── グラスバー (上部 stickyヘッダー用) ──────────────────────────────────
export function glassBarStyle({ T, dark = false }) {
  return {
    background: dark ? GLASS.dark : GLASS.light,
    backdropFilter: GLASS.blur,
    WebkitBackdropFilter: GLASS.blur,
    borderBottom: `1px solid ${T.border}`,
  }
}

// ─── アクセント色のアイコンタイル (グラデ + ハイライト + 影) ──────────────
export function accentRingStyle({ color = '#6B96C7', size = 36 }) {
  return {
    width: size, height: size, borderRadius: Math.round(size * 0.28),
    background: `linear-gradient(135deg, ${color} 0%, ${color}c0 100%)`,
    color: '#FFFFFF',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px ${color}55`,
    flexShrink: 0,
    fontWeight: 800,
  }
}

// ─── 数字ストロング (KPI 表示) ───────────────────────────────────────────
export function kpiNumber({ color, size = 32 }) {
  return {
    fontSize: size, fontWeight: 900, color,
    lineHeight: 1, letterSpacing: '-0.02em',
  }
}

// ─── 大型タイトル (ページの最上部) ───────────────────────────────────────
export function largeTitle({ T }) {
  return { ...TYPO.largeTitle, color: T.text, margin: 0 }
}
export function pageSubtitle({ T }) {
  return { fontSize: 13, color: T.textMuted, fontWeight: 500, marginTop: 4 }
}

// ─── プログレスバー (グラデ) ─────────────────────────────────────────────
export function progressBarStyle({ T, height = 5 }) {
  return {
    width: '100%', height, borderRadius: RADIUS.pill,
    background: 'rgba(0,0,0,0.06)', overflow: 'hidden',
  }
}
export function progressFillStyle({ color, value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return {
    width: `${pct}%`, height: '100%', borderRadius: RADIUS.pill,
    background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  }
}
