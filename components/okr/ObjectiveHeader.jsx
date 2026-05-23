'use client'
// OBJECTIVE ヘッダ (.objh) — OKR 全ビュー共通。
// アイコン + meta行(事業部/期間/達成状況/担当チップ) + h2 + footer(進捗バー+%+KR/KA件数)。
import Icon from '../Icon'
import AssigneeChip from './AssigneeChip'
import { pctColor, pctColorBg, pctStatusLabel } from '../../lib/okrColors'
import { SHADOWS } from '../../lib/themeTokens'

export default function ObjectiveHeader({
  T, deptName, periodLabel, pct, ownerName, ownerAvatarUrl, title,
  krCount, kaCount, right, style,
}) {
  const col = pctColor(T, pct)
  const colBg = pctColorBg(T, pct)
  const neutralPill = { padding: '2px 8px', fontSize: 10.5, fontWeight: 700, borderRadius: 99, background: T.borderLight || T.sectionBg, color: T.textSub }
  return (
    <div style={{
      padding: '18px 22px', background: T.bgCard,
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${T.border}`, borderRadius: 14,
      boxShadow: SHADOWS.sm, display: 'flex', gap: 14, ...style,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: T.accentBg, color: T.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name="target" size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          {deptName && <span style={neutralPill}>{deptName}</span>}
          {periodLabel && <span style={neutralPill}>{periodLabel}</span>}
          {pct != null && <span style={{ padding: '2px 8px', fontSize: 10.5, fontWeight: 700, borderRadius: 99, background: colBg, color: col }}>{pctStatusLabel(pct)}</span>}
          {ownerName && <AssigneeChip T={T} name={ownerName} avatarUrl={ownerAvatarUrl} />}
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.45, letterSpacing: '-0.005em', color: T.text }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <div style={{ flex: '0 0 140px', height: 4, background: T.sunken, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(pct || 0, 100)}%`, background: col }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: col }}>{pct != null ? `${pct}%` : '−'}</span>
          {krCount != null && <span style={{ padding: '2px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, background: T.accentBg, color: T.accentText }}>KR {krCount}件</span>}
          {kaCount != null && <span style={{ padding: '2px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, background: T.borderLight || T.sectionBg, color: T.textSub }}>KA {kaCount}件</span>}
        </div>
      </div>
      {right && <div style={{ flexShrink: 0, alignSelf: 'flex-start' }}>{right}</div>}
    </div>
  )
}
