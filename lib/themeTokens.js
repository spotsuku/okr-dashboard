// ─────────────────────────────────────────────────────────────────────────────
// 🎨 NEO 運営 DB デザインシステム (中央管理ファイル)
//
// このファイル + lib/iosStyles.js だけ編集すれば、全ページのトンマナが変わります。
//
//   COMMON_TOKENS  — 色 (light/dark)
//   SHADOWS        — 立体感 (微 → 強)
//   RADIUS         — 角丸スケール
//   TYPO           — フォントスケール
//   SPACING        — 余白スケール
//   FONT_STACK     — フォントファミリ
//
// 各コンポーネントは inline style に直接値を書くのではなく、
// `iosStyles.js` のスタイルファクトリ (cardStyle / btnPrimary 等) を介して
// このファイルの値を参照します。これで「カードの角丸を 16→20 に」のような
// 変更が 1 行の編集で全画面に伝播します。
// ─────────────────────────────────────────────────────────────────────────────

export const COMMON_TOKENS = {
  light: {
    bg:           '#F2F2F7',  // System Gray 6
    bgCard:       '#FFFFFF',
    bgCard2:      '#FAFAFC',
    bgSidebar:    '#FFFFFF',
    sectionBg:    'rgba(0,0,0,0.03)',

    border:       'rgba(0,0,0,0.06)',
    borderLight:  'rgba(0,0,0,0.04)',
    borderMid:    'rgba(0,0,0,0.12)',

    text:         '#1C1C1E',
    textSub:      '#3A3A3C',
    textMuted:    '#8E8E93',
    textFaint:    '#C7C7CC',
    textFaintest: 'rgba(0,0,0,0.06)',

    accent:       '#6B96C7',  // matte slate blue (原色青の代わり)
    accentDark:   '#557DAA',
    accentSolid:  '#6B96C7',
    accentBg:     'rgba(107,150,199,0.10)',

    success:      '#7FB89A',  // matte sage
    successBg:    'rgba(127,184,154,0.10)',
    warn:         '#E0B074',  // matte amber
    warnBg:       'rgba(224,176,116,0.10)',
    danger:       '#E89B9B',  // soft coral red (淡い赤・茶色っぽくならない)
    dangerBg:     'rgba(232,155,155,0.12)',
    info:         '#6B96C7',
    infoBg:       'rgba(107,150,199,0.10)',
  },
  dark: {
    bg:           '#000000',
    bgCard:       '#1C1C1E',
    bgCard2:      '#2C2C2E',
    bgSidebar:    '#1C1C1E',
    sectionBg:    'rgba(255,255,255,0.04)',

    border:       'rgba(255,255,255,0.10)',
    borderLight:  'rgba(255,255,255,0.04)',
    borderMid:    'rgba(255,255,255,0.16)',

    text:         '#F5F5F7',
    textSub:      '#C7C7CC',
    textMuted:    '#8E8E93',
    textFaint:    '#48484A',
    textFaintest: '#3A3A3C',

    accent:       '#7CA3D1',  // dark mode 用に少し明るめのマット青
    accentDark:   '#5C8BB8',
    accentSolid:  '#7CA3D1',
    accentBg:     'rgba(124,163,209,0.16)',

    success:      '#8FC9AB',
    successBg:    'rgba(143,201,171,0.16)',
    warn:         '#E8BD85',
    warnBg:       'rgba(232,189,133,0.16)',
    danger:       '#ED9CA0',  // soft coral red (dark mode 用)
    dangerBg:     'rgba(237,156,160,0.16)',
    info:         '#7CA3D1',
    infoBg:       'rgba(124,163,209,0.14)',
  },
}

// ─── 影 (3層構成) ────────────────────────────────────────────
export const SHADOWS = {
  none:     'none',
  xs:       '0 1px 2px rgba(0,0,0,0.04)',
  sm:       '0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.04)',
  md:       '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05), 0 12px 32px rgba(0,0,0,0.04)',
  lg:       '0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06), 0 24px 56px rgba(0,0,0,0.05)',
  xl:       '0 4px 8px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.08), 0 32px 64px rgba(0,0,0,0.06)',
  // ホバー時の強い影 (色付き)
  hover:    (color) => `0 1px 2px rgba(0,0,0,0.06), 0 6px 16px ${color}1a, 0 24px 56px ${color}33`,
  // hero 用 (色付きの大きいソフト影)
  hero:     (color) => `0 1px 2px rgba(0,0,0,0.06), 0 8px 24px ${color}33, 0 24px 56px ${color}26`,
}
// 後方互換
export const IOS_SHADOW          = SHADOWS.md
export const IOS_SHADOW_HOVER    = SHADOWS.lg
export const IOS_SHADOW_ELEVATED = SHADOWS.xl

// ─── 角丸スケール ────────────────────────────────────────────
export const RADIUS = {
  xs:    6,
  sm:    8,    // バッジ
  md:    10,   // 入力欄、ボタン
  lg:    14,   // 中サイズカード
  xl:    18,   // メインカード
  '2xl': 22,   // ヒーローカード
  pill:  99,
}
export const IOS_RADIUS = RADIUS  // 後方互換

// ─── 余白スケール ────────────────────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
}

// ─── タイポグラフィ ──────────────────────────────────────────
export const TYPO = {
  // iOS タイトル階層
  largeTitle: { fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 },
  title1:     { fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2  },
  title2:     { fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.3  },
  title3:     { fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.35 },
  headline:   { fontSize: 14, fontWeight: 700, lineHeight: 1.4  },
  body:       { fontSize: 13, fontWeight: 500, lineHeight: 1.5  },
  callout:    { fontSize: 13, fontWeight: 700, lineHeight: 1.4  },
  subhead:    { fontSize: 12, fontWeight: 600, lineHeight: 1.4  },
  footnote:   { fontSize: 11, fontWeight: 600, lineHeight: 1.4  },
  caption:    { fontSize: 10, fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.04em' },
}

// ─── アニメーション (transition) ──────────────────────────────
export const TRANSITION = {
  fast:    'all 0.15s ease',
  base:    'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  slow:    'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
}

// ─── 共通フォントスタック ─────────────────────────────────────
export const FONT_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Text"',
  '"SF Pro Display"',
  '"Hiragino Kaku Gothic ProN"',
  '"Hiragino Sans"',
  '"Yu Gothic Medium"',
  '"Meiryo"',
  'system-ui',
  'sans-serif',
].join(', ')

// ─── Backdrop blur (グラスモーフィズム用) ────────────────────
export const GLASS = {
  light: 'rgba(255,255,255,0.65)',
  dark:  'rgba(28,28,30,0.65)',
  blur:  'blur(20px) saturate(180%)',
}
