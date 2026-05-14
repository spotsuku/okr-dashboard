'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentOrg } from '../lib/orgContext'
import LicenseSection from './LicenseSection'

// ─────────────────────────────────────────────────────────────
// 組織設定パネル (モーダル)
// - 現在の組織名・slug 表示
// - メンバー一覧 (role 表示)
// - owner/admin: 招待・ロール変更・削除
// - 自分の email から requester を判定
// ─────────────────────────────────────────────────────────────

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
      zIndex: 9999, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 14,
        width: '100%', maxWidth: 720, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🏢</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>組織設定</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>
              {currentOrg?.name || '...'} ({currentOrg?.slug}) ・ あなた: {myRole || '不明'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:T.textSub, fontSize:22, cursor:'pointer', padding:'0 8px' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {currentOrg?.id && (
            <LicenseSection
              T={T}
              orgId={currentOrg.id}
              myEmail={myEmail}
              canManage={canManage}
            />
          )}
          {!canManage && (
            <div style={{ padding: 10, marginBottom: 10, background: T.bgSection, borderRadius: 8, fontSize: 11, color: T.textMuted }}>
              閲覧権限のみ。owner / admin に依頼してください。
            </div>
          )}
          {canManage && (
            <button onClick={() => setComposing(true)} style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              background: 'transparent', border: `1px dashed ${T.accent}`,
              color: T.accent, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
            }}>+ メンバーを招待</button>
          )}
          {composing && (
            <InviteForm T={T} myEmail={myEmail} orgId={currentOrg?.id}
              onCancel={() => setComposing(false)}
              onSaved={() => { setComposing(false); load() }} />
          )}

          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>メンバーなし</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map(m => (
                <div key={m.member_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{m.name || '(名前なし)'}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{m.email} ・ {m.member_role || ''}</div>
                  </div>
                  {canManage && m.email !== myEmail ? (
                    <select value={m.role} onChange={e => updateRole(m.member_id, e.target.value)} style={{
                      padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`,
                      background: T.bgCard, color: T.text, fontSize: 11, fontFamily: 'inherit', outline: 'none',
                    }}>
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: m.role === 'owner' ? T.warnBg : m.role === 'admin' ? T.accentBg : T.bgSection,
                      color: m.role === 'owner' ? T.warn : m.role === 'admin' ? T.accent : T.textSub }}>
                      {m.role}
                    </span>
                  )}
                  {canManage && m.email !== myEmail && (
                    <button onClick={() => removeMember(m.member_id, m.name)} style={{
                      padding: '4px 8px', borderRadius: 6, background: 'transparent',
                      border: `1px solid ${T.danger}40`, color: T.danger,
                      fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
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
  const inputSt = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
    background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, outline: 'none' }
  return (
    <div style={{ padding: 14, marginBottom: 12, background: T.sectionBg, border: `1px solid ${T.accent}40`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 10 }}>新規メンバー招待</div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 120px' }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inputSt} />
        <input value={name}  onChange={e => setName(e.target.value)}  placeholder="氏名 (任意)"      style={inputSt} />
        <select value={role} onChange={e => setRole(e.target.value)}  style={inputSt}>
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: T.textMuted, lineHeight: 1.5 }}>
        ※ 招待されたメールアドレスは Supabase Auth でサインアップ後にこの組織に自動所属します。
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={onCancel} disabled={saving} style={{
          padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.border}`,
          background: 'transparent', color: T.textSub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>キャンセル</button>
        <button onClick={submit} disabled={saving || !email.trim()} style={{
          padding: '6px 14px', borderRadius: 6, border: 'none',
          background: email.trim() ? T.accent : T.border, color: '#fff',
          fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
        }}>{saving ? '送信中…' : '招待'}</button>
      </div>
    </div>
  )
}
