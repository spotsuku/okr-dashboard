'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => typeof window === 'undefined' ? false : window.innerWidth < bp)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

// MIME type → アイコン
function iconFor(mimeType, isFolder) {
  if (isFolder) return '📁'
  if (!mimeType) return '📄'
  if (mimeType.includes('document')) return '📝'
  if (mimeType.includes('spreadsheet')) return '📊'
  if (mimeType.includes('presentation')) return '📊'
  if (mimeType.includes('pdf')) return '📕'
  if (mimeType.includes('image')) return '🖼️'
  if (mimeType.includes('video')) return '🎬'
  if (mimeType.includes('audio')) return '🎵'
  return '📄'
}

function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${mins}分前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}時間前`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}日前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function DriveTab({ T, myName, viewingName }) {
  const isMobile = useIsMobile()
  // モバイル用のサブタブ: chat / browse
  const [mobilePane, setMobilePane] = useState('chat')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* スマホ用サブタブ */}
      {isMobile && (
        <div style={{
          display: 'flex', padding: '6px 10px', gap: 4,
          borderBottom: `1px solid ${T.border}`, background: T.bgCard, flexShrink: 0,
        }}>
          {[
            { key: 'chat', label: '🤖 チャット' },
            { key: 'browse', label: '📂 ブラウザ' },
          ].map(t => (
            <button key={t.key} onClick={() => setMobilePane(t.key)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 7, border: 'none',
                background: mobilePane === t.key ? T.navActiveBg : 'transparent',
                color: mobilePane === t.key ? T.navActiveText : T.textSub,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>{t.label}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左/メイン: AI チャット */}
        {(!isMobile || mobilePane === 'chat') && (
          <div style={{
            flex: isMobile ? 1 : 1.2,
            display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
            borderRight: isMobile ? 'none' : `1px solid ${T.border}`,
          }}>
            <DriveChat T={T} owner={viewingName || myName} />
          </div>
        )}

        {/* 右/サブ: Drive ブラウザ */}
        {(!isMobile || mobilePane === 'browse') && (
          <div style={{
            flex: 1,
            display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
          }}>
            <DriveBrowser T={T} owner={viewingName || myName} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AI チャットパネル ─────────────────────────────────────────
function DriveChat({ T, owner }) {
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lastUserMsg, setLastUserMsg] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history, busy])

  const send = async (overrideMsg) => {
    const msg = (overrideMsg ?? input).trim()
    if (!msg || busy) return
    const isRetry = overrideMsg != null
    if (!isRetry) setInput('')
    setErr('')
    setLastUserMsg(msg)
    if (!isRetry) setHistory(prev => [...prev, { role: 'user', content: msg }])
    setBusy(true)
    try {
      const r = await fetch('/api/integrations/drive/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner, message: msg,
          history: history.map(h => ({ role: h.role, content: h.content })),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setHistory(prev => [...prev, {
        role: 'assistant',
        content: j.text || '(応答なし)',
        files: j.suggested_files || [],
      }])
    } catch (e) {
      setErr(e.message || 'AI エラー')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        background: T.bgCard,
      }}>
        <span style={{ fontSize: 15 }}>🤖</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>
          ドライブ AI
        </div>
        <button onClick={() => setHistory([])} disabled={busy} style={{
          padding: '4px 10px', borderRadius: 6,
          background: 'transparent', color: T.textSub,
          border: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>クリア</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {history.length === 0 && (
          <div style={{
            padding: 16, background: T.sectionBg, borderRadius: 8,
            fontSize: 12, color: T.textMuted, lineHeight: 1.7,
          }}>
            ネオ福岡 共有ドライブ内の資料を検索できます。<br />
            例:
            <ul style={{ paddingLeft: 18, margin: '6px 0 0' }}>
              <li>「やずや提案の最新版どこ?」</li>
              <li>「先週の経営会議の議事録を要約して」</li>
              <li>「面川さんが書いた研修資料」</li>
              <li>「○○の提案書の内容を教えて」</li>
            </ul>
          </div>
        )}
        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: h.role === 'user' ? T.accentBg : T.sectionBg,
              border: `1px solid ${h.role === 'user' ? T.accent + '40' : T.border}`,
              fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6, fontWeight: 700 }}>
                {h.role === 'user' ? '🙂 あなた' : '🤖 AI'}
              </div>
              {h.content}
            </div>
            {h.files && h.files.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: T.textMuted,
                  letterSpacing: 0.5, padding: '0 4px',
                }}>
                  📌 候補ファイル ({h.files.length}件中 上位{Math.min(8, h.files.length)}件)
                </div>
                {h.files.slice(0, 8).map(f => (
                  <FileCard key={f.id} T={T} file={f} />
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ padding: 10, fontSize: 12, color: T.textMuted }}>考え中…</div>
        )}
        {err && (
          <div style={{
            padding: 10, fontSize: 12, color: T.danger,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: 6, lineHeight: 1.5,
          }}>
            <div style={{ marginBottom: 6 }}>⚠️ {err}</div>
            {lastUserMsg && (
              <button onClick={() => send(lastUserMsg)} disabled={busy} style={{
                padding: '4px 12px', borderRadius: 6,
                background: T.accent, color: '#fff', border: 'none',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>🔄 再試行</button>
            )}
          </div>
        )}
      </div>

      <div style={{
        padding: 10, borderTop: `1px solid ${T.border}`,
        display: 'flex', gap: 6, flexShrink: 0, background: T.bgCard,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
          }}
          placeholder="自然文で質問 (Ctrl+Enter送信)"
          rows={2}
          disabled={busy}
          style={{
            flex: 1, background: T.bg, color: T.text,
            border: `1px solid ${T.border}`, borderRadius: 6,
            padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
            resize: 'vertical', outline: 'none',
          }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{
          padding: '0 16px', borderRadius: 6,
          background: busy ? T.border : T.accent, color: '#fff',
          border: 'none', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          cursor: busy ? 'not-allowed' : 'pointer',
        }}>送信</button>
      </div>
    </div>
  )
}

function FileCard({ T, file }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', background: T.bgCard,
      border: `1px solid ${T.border}`, borderRadius: 7,
      fontSize: 12,
    }}>
      <span style={{ fontSize: 18 }}>{iconFor(file.mimeType, file.isFolder)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, color: T.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{file.name}</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
          {file.owner && `${file.owner} · `}{formatRelative(file.modifiedTime)}
        </div>
      </div>
      {file.webViewLink && (
        <a href={file.webViewLink} target="_blank" rel="noreferrer" style={{
          padding: '4px 10px', borderRadius: 5,
          background: T.accentBg, color: T.accent, fontSize: 10, fontWeight: 700,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>Drive で開く ↗</a>
      )}
    </div>
  )
}

// ─── Drive ブラウザ (階層 + 検索) ──────────────────────────────
function DriveBrowser({ T, owner }) {
  const [folderId, setFolderId] = useState(null)  // null=ルート
  const [folderName, setFolderName] = useState('ネオ福岡')
  const [breadcrumb, setBreadcrumb] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)

  // 検索
  const [searchQ, setSearchQ] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const [searchItems, setSearchItems] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)

  const load = useCallback(async (fid) => {
    setLoading(true); setError(''); setNeedsReauth(false)
    try {
      const u = new URL('/api/integrations/drive/list', window.location.origin)
      u.searchParams.set('owner', owner)
      if (fid) u.searchParams.set('folder_id', fid)
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`)
        setNeedsReauth(!!j.needsReauth)
        return
      }
      setItems(j.items || [])
      setBreadcrumb(j.breadcrumb || [])
      if (j.folder) setFolderName(j.folder.name || 'ネオ福岡')
    } catch (e) {
      setError(e.message || '読み込みエラー')
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => { if (owner) load(folderId) }, [load, owner, folderId])

  const runSearch = useCallback(async () => {
    const q = searchQ.trim()
    if (!q) { setSearchMode(false); setSearchItems([]); return }
    setSearchLoading(true)
    try {
      const u = new URL('/api/integrations/drive/search', window.location.origin)
      u.searchParams.set('owner', owner)
      u.searchParams.set('q', q)
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`)
        setSearchItems([])
      } else {
        setSearchItems(j.items || [])
        setSearchMode(true)
      }
    } catch (e) {
      setError(e.message || '検索エラー')
    } finally {
      setSearchLoading(false)
    }
  }, [owner, searchQ])

  const clickItem = (item) => {
    if (item.isFolder) {
      setFolderId(item.id)
      setSearchMode(false); setSearchQ('')
    } else if (item.webViewLink) {
      window.open(item.webViewLink, '_blank', 'noopener,noreferrer')
    }
  }

  const displayItems = searchMode ? searchItems : items
  const isUnconnected = error.startsWith('未連携')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg }}>
      {/* ヘッダ + 検索 */}
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${T.border}`,
        background: T.bgCard, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 15 }}>📂</span>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>
            {searchMode ? `🔍 「${searchQ}」の検索結果` : folderName}
          </div>
          <button onClick={() => load(folderId)} disabled={loading} title="再読込" style={{
            padding: '4px 8px', borderRadius: 6,
            background: 'transparent', border: `1px solid ${T.border}`,
            color: T.textSub, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>🔄</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
            placeholder="🔍 共有ドライブ内を検索 (タイトル/本文)"
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12,
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 6, color: T.text, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={runSearch} disabled={searchLoading || !searchQ.trim()} style={{
            padding: '6px 12px', borderRadius: 6,
            background: T.accent, color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: searchLoading || !searchQ.trim() ? 'not-allowed' : 'pointer',
            opacity: searchLoading || !searchQ.trim() ? 0.6 : 1,
          }}>{searchLoading ? '…' : '検索'}</button>
          {searchMode && (
            <button onClick={() => { setSearchMode(false); setSearchQ('') }} style={{
              padding: '6px 10px', borderRadius: 6,
              background: 'transparent', color: T.textSub,
              border: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>×</button>
          )}
        </div>
      </div>

      {/* パンくず */}
      {!searchMode && breadcrumb.length > 0 && (
        <div style={{
          padding: '8px 12px', borderBottom: `1px solid ${T.border}`,
          fontSize: 11, color: T.textSub,
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          background: T.sectionBg, flexShrink: 0,
        }}>
          {breadcrumb.map((b, i) => (
            <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: T.textFaint }}>›</span>}
              <button
                onClick={() => { setFolderId(b.isRoot ? null : b.id); setSearchMode(false); setSearchQ('') }}
                style={{
                  padding: '2px 6px', borderRadius: 4,
                  background: i === breadcrumb.length - 1 ? T.accentBg : 'transparent',
                  color: i === breadcrumb.length - 1 ? T.accent : T.textSub,
                  border: 'none', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{b.name}</button>
            </span>
          ))}
        </div>
      )}

      {/* アイテム一覧 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
            読み込み中...
          </div>
        ) : isUnconnected ? (
          <div style={{ padding: 14, fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
            未連携です。連携タブで Google 連携してください。
          </div>
        ) : error ? (
          <div style={{
            padding: 10, fontSize: 12, color: T.danger,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: 6, lineHeight: 1.6,
          }}>
            ⚠️ {error}
            {needsReauth && (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                「連携」タブから再認証してください (drive.readonly スコープ不足の可能性)
              </div>
            )}
          </div>
        ) : displayItems.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
            {searchMode ? '該当ファイルなし' : '空のフォルダ'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {displayItems.map(item => (
              <button
                key={item.id}
                onClick={() => clickItem(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6,
                  background: 'transparent', border: `1px solid transparent`,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = T.sectionBg
                  e.currentTarget.style.borderColor = T.border
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'transparent'
                }}
              >
                <span style={{ fontSize: 20 }}>{iconFor(item.mimeType, item.isFolder)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: item.isFolder ? 700 : 600, color: T.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{item.name}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                    {item.owner && `${item.owner} · `}
                    {formatRelative(item.modifiedTime)}
                  </div>
                </div>
                {!item.isFolder && (
                  <span style={{ fontSize: 10, color: T.textMuted }}>↗</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
