'use client'
// iOS / iPadOS 風の汎用 UI 部品 (Plan B)
// - SegmentedControl: 「今週/今月/全期間」のような3〜5択タブ
// - Toggle: チェックボックスの代替となる丸いトグル
// - LargeTitle: ページ最上部の大型タイトル (Text-2xl Font-bold)
// - SheetModal: 上から滑り込むシート型モーダル (背景 backdrop-blur)
// - EmptyState: アイコン+説明+ボタンの定型空状態

import { useEffect } from 'react'

// ─── セグメンテッドコントロール ────────────────────────────────────────
// items: [{ key, label, count? }]   value: key
// onChange(key) で切替
export function SegmentedControl({ T, items, value, onChange, size = 'md', fullWidth = false }) {
  const padding = size === 'sm' ? '4px 10px' : size === 'lg' ? '8px 16px' : '6px 12px'
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 14 : 12

  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        background: T.sectionBg || 'rgba(0,0,0,0.05)',
        padding: 2, borderRadius: 9, gap: 2,
        width: fullWidth ? '100%' : 'auto',
      }}
    >
      {items.map(it => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange && onChange(it.key)}
            style={{
              flex: fullWidth ? 1 : 'none',
              padding, borderRadius: 7, border: 'none',
              background: active ? (T.bgCard || '#FFFFFF') : 'transparent',
              color: active ? T.text : T.textMuted,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04)' : 'none',
              fontSize, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              whiteSpace: 'nowrap',
            }}
          >
            <span>{it.label}</span>
            {typeof it.count === 'number' && (
              <span style={{
                padding: '1px 7px', borderRadius: 99,
                background: active ? `${T.accent}1f` : 'rgba(0,0,0,0.08)',
                color: active ? T.accent : T.textMuted,
                fontSize: 10, fontWeight: 800, minWidth: 16, textAlign: 'center',
              }}>{it.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── トグルスイッチ ───────────────────────────────────────────────────
export function Toggle({ T, checked, onChange, label, disabled = false, size = 'md' }) {
  const w = size === 'sm' ? 36 : size === 'lg' ? 56 : 46
  const h = size === 'sm' ? 22 : size === 'lg' ? 32 : 26
  const knob = h - 4
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          position: 'relative', width: w, height: h, flexShrink: 0,
          background: checked ? (T.success || '#34C759') : 'rgba(120,120,128,0.32)',
          borderRadius: 99, transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? (w - knob - 2) : 2,
          width: knob, height: knob, background: '#FFFFFF', borderRadius: '50%',
          boxShadow: '0 2px 4px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)',
          transition: 'left 0.2s ease',
        }} />
      </span>
      {label && <span style={{ fontSize: 13, color: T.text, fontFamily: 'inherit' }}>{label}</span>}
    </label>
  )
}

// ─── 大型タイトル (iOS Large Title) ────────────────────────────────────
export function LargeTitle({ T, title, subtitle, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 12,
      padding: '20px 0 12px', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          fontSize: 28, fontWeight: 800, color: T.text, margin: 0, lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>{title}</h1>
        {subtitle && (
          <div style={{ marginTop: 4, fontSize: 13, color: T.textMuted, fontWeight: 500 }}>
            {subtitle}
          </div>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

// ─── シート型モーダル ───────────────────────────────────────────────────
// 背景 backdrop-blur、下から (またはモバイルでは下スクロール) 滑り込み
export function SheetModal({ T, open, onClose, title, children, footer, maxWidth = 560 }) {
  // ESC で閉じる
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose() }
    document.addEventListener('keydown', onKey)
    // 背景スクロールロック
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'iosSheetFadeIn 0.2s ease',
      }}
    >
      <style>{`
        @keyframes iosSheetFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes iosSheetSlideIn {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth, maxHeight: '90vh',
          background: T.bgCard, borderRadius: 18,
          boxShadow: '0 24px 60px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'iosSheetSlideIn 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {(title || onClose) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: T.text }}>{title}</div>
            {onClose && (
              <button onClick={onClose} aria-label="閉じる" style={{
                background: 'rgba(120,120,128,0.16)', border: 'none', borderRadius: '50%',
                width: 28, height: 28, color: T.textMuted, fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit', lineHeight: 1,
              }}>×</button>
            )}
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, minHeight: 0 }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: '12px 20px', borderTop: `1px solid ${T.border}`,
            display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 空状態 ─────────────────────────────────────────────────────────────
export function EmptyState({ T, icon = '📭', title, description, actionLabel, onAction }) {
  return (
    <div style={{
      padding: '48px 20px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 4 }}>{icon}</div>
      {title && (
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
      )}
      {description && (
        <div style={{ fontSize: 12, color: T.textMuted, maxWidth: 320, lineHeight: 1.55 }}>
          {description}
        </div>
      )}
      {actionLabel && onAction && (
        <button onClick={onAction} style={{
          marginTop: 8, padding: '8px 18px', borderRadius: 9,
          background: T.accent || '#007AFF', color: '#FFFFFF', border: 'none',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,122,255,0.30)',
        }}>{actionLabel}</button>
      )}
    </div>
  )
}
