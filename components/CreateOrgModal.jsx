'use client'
// 組織作成モーダル (Phase 4 SaaS化)
//   - NoOrgScreen で「組織を作成」ボタン → モーダル
//   - OrgSwitcher の "+" でも将来再利用予定
//
// Props:
//   open: boolean
//   onClose: () => void
//   onCreated: (org) => void          // org = { id, slug, name }
//   userEmail: string                  // 現在ログイン中の email (owner として登録)
import { useState, useEffect } from 'react'
import Icon from './Icon'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { btnPrimary, btnSecondary, inputStyle, cardStyle } from '../lib/iosStyles'

const SLUG_HINT_RE = /^[a-z0-9-]*$/
const T = COMMON_TOKENS.light

export default function CreateOrgModal({ open, onClose, onCreated, userEmail }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [touchedSlug, setTouchedSlug] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setName(''); setSlug(''); setTouchedSlug(false); setError(''); setSubmitting(false)
    }
  }, [open])

  // 自動 slug 生成 (name → 英小文字+ハイフン)
  const autoSlug = (n) => n.toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  const handleName = (v) => {
    setName(v)
    if (!touchedSlug) setSlug(autoSlug(v))
  }
  const handleSlug = (v) => {
    setTouchedSlug(true)
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))
  }

  const submit = async () => {
    setError('')
    if (!name.trim()) { setError('組織名を入力してください'); return }
    if (!slug || slug.length < 2) { setError('slug は 2 文字以上で入力してください'); return }
    if (!SLUG_HINT_RE.test(slug)) { setError('slug は英小文字・数字・ハイフンのみ'); return }
    if (slug.startsWith('-') || slug.endsWith('-')) { setError('slug の先頭末尾はハイフン不可'); return }
    if (!userEmail) { setError('ログインユーザー情報が取れません。再ログインしてください。'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/org/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug, name: name.trim(),
          owner_email: userEmail,
          owner_name: userEmail.split('@')[0],
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`)
        setSubmitting(false)
        return
      }
      onCreated(j.organization)
    } catch (e) {
      setError(e.message || '作成エラー')
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,.4)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        ...cardStyle({ T, padding: 0 }),
        width: 'min(480px, 92vw)',
        borderRadius: RADIUS.xl,
        boxShadow: SHADOWS.xl,
        overflow: 'hidden',
        fontFamily: '"Inter", "Noto Sans JP", -apple-system, system-ui, sans-serif',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, background: T.sectionBg }}>
          <div style={{ ...TYPO.headline, fontWeight: 800, color: T.text }}>新しい組織を作成</div>
          <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: 4 }}>
            作成すると自分が owner として登録されます
          </div>
        </div>

        <div style={{ padding: 20, color: T.text }}>
          <Field label="組織名" hint="例: NEO福岡、株式会社 ABC">
            <input
              type="text" value={name} onChange={e => handleName(e.target.value)}
              autoFocus disabled={submitting} placeholder="組織名を入力"
              style={inputStyle({ T })}
            />
          </Field>

          <Field label="URL slug" hint={`URL は /${slug || 'your-slug'} になります (英小文字+数字+ハイフン)`}>
            <input
              type="text" value={slug} onChange={e => handleSlug(e.target.value)}
              disabled={submitting} placeholder="your-slug"
              style={{ ...inputStyle({ T }), fontFamily: 'ui-monospace, monospace' }}
            />
          </Field>

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 12px', ...TYPO.subhead, fontWeight: 600,
              color: T.danger, background: T.dangerSoft,
              borderRadius: RADIUS.sm,
              display: 'flex', alignItems: 'center', gap: 6,
            }}><Icon name="alert" size={13} /> {error}</div>
          )}
        </div>

        <div style={{
          padding: 14, borderTop: `1px solid ${T.border}`, background: T.sectionBg,
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} disabled={submitting} style={btnSecondary({ T, size: 'md' })}>
            キャンセル
          </button>
          <button onClick={submit} disabled={submitting || !name.trim() || !slug} style={btnPrimary({ T, size: 'md' })}>
            {submitting ? '作成中...' : '作成して開く'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...TYPO.caption, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}
