'use client'
import { useState, useEffect, useCallback } from 'react'
import { useCurrentOrg } from '../lib/orgContext'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { pillStyle, btnPrimary, btnSecondary, btnGhost, btnDanger, inputStyle } from '../lib/iosStyles'

// ぺろっぺの組織知識を CRUD する admin 用パネル (モーダル形式で開く)
// Props: { T, owner (=自分の名前), onClose }
// ※ 旧「Drive ファイル」連携は廃止 (Google Drive スコープ削除のため)。
//    既存の drive_file エントリはキャッシュ済み本文を読み取り表示し、編集でテキスト化できる。

export default function COOKnowledgePanel({ T, owner, onClose }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/coo/knowledge?organization_id=${encodeURIComponent(orgId)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setItems(j.items || [])
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [orgId])

  useEffect(() => { load() }, [load])

  const remove = async (id) => {
    if (!window.confirm('この組織知を削除しますか?')) return
    const r = await fetch(`/api/coo/knowledge/${id}?owner=${encodeURIComponent(owner)}&organization_id=${encodeURIComponent(orgId)}`, { method: 'DELETE' })
    if (r.ok) load()
    else { const j = await r.json().catch(() => ({})); alert('削除失敗: ' + (j.error || r.status)) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: SPACING.xl,
    }}>
      <div style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.lg,
        width: '100%', maxWidth: 760, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: SHADOWS.xl,
      }}>
        <div style={{
          padding: `${SPACING.md + 2}px ${SPACING.lg + 2}px`, borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: SPACING.sm,
        }}>
          <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="ai" size={20} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ ...TYPO.headline, fontWeight: 800, color: T.text }}>ぺろっぺ 設定</div>
            <div style={{ ...TYPO.footnote, color: T.textMuted }}>組織知の追加・編集 (CEO/admin)</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textSub,
            cursor: 'pointer', padding: `0 ${SPACING.sm}px`, display: 'inline-flex',
          }}><Icon name="cross" size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: SPACING.lg }}>
          {!creating && (
            <button onClick={() => setCreating(true)} style={{
              width: '100%', padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.sm,
              background: 'transparent', border: `1px dashed ${T.accent}`,
              color: T.accent, ...TYPO.body, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: SPACING.md,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
            }}><Icon name="plus" size={14} /> 新規追加</button>
          )}
          {creating && (
            <KnowledgeForm T={T} owner={owner} orgId={orgId}
              onCancel={() => setCreating(false)}
              onSaved={() => { setCreating(false); load() }} />
          )}

          {loading ? (
            <div style={{ padding: SPACING.xl, textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>読み込み中...</div>
          ) : error ? (
            <div style={{ padding: SPACING.md, color: T.danger, ...TYPO.subhead, background: T.dangerBg, borderRadius: RADIUS.sm, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="alert" size={14} /> {error}</div>
          ) : items.length === 0 ? (
            <div style={{ padding: SPACING['3xl'], textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>
              組織知がまだ登録されていません<br />
              <span style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal' }}>上のボタンから追加してください</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2 }}>
              {items.map(it => editingId === it.id ? (
                <KnowledgeForm key={it.id} T={T} owner={owner} orgId={orgId} initial={it}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => { setEditingId(null); load() }} />
              ) : (
                <KnowledgeCard key={it.id} T={T} item={it}
                  onEdit={() => setEditingId(it.id)}
                  onRemove={() => remove(it.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KnowledgeCard({ T, item, onEdit, onRemove }) {
  // 旧 drive_file エントリはキャッシュ本文を読み取り表示 (Drive 再取得は廃止)
  const body = item.kind === 'drive_file'
    ? (item.drive_cached_text || '(旧 Drive 連携エントリ。編集してテキストで保存し直してください)')
    : item.content
  return (
    <div style={{
      padding: SPACING.md, background: item.enabled ? T.sectionBg : 'transparent',
      border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
      opacity: item.enabled ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, marginBottom: SPACING.xs + 2 }}>
        <span style={{ color: T.textSub, display: 'inline-flex' }}><Icon name="note" size={14} /></span>
        <div style={{ ...TYPO.callout, color: T.text, flex: 1 }}>{item.title}</div>
        <span style={{ ...pillStyle({ color: T.textMuted }), background: T.bgCard }}>優先度 {item.priority}</span>
      </div>
      <div style={{
        ...TYPO.footnote, color: T.text, padding: SPACING.xs + 2, background: T.bgCard,
        borderRadius: RADIUS.xs, maxHeight: 100, overflow: 'hidden', whiteSpace: 'pre-wrap', lineHeight: 1.6,
      }}>{body}</div>
      <div style={{ display: 'flex', gap: SPACING.xs + 2, marginTop: SPACING.sm }}>
        <button onClick={onEdit} style={btnSecondary({ T, size: 'sm' })}>編集</button>
        <button onClick={onRemove} style={btnDanger({ T, size: 'sm' })}>削除</button>
      </div>
    </div>
  )
}

function KnowledgeForm({ T, owner, orgId, initial, onCancel, onSaved }) {
  const [title, setTitle] = useState(initial?.title || '')
  // 旧 drive_file は cached text を初期本文として引き継ぎ、テキストとして保存し直す
  const [content, setContent] = useState(initial?.content || initial?.drive_cached_text || '')
  const [priority, setPriority] = useState(initial?.priority ?? 50)
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [saving, setSaving] = useState(false)

  const canSave = title.trim() && content.trim()

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true)
    const payload = { kind: 'text', title: title.trim(), content, priority: Number(priority) || 0, enabled }
    const orgQ = `&organization_id=${encodeURIComponent(orgId)}`
    const url = initial
      ? `/api/coo/knowledge/${initial.id}?owner=${encodeURIComponent(owner)}${orgQ}`
      : `/api/coo/knowledge?owner=${encodeURIComponent(owner)}${orgQ}`
    const r = await fetch(url, {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert('保存失敗: ' + (j.error || r.status)); return }
    onSaved()
  }

  const inputSt = {
    ...inputStyle({ T }),
    padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, fontSize: TYPO.body.fontSize,
    background: T.bg, borderRadius: RADIUS.xs,
  }
  const labelSt = { ...TYPO.footnote, fontWeight: 700, color: T.textSub, marginBottom: SPACING.xs, display: 'block' }

  return (
    <div style={{
      padding: SPACING.md + 2, background: T.sectionBg,
      border: `1px solid ${T.accent}40`, borderRadius: RADIUS.sm,
      marginBottom: SPACING.sm + 2,
    }}>
      <div style={{ marginBottom: SPACING.sm + 2 }}>
        <label style={labelSt}>タイトル *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例: NEO福岡の事業部構成" style={inputSt} />
      </div>

      <div style={{ marginBottom: SPACING.sm + 2 }}>
        <label style={labelSt}>本文 *</label>
        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder="ぺろっぺに知っておいてほしい内容を自由に記述..."
          rows={6} style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <div style={{ display: 'flex', gap: SPACING.md + 2, marginBottom: SPACING.md + 2, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>優先度 (0-100)</label>
          <input type="number" value={priority} onChange={e => setPriority(e.target.value)}
            min={0} max={100} style={inputSt} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, ...TYPO.subhead, color: T.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          有効
        </label>
      </div>

      <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={saving} style={btnSecondary({ T, size: 'md' })}>キャンセル</button>
        <button onClick={save} disabled={saving || !canSave} style={{
          ...(canSave ? btnPrimary({ T, size: 'md' }) : btnGhost({ T, size: 'md' })),
          cursor: saving || !canSave ? 'not-allowed' : 'pointer',
        }}>{saving ? '保存中…' : '保存'}</button>
      </div>
    </div>
  )
}
