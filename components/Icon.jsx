'use client'
// ─────────────────────────────────────────────────────────────
// Icon — Glass テーマで全画面横断利用する lucide 風 SVG アイコン
//
// 旧: 絵文字 (📊 🎯 📅 🤖 ✅ 等) をテキスト直書き
// 新: <Icon name="..." size={16} /> で単色 SVG ライン
//
// stroke 1.6px / 24×24 viewBox / currentColor 継承
// Design ref: design_handoff_workspace_glass/reference/components.jsx
// ─────────────────────────────────────────────────────────────

const ICON_PATHS = {
  // Navigation
  home:       'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  workspace:  'M4 6h16M4 12h16M4 18h10',
  target:     'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-4a5 5 0 1 1 0-10 5 5 0 0 1 0 10m0-3a2 2 0 1 1 0-4 2 2 0 0 1 0 4',
  calendar:   'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1m-1 5h16M9 3v4m6-4v4',
  morning:    'M12 4v2m0 12v2M4 12H2m20 0h-2M5.5 5.5 4 4m16 16-1.5-1.5M5.5 18.5 4 20m16-16-1.5 1.5M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10',
  org:        'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6m-6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6m12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6M9.5 9 7 13m7.5-4 2.5 4',
  building:   'M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M3 21h18M10 8h1M10 12h1M10 16h1M14 8h1M14 12h1M14 16h1',

  // Actions
  search:     'M11 19a8 8 0 1 1 5.3-2L21 21M11 17a6 6 0 1 1 0-12 6 6 0 0 1 0 12',
  plus:       'M12 5v14M5 12h14',
  check:      'm5 12 5 5L20 7',
  cross:      'M6 6l12 12M6 18 18 6',
  pencil:     'm4 20 1-4L17 4l3 3L8 19zM14 7l3 3',
  trash:      'M5 7h14M10 11v6m4-6v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
  refresh:    'M3 12a9 9 0 0 1 15-6.7L21 8m0-5v5h-5m4 5a9 9 0 0 1-15 6.7L3 17m0 5v-5h5',
  filter:     'M4 5h16l-6 8v6l-4-2v-4z',
  more:       'M6 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0m7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  chevronR:   'm9 6 6 6-6 6',
  chevronD:   'm6 9 6 6 6-6',
  chevronL:   'm15 6-6 6 6 6',
  chevronU:   'm18 15-6-6-6 6',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  arrowUp:    'M12 19V5m-6 6 6-6 6 6',
  external:   'M14 4h6v6m0-6L10 14M5 5h5m4 9v5H5V8h5',

  // Status
  circle:     'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18',
  half:       'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18M12 3v18',
  clock:      'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-13v5l3 2',
  star:       'm12 4 2.5 5.5L20 10l-4 4 1 5.5-5-2.8-5 2.8 1-5.5-4-4 5.5-.5z',
  flag:       'M5 3v18m0-18 14 4-3 4 3 4-14 0',
  bolt:       'm13 3-9 12h7l-1 6 9-12h-7z',

  // Tools
  ai:         'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6 7.7 7.7m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8',
  mail:       'M3 7h18v10H3zM3 7l9 7 9-7',
  drive:      'M8 4h8l5 9-4 7H7L3 13z',
  link:       'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1m1 7a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  msg:        'M21 12a8 8 0 1 1-3.4-6.5L21 4l-.8 4.3A8 8 0 0 1 21 12',
  inbox:      'M3 13h6l1 2h4l1-2h6m-18 0V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7m-18 0v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5',
  bell:       'M6 16V10a6 6 0 1 1 12 0v6l2 2H4zM10 21h4',

  // User/Settings
  user:       'M12 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8M4 21c0-4 4-7 8-7s8 3 8 7',
  settings:   'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6m7 3 1.7-1-1.7-3-1.9.6a7 7 0 0 0-1.7-1L15 5h-6l-.4 2.6a7 7 0 0 0-1.7 1L5 8l-1.7 3 1.7 1L5 14l-1.7 1 1.7 3 1.9-.6a7 7 0 0 0 1.7 1L9 21h6l.4-2.6a7 7 0 0 0 1.7-1l1.9.6 1.7-3-1.7-1z',
  cmd:        'M9 6a3 3 0 1 1-3 3h12a3 3 0 1 1-3 3V6m0 12a3 3 0 1 1-3-3V9a3 3 0 1 1 3-3',
  rocket:     'M5 19c0-3 1-6 4-9l5-5a8 8 0 0 1 5-2 8 8 0 0 1-2 5l-5 5c-3 3-6 4-9 4zm5-9a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  logout:     'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 17l5-5-5-5M15 12H3',

  // Charts / awards / misc (dashboard ハンドオフ用に追加)
  chart:      'M4 20h16M7 20v-6m5 6V8m5 12v-9',
  chartDown:  'M3 7l6 6 4-4 8 8m0-5v5h-5',
  sparkle:    'M12 4l1.6 4.8L18 10l-4.4 1.2L12 16l-1.6-4.8L6 10l4.4-1.2z',
  trophy:     'M8 4h8v4a4 4 0 0 1-8 0zM8 5H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3M10 14h4M9 20h6m-3-6v6',
  medal:      'M7 3l3 6m4-6-3 6M12 21a6 6 0 1 1 0-12 6 6 0 0 1 0 12m0-3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  fire:       'M12 2c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1.5.6-2.7 1.5-3.6C9.8 7 11 5 12 2z',
  eye:        'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7m10-3a3 3 0 1 1 0 6 3 3 0 0 1 0-6',
  tools:      'M14 6a4 4 0 0 1 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2zM4 20l3-3',
  note:       'M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 4v4h4M8 13h8M8 17h5',
  pin:        'M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 17v4',
  alert:      'M12 3 2 20h20zM12 10v4m0 3h.01',
  sun:        'M12 4v2m0 12v2M4 12H2m20 0h-2M5.5 5.5 4 4m16 16-1.5-1.5M5.5 18.5 4 20m16-16-1.5 1.5M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8',

  // Weather (KR 自信度スケール)
  cloud:      'M6.5 17a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.5 1.3A3.5 3.5 0 0 1 16 17z',
  rain:       'M6.5 14a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.5 1.3A3.5 3.5 0 0 1 16 14M8 18l-1 2m5-2-1 2m5-2-1 2',
  storm:      'M6.5 13a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.5 1.3A3.5 3.5 0 0 1 16 13M11 14l-2 4h3l-1 4',
  partly:     'M8.5 8.5a3 3 0 1 1 4.2 4M6.5 18a3.5 3.5 0 0 1 .5-7 5 5 0 0 1 9.5 1.3A3 3 0 0 1 16 18z',
}

export default function Icon({ name, size = 16, stroke = 1.6, className = '', style }) {
  const d = ICON_PATHS[name]
  if (!d) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[Icon] unknown icon name: "${name}"`)
    }
    return null
  }
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

// 利用可能なアイコン名一覧 (デバッグ用 + コード補完用)
export const ICON_NAMES = Object.keys(ICON_PATHS)
