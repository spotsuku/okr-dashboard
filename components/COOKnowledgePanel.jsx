'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

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
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/coo/knowledge')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setItems(j.items || [])
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id) => {
    if (!window.confirm('この組織知を削除しますか?')) return
    const r = await fetch(`/api/coo/knowledge/${id}?owner=${encodeURIComponent(owner)}`, { method: 'DELETE' })
    if (r.ok) load()
    else { const j = await r.json().catch(() => ({})); alert('削除失敗: ' + (j.error || r.status)) }
  }

  const refresh = async (id) => {
    const r = await fetch(`/api/coo/knowledge/${id}/refresh?owner=${encodeURIComponent(owner)}`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert('Drive 取得失敗: ' + (j.error || r.status)); return }
    alert(`${j.fileName || 'ファイル'} を取得しました (${j.fullLen || 0}文字)`)
    load()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
    }}>
      <div style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 12,
        width: '100%', maxWidth: 760, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 20 }}>🐸</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>ぺろっぺ 設定</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>組織知の追加・編集 (CEO/admin)</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textSub,
            fontSize: 22, cursor: 'pointer', padding: '0 8px',
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!creating && (
            <button onClick={() => setCreating(true)} style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              background: 'transparent', border: `1px dashed ${T.accent}`,
              color: T.accent, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
            }}>+ 新規追加</button>
          )}
          {creating && (
            <KnowledgeForm T={T} owner={owner}
              onCancel={() => setCreating(false)}
              onSaved={() => { setCreating(false); load() }} />
          )}

          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
          ) : error ? (
            <div style={{ padding: 12, color: T.danger, fontSize: 12, background: T.dangerBg, borderRadius: 8 }}>⚠️ {error}</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
              組織知がまだ登録されていません<br />
              <span style={{ fontSize: 10 }}>上のボタンから追加してください</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map(it => editingId === it.id ? (
                <KnowledgeForm key={it.id} T={T} owner={owner} initial={it}
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
    if (item.drive_cache_error) return { label: '❌ 取得エラー', color: T.danger }
    if (!item.drive_cached_at) return { label: '⚠️ 未取得', color: T.warn }
    return { label: `✓ 取得済 (${item.drive_cached_at?.slice(0, 10)})`, color: T.success }
  })()
  return (
    <div style={{
      padding: 12, background: item.enabled ? T.sectionBg : 'transparent',
      border: `1px solid ${T.border}`, borderRadius: 8,
      opacity: item.enabled ? 1 : 0.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{isDrive ? '📁' : '📝'}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>{item.title}</div>
        <span style={{
          padding: '2px 8px', borderRadius: 99, background: T.bgCard,
          color: T.textMuted, fontSize: 10, fontWeight: 700,
        }}>優先度 {item.priority}</span>
      </div>
      {isDrive ? (
        <div>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, fontFamily: 'monospace' }}>
            ID: {item.drive_file_id}
          </div>
          <div style={{ fontSize: 11, color: cacheStatus?.color, marginBottom: 6 }}>
            {cacheStatus?.label}
          </div>
          {item.drive_cache_error && (
            <div style={{ fontSize: 10, color: T.danger, marginBottom: 6, padding: 4, background: T.dangerBg, borderRadius: 4 }}>
              {item.drive_cache_error}
            </div>
          )}
          {item.drive_cached_text && (
            <div style={{
              fontSize: 10, color: T.textMuted, padding: 6, background: T.bgCard,
              borderRadius: 4, maxHeight: 60, overflow: 'hidden', whiteSpace: 'pre-wrap',
            }}>
              {item.drive_cached_text.slice(0, 200)}{item.drive_cached_text.length > 200 ? '...' : ''}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          fontSize: 11, color: T.text, padding: 6, background: T.bgCard,
          borderRadius: 4, maxHeight: 100, overflow: 'hidden', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>{item.content}</div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {isDrive && (
          <button onClick={onRefresh} style={btn(T)}>🔄 Drive 再取得</button>
        )}
        <button onClick={onEdit} style={btn(T)}>編集</button>
        <button onClick={onRemove} style={btn(T, T.danger)}>削除</button>
      </div>
    </div>
  )
}

function btn(T, color) {
  return {
    padding: '5px 12px', borderRadius: 6,
    background: 'transparent', color: color || T.textSub,
    border: `1px solid ${color ? color + '60' : T.border}`,
    fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  }
}

function KnowledgeForm({ T, owner, initial, onCancel, onSaved }) {
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
    const url = initial
      ? `/api/coo/knowledge/${initial.id}?owner=${encodeURIComponent(owner)}`
      : `/api/coo/knowledge?owner=${encodeURIComponent(owner)}`
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
        await fetch(`/api/coo/knowledge/${j.item.id}/refresh?owner=${encodeURIComponent(owner)}`, { method: 'POST' })
      }
    }
    onSaved()
  }

  const inputSt = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    background: T.bg, border: `1px solid ${T.border}`,
    borderRadius: 6, color: T.text, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelSt = { fontSize: 11, fontWeight: 700, color: T.textSub, marginBottom: 4, display: 'block' }

  return (
    <div style={{
      padding: 14, background: T.sectionBg,
      border: `1px solid ${T.accent}40`, borderRadius: 8,
      marginBottom: 10,
    }}>
      <div style={{ marginBottom: 10 }}>
        <label style={labelSt}>種類</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'text', label: '📝 テキスト' },
            { key: 'drive_file', label: '📁 Drive ファイル' },
          ].map(k => (
            <button key={k.key} onClick={() => setKind(k.key)} style={{
              padding: '6px 12px', borderRadius: 6,
              background: kind === k.key ? T.accent : 'transparent',
              color: kind === k.key ? '#fff' : T.textSub,
              border: `1px solid ${kind === k.key ? T.accent : T.border}`,
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>{k.label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelSt}>タイトル *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例: NEO福岡の事業部構成" style={inputSt} />
      </div>

      {kind === 'text' && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>本文 *</label>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="ぺろっぺに知っておいてほしい内容を自由に記述..."
            rows={6} style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
      )}

      {kind === 'drive_file' && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Drive ファイル *</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={driveInput} onChange={e => setDriveInput(e.target.value)}
              placeholder="URL / ID を貼り付け、または右のボタンから選択"
              style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => setPickerOpen(true)} style={{
              padding: '0 14px', borderRadius: 6, whiteSpace: 'nowrap',
              background: T.accent, color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>📁 Drive から選択</button>
          </div>
          {driveInput && (
            <div style={{ marginTop: 4, fontSize: 10, color: driveFileId ? T.success : T.danger }}>
              {driveFileId ? `✓ ID: ${driveFileId}` : '⚠️ 有効な ID/URL ではありません'}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted, lineHeight: 1.5 }}>
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

      <div style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <label style={labelSt}>優先度 (0-100)</label>
          <input type="number" value={priority} onChange={e => setPriority(e.target.value)}
            min={0} max={100} style={inputSt} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          有効
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={saving} style={{
          padding: '8px 14px', borderRadius: 7,
          background: 'transparent', color: T.textSub, border: `1px solid ${T.border}`,
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        }}>キャンセル</button>
        <button onClick={save} disabled={saving || !canSave} style={{
          padding: '8px 16px', borderRadius: 7,
          background: canSave ? T.accent : T.border, color: '#fff', border: 'none',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
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
  if (isFolder) return '📁'
  if (!mimeType) return '📄'
  if (mimeType.includes('document')) return '📝'
  if (mimeType.includes('spreadsheet')) return '📊'
  if (mimeType.includes('presentation')) return '🖼️'
  if (mimeType.includes('pdf')) return '📕'
  return '📄'
}

function DrivePicker({ T, owner, onClose, onSelect }) {
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
    setLoading(true); setError('')
    try {
      const u = new URL('/api/integrations/drive/list', window.location.origin)
      u.searchParams.set('owner', owner)
      if (fid) u.searchParams.set('folder_id', fid)
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setFolder(j.folder || null)
      setBreadcrumb(j.breadcrumb || [])
      setItems(j.items || [])
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [owner])

  // 検索
  const search = useCallback(async (q) => {
    if (!q.trim()) { setSearchMode(false); browse(folderId); return }
    setSearchMode(true)
    setLoading(true); setError('')
    try {
      const u = new URL('/api/integrations/drive/search', window.location.origin)
      u.searchParams.set('owner', owner)
      u.searchParams.set('q', q.trim())
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setItems(j.items || [])
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [owner, folderId, browse])

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
      zIndex: 10000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 12,
        width: '100%', maxWidth: 640, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>📁</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, flex: 1 }}>Drive ファイル選択</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textSub,
            fontSize: 20, cursor: 'pointer', padding: '0 6px',
          }}>×</button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}` }}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="🔍 ファイル名/本文で検索 (空欄でブラウズに戻る)"
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 6, color: T.text, fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }} />
        </div>

        {!searchMode && breadcrumb.length > 0 && (
          <div style={{
            padding: '8px 16px', borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
            fontSize: 11, color: T.textMuted,
          }}>
            {breadcrumb.map((c, i) => (
              <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span>/</span>}
                <button onClick={() => setFolderId(c.isRoot ? '' : c.id)} style={{
                  background: 'transparent', border: 'none', padding: '2px 4px',
                  color: i === breadcrumb.length - 1 ? T.text : T.accent,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>{c.name}</button>
              </span>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 8, minHeight: 200 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
          ) : error ? (
            <div style={{ margin: 8, padding: 10, color: T.danger, fontSize: 12, background: T.dangerBg, borderRadius: 6 }}>
              ⚠️ {error}
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
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
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 6, marginBottom: 2,
                    cursor: supported ? 'pointer' : 'not-allowed',
                    opacity: supported ? 1 : 0.45,
                    background: 'transparent',
                  }}
                  onMouseEnter={e => { if (supported) e.currentTarget.style.background = T.sectionBg }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 18 }}>{driveIcon(it.mimeType, it.isFolder)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, color: T.text, fontWeight: it.isFolder ? 700 : 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>
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
          padding: '10px 16px', borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '7px 14px', borderRadius: 7,
            background: 'transparent', color: T.textSub, border: `1px solid ${T.border}`,
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>キャンセル</button>
        </div>
      </div>
    </div>
  )
}
