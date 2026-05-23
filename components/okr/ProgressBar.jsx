'use client'
// OKR 進捗バー (唯一の正) — solid 値色のみ。グラデ禁止。
// 値色は lib/okrColors の 4 段階 (danger/warn/success/accent) に従う。
import { RADIUS } from '../../lib/themeTokens'
import { pctColor } from '../../lib/okrColors'

export default function ProgressBar({ T, pct, height = 4, track, fixedWidth, style }) {
  const v = Math.max(Math.min(pct || 0, 100), 0)
  return (
    <div style={{
      flex: fixedWidth ? `0 0 ${fixedWidth}px` : undefined,
      width: fixedWidth || '100%',
      height, background: track || T.sunken,
      borderRadius: RADIUS.pill, overflow: 'hidden', ...style,
    }}>
      <div style={{
        height: '100%', width: `${v}%`,
        background: pctColor(T, pct),
        borderRadius: RADIUS.pill, transition: 'width 0.3s ease-out',
      }} />
    </div>
  )
}
