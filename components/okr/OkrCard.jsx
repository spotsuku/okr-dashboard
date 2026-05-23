'use client'
// OKR カードの器 (唯一の正) — 全ビューのカード描画はこれを通す。
// 白背景 + 1px枠 + 角丸 + 影。active時のみ accent枠 + accentBg。
// グラデ背景・左4px縦線・部署色塗りは一切しない (色は中の pill / バーで表現)。
import { RADIUS, SHADOWS } from '../../lib/themeTokens'

export default function OkrCard({ T, active = false, onClick, padding = '14px 16px', style, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding,
        background: active ? T.accentBg : T.bgCard,
        border: `1px solid ${active ? T.accent : T.border}`,
        borderRadius: RADIUS.md,
        boxShadow: active ? SHADOWS.sm : SHADOWS.xs,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.18s ease',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
