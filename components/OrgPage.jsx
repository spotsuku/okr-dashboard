'use client'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import TaskManualPage from './TaskManualPage'

// ══════════════════════════════════════════════════
// テーマ定義
// ══════════════════════════════════════════════════
const THEMES = {
  dark: {
    bg:          '#0F1117',
    bgCard:      '#1A1D27',
    bgCard2:     '#1A1D27',
    bgInput:     'rgba(255,255,255,0.07)',
    bgHover:     'rgba(255,255,255,0.05)',
    bgTable:     'rgba(255,255,255,0.04)',
    border:      'rgba(255,255,255,0.10)',
    borderMid:   'rgba(255,255,255,0.16)',
    borderEdit:  'rgba(93,202,165,0.6)',
    text:        '#E8ECF0',
    textSub:     '#B0BAC8',
    textMuted:   '#7a8599',
    textFaint:   '#4A5468',
    textFaintest:'#333b4d',
    inputBg:     '#1A1D27',
    inputText:   '#E8ECF0',
    selectBg:    '#1A1D27',
    accent:      '#5DCAA5',
    accentDark:  '#0F6E56',
    accentSolid: '#2F7A78',
    warn:        '#F0997B',
    warnBg:      'rgba(216,90,48,0.2)',
    badgeBg:     'rgba(47,122,120,0.25)',
    badgeBorder: 'rgba(47,122,120,0.3)',
    navActiveBg: 'rgba(47,122,120,0.15)',
    navActiveText:'#5DCAA5',
    progressBg:  'rgba(255,255,255,0.08)',
    progressFill:'#2F7A78',
    eventBandBg: '#0F6E56',
    eventBandText:'#E1F5EE',
  },
  light: {
    bg:          '#EEF2F5',
    bgCard:      '#FFFFFF',
    bgCard2:     '#FFFFFF',
    bgInput:     '#F3F4F6',
    bgHover:     '#F7FAFC',
    bgTable:     '#FFFFFF',
    border:      '#DDE4EA',
    borderMid:   '#B0C0CC',
    borderEdit:  '#5A8A7A',
    text:        '#2D3748',
    textSub:     '#5A6577',
    textMuted:   '#A0AEC0',
    textFaint:   '#A0AEC0',
    textFaintest:'#DDE4EA',
    inputBg:     '#FFFFFF',
    inputText:   '#2D3748',
    selectBg:    '#FFFFFF',
    accent:      '#5A8A7A',
    accentDark:  '#3D6B5E',
    accentSolid: '#5A8A7A',
    warn:        '#E8875A',
    warnBg:      'rgba(232,135,90,0.1)',
    badgeBg:     'rgba(90,138,122,0.15)',
    badgeBorder: 'rgba(90,138,122,0.3)',
    navActiveBg: '#EEF7F3',
    navActiveText:'#3D6B5E',
    progressBg:  '#E8EEF2',
    progressFill:'#5A8A7A',
    eventBandBg: '#3D6B5E',
    eventBandText:'#FFFFFF',
  },
}

// グローバルテーマ参照（コンテキスト不要の簡易実装）
let _T = THEMES.dark
const T = () => _T


// ── 期間カレンダー入力ユーティリティ ─────────────────────────────
// 「2026年4月1日」→ "2026-04-01" (input[type=date]用)
function periodToDateInput(str) {
  if (!str) return ''
  const m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return ''
  return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`
}
// "2026-04-01" → 「2026年4月1日」
function dateInputToJa(val) {
  if (!val) return ''
  const [y, m, d] = val.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}
// 期間文字列を開始・終了に分割
// 例: "2026年4月1日〜現在" → { start: "2026-04-01", end: "" }
function parsePeriod(period) {
  if (!period) return { start: '', end: '' }
  const parts = period.split(/[〜~～]/)
  const startJa = (parts[0] || '').trim()
  const endJa   = (parts[1] || '').trim()
  return {
    start: periodToDateInput(startJa) || startJa,
    end:   periodToDateInput(endJa)   || (endJa === '現在' || endJa === '' ? endJa : endJa),
  }
}
// { start, end } → 「2026年4月1日 〜 現在」
function buildPeriod(start, end) {
  const startJa = start ? dateInputToJa(start) || start : ''
  const endJa   = end   ? (end === '現在' ? '現在' : dateInputToJa(end) || end) : '現在'
  if (!startJa) return ''
  return `${startJa} 〜 ${endJa}`
}

// ── 期間入力コンポーネント ────────────────────────────────────────
function PeriodInput({ value, onChange }) {
  const { start, end } = parsePeriod(value)
  const [ongoing, setOngoing] = React.useState(end === '現在' || end === '')

  const handleStart = (v) => {
    onChange(buildPeriod(v, ongoing ? '現在' : end))
  }
  const handleEnd = (v) => {
    onChange(buildPeriod(start, v))
  }
  const handleOngoing = (checked) => {
    setOngoing(checked)
    onChange(buildPeriod(start, checked ? '現在' : ''))
  }

  const inputStyle = {
    background: T().bgInput,
    border: `1px solid ${T().borderMid}`,
    borderRadius: 5, padding: '4px 8px',
    color: T().text, fontSize: 11, outline: 'none',
    fontFamily: 'inherit',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: T().textMuted, minWidth: 24 }}>開始</span>
        <input type="date" value={start} onChange={e => handleStart(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 10, color: T().textMuted }}>〜</span>
        {ongoing ? (
          <span style={{ fontSize: 11, color: T().textSub, padding: '4px 8px', background: T().border, borderRadius: 5 }}>現在</span>
        ) : (
          <input type="date" value={end !== '現在' ? end : ''} onChange={e => handleEnd(e.target.value)} style={inputStyle} />
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: T().textSub }}>
          <input type="checkbox" checked={ongoing} onChange={e => handleOngoing(e.target.checked)}
            style={{ accentColor: T().accent }} />
          現在も継続中
        </label>
      </div>
      {value && (
        <div style={{ fontSize: 10, color: T().textMuted, paddingLeft: 30 }}>
          表示: {value}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// 定数
// ══════════════════════════════════════════════════
const STATUS_OPTS = [
  { value: 'active',    label: '🔵 現役',     bg: 'rgba(93,202,165,0.15)',  color: '#5DCAA5', border: 'rgba(93,202,165,0.3)' },
  { value: 'expanding', label: '🟡 拡充中',   bg: 'rgba(240,153,123,0.15)', color: '#F0997B', border: 'rgba(240,153,123,0.3)' },
  { value: 'future',    label: '🟣 追加予定', bg: 'rgba(176,186,200,0.15)', color: '#B0BAC8', border: 'rgba(176,186,200,0.3)' },
]
const EMP_BADGE = {
  '業務委託':        { bg: 'rgba(93,202,165,0.15)',  color: '#5DCAA5' },
  '正社員':          { bg: 'rgba(61,107,94,0.15)',   color: '#3D6B5E' },
  '業務委託→正社員': { bg: 'rgba(240,153,123,0.15)', color: '#F0997B' },
  '正社員予定':      { bg: 'rgba(240,153,123,0.15)', color: '#F0997B' },
}
const EMP_OPTS = ['業務委託', '正社員', '業務委託→正社員', '正社員予定']
const TASK_STATUS_OPTS = ['same', 'new', 'del']
const AVATAR_COLORS = ['#5A8A7A','#3D6B5E','#5DCAA5','#E8875A','#6B8DB5','#B07D9E','#C4956A','#5B9EA6','#8B7EC8','#D4816B']

// levelsのnameから色を推定
const DEPT_COLOR_RULES = [
  { match: 'コミュニティ', color: '#5A8A7A' },
  { match: 'ユース',       color: '#3D6B5E' },
  { match: 'クラブ連携',   color: '#0F6E56' },
  { match: '経営',         color: '#E8875A' },
]
function getDeptColor(name) {
  const rule = DEPT_COLOR_RULES.find(r => name && name.includes(r.match))
  return rule ? rule.color : '#5A8A7A'
}
function getStatusBadge(status) {
  return STATUS_OPTS.find(s => s.value === status) || STATUS_OPTS[0]
}
function getEmpBadge(emp) {
  const key = Object.keys(EMP_BADGE).find(k => emp && emp.includes(k)) || '業務委託'
  return EMP_BADGE[key]
}
function avatarColor(name) {
  if (!name) return T().textMuted
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const ROLES = ['管理者', 'ディレクター', 'マネージャー', 'メンバー', 'その他']

// ── ユーザー一覧タブ（MemberPageから移植） ───────────────────────────────────
function UserListTab({ members, currentUser, isAdmin }) {
  const [authUsers, setAuthUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [linkModal, setLinkModal] = useState(null)
  const [roleModal, setRoleModal] = useState(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin-users')
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || '取得に失敗しました'); setLoading(false); return }
      const sorted = (data.users || []).sort((a, b) => new Date(b.last_sign_in_at || 0) - new Date(a.last_sign_in_at || 0))
      setAuthUsers(sorted)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const handleDelete = async (authUser) => {
    if (!window.confirm(`${authUser.email} のアカウントを削除しますか？\n※この操作は取り消せません`)) return
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
    if (memberId) {
      await supabase.from('members').update({ email: authUser.email }).eq('id', parseInt(memberId))
    } else {
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

  const handleToggleAdmin = async (authUser, member) => {
    const newVal = !member.is_admin
    const label = newVal ? '管理者権限を付与' : '管理者権限を解除'
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

  if (loading) return <div style={{ padding: 40, color: T().accent, fontSize: 14 }}>Authユーザーを取得中...</div>

  if (error) return (
    <div style={{ padding: '20px', background: T().warnBg, border: `1px solid ${T().warn}`, borderRadius: 12, color: T().warn, fontSize: 13, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ エラー: {error}</div>
      <div style={{ color: T().textMuted, fontSize: 12, lineHeight: 1.6 }}>
        Supabase Admin APIへのアクセスに失敗しました。<br/>
        Vercelの環境変数に <code style={{ background: T().border, padding: '1px 6px', borderRadius: 4 }}>SUPABASE_SERVICE_ROLE_KEY</code> が設定されているか確認してください。<br/>
        （Supabase ダッシュボード → Settings → API → service_role）
      </div>
    </div>
  )

  const getUserMember = (email) => members.find(m => m.email === email)
  const linkedCount = authUsers.filter(u => getUserMember(u.email)).length
  const unlinkedCount = authUsers.length - linkedCount

  return (
    <div style={{ maxWidth: 900 }}>
      {/* サマリー */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Authアカウント総数', value: authUsers.length, color: T().accent },
          { label: '組織図と連携済み',   value: linkedCount,      color: T().accent },
          { label: '未紐付け',           value: unlinkedCount,    color: T().warn },
        ].map(s => (
          <div key={s.label} style={{ background: T().bgCard, border: `1px solid ${s.color}25`, borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 10, color: T().textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ユーザーリスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {authUsers.map(u => {
          const member = getUserMember(u.email)
          const isMe = u.email === currentUser?.email
          const color = member ? avatarColor(member.name) : T().textMuted
          const hasLinked = !!member

          return (
            <div key={u.id} style={{ background: T().bgCard, border: `1px solid ${hasLinked ? T().badgeBorder : T().border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
              {isMe && <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}` }}>自分</div>}

              {member?.avatar_url ? (
                <img src={member.avatar_url} alt={member.name} style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${color}50`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: `${color}20`, border: `2px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color, flexShrink: 0 }}>
                  {member ? member.name.slice(0, 2) : u.email?.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  {member ? (
                    <span style={{ fontSize: 15, fontWeight: 700, color: T().text }}>{member.name}</span>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: T().textMuted, fontStyle: 'italic' }}>（未紐付け）</span>
                  )}
                  {member?.is_admin && (
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: T().warnBg, color: T().warn, fontWeight: 700, border: `1px solid ${T().warn}` }}>👑 管理者</span>
                  )}
                  {member?.role && (
                    <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: `${color}15`, color, fontWeight: 600, border: `1px solid ${color}30` }}>{member.role}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T().accent, marginBottom: 3 }}>✉ {u.email}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T().textFaint, flexWrap: 'wrap' }}>
                  {member?.role && <span>🏷 {member.role}</span>}
                  <span>🕐 最終ログイン: {formatDate(u.last_sign_in_at)}</span>
                  <span>📅 登録日: {formatDate(u.created_at)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: hasLinked ? T().badgeBg : T().warnBg, color: hasLinked ? T().accent : T().warn, border: `1px solid ${hasLinked ? T().badgeBorder : T().warn}` }}>
                  {hasLinked ? '✓ 組織図連携済み' : '未紐付け'}
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {isAdmin && (
                    <button onClick={() => setLinkModal({ authUser: u })} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${T().badgeBorder}`, background: T().badgeBg, color: T().accent, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      {hasLinked ? '紐付け変更' : '紐付け'}
                    </button>
                  )}
                  {isAdmin && member && (
                    <button onClick={() => setRoleModal({ authUser: u, member })} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${T().badgeBorder}`, background: T().badgeBg, color: T().accent, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      ロール変更
                    </button>
                  )}
                  {isAdmin && !isMe && member && (
                    <button onClick={() => handleToggleAdmin(u, member)} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${member.is_admin ? T().warn : T().warn}`, background: member.is_admin ? T().warnBg : T().warnBg, color: T().warn, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      {member.is_admin ? '👑 管理者解除' : '👑 管理者にする'}
                    </button>
                  )}
                  {isAdmin && !isMe && (
                    <button onClick={() => handleDelete(u)} disabled={processing}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${T().warn}`, background: T().warnBg, color: T().warn, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
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
          <div style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 16, padding: '24px', width: 440, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>組織図メンバーと紐付け</div>
            <div style={{ fontSize: 12, color: T().accent, marginBottom: 16 }}>{linkModal.authUser.email}</div>
            <div style={{ fontSize: 12, color: T().textMuted, marginBottom: 16 }}>紐付けるメンバーを選択してください（変更すると旧紐付けは解除されます）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              <div onClick={() => handleLink(linkModal.authUser, null)}
                style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${T().warn}`, background: T().warnBg, color: T().warn, fontSize: 12, fontWeight: 600 }}>
                🔗 紐付けを解除する
              </div>
              {members.map(m => {
                const alreadyLinked = m.email === linkModal.authUser.email
                const linkedToOther = m.email && m.email !== linkModal.authUser.email
                const c = avatarColor(m.name)
                return (
                  <div key={m.id} onClick={() => !linkedToOther && handleLink(linkModal.authUser, m.id)}
                    style={{ padding: '10px 14px', borderRadius: 8, cursor: linkedToOther ? 'not-allowed' : 'pointer', border: `1px solid ${alreadyLinked ? T().badgeBorder : linkedToOther ? T().border : T().border}`, background: alreadyLinked ? T().badgeBg : linkedToOther ? T().bgHover : T().bgCard, display: 'flex', alignItems: 'center', gap: 10, opacity: linkedToOther ? 0.4 : 1 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${c}20`, border: `1.5px solid ${c}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: c, flexShrink: 0 }}>{m.name.slice(0, 2)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T().text }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: T().textMuted }}>{m.role} {m.email ? `（${m.email}）` : '（メール未設定）'}</div>
                    </div>
                    {alreadyLinked && <span style={{ fontSize: 10, color: T().accent, fontWeight: 700 }}>現在</span>}
                    {linkedToOther && <span style={{ fontSize: 10, color: T().textMuted }}>他のアカウントと連携中</span>}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setLinkModal(null)} style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${T().border}`, background: 'transparent', color: T().textMuted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* ロール変更モーダル */}
      {roleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setRoleModal(null)}>
          <div style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 16, padding: '24px', width: 360 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>ロールを変更</div>
            <div style={{ fontSize: 12, color: T().accent, marginBottom: 16 }}>{roleModal.member.name}（{roleModal.authUser.email}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ROLES.map(r => {
                const isActive = roleModal.member.role === r
                return (
                  <div key={r} onClick={() => handleRoleUpdate(roleModal.authUser, r)}
                    style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isActive ? T().badgeBorder : T().border}`, background: isActive ? T().badgeBg : T().bgCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: isActive ? T().accent : T().text, fontWeight: isActive ? 700 : 400 }}>{r}</span>
                    {isActive && <span style={{ fontSize: 10, color: T().accent, fontWeight: 700 }}>現在</span>}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setRoleModal(null)} style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${T().border}`, background: 'transparent', color: T().textMuted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// 共通UIパーツ
// ══════════════════════════════════════════════════
function Avatar({ name, size = 36, avatar_url }) {
  if (avatar_url) {
    return (
      <img src={avatar_url} alt={name || ''} style={{
        width: size, height: size, borderRadius: Math.round(size * 0.28),
        objectFit: 'cover', border: `1.5px solid ${avatarColor(name)}60`, flexShrink: 0
      }} />
    )
  }
  const color = avatarColor(name)
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: `${color}28`, border: `1.5px solid ${color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 800, color, flexShrink: 0 }}>
      {name ? name[0] : '?'}
    </div>
  )
}
function InlineInput({ value, onChange, placeholder = '', style = {} }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '4px 8px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%', ...style }} />
  )
}

// 担当（サポート）複数選択コンポーネント
function SupportSelect({ value, onChange, memberNames, borderColor }) {
  const selected = value ? value.split('・').map(s => s.trim()).filter(Boolean) : []
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)

  const toggle = (name) => {
    const next = selected.includes(name)
      ? selected.filter(s => s !== name)
      : [...selected, name]
    onChange(next.join('・'))
  }

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 180) })
    }
    setOpen(p => !p)
  }

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <div onClick={handleOpen}
        style={{ background: T().inputBg, border: `1px solid ${borderColor || T().borderEdit}`, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: T().inputText, minHeight: 26, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
        {selected.length === 0
          ? <span style={{ color: T().textFaintest }}>（なし）</span>
          : selected.map(n => (
            <span key={n} style={{ background: `${avatarColor(n)}22`, color: avatarColor(n), borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{n}</span>
          ))
        }
        <span style={{ marginLeft: 'auto', color: T().textFaintest, fontSize: 9 }}>▾</span>
      </div>
      {open && (
        <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999, background: T().bgCard, border: `1px solid ${T().borderMid}`, borderRadius: 6, maxHeight: 220, overflowY: 'auto' }}>
          {memberNames.map(name => {
            const isSel = selected.includes(name)
            return (
              <div key={name} onClick={() => toggle(name)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: isSel ? `${avatarColor(name)}15` : 'transparent', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T().bgHover }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? `${avatarColor(name)}15` : 'transparent' }}
              >
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${isSel ? avatarColor(name) : T().borderMid}`, background: isSel ? avatarColor(name) : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSel && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                </div>
                <Avatar name={name} size={16} />
                <span style={{ fontSize: 12, color: isSel ? avatarColor(name) : T().text, fontWeight: isSel ? 700 : 400 }}>{name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SaveBtn({ saving, saved, onClick, label = '保存' }) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: T().accentSolid, color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.3s' }}>
      {saved ? '✓ 保存済み' : saving ? '保存中...' : label}
    </button>
  )
}

// ══════════════════════════════════════════════════
// JDデフォルトデータ（Supabase org_member_jd が空の場合のフォールバック）
// ══════════════════════════════════════════════════
const JD_DEFAULT = {
  '加藤翼':   { avatar_color:['#5A8A7A','rgba(90,138,122,0.15)'], versions:[
    { period:'2025年6月 〜現在', role:'コミュニティ事業責任者', emp:'業務委託', working:'週2日', role_desc:'NEO福岡の１年間の運営を統括する\nNEOが複数拠点でコミュニティ運営できる仕組みを構築する', responsibility:'コミュニティ事業部の成果責任\n事業部のコスト管理', meetings:'・NEO立上げ本部定例（毎週土曜 9:00〜10:30）\n・コミュニティ事業定例（毎週水曜13:00〜14:00）\n・チェックイン定例（毎週月曜朝）', tasks:[{cat:'コミュニティ',task:'NEOのコミュニティの基本設計と改善',status:'same'},{cat:'プログラム',task:'アワードの企画設計・PM計画書',status:'new'}]},
  ]},
  '森朝香':   { avatar_color:['#3D6B5E','rgba(61,107,94,0.15)'], versions:[
    { period:'2025年7月 〜現在', role:'コミュニティマネージャー (教育責任者)', emp:'業務委託', working:'週5（常時）', role_desc:'コミュニティチーム実行責任者（教育責任者業務含む）\n年間プログラムの受講生の受講状況の管理', responsibility:'アカデミア生からヒーローを創出する\n受講生に対するイベントの開催', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン', tasks:[{cat:'コミュニティ運営',task:'アカデミア生のカルテ情報の設計・最新アップデート',status:'same'},{cat:'コミュニティ運営',task:'Playful研修の企画・開発・営業・運営',status:'new'}]},
  ]},
  '面川文香': { avatar_color:['#B07D9E','rgba(176,125,158,0.15)'], versions:[
    { period:'2026年2月 〜現在', role:'企業伴走 兼 総務', emp:'正社員', working:'週5', role_desc:'企業伴走チームとして企業会員への密なコミュニケーション支援\n総務・事務局業務の中心担当', responsibility:'企業会員のNEO活用促進\n総務・事務局業務の実行責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン', tasks:[{cat:'企業伴走',task:'会員企業への適切な量・質・頻度でのコミュニケーション',status:'same'},{cat:'総務',task:'総務（事務作業・HP更新・郵送物管理・問い合わせ対応・経理連携）',status:'same'}]},
  ]},
  '古野絢太': { avatar_color:['#5B9EA6','rgba(91,158,166,0.15)'], versions:[
    { period:'2026年4月 〜現在', role:'企業伴走 兼 事務局長補佐', emp:'業務委託', working:'週3〜4日', role_desc:'企業会員への密な伴走支援\n事務局長補佐として組織全体の業務管理補助', responsibility:'担当企業会員のサクセス支援\n事務局長補佐業務の実行', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例\n・毎朝チェックイン', tasks:[{cat:'企業伴走',task:'企業カルテの情報管理・企業公開情報のリサーチ・アップデート',status:'same'},{cat:'事務局補佐',task:'事務局長補佐（全体PM・資料作成・会議フィードバック）',status:'same'}]},
  ]},
  '鬼木良輔': { avatar_color:['#C4956A','rgba(196,149,106,0.15)'], versions:[
    { period:'2025年10月 〜現在', role:'カスタマーサクセスチーム マネージャー', emp:'業務委託', working:'週2〜3日', role_desc:'NEO福岡のカスタマーサクセスチームのマネジメント\n会員企業のサクセスロードマップ設計・実行', responsibility:'CSチームの成果責任（会員企業のサクセス・継続率）\n研修サービスの品質・売上責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・CS定例（週1〜2回）\n・担当企業との個別MTG（月1〜2回）', tasks:[{cat:'CS戦略',task:'会員企業のサクセスロードマップ企画・実行・改善',status:'same'},{cat:'研修',task:'NEO合同AI研修の企画・運営・改善',status:'same'}]},
  ]},
  '増田雄太朗': { avatar_color:['#6B8DB5','rgba(107,141,181,0.15)'], versions:[
    { period:'2026年1月 〜現在', role:'マーケティングマネージャー （正社員）', emp:'正社員', working:'週5', role_desc:'正社員として全社マーケティングを統括', responsibility:'マーケティング全般の成果責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・マーケ定例（週1〜2回）', tasks:[{cat:'マーケ戦略',task:'年間・四半期ごとのマーケティング計画（KPI設計・チャネル戦略）策定',status:'same'},{cat:'集客',task:'各イベントの集客戦略・広告運用（SNS広告・パートナー連携）',status:'same'}]},
  ]},
  '菅雅也':   { avatar_color:['#E8875A','rgba(232,135,90,0.15)'], versions:[
    { period:'2025年7月 〜現在', role:'クリエイティブマネージャー', emp:'業務委託', working:'週3〜4日', role_desc:'NEO福岡の動画・クリエイティブ制作全般のディレクション', responsibility:'NEO福岡のクリエイティブ品質の責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・広報チーム定例（週1回）', tasks:[{cat:'動画制作',task:'NEO福岡の動画制作・監修・年間動画企画',status:'same'},{cat:'広報',task:'インスタ投稿戦略のアドバイス',status:'same'}]},
  ]},
  '中島啓太': { avatar_color:['#8B7EC8','rgba(139,126,200,0.15)'], versions:[
    { period:'2025年7月 〜現在', role:'クラブパートナーシップ ダイレクター', emp:'業務委託', working:'週2〜3日', role_desc:'提携スポーツクラブとの戦略深化', responsibility:'提携クラブとの長期関係維持・拡大', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・パートナー定例（週1回）', tasks:[{cat:'パートナー開発',task:'提携スポーツチームとの中長期戦略の作成・合意形成',status:'same'},{cat:'プログラム連携',task:'アカデミア（HR）カリキュラム企画・スポーツ連携座組み企画',status:'same'}]},
  ]},
  '中道稔':   { avatar_color:['#D4816B','rgba(212,129,107,0.15)'], versions:[
    { period:'2026年4月 〜8月', role:'イベントチームリーダー', emp:'業務委託', working:'週4〜5日', role_desc:'イベントチームリーダーとしてイベント全般を統括', responsibility:'イベント品質・NPS向上責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・イベント定例（週1〜2回）', tasks:[{cat:'イベント運営',task:'現地イベントロジ作成・運営実務準備',status:'same'},{cat:'チームリード',task:'イベントチームのリーダーシップ・指示出し',status:'new'}]},
    { period:'2026年9月 〜（予定）', role:'イベントチームリーダー （正社員）', emp:'正社員予定', working:'週5', role_desc:'正社員として安定的にイベントチームを統括', responsibility:'イベントチームの長期的な品質・体制確立', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・イベント定例（週1〜2回）', tasks:[{cat:'イベント運営',task:'現地イベントロジ作成・運営実務準備',status:'same'},{cat:'チームリード',task:'イベント振り返り・改善提案',status:'same'}]},
  ]},
  '元美和':   { avatar_color:['#B0BAC8','rgba(176,186,200,0.15)'], versions:[
    { period:'2026年3月 〜現在', role:'コミュニティプロデューサー （NEO九州未来評議会専任）', emp:'業務委託', working:'週3〜4日', role_desc:'NEO九州未来評議会の企画・運営・拡大', responsibility:'NEO九州未来評議会の参加企業数・満足度の向上責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・評議会準備定例（月2〜3回）', tasks:[{cat:'評議会運営',task:'NEO九州未来評議会の当日進行設計・台本作成・ファシリテーション補助',status:'same'},{cat:'評議会拡大',task:'新規参加候補リスト作成・紹介ルート開拓・法人営業',status:'same'}]},
  ]},
}

// ══════════════════════════════════════════════════
// データ取得フック
// ══════════════════════════════════════════════════
function useOrgData(fiscalYear) {
  const [levels, setLevels] = useState([])
  const [teamMeta, setTeamMeta] = useState({})
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [jdRows, setJdRows] = useState({})
  const [taskHistory, setTaskHistory] = useState([])
  const [manuals, setManuals] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('connecting')
  const [orgTableError, setOrgTableError] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all([
      supabase.from('levels').select('*').order('id'),
      supabase.from('org_team_meta').select('*'),
      supabase.from('members').select('*').order('id'),
      supabase.from('org_tasks').select('*').order('id'),
      supabase.from('org_member_jd').select('*').order('version_idx'),
      supabase.from('org_task_history').select('*').order('changed_at'),
      supabase.from('org_task_manuals').select('*').order('sort_order'),
    ])
    const [lvls, meta, mems, taskData, jdData, histData, manualData] = results.map(r => r.data)
    const orgErrors = results.slice(3).filter(r => r.error)
    if (orgErrors.length > 0) {
      console.warn('org_* テーブルが未作成の可能性があります。supabase_setup.sql を実行してください。', orgErrors.map(r => r.error))
      setOrgTableError(true)
    } else {
      setOrgTableError(false)
    }

    const allLvls = lvls || []
    const validLvls = allLvls.filter(l => l.fiscal_year === fiscalYear)
    setLevels(validLvls)
    const metaMap = {}
    ;(meta || []).forEach(m => { metaMap[m.level_id] = m })
    setTeamMeta(metaMap)
    setMembers(mems || [])
    setTasks(taskData && taskData.length > 0 ? taskData : [])

    const rowMap = {}
    ;(jdData || []).forEach(row => {
      // member_idは名前文字列のままキーにする（MemberDetailもMemberJDTabも名前で参照）
      const key = String(row.member_id)
      if (!rowMap[key]) rowMap[key] = []
      rowMap[key].push(row)
    })
    Object.keys(rowMap).forEach(k => rowMap[k].sort((a, b) => a.version_idx - b.version_idx))
    setJdRows(rowMap)
    setTaskHistory(histData || [])
    setManuals(manualData || [])
    setLoading(false)
  }, [fiscalYear])

  // Supabase Realtime
  useEffect(() => {
    reload()
    const channel = supabase
      .channel('org_realtime_' + fiscalYear)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_tasks' }, payload => {
        if (payload.eventType === 'INSERT') {
          // ローカルで既に追加済みの場合は重複させない
          setTasks(prev => prev.some(t => t.id === payload.new.id) ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t))
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== payload.old.id))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, payload => {
        if (payload.eventType === 'INSERT') { setMembers(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]) }
        else if (payload.eventType === 'UPDATE') setMembers(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
        else if (payload.eventType === 'DELETE') setMembers(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_member_jd' }, payload => {
        setJdRows(prev => {
          const next = { ...prev }
          if (payload.eventType === 'DELETE') {
            const mid = payload.old.member_id
            next[mid] = (next[mid] || []).filter(r => r.id !== payload.old.id)
          } else {
            const row = payload.new
            const mid = row.member_id
            const existing = [...(next[mid] || [])]
            const idx = existing.findIndex(r => r.id === row.id)
            if (idx >= 0) existing[idx] = row; else existing.push(row)
            existing.sort((a, b) => a.version_idx - b.version_idx)
            next[mid] = existing
          }
          return next
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_task_history' }, payload => {
        if (payload.eventType === 'INSERT') setTaskHistory(prev => [...prev, payload.new])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_team_meta' }, payload => {
        setTeamMeta(prev => {
          const next = { ...prev }
          if (payload.eventType === 'DELETE') delete next[payload.old.level_id]
          else next[payload.new.level_id] = payload.new
          return next
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_task_manuals' }, payload => {
        if (payload.eventType === 'INSERT') setManuals(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
        else if (payload.eventType === 'UPDATE') setManuals(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
        else if (payload.eventType === 'DELETE') setManuals(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'levels' }, () => { reload() })
      .subscribe(status => {
        setSyncStatus(status === 'SUBSCRIBED' ? 'synced' : status === 'CHANNEL_ERROR' ? 'error' : 'connecting')
      })
    return () => { supabase.removeChannel(channel) }
  }, [fiscalYear]) // eslint-disable-line

  return { levels, teamMeta, members, tasks, jdRows, taskHistory, setTaskHistory, manuals, setManuals, loading, syncStatus, orgTableError, reload, setLevels, setTeamMeta, setMembers, setTasks, setJdRows }
}

// ══════════════════════════════════════════════════
// タブ1: 組織図（levelsテーブルから動的生成）
// ══════════════════════════════════════════════════
function OrgChart({ levels, teamMeta, members, onMemberClick, isAdmin, onTeamMetaUpdate }) {
  const [editingMeta, setEditingMeta] = useState(null)
  const [metaBuf, setMetaBuf] = useState({})
  const [saving, setSaving] = useState(false)
  const [webhookEdit, setWebhookEdit] = useState(null) // { levelId, url }

  const handleSaveWebhook = async (levelId, url) => {
    await supabase.from('levels').update({ slack_webhook_url: url || null }).eq('id', levelId)
    setWebhookEdit(null)
  }

  // ツリー構造：root(parent_id=null) → 事業部 → チーム
  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))

  // 事業部 = rootの直下、チーム = 事業部の直下
  const depts = roots.flatMap(root => getChildren(root.id).map(dept => ({
    ...dept,
    teams: getChildren(dept.id),
    rootName: root.name,
  })))

  // メンバーのlevel_ids対応（兼務含む）
  const getMembersForLevel = levelId =>
    members.filter(m => {
      const ids = Array.isArray(m.level_ids) ? m.level_ids.map(Number) : (m.level_id ? [Number(m.level_id)] : [])
      return ids.includes(Number(levelId))
    })

  const saveTeamMeta = async (levelId) => {
    setSaving(true)
    await supabase.from('org_team_meta').upsert({ level_id: levelId, ...metaBuf }, { onConflict: 'level_id' })
    onTeamMetaUpdate(levelId, metaBuf)
    setSaving(false); setEditingMeta(null)
  }

  if (depts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: T().textFaintest, border: `1px dashed ${T().border}`, borderRadius: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🏗</div>
        <div style={{ fontSize: 15 }}>この年度の組織データがありません</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>OKRページの「組織を管理」から追加してください</div>
      </div>
    )
  }

  return (
    <div>
      {depts.map(dept => {
        const color = getDeptColor(dept.name)
        return (
          <div key={dept.id} style={{ marginBottom: 24, border: `2px solid ${color}60`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: `${color}15`, borderBottom: `2px solid ${color}80`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 16, fontWeight: 700, color }}>{dept.icon} {dept.name}</span>
              <span style={{ fontSize: 11, color: T().textFaint, marginLeft: 'auto' }}>{dept.teams.length}チーム</span>
              {isAdmin && (
                <button onClick={() => setWebhookEdit({ levelId: dept.id, url: dept.slack_webhook_url || '' })}
                  style={{ padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
                    background: dept.slack_webhook_url ? T().badgeBg : T().bgHover,
                    border: `1px solid ${dept.slack_webhook_url ? T().badgeBorder : T().border}`,
                    color: dept.slack_webhook_url ? T().accent : T().textMuted }}>
                  {dept.slack_webhook_url ? '📨 Slack設定済み' : '📨 Slack設定'}
                </button>
              )}
            </div>
            {webhookEdit && webhookEdit.levelId === dept.id && (
              <div style={{ margin: '0 20px 12px', padding: '10px 14px', background: T().badgeBg, borderRadius: 10, border: `1px solid ${T().badgeBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T().accent, marginBottom: 6 }}>Slack Webhook URL</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={webhookEdit.url} onChange={e => setWebhookEdit(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://hooks.slack.com/services/..."
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: `1px solid ${T().border}`, background: T().inputBg, color: T().inputText, fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
                  <button onClick={() => handleSaveWebhook(dept.id, webhookEdit.url)}
                    style={{ padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: T().accentSolid, border: 'none', color: '#fff' }}>保存</button>
                  <button onClick={() => setWebhookEdit(null)}
                    style={{ padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, background: 'transparent', border: `1px solid ${T().border}`, color: T().textMuted }}>取消</button>
                </div>
                <div style={{ fontSize: 10, color: T().textFaint, marginTop: 4 }}>未設定の場合、親部署またはデフォルトのWebhookに送信されます</div>
              </div>
            )}
            {dept.teams.length === 0 ? (
              <div style={{ padding: '20px', fontSize: 12, color: T().textFaintest, fontStyle: 'italic', background: T().bgCard }}> チームがありません（OKRページの「組織を管理」から追加）</div>
            ) : (
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 12, background: T().bgCard }}>
                {dept.teams.map(team => {
                  const meta = teamMeta[team.id] || {}
                  const sb = getStatusBadge(meta.status || 'active')
                  const teamMembers = getMembersForLevel(team.id)
                  const isEditing = editingMeta === team.id

                  return (
                    <div key={team.id} style={{ background: T().bgCard2, border: `1px solid ${color}55`, borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T().text, flex: 1, lineHeight: 1.4 }}>{team.icon} {team.name}</span>
                        {isEditing ? (
                          <select value={metaBuf.status} onChange={e => setMetaBuf(p => ({ ...p, status: e.target.value }))}
                            style={{ background: T().selectBg, border: `1px solid ${T().borderMid}`, borderRadius: 5, padding: '2px 6px', color: T().text, fontSize: 10, outline: 'none', fontFamily: 'inherit' }}>
                            {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0, background: sb.bg, color: sb.color, border: `1px solid ${sb.border}` }}>{sb.label}</span>
                        )}
                      </div>

                      {isEditing ? (
                        <div style={{ marginBottom: 10 }}>
                          <input value={metaBuf.desc_text} onChange={e => setMetaBuf(p => ({ ...p, desc_text: e.target.value }))}
                            placeholder="チームの説明"
                            style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '5px 8px', color: T().inputText, fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button onClick={() => saveTeamMeta(team.id)} disabled={saving}
                              style={{ padding: '3px 10px', borderRadius: 5, background: T().accentSolid, border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓ 保存</button>
                            <button onClick={() => setEditingMeta(null)}
                              style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ) : (
                        meta.desc_text && <p style={{ fontSize: 11, color: T().textFaint, margin: '0 0 10px', lineHeight: 1.5 }}>{meta.desc_text}</p>
                      )}

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {teamMembers.map(m => (
                          <div key={m.id} onClick={() => onMemberClick(m.name)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: `${avatarColor(m.name)}18`, border: `1px solid ${avatarColor(m.name)}40`, fontSize: 11, fontWeight: 600, color: avatarColor(m.name), cursor: 'pointer', transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = `${avatarColor(m.name)}30`}
                            onMouseLeave={e => e.currentTarget.style.background = `${avatarColor(m.name)}18`}
                          >
                            <Avatar name={m.name} size={18} avatar_url={m.avatar_url} />
                            {m.name}
                          </div>
                        ))}
                        {teamMembers.length === 0 && <span style={{ fontSize: 10, color: T().textFaintest, fontStyle: 'italic' }}>メンバーなし</span>}
                      </div>

                      {isAdmin && !isEditing && (
                        <button onClick={() => { setMetaBuf({ status: meta.status || 'active', desc_text: meta.desc_text || '' }); setEditingMeta(team.id) }}
                          style={{ marginTop: 8, fontSize: 10, color: T().accent, background: 'transparent', border: `1px dashed ${T().badgeBorder}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✎ チーム情報を編集
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ2: 業務一覧（管理者は編集・並び替え可）
// ══════════════════════════════════════════════════
function TaskList({ tasks, setTasks, members, onMemberClick, isAdmin, taskHistory, setTaskHistory, currentUser, levels, orgTableError }) {
  const [filterDept, setFilterDept] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [historyTask, setHistoryTask] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editBuf, setEditBuf] = useState({})
  const [addingTeam, setAddingTeam] = useState(null)
  const [newBuf, setNewBuf] = useState({ task: '', owner: '', support: '' })
  const [saving, setSaving] = useState(false)
  // ドラッグ状態
  const dragId = useRef(null)
  const dragOverId = useRef(null)

  const memberNames = members.map(m => m.name)

  // levels階層を構築: { deptName: { teamName: levelId, ... }, ... }
  const levelHierarchy = useMemo(() => {
    if (!levels || levels.length === 0) return null
    const roots = levels.filter(l => !l.parent_id)
    const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))
    const result = {}
    roots.forEach(root => {
      getChildren(root.id).forEach(dept => {
        result[dept.name] = {}
        const teams = getChildren(dept.id)
        if (teams.length === 0) {
          result[dept.name][dept.name] = dept.id
        } else {
          teams.forEach(team => { result[dept.name][team.name] = team.id })
        }
      })
    })
    return result
  }, [levels])

  // タスクをlevels階層にマッチする関数
  const matchTask = useCallback((t) => {
    if (!levelHierarchy) return { dept: t.dept, team: t.team }
    // level_idがあれば直接マッチ
    if (t.level_id) {
      for (const [deptName, teams] of Object.entries(levelHierarchy)) {
        for (const [teamName, levelId] of Object.entries(teams)) {
          if (Number(t.level_id) === Number(levelId)) return { dept: deptName, team: teamName }
        }
      }
    }
    // チーム名でマッチ（完全一致 → 部分一致）
    for (const [deptName, teams] of Object.entries(levelHierarchy)) {
      for (const teamName of Object.keys(teams)) {
        if (t.team === teamName) return { dept: deptName, team: teamName }
      }
    }
    for (const [deptName, teams] of Object.entries(levelHierarchy)) {
      for (const teamName of Object.keys(teams)) {
        if (t.team && teamName && (t.team.includes(teamName) || teamName.includes(t.team)))
          return { dept: deptName, team: teamName }
      }
    }
    // 部署名でマッチ
    for (const [deptName, teams] of Object.entries(levelHierarchy)) {
      if (t.dept === deptName || (t.dept && (t.dept.includes(deptName) || deptName.includes(t.dept)))) {
        const firstTeam = Object.keys(teams)[0]
        if (firstTeam) return { dept: deptName, team: firstTeam }
      }
    }
    return { dept: t.dept, team: t.team }
  }, [levelHierarchy])

  const allDepts = levelHierarchy
    ? Object.keys(levelHierarchy)
    : [...new Set(tasks.map(t => t.dept))]
  const allOwners = [...new Set(tasks.map(t => t.owner).filter(o => o && o !== '（未定）'))]

  // sort_orderでソート（なければidでソート）
  const sortedTasks = [...tasks].sort((a, b) =>
    (a.sort_order ?? a.id) - (b.sort_order ?? b.id)
  )
  // アーカイブ済みを分離
  const activeTasks = sortedTasks.filter(t => !t.is_archived)
  const archivedTasks = sortedTasks.filter(t => t.is_archived)
  const baseFiltered = (showArchived ? archivedTasks : activeTasks)
  const filtered = baseFiltered.filter(t => {
    const m = matchTask(t)
    return (!filterDept || m.dept === filterDept) &&
      (!filterOwner || t.owner === filterOwner || (t.support && t.support.includes(filterOwner))) &&
      (!query || t.task.includes(query) || m.team.includes(query))
  })

  // levels階層ベースでグループ化
  const grouped = {}
  if (levelHierarchy && !filterOwner && !query) {
    // 先にlevels構造で空のグループを作成
    Object.entries(levelHierarchy).forEach(([deptName, teams]) => {
      if (filterDept && deptName !== filterDept) return
      grouped[deptName] = {}
      Object.keys(teams).forEach(teamName => { grouped[deptName][teamName] = [] })
    })
  }
  // タスクをマッチしたグループに配置
  filtered.forEach(t => {
    const m = matchTask(t)
    if (!grouped[m.dept]) grouped[m.dept] = {}
    if (!grouped[m.dept][m.team]) grouped[m.dept][m.team] = []
    grouped[m.dept][m.team].push(t)
  })

  const saveEdit = async (t) => {
    setSaving(true)
    const updated = { ...t, ...editBuf }
    const { error: upsertError } = await supabase.from('org_tasks').upsert(updated)
    if (upsertError) {
      alert('業務の保存に失敗しました: ' + upsertError.message)
      setSaving(false)
      return
    }
    // ownerが変わった場合は引き継ぎ履歴を記録
    const prevOwner = t.owner || null
    const nextOwner = updated.owner || null
    if (prevOwner !== nextOwner) {
      const histRow = {
        task_id: t.id,
        from_owner: prevOwner,
        to_owner: nextOwner,
        changed_by: currentUser || null,
        note: '',
      }
      const { data: hist } = await supabase.from('org_task_history').insert(histRow).select().single()
      if (hist) setTaskHistory(prev => [...prev, hist])
    }
    setTasks(prev => prev.map(x => x.id === t.id ? updated : x))
    setSaving(false); setEditingId(null)
  }
  const deleteTask = async (t) => {
    if (!window.confirm(`「${t.task}」を削除しますか？`)) return
    const { error } = await supabase.from('org_tasks').delete().eq('id', t.id)
    if (error) {
      alert('業務の削除に失敗しました: ' + error.message)
      return
    }
    setTasks(prev => prev.filter(x => x.id !== t.id))
  }
  const addTask = async (dept, team) => {
    if (saving || !newBuf.task.trim()) return
    setSaving(true)
    const matchedTasks = tasks.filter(t => { const m = matchTask(t); return m.dept === dept && m.team === team })
    const maxOrder = Math.max(0, ...matchedTasks.map(t => t.sort_order ?? t.id))
    const levelId = levelHierarchy?.[dept]?.[team] || null
    const row = { dept, team, ...newBuf, sort_order: maxOrder + 1, is_archived: false, ...(levelId ? { level_id: levelId } : {}) }
    const { data, error } = await supabase.from('org_tasks').insert(row).select().single()
    if (error) {
      const hint = (error.code === '42P01' || error.message?.includes('relation') || error.code === 'PGRST204')
        ? '\n\norg_tasks テーブルが未作成の可能性があります。supabase_setup.sql を Supabase SQL Editor で実行してください。'
        : (error.code === '42703' || error.message?.includes('column'))
        ? '\n\nカラムが不足している可能性があります。supabase_setup.sql の ALTER TABLE 文を実行してください。'
        : ''
      alert('業務の追加に失敗しました: ' + error.message + hint)
      setSaving(false)
      return
    }
    setTasks(prev => prev.some(t => t.id === data.id) ? prev : [...prev, data])
    setNewBuf({ task: '', owner: '', support: '' }); setAddingTeam(null)
    setSaving(false)
  }

  // ドラッグ&ドロップで並び替え（同一チーム内のみ）
  const handleDragStart = (e, taskId) => {
    dragId.current = taskId
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.style.opacity = '0.5'
  }
  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1'
    dragId.current = null
    dragOverId.current = null
  }
  const handleDragOver = (e, taskId) => {
    e.preventDefault()
    dragOverId.current = taskId
  }
  const handleDrop = async (e, dept, team) => {
    e.preventDefault()
    const fromId = dragId.current
    const toId = dragOverId.current
    if (!fromId || !toId || fromId === toId) return

    // 同チーム内のタスクだけ対象
    const teamTasks = sortedTasks.filter(t => { const m = matchTask(t); return m.dept === dept && m.team === team })
    const fromIdx = teamTasks.findIndex(t => t.id === fromId)
    const toIdx = teamTasks.findIndex(t => t.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    // 並び替え
    const reordered = [...teamTasks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    // sort_orderを再割り当て
    const updates = reordered.map((t, i) => ({ ...t, sort_order: i + 1 }))
    const matchedIds = new Set(teamTasks.map(t => t.id))
    setTasks(prev => {
      const others = prev.filter(t => !matchedIds.has(t.id))
      return [...others, ...updates].sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id))
    })

    // DB更新（バッチ）
    await Promise.all(updates.map(t =>
      supabase.from('org_tasks').update({ sort_order: t.sort_order }).eq('id', t.id)
    ))
    dragId.current = null
    dragOverId.current = null
  }

  const archiveTask = async (t) => {
    await supabase.from('org_tasks').update({ is_archived: true }).eq('id', t.id)
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_archived: true } : x))
  }
  const restoreTask = async (t) => {
    await supabase.from('org_tasks').update({ is_archived: false }).eq('id', t.id)
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_archived: false } : x))
  }

  const sel = { background: T().selectBg, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: T().text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }

  if (orgTableError) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#c0392b', background: '#fdf0ef', border: '1px dashed #e74c3c', borderRadius: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>org_tasks テーブルの読み込みに失敗しました</div>
        <div style={{ fontSize: 13, marginTop: 8, color: '#7f3b3b', lineHeight: 1.6 }}>
          Supabase SQL Editor で <code>supabase_setup.sql</code> を実行してテーブルを作成してください。<br />
          既存テーブルにカラムが不足している場合は ALTER TABLE 文のみ実行してください。
        </div>
      </div>
    )
  }
  if (tasks.length === 0 && (!levelHierarchy || Object.keys(levelHierarchy).length === 0)) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: T().textFaintest, border: `1px dashed ${T().border}`, borderRadius: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15 }}>業務データがありません</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>組織図タブでチームを追加するか、org_tasks テーブルにデータを追加してください</div>
      </div>
    )
  }

  return (
    <div>
      {/* フィルター */}
      <div style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T().textFaint }}>フィルター</span>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={sel}>
          <option value="">事業部：すべて</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={sel}>
          <option value="">担当者：すべて</option>
          {allOwners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 業務・チームで検索..."
          style={{ ...sel, width: 200 }}
          onFocus={e => e.target.style.borderColor = T().accent}
          onBlur={e => e.target.style.borderColor = T().border}
        />
        <span style={{ fontSize: 11, color: T().textFaint, marginLeft: 'auto' }}>{filtered.length}件</span>
        <button onClick={() => setShowArchived(p => !p)}
          style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${showArchived ? T().warn : T().border}`, background: showArchived ? T().warnBg : 'transparent', color: showArchived ? T().warn : T().textMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          {showArchived ? '📦 アーカイブ表示中' : `📦 アーカイブ (${archivedTasks.length})`}
        </button>
        {isAdmin && !showArchived && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: T().warnBg, color: T().warn, border: `1px solid ${T().warn}`, fontWeight: 700 }}>
            👑 管理者モード　⠿ドラッグで並び替え可
          </span>
        )}
        {showArchived && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: T().warnBg, color: T().warn, border: `1px solid ${T().warn}`, fontWeight: 700 }}>
            📦 アーカイブ済みのみ表示
          </span>
        )}
        {(filterDept || filterOwner || query) && <button onClick={() => { setFilterDept(''); setFilterOwner(''); setQuery('') }} style={{ ...sel, color: T().accent, border: `1px solid ${T().badgeBorder}` }}>クリア</button>}
      </div>

      {Object.entries(grouped).map(([dept, teams]) => {
        const color = getDeptColor(dept)
        return (
          <div key={dept} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 14px', background: `${color}12`, border: `1px solid ${color}55`, borderRadius: 8, borderLeft: `4px solid ${color}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{dept}</span>
            </div>
            {Object.entries(teams).map(([team, teamTasks]) => {
              const isAddingHere = addingTeam?.dept === dept && addingTeam?.team === team
              return (
                <div key={team} style={{ marginBottom: 16, marginLeft: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T().textMuted, marginBottom: 8 }}>└ {team}</div>
                  <div style={{ border: `1px solid ${T().border}`, borderRadius: 8, background: T().bgCard, position: 'relative' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, dept, team)}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: T().bgTable }}>
                          {isAdmin && <th style={{ width: 24, borderBottom: `1px solid ${T().border}` }} />}
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, width: 110, borderBottom: `1px solid ${T().border}` }}>責任者</th>
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, borderBottom: `1px solid ${T().border}` }}>業務内容</th>
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, width: 120, borderBottom: `1px solid ${T().border}` }}>担当（サポート）</th>
                          {isAdmin && <th style={{ width: 80, borderBottom: `1px solid ${T().border}` }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {teamTasks.map((t, i) => {
                          const isEditing = editingId === t.id
                          const ownerColor = avatarColor(t.owner)
                          return (
                            <tr key={t.id}
                              draggable={isAdmin && !isEditing && !showArchived}
                              onDragStart={isAdmin && !showArchived ? e => handleDragStart(e, t.id) : undefined}
                              onDragEnd={isAdmin && !showArchived ? handleDragEnd : undefined}
                              onDragOver={isAdmin && !showArchived ? e => handleDragOver(e, t.id) : undefined}
                              style={{
                                borderBottom: i < teamTasks.length - 1 ? `1px solid ${T().border}` : 'none',
                                background: isEditing ? T().bgHover : showArchived ? T().bgHover : 'transparent',
                                cursor: isAdmin && !isEditing && !showArchived ? 'grab' : 'default',
                                transition: 'background 0.1s',
                                opacity: showArchived ? 0.75 : 1,
                              }}>
                              {/* ドラッグハンドル */}
                              {isAdmin && (
                                <td style={{ padding: '0 4px 0 8px', color: T().textFaintest, fontSize: 14, userSelect: 'none', cursor: 'grab' }}>
                                  ⠿
                                </td>
                              )}
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? (
                                  <select value={editBuf.owner ?? t.owner} onChange={e => setEditBuf(b => ({ ...b, owner: e.target.value }))}
                                    style={{ width: '100%', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '4px 6px', color: T().inputText, fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">（未定）</option>
                                    {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                ) : t.owner && t.owner !== '（未定）' ? (
                                  <span onClick={() => onMemberClick(t.owner)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: `${ownerColor}18`, color: ownerColor, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    <Avatar name={t.owner} size={16} />{t.owner}
                                  </span>
                                ) : <span style={{ fontSize: 11, color: T().textFaintest }}>{t.owner || '（未定）'}</span>}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? <InlineInput value={editBuf.task ?? t.task} onChange={v => setEditBuf(b => ({ ...b, task: v }))} /> : <span style={{ fontSize: 12, color: T().textSub, lineHeight: 1.5 }}>{t.task}</span>}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? (
                                  <SupportSelect
                                    value={editBuf.support ?? t.support ?? ''}
                                    onChange={v => setEditBuf(b => ({ ...b, support: v }))}
                                    memberNames={memberNames.filter(n => n !== (editBuf.owner ?? t.owner))}
                                  />
                                ) : t.support ? (
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {t.support.split('・').filter(Boolean).map(n => (
                                      <span key={n} style={{ fontSize: 11, color: T().textFaint, padding: '2px 7px', background: T().bgInput, borderRadius: 5 }}>{n}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </td>
                              {isAdmin && (
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => saveEdit(t)} style={{ padding: '3px 10px', borderRadius: 5, background: T().accentSolid, border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                                      <button onClick={() => setEditingId(null)} style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
                                    </div>
                                  ) : showArchived ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => restoreTask(t)} style={{ padding: '3px 10px', borderRadius: 5, background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, fontSize: 10, fontWeight: 700, cursor: 'pointer' }} title="業務一覧に戻す">↩ 復元</button>
                                      <button onClick={() => deleteTask(t)} style={{ padding: '3px 8px', borderRadius: 5, background: T().warnBg, border: `1px solid ${T().warn}`, color: T().warn, fontSize: 10, cursor: 'pointer' }} title="完全削除">✕</button>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      {taskHistory.filter(h => h.task_id === t.id).length > 0 && (
                                        <button onClick={() => setHistoryTask(t)} style={{ padding: '3px 8px', borderRadius: 5, background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }} title="引き継ぎ履歴">
                                          🔄 {taskHistory.filter(h => h.task_id === t.id).length}
                                        </button>
                                      )}
                                      <button onClick={() => { setEditingId(t.id); setEditBuf({ owner: t.owner || '', task: t.task || '', support: t.support || '' }) }} style={{ padding: '3px 8px', borderRadius: 5, background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, fontSize: 10, cursor: 'pointer' }} title="編集">✎</button>
                                      <button onClick={() => archiveTask(t)} style={{ padding: '3px 8px', borderRadius: 5, background: T().warnBg, border: `1px solid ${T().warn}`, color: T().warn, fontSize: 10, cursor: 'pointer' }} title="アーカイブ">📦</button>
                                      <button onClick={() => deleteTask(t)} style={{ padding: '3px 8px', borderRadius: 5, background: T().warnBg, border: `1px solid ${T().warn}`, color: T().warn, fontSize: 10, cursor: 'pointer' }} title="完全削除">✕</button>
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        {isAdmin && isAddingHere && (
                          <tr style={{ background: T().bgHover, borderTop: `1px dashed ${T().badgeBorder}` }}>
                            {isAdmin && <td />}
                            <td style={{ padding: '8px 12px' }}>
                              <select value={newBuf.owner} onChange={e => setNewBuf(b => ({ ...b, owner: e.target.value }))}
                                style={{ width: '100%', background: T().inputBg, border: `1px solid ${T().badgeBorder}`, borderRadius: 5, padding: '4px 6px', color: T().inputText, fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                                <option value="">（未定）</option>
                                {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px' }}><InlineInput value={newBuf.task} onChange={v => setNewBuf(b => ({ ...b, task: v }))} placeholder="業務内容" style={{ borderColor: T().badgeBorder }} /></td>
                            <td style={{ padding: '8px 12px' }}>
                              <SupportSelect
                                value={newBuf.support}
                                onChange={v => setNewBuf(b => ({ ...b, support: v }))}
                                memberNames={memberNames.filter(n => n !== newBuf.owner)}
                                borderColor={T().badgeBorder}
                              />
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => addTask(dept, team)} disabled={saving} style={{ padding: '3px 10px', borderRadius: 5, background: T().accentSolid, border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '追加中...' : '追加'}</button>
                                <button onClick={() => { setAddingTeam(null); setNewBuf({ task: '', owner: '', support: '' }) }} style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {isAdmin && !isAddingHere && !showArchived && (
                      <div onClick={() => { setAddingTeam({ dept, team }); setNewBuf({ task: '', owner: '', support: '' }) }}
                        style={{ padding: '8px 12px', fontSize: 11, color: T().accent, cursor: 'pointer', background: T().bgHover, borderTop: `1px dashed ${T().badgeBorder}`, display: 'flex', alignItems: 'center', gap: 5 }}>
                        ＋ 業務を追加
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      {historyTask && (
        <TaskHistoryModal task={historyTask} history={taskHistory} onClose={() => setHistoryTask(null)} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ3: メンバーJD（追加・削除・兼務設定付き）
// ══════════════════════════════════════════════════
function MemberJDTab({ members, setMembers, levels, tasks, taskHistory, jdRows, setJdRows, isAdmin, initialName, onClearJump }) {
  const [selectedName, setSelectedName] = useState(initialName || null)
  const [verIdx, setVerIdx] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  const handleDragStart = (e, memberId) => {
    setDragId(memberId)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, memberId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (memberId !== dragOverId) setDragOverId(memberId)
  }
  const handleDrop = async (e, targetId) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const fromIdx = members.findIndex(m => m.id === dragId)
    const toIdx = members.findIndex(m => m.id === targetId)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return }
    const reordered = [...members]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setMembers(reordered.map((m, i) => ({ ...m, sort_order: i })))
    setDragId(null); setDragOverId(null)
    // sort_order をDBに保存（カラムが未追加でもクラッシュしない）
    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase.from('members').update({ sort_order: i }).eq('id', reordered[i].id)
      }
    } catch (e) { console.warn('sort_order save failed (column may not exist):', e) }
  }
  const handleDragEnd = () => { setDragId(null); setDragOverId(null) }

  useEffect(() => {
    if (initialName) { setSelectedName(initialName); setVerIdx(null) }
  }, [initialName])

  if (selectedName) {
    const memberRow = members.find(m => m.name === selectedName)
    const jdBase = JD_DEFAULT[selectedName] || { avatar_color: [avatarColor(selectedName), '#111828'], versions: [] }
    return (
      <MemberDetail
        memberRow={memberRow}
        jdBase={jdBase}
        jdRows={jdRows}
        setJdRows={setJdRows}
        verIdx={verIdx}
        setVerIdx={setVerIdx}
        onBack={() => { setSelectedName(null); setVerIdx(null); onClearJump && onClearJump() }}
        isAdmin={isAdmin}
        levels={levels}
        members={members}
        setMembers={setMembers}
        tasks={tasks}
        taskHistory={taskHistory}
      />
    )
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: T().accentSolid, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ＋ メンバーを追加
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {[...members].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.id - b.id).map(m => {
          const jdBase = JD_DEFAULT[m.name] || { avatar_color: [avatarColor(m.name), '#111828'], versions: [] }
          const [fg, bg] = jdBase.avatar_color
          // DBのjdRowsがあれば最新バージョンを表示、なければJD_DEFAULTの最終版
          const dbRows = jdRows[m.name] || []
          const latestDbRow = dbRows[dbRows.length - 1]
          const fallbackLv = jdBase.versions[jdBase.versions.length - 1]
          const lv = latestDbRow ? { role: latestDbRow.role, emp: latestDbRow.emp, working: latestDbRow.working } : fallbackLv
          const totalVersions = dbRows.length > 0 ? dbRows.length : jdBase.versions.length
          const empB = lv ? getEmpBadge(lv.emp) : EMP_BADGE['業務委託']
          const levelIds = Array.isArray(m.level_ids) ? m.level_ids.map(Number) : (m.level_id ? [Number(m.level_id)] : [])
          const teamNames = levelIds.map(id => levels.find(l => Number(l.id) === id)?.name).filter(Boolean)

          return (
            <div key={m.id} onClick={() => { setSelectedName(m.name); setVerIdx(null) }}
              draggable={isAdmin}
              onDragStart={e => handleDragStart(e, m.id)}
              onDragOver={e => handleDragOver(e, m.id)}
              onDrop={e => handleDrop(e, m.id)}
              onDragEnd={handleDragEnd}
              style={{
                background: T().bgCard,
                border: `1px solid ${dragOverId === m.id ? T().accentSolid : T().border}`,
                borderRadius: 12, padding: 18, cursor: isAdmin ? 'grab' : 'pointer', transition: 'all 0.2s',
                opacity: dragId === m.id ? 0.4 : 1,
              }}
              onMouseEnter={e => { if (!dragId) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = fg + '60' } }}
              onMouseLeave={e => { if (!dragId) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = T().border } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Avatar name={m.name} size={48} avatar_url={m.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T().text }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: T().textFaint, marginTop: 2 }}>{m.role || '—'}</div>
                </div>
                {totalVersions > 0 && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}`, fontWeight: 700, flexShrink: 0 }}>
                    v{totalVersions}
                  </span>
                )}
              </div>
              {lv?.role && <div style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: fg, color: '#fff', marginBottom: 10, lineHeight: 1.4 }}>{lv.role}</div>}
              {teamNames.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {teamNames.map(t => (
                    <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}` }}>{t}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {lv?.emp && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: empB.bg, color: empB.color }}>{lv.emp.split('→')[0]}</span>}
                {lv?.working && <span style={{ fontSize: 10, color: T().textFaint }}>{lv.working}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {showAddModal && (
        <AddMemberModal levels={levels} onClose={() => setShowAddModal(false)}
          onAdded={newM => { setMembers(prev => prev.some(m => m.id === newM.id) ? prev : [...prev, newM]); setShowAddModal(false) }} />
      )}
    </div>
  )
}


// ── 引き継ぎ履歴モーダル ─────────────────────────────────────────────────────
function TaskHistoryModal({ task, history, onClose }) {
  const records = history
    .filter(h => h.task_id === task.id)
    .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))

  const fmt = (dateStr) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: T().bgCard, border: `1px solid ${T().borderMid}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, color: T().text }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>引き継ぎ履歴</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T().text, lineHeight: 1.4 }}>{task.task}</div>
          </div>
          <button onClick={onClose} style={{ background: T().bgInput, border: 'none', color: T().textMuted, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 15, flexShrink: 0, marginLeft: 12 }}>✕</button>
        </div>

        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: T().textFaintest, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            引き継ぎ履歴はまだありません
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: T().border, borderRadius: 1 }} />
            {records.map((r, i) => {
              const isFirst = i === 0
              const isLatest = i === records.length - 1
              return (
                <div key={r.id} style={{ position: 'relative', marginBottom: i < records.length - 1 ? 16 : 0 }}>
                  <div style={{ position: 'absolute', left: -20, top: 10, width: 10, height: 10, borderRadius: '50%', background: isLatest ? T().accent : T().borderMid, border: `2px solid ${isLatest ? T().accent : T().border}` }} />
                  <div style={{ background: T().bgCard2, border: `1px solid ${T().border}`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, color: T().textFaint, marginBottom: 6 }}>{fmt(r.changed_at)}{r.changed_by ? ` · ${r.changed_by}` : ''}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {r.from_owner ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, background: `${avatarColor(r.from_owner)}15`, color: avatarColor(r.from_owner), fontSize: 12, fontWeight: 600 }}>
                          <Avatar name={r.from_owner} size={16} />{r.from_owner}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: T().textFaintest, fontStyle: 'italic' }}>（未設定）</span>
                      )}
                      <span style={{ color: T().accent, fontSize: 14, fontWeight: 700 }}>→</span>
                      {r.to_owner ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, background: `${avatarColor(r.to_owner)}15`, color: avatarColor(r.to_owner), fontSize: 12, fontWeight: 600 }}>
                          <Avatar name={r.to_owner} size={16} />{r.to_owner}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: T().textFaintest, fontStyle: 'italic' }}>（未設定）</span>
                      )}
                    </div>
                    {r.note && <div style={{ fontSize: 11, color: T().textMuted, marginTop: 6, padding: '5px 8px', background: T().bgInput, borderRadius: 5 }}>{r.note}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── メンバー追加モーダル ──────────────────────────────────────────────────────
function AddMemberModal({ levels, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [email, setEmail] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = React.useRef(null)

  const roots = levels.filter(l => !l.parent_id)
  const getDepts = rootId => levels.filter(l => Number(l.parent_id) === Number(rootId))
  const getTeams = deptId => levels.filter(l => Number(l.parent_id) === Number(deptId))
  const toggleId = id => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください'); return }
    if (file.size > 2 * 1024 * 1024) { alert('2MB以下の画像を選択してください'); return }
    setUploading(true)
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: false })
    if (error) { alert('アップロードに失敗しました: ' + error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
    setAvatarUrl(urlData.publicUrl)
    setUploading(false)
  }

  const save = async () => {
    if (!name.trim()) { setError('名前は必須です'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('members').insert({
      name: name.trim(), role: roleTitle.trim() || null, email: email.trim() || null,
      level_id: selectedIds[0] || null, level_ids: selectedIds, avatar_url: avatarUrl || null,
    }).select().single()
    if (err) { setError('保存に失敗しました: ' + err.message); setSaving(false); return }
    // メールアドレスがある場合、Authアカウントも作成
    if (email.trim()) {
      try {
        await fetch('/api/admin-users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'createUser', email: email.trim() })
        })
      } catch (e) { console.warn('Auth account creation failed:', e) }
    }
    onAdded(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: T().bgCard, border: `1px solid ${T().borderMid}`, borderRadius: 16, padding: 26, width: '100%', maxWidth: 500, maxHeight: '88vh', overflowY: 'auto', color: T().text }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T().text }}>＋ メンバーを追加</h3>
          <button onClick={onClose} style={{ background: T().bgInput, border: 'none', color: T().textMuted, width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T().textMuted, marginBottom: 8 }}>プロフィール画像</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={name} size={48} avatar_url={avatarUrl} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${T().badgeBorder}`, background: T().badgeBg, color: T().accent, fontSize: 11, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {uploading ? '⏳ アップロード中...' : '📷 画像をアップロード'}
              </button>
              {avatarUrl && <button onClick={() => setAvatarUrl('')}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${T().warn}`, background: T().warnBg, color: T().warn, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                🗑 画像を削除
              </button>}
              <div style={{ fontSize: 10, color: T().textFaint }}>JPG / PNG / WebP・2MB以下</div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>

        {[
          { label: '名前 *', val: name, set: setName, ph: '例: 田中 花子' },
          { label: '役職・ロール', val: roleTitle, set: setRoleTitle, ph: '例: コミュニティマネージャー' },
          { label: 'メールアドレス', val: email, set: setEmail, ph: '例: tanaka@example.com' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 5 }}>{f.label}</div>
            <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
              style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().border}`, borderRadius: 8, padding: '9px 12px', color: T().inputText, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 8 }}>所属チーム（複数選択可・兼務対応）</div>
          {roots.map(root => (
            getDepts(root.id).map(dept => {
              const teams = getTeams(dept.id)
              if (teams.length === 0) return null
              const color = getDeptColor(dept.name)
              return (
                <div key={dept.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6 }}>{dept.icon} {dept.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 10 }}>
                    {teams.map(team => {
                      const isSel = selectedIds.includes(team.id)
                      return (
                        <div key={team.id} onClick={() => toggleId(team.id)}
                          style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: isSel ? 700 : 400, background: isSel ? T().badgeBg : T().bgInput, border: `1px solid ${isSel ? T().badgeBorder : T().border}`, color: isSel ? T().accent : T().textMuted, transition: 'all 0.15s' }}>
                          {isSel ? '✓ ' : ''}{team.icon} {team.name}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          ))}
        </div>

        {error && <div style={{ color: T().warn, fontSize: 12, marginBottom: 12, padding: '8px 12px', background: T().warnBg, borderRadius: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ background: !name.trim() ? T().badgeBg : T().accentSolid, border: 'none', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: !name.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? '追加中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── メンバー詳細（JD + 兼務設定 + 削除） ─────────────────────────────────────
function MemberDetail({ memberRow, jdBase, jdRows, setJdRows, verIdx, setVerIdx, onBack, isAdmin, levels, members, setMembers, tasks, taskHistory }) {
  const memberName = memberRow?.name || ''
  const [fg, bg] = jdBase.avatar_color || [avatarColor(memberName), '#111828']

  // ── バージョン管理 ────────────────────────────────
  // DBのjdRowsを正とする。空ならJD_DEFAULTをシード候補として使用
  const dbRows = jdRows[memberName] || []
  // 表示用バージョン配列: DBがあればDB優先、なければJD_DEFAULT
  const versions = dbRows.length > 0
    ? dbRows.map(row => ({
        period: row.period || '',
        role: row.role || '',
        emp: row.emp || '',
        working: row.working || '',
        role_desc: row.role_desc || '',
        responsibility: row.responsibility || '',
        meetings: row.meetings || '',
        tasks: row.tasks ? (typeof row.tasks === 'string' ? JSON.parse(row.tasks) : row.tasks) : [],
        _dbId: row.id,
        _vi: row.version_idx,
      }))
    : (jdBase.versions || [])

  const effectiveVerIdx = verIdx !== null ? Math.min(verIdx, Math.max(0, versions.length - 1)) : Math.max(0, versions.length - 1)
  const displayVer = versions[effectiveVerIdx] || {}
  const empB = getEmpBadge(displayVer.emp || '')

  const [editing, setEditing] = useState(false)
  const [editVer, setEditVer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingNewVersion, setAddingNewVersion] = useState(false)
  const [editingTeams, setEditingTeams] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileBuf, setProfileBuf] = useState({ name: '', role: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(memberRow?.avatar_url || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarFileRef = React.useRef(null)
  const [selectedIds, setSelectedIds] = useState(
    Array.isArray(memberRow?.level_ids) ? memberRow.level_ids.map(Number) : (memberRow?.level_id ? [Number(memberRow.level_id)] : [])
  )
  const [savingTeams, setSavingTeams] = useState(false)

  const EV = editing ? editVer : displayVer

  const roots = levels.filter(l => !l.parent_id)
  const getDepts = rootId => levels.filter(l => Number(l.parent_id) === Number(rootId))
  const getTeams = deptId => levels.filter(l => Number(l.parent_id) === Number(deptId))
  const toggleId = id => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  useEffect(() => { setAvatarUrl(memberRow?.avatar_url || '') }, [memberRow?.id])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください'); return }
    if (file.size > 2 * 1024 * 1024) { alert('2MB以下の画像を選択してください'); return }
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: false })
    if (error) { alert('アップロードに失敗しました: ' + error.message); setUploadingAvatar(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
    setAvatarUrl(urlData.publicUrl)
    setUploadingAvatar(false)
    // Save immediately
    await supabase.from('members').update({ avatar_url: urlData.publicUrl }).eq('id', memberRow.id)
    setMembers(prev => prev.map(m => m.id === memberRow.id ? { ...m, avatar_url: urlData.publicUrl } : m))
  }

  const saveTeams = async () => {
    setSavingTeams(true)
    await supabase.from('members').update({ level_id: selectedIds[0] || null, level_ids: selectedIds }).eq('id', memberRow.id)
    setMembers(prev => prev.map(m => m.id === memberRow.id ? { ...m, level_id: selectedIds[0] || null, level_ids: selectedIds } : m))
    setSavingTeams(false); setEditingTeams(false)
  }

  // JD新規作成（DBが空の場合）
  const startCreateJD = () => {
    // JD_DEFAULTがあればそれをシードとして使う
    const seed = jdBase.versions?.[0] || {}
    setEditVer({ period: seed.period || '', role: seed.role || '', emp: seed.emp || '業務委託', working: seed.working || '', role_desc: seed.role_desc || '', responsibility: seed.responsibility || '', meetings: seed.meetings || '', tasks: JSON.parse(JSON.stringify(seed.tasks || [])) })
    setAddingNewVersion(false)
    setEditing(true)
  }

  // 新バージョン追加（最新バージョンをベースにコピー）
  const startAddVersion = () => {
    const latest = versions[versions.length - 1] || {}
    setEditVer({
      period: '',
      role: latest.role || '',
      emp: latest.emp || '業務委託',
      working: latest.working || '',
      role_desc: latest.role_desc || '',
      responsibility: latest.responsibility || '',
      meetings: latest.meetings || '',
      tasks: JSON.parse(JSON.stringify((latest.tasks || []).map(t => ({ ...t, status: 'same' })))),
    })
    setAddingNewVersion(true)
    setEditing(true)
  }

  // 既存バージョン編集
  const startEdit = () => {
    setEditVer({ ...displayVer, tasks: JSON.parse(JSON.stringify(displayVer.tasks || [])) })
    setAddingNewVersion(false)
    setEditing(true)
  }

  // 保存: 新バージョン or 既存バージョン更新
  const saveEdit = async () => {
    setSaving(true)
    const vi = addingNewVersion ? versions.length : effectiveVerIdx
    const payload = {
      member_id: memberName, version_idx: vi,
      period: editVer.period || '',
      role: editVer.role || '', emp: editVer.emp || '', working: editVer.working || '',
      role_desc: editVer.role_desc || '', responsibility: editVer.responsibility || '',
      meetings: editVer.meetings || '', tasks: JSON.stringify(editVer.tasks || []),
    }
    const { data } = await supabase.from('org_member_jd').upsert(payload, { onConflict: 'member_id,version_idx' }).select().single()
    // jdRowsを更新
    setJdRows(prev => {
      const existing = [...(prev[memberName] || [])]
      const idx = existing.findIndex(r => r.version_idx === vi)
      const newRow = data || { ...payload, id: Date.now() }
      if (idx >= 0) existing[idx] = newRow
      else existing.push(newRow)
      existing.sort((a, b) => a.version_idx - b.version_idx)
      return { ...prev, [memberName]: existing }
    })
    if (addingNewVersion) setVerIdx(vi)
    setSaved(true); setTimeout(() => setSaved(false), 1500); setSaving(false); setEditing(false); setAddingNewVersion(false)
  }

  // バージョン削除
  const deleteVersion = async (vi) => {
    if (!window.confirm(`V${vi + 1}を削除しますか？`)) return
    await supabase.from('org_member_jd').delete().eq('member_id', memberName).eq('version_idx', vi)
    setJdRows(prev => {
      const remaining = (prev[memberName] || []).filter(r => r.version_idx !== vi)
      // version_idxを詰め直す
      const reindexed = remaining.map((r, i) => ({ ...r, version_idx: i }))
      // DBのversion_idxも更新
      reindexed.forEach(async (r, i) => {
        if (r.version_idx !== remaining[i]?.version_idx) {
          await supabase.from('org_member_jd').update({ version_idx: i }).eq('member_id', memberName).eq('id', r.id)
        }
      })
      return { ...prev, [memberName]: reindexed }
    })
    setVerIdx(Math.max(0, vi - 1))
  }

  const startEditProfile = () => {
    setProfileBuf({ name: memberRow?.name || '', role: memberRow?.role || '', email: memberRow?.email || '' })
    setEditingProfile(true)
  }
  const saveProfile = async () => {
    if (!profileBuf.name.trim()) return
    setSavingProfile(true)
    const newEmail = profileBuf.email.trim() || null
    const oldEmail = memberRow?.email || null
    await supabase.from('members').update({ name: profileBuf.name.trim(), role: profileBuf.role.trim(), email: newEmail, avatar_url: avatarUrl }).eq('id', memberRow.id)
    setMembers(prev => prev.map(m => m.id === memberRow.id ? { ...m, name: profileBuf.name.trim(), role: profileBuf.role.trim(), email: newEmail, avatar_url: avatarUrl } : m))
    // 新しいメールアドレスが追加された場合、Authアカウントを作成
    if (newEmail && newEmail !== oldEmail) {
      try {
        await fetch('/api/admin-users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'createUser', email: newEmail })
        })
      } catch (e) { console.warn('Auth account creation failed:', e) }
    }
    setSavingProfile(false)
    setEditingProfile(false)
  }

  const deleteSelectedJD = async () => {
    const ver = versions[effectiveVerIdx]
    if (!ver?._dbId) return
    const label = `V${effectiveVerIdx + 1}${ver.period ? ': ' + ver.period : ''}`
    if (!window.confirm(`「${memberName}」の ${label} を削除しますか？`)) return
    await supabase.from('org_member_jd').delete().eq('id', ver._dbId)
    setJdRows(prev => ({
      ...prev,
      [memberName]: (prev[memberName] || []).filter(r => r.id !== ver._dbId)
    }))
    setVerIdx(Math.max(0, effectiveVerIdx - 1))
    setEditing(false)
  }

  const deleteMember = async () => {
    if (!window.confirm(`「${memberName}」を削除しますか？`)) return
    await supabase.from('org_member_jd').delete().eq('member_id', memberName)
    await supabase.from('members').delete().eq('id', memberRow.id)
    setMembers(prev => prev.filter(m => m.id !== memberRow.id)); onBack()
  }
  const updateTask = (i, f, v) => setEditVer(p => { const t = [...p.tasks]; t[i] = { ...t[i], [f]: v }; return { ...p, tasks: t } })
  const addTask = () => setEditVer(p => ({ ...p, tasks: [...p.tasks, { cat: '', task: '', status: 'new' }] }))
  const removeTask = i => setEditVer(p => ({ ...p, tasks: p.tasks.filter((_, idx) => idx !== i) }))

  // ── JD PDF出力 ──────────────────────────────────
  const exportPDF = () => {
    const ver = versions[effectiveVerIdx]
    if (!ver) return
    const name = memberRow?.name || '（名前なし）'
    const role = memberRow?.role || ''
    const tasksList = (ver.tasks || []).filter(t => t.status !== 'del')
    // org_tasksからこのメンバーの担当業務を取得
    const ownerTasks = (tasks || []).filter(t => t.owner === name)
    const supportTasks = (tasks || []).filter(t => t.support && t.support.includes(name) && t.owner !== name)

    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>${name} - Job Description</title>
<style>
@page { size: A4; margin: 20mm 18mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color: #1a1a2e; font-size: 11px; line-height: 1.7; }
.header { background: ${fg}; color: #fff; padding: 24px 28px; border-radius: 10px; margin-bottom: 18px; }
.header .name { font-size: 24px; font-weight: 800; letter-spacing: 2px; }
.header .sub { font-size: 11px; opacity: 0.85; margin-top: 4px; }
.badges { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.badge { font-size: 10px; padding: 3px 10px; border-radius: 5px; background: rgba(255,255,255,0.2); font-weight: 700; }
.section { margin-bottom: 14px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 16px; }
.section-title { font-size: 10px; font-weight: 700; color: #666; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.item { font-size: 11px; color: #333; line-height: 1.8; }
.item li { list-style: none; padding-left: 12px; position: relative; }
.item li::before { content: "•"; position: absolute; left: 0; color: ${fg}; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background: #f5f5f5; text-align: left; padding: 6px 10px; font-size: 10px; color: #666; border-bottom: 1px solid #ddd; }
td { padding: 7px 10px; border-bottom: 1px solid #eee; color: #333; }
.footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; }
.ver-info { font-size: 10px; color: rgba(255,255,255,0.7); margin-top: 6px; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <div class="name">${name}</div>
  <div class="sub">${role}</div>
  <div class="badges">
    ${ver.role ? `<span class="badge">${ver.role}</span>` : ''}
    ${ver.emp ? `<span class="badge">${ver.emp}</span>` : ''}
    ${ver.working ? `<span class="badge">${ver.working}</span>` : ''}
  </div>
  <div class="ver-info">V${effectiveVerIdx + 1}: ${ver.period || '—'}</div>
</div>

<div class="two-col">
  <div class="section">
    <div class="section-title">▶ 役割</div>
    <div class="item"><ul>${(ver.role_desc || '—').split('\\n').filter(Boolean).map(l => `<li>${l}</li>`).join('')}</ul></div>
  </div>
  <div class="section">
    <div class="section-title">▶ 責任範囲</div>
    <div class="item"><ul>${(ver.responsibility || '—').split('\\n').filter(Boolean).map(l => `<li>${l}</li>`).join('')}</ul></div>
  </div>
</div>

<div class="section">
  <div class="section-title">▶ 主要定例</div>
  <div class="item">${(ver.meetings || '—').split('\\n').filter(Boolean).map(l => `<div>${l}</div>`).join('')}</div>
</div>

${ownerTasks.length > 0 ? `
<div class="section">
  <div class="section-title">▶ 担当業務一覧（${ownerTasks.length}件）</div>
  <table>
    <thead><tr><th>チーム</th><th>業務内容</th><th>サポート</th></tr></thead>
    <tbody>${ownerTasks.map(t => `<tr><td>${t.team || t.dept || '—'}</td><td>${t.task || ''}</td><td>${t.support || '—'}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

${supportTasks.length > 0 ? `
<div class="section">
  <div class="section-title">▶ サポート業務（${supportTasks.length}件）</div>
  <table>
    <thead><tr><th>チーム</th><th>業務内容</th><th>責任者</th></tr></thead>
    <tbody>${supportTasks.map(t => `<tr><td>${t.team || t.dept || '—'}</td><td>${t.task || ''}</td><td>${t.owner || '—'}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

${tasksList.length > 0 ? `
<div class="section">
  <div class="section-title">▶ JD業務タスク（${tasksList.length}件）</div>
  <table>
    <thead><tr><th>カテゴリ</th><th>タスク</th><th>ステータス</th></tr></thead>
    <tbody>${tasksList.map(t => `<tr><td>${t.cat || '—'}</td><td>${t.task || ''}</td><td>${t.status === 'new' ? '🆕 新規' : t.status === 'same' ? '継続' : t.status || '—'}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

${versions.length > 1 ? `
<div class="section">
  <div class="section-title">▶ 役職推移（${versions.length}バージョン）</div>
  <table>
    <thead><tr><th>Ver</th><th>期間</th><th>役職</th><th>雇用形態</th><th>稼働</th></tr></thead>
    <tbody>${versions.map((v, i) => `<tr style="${i === effectiveVerIdx ? 'background:#f0faf5;font-weight:700' : ''}"><td>V${i + 1}</td><td>${v.period || '—'}</td><td>${v.role || '—'}</td><td>${v.emp || '—'}</td><td>${v.working || '—'}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

<div class="footer">Job Description — ${name} — 出力日: ${new Date().toLocaleDateString('ja-JP')}</div>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) { alert('ポップアップがブロックされました。ブラウザの設定を確認してください。'); return }
    w.document.write(html)
    w.document.close()
    w.onload = () => { w.print() }
  }

  const box = { background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 10, padding: 16 }
  const ta = { width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 6, padding: '8px 10px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }

  return (
    <div>
      {/* 操作バー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: `1px solid ${T().border}`, background: T().bgInput, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().textMuted, fontFamily: 'inherit' }}
          onMouseEnter={e => { e.currentTarget.style.background = T().badgeBg; e.currentTarget.style.color = T().accent }}
          onMouseLeave={e => { e.currentTarget.style.background = T().bgInput; e.currentTarget.style.color = T().textMuted }}
        >← メンバー一覧に戻る</button>

        {isAdmin && !editing && versions.length === 0 && (
          <button onClick={startCreateJD} style={{ padding: '7px 16px', border: `1px solid ${T().badgeBorder}`, background: T().badgeBg, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().accent, fontFamily: 'inherit' }}>
            ＋ JDを作成する
          </button>
        )}
        {!editing && versions.length > 0 && (
          <button onClick={exportPDF} style={{ padding: '7px 16px', border: `1px solid ${T().badgeBorder}`, background: T().badgeBg, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().accent, fontFamily: 'inherit' }}>
            📄 PDF出力
          </button>
        )}
        {isAdmin && !editing && versions.length > 0 && (
          <>
            <button onClick={startEdit} style={{ padding: '7px 16px', border: `1px solid ${T().warn}`, background: T().warnBg, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().warn, fontFamily: 'inherit' }}>
              👑 このバージョンを編集
            </button>
            <button onClick={startAddVersion} style={{ padding: '7px 16px', border: `1px solid ${T().badgeBorder}`, background: T().badgeBg, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().accent, fontFamily: 'inherit' }}>
              ＋ 新バージョンを追加
            </button>
            {dbRows.length > 0 && (
              <button onClick={deleteSelectedJD} style={{ padding: '7px 16px', border: `1px solid ${T().warn}`, background: T().warnBg, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().warn, fontFamily: 'inherit' }}>
                🗑 このバージョンを削除
              </button>
            )}
          </>
        )}
        {isAdmin && editing && (
          <>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: addingNewVersion ? T().badgeBg : T().warnBg, color: addingNewVersion ? T().accent : T().warn, border: `1px solid ${addingNewVersion ? T().badgeBorder : T().warn}` }}>
              {addingNewVersion ? '＋ 新バージョン作成中' : `V${effectiveVerIdx + 1} 編集中`}
            </span>
            <SaveBtn saving={saving} saved={saved} onClick={saveEdit} label="保存する" />
            <button onClick={() => { setEditing(false); setAddingNewVersion(false) }} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${T().borderMid}`, background: 'transparent', color: T().textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          </>
        )}
        {isAdmin && memberRow && (
          <button onClick={deleteMember} style={{ marginLeft: 'auto', padding: '7px 14px', border: `1px solid ${T().warn}`, background: T().warnBg, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().warn, fontFamily: 'inherit' }}>
            🗑 メンバー削除
          </button>
        )}
      </div>

      {/* プロフィールヘッダー */}
      <div style={{ background: fg, borderRadius: 12, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        <Avatar name={memberRow?.name} size={64} avatar_url={avatarUrl} />
        <div style={{ flex: 1 }}>
          {editingProfile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              <input value={profileBuf.name} onChange={e => setProfileBuf(p => ({ ...p, name: e.target.value }))}
                placeholder="名前"
                style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, padding: '6px 12px', color: '#fff', fontSize: 20, fontWeight: 800, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
              <input value={profileBuf.role} onChange={e => setProfileBuf(p => ({ ...p, role: e.target.value }))}
                placeholder="役職・ポジション（例: コミュニティ事業部 マネージャー）"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
              <input value={profileBuf.email} onChange={e => setProfileBuf(p => ({ ...p, email: e.target.value }))}
                placeholder="メールアドレス（例: name@example.com）"
                type="email"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '5px 12px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveProfile} disabled={savingProfile || !profileBuf.name.trim()}
                  style={{ padding: '5px 16px', borderRadius: 6, background: 'rgba(255,255,255,0.9)', border: 'none', color: fg, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {savingProfile ? '保存中...' : '✓ 保存'}
                </button>
                <button onClick={() => setEditingProfile(false)}
                  style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>{memberRow?.name || '（名前なし）'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{memberRow?.role || '—'}</div>
                  {memberRow?.email && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>✉ {memberRow.email}</div>}
                </div>
                {isAdmin && !editingProfile && (
                  <>
                    <button onClick={startEditProfile}
                      style={{ marginTop: 4, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      ✎ 編集
                    </button>
                    <button onClick={() => avatarFileRef.current?.click()} disabled={uploadingAvatar}
                      style={{ marginTop: 4, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      {uploadingAvatar ? '⏳...' : '📷'}
                    </button>
                    <input ref={avatarFileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, width: '100%' }}>
                    {/* 期間（カレンダー選択） */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', minWidth: 32, paddingTop: 6 }}>期間</span>
                      <PeriodInput value={EV.period || ''} onChange={v => setEditVer(p => ({ ...p, period: v }))} />
                    </div>
                    {/* 役職 */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', minWidth: 32 }}>役職</span>
                      <input value={EV.role || ''} onChange={e => setEditVer(p => ({ ...p, role: e.target.value }))}
                        placeholder="例: コミュニティマネージャー"
                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 5, padding: '4px 10px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit', flex: 1, minWidth: 200 }} />
                    </div>
                    {/* 勤務形態・稼働量 */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', minWidth: 32 }}>形態</span>
                      <select value={EV.emp || '業務委託'} onChange={e => setEditVer(p => ({ ...p, emp: e.target.value }))}
                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, padding: '4px 10px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                        {EMP_OPTS.map(o => <option key={o} value={o} style={{ background: '#1a1d27', color: '#e8ecf0' }}>{o}</option>)}
                      </select>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>稼働</span>
                      <input value={EV.working || ''} onChange={e => setEditVer(p => ({ ...p, working: e.target.value }))}
                        placeholder="例: 週5 / フルタイム"
                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, padding: '4px 10px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: 140 }} />
                    </div>
                  </div>
                ) : (
                  <>
                    {EV.role && <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }}>{EV.role}</span>}
                    {EV.emp && <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: empB.bg, color: empB.color, fontWeight: 700 }}>{EV.emp}</span>}
                    {EV.working && <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>{EV.working}</span>}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {/* 兼務チーム設定 */}
      {isAdmin && memberRow && (
        <div style={{ ...box, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editingTeams ? 12 : 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textMuted, letterSpacing: '2px', textTransform: 'uppercase' }}>▶ 所属チーム（兼務設定）</div>
            {!editingTeams && <button onClick={() => setEditingTeams(true)} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${T().warn}`, background: T().warnBg, color: T().warn, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>👑 変更</button>}
          </div>
          {editingTeams ? (
            <div>
              {roots.map(root =>
                getDepts(root.id).map(dept => {
                  const teams = getTeams(dept.id)
                  if (teams.length === 0) return null
                  const color = getDeptColor(dept.name)
                  return (
                    <div key={dept.id} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 5 }}>{dept.icon} {dept.name}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 10 }}>
                        {teams.map(team => {
                          const isSel = selectedIds.includes(team.id)
                          return (
                            <div key={team.id} onClick={() => toggleId(team.id)}
                              style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: isSel ? 700 : 400, background: isSel ? T().badgeBg : T().bgInput, border: `1px solid ${isSel ? T().badgeBorder : T().border}`, color: isSel ? T().accent : T().textMuted, transition: 'all 0.15s' }}>
                              {isSel ? '✓ ' : ''}{team.icon} {team.name}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={saveTeams} disabled={savingTeams}
                  style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: T().accent, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {savingTeams ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setEditingTeams(false)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${T().borderMid}`, background: 'transparent', color: T().textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {selectedIds.length > 0 ? selectedIds.map(id => {
                const lv = levels.find(l => Number(l.id) === id)
                return lv ? <span key={id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}` }}>{lv.icon} {lv.name}</span> : null
              }) : <span style={{ fontSize: 11, color: T().textFaintest, fontStyle: 'italic' }}>チーム未設定</span>}
            </div>
          )}
        </div>
      )}

      {/* バージョンタブ */}
      {versions.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4, alignItems: 'flex-end' }}>
          {versions.map((v, i) => {
            const isA = i === effectiveVerIdx && !addingNewVersion
            const label = v.period || `V${i + 1}`
            return (
              <button key={i} onClick={() => { setVerIdx(i); setEditing(false); setAddingNewVersion(false) }}
                style={{ padding: '8px 16px', fontSize: 11, fontWeight: isA ? 700 : 500, color: isA ? '#fff' : T().textFaint, background: isA ? fg : T().bgCard2, border: `1px solid ${isA ? fg : T().border}`, borderRadius: '6px 6px 0 0', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                V{i + 1}: {label}
              </button>
            )
          })}
          {isAdmin && addingNewVersion && (
            <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, color: T().accent, background: T().badgeBg, border: `1px solid ${T().accent}`, borderRadius: '6px 6px 0 0', whiteSpace: 'nowrap' }}>
              ✎ 新バージョン作成中
            </div>
          )}
        </div>
      )}

      {versions.length === 0 && !editing && (
        <div style={{ ...box, marginBottom: 16, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14, color: T().textMuted, marginBottom: 6 }}>JDデータがまだ登録されていません</div>
          {isAdmin && (
            <div style={{ fontSize: 12, color: T().textFaintest }}>上の「＋ JDを作成する」ボタンから登録できます</div>
          )}
        </div>
      )}

      {/* 新規JD作成フォーム（versionsが空の場合） */}
      {versions.length === 0 && editing && (
        <div style={{ marginBottom: 16 }}>
          {/* period入力 */}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 期間・役職</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>期間</div>
                <PeriodInput value={editVer.period || ''} onChange={v => setEditVer(p => ({ ...p, period: v }))} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>役職名</div>
                <input value={editVer.role || ''} onChange={e => setEditVer(p => ({ ...p, role: e.target.value }))}
                  placeholder="例: コミュニティマネージャー"
                  style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 6, padding: '6px 8px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>雇用形態</div>
                <select value={editVer.emp || '業務委託'} onChange={e => setEditVer(p => ({ ...p, emp: e.target.value }))}
                  style={{ width: '100%', background: T().selectBg, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 8px', color: T().text, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
                  {EMP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>稼働量</div>
              <input value={editVer.working || ''} onChange={e => setEditVer(p => ({ ...p, working: e.target.value }))}
                placeholder="例: 週3〜4日"
                style={{ width: 150, background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 6, padding: '6px 8px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* 役割・責任範囲 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 役割</div>
              <textarea value={editVer.role_desc || ''} onChange={e => setEditVer(p => ({ ...p, role_desc: e.target.value }))} rows={5} placeholder="1行に1つ記載してください" style={ta} />
            </div>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 責任範囲</div>
              <textarea value={editVer.responsibility || ''} onChange={e => setEditVer(p => ({ ...p, responsibility: e.target.value }))} rows={5} placeholder="1行に1つ記載してください" style={ta} />
            </div>
          </div>

          {/* 主要定例 */}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 主要定例</div>
            <textarea value={editVer.meetings || ''} onChange={e => setEditVer(p => ({ ...p, meetings: e.target.value }))} rows={4} placeholder="・定例名（頻度）" style={ta} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <SaveBtn saving={saving} saved={saved} onClick={saveEdit} label="JDを保存する" />
            <button onClick={() => setEditing(false)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${T().borderMid}`, background: 'transparent', color: T().textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <>
          {/* 役割・責任範囲 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 役割</div>
              {editing ? <textarea value={EV.role_desc || ''} onChange={e => setEditVer(p => ({ ...p, role_desc: e.target.value }))} rows={5} style={ta} /> : (
                <div style={{ fontSize: 12, color: T().textMuted, lineHeight: 1.8, background: `${fg}12`, padding: 12, borderRadius: 8 }}>
                  {EV.role_desc ? EV.role_desc.split('\n').map((l, i) => <div key={i}>• {l}</div>) : <span style={{ color: T().textFaintest }}>—</span>}
                </div>
              )}
            </div>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 責任範囲</div>
              {editing ? <textarea value={EV.responsibility || ''} onChange={e => setEditVer(p => ({ ...p, responsibility: e.target.value }))} rows={5} style={ta} /> : (
                <div style={{ fontSize: 12, color: T().textMuted, lineHeight: 1.8, background: T().bgInput, padding: 12, borderRadius: 8 }}>
                  {EV.responsibility ? EV.responsibility.split('\n').map((l, i) => <div key={i}>• {l}</div>) : <span style={{ color: T().textFaintest }}>—</span>}
                </div>
              )}
            </div>
          </div>

          {/* 主要定例 */}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 主要定例</div>
            {editing ? <textarea value={EV.meetings || ''} onChange={e => setEditVer(p => ({ ...p, meetings: e.target.value }))} rows={4} style={ta} /> : (
              EV.meetings ? <div style={{ fontSize: 12, color: T().textMuted, lineHeight: 1.8, whiteSpace: 'pre-line', background: T().bgInput, padding: 12, borderRadius: 8 }}>{EV.meetings}</div> : <span style={{ fontSize: 12, color: T().textFaintest }}>—</span>
            )}
          </div>

          {/* 業務内容一覧 — org_tasks から owner でフィルタ（業務一覧タブと常に同期） */}
          {(() => {
            const memberName = memberRow?.name
            const ownerTasks = (tasks || []).filter(t => t.owner === memberName)
            const supportTasks = (tasks || []).filter(t => t.support && t.support.includes(memberName) && t.owner !== memberName)
            // levels階層を使ってタスクをマッチ（TaskListのmatchTaskと同じロジック）
            const matchTaskLocal = (t) => {
              if (!levels || levels.length === 0) return { dept: t.dept, team: t.team || t.dept || '—' }
              const roots = levels.filter(l => !l.parent_id)
              const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))
              const hier = {}
              roots.forEach(root => {
                getChildren(root.id).forEach(dept => {
                  hier[dept.name] = {}
                  const teams = getChildren(dept.id)
                  if (teams.length === 0) { hier[dept.name][dept.name] = dept.id }
                  else { teams.forEach(team => { hier[dept.name][team.name] = team.id }) }
                })
              })
              if (t.level_id) {
                for (const [deptName, teams] of Object.entries(hier)) {
                  for (const [teamName, levelId] of Object.entries(teams)) {
                    if (Number(t.level_id) === Number(levelId)) return { dept: deptName, team: teamName }
                  }
                }
              }
              for (const [deptName, teams] of Object.entries(hier)) {
                for (const teamName of Object.keys(teams)) {
                  if (t.team === teamName) return { dept: deptName, team: teamName }
                }
              }
              for (const [deptName, teams] of Object.entries(hier)) {
                for (const teamName of Object.keys(teams)) {
                  if (t.team && teamName && (t.team.includes(teamName) || teamName.includes(t.team)))
                    return { dept: deptName, team: teamName }
                }
              }
              for (const [deptName, teams] of Object.entries(hier)) {
                if (t.dept === deptName || (t.dept && (t.dept.includes(deptName) || deptName.includes(t.dept)))) {
                  const firstTeam = Object.keys(teams)[0]
                  if (firstTeam) return { dept: deptName, team: firstTeam }
                }
              }
              return { dept: t.dept, team: t.team || t.dept || '—' }
            }
            // チームごとにグループ化（levels階層にマッチ）
            const grouped = {}
            ownerTasks.forEach(t => {
              const m = matchTaskLocal(t)
              const key = m.team
              if (!grouped[key]) grouped[key] = { tasks: [], dept: m.dept }
              grouped[key].tasks.push(t)
            })
            return (
              <div style={{ ...box, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase' }}>
                    ▶ 担当業務一覧（{ownerTasks.length}件）
                    <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: T().badgeBg, color: T().accent }}>業務一覧と同期</span>
                  </div>
                </div>

                {ownerTasks.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: T().textFaintest, fontStyle: 'italic' }}>
                    業務一覧タブでこのメンバーを責任者に設定すると、ここに反映されます
                  </div>
                ) : (
                  Object.entries(grouped).map(([team, group]) => {
                    const teamTasks = group.tasks
                    const color = getDeptColor(group.dept || '')
                    return (
                      <div key={team} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 3, height: 12, background: color, borderRadius: 2, display: 'inline-block' }} />
                          {team}
                        </div>
                        <div style={{ border: `1px solid ${T().border}`, borderRadius: 8, overflow: 'hidden', background: T().bgCard }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: T().bgTable }}>
                                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, borderBottom: `1px solid ${T().border}` }}>業務内容</th>
                                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, width: 110, borderBottom: `1px solid ${T().border}` }}>担当（サポート）</th>
                              </tr>
                            </thead>
                            <tbody>
                              {teamTasks.map((t, i) => (
                                <tr key={t.id} style={{ borderBottom: i < teamTasks.length - 1 ? `1px solid ${T().border}` : 'none' }}>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: T().textSub, lineHeight: 1.5 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span>{t.task}</span>
                                      {(taskHistory || []).filter(h => h.task_id === t.id).length > 0 && (
                                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}`, whiteSpace: 'nowrap', cursor: 'default' }}
                                          title={(taskHistory || []).filter(h => h.task_id === t.id).map(h => `${h.from_owner || '未設定'} → ${h.to_owner || '未設定'}`).join(' / ')}>
                                          🔄 {(taskHistory || []).filter(h => h.task_id === t.id).length}回引き継ぎ
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    {t.support ? (
                                      <span style={{ fontSize: 11, color: T().textFaint, padding: '2px 7px', background: T().bgInput, borderRadius: 5 }}>{t.support}</span>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })
                )}

                {/* サポート業務（担当欄に名前が入っているもの） */}
                {supportTasks.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '1px', marginBottom: 8 }}>
                      サポート業務（{supportTasks.length}件）
                    </div>
                    <div style={{ border: `1px solid ${T().border}`, borderRadius: 8, overflow: 'hidden', background: T().bgCard }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {supportTasks.map((t, i) => (
                            <tr key={t.id} style={{ borderBottom: i < supportTasks.length - 1 ? `1px solid ${T().border}` : 'none', background: T().bgHover }}>
                              <td style={{ padding: '7px 12px' }}>
                                <span style={{ fontSize: 10, color: T().textFaint, padding: '2px 6px', background: T().bgInput, borderRadius: 4 }}>{t.team}</span>
                              </td>
                              <td style={{ padding: '7px 12px', fontSize: 12, color: T().textMuted, lineHeight: 1.5 }}>{t.task}</td>
                              <td style={{ padding: '7px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <Avatar name={t.owner} size={16} />
                                  <span style={{ fontSize: 11, color: avatarColor(t.owner) }}>{t.owner}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* 役職推移タイムライン（リッチ可視化） */}
          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase' }}>▶ 役職推移タイムライン</div>
              <span style={{ fontSize: 10, color: T().textFaintest }}>{versions.length}バージョン</span>
            </div>

            {/* 雇用形態変遷グラフ */}
            {versions.length > 1 && (
              <div style={{ marginBottom: 20, padding: '12px 16px', background: T().bgCard2, borderRadius: 8, border: `1px solid ${T().border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, marginBottom: 10 }}>雇用形態・稼働量の推移</div>
                <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', borderRadius: 6, overflow: 'hidden', height: 32 }}>
                  {versions.map((v, i) => {
                    const empB = getEmpBadge(v.emp || '')
                    const isLast = i === versions.length - 1
                    return (
                      <div key={i} onClick={() => { setVerIdx(i); setEditing(false) }}
                        style={{ flex: 1, background: i === effectiveVerIdx ? empB.color : `${empB.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#fff', borderRight: isLast ? 'none' : '2px solid rgba(255,255,255,0.15)', transition: 'all 0.15s', position: 'relative', minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px' }}>V{i + 1}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
                  {versions.map((v, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: i === effectiveVerIdx ? T().text : T().textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                      {v.emp ? v.emp.split('→')[0] : '—'}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {[...new Set(versions.map(v => v.emp).filter(Boolean))].map(emp => {
                    const b = getEmpBadge(emp)
                    return <span key={emp} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: b.bg, color: b.color }}>{emp}</span>
                  })}
                </div>
              </div>
            )}

            {/* バージョン縦並びタイムライン */}
            <div style={{ position: 'relative', paddingLeft: 32 }}>
              <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: `${fg}30`, borderRadius: 1 }} />
              {versions.map((v, i) => {
                const isLatest = i === versions.length - 1
                const isCurrent = i === effectiveVerIdx
                const empB = getEmpBadge(v.emp || '')
                const taskCount = (v.tasks || []).filter(t => t.status !== 'del').length
                // 前バージョンとの差分
                const prev = i > 0 ? versions[i - 1] : null
                const roleChanged = prev && prev.role !== v.role
                const empChanged = prev && prev.emp !== v.emp

                return (
                  <div key={i} style={{ position: 'relative', marginBottom: i < versions.length - 1 ? 4 : 0 }}>
                    {/* タイムラインドット */}
                    <div style={{ position: 'absolute', left: -26, top: 16, width: 14, height: 14, borderRadius: '50%', background: isLatest ? fg : (isCurrent ? fg : T().bgCard2), border: `2px solid ${isLatest || isCurrent ? fg : T().borderMid}`, zIndex: 1 }} />
                    {/* コネクタライン */}
                    {i < versions.length - 1 && (
                      <div style={{ position: 'absolute', left: -20, top: 30, width: 2, height: 'calc(100% - 10px)', background: `${fg}20` }} />
                    )}

                    <div onClick={() => { setVerIdx(i); setEditing(false) }}
                      style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 8, background: isCurrent ? `${fg}12` : T().bgCard2, border: `1px solid ${isCurrent ? fg + '50' : T().border}`, transition: 'all 0.15s' }}
                      onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.background = T().bgHover; e.currentTarget.style.borderColor = fg + '30' } }}
                      onMouseLeave={e => { if (!isCurrent) { e.currentTarget.style.background = T().bgCard2; e.currentTarget.style.borderColor = T().border } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            {isLatest && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: fg, color: bg }}>最新</span>}
                            <span style={{ fontSize: 11, color: isCurrent ? fg : T().textFaint, fontWeight: isCurrent ? 700 : 400 }}>
                              V{i + 1} {v.period && `— ${v.period}`}
                            </span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isCurrent ? T().text : T().textMuted, lineHeight: 1.4 }}>
                            {roleChanged && <span style={{ fontSize: 10, marginRight: 6, padding: '1px 6px', borderRadius: 3, background: T().warnBg, color: T().warn }}>役職変更</span>}
                            {v.role || '（役職未設定）'}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: empB.bg, color: empB.color, fontWeight: 700 }}>
                              {empChanged && '↑ '}{v.emp || '—'}
                            </span>
                            {v.working && <span style={{ fontSize: 10, color: T().textFaint }}>{v.working}</span>}
                            {taskCount > 0 && <span style={{ fontSize: 10, color: T().textFaintest, marginLeft: 4 }}>業務 {taskCount}件</span>}
                          </div>
                        </div>
                        {/* 管理者：バージョン削除ボタン */}
                        {isAdmin && dbRows.length > 0 && (
                          <button onClick={e => { e.stopPropagation(); deleteVersion(i) }}
                            style={{ padding: '3px 7px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().border}`, color: T().textFaintest, fontSize: 10, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
                            ✕
                          </button>
                        )}
                      </div>

                      {/* JD_DEFAULTからDBへのシード促進メッセージ */}
                      {dbRows.length === 0 && isAdmin && i === versions.length - 1 && (
                        <div style={{ marginTop: 8, padding: '6px 10px', background: T().badgeBg, borderRadius: 6, fontSize: 10, color: T().accent, border: `1px dashed ${T().badgeBorder}` }}>
                          💡 このデータはデフォルト値です。「このバージョンを編集」から保存するとDBに記録されます
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* 新バージョン追加プレースホルダー */}
              {isAdmin && !editing && versions.length > 0 && (
                <div onClick={startAddVersion}
                  style={{ position: 'relative', padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: `1px dashed ${T().badgeBorder}`, background: T().bgHover, display: 'flex', alignItems: 'center', gap: 8, color: T().accent, fontSize: 12 }}
                  onMouseEnter={e => e.currentTarget.style.background = T().badgeBg}
                  onMouseLeave={e => e.currentTarget.style.background = T().bgHover}
                >
                  <div style={{ position: 'absolute', left: -26, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', border: `2px dashed ${T().accent}`, background: T().bgCard }} />
                  ＋ 新しいバージョンを追加
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ5: 業務マニュアル
// ══════════════════════════════════════════════════
function ManualTab({ tasks, manuals, setManuals, members, levels, isAdmin, currentUser, teamMeta }) {
  const [selectedId,  setSelectedId]  = useState(null)
  const [phases,      setPhases]      = useState([])
  const [steps,       setSteps]       = useState({})
  const [mindsets,    setMindsets]    = useState([])
  const [conceptDB,   setConceptDB]   = useState([])
  const [loadingDB,   setLoadingDB]   = useState(false)
  const [dbError,     setDbError]     = useState(null)
  const [editMode,    setEditMode]    = useState(false)
  const [dirty,       setDirty]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [savedFlash,  setSavedFlash]  = useState(false)
  const [expandedStep,setExpandedStep]= useState(null)
  const [query,       setQuery]       = useState('')

  // ── team hierarchy ─────────────────────────────────────────
  const roots = levels.filter(l => !l.parent_id)
  const latestRoot = roots.reduce((a, b) => (a.id > b.id ? a : b), roots[0] || { id: 0 })
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))

  const depts = getChildren(latestRoot.id)
  const allTeams = depts.flatMap(d => {
    const teams = getChildren(d.id)
    return teams.length > 0 ? teams.map(t => ({ dept: d, team: t })) : [{ dept: d, team: d }]
  })
  const filtered = query
    ? allTeams.filter(({ team }) => team.name.includes(query))
    : allTeams

  // ── DB load ────────────────────────────────────────────────
  const loadManual = useCallback(async (levelId) => {
    setLoadingDB(true); setDbError(null)
    try {
      const { data: phData, error: pe } = await supabase
        .from('org_manual_phases').select('*').eq('level_id', levelId).order('sort_order')
      if (pe) throw new Error(pe.message)
      const phRows = phData || []
      setPhases(phRows)
      if (phRows.length > 0) {
        const { data: stData, error: se } = await supabase
          .from('org_manual_steps').select('*').in('phase_id', phRows.map(p => p.id)).order('sort_order')
        if (se) throw new Error(se.message)
        const map = {}
        phRows.forEach(p => { map[p.id] = [] })
        ;(stData || []).forEach(s => { if (map[s.phase_id]) map[s.phase_id].push(s) })
        setSteps(map)
      } else { setSteps({}) }
      const { data: msData } = await supabase
        .from('org_manual_mindsets').select('*').eq('level_id', levelId).order('sort_order')
      setMindsets(msData || [])
      const { data: csData } = await supabase
        .from('org_manual_concept_steps').select('*').eq('level_id', levelId).order('sort_order')
      setConceptDB(csData || [])
    } catch(e) { setDbError(e.message) }
    setLoadingDB(false)
  }, [])

  useEffect(() => {
    if (selectedId) { setEditMode(false); setDirty(false); setExpandedStep(null); loadManual(selectedId) }
  }, [selectedId])

  // ── concept steps ──────────────────────────────────────────
  const conceptSteps = useMemo(() => {
    if (conceptDB.length > 0) return conceptDB.map(c => ({ title: c.title, badgeClass: 'auto' }))
    return phases.flatMap(ph =>
      (steps[ph.id] || []).map(s => ({ title: s.title, badgeClass: ph.badge_class }))
    )
  }, [conceptDB, phases, steps])

  // ── save all ───────────────────────────────────────────────
  const saveAll = async () => {
    if (!selectedId) return
    setSaving(true); setDbError(null)
    try {
      for (const ph of phases) {
        await supabase.from('org_manual_phases').update({ badge: ph.badge, badge_class: ph.badge_class, title: ph.title }).eq('id', ph.id)
        for (const s of (steps[ph.id] || [])) {
          await supabase.from('org_manual_steps').update({
            title: s.title, owner: s.owner, tool: s.tool, urls: s.urls,
            condition: s.condition, caution: s.caution
          }).eq('id', s.id)
        }
      }
      setSaving(false); setDirty(false); setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch(e) { setDbError(e.message); setSaving(false) }
  }

  const addPhase = async () => {
    if (!selectedId) return
    const { data } = await supabase.from('org_manual_phases').insert({
      level_id: selectedId, sort_order: phases.length,
      badge: '新フェーズ', badge_class: 'operate', title: '新しいフェーズ'
    }).select().single()
    if (data) { setPhases(p => [...p, data]); setSteps(s => ({ ...s, [data.id]: [] })) }
  }

  const deletePhase = async (phId) => {
    if (!window.confirm('このフェーズとステップを削除しますか？')) return
    await supabase.from('org_manual_phases').delete().eq('id', phId)
    setPhases(p => p.filter(ph => ph.id !== phId))
    setSteps(s => { const n = { ...s }; delete n[phId]; return n })
  }

  const addStep = async (phId) => {
    const phSteps = steps[phId] || []
    const { data } = await supabase.from('org_manual_steps').insert({
      phase_id: phId, sort_order: phSteps.length,
      title: '新しい業務', owner: '', tool: '', urls: [], condition: '', caution: ''
    }).select().single()
    if (data) setSteps(s => ({ ...s, [phId]: [...(s[phId] || []), data] }))
  }

  const deleteStep = async (phId, sId) => {
    await supabase.from('org_manual_steps').delete().eq('id', sId)
    setSteps(s => ({ ...s, [phId]: (s[phId] || []).filter(st => st.id !== sId) }))
  }

  const updatePhase = (phId, field, val) => {
    setPhases(p => p.map(ph => ph.id === phId ? { ...ph, [field]: val } : ph))
    setDirty(true)
  }

  const updateStep = (phId, sId, field, val) => {
    setSteps(s => ({ ...s, [phId]: (s[phId] || []).map(st => st.id === sId ? { ...st, [field]: val } : st) }))
    setDirty(true)
  }

  // ── selected team info ─────────────────────────────────────
  const selectedLevel = levels.find(l => l.id === selectedId)
  const selectedDept  = selectedLevel ? levels.find(l => l.id === Number(selectedLevel.parent_id)) : null
  const teamDescObj   = teamMeta?.[selectedId]
  const teamDesc      = teamDescObj?.desc_text || ''

  const BADGE_CLASSES = ['onboard', 'operate', 'manage', 'support']
  const BADGE_LABELS  = { onboard: 'オンボード', operate: '運用', manage: '管理', support: 'サポート' }

  // ── styles ─────────────────────────────────────────────────
  const S = {
    wrap:      { display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: T().bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif' },
    sidebar:   { width: 220, flexShrink: 0, background: T().bgCard, overflowY: 'auto', borderRight: `1px solid ${T().border}`, display: 'flex', flexDirection: 'column' },
    sideHead:  { padding: '14px 14px 6px', fontSize: 10, fontWeight: 700, color: T().textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' },
    deptLabel: { padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
    teamRow:   (active) => ({ padding: '8px 14px 8px 22px', fontSize: 13, cursor: 'pointer', borderRadius: 6, margin: '1px 6px', background: active ? T().navActiveBg : 'transparent', color: active ? T().accent : T().textSub, fontWeight: active ? 700 : 400, transition: 'all 0.15s' }),
    main:      { flex: 1, overflowY: 'auto', minWidth: 0, background: T().bg },
    wrap2:     { maxWidth: 860, margin: '0 auto', padding: '32px 28px 80px', width: '100%', boxSizing: 'border-box' },
    hero:      (accent) => ({ background: accent ? `${accent}12` : T().bgCard, border: `3px solid ${accent || T().border}`, borderRadius: 14, padding: '24px 28px', marginBottom: 28 }),
    secLabel:  { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 11, fontWeight: 700, color: T().textFaint, letterSpacing: '0.1em', textTransform: 'uppercase' },
    secLabelLine: { flex: 1, height: 1, background: T().border },
    conceptBox:{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 28, display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: 'wrap' },
    conceptArrow: { color: T().textFaint, margin: '0 6px', fontSize: 16, lineHeight: '56px' },
    conceptStep:{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 72 },
    phaseBlock:{ marginBottom: 20 },
    phaseBadge:(bc) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, marginRight: 10, background: bc === 'onboard' ? '#3D7A6A22' : '#5B6A8822', color: bc === 'onboard' ? '#3D7A6A' : '#5B6A88' }),
    phaseTitle:{ fontSize: 15, fontWeight: 700, color: T().text },
    stepCard:  (expanded) => ({ background: T().bgCard, border: `1px solid ${expanded ? T().accent : T().border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden', transition: 'border-color 0.2s' }),
    stepHeader:{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' },
    stepNum:   (bc) => ({ width: 26, height: 26, borderRadius: '50%', background: bc === 'onboard' ? '#3D7A6A' : '#5B6A88', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }),
    stepBody:  { padding: '0 16px 14px 52px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    fieldLbl:  { fontSize: 9, fontWeight: 700, color: T().textFaint, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 },
    fieldVal:  { fontSize: 12, color: T().textSub, lineHeight: 1.65, whiteSpace: 'pre-wrap' },
    condBox:   { gridColumn: '1/-1', background: `${T().accent}10`, border: `1px solid ${T().accent}30`, borderRadius: 7, padding: '8px 12px' },
    cautBox:   { gridColumn: '1/-1', background: `${T().warn}10`, border: `1px solid ${T().warn}30`, borderRadius: 7, padding: '8px 12px' },
    inp:       (extra={}) => ({ background: T().bgInput, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '5px 8px', color: T().text, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', ...extra }),
    saveBar:   { position: 'sticky', top: 0, zIndex: 10, background: T().bgCard, borderBottom: `1px solid ${T().border}`, padding: '8px 28px', display: 'flex', alignItems: 'center', gap: 10 },
    taskItem:  { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${T().border}`, marginBottom: 6, background: T().bgCard },
  }

  // ── dept accent colors ──────────────────────────────────────
  const DEPT_ACCENT = {
    'パートナー事業部': '#B86B30', 'ユース事業部': '#5D4E8C',
    'コミュニティ事業部': '#3D7A6A', '経営企画部': '#2F5F8C',
  }
  const accent = selectedDept ? (DEPT_ACCENT[selectedDept.name] || T().accent) : T().accent

  // ── team tasks ─────────────────────────────────────────────
  const teamTasks = useMemo(() => {
    if (!selectedId || !levels.length) return []
    return tasks.filter(t => {
      if (t.is_archived) return false
      if (t.level_id && Number(t.level_id) === Number(selectedId)) return true
      const lv = levels.find(l => Number(l.id) === Number(selectedId))
      return lv && t.team === lv.name
    })
  }, [selectedId, tasks, levels])

  return (
    <div style={S.wrap}>
      {/* ── SIDEBAR ── */}
      <div style={S.sidebar}>
        <div style={{ padding: '12px 10px 6px' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 チームを検索..."
            style={{ width: '100%', boxSizing: 'border-box', background: T().bgInput, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 10px', color: T().text, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
        </div>
        {depts.map(dept => {
          const teams = getChildren(dept.id)
          const showTeams = teams.length > 0 ? teams : [dept]
          const deptFiltered = query ? showTeams.filter(t => t.name.includes(query)) : showTeams
          if (deptFiltered.length === 0) return null
          const dc = DEPT_ACCENT[dept.name] || T().accent
          return (
            <div key={dept.id}>
              <div style={{ ...S.deptLabel, color: dc }}>● {dept.name}</div>
              {deptFiltered.map(team => (
                <div key={team.id}
                  style={S.teamRow(selectedId === team.id)}
                  onClick={() => setSelectedId(team.id)}
                  onMouseEnter={e => { if (selectedId !== team.id) e.currentTarget.style.background = T().bgHover }}
                  onMouseLeave={e => { if (selectedId !== team.id) e.currentTarget.style.background = 'transparent' }}>
                  {team.icon && <span style={{ marginRight: 5 }}>{team.icon}</span>}{team.name}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* ── MAIN ── */}
      <div style={S.main}>
        {!selectedId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: T().textFaint }}>
            <div style={{ fontSize: 48 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>チームを選択してください</div>
          </div>
        ) : (
          <>
            {/* 保存バー */}
            {editMode && (
              <div style={S.saveBar}>
                <span style={{ fontSize: 12, color: T().textMuted, flex: 1 }}>編集モード</span>
                {dirty && <span style={{ fontSize: 11, color: T().warn }}>● 未保存の変更があります</span>}
                <button onClick={addPhase} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, cursor: 'pointer', fontFamily: 'inherit' }}>＋ フェーズ追加</button>
                <button onClick={saveAll} disabled={saving || !dirty} style={{ fontSize: 12, padding: '6px 18px', borderRadius: 7, background: dirty ? T().accentSolid : T().bgInput, border: 'none', color: dirty ? '#fff' : T().textFaint, cursor: dirty ? 'pointer' : 'default', fontWeight: 700, fontFamily: 'inherit' }}>
                  {saving ? '保存中...' : savedFlash ? '✓ 保存済み' : '保存'}
                </button>
                <button onClick={() => { setEditMode(false); loadManual(selectedId) }} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: 'transparent', border: `1px solid ${T().border}`, color: T().textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
              </div>
            )}

            <div style={S.wrap2}>
              {/* Hero */}
              <div style={S.hero(accent)}>
                {selectedDept && <div style={{ fontSize: 11, color: accent, fontWeight: 700, marginBottom: 6 }}>{selectedDept.name}</div>}
                <div style={{ fontSize: 26, fontWeight: 800, color: T().text, marginBottom: teamDesc ? 10 : 0 }}>
                  {selectedLevel?.icon && <span style={{ marginRight: 8 }}>{selectedLevel.icon}</span>}
                  {selectedLevel?.name}
                </div>
                {teamDesc && <div style={{ fontSize: 14, color: T().textSub, lineHeight: 1.75 }}>{teamDesc}</div>}
                {isAdmin && !editMode && (
                  <button onClick={() => setEditMode(true)} style={{ marginTop: 12, fontSize: 11, padding: '5px 14px', borderRadius: 7, background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>● 編集モード</button>
                )}
              </div>

              {loadingDB && <div style={{ color: T().accent, fontSize: 13, marginBottom: 20 }}>読み込み中...</div>}
              {dbError && <div style={{ color: T().warn, fontSize: 12, marginBottom: 16, padding: '10px 14px', background: `${T().warn}15`, borderRadius: 8 }}>⚠ {dbError}</div>}

              {/* 概念フロー */}
              {conceptSteps.length > 0 && (
                <>
                  <div style={S.secLabel}><span>全体の流れ（概念）</span><span style={S.secLabelLine} /></div>
                  <div style={S.conceptBox}>
                    {conceptSteps.map((cs, i) => (
                      <React.Fragment key={i}>
                        <div style={S.conceptStep}>
                          <div style={{ ...S.stepNum(cs.badgeClass), width: 32, height: 32, fontSize: 13 }}>{i + 1}</div>
                          <div style={{ fontSize: 11, color: T().textSub, textAlign: 'center', lineHeight: 1.4, maxWidth: 72 }}>{cs.title}</div>
                        </div>
                        {i < conceptSteps.length - 1 && <span style={S.conceptArrow}>→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </>
              )}

              {/* フェーズ・ステップ */}
              {phases.length === 0 && !loadingDB && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: T().textFaint, border: `1px dashed ${T().border}`, borderRadius: 12, marginBottom: 24 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14 }}>業務フローがまだ登録されていません</div>
                  {isAdmin && <button onClick={() => { setEditMode(true); addPhase() }} style={{ marginTop: 12, fontSize: 12, padding: '6px 18px', borderRadius: 7, background: T().accentSolid, border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>＋ フェーズを追加する</button>}
                </div>
              )}

              {phases.length > 0 && (
                <>
                  <div style={S.secLabel}><span>業務フロー</span><span style={S.secLabelLine} /></div>
                  {phases.map((ph, pi) => (
                    <div key={ph.id} style={S.phaseBlock}>
                      {editMode ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <input value={ph.badge} onChange={e => updatePhase(ph.id, 'badge', e.target.value)} style={S.inp({ width: 100 })} placeholder="バッジ" />
                          <select value={ph.badge_class} onChange={e => updatePhase(ph.id, 'badge_class', e.target.value)} style={{ ...S.inp(), width: 110, cursor: 'pointer' }}>
                            {BADGE_CLASSES.map(bc => <option key={bc} value={bc}>{BADGE_LABELS[bc] || bc}</option>)}
                          </select>
                          <input value={ph.title} onChange={e => updatePhase(ph.id, 'title', e.target.value)} style={S.inp({ flex: 1 })} placeholder="フェーズタイトル" />
                          <button onClick={() => deletePhase(ph.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, background: T().warnBg, border: `1px solid ${T().warn}`, color: T().warn, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={S.phaseBadge(ph.badge_class)}>{ph.badge}</span>
                          <span style={S.phaseTitle}>{ph.title}</span>
                        </div>
                      )}
                      {(steps[ph.id] || []).map((s, si) => {
                        const key = `${ph.id}-${s.id}`
                        const expanded = expandedStep === key
                        const urls = Array.isArray(s.urls) ? s.urls : (typeof s.urls === 'string' ? JSON.parse(s.urls || '[]') : [])
                        return (
                          <div key={s.id} style={S.stepCard(expanded)}>
                            <div style={S.stepHeader} onClick={() => !editMode && setExpandedStep(expanded ? null : key)}>
                              <div style={S.stepNum(ph.badge_class)}>{si + 1}</div>
                              {editMode
                                ? <input value={s.title} onChange={e => updateStep(ph.id, s.id, 'title', e.target.value)} style={S.inp({ flex: 1 })} onClick={e => e.stopPropagation()} />
                                : <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T().text }}>{s.title}</span>
                              }
                              {editMode
                                ? <button onClick={e => { e.stopPropagation(); deleteStep(ph.id, s.id) }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: T().warnBg, border: `1px solid ${T().warn}`, color: T().warn, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                                : <span style={{ color: T().textFaint, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
                              }
                            </div>
                            {(expanded || editMode) && (
                              <div style={S.stepBody}>
                                {editMode ? (
                                  <>
                                    <div><div style={S.fieldLbl}>担当者</div><input value={s.owner||''} onChange={e => updateStep(ph.id, s.id, 'owner', e.target.value)} style={S.inp()} /></div>
                                    <div><div style={S.fieldLbl}>使用ツール・場所</div><input value={s.tool||''} onChange={e => updateStep(ph.id, s.id, 'tool', e.target.value)} style={S.inp()} /></div>
                                    <div style={{ gridColumn: '1/-1' }}><div style={S.fieldLbl}>✅ 完了条件</div><textarea value={s.condition||''} onChange={e => updateStep(ph.id, s.id, 'condition', e.target.value)} rows={2} style={{ ...S.inp(), resize: 'vertical' }} /></div>
                                    <div style={{ gridColumn: '1/-1' }}><div style={S.fieldLbl}>⚠️ 注意点</div><textarea value={s.caution||''} onChange={e => updateStep(ph.id, s.id, 'caution', e.target.value)} rows={2} style={{ ...S.inp(), resize: 'vertical' }} /></div>
                                  </>
                                ) : (
                                  <>
                                    {s.owner && <div><div style={S.fieldLbl}>担当者</div><div style={{ ...S.fieldVal, background: T().bgInput, borderRadius: 6, padding: '6px 10px' }}>{s.owner}</div></div>}
                                    {s.tool && <div><div style={S.fieldLbl}>使用ツール・場所</div><div style={{ ...S.fieldVal, background: T().bgInput, borderRadius: 6, padding: '6px 10px' }}>{s.tool}</div></div>}
                                    {urls.length > 0 && <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{urls.map((u, ui) => <a key={ui} href={u.href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T().accent, textDecoration: 'none', padding: '3px 10px', borderRadius: 5, background: `${T().accent}12`, border: `1px solid ${T().accent}30` }}>🔗 {u.label || u.href}</a>)}</div>}
                                    {s.condition && <div style={S.condBox}><div style={{ fontSize: 10, fontWeight: 700, color: T().accent, marginBottom: 4 }}>✅ 完了条件</div><div style={{ fontSize: 12, color: T().textSub, lineHeight: 1.65 }}>{s.condition}</div></div>}
                                    {s.caution && <div style={S.cautBox}><div style={{ fontSize: 10, fontWeight: 700, color: T().warn, marginBottom: 4 }}>⚠️ 注意点</div><div style={{ fontSize: 12, color: T().textSub, lineHeight: 1.65 }}>{s.caution}</div></div>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {editMode && <button onClick={() => addStep(ph.id)} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, background: T().badgeBg, border: `1px dashed ${T().badgeBorder}`, color: T().accent, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginTop: 4 }}>＋ ステップを追加</button>}
                    </div>
                  ))}
                </>
              )}

              {/* マインドセット */}
              {mindsets.length > 0 && (
                <>
                  <div style={S.secLabel}><span>考え方・マインドセット</span><span style={S.secLabelLine} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 11, marginBottom: 28 }}>
                    {mindsets.map((m, i) => (
                      <div key={i} style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 12, padding: '16px' }}>
                        <div style={{ fontSize: 19, marginBottom: 7 }}>{m.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T().text, marginBottom: 4 }}>{m.title}</div>
                        <div style={{ fontSize: 12.5, color: T().textSub, lineHeight: 1.7 }}>{m.body}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* 業務一覧 */}
              {teamTasks.length > 0 && (
                <>
                  <div style={S.secLabel}><span>業務一覧</span><span style={S.secLabelLine} /></div>
                  {teamTasks.map((t, i) => (
                    <div key={t.id} style={S.taskItem}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${accent}22`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T().text }}>{t.task}</div>
                        <div style={{ fontSize: 11, color: T().textFaint, marginTop: 2 }}>
                          {t.owner && `実責：${t.owner}`}{t.support && ` / サポート：${t.support}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 組織管理モーダル
// ══════════════════════════════════════════════════
function OrgManageModal({ levels, onClose, onAdd, onDelete, onRename, fiscalYear, onCopyFromYear }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('👥')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const composingRef = useRef(false)

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === id)
  const addableParents = levels.filter(l => {
    let d = 0, cur = l
    while (cur && cur.parent_id) { d++; cur = levels.find(x => x.id === cur.parent_id) }
    return d < 2
  })

  const save = async () => {
    if (!name.trim() || !parentId) return
    setSaving(true)
    await onAdd({ name: name.trim(), icon, parent_id: parseInt(parentId) })
    setName(''); setSaving(false)
  }
  const confirmDelete = async (level) => {
    const children = getChildren(level.id)
    const msg = children.length
      ? `「${level.name}」と配下の${children.length}件を削除しますか？\n関連するOKRもすべて削除されます。`
      : `「${level.name}」を削除しますか？\n関連するOKRもすべて削除されます。`
    if (!window.confirm(msg)) return
    setDeleting(level.id)
    await onDelete(level.id)
    setDeleting(null)
  }
  const ICONS = ['🏢','🚀','⚙️','💼','👥','📊','🎯','💡','🌟','🔥','📈','🤝']
  const startEdit = (level) => { setEditingId(level.id); setEditName(level.name); setEditIcon(level.icon || '📁') }
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditIcon('') }
  const saveEdit = async (level) => {
    if (!editName.trim()) return
    await onRename(level.id, editName.trim(), editIcon)
    cancelEdit()
  }

  function LevelRow({ level, depth = 0 }) {
    const children = getChildren(level.id)
    const absD = (() => { let d=0,cur=level; while(cur&&cur.parent_id){d++;cur=levels.find(x=>x.id===cur.parent_id)} return d })()
    const col = { 0: T().warn, 1: T().accent, 2: T().accent }[absD] || T().textMuted
    const lbl = { 0:'経営', 1:'事業部', 2:'チーム' }[absD] || ''
    const isRoot = absD === 0
    const isEditing = editingId === level.id
    return (
      <>
        <div style={{ padding:`8px 10px 8px ${10+depth*16}px`, borderRadius:7, marginBottom:3, background: isEditing ? `${T().accent}08` : T().bgCard2 || T().sectionBg, border:`1px solid ${isEditing ? T().accent+'40' : T().border}` }}>
          {isEditing ? (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                <span style={{ fontSize:13 }}>{editIcon}</span>
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  onCompositionStart={() => { composingRef.current = true }}
                  onCompositionEnd={e => { composingRef.current = false; setEditName(e.target.value) }}
                  onKeyDown={e => { if (composingRef.current) return; if (e.key === 'Enter') saveEdit(level); if (e.key === 'Escape') cancelEdit() }}
                  style={{ flex:1, background:T().sectionBg, border:`1px solid ${T().border}`, borderRadius:6, padding:'5px 8px', color:T().text, fontSize:12, outline:'none', fontFamily:'inherit', minWidth:80 }} />
                <button onClick={() => saveEdit(level)} style={{ background:T().accent, border:'none', color:'#fff', borderRadius:5, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>保存</button>
                <button onClick={cancelEdit} style={{ background:'transparent', border:`1px solid ${T().border}`, color:T().textMuted, borderRadius:5, padding:'4px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
              </div>
              <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                {ICONS.map(ic => (
                  <button key={ic} onClick={() => setEditIcon(ic)} style={{ width:24, height:24, borderRadius:5, border:`1px solid ${editIcon===ic ? T().accent : T().border}`, background: editIcon===ic ? T().accentBg : 'transparent', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>{ic}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13 }}>{level.icon}</span>
              <span style={{ flex:1, fontSize:12, fontWeight:500, color:T().text }}>{level.name}</span>
              <span style={{ fontSize:9, padding:'2px 6px', borderRadius:99, background:`${col}18`, color:col, fontWeight:700 }}>{lbl}</span>
              {!isRoot && (
                <button onClick={() => startEdit(level)} style={{ background:'transparent', border:`1px solid ${T().border}`, color:T().textMuted, borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>編集</button>
              )}
              {!isRoot && (
                <button onClick={() => confirmDelete(level)} disabled={deleting === level.id} style={{
                  background: T().warnBg, border:`1px solid ${T().warnBg}`, color: T().warn,
                  borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit',
                  opacity: deleting === level.id ? 0.5 : 1,
                }}>{deleting === level.id ? '削除中' : '削除'}</button>
              )}
            </div>
          )}
        </div>
        {children.map(c => <LevelRow key={c.id} level={c} depth={depth+1} />)}
      </>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.78)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:T().bgCard, border:`1px solid ${T().border}`, borderRadius:16, padding:26, width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>🏗️ 組織を管理</h3>
            <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:99, background: T().accentBg, color: T().accent, border:`1px solid ${T().accent}30`}}>{fiscalYear}年度</span>
          </div>
          <button onClick={onClose} style={{ background:T().border, border:'none', color:T().textMuted, width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        {onCopyFromYear && (
          <div style={{ marginBottom:16, padding:'10px 12px', background:`${T().accent}08`, border:`1px solid ${T().accent}30`, borderRadius:10 }}>
            <div style={{ fontSize:11, color:T().textMuted, fontWeight:700, marginBottom:8 }}>📋 他年度の組織構成をコピー</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['2025','2026'].filter(y=>y!==fiscalYear).map(y=>(
                <button key={y} onClick={()=>onCopyFromYear(y)} style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${T().accent}40`, background:`${T().accent}10`, color:T().textMuted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  {y}年度からコピー
                </button>
              ))}
            </div>
            <div style={{ fontSize:10, color:T().textMuted, marginTop:6 }}>※ 現在の{fiscalYear}年度の組織に追加されます（重複は除外）</div>
          </div>
        )}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10, color:T().textMuted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>{fiscalYear}年度の現在の組織（{levels.length}件）</div>
          {levels.length === 0 ? (
            <div style={{ fontSize:12, color:T().textFaint, fontStyle:'italic', padding:'12px 8px', textAlign:'center' }}>この年度の組織がまだありません。</div>
          ) : (
            roots.map(l => <LevelRow key={l.id} level={l} />)
          )}
        </div>
        <div style={{ borderTop:`1px solid ${T().border}`, paddingTop:18 }}>
          <div style={{ fontSize:10, color:T().textMuted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>新しい組織を追加</div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:T().textMuted, marginBottom:5 }}>親組織</div>
            <select value={parentId} onChange={e => setParentId(e.target.value)} style={{ width:'100%', background:T().sectionBg, border:`1px solid ${T().border}`, borderRadius:8, padding:'9px 12px', color: parentId ? T().text : T().textMuted, fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', cursor:'pointer' }}>
              <option value=''>選択してください</option>
              {addableParents.map(l => {
                const d = (() => { let dep=0,cur=l; while(cur&&cur.parent_id){dep++;cur=levels.find(x=>x.id===cur.parent_id)} return dep })()
                const label = d===0 ? '事業部として追加' : 'チームとして追加'
                return <option key={l.id} value={l.id}>{l.icon} {l.name}の下に（{label}）</option>
              })}
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:T().textMuted, marginBottom:5 }}>組織名</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="例: 西日本営業チーム"
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={e => { composingRef.current = false; setName(e.target.value) }}
              style={{ width:'100%', background:T().sectionBg, border:`1px solid ${T().border}`, borderRadius:8, padding:'9px 12px', color:T().text, fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:T().textMuted, marginBottom:8 }}>アイコン</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {ICONS.map(ic => (
                <button key={ic} onClick={() => setIcon(ic)} style={{ width:34, height:34, borderRadius:7, border:`1px solid ${icon===ic ? T().accent : T().border}`, background: icon===ic ? T().accentBg : T().sectionBg, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>{ic}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${T().border}`, color:T().textMuted, borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={save} disabled={saving || !name.trim() || !parentId} style={{ background: (!name.trim() || !parentId) ? T().textFaint : T().accent, border:'none', color:'#fff', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600, cursor: (!name.trim() || !parentId) ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>{saving ? '追加中...' : '＋ 追加する'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrgPage({ themeKey = 'dark', user, fiscalYear = '2026' }) {
  // グローバルテーマを更新
  _T = THEMES[themeKey] || THEMES.dark

  const [activeTab, setActiveTab] = useState('chart')
  const [jumpMemberName, setJumpMemberName] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const { levels, teamMeta, members, tasks, jdRows, taskHistory, setTaskHistory, manuals, setManuals, loading, syncStatus, orgTableError, reload, setLevels, setTeamMeta, setMembers, setTasks, setJdRows } = useOrgData(fiscalYear)
  const [showOrgManage, setShowOrgManage] = useState(false)

  // 組織管理ハンドラー
  const getSubtree = (id, lvls) => {
    const ids = [id]
    lvls.filter(l => Number(l.parent_id) === id).forEach(c => ids.push(...getSubtree(c.id, lvls)))
    return ids
  }
  const handleAddLevel = async ({ name, icon, parent_id }) => {
    const { data, error } = await supabase.from('levels').insert({ name, icon, parent_id: parent_id || null, color: T().accent, fiscal_year: fiscalYear }).select().single()
    if (error) { console.error('add level error:', error); return }
    setLevels(p => [...p, data])
  }
  const handleDeleteLevel = async (levelId) => {
    const subtree = getSubtree(levelId, levels)
    for (const lid of subtree) {
      const { data: objs } = await supabase.from('objectives').select('id').eq('level_id', lid)
      if (objs?.length) {
        const ids = objs.map(o => o.id)
        await supabase.from('key_results').delete().in('objective_id', ids)
        await supabase.from('objectives').delete().in('id', ids)
      }
      await supabase.from('levels').delete().eq('id', lid)
    }
    setLevels(prev => prev.filter(l => !subtree.includes(l.id)))
  }
  const handleRenameLevel = async (levelId, newName, newIcon) => {
    const { error } = await supabase.from('levels').update({ name: newName, icon: newIcon }).eq('id', levelId)
    if (error) { console.error('rename level error:', error); return }
    setLevels(p => p.map(l => l.id === levelId ? { ...l, name: newName, icon: newIcon } : l))
  }
  const handleCopyFromYear = async (fromYear) => {
    const { data: srcLevels } = await supabase.from('levels').select('*').eq('fiscal_year', fromYear).order('id')
    if (!srcLevels?.length) { alert(`${fromYear}年度の組織データがありません`); return }
    if (!window.confirm(`${fromYear}年度の組織構成（${srcLevels.length}件）を${fiscalYear}年度にコピーしますか？`)) return
    const existingNames = new Set(levels.map(l => l.name))
    const toInsert = srcLevels.filter(l => !existingNames.has(l.name))
    if (toInsert.length === 0) { alert('コピーするデータがありません（全て重複）'); return }
    const idMap = {}
    const roots = toInsert.filter(l => !l.parent_id || !toInsert.find(x => x.id === l.parent_id))
    for (const l of roots) {
      const { data } = await supabase.from('levels').insert({ name: l.name, icon: l.icon, color: l.color, fiscal_year: fiscalYear }).select().single()
      if (data) idMap[l.id] = data.id
    }
    const children = toInsert.filter(l => l.parent_id && toInsert.find(x => x.id === l.parent_id))
    for (const l of children) {
      const pid = idMap[l.parent_id] || l.parent_id
      const { data } = await supabase.from('levels').insert({ name: l.name, icon: l.icon, color: l.color, parent_id: pid, fiscal_year: fiscalYear }).select().single()
      if (data) idMap[l.id] = data.id
    }
    await reload()
  }

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.email) return
      const { data } = await supabase.from('members').select('is_admin').eq('email', user.email).single()
      if (data?.is_admin) setIsAdmin(true)
    }
    checkAdmin()
  }, [user])

  const handleMemberClick = name => { setJumpMemberName(name); setActiveTab('members') }
  const handleTeamMetaUpdate = (levelId, meta) => setTeamMeta(prev => ({ ...prev, [levelId]: { ...(prev[levelId] || {}), ...meta } }))

  const tabs = [
    { id: 'chart',    icon: '🏗', label: '組織図' },
    { id: 'tasks',    icon: '📋', label: '業務一覧' },
    { id: 'taskflow', icon: '🔄', label: '業務マニュアル' },
    { id: 'members',  icon: '👤', label: 'メンバーJD' },
    { id: 'users',    icon: '👥', label: 'ユーザー管理' },
  ]


  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T().bg, color: T().textMuted, fontSize: 14 }}>読み込み中...</div>

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T().bg, color: T().text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: T().accent, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>Organization</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T().text }}>🏢 組織</div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: fiscalYear === '2026' ? T().badgeBg : T().warnBg, color: fiscalYear === '2026' ? T().accent : T().warn, border: `1px solid ${fiscalYear === '2026' ? T().badgeBorder : T().warn}` }}>{fiscalYear}年度</span>
            {isAdmin && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: T().warnBg, color: T().warn, border: `1px solid ${T().warn}`, fontWeight: 700 }}>👑 管理者</span>}
            <button onClick={() => setShowOrgManage(true)} style={{ padding: '5px 14px', borderRadius: 8, border: `1px solid ${T().accent}40`, background: T().accentBg, color: T().accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>🏗️ 組織を管理</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 13, color: T().textFaint }}>NEO福岡の組織図・業務一覧・業務マニュアル・メンバー別JDを確認できます</div>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
              background: syncStatus === 'synced' ? T().badgeBg : syncStatus === 'error' ? T().warnBg : T().warnBg,
              color: syncStatus === 'synced' ? T().accent : syncStatus === 'error' ? T().warn : T().warn,
              border: `1px solid ${syncStatus === 'synced' ? T().badgeBorder : T().warn}`,
            }}>
              {syncStatus === 'synced' ? '🟢 リアルタイム同期中' : syncStatus === 'error' ? '🔴 同期エラー' : '🟡 接続中...'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${T().border}`, marginBottom: 24 }}>
          {tabs.map(t => {
            const isA = activeTab === t.id
            return (
              <button key={t.id}
                onClick={() => { setActiveTab(t.id); if (t.id !== 'members') setJumpMemberName(null) }}
                style={{ padding: '10px 24px', fontSize: 13, fontWeight: isA ? 700 : 500, color: isA ? T().accent : T().textFaint, borderBottom: `3px solid ${isA ? T().accent : 'transparent'}`, marginBottom: -2, cursor: 'pointer', border: 'none', background: isA ? T().navActiveBg : 'transparent', borderRadius: '8px 8px 0 0', transition: 'all 0.15s', fontFamily: 'inherit' }}>
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'chart' && (
          <OrgChart levels={levels} teamMeta={teamMeta} members={members} onMemberClick={handleMemberClick} isAdmin={isAdmin} onTeamMetaUpdate={handleTeamMetaUpdate} />
        )}
        {activeTab === 'tasks' && (
          <TaskList tasks={tasks} setTasks={setTasks} members={members} onMemberClick={handleMemberClick} isAdmin={isAdmin}
            taskHistory={taskHistory} setTaskHistory={setTaskHistory} currentUser={user?.email} levels={levels} orgTableError={orgTableError} />
        )}
        {activeTab === 'taskflow' && (
          <TaskManualPage levels={levels} isAdmin={isAdmin} themeKey={themeKey} />
        )}
        {activeTab === 'members' && (
          <MemberJDTab
            members={members} setMembers={setMembers}
            levels={levels}
            tasks={tasks}
            taskHistory={taskHistory}
            jdRows={jdRows} setJdRows={setJdRows}
            isAdmin={isAdmin}
            initialName={jumpMemberName}
            onClearJump={() => setJumpMemberName(null)}
          />
        )}
        {activeTab === 'users' && <UserListTab members={members} currentUser={user} isAdmin={isAdmin} />}
      </div>

      {showOrgManage && (
        <OrgManageModal
          levels={levels}
          onClose={() => setShowOrgManage(false)}
          onAdd={handleAddLevel}
          onDelete={handleDeleteLevel}
          onRename={handleRenameLevel}
          fiscalYear={fiscalYear}
          onCopyFromYear={handleCopyFromYear}
        />
      )}
    </div>
  )
}
