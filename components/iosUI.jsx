'use client'
// iOS / iPadOS 風の汎用 UI 部品 (Plan B)
//
// スタイル値は lib/iosStyles.js のファクトリから取得 → トンマナの中央管理。
// このファイルの style={{...}} の値はファクトリ呼び出しに置き換え推奨。
import {
  cardStyle, cardHover, heroStyle, sectionHeaderStyle,
  pillStyle, btnPrimary, btnSecondary, btnGhost, btnDanger,
  inputStyle, glassBarStyle, accentRingStyle,
  kpiNumber, largeTitle as ts_largeTitle, pageSubtitle,
} from '../lib/iosStyles'
import { SHADOWS, RADIUS, SPACING, TYPO, GLASS, TRANSITION } from '../lib/themeTokens'
// （以下の本体はまだ inline 値を一部残していますが、新規利用は上記ファクトリに統一）
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

// ─── ヒーローカード (大きいグラデーション ヘッダー) ───────────────────────
// title (大文字), subtitle, eyebrow (上の小さなラベル), color (System Blue 等)
export function HeroCard({ T, eyebrow, title, subtitle, color = '#007AFF', right, children }) {
  return (
    <div style={{
      marginTop: 16, marginBottom: 22,
      padding: '26px 26px 22px',
      background: `linear-gradient(135deg, ${color}f5 0%, ${color}c0 60%, ${color}80 100%)`,
      borderRadius: 22,
      color: '#FFFFFF',
      position: 'relative', overflow: 'hidden',
      boxShadow: `0 1px 2px rgba(0,0,0,0.06), 0 8px 24px ${color}33, 0 24px 56px ${color}26`,
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: -80, right: -60, width: 280, height: 280,
        background: 'radial-gradient(circle, rgba(255,255,255,0.30) 0%, transparent 60%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: -100, left: -40, width: 240, height: 240,
        background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 65%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              opacity: 0.85, textTransform: 'uppercase', marginBottom: 8,
            }}>{eyebrow}</div>
          )}
          <div style={{
            fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em',
            lineHeight: 1.15, marginBottom: subtitle ? 6 : 0,
          }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, opacity: 0.92 }}>{subtitle}</div>}
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
      {children && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: 16 }}>{children}</div>
      )}
    </div>
  )
}

// ─── 立体感のある カード (汎用ラッパー) ───────────────────────────────────
// padding / background / border / shadow を iOS 風で統一。
// 普通のカードコンテナとして全画面で使い回す。
export function Card({ T, children, padding = 18, accent, style, onClick, hoverable = false, fullHeight = false }) {
  const accentBg = accent ? `linear-gradient(180deg, ${T.bgCard} 0%, ${accent}05 100%)` : T.bgCard
  const accentBorder = accent ? `${accent}1f` : T.border
  const shadow = `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05), 0 16px 40px rgba(0,0,0,0.04)`
  const shadowHover = accent
    ? `0 1px 2px rgba(0,0,0,0.06), 0 6px 16px ${accent}1a, 0 24px 56px ${accent}26`
    : `0 1px 2px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.06), 0 24px 48px rgba(0,0,0,0.08)`
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        background: accentBg,
        border: `1px solid ${accentBorder}`,
        borderRadius: 16, padding,
        boxShadow: shadow,
        height: fullHeight ? '100%' : undefined,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        ...style,
      }}
      onMouseEnter={hoverable && onClick ? e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = shadowHover } : undefined}
      onMouseLeave={hoverable && onClick ? e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = shadow } : undefined}
    >
      {/* 上端ハイライト (微妙なガラス感) */}
      {accent && (
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: 12, right: 12, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
          pointerEvents: 'none',
        }} />
      )}
      {children}
    </div>
  )
}

// ─── セクションヘッダー (label + sub の組) ──────────────────────────────
export function SectionHeader({ T, label, sub, right, marginTop = 0 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      padding: '0 4px 12px', marginTop,
    }}>
      <h2 style={{
        fontSize: 18, fontWeight: 800, color: T.text, margin: 0,
        letterSpacing: '-0.01em',
      }}>{label}</h2>
      {sub && <span style={{ fontSize: 12, color: T.textMuted }}>{sub}</span>}
      {right && (<><div style={{ flex: 1 }} /><div style={{ flexShrink: 0 }}>{right}</div></>)}
    </div>
  )
}

// ─── 背景の青グロウ (画面トップに置くやわらかい光) ──────────────────────
export function BgGlow({ T, color }) {
  const c = color || T.accent || '#007AFF'
  return (
    <div aria-hidden style={{
      position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)',
      width: 800, height: 600,
      background: `radial-gradient(ellipse, ${c}18 0%, transparent 60%)`,
      pointerEvents: 'none', filter: 'blur(40px)', zIndex: 0,
    }} />
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

// ─── ラインアイコン (SVG, 24x24 viewBox, stroke-width=2) ───────────────────
// Heroicons / Lucide 風の自家製ミニマル・ライン アイコン
const ICON_PATHS = {
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  users: (
    <>
      <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
      <path d="M3 21a9 9 0 0 1 18 0" />
    </>
  ),
  trendingUp: (
    <>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M14 5h7v7" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15" />
      <path d="M3 21h18" />
      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20v-7" />
      <path d="M12 13c0-3 3-6 7-6 0 4-3 7-7 7Z" />
      <path d="M12 13c0-3-3-6-7-6 0 4 3 7 7 7Z" />
    </>
  ),
  palette: (
    <>
      <path d="M12 2a10 10 0 1 0 0 20c1.5 0 2-1.2 2-2.5 0-1.5-1-2.5-1-3.5 0-1 .5-2 2-2h2a4 4 0 0 0 4-4 10 10 0 0 0-9-8Z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  chartPie: (
    <>
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </>
  ),
  envelope: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </>
  ),
  externalLink: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
    </>
  ),
}
export function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 1.8, style }) {
  const path = ICON_PATHS[name]
  if (!path) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', ...(style || {}) }}>
      {path}
    </svg>
  )
}

// ─── 立体的なダッシュボードカード (グラスモーフィズム + マルチシャドウ) ─────
// icon は ICON_PATHS のキー名 (例: 'target') または絵文字文字列。色アクセント color。
export function DashboardTile({ T, icon, title, sub, color = '#007AFF', onClick, badge, status }) {
  const isLineIcon = typeof icon === 'string' && ICON_PATHS[icon]
  const shadowDefault = `0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.04)`
  const shadowHover   = `0 1px 2px rgba(0,0,0,0.06), 0 6px 16px ${color}1a, 0 24px 56px ${color}33`

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left',
        // 微妙にカラーチントが入ったグラデーション (純白の単調さを回避)
        background: `linear-gradient(180deg, ${T.bgCard} 0%, ${color}05 100%)`,
        border: `1px solid ${color}1a`,
        borderRadius: 20, padding: '22px 20px',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit',
        boxShadow: shadowDefault,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column', gap: 14,
        minHeight: 158,
      }}
      onMouseEnter={e => {
        if (!onClick) return
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = shadowHover
        e.currentTarget.style.borderColor = `${color}45`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = shadowDefault
        e.currentTarget.style.borderColor = `${color}1a`
      }}
      onMouseDown={e => onClick && (e.currentTarget.style.transform = 'translateY(-1px) scale(0.985)')}
      onMouseUp={e => onClick && (e.currentTarget.style.transform = 'translateY(-4px)')}
    >
      {/* 上端ハイライト (1px の白い線) — ガラス感 */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 12, right: 12, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
        pointerEvents: 'none',
      }} />
      {/* 右上に放射 グロウ */}
      <div aria-hidden style={{
        position: 'absolute', top: -50, right: -50, width: 180, height: 180,
        background: `radial-gradient(circle, ${color}1a 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* アイコンタイル: 立体感のあるグラデ + ハイライト + 影 */}
      <div style={{
        width: 56, height: 56, borderRadius: 16, flexShrink: 0,
        position: 'relative', overflow: 'hidden',
        background: `linear-gradient(135deg, ${color} 0%, ${color}c0 100%)`,
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.4),
          inset 0 -1px 0 rgba(0,0,0,0.05),
          0 6px 14px ${color}55,
          0 2px 4px ${color}33
        `,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* 内側 ハイライト */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.25), transparent)',
          pointerEvents: 'none',
        }} />
        {isLineIcon ? (
          <Icon name={icon} size={28} color="#FFFFFF" strokeWidth={2.2}
            style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))', position: 'relative' }} />
        ) : (
          <span style={{
            fontSize: 26, lineHeight: 1, position: 'relative',
            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))',
          }}>{icon}</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 800, color: T.text,
          letterSpacing: '-0.01em', lineHeight: 1.3, marginBottom: 4,
        }}>{title}</div>
        {sub && (
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{sub}</div>
        )}
      </div>

      {(status || badge) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
          {status && (
            <span style={{
              fontSize: 11, fontWeight: 700, color,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {status}
              <Icon name="arrowRight" size={12} color={color} strokeWidth={2.4} />
            </span>
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
