'use client'
// Q タブ (.qtab) — OKR 全ビュー共通。下線スタイル + 件数バッジ + 末尾 meta。
export default function QTabs({ T, tabs, active, onChange, trailing }) {
  return (
    <div style={{
      display: 'flex', gap: 0, alignItems: 'baseline',
      borderBottom: `1px solid ${T.border}`, marginBottom: 14, flexWrap: 'wrap',
    }}>
      {(tabs || []).map(t => {
        const isActive = active === t.key
        return (
          <button key={t.key} onClick={() => onChange?.(t.key)} style={{
            padding: '8px 14px', fontSize: 12.5,
            fontWeight: isActive ? 700 : 500,
            color: isActive ? T.accentText : T.textSub,
            background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: `2px solid ${isActive ? T.accent : 'transparent'}`,
            marginBottom: -1, whiteSpace: 'nowrap',
          }}>
            {t.label}
            {t.count != null && <span style={{ marginLeft: 3, fontSize: 11, color: T.textMuted, fontWeight: 500 }}>{t.count}</span>}
          </button>
        )
      })}
      {trailing != null && (
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textMuted, paddingBottom: 6 }}>{trailing}</span>
      )}
    </div>
  )
}
