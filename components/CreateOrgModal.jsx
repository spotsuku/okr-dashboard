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

const SLUG_HINT_RE = /^[a-z0-9-]*$/

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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#1c1c1e', borderRadius: 12, width: 'min(480px, 92vw)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>新しい組織を作成</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            作成すると自分が owner として登録されます
          </div>
        </div>

        <div style={{ padding: 20, color: '#fff' }}>
          <Field label="組織名" hint="例: NEO福岡、株式会社 ABC">
            <input
              type="text" value={name} onChange={e => handleName(e.target.value)}
              autoFocus disabled={submitting} placeholder="組織名を入力"
              style={inputStyle}
            />
          </Field>

          <Field label="URL slug" hint={`URL は /${slug || 'your-slug'} になります (英小文字+数字+ハイフン)`}>
            <input
              type="text" value={slug} onChange={e => handleSlug(e.target.value)}
              disabled={submitting} placeholder="your-slug"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </Field>

          {error && (
            <div style={{
              marginTop: 12, padding: 10, fontSize: 12, color: '#ff453a',
              background: 'rgba(255,69,58,0.12)', borderRadius: 8,
            }}>⚠️ {error}</div>
          )}
        </div>

        <div style={{
          padding: 14, borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} disabled={submitting} style={btnSecondary}>
            キャンセル
          </button>
          <button onClick={submit} disabled={submitting || !name.trim() || !slug} style={btnPrimary}>
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
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: '#666', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  background: 'rgba(255,255,255,0.06)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

const btnSecondary = {
  padding: '8px 16px', borderRadius: 7,
  background: 'transparent', color: '#9ca3af',
  border: '1px solid rgba(255,255,255,0.15)',
  fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
}

const btnPrimary = {
  padding: '8px 18px', borderRadius: 7,
  background: '#4d9fff', color: '#fff', border: 'none',
  fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
}
