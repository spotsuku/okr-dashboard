'use client'
// AI コーチカード (.aifb) — OKR 個人ビュー共通。淡ブランドグラデ + deep-blue タイル。
import Icon from '../Icon'

export default function AICoachCard({ T, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
      padding: '12px 14px', borderRadius: 10,
      border: '1px solid rgba(37,99,235,.18)',
      background: 'linear-gradient(135deg, rgba(37,99,235,.06), rgba(34,211,238,.06))',
      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', ...style,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'linear-gradient(135deg, #3b82f6, #1e3a8a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        flexShrink: 0, boxShadow: '0 2px 6px rgba(30,58,138,.24)',
      }}><Icon name="sparkle" size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.accentText }}>AIコーチにフィードバックをもらう</div>
        <div style={{ fontSize: 10.5, fontWeight: 500, color: T.textSub, marginTop: 1 }}>現在のKR・KA状況をもとにアドバイスをもらえます</div>
      </div>
      <Icon name="arrowRight" size={16} style={{ color: T.accentText, flexShrink: 0 }} />
    </button>
  )
}
