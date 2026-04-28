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

// ─── 検索バー (iOS 風) ──────────────────────────────────────────────────
import { useState, useRef } from 'react'
export function SearchBar({ T, value, onChange, placeholder = '検索', autoFocus = false, onCancel }) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      <div style={{
        flex: 1, position: 'relative', display: 'flex', alignItems: 'center',
        background: 'rgba(120,120,128,0.12)', borderRadius: 10,
        transition: 'all 0.2s ease',
      }}>
        <span style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: T.textMuted, fontSize: 14, pointerEvents: 'none',
        }}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={value || ''}
          onChange={e => onChange && onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '8px 12px 8px 32px', fontSize: 14,
            background: 'transparent', border: 'none', outline: 'none',
            color: T.text, fontFamily: 'inherit', borderRadius: 10,
            boxSizing: 'border-box',
          }}
        />
        {value && (
          <button
            onClick={() => { onChange && onChange(''); inputRef.current?.focus() }}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              width: 18, height: 18, borderRadius: '50%',
              background: 'rgba(120,120,128,0.4)', color: '#FFFFFF',
              border: 'none', fontSize: 11, lineHeight: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}>×</button>
        )}
      </div>
      {focused && onCancel && (
        <button
          onMouseDown={e => { e.preventDefault(); onCancel() }}
          style={{
            background: 'transparent', border: 'none', color: T.accent,
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            padding: '0 4px', whiteSpace: 'nowrap',
          }}>キャンセル</button>
      )}
    </div>
  )
}

// ─── グループ化リスト (Settings.app 風) ────────────────────────────────
// items: [{ key, icon?, label, sub?, color?, onClick?, right?, disabled? }]
export function GroupedList({ T, title, items, footer }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {title && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: T.textMuted,
          padding: '0 14px 8px', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{title}</div>
      )}
      <div style={{
        background: T.bgCard, borderRadius: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        {items.map((it, i) => {
          const isLast = i === items.length - 1
          const clickable = !it.disabled && it.onClick
          return (
            <div
              key={it.key}
              onClick={() => clickable && it.onClick()}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                borderBottom: isLast ? 'none' : `0.5px solid ${T.border}`,
                cursor: clickable ? 'pointer' : 'default',
                opacity: it.disabled ? 0.4 : 1,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {it.icon && (
                <div style={{
                  width: 30, height: 30, borderRadius: 7,
                  background: it.color ? `${it.color}1f` : 'rgba(0,122,255,0.10)',
                  color: it.color || T.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{it.icon}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: T.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{it.label}</div>
                {it.sub && (
                  <div style={{
                    fontSize: 11, color: T.textMuted, marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{it.sub}</div>
                )}
              </div>
              {it.right ? (
                <div style={{ flexShrink: 0 }}>{it.right}</div>
              ) : clickable ? (
                <span style={{ color: T.textFaint, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>›</span>
              ) : null}
            </div>
          )
        })}
      </div>
      {footer && (
        <div style={{ fontSize: 11, color: T.textMuted, padding: '6px 14px 0', lineHeight: 1.5 }}>
          {footer}
        </div>
      )}
    </div>
  )
}

// ─── 立体的なダッシュボードカード (グラスモーフィズム + マルチシャドウ) ─────
// onClick / icon / title / sub / color (アクセント) / chevron
export function DashboardTile({ T, icon, title, sub, color = '#007AFF', onClick, badge, status }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        textAlign: 'left',
        background: T.bgCard, border: 'none',
        borderRadius: 18, padding: '20px 18px',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit',
        // 立体感: 3層シャドウ
        boxShadow: `
          0 1px 2px rgba(0,0,0,0.04),
          0 4px 12px rgba(0,0,0,0.05),
          0 16px 40px rgba(0,0,0,0.04)
        `,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column', gap: 14,
        minHeight: 132,
      }}
      onMouseEnter={e => {
        if (!onClick) return
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = `
          0 2px 4px rgba(0,0,0,0.06),
          0 8px 20px rgba(0,0,0,0.06),
          0 24px 48px ${color}26
        `
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = `
          0 1px 2px rgba(0,0,0,0.04),
          0 4px 12px rgba(0,0,0,0.05),
          0 16px 40px rgba(0,0,0,0.04)
        `
      }}
      onMouseDown={e => onClick && (e.currentTarget.style.transform = 'translateY(-1px) scale(0.985)')}
      onMouseUp={e => onClick && (e.currentTarget.style.transform = 'translateY(-3px)')}
    >
      {/* グラデーション帯 (色アクセント) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: `linear-gradient(90deg, ${color} 0%, ${color}aa 100%)`,
      }} />
      {/* 透過オーバーレイ (微妙な色味) */}
      <div style={{
        position: 'absolute', top: 0, right: -40, width: 160, height: 160,
        background: `radial-gradient(circle, ${color}10 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* アイコン (グラスモーフィズム) */}
      <div style={{
        width: 50, height: 50, borderRadius: 13,
        background: `linear-gradient(135deg, ${color}28 0%, ${color}10 100%)`,
        border: `1px solid ${color}40`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, lineHeight: 1, flexShrink: 0,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 4px ${color}1f`,
      }}>{icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 800, color: T.text,
          letterSpacing: '-0.01em', lineHeight: 1.3, marginBottom: 4,
        }}>{title}</div>
        {sub && (
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.45 }}>{sub}</div>
        )}
      </div>

      {(status || badge) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
          {status && (
            <span style={{ fontSize: 11, color, fontWeight: 700 }}>{status}</span>
          )}
          {badge && (
            <span style={{
              padding: '2px 8px', borderRadius: 99,
              background: `${color}1f`, color, fontSize: 10, fontWeight: 800,
            }}>{badge}</span>
          )}
        </div>
      )}
    </button>
  )
}
