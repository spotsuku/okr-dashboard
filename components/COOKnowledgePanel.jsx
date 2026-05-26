'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useCurrentOrg } from '../lib/orgContext'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { cardStyle, pillStyle, btnPrimary, btnSecondary, btnGhost, btnDanger, inputStyle, sectionHeaderStyle, accentRingStyle } from '../lib/iosStyles'

// ぺろっぺの組織知識を CRUD する admin 用パネル (モーダル形式で開く)
// Props: { T, owner (=自分の名前), onClose }

// Drive URL から fileId を抽出
function extractDriveFileId(input) {
  if (!input) return ''
  const s = String(input).trim()
  // URL 形式: https://drive.google.com/file/d/<ID>/...
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  // URL 形式: https://drive.google.com/open?id=<ID>
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  // すでに ID だけ貼られている
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s
  return ''
}

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

  const refresh = async (id) => {
    const r = await fetch(`/api/coo/knowledge/${id}/refresh?owner=${encodeURIComponent(owner)}&organization_id=${encodeURIComponent(orgId)}`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert('Drive 取得失敗: ' + (j.error || r.status)); return }
    alert(`${j.fileName || 'ファイル'} を取得しました (${j.fullLen || 0}文字)`)
    load()
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
                  onRemove={() => remove(it.id)}
                  onRefresh={() => refresh(it.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KnowledgeCard({ T, item, onEdit, onRemove, onRefresh }) {
  const isDrive = item.kind === 'drive_file'
  const cacheStatus = (() => {
    if (!isDrive) return null
    if (item.drive_cache_error) return { label: '取得エラー', icon: 'cross', color: T.danger }
    if (!item.drive_cached_at) return { label: '未取得', icon: 'alert', color: T.warn }
    return { label: `取得済 (${item.drive_cached_at?.slice(0, 10)})`, icon: 'check', color: T.success }
  })()
  return (
    <div style={{
      padding: SPACING.md, background: item.enabled ? T.sectionBg : 'transparent',
      border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
      opacity: item.enabled ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, marginBottom: SPACING.xs + 2 }}>
        <span style={{ color: T.textSub, display: 'inline-flex' }}><Icon name={isDrive ? 'drive' : 'note'} size={14} /></span>
        <div style={{ ...TYPO.callout, color: T.text, flex: 1 }}>{item.title}</div>
        <span style={{ ...pillStyle({ color: T.textMuted }), background: T.bgCard }}>優先度 {item.priority}</span>
      </div>
      {isDrive ? (
        <div>
          <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted, marginBottom: SPACING.xs, fontFamily: 'monospace' }}>
            ID: {item.drive_file_id}
          </div>
          <div style={{ ...TYPO.footnote, color: cacheStatus?.color, marginBottom: SPACING.xs + 2, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
            <Icon name={cacheStatus?.icon} size={12} /> {cacheStatus?.label}
          </div>
          {item.drive_cache_error && (
            <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.danger, marginBottom: SPACING.xs + 2, padding: SPACING.xs, background: T.dangerBg, borderRadius: RADIUS.xs }}>
              {item.drive_cache_error}
            </div>
          )}
          {item.drive_cached_text && (
            <div style={{
              ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted, padding: SPACING.xs + 2, background: T.bgCard,
              borderRadius: RADIUS.xs, maxHeight: 60, overflow: 'hidden', whiteSpace: 'pre-wrap',
            }}>
              {item.drive_cached_text.slice(0, 200)}{item.drive_cached_text.length > 200 ? '...' : ''}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          ...TYPO.footnote, color: T.text, padding: SPACING.xs + 2, background: T.bgCard,
          borderRadius: RADIUS.xs, maxHeight: 100, overflow: 'hidden', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>{item.content}</div>
      )}
      <div style={{ display: 'flex', gap: SPACING.xs + 2, marginTop: SPACING.sm }}>
        {isDrive && (
          <button onClick={onRefresh} style={{ ...btnSecondary({ T, size: 'sm' }), display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="refresh" size={12} /> Drive 再取得</button>
        )}
        <button onClick={onEdit} style={btnSecondary({ T, size: 'sm' })}>編集</button>
        <button onClick={onRemove} style={btnDanger({ T, size: 'sm' })}>削除</button>
      </div>
    </div>
  )
}

function KnowledgeForm({ T, owner, orgId, initial, onCancel, onSaved }) {
  const [kind, setKind] = useState(initial?.kind || 'text')
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [driveInput, setDriveInput] = useState(initial?.drive_file_id || '')
  const [priority, setPriority] = useState(initial?.priority ?? 50)
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const driveFileId = extractDriveFileId(driveInput)
  const canSave = title.trim() && (
    (kind === 'text' && content.trim()) ||
    (kind === 'drive_file' && driveFileId)
  )

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true)
    const payload = { kind, title: title.trim(), priority: Number(priority) || 0, enabled }
    if (kind === 'text') payload.content = content
    else payload.drive_file_id = driveFileId
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

    // drive_file で新規 or 既存で id 変更時は自動 refresh
    if (kind === 'drive_file' && j.item?.id) {
      const idChanged = !initial || initial.drive_file_id !== driveFileId
      if (idChanged) {
        await fetch(`/api/coo/knowledge/${j.item.id}/refresh?owner=${encodeURIComponent(owner)}&organization_id=${encodeURIComponent(orgId)}`, { method: 'POST' })
      }
    }
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
        <label style={labelSt}>種類</label>
        <div style={{ display: 'flex', gap: SPACING.xs + 2 }}>
          {[
            { key: 'text', label: 'テキスト', icon: 'note' },
            { key: 'drive_file', label: 'Drive ファイル', icon: 'drive' },
          ].map(k => (
            <button key={k.key} onClick={() => setKind(k.key)} style={{
              ...(kind === k.key ? btnPrimary({ T, size: 'sm' }) : btnSecondary({ T, size: 'sm' })),
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name={k.icon} size={12} /> {k.label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: SPACING.sm + 2 }}>
        <label style={labelSt}>タイトル *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例: NEO福岡の事業部構成" style={inputSt} />
      </div>

      {kind === 'text' && (
        <div style={{ marginBottom: SPACING.sm + 2 }}>
          <label style={labelSt}>本文 *</label>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="ぺろっぺに知っておいてほしい内容を自由に記述..."
            rows={6} style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
      )}

      {kind === 'drive_file' && (
        <div style={{ marginBottom: SPACING.sm + 2 }}>
          <label style={labelSt}>Drive ファイル *</label>
          <div style={{ display: 'flex', gap: SPACING.xs + 2 }}>
            <input value={driveInput} onChange={e => setDriveInput(e.target.value)}
              placeholder="URL / ID を貼り付け、または右のボタンから選択"
              style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => setPickerOpen(true)} style={{
              ...btnPrimary({ T, size: 'md' }), whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="drive" size={14} /> Drive から選択</button>
          </div>
          {driveInput && (
            <div style={{ marginTop: SPACING.xs, ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: driveFileId ? T.success : T.danger, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
              <Icon name={driveFileId ? 'check' : 'alert'} size={12} /> {driveFileId ? `ID: ${driveFileId}` : '有効な ID/URL ではありません'}
            </div>
          )}
          <div style={{ marginTop: SPACING.xs + 2, ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted, lineHeight: 1.5 }}>
            ※ Google Docs / Sheets / Slides / PDF の本文取得に対応。保存時に自動で Drive から取得します。
          </div>
          {pickerOpen && (
            <DrivePicker T={T} owner={owner}
              onClose={() => setPickerOpen(false)}
              onSelect={(file) => {
                setDriveInput(file.id)
                if (!title.trim()) setTitle(file.name)
                setPickerOpen(false)
              }} />
          )}
        </div>
      )}

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

// ─── Drive ファイル選択モーダル ─────────────────────────────────
// 共有ドライブを browse / search してファイルを選択する

const SUPPORTED_DRIVE_MIMES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
])

function driveIcon(mimeType, isFolder) {
  if (isFolder) return 'drive'
  if (!mimeType) return 'note'
  if (mimeType.includes('document')) return 'note'
  if (mimeType.includes('spreadsheet')) return 'chart'
  if (mimeType.includes('presentation')) return 'eye'
  if (mimeType.includes('pdf')) return 'note'
  return 'note'
}

function DrivePicker({ T, owner, onClose, onSelect }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [folderId, setFolderId] = useState('')  // 空 = ルート
  const [folder, setFolder] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const searchTimer = useRef(null)

  // ブラウズ取得
  const browse = useCallback(async (fid) => {
    if (!orgId) return
    setLoading(true); setError('')
    try {
      const u = new URL('/api/integrations/drive/list', window.location.origin)
      u.searchParams.set('owner', owner)
      if (fid) u.searchParams.set('folder_id', fid)
      u.searchParams.set('organization_id', orgId || '')
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setFolder(j.folder || null)
      setBreadcrumb(j.breadcrumb || [])
      setItems(j.items || [])
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [owner, orgId])

  // 検索
  const search = useCallback(async (q) => {
    if (!q.trim()) { setSearchMode(false); browse(folderId); return }
    setSearchMode(true)
    setLoading(true); setError('')
    try {
      const u = new URL('/api/integrations/drive/search', window.location.origin)
      u.searchParams.set('owner', owner)
      u.searchParams.set('q', q.trim())
      u.searchParams.set('organization_id', orgId || '')
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setItems(j.items || [])
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [owner, folderId, browse, orgId])

  useEffect(() => { browse(folderId) }, [browse, folderId])

  // 検索の debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { search(query) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, search])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: SPACING.xl,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.lg,
        width: '100%', maxWidth: 640, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: SHADOWS.xl,
      }}>
        <div style={{
          padding: `${SPACING.md}px ${SPACING.lg}px`, borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: SPACING.sm,
        }}>
          <span style={{ color: T.textSub, display: 'inline-flex' }}><Icon name="drive" size={16} /></span>
          <div style={{ ...TYPO.headline, fontWeight: 800, color: T.text, flex: 1 }}>Drive ファイル選択</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textSub,
            cursor: 'pointer', padding: `0 ${SPACING.xs + 2}px`, display: 'inline-flex',
          }}><Icon name="cross" size={18} /></button>
        </div>

        <div style={{ padding: `${SPACING.sm + 2}px ${SPACING.lg}px`, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
          <span style={{ color: T.textMuted, display: 'inline-flex' }}><Icon name="search" size={14} /></span>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="ファイル名/本文で検索 (空欄でブラウズに戻る)"
            style={{
              ...inputStyle({ T }),
              padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, fontSize: TYPO.body.fontSize,
              background: T.bg, borderRadius: RADIUS.xs,
            }} />
        </div>

        {!searchMode && breadcrumb.length > 0 && (
          <div style={{
            padding: `${SPACING.sm}px ${SPACING.lg}px`, borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap',
            ...TYPO.footnote, color: T.textMuted,
          }}>
            {breadcrumb.map((c, i) => (
              <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
                {i > 0 && <span>/</span>}
                <button onClick={() => setFolderId(c.isRoot ? '' : c.id)} style={{
                  background: 'transparent', border: 'none', padding: `2px ${SPACING.xs}px`,
                  color: i === breadcrumb.length - 1 ? T.text : T.accent,
                  ...TYPO.footnote, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>{c.name}</button>
              </span>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: SPACING.sm, minHeight: 200 }}>
          {loading ? (
            <div style={{ padding: SPACING['2xl'], textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>読み込み中...</div>
          ) : error ? (
            <div style={{ margin: SPACING.sm, padding: SPACING.sm + 2, color: T.danger, ...TYPO.subhead, background: T.dangerBg, borderRadius: RADIUS.xs, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
              <Icon name="alert" size={14} /> {error}
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: SPACING['2xl'], textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>
              {searchMode ? '一致するファイルがありません' : 'このフォルダは空です'}
            </div>
          ) : (
            items.map(it => {
              const supported = it.isFolder || SUPPORTED_DRIVE_MIMES.has(it.mimeType)
              return (
                <div key={it.id}
                  onClick={() => {
                    if (it.isFolder) { setFolderId(it.id); setQuery(''); setSearchMode(false); return }
                    if (!supported) return
                    onSelect(it)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
                    padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.xs, marginBottom: 2,
                    cursor: supported ? 'pointer' : 'not-allowed',
                    opacity: supported ? 1 : 0.45,
                    background: 'transparent',
                  }}
                  onMouseEnter={e => { if (supported) e.currentTarget.style.background = T.sectionBg }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ color: it.isFolder ? T.accent : T.textSub, display: 'inline-flex' }}><Icon name={driveIcon(it.mimeType, it.isFolder)} size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      ...TYPO.body, color: T.text, fontWeight: it.isFolder ? 700 : 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{it.name}</div>
                    <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted }}>
                      {it.isFolder ? 'フォルダ' : (
                        supported
                          ? (it.owner || '') + (it.modifiedTime ? ` · ${it.modifiedTime.slice(0, 10)}` : '')
                          : '本文取得不可 (Docs/Sheets/Slides/PDF のみ対応)'
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div style={{
          padding: `${SPACING.sm + 2}px ${SPACING.lg}px`, borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm,
        }}>
          <button onClick={onClose} style={btnSecondary({ T, size: 'md' })}>キャンセル</button>
        </div>
      </div>
    </div>
  )
}
