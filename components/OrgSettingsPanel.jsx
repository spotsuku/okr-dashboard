'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentOrg } from '../lib/orgContext'
import LicenseSection from './LicenseSection'
import OrgMeetingsSection from './OrgMeetingsSection'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'

// ─────────────────────────────────────────────────────────────
// 組織設定パネル (モーダル)
// - 現在の組織名・slug 表示
// - メンバー一覧 (role 表示)
// - owner/admin: 招待・ロール変更・削除
// - owner/admin: Notion 連携設定 (API key / 会議別 DB ID)
// - 自分の email から requester を判定
// ─────────────────────────────────────────────────────────────

// Notion 連携で設定する会議キー (lib/meetings.js の MEETINGS と整合、sales は partner と共有)
const NOTION_MEETING_FIELDS = [
  { key: 'morning',           title: '朝会' },
  { key: 'kickoff-partner',   title: '週次キックオフ (パートナー事業部) / 営業定例' },
  { key: 'kickoff-youth',     title: '週次キックオフ (ユース事業部)' },
  { key: 'kickoff-community', title: '週次キックオフ (コミュニティ事業部)' },
  { key: 'manager',           title: 'マネージャー定例' },
  { key: 'director',          title: 'ディレクター確認会議' },
  { key: 'planning',          title: '経営企画会議' },
  { key: 'board',             title: '役員会議' },
  { key: 'program-regular',   title: 'プログラム別定例' },
]

export default function OrgSettingsPanel({ T, myEmail, onClose }) {
  const { currentOrg } = useCurrentOrg()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState(null)
  const [composing, setComposing] = useState(false)

  const load = useCallback(async () => {
    if (!currentOrg?.id) return
    setLoading(true)
    const { data } = await supabase.from('organization_members')
      .select('member_id, role, joined_at, members(id, name, email, role, avatar_url)')
      .eq('organization_id', currentOrg.id)
      .order('joined_at', { ascending: true })
    const list = (data || []).map(r => ({
      member_id: r.member_id,
      role: r.role,
      joined_at: r.joined_at,
      name: r.members?.name,
      email: r.members?.email,
      member_role: r.members?.role,
      avatar_url: r.members?.avatar_url,
    }))
    setMembers(list)
    const me = list.find(x => x.email?.toLowerCase() === myEmail?.toLowerCase())
    setMyRole(me?.role || null)
    setLoading(false)
  }, [currentOrg?.id, myEmail])
  useEffect(() => { load() }, [load])

  const canManage = myRole === 'owner' || myRole === 'admin'

  const updateRole = async (memberId, role) => {
    const r = await fetch('/api/org/role', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: currentOrg.id, member_id: memberId, role, requester_email: myEmail }),
    })
    const j = await r.json()
    if (!r.ok) { alert('ロール更新失敗: ' + (j.error || r.status)); return }
    load()
  }
  const removeMember = async (memberId, name) => {
    if (!window.confirm(`${name} さんを組織から削除しますか?`)) return
    const r = await fetch('/api/org/role', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: currentOrg.id, member_id: memberId, requester_email: myEmail }),
    })
    const j = await r.json()
    if (!r.ok) { alert('削除失敗: ' + (j.error || r.status)); return }
    load()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: SPACING.xl,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.lg,
        width: '100%', maxWidth: 720, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: SHADOWS.xl,
      }}>
        <div style={{ padding: `${SPACING.md + 2}px ${SPACING.lg + 2}px`, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
          <Icon name="building" size={18} style={{ color: T.text }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...TYPO.callout, fontSize: 15, color: T.text }}>組織設定</div>
            <div style={{ ...TYPO.footnote, color: T.textMuted }}>
              {currentOrg?.name || '...'} ({currentOrg?.slug}) ・ あなた: {myRole || '不明'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:T.textSub, cursor:'pointer', padding:`0 ${SPACING.sm}px`, display:'flex', alignItems:'center' }}><Icon name="cross" size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: SPACING.lg }}>
          {/* ライセンス機能は一時停止中 (サービス無料公開のため)
          {currentOrg?.id && (
            <LicenseSection
              T={T}
              orgId={currentOrg.id}
              myEmail={myEmail}
              canManage={canManage}
            />
          )}
          */}
          {!canManage && (
            <div style={{ padding: SPACING.sm + 2, marginBottom: SPACING.sm + 2, background: T.bgSection, borderRadius: RADIUS.sm, ...TYPO.footnote, color: T.textMuted }}>
              閲覧権限のみ。owner / admin に依頼してください。
            </div>
          )}
          {canManage && (
            <button onClick={() => setComposing(true)} style={{
              width: '100%', padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.sm,
              background: 'transparent', border: `1px dashed ${T.accent}`,
              color: T.accent, ...TYPO.body, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: SPACING.md,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
            }}><Icon name="plus" size={14} /> メンバーを招待</button>
          )}
          {composing && (
            <InviteForm T={T} myEmail={myEmail} orgId={currentOrg?.id}
              onCancel={() => setComposing(false)}
              onSaved={() => { setComposing(false); load() }} />
          )}

          {/* Notion 連携設定 (owner/admin) */}
          {canManage && currentOrg?.id && (
            <NotionConfigSection T={T} orgId={currentOrg.id} requesterEmail={myEmail} />
          )}

          {/* 会議設定 (= organization_meetings の一覧 + プレビュー) */}
          {currentOrg?.id && (
            <OrgMeetingsSection T={T} orgId={currentOrg.id} canManage={canManage} />
          )}

          {loading ? (
            <div style={{ padding: SPACING.xl, textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>読み込み中...</div>
          ) : members.length === 0 ? (
            <div style={{ padding: SPACING.xl, textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>メンバーなし</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
              {members.map(m => (
                <div key={m.member_id} style={{
                  display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
                  padding: `${SPACING.sm}px ${SPACING.md}px`, background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TYPO.body, fontWeight: 700, color: T.text }}>{m.name || '(名前なし)'}</div>
                    <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted }}>{m.email} ・ {m.member_role || ''}</div>
                  </div>
                  {canManage && m.email !== myEmail ? (
                    <select value={m.role} onChange={e => updateRole(m.member_id, e.target.value)} style={{
                      padding: `${SPACING.xs}px ${SPACING.sm}px`, borderRadius: RADIUS.xs, border: `1px solid ${T.border}`,
                      background: T.bgCard, color: T.text, ...TYPO.footnote, fontFamily: 'inherit', outline: 'none',
                    }}>
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  ) : (
                    <span style={{ ...TYPO.caption, fontWeight: 700, letterSpacing: 'normal', padding: `2px ${SPACING.sm}px`, borderRadius: RADIUS.pill,
                      background: m.role === 'owner' ? T.warnBg : m.role === 'admin' ? T.accentBg : T.bgSection,
                      color: m.role === 'owner' ? T.warn : m.role === 'admin' ? T.accent : T.textSub }}>
                      {m.role}
                    </span>
                  )}
                  {canManage && m.email !== myEmail && (
                    <button onClick={() => removeMember(m.member_id, m.name)} style={{
                      padding: `${SPACING.xs}px ${SPACING.sm}px`, borderRadius: RADIUS.xs, background: 'transparent',
                      border: `1px solid ${T.danger}40`, color: T.danger,
                      ...TYPO.caption, fontWeight: 700, letterSpacing: 'normal', cursor: 'pointer', fontFamily: 'inherit',
                    }}>削除</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Notion 連携設定 (owner/admin のみ) ───────────────────────
function NotionConfigSection({ T, orgId, requesterEmail }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [dbIds, setDbIds] = useState({})        // 表示用 (サーバから取得)
  const [draftKey, setDraftKey] = useState('')  // 新規入力 (空ならスキップ)
  const [clearKey, setClearKey] = useState(false)
  const [draftDbIds, setDraftDbIds] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!orgId || !requesterEmail) return
    setLoading(true); setError('')
    try {
      const u = new URL('/api/org/notion-config', window.location.origin)
      u.searchParams.set('organization_id', orgId)
      u.searchParams.set('requester_email', requesterEmail)
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return }
      setApiKeyConfigured(!!j.api_key_configured)
      setDbIds(j.db_ids || {})
      setDraftDbIds(j.db_ids || {})
      setDraftKey(''); setClearKey(false)
    } catch (e) {
      setError(e.message || '取得エラー')
    } finally {
      setLoading(false)
    }
  }, [orgId, requesterEmail])

  // 初回展開時に取得
  useEffect(() => { if (open) load() }, [open, load])

  const save = async () => {
    setSaving(true); setError(''); setSavedAt(null)
    try {
      const body = { organization_id: orgId, requester_email: requesterEmail }
      if (clearKey) body.notion_api_key = ''
      else if (draftKey.trim()) body.notion_api_key = draftKey.trim()
      // 差分のあるDB ID キーだけ送る
      const diffDbIds = {}
      let hasDbDiff = false
      const allKeys = new Set([...Object.keys(dbIds), ...Object.keys(draftDbIds)])
      for (const k of allKeys) {
        const before = (dbIds[k] || '').trim()
        const after = (draftDbIds[k] || '').trim()
        if (before !== after) { diffDbIds[k] = after; hasDbDiff = true }
      }
      if (hasDbDiff) body.notion_db_ids = diffDbIds
      if (body.notion_api_key === undefined && !hasDbDiff) {
        setError('変更がありません')
        setSaving(false); return
      }
      const r = await fetch('/api/org/notion-config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); setSaving(false); return }
      setSavedAt(new Date())
      await load()
    } catch (e) {
      setError(e.message || '保存エラー')
    } finally {
      setSaving(false)
    }
  }

  const inputSt = {
    width: '100%', boxSizing: 'border-box', padding: `${SPACING.xs + 2}px ${SPACING.sm + 1}px`, fontSize: 11,
    fontFamily: 'monospace', background: T.bg, color: T.text,
    border: `1px solid ${T.border}`, borderRadius: RADIUS.xs, outline: 'none',
  }

  return (
    <div style={{ marginBottom: SPACING.lg - 2, border: `1px solid ${T.border}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, textAlign: 'left',
        background: T.sectionBg, border: 'none', color: T.text,
        ...TYPO.body, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: SPACING.sm,
      }}>
        <Icon name="note" size={16} style={{ color: T.text }} />
        <span style={{ flex: 1 }}>Notion 連携設定</span>
        <span style={{ ...TYPO.caption, letterSpacing: 'normal', color: T.textMuted, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
          {apiKeyConfigured
            ? <><Icon name="check" size={12} style={{ color: T.success }} /> API キー設定済み</>
            : <><Icon name="alert" size={12} style={{ color: T.warn }} /> 未設定 (env var fallback)</>}
        </span>
        <Icon name={open ? 'chevronD' : 'chevronR'} size={14} style={{ color: T.textMuted }} />
      </button>
      {open && (
        <div style={{ padding: SPACING.lg - 2, background: T.bgCard, borderTop: `1px solid ${T.border}` }}>
          {loading && <div style={{ ...TYPO.footnote, color: T.textMuted }}>読み込み中...</div>}
          {!loading && (
            <>
              <div style={{ ...TYPO.caption, letterSpacing: 'normal', fontWeight: 600, color: T.textMuted, lineHeight: 1.6, marginBottom: SPACING.sm + 2 }}>
                組織別に Notion ワークスペースに接続します。設定しない場合は環境変数 (NOTION_API_KEY 等) が使われます。
              </div>

              {/* API キー */}
              <div style={{ marginBottom: SPACING.lg - 2 }}>
                <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.textSub, marginBottom: SPACING.xs }}>
                  Notion Internal Integration Secret
                </div>
                <input
                  type="password"
                  value={clearKey ? '' : draftKey}
                  onChange={e => { setDraftKey(e.target.value); setClearKey(false) }}
                  placeholder={apiKeyConfigured ? '••••••••••• (変更する場合のみ入力)' : 'secret_xxxx...'}
                  disabled={clearKey}
                  style={inputSt}
                />
                {apiKeyConfigured && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: SPACING.xs + 2,
                    marginTop: SPACING.xs + 2, ...TYPO.caption, letterSpacing: 'normal', fontWeight: 600, color: T.textMuted, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={clearKey} onChange={e => setClearKey(e.target.checked)} />
                    現在の API キーをクリア (env var fallback に戻す)
                  </label>
                )}
              </div>

              {/* DB ID 一覧 */}
              <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.textSub, marginBottom: SPACING.xs + 2 }}>
                会議別 Notion データベース ID
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
                {NOTION_MEETING_FIELDS.map(f => (
                  <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: SPACING.sm, alignItems: 'center' }}>
                    <div style={{ ...TYPO.caption, letterSpacing: 'normal', fontWeight: 600, color: T.textMuted, lineHeight: 1.4 }}>{f.title}</div>
                    <input
                      type="text"
                      value={draftDbIds[f.key] || ''}
                      onChange={e => setDraftDbIds(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder="32桁hex の Notion DB ID (空にすると env var fallback)"
                      style={inputSt}
                    />
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ marginTop: SPACING.sm + 2, padding: SPACING.sm, ...TYPO.footnote, color: T.danger,
                  background: T.dangerBg, borderRadius: RADIUS.xs, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="alert" size={13} /> {error}</div>
              )}
              {savedAt && !error && (
                <div style={{ marginTop: SPACING.sm + 2, padding: SPACING.sm, ...TYPO.footnote, color: T.success,
                  background: T.successBg, borderRadius: RADIUS.xs, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
                  <Icon name="check" size={13} /> 保存しました ({savedAt.toLocaleTimeString()})
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.md }}>
                <button onClick={load} disabled={loading || saving} style={{
                  padding: `${SPACING.xs + 2}px ${SPACING.md}px`, borderRadius: RADIUS.xs, border: `1px solid ${T.border}`,
                  background: 'transparent', color: T.textSub,
                  ...TYPO.footnote, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>リセット</button>
                <button onClick={save} disabled={saving || loading} style={{
                  padding: `${SPACING.xs + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.xs, border: 'none',
                  background: T.accent, color: '#fff',
                  ...TYPO.footnote, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                }}>{saving ? '保存中…' : '保存'}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function InviteForm({ T, myEmail, orgId, onCancel, onSaved }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('member')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!email.trim()) return
    setSaving(true)
    const r = await fetch('/api/org/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: orgId, email: email.trim(), name: name.trim() || null, role, inviter_email: myEmail }),
    })
    setSaving(false)
    const j = await r.json()
    if (!r.ok) { alert('招待失敗: ' + (j.error || r.status)); return }
    onSaved()
  }
  const inputSt = { width: '100%', boxSizing: 'border-box', padding: `${SPACING.xs + 3}px ${SPACING.sm + 2}px`, ...TYPO.subhead, fontFamily: 'inherit',
    background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: RADIUS.xs, outline: 'none' }
  return (
    <div style={{ padding: SPACING.lg - 2, marginBottom: SPACING.md, background: T.sectionBg, border: `1px solid ${T.accent}40`, borderRadius: RADIUS.md }}>
      <div style={{ ...TYPO.subhead, fontWeight: 800, color: T.text, marginBottom: SPACING.sm + 2 }}>新規メンバー招待</div>
      <div style={{ display: 'grid', gap: SPACING.sm, gridTemplateColumns: '1fr 1fr 120px' }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inputSt} />
        <input value={name}  onChange={e => setName(e.target.value)}  placeholder="氏名 (任意)"      style={inputSt} />
        <select value={role} onChange={e => setRole(e.target.value)}  style={inputSt}>
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
      </div>
      <div style={{ marginTop: SPACING.sm + 2, ...TYPO.caption, letterSpacing: 'normal', fontWeight: 600, color: T.textMuted, lineHeight: 1.5 }}>
        ※ 招待されたメールアドレスは Supabase Auth でサインアップ後にこの組織に自動所属します。
      </div>
      <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end', marginTop: SPACING.sm + 2 }}>
        <button onClick={onCancel} disabled={saving} style={{
          padding: `${SPACING.xs + 2}px ${SPACING.md}px`, borderRadius: RADIUS.xs, border: `1px solid ${T.border}`,
          background: 'transparent', color: T.textSub, ...TYPO.footnote, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>キャンセル</button>
        <button onClick={submit} disabled={saving || !email.trim()} style={{
          padding: `${SPACING.xs + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.xs, border: 'none',
          background: email.trim() ? T.accent : T.border, color: '#fff',
          ...TYPO.footnote, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
        }}>{saving ? '送信中…' : '招待'}</button>
      </div>
    </div>
  )
}
