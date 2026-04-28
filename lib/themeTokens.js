// ─────────────────────────────────────────────────────────────────────────────
// デザインシステム共通トークン (iOS / iPadOS 風)
//
// 全ページのテーマ色をここで一元管理する。各コンポーネントの THEMES は
// `{ ...COMMON_TOKENS.light, /* file-specific extras */ }` の形でこの値を継承する。
// グローバルな色を変えたい場合はこのファイルだけ編集すればよい。
//
// iOS のシステムカラー (Apple HIG) を採用:
//   System Blue   #007AFF / dark #0A84FF
//   System Green  #34C759 / dark #30D158
//   System Red    #FF3B30 / dark #FF453A
//   System Orange #FF9500 / dark #FF9F0A
//   System Gray   #8E8E93 (両モード共通)
//   System Gray 6 #F2F2F7 (light bg)
//   Pure Black    #000000 (dark bg)
//   Card BG       #FFFFFF (light) / #1C1C1E (dark)
// ─────────────────────────────────────────────────────────────────────────────

export const COMMON_TOKENS = {
  light: {
    // ── 背景 ───────────────────────────────────────
    bg:           '#F2F2F7',  // System Gray 6
    bgCard:       '#FFFFFF',
    bgCard2:      '#FAFAFC',
    bgSidebar:    '#FFFFFF',
    sectionBg:    'rgba(0,0,0,0.03)',

    // ── ボーダー ───────────────────────────────────
    border:       'rgba(0,0,0,0.06)',
    borderLight:  'rgba(0,0,0,0.04)',
    borderMid:    'rgba(0,0,0,0.12)',

    // ── テキスト ───────────────────────────────────
    text:         '#1C1C1E',
    textSub:      '#3A3A3C',
    textMuted:    '#8E8E93',  // System Gray
    textFaint:    '#C7C7CC',
    textFaintest: 'rgba(0,0,0,0.06)',

    // ── アクセント (System Blue) ───────────────────
    accent:       '#007AFF',
    accentDark:   '#0062CC',
    accentSolid:  '#007AFF',
    accentBg:     'rgba(0,122,255,0.10)',

    // ── 成功 (System Green) ────────────────────────
    success:      '#34C759',
    successBg:    'rgba(52,199,89,0.10)',

    // ── 警告 (System Orange) ───────────────────────
    warn:         '#FF9500',
    warnBg:       'rgba(255,149,0,0.10)',

    // ── エラー / 危険 (System Red) ─────────────────
    danger:       '#FF3B30',
    dangerBg:     'rgba(255,59,48,0.10)',

    // ── 情報 (= accent と同色) ─────────────────────
    info:         '#007AFF',
    infoBg:       'rgba(0,122,255,0.10)',
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

    accent:       '#0A84FF',
    accentDark:   '#0062CC',
    accentSolid:  '#0A84FF',
    accentBg:     'rgba(10,132,255,0.16)',

    success:      '#30D158',
    successBg:    'rgba(48,209,88,0.16)',

    warn:         '#FF9F0A',
    warnBg:       'rgba(255,159,10,0.16)',

    danger:       '#FF453A',
    dangerBg:     'rgba(255,69,58,0.16)',

    info:         '#0A84FF',
    infoBg:       'rgba(10,132,255,0.14)',
  },
}

// 2 層シャドウ (iOS 風の柔らかい影)
export const IOS_SHADOW         = '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)'
export const IOS_SHADOW_HOVER   = '0 2px 4px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.08)'
export const IOS_SHADOW_ELEVATED = '0 4px 8px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.10)'

// 角丸 (iOS スケール)
export const IOS_RADIUS = {
  sm: 8,    // 小さい要素 (バッジ等)
  md: 12,   // 入力欄、ボタン
  lg: 16,   // カード
  xl: 20,   // 大きいカード / モーダル
  pill: 99, // 完全に丸い (ピル状)
}

// 共通フォントスタック (layout.jsx と同じ)
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
