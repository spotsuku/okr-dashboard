'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useCurrentOrg } from '../lib/orgContext'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { cardStyle, pillStyle, btnPrimary, btnSecondary, btnGhost, inputStyle, sectionHeaderStyle } from '../lib/iosStyles'

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

// MIME type → Icon 名 (Icon.jsx の既存名にマップ)
// 注: image/video/audio/pdf 専用アイコンが Icon.jsx に無いため近似で代替。
function iconFor(mimeType, isFolder) {
  if (isFolder) return 'drive'
  if (!mimeType) return 'note'
  if (mimeType.includes('document')) return 'note'
  if (mimeType.includes('spreadsheet')) return 'chart'
  if (mimeType.includes('presentation')) return 'chart'
  if (mimeType.includes('pdf')) return 'note'
  if (mimeType.includes('image')) return 'eye'
  if (mimeType.includes('video')) return 'eye'
  if (mimeType.includes('audio')) return 'msg'
  return 'note'
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
          display: 'flex', padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`, gap: SPACING.xs,
          borderBottom: `1px solid ${T.border}`, background: T.bgCard, flexShrink: 0,
        }}>
          {[
            { key: 'chat', icon: 'ai', label: 'チャット' },
            { key: 'browse', icon: 'drive', label: 'ブラウザ' },
          ].map(t => (
            <button key={t.key} onClick={() => setMobilePane(t.key)}
              style={{
                flex: 1, padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.sm, border: 'none',
                background: mobilePane === t.key ? T.navActiveBg : 'transparent',
                color: mobilePane === t.key ? T.navActiveText : T.textSub,
                ...TYPO.subhead, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs + 2,
              }}><Icon name={t.icon} size={14} />{t.label}</button>
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
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
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
          organization_id: orgId,
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
        padding: `${SPACING.md}px ${SPACING.lg + 2}px`, borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, flexShrink: 0,
        background: T.sectionBg,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(135deg, #5AC8FA 0%, #007AFF 100%)`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(0,122,255,0.45)',
        }}><Icon name="ai" size={16} /></div>
        <div style={{ ...TYPO.headline, fontWeight: 800, color: T.text, flex: 1, letterSpacing: '-0.01em' }}>
          ドライブ AI
        </div>
        <button onClick={() => setHistory([])} disabled={busy} style={{
          ...btnGhost({ T, size: 'sm' }),
        }}>クリア</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: SPACING.md + 2 }}>
        {history.length === 0 && (
          <div style={{
            ...cardStyle({ T, accent: T.accent, padding: SPACING.lg + 2 }),
            ...TYPO.subhead, fontWeight: 600, color: T.textSub, lineHeight: 1.7,
          }}>
            共有ドライブ内の資料を AI で検索できます。<br />
            例:
            <ul style={{ paddingLeft: SPACING.lg + 2, margin: `${SPACING.xs + 2}px 0 0` }}>
              <li>「最新版の提案資料はどこ?」</li>
              <li>「先週の会議の議事録を要約して」</li>
              <li>「研修資料を探して」</li>
              <li>「○○の提案書の内容を教えて」</li>
            </ul>
          </div>
        )}
        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: SPACING.md }}>
            <div style={{
              padding: `${SPACING.sm + 2}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
              background: h.role === 'user' ? T.accentBg : T.sectionBg,
              border: `1px solid ${h.role === 'user' ? T.accent + '40' : T.border}`,
              ...TYPO.body, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.6,
            }}>
              <div style={{
                ...TYPO.caption, color: T.textMuted, marginBottom: SPACING.xs + 2, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}>
                <Icon name={h.role === 'user' ? 'user' : 'ai'} size={11} />
                {h.role === 'user' ? 'あなた' : 'AI'}
              </div>
              {h.content}
            </div>
            {h.files && h.files.length > 0 && (
              <div style={{ marginTop: SPACING.sm, display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
                <div style={{
                  ...TYPO.caption, fontWeight: 700, color: T.textMuted,
                  letterSpacing: 0.5, padding: `0 ${SPACING.xs}px`,
                  display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                }}>
                  <Icon name="pin" size={11} />
                  候補ファイル ({h.files.length}件中 上位{Math.min(8, h.files.length)}件)
                </div>
                {h.files.slice(0, 8).map(f => (
                  <FileCard key={f.id} T={T} file={f} />
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ padding: SPACING.sm + 2, ...TYPO.subhead, fontWeight: 600, color: T.textMuted }}>考え中…</div>
        )}
        {err && (
          <div style={{
            padding: SPACING.sm + 2, ...TYPO.subhead, fontWeight: 600, color: T.danger,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: RADIUS.xs, lineHeight: 1.5,
          }}>
            <div style={{
              marginBottom: SPACING.xs + 2,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="alert" size={12} /> {err}</div>
            {lastUserMsg && (
              <button onClick={() => send(lastUserMsg)} disabled={busy} style={{
                ...btnPrimary({ T, size: 'sm' }),
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}><Icon name="refresh" size={11} /> 再試行</button>
            )}
          </div>
        )}
      </div>

      <div style={{
        padding: SPACING.sm + 2, borderTop: `1px solid ${T.border}`,
        display: 'flex', gap: SPACING.xs + 2, flexShrink: 0, background: T.bgCard,
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
            ...inputStyle({ T }), flex: 1, width: 'auto', background: T.bg,
            ...TYPO.body, resize: 'vertical',
          }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{
          ...btnPrimary({ T, size: 'md' }),
          padding: `0 ${SPACING.lg}px`,
          ...(busy ? { background: T.border, boxShadow: 'none', cursor: 'not-allowed' } : {}),
        }}>送信</button>
      </div>
    </div>
  )
}

function FileCard({ T, file }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACING.sm,
      padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, background: T.bgCard,
      border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
      ...TYPO.subhead, fontWeight: 600,
    }}>
      <span style={{ color: T.textSub, display: 'inline-flex' }}>
        <Icon name={iconFor(file.mimeType, file.isFolder)} size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          ...TYPO.subhead, fontWeight: 700, color: T.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{file.name}</div>
        <div style={{ ...TYPO.caption, fontWeight: 600, color: T.textMuted, marginTop: 1 }}>
          {file.owner && `${file.owner} · `}{formatRelative(file.modifiedTime)}
        </div>
      </div>
      {file.webViewLink && (
        <a href={file.webViewLink} target="_blank" rel="noreferrer" style={{
          ...pillStyle({ color: T.accent, size: 'sm' }),
          textDecoration: 'none',
        }}>Drive で開く <Icon name="external" size={10} /></a>
      )}
    </div>
  )
}

// ─── Drive ブラウザ (階層 + 検索) ──────────────────────────────
function DriveBrowser({ T, owner }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [folderId, setFolderId] = useState(null)  // null=ルート
  const [folderName, setFolderName] = useState('共有ドライブ')
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
    if (!orgId) return
    setLoading(true); setError(''); setNeedsReauth(false)
    try {
      const u = new URL('/api/integrations/drive/list', window.location.origin)
      u.searchParams.set('owner', owner)
      if (fid) u.searchParams.set('folder_id', fid)
      u.searchParams.set('organization_id', orgId || '')
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`)
        setNeedsReauth(!!j.needsReauth)
        return
      }
      setItems(j.items || [])
      setBreadcrumb(j.breadcrumb || [])
      if (j.folder) setFolderName(j.folder.name || '共有ドライブ')
    } catch (e) {
      setError(e.message || '読み込みエラー')
    } finally {
      setLoading(false)
    }
  }, [owner, orgId])

  useEffect(() => { if (owner && orgId) load(folderId) }, [load, owner, folderId, orgId])

  const runSearch = useCallback(async () => {
    const q = searchQ.trim()
    if (!q) { setSearchMode(false); setSearchItems([]); return }
    setSearchLoading(true)
    try {
      const u = new URL('/api/integrations/drive/search', window.location.origin)
      u.searchParams.set('owner', owner)
      u.searchParams.set('q', q)
      u.searchParams.set('organization_id', orgId || '')
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
  }, [owner, searchQ, orgId])

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
        padding: `${SPACING.md}px ${SPACING.lg + 2}px`, borderBottom: `1px solid ${T.border}`,
        background: T.sectionBg,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.sm + 2 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: `linear-gradient(135deg, #FFCC00 0%, #FF9500 100%)`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(255,149,0,0.45)',
          }}><Icon name="drive" size={16} /></div>
          <div style={{ ...TYPO.headline, fontWeight: 800, color: T.text, flex: 1, letterSpacing: '-0.01em' }}>
            {searchMode ? `「${searchQ}」の検索結果` : folderName}
          </div>
          <button onClick={() => load(folderId)} disabled={loading} title="再読込" style={{
            ...btnSecondary({ T, size: 'sm' }),
            padding: `${SPACING.xs}px ${SPACING.sm}px`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="refresh" size={13} /></button>
        </div>
        <div style={{ display: 'flex', gap: SPACING.xs }}>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
            placeholder="共有ドライブ内を検索 (タイトル/本文)"
            style={{
              ...inputStyle({ T }), flex: 1, width: 'auto',
              padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`, ...TYPO.subhead,
              fontWeight: 500, background: T.bg,
            }}
          />
          <button onClick={runSearch} disabled={searchLoading || !searchQ.trim()} style={{
            ...btnPrimary({ T, size: 'sm' }),
            padding: `${SPACING.xs + 2}px ${SPACING.md}px`, ...TYPO.subhead, fontWeight: 700,
            cursor: searchLoading || !searchQ.trim() ? 'not-allowed' : 'pointer',
            opacity: searchLoading || !searchQ.trim() ? 0.6 : 1,
          }}>{searchLoading ? '…' : '検索'}</button>
          {searchMode && (
            <button onClick={() => { setSearchMode(false); setSearchQ('') }} style={{
              ...btnSecondary({ T, size: 'sm' }),
              padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="cross" size={13} /></button>
          )}
        </div>
      </div>

      {/* パンくず */}
      {!searchMode && breadcrumb.length > 0 && (
        <div style={{
          padding: `${SPACING.sm}px ${SPACING.md}px`, borderBottom: `1px solid ${T.border}`,
          ...TYPO.footnote, fontWeight: 600, color: T.textSub,
          display: 'flex', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap',
          background: T.sectionBg, flexShrink: 0,
        }}>
          {breadcrumb.map((b, i) => (
            <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
              {i > 0 && <span style={{ color: T.textFaint, display: 'inline-flex' }}><Icon name="chevronR" size={11} /></span>}
              <button
                onClick={() => { setFolderId(b.isRoot ? null : b.id); setSearchMode(false); setSearchQ('') }}
                style={{
                  padding: `2px ${SPACING.xs + 2}px`, borderRadius: RADIUS.xs - 2,
                  background: i === breadcrumb.length - 1 ? T.accentBg : 'transparent',
                  color: i === breadcrumb.length - 1 ? T.accent : T.textSub,
                  border: 'none', ...TYPO.footnote, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{b.name}</button>
            </span>
          ))}
        </div>
      )}

      {/* アイテム一覧 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: SPACING.sm + 2 }}>
        {loading ? (
          <div style={{ padding: SPACING.xl, textAlign: 'center', color: T.textMuted, ...TYPO.subhead, fontWeight: 600 }}>
            読み込み中...
          </div>
        ) : isUnconnected ? (
          <div style={{ padding: SPACING.md + 2, ...TYPO.subhead, fontWeight: 600, color: T.textMuted, lineHeight: 1.7 }}>
            未連携です。連携タブで Google 連携してください。
          </div>
        ) : error ? (
          <div style={{
            padding: SPACING.sm + 2, ...TYPO.subhead, fontWeight: 600, color: T.danger,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: RADIUS.xs, lineHeight: 1.6,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
              <Icon name="alert" size={12} /> {error}
            </span>
            {needsReauth && (
              <div style={{ marginTop: SPACING.xs + 2, ...TYPO.footnote, fontWeight: 600 }}>
                「連携」タブから再認証してください (drive.readonly スコープ不足の可能性)
              </div>
            )}
          </div>
        ) : displayItems.length === 0 ? (
          <div style={{ padding: SPACING.xl, textAlign: 'center', color: T.textMuted, ...TYPO.subhead, fontWeight: 600 }}>
            {searchMode ? '該当ファイルなし' : '空のフォルダ'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
            {displayItems.map(item => (
              <button
                key={item.id}
                onClick={() => clickItem(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
                  padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs,
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
                <span style={{ color: T.textSub, display: 'inline-flex' }}>
                  <Icon name={iconFor(item.mimeType, item.isFolder)} size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    ...TYPO.subhead, fontWeight: item.isFolder ? 700 : 600, color: T.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{item.name}</div>
                  <div style={{ ...TYPO.caption, fontWeight: 600, color: T.textMuted, marginTop: 1 }}>
                    {item.owner && `${item.owner} · `}
                    {formatRelative(item.modifiedTime)}
                  </div>
                </div>
                {!item.isFolder && (
                  <span style={{ color: T.textMuted, display: 'inline-flex' }}><Icon name="external" size={12} /></span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
