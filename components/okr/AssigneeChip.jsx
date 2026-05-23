'use client'
// 担当チップ (.ot.ow) — OKR 全ビュー共通。
// グレー薄ピル + 円アバター(グラデ色 or 画像) + 名前。
import { avatarColor } from '../../lib/avatarColor'

export default function AssigneeChip({ T, name, avatarUrl, size = 18 }) {
  if (!name) return null
  const c = avatarColor(name)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px 3px 4px', background: 'rgba(255,255,255,.7)',
      border: `1px solid ${T.border}`, borderRadius: 99,
      fontSize: 11, color: T.textSub, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <span style={{
          width: size, height: size, borderRadius: '50%',
          background: `linear-gradient(135deg, ${c}, ${c}99)`, color: '#fff',
          fontSize: Math.round(size * 0.5), fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{String(name).slice(0, 1)}</span>
      )}
      {name}
    </span>
  )
}
