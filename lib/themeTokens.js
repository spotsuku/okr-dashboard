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
  // ─── Glass テーマ (リデザイン Phase 1) ─────────────────────────
  // 設計参照: design_handoff_workspace_glass/README.md
  // - 半透明白カード + backdrop-filter blur 16px saturate 160%
  // - body にスカイ→ミントのラジアルグラデを敷く
  // - 左ボーダー縦線アクセントは廃止 (cardStyle 側で対応)
  light: {
    // Backgrounds (body 側にグラデを敷くので bg は transparent)
    bg:           'transparent',
    // 静かな Glass (B案 / design_handoff_dashboard_unified 採用): 左上だけ薄い radial、
    // ベースはほぼオフホワイト。3色オーロラ(A案)には戻さない。
    bgGradient:   'radial-gradient(900px 600px at 0% 0%, rgba(226,232,240,.5), transparent 55%), linear-gradient(180deg, #fbfcfe 0%, #f5f7fa 100%)',
    bgSoft:       'rgba(255,255,255,.78)',   // 検索バー等の sunken 背景
    bgCard:       'rgba(255,255,255,.92)',   // ガラス感を保ちつつ可読性確保
    bgCard2:      'rgba(255,255,255,.85)',
    sunken:       'rgba(255,255,255,.70)',
    bgSidebar:    'rgba(255,255,255,.92)',   // MyPageShell の左メンバーパネル (light で白)
    sidebarBg:    'rgba(15,23,42,.92)',      // OrgIconBar (Slack 風、dark 固定)
    sectionBg:    'rgba(255,255,255,.65)',
    headerBg:     'rgba(255,255,255,.85)',

    // Borders
    border:       'rgba(15,23,42,.08)',
    borderLight:  'rgba(15,23,42,.04)',
    borderMid:    'rgba(15,23,42,.12)',
    borderStrong: 'rgba(15,23,42,.16)',

    // Text
    text:         '#0f172a',
    textSub:      '#475569',
    textMuted:    '#94a3b8',
    textFaint:    '#cbd5e1',
    textFaintest: 'rgba(15,23,42,.04)',

    // Brand (sky-500)
    accent:       '#0ea5e9',
    accentDark:   '#0284c7',
    accentHover:  '#0284c7',
    accentSolid:  '#0ea5e9',
    accentBg:     'rgba(14,165,233,.14)',
    accentSoft:   'rgba(14,165,233,.14)',
    accentText:   '#0369a1',

    // Status colors
    success:      '#059669',
    successBg:    'rgba(5,150,105,.14)',
    successSoft:  'rgba(5,150,105,.14)',
    warn:         '#d97706',
    warnBg:       'rgba(217,119,6,.14)',
    warnSoft:     'rgba(217,119,6,.14)',
    danger:       '#e11d48',
    dangerBg:     'rgba(225,29,72,.12)',
    dangerSoft:   'rgba(225,29,72,.12)',
    info:         '#0284c7',
    infoBg:       'rgba(2,132,199,.14)',
    infoSoft:     'rgba(2,132,199,.14)',

    // Sidebar text (light モードでは OrgIconBar のみ dark 固定。MyPageShell の bgSidebar は白)
    sidebarText:   'rgba(255,255,255,.78)',
    sidebarActive: '#ffffff',

    // Sync badge (旧キー互換)
    syncBadgeBg:     'rgba(5,150,105,.10)',
    syncBadgeText:   '#059669',
    syncBadgeBorder: 'rgba(5,150,105,.30)',

    // Nav active
    navActiveBg:   'rgba(14,165,233,.14)',
    navActiveText: '#0369a1',

    // Avatar palette (deterministic by name hash)
    avatarPalette: ['#a78bfa','#60a5fa','#34d399','#f59e0b','#f472b6','#22d3ee','#fb7185','#84cc16','#f97316','#818cf8'],
  },
  dark: {
    bg:           '#000000',
    bgGradient:   'radial-gradient(900px 600px at 8% 0%, rgba(14,165,233,.10), transparent 60%), radial-gradient(900px 700px at 100% 18%, rgba(5,150,105,.08), transparent 60%), linear-gradient(180deg, #0a0e14 0%, #060810 100%)',
    bgSoft:       'rgba(255,255,255,.06)',
    bgCard:       'rgba(28,28,30,.94)',     // ガラス感を保ちつつ可読性確保
    bgCard2:      'rgba(40,40,44,.88)',
    sunken:       'rgba(255,255,255,.06)',
    bgSidebar:    'rgba(28,28,30,.94)',     // MyPageShell の左メンバーパネル
    sidebarBg:    'rgba(15,23,42,.96)',     // OrgIconBar (Slack 風)
    sectionBg:    'rgba(255,255,255,.06)',
    headerBg:     'rgba(20,20,24,.90)',

    border:       'rgba(255,255,255,.08)',
    borderLight:  'rgba(255,255,255,.04)',
    borderMid:    'rgba(255,255,255,.14)',
    borderStrong: 'rgba(255,255,255,.20)',

    text:         '#F5F5F7',
    textSub:      '#C7C7CC',
    textMuted:    '#8E8E93',
    textFaint:    '#48484A',
    textFaintest: '#3A3A3C',

    accent:       '#38bdf8',     // sky-400 (dark 用にやや明るく)
    accentDark:   '#0ea5e9',
    accentHover:  '#7dd3fc',
    accentSolid:  '#38bdf8',
    accentBg:     'rgba(56,189,248,.18)',
    accentSoft:   'rgba(56,189,248,.18)',
    accentText:   '#7dd3fc',

    success:      '#10b981',
    successBg:    'rgba(16,185,129,.18)',
    successSoft:  'rgba(16,185,129,.18)',
    warn:         '#f59e0b',
    warnBg:       'rgba(245,158,11,.18)',
    warnSoft:     'rgba(245,158,11,.18)',
    danger:       '#f43f5e',
    dangerBg:     'rgba(244,63,94,.18)',
    dangerSoft:   'rgba(244,63,94,.18)',
    info:         '#38bdf8',
    infoBg:       'rgba(56,189,248,.18)',
    infoSoft:     'rgba(56,189,248,.18)',

    sidebarText:   'rgba(255,255,255,.78)',
    sidebarActive: '#ffffff',

    syncBadgeBg:     'rgba(16,185,129,.16)',
    syncBadgeText:   '#10b981',
    syncBadgeBorder: 'rgba(16,185,129,.30)',

    navActiveBg:   'rgba(56,189,248,.18)',
    navActiveText: '#7dd3fc',

    avatarPalette: ['#a78bfa','#60a5fa','#34d399','#f59e0b','#f472b6','#22d3ee','#fb7185','#84cc16','#f97316','#818cf8'],
  },
}

// ─── 影 (Glass テーマ: 強い影は使わない、最小限) ────────────
export const SHADOWS = {
  none:     'none',
  xs:       '0 1px 2px rgba(15,23,42,.04)',
  sm:       '0 2px 6px rgba(15,23,42,.06)',
  md:       '0 6px 24px rgba(15,23,42,.08)',
  lg:       '0 12px 36px rgba(15,23,42,.10)',
  xl:       '0 20px 56px rgba(15,23,42,.12)',
  // ガラスの艶 (内側ハイライト) — Glass テーマで cardStyle に組み合わせる
  glassInset: 'inset 0 1px 0 rgba(255,255,255,.7)',
  // 後方互換: hover/hero は控えめにダウングレード
  hover:    (color) => `0 2px 6px rgba(15,23,42,.08), 0 12px 24px ${color}1a`,
  hero:     (color) => `0 6px 24px ${color}22, 0 1px 2px rgba(15,23,42,.06)`,
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

// ─── 共通フォントスタック (Glass: Inter + Noto Sans JP 優先) ─
export const FONT_STACK = [
  '"Inter"',
  '"Noto Sans JP"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Text"',
  '"SF Pro Display"',
  '"Hiragino Kaku Gothic ProN"',
  '"Hiragino Sans"',
  'system-ui',
  'sans-serif',
].join(', ')

// ─── Backdrop blur (Glass テーマの中核) ──────────────────────
export const GLASS = {
  light: 'rgba(255,255,255,.74)',
  dark:  'rgba(28,28,30,.78)',
  blur:  'blur(16px) saturate(160%)',
}

// ─── ブランドグラデ (訴求面・主要CTA "ここぞ" 専用) ───────────
// 使用ルール (重要):
//   - LP / オンボーディング帯 / ヒーローバナー / 主要CTA のみで使う。
//   - アプリ全体の背景や通常カード・通常ボタンには広げない
//     (画面内で濃い青グラデが占める面積は 10〜20% まで。残りは白カード +
//      淡グラデ背景 + T.accent の差し色で「静かな Glass」を保つ)。
//   - 色相は T.accent (sky) と同系。LP は彩度を上げ、アプリは抑える、で
//     ブランドの一貫性を担保する。
export const BRAND_GRADIENT = {
  // 濃い青 → シアン: LP CTA / アプリの主要CTA・AIボタン (design_handoff_dashboard_unified 準拠)
  cta:  'linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)',
  // 訴求ヒーロー帯 (白文字を載せる): LP ヒーロー / オンボーディング
  hero: 'linear-gradient(120deg, #2563eb 0%, #0ea5e9 55%, #22d3ee 100%)',
}
