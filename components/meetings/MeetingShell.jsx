'use client'
import { useState, useMemo } from 'react'
import { MODULE_COMPONENTS, MODULE_META } from '../../lib/meetings/moduleRegistry'
import { TYPO, RADIUS, SPACING } from '../../lib/themeTokens'

// ─────────────────────────────────────────────────────────────
// 会議シェル (Phase 5d 骨格)
//
// organization_meetings.modules 配列を受け取り、各モジュールを順次レンダリングする
// 進行 UI を提供する。
//
// 構造:
//   ヘッダー (会議名 + 終了ボタン)
//   ステッパー (モジュール一覧。クリックでジャンプ可)
//   モジュール本体 (現在ステップのモジュールを描画)
//   フッター (← 前 / N/M / 次 →)
//
// 現状は skeleton モジュールを並べて表示するだけ。Phase 5c で各モジュールの
// 実体実装が完了するに従って、自然に動き始める。
// ─────────────────────────────────────────────────────────────

export default function MeetingShell({ meeting, weekStart, T, members = [], levels = [], onExit }) {
  // modules を sort_order でソート
  const sortedModules = useMemo(() => {
    const list = meeting?.modules || []
    return [...list].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }, [meeting])

  const [currentStep, setCurrentStep] = useState(0)
  const current = sortedModules[currentStep]
  const ModuleComponent = current ? MODULE_COMPONENTS[current.type] : null

  if (!meeting) {
    return (
      <div style={{ flex: 1, padding: SPACING.lg, color: T?.textMuted, textAlign: 'center' }}>
        会議が選択されていません
      </div>
    )
  }

  if (sortedModules.length === 0) {
    return (
      <div style={{ flex: 1, padding: SPACING.lg, color: T?.textMuted, textAlign: 'center' }}>
        この会議にモジュールが設定されていません。組織設定 → 会議設定 から追加してください。
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: T?.bg,
      overflow: 'hidden',
    }}>
      {/* ヘッダ: 会議名 + 終了ボタン */}
      <div style={{
        padding: `${SPACING.sm}px ${SPACING.lg}px`,
        borderBottom: `1px solid ${T?.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: SPACING.md,
        flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `${meeting.color || T?.accent}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, flexShrink: 0,
        }}>{meeting.icon || '📋'}</div>
        <div style={{ ...TYPO.headline, color: T?.text, flex: 1 }}>{meeting.title}</div>
        {onExit && (
          <button onClick={onExit} style={{
            padding: '4px 10px', borderRadius: 6,
            border: `1px solid ${T?.border}`,
            background: 'transparent', color: T?.textSub,
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>会議終了</button>
        )}
      </div>

      {/* ステッパー */}
      <div style={{
        padding: `${SPACING.sm}px ${SPACING.lg}px`,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap',
        borderBottom: `1px solid ${T?.border}`,
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        {sortedModules.map((m, i) => {
          const mod = MODULE_META[m.type] || { icon: '❓', label: m.type }
          const active = i === currentStep
          const completed = i < currentStep
          return (
            <button key={`${m.type}-${i}`} onClick={() => setCurrentStep(i)} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 999,
              border: `1px solid ${active ? (meeting.color || T?.accent) : T?.border}`,
              background: active
                ? `${meeting.color || T?.accent}18`
                : (completed ? 'rgba(52,199,89,0.08)' : 'transparent'),
              color: active ? T?.text : (completed ? '#34C759' : T?.textSub),
              fontSize: 11, fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}>
              <span>{mod.icon}</span>
              <span>{mod.label}</span>
              {completed && <span style={{ marginLeft: 2 }}>✓</span>}
            </button>
          )
        })}
      </div>

      {/* 現在モジュール本体 */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
        {ModuleComponent ? (
          <ModuleComponent
            meeting={meeting}
            config={current.config || {}}
            weekStart={weekStart}
            T={T}
            members={members}
            levels={levels}
          />
        ) : (
          <div style={{ padding: SPACING.lg, color: T?.danger }}>
            未登録モジュール: <code>{current?.type}</code>
            <div style={{ marginTop: SPACING.xs, ...TYPO.caption, color: T?.textMuted }}>
              lib/meetings/moduleRegistry.js の MODULE_COMPONENTS に追加してください
            </div>
          </div>
        )}
      </div>

      {/* 下部ナビ */}
      <div style={{
        padding: `${SPACING.sm}px ${SPACING.lg}px`,
        borderTop: `1px solid ${T?.border}`,
        display: 'flex', alignItems: 'center', gap: SPACING.sm,
        flexShrink: 0,
        background: T?.bgCard,
      }}>
        <button
          onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          style={{
            padding: '6px 14px', borderRadius: 7,
            border: `1px solid ${T?.border}`,
            background: 'transparent',
            color: currentStep === 0 ? T?.textFaint : T?.text,
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
          }}
        >← 前</button>
        <div style={{ flex: 1, textAlign: 'center', ...TYPO.caption, color: T?.textMuted }}>
          ステップ {currentStep + 1} / {sortedModules.length}
        </div>
        <button
          onClick={() => setCurrentStep(s => Math.min(sortedModules.length - 1, s + 1))}
          disabled={currentStep >= sortedModules.length - 1}
          style={{
            padding: '6px 14px', borderRadius: 7, border: 'none',
            background: currentStep >= sortedModules.length - 1
              ? T?.border
              : (meeting.color || T?.accent),
            color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            cursor: currentStep >= sortedModules.length - 1 ? 'not-allowed' : 'pointer',
            opacity: currentStep >= sortedModules.length - 1 ? 0.5 : 1,
          }}
        >次 →</button>
      </div>
    </div>
  )
}
