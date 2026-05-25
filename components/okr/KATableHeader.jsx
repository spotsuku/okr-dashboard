'use client'
// 週次 Good/More/Focus テーブルのヘッダ (唯一の正)。両週次ビューで共有。
// 列: [drag(任意)] 担当 / KAタイトル / 状態 / Good / More / Focus / タスク / spacer
import { kaHeaderCellStyle } from '../../lib/okrKaStyles'

export default function KATableHeader({ T, dragCol = false, subGood, subMore, subFocus }) {
  const th = kaHeaderCellStyle(T)
  const sub = (s) => s ? <span style={{ display: 'block', fontSize: 9, color: T.textMuted, fontWeight: 500, letterSpacing: 0, marginTop: 1 }}>{s}</span> : null
  return (
    <thead>
      <tr style={{ background: T.bgCard }}>
        {dragCol && <th style={{ ...th, width: 28, borderRight: 'none' }} />}
        <th style={{ ...th, width: 52 }}>担当</th>
        <th style={{ ...th, minWidth: 120 }}>KAタイトル</th>
        <th style={{ ...th, width: 64, textAlign: 'center' }}>状態</th>
        <th style={th}><span style={{ color: T.success }}>Good</span>{sub(subGood)}</th>
        <th style={th}><span style={{ color: T.warn }}>More</span>{sub(subMore)}</th>
        <th style={th}><span style={{ color: T.accentText }}>Focus</span>{sub(subFocus)}</th>
        <th style={{ ...th, width: 56, textAlign: 'center' }}>タスク</th>
        <th style={{ ...th, width: 20, borderRight: 'none' }} />
      </tr>
    </thead>
  )
}
