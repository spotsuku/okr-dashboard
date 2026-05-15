'use client'
import { TYPO, RADIUS, SPACING } from '../../../lib/themeTokens'

// 各モジュールの skeleton 共通 UI。Phase 5c で実体実装に置き換える際の足場。
// 「準備中」表示 + 受け取った props を可視化してデバッグしやすくする。
export default function ModuleSkeleton({ icon, label, desc, config, meeting, weekStart, T }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
      gap: SPACING.md,
      background: T?.bg || '#1c1c1e',
      color: T?.text || '#fff',
    }}>
      <div style={{ fontSize: 48 }}>{icon}</div>
      <div style={{ ...TYPO.title2, color: T?.text }}>{label}</div>
      <div style={{ ...TYPO.subhead, color: T?.textSub, textAlign: 'center', maxWidth: 400 }}>
        {desc}
      </div>
      <div style={{
        marginTop: SPACING.md,
        padding: `${SPACING.sm}px ${SPACING.md}px`,
        background: 'rgba(255,193,7,0.1)',
        border: '1px solid rgba(255,193,7,0.3)',
        borderRadius: RADIUS.sm,
        color: '#FFA500',
        fontSize: 12,
        fontWeight: 600,
      }}>
        ⚠ Phase 5c で実装予定 (skeleton)
      </div>

      {/* デバッグ情報: 受け取った props */}
      <details style={{
        marginTop: SPACING.lg,
        fontSize: 11,
        color: T?.textMuted,
        maxWidth: 600,
      }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>props 詳細 (開発者向け)</summary>
        <pre style={{
          marginTop: SPACING.xs,
          padding: SPACING.sm,
          background: T?.bgCard,
          borderRadius: RADIUS.sm,
          fontSize: 10,
          maxHeight: 200,
          overflow: 'auto',
        }}>
{JSON.stringify({
  meeting_key: meeting?.key,
  meeting_title: meeting?.title,
  weekStart,
  config,
  target_filter: meeting?.target_filter,
}, null, 2)}
        </pre>
      </details>
    </div>
  )
}
