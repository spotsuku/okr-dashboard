'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ─── ユーザー一覧タブ ──────────────────────────────────────────────────────────
const ROLES = ['管理者', 'ディレクター', 'マネージャー', 'メンバー', 'その他']

function UserListTab({ members, currentUser, isAdmin }) {
  const [authUsers, setAuthUsers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [linkModal, setLinkModal] = useState(null)   // { authUser }
  const [roleModal, setRoleModal] = useState(null)   // { authUser }
  const [processing, setProcessing] = useState(false)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin-users')
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || '取得に失敗しました'); setLoading(false); return }
      // 最終ログイン順でソート
      const sorted = (data.users || []).sort((a, b) => new Date(b.last_sign_in_at || 0) - new Date(a.last_sign_in_at || 0))
      setAuthUsers(sorted)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const handleDelete = async (authUser) => {
    if (!window.confirm(`${authUser.email} のアカウントを削除しますか？
※この操作は取り消せません`)) return
    setProcessing(true)
    const res = await fetch('/api/admin-users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', userId: authUser.id })
    })
    const data = await res.json()
    if (data.error) { alert('削除に失敗しました: ' + data.error) }
    else { await fetchUsers() }
    setProcessing(false)
  }

  const handleLink = async (authUser, memberId) => {
    setProcessing(true)
    // membersテーブルのemailを更新して紐付け
    if (memberId) {
      await supabase.from('members').update({ email: authUser.email }).eq('id', parseInt(memberId))
    } else {
      // 紐付け解除
      await supabase.from('members').update({ email: null }).eq('email', authUser.email)
    }
    setLinkModal(null)
    await fetchUsers()
    setProcessing(false)
  }

  const handleRoleUpdate = async (authUser, role) => {
    setProcessing(true)
    const member = members.find(m => m.email === authUser.email)
    if (member) {
      await supabase.from('members').update({ role }).eq('id', member.id)
    }
    setRoleModal(null)
    await fetchUsers()
    setProcessing(false)
  }

  // 管理権限の付与・剥奪
  const handleToggleAdmin = async (authUser, member) => {
    const newVal = !member.is_admin
    const label  = newVal ? '管理者権限を付与' : '管理者権限を解除'
    if (!window.confirm(`${member.name} の${label}しますか？`)) return
    setProcessing(true)
    await supabase.from('members').update({ is_admin: newVal }).eq('id', member.id)
    await fetchUsers()
    setProcessing(false)
  }

  const formatDate = (d) => {
    if (!d) return 'ログイン履歴なし'
    const dt = new Date(d)
    return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
  }

  if (loading) return <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>Authユーザーを取得中...</div>

  if (error) return (
    <div style={{ padding: '20px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 12, color: '#ff6b6b', fontSize: 13, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ エラー: {error}</div>
      <div style={{ color: '#a0a8be', fontSize: 12, lineHeight: 1.6 }}>
        Supabase Admin APIへのアクセスに失敗しました。<br/>
        Vercelの環境変数に <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4 }}>SUPABASE_SERVICE_ROLE_KEY</code> が設定されているか確認してください。<br/>
        （Supabase ダッシュボード → Settings → API → service_role）
      </div>
    </div>
  )

  // membersテーブルとの照合
  const getUserMember = (email) => members.find(m => m.email === email)
  const linkedCount   = authUsers.filter(u => getUserMember(u.email)).length
  const unlinkedCount = authUsers.length - linkedCount

  return (
    <div style={{ maxWidth: 900 }}>
      {/* サマリー */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Authアカウント総数', value: authUsers.length, color: '#4d9fff' },
          { label: '組織図と連携済み',   value: linkedCount,      color: '#00d68f' },
          { label: '未紐付け',           value: unlinkedCount,    color: '#ff9f43' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111828', border: `1px solid ${s.color}25`, borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 10, color: '#606880', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ユーザーリスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {authUsers.map(u => {
          const member    = getUserMember(u.email)
          const isMe      = u.email === currentUser?.email
          const color     = member ? avatarColor(member.name) : '#606880'
          const hasLinked = !!member

          return (
            <div key={u.id} style={{ background: '#111828', border: `1px solid ${hasLinked ? 'rgba(0,214,143,0.15)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
              {/* 自分バッジ */}
              {isMe && <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(77,159,255,0.15)', color: '#4d9fff', border: '1px solid rgba(77,159,255,0.3)' }}>自分</div>}

              {/* アバター */}
              {member?.avatar_url ? (
                <img src={member.avatar_url} alt={member.name} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${color}50`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: `${color}20`, border: `2px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color, flexShrink: 0 }}>
                  {member ? member.name.slice(0, 2) : u.email?.slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* メイン情報 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  {member ? (
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>{member.name}</span>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#606880', fontStyle: 'italic' }}>（未紐付け）</span>
                  )}
                  {member?.is_admin && (
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: 'rgba(255,209,102,0.15)', color: '#ffd166', fontWeight: 700, border: '1px solid rgba(255,209,102,0.35)' }}>👑 管理者</span>
                  )}
                  {member?.role && (
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: `${color}15`, color, fontWeight: 600, border: `1px solid ${color}30` }}>{member.role}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#4d9fff', marginBottom: 3 }}>✉ {u.email}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#404660', flexWrap: 'wrap' }}>
                  {member?.role && <span>🏷 {member.role}</span>}
                  <span>🕐 最終ログイン: {formatDate(u.last_sign_in_at)}</span>
                  <span>📅 登録日: {formatDate(u.created_at)}</span>
                </div>
              </div>

              {/* アクション */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                {/* 紐付けステータス */}
                <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: hasLinked ? 'rgba(0,214,143,0.12)' : 'rgba(255,159,67,0.1)', color: hasLinked ? '#00d68f' : '#ff9f43', border: `1px solid ${hasLinked ? 'rgba(0,214,143,0.3)' : 'rgba(255,159,67,0.25)'}` }}>
                  {hasLinked ? '✓ 組織図連携済み' : '未紐付け'}
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {/* 紐付け変更（管理者のみ） */}
                  {isAdmin && (
                    <button onClick={() => setLinkModal({ authUser: u })} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(77,159,255,0.3)', background: 'rgba(77,159,255,0.08)', color: '#4d9fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      {hasLinked ? '紐付け変更' : '紐付け'}
                    </button>
                  )}
                  {/* ロール変更（管理者のみ・紐付け済みの場合） */}
                  {isAdmin && member && (
                    <button onClick={() => setRoleModal({ authUser: u, member })} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', color: '#a855f7', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      ロール変更
                    </button>
                  )}
                  {/* 管理権限付与・剥奪（管理者のみ・自分以外・紐付け済み） */}
                  {isAdmin && !isMe && member && (
                    <button onClick={() => handleToggleAdmin(u, member)} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${member.is_admin ? 'rgba(255,209,102,0.4)' : 'rgba(255,209,102,0.2)'}`, background: member.is_admin ? 'rgba(255,209,102,0.15)' : 'rgba(255,209,102,0.06)', color: '#ffd166', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      {member.is_admin ? '👑 管理者解除' : '👑 管理者にする'}
                    </button>
                  )}
                  {/* 削除（管理者のみ・自分は削除不可） */}
                  {isAdmin && !isMe && (
                    <button onClick={() => handleDelete(u)} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,107,107,0.25)', background: 'rgba(255,107,107,0.08)', color: '#ff6b6b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      削除
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 紐付けモーダル */}
      {linkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setLinkModal(null)}>
          <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '24px', width: 440, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>組織図メンバーと紐付け</div>
            <div style={{ fontSize: 12, color: '#4d9fff', marginBottom: 16 }}>{linkModal.authUser.email}</div>
            <div style={{ fontSize: 12, color: '#606880', marginBottom: 16 }}>紐付けるメンバーを選択してください（変更すると旧紐付けは解除されます）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              <div onClick={() => handleLink(linkModal.authUser, null)}
                style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,107,107,0.2)', background: 'rgba(255,107,107,0.06)', color: '#ff6b6b', fontSize: 12, fontWeight: 600 }}>
                🔗 紐付けを解除する
              </div>
              {members.map(m => {
                const alreadyLinked = m.email === linkModal.authUser.email
                const linkedToOther = m.email && m.email !== linkModal.authUser.email
                const c = avatarColor(m.name)
                return (
                  <div key={m.id} onClick={() => !linkedToOther && handleLink(linkModal.authUser, m.id)}
                    style={{ padding: '10px 14px', borderRadius: 8, cursor: linkedToOther ? 'not-allowed' : 'pointer', border: `1px solid ${alreadyLinked ? 'rgba(0,214,143,0.4)' : linkedToOther ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`, background: alreadyLinked ? 'rgba(0,214,143,0.1)' : linkedToOther ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 10, opacity: linkedToOther ? 0.4 : 1 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${c}20`, border: `1.5px solid ${c}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: c, flexShrink: 0 }}>{m.name.slice(0, 2)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: '#606880' }}>{m.role} {m.email ? `（${m.email}）` : '（メール未設定）'}</div>
                    </div>
                    {alreadyLinked && <span style={{ fontSize: 10, color: '#00d68f', fontWeight: 700 }}>現在</span>}
                    {linkedToOther && <span style={{ fontSize: 10, color: '#606880' }}>他のアカウントと連携中</span>}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setLinkModal(null)} style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#a0a8be', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* ロール変更モーダル */}
      {roleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setRoleModal(null)}>
          <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '24px', width: 360 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>ロールを変更</div>
            <div style={{ fontSize: 12, color: '#a855f7', marginBottom: 16 }}>{roleModal.member.name}（{roleModal.authUser.email}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ROLES.map(r => {
                const isActive = roleModal.member.role === r
                return (
                  <div key={r} onClick={() => handleRoleUpdate(roleModal.authUser, r)}
                    style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isActive ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`, background: isActive ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: isActive ? '#a855f7' : '#e8eaf0', fontWeight: isActive ? 700 : 400 }}>{r}</span>
                    {isActive && <span style={{ fontSize: 10, color: '#a855f7', fontWeight: 700 }}>現在</span>}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setRoleModal(null)} style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#a0a8be', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MemberPage({ currentUser }) {
  const [members, setMembers] = useState([])
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [activeTab, setActiveTab] = useState('org')
  const [webhookEdit, setWebhookEdit] = useState(null) // { levelId, url }

  // ログインユーザーが管理者かどうか
  const myMember = members.find(m => m.email === currentUser?.email)
  const isAdmin  = myMember?.is_admin === true

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: lvls }, { data: mems }] = await Promise.all([
      supabase.from('levels').select('*').order('id'),
      supabase.from('members').select('*').order('id'),
    ])
    if (lvls) setLevels(lvls)
    if (mems) setMembers(mems)
    setLoading(false)
  }

  const handleSave = async (form) => {
    const payload = {
      name: form.name, role: form.role, level_id: form.level_id,
      email: form.email, avatar_url: form.avatar_url,
      sub_level_ids: form.sub_level_ids || [],
    }
    if (form.id) {
      await supabase.from('members').update(payload).eq('id', form.id)
    } else {
      await supabase.from('members').insert([payload])
    }
    setModal(null)
    loadData()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('このメンバーを削除しますか？')) return
    await supabase.from('members').delete().eq('id', id)
    loadData()
  }

  const handleSaveWebhook = async (levelId, url) => {
    await supabase.from('levels').update({ slack_webhook_url: url || null }).eq('id', levelId)
    setWebhookEdit(null)
    loadData()
  }

  const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
  const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }

  function getDepth(levelId) {
    let depth = 0
    let cur = levels.find(l => l.id === levelId)
    while (cur && cur.parent_id) { depth++; cur = levels.find(l => l.id === cur.parent_id) }
    return depth
  }

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === id)
  const getLevelMembers = id => members.filter(m => m.level_id === id || (m.sub_level_ids && m.sub_level_ids.includes(id)))
  const isSub = (m, levelId) => m.level_id !== levelId && (m.sub_level_ids || []).includes(levelId)
  const getLayerColor = id => LAYER_COLORS[getDepth(id)] || '#a0a8be'

  function LevelSection({ levelId, depth = 0 }) {
    const level = levels.find(l => l.id === levelId)
    const children = getChildren(levelId)
    const mems = getLevelMembers(levelId)
    const color = getLayerColor(levelId)
    const label = LAYER_LABELS[depth] || ''
    if (!level) return null

    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 14, fontWeight: 700, color }}>{level.name}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: `${color}18`, color, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 11, color: '#404660' }}>{mems.length}名</span>
          {isAdmin && (
            <button onClick={() => setWebhookEdit({ levelId, url: level.slack_webhook_url || '' })} style={{
              padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
              background: level.slack_webhook_url ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${level.slack_webhook_url ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.1)'}`,
              color: level.slack_webhook_url ? '#a855f7' : '#606880',
            }}>
              {level.slack_webhook_url ? '📨 Slack設定済み' : '📨 Slack設定'}
            </button>
          )}
        </div>
        {/* Slack Webhook URL 編集インライン */}
        {webhookEdit && webhookEdit.levelId === levelId && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(168,85,247,0.06)', borderRadius: 10, border: '1px solid rgba(168,85,247,0.15)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', marginBottom: 6 }}>Slack Webhook URL</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={webhookEdit.url}
                onChange={e => setWebhookEdit(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://hooks.slack.com/services/..."
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)', color: '#e0e4f0', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                }}
              />
              <button onClick={() => handleSaveWebhook(levelId, webhookEdit.url)} style={{
                padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                background: 'linear-gradient(135deg,#a855f7,#4d9fff)', border: 'none', color: '#fff',
              }}>保存</button>
              <button onClick={() => setWebhookEdit(null)} style={{
                padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#606880',
              }}>取消</button>
            </div>
            <div style={{ fontSize: 10, color: '#606880', marginTop: 4 }}>未設定の場合、親部署またはデフォルトのWebhookに送信されます</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: children.length ? 24 : 0 }}>
          {mems.map(m => (
            <MemberCard key={m.id} member={m} color={color} isSub={isSub(m, levelId)}
              onEdit={() => setModal({ type: 'edit', member: m })}
              onDelete={() => handleDelete(m.id)} />
          ))}
          <div onClick={() => setModal({ type: 'add', levelId })} style={{
            width: 160, minHeight: 110, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 14,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, cursor: 'pointer', color: '#404660', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 22 }}>＋</span>
            <span style={{ fontSize: 11 }}>メンバー追加</span>
          </div>
        </div>
        {children.length > 0 && (
          <div style={{ marginLeft: 24, paddingLeft: 20, borderLeft: `2px solid ${color}25` }}>
            {children.map(c => <LevelSection key={c.id} levelId={c.id} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>

  const tabs = [
    { key: 'org',   label: '👥 組織図',      desc: 'メンバーの所属・役割' },
    { key: 'users', label: '🔑 ユーザー一覧', desc: 'ログインアカウント' },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>組織管理</div>
        <div style={{ fontSize: 13, color: '#606880' }}>メンバーの所属・役割とログインアカウントを確認できます</div>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', maxWidth: 460 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: activeTab === tab.key ? (tab.key === 'org' ? 'linear-gradient(135deg,#4d9fff,#a855f7)' : 'linear-gradient(135deg,#00d68f,#4d9fff)') : 'transparent',
            color: activeTab === tab.key ? '#fff' : '#606880',
            transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{tab.label}</div>
            <div style={{ fontSize: 10, opacity: activeTab === tab.key ? 0.85 : 0.6, marginTop: 2 }}>{tab.desc}</div>
          </button>
        ))}
      </div>

      {activeTab === 'org' && (
        <div>{roots.map(r => <LevelSection key={r.id} levelId={r.id} depth={0} />)}</div>
      )}
      {activeTab === 'users' && <UserListTab members={members} currentUser={currentUser} isAdmin={isAdmin} />}

      {modal && (
        <MemberModal
          initial={modal.member}
          levels={levels}
          defaultLevelId={modal.levelId}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ─── アバター表示（画像 or イニシャル） ────────────────────────────────────────
export function MemberAvatar({ member, color, size = 48 }) {
  const initial = member?.name ? member.name.charAt(0) : '?'
  if (member?.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={member.name}
        style={{
          width: size, height: size, borderRadius: '50%',
          border: `2px solid ${color}50`, objectFit: 'cover',
          display: 'block',
        }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}20`, border: `2px solid ${color}50`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color, flexShrink: 0,
    }}>
      {initial}
    </div>
  )
}

function MemberCard({ member, color, onEdit, onDelete, isSub }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 160, background: hover ? '#1a2438' : '#111828',
        border: `1px solid ${hover ? color + '50' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14, padding: '18px 16px', textAlign: 'center',
        borderTop: `3px solid ${color}`, transition: 'all 0.2s', cursor: 'default',
        boxShadow: hover ? `0 8px 24px ${color}15` : 'none', position: 'relative',
      }}
    >
      {hover && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
          <button onClick={onEdit} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#a0a8be', width: 22, height: 22, borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
          <button onClick={onDelete} style={{ background: 'rgba(255,107,107,0.1)', border: 'none', color: '#ff6b6b', width: 22, height: 22, borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <MemberAvatar member={member} color={color} size={48} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#dde0ec', marginBottom: 4 }}>
        {member.name}
        {isSub && <span style={{ fontSize: 9, color: '#ff9f43', background: 'rgba(255,159,67,0.15)', border: '1px solid rgba(255,159,67,0.3)', padding: '1px 5px', borderRadius: 99, marginLeft: 4, fontWeight: 600, verticalAlign: 'middle' }}>兼</span>}
      </div>
      <div style={{ fontSize: 11, color, marginBottom: 4, fontWeight: 600 }}>{member.role}</div>
      {member.email && <div style={{ fontSize: 10, color: '#404660', wordBreak: 'break-all' }}>{member.email}</div>}
    </div>
  )
}

function MemberModal({ initial, levels, defaultLevelId, onSave, onClose }) {
  const [name, setName]         = useState(initial?.name || '')
  const [role, setRole]         = useState(initial?.role || '')
  const [email, setEmail]       = useState(initial?.email || '')
  const [levelId, setLevelId]   = useState(String(initial?.level_id || defaultLevelId || ''))
  const [subLevelIds, setSubLevelIds] = useState((initial?.sub_level_ids || []).map(String))
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatar_url || '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]     = useState(false)
  const fileRef = useRef(null)

  // 画像アップロード
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください'); return }
    if (file.size > 2 * 1024 * 1024) { alert('2MB以下の画像を選択してください'); return }

    setUploading(true)
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { cacheControl: '3600', upsert: false })

    if (error) {
      alert('アップロードに失敗しました: ' + error.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
    setAvatarUrl(urlData.publicUrl)
    setUploading(false)
  }

  const removeAvatar = () => setAvatarUrl('')

  const save = async () => {
    if (!name.trim() || !levelId) return
    setSaving(true)
    await onSave({ id: initial?.id, name, role, email, level_id: parseInt(levelId), sub_level_ids: subLevelIds.filter(id => id !== levelId).map(Number), avatar_url: avatarUrl })
    setSaving(false)
  }

  const previewColor = '#4d9fff'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#141926', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 26, width: '100%', maxWidth: 440, boxShadow: '0 28px 80px rgba(0,0,0,0.65)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{initial ? 'メンバーを編集' : 'メンバーを追加'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#a0a8be', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* アバター設定 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#606880', marginBottom: 10 }}>プロフィール画像</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* プレビュー */}
            <div style={{ flexShrink: 0 }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="preview" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(77,159,255,0.5)' }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(77,159,255,0.15)', border: '2px solid rgba(77,159,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#4d9fff' }}>
                  {name ? name.charAt(0) : '?'}
                </div>
              )}
            </div>
            {/* ボタン類 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(77,159,255,0.4)', background: 'rgba(77,159,255,0.1)', color: '#4d9fff', fontSize: 12, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.6 : 1 }}
              >
                {uploading ? '⏳ アップロード中...' : '📷 画像をアップロード'}
              </button>
              {avatarUrl && (
                <button
                  onClick={removeAvatar}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: '#ff6b6b', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  🗑 画像を削除
                </button>
              )}
              <div style={{ fontSize: 10, color: '#404660' }}>JPG / PNG / WebP・2MB以下</div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>

        {/* テキストフィールド */}
        {[
          { label: '名前 *', val: name, set: setName, ph: '例: 田中 花子' },
          { label: '役職', val: role, set: setRole, ph: '例: 事業部長' },
          { label: 'メールアドレス', val: email, set: setEmail, ph: '例: tanaka@example.com' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 13 }}>
            <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>{f.label}</div>
            <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
        ))}

        {/* 主所属 */}
        <div style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>主所属 *</div>
          <select value={levelId} onChange={e => { setLevelId(e.target.value); setSubLevelIds(s => s.filter(id => id !== e.target.value)) }}
            style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}>
            <option value="">選択してください</option>
            {levels.map(l => <option key={l.id} value={String(l.id)}>{l.icon} {l.name}</option>)}
          </select>
        </div>

        {/* 兼任（副所属） */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>兼任（副所属）</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: subLevelIds.length > 0 ? 8 : 0 }}>
            {subLevelIds.map(sid => {
              const lv = levels.find(l => String(l.id) === sid)
              return lv ? (
                <span key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, background: 'rgba(255,159,67,0.12)', border: '1px solid rgba(255,159,67,0.3)', color: '#ff9f43', fontSize: 11, fontWeight: 600 }}>
                  {lv.icon} {lv.name}
                  <span onClick={() => setSubLevelIds(s => s.filter(id => id !== sid))} style={{ cursor: 'pointer', marginLeft: 2, fontSize: 13, lineHeight: 1 }}>✕</span>
                </span>
              ) : null
            })}
          </div>
          <select value="" onChange={e => { if (e.target.value && e.target.value !== levelId && !subLevelIds.includes(e.target.value)) setSubLevelIds(s => [...s, e.target.value]) }}
            style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#a0a8be', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}>
            <option value="">＋ 兼任先を追加...</option>
            {levels.filter(l => String(l.id) !== levelId && !subLevelIds.includes(String(l.id))).map(l => (
              <option key={l.id} value={String(l.id)}>{l.icon} {l.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={save} disabled={saving || !name.trim() || uploading} style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: (saving || uploading) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (saving || uploading) ? 0.6 : 1 }}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}
