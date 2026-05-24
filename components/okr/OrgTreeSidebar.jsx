'use client'
// 組織階層サイドバー (唯一の正) — OKR 組織ビュー (年間/週次) で共有。
// 「部署」見出し + 「全部署」行 + parent_id でツリー化した階層を再帰描画。
// 週次×組織 (WeeklyMTGPage) の現行ツリー (シンプル版) の見た目・挙動を踏襲。
import Icon, { DataIcon } from '../Icon'
import { TYPO, SPACING, RADIUS } from '../../lib/themeTokens'

export default function OrgTreeSidebar({ T, levels = [], activeLevelId, onSelectLevel }) {
  const roots = (levels || []).filter(l => !l.parent_id)

  function renderRow(level, indent = 0) {
    const isActive = Number(activeLevelId) === Number(level.id)
    return (
      <div key={level.id}>
        <div onClick={() => onSelectLevel?.(isActive ? null : level.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `6px ${SPACING.sm}px`, paddingLeft: 8 + indent * 14, borderRadius: 7, cursor: 'pointer', marginBottom: 2, border: `1px solid ${isActive ? `${T.accent}40` : 'transparent'}`, background: isActive ? T.accentBg : 'transparent' }}>
          <span style={{ display: 'inline-flex', color: isActive ? T.accentText : T.textMuted }}><DataIcon value={level.icon} size={13} /></span>
          <span style={{ ...TYPO.footnote, flex: 1, fontWeight: isActive ? 700 : 500, color: isActive ? T.accentText : T.textSub }}>{level.name}</span>
        </div>
        {(levels || []).filter(l => Number(l.parent_id) === Number(level.id)).map(c => renderRow(c, indent + 1))}
      </div>
    )
  }

  return (
    <>
      <div style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: SPACING.sm, paddingLeft: SPACING.sm }}>部署</div>
      <div onClick={() => onSelectLevel?.(null)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `6px ${SPACING.sm}px`, borderRadius: RADIUS.xs + 1, cursor: 'pointer', marginBottom: 2, border: `1px solid ${!activeLevelId ? T.accent : 'transparent'}`, background: !activeLevelId ? T.accentBg : 'transparent' }}>
        <Icon name="building" size={13} style={{ color: !activeLevelId ? T.accent : T.textSub }} />
        <span style={{ ...TYPO.footnote, flex: 1, fontWeight: !activeLevelId ? 700 : 500, color: !activeLevelId ? T.accent : T.textSub }}>全部署</span>
      </div>
      {roots.map(r => renderRow(r, 0))}
    </>
  )
}
