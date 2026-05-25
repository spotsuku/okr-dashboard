'use client'
// メンバー一覧サイドバー (唯一の正) — OKR 個人ビュー (年間/週次) で共有。
// 部署フィルタ + メンバー行 (アバター/名前/役職)。色は lib/avatarColor で統一。
import { avatarColor } from '../../lib/avatarColor'
import { RADIUS, TYPO } from '../../lib/themeTokens'

function memberLevelIds(m) {
  return Array.isArray(m.level_ids) ? m.level_ids.map(Number) : (m.level_id ? [Number(m.level_id)] : [])
}
function deptDescendants(levels, rootId) {
  const set = new Set([Number(rootId)])
  let added = true
  while (added) {
    added = false
    for (const l of (levels || [])) {
      if (l.parent_id != null && set.has(Number(l.parent_id)) && !set.has(Number(l.id))) { set.add(Number(l.id)); added = true }
    }
  }
  return set
}

export default function MemberSidebar({ T, members = [], levels = [], selectedName, onSelect, deptFilter, onDeptFilterChange }) {
  const filtered = members.filter(m => {
    if (!deptFilter) return true
    const set = deptDescendants(levels, deptFilter)
    return memberLevelIds(m).some(id => set.has(id))
  })
  return (
    <div style={{ padding: '12px 10px' }}>
      <div style={{ ...TYPO.caption, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 4 }}>メンバー</div>
      <select value={deptFilter ?? ''} onChange={e => onDeptFilterChange?.(e.target.value ? Number(e.target.value) : null)}
        style={{ width: '100%', marginBottom: 10, padding: '6px 8px', borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
        <option value="">全部署</option>
        {(levels || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      {filtered.length === 0 && (
        <div style={{ fontSize: 11, color: T.textFaint, fontStyle: 'italic', padding: '8px' }}>該当メンバーなし</div>
      )}
      {filtered.map(m => {
        const active = m.name === selectedName
        const c = avatarColor(m.name)
        return (
          <div key={m.id} onClick={() => onSelect?.(m.name)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
            background: active ? T.navActiveBg : 'transparent',
            border: `1px solid ${active ? T.accent : 'transparent'}`,
            transition: 'all 0.15s',
          }}>
            {m.avatar_url ? (
              <img src={m.avatar_url} alt={m.name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${c}25`, border: `1.5px solid ${c}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: c, flexShrink: 0 }}>{m.name.slice(0, 2)}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? T.navActiveText : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
              {m.role && <div style={{ fontSize: 9.5, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.role}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
