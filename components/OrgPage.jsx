'use client'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import TaskManualPage from './TaskManualPage'

const THEMES = {
  dark: {
    bg:'#0F1117',bgCard:'#1A1D27',bgCard2:'#1A1D27',bgInput:'rgba(255,255,255,0.07)',
    bgHover:'rgba(255,255,255,0.05)',bgTable:'rgba(255,255,255,0.04)',
    border:'rgba(255,255,255,0.10)',borderMid:'rgba(255,255,255,0.16)',borderEdit:'rgba(93,202,165,0.6)',
    text:'#E8ECF0',textSub:'#B0BAC8',textMuted:'#7a8599',textFaint:'#4A5468',textFaintest:'#333b4d',
    inputBg:'#1A1D27',inputText:'#E8ECF0',selectBg:'#1A1D27',
    accent:'#5DCAA5',accentDark:'#0F6E56',accentSolid:'#2F7A78',
    warn:'#F0997B',warnBg:'rgba(216,90,48,0.2)',
    badgeBg:'rgba(47,122,120,0.25)',badgeBorder:'rgba(47,122,120,0.3)',
    navActiveBg:'rgba(47,122,120,0.15)',navActiveText:'#5DCAA5',
    progressBg:'rgba(255,255,255,0.08)',progressFill:'#2F7A78',
    eventBandBg:'#0F6E56',eventBandText:'#E1F5EE',
  },
  light: {
    bg:'#EEF2F5',bgCard:'#FFFFFF',bgCard2:'#FFFFFF',bgInput:'#F3F4F6',
    bgHover:'#F7FAFC',bgTable:'#FFFFFF',
    border:'#DDE4EA',borderMid:'#B0C0CC',borderEdit:'#5A8A7A',
    text:'#2D3748',textSub:'#5A6577',textMuted:'#A0AEC0',textFaint:'#A0AEC0',textFaintest:'#DDE4EA',
    inputBg:'#FFFFFF',inputText:'#2D3748',selectBg:'#FFFFFF',
    accent:'#5A8A7A',accentDark:'#3D6B5E',accentSolid:'#5A8A7A',
    warn:'#E8875A',warnBg:'rgba(232,135,90,0.1)',
    badgeBg:'rgba(90,138,122,0.15)',badgeBorder:'rgba(90,138,122,0.3)',
    navActiveBg:'#EEF7F3',navActiveText:'#3D6B5E',
    progressBg:'#E8EEF2',progressFill:'#5A8A7A',
    eventBandBg:'#3D6B5E',eventBandText:'#FFFFFF',
  },
}
let _T = THEMES.dark
const T = () => _T

// ══════════════════════════════════════════════════
// 定数・ユーティリティ
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
const AVATAR_COLORS = ['#5A8A7A','#3D6B5E','#5DCAA5','#E8875A','#6B8DB5','#B07D9E','#C4956A','#5B9EA6','#8B7EC8','#D4816B']
const DEPT_COLOR_RULES = [
  { match: 'コミュニティ', color: '#5A8A7A' },
  { match: 'ユース',       color: '#3D6B5E' },
  { match: 'クラブ連携',   color: '#0F6E56' },
  { match: '経営',         color: '#E8875A' },
]
const ROLES = ['管理者', 'ディレクター', 'マネージャー', 'メンバー', 'その他']

function getDeptColor(name) {
  const rule = DEPT_COLOR_RULES.find(r => name && name.includes(r.match))
  return rule ? rule.color : '#5A8A7A'
}
function getStatusBadge(status) { return STATUS_OPTS.find(s => s.value === status) || STATUS_OPTS[0] }
function getEmpBadge(emp) {
  const key = Object.keys(EMP_BADGE).find(k => emp && emp.includes(k)) || '業務委託'
  return EMP_BADGE[key]
}
function avatarColor(name) {
  if (!name) return '#7a8599'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ══════════════════════════════════════════════════
// 共通UIパーツ
// ══════════════════════════════════════════════════
function Avatar({ name, size = 36, avatar_url }) {
  if (avatar_url) {
    return <img src={avatar_url} alt={name || ''} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), objectFit: 'cover', border: `1.5px solid ${avatarColor(name)}60`, flexShrink: 0 }} />
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

function SupportSelect({ value, onChange, memberNames, borderColor }) {
  const selected = value ? value.split('・').map(s => s.trim()).filter(Boolean) : []
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const toggle = (name) => {
    const next = selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name]
    onChange(next.join('・'))
  }
  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 180) })
    }
    setOpen(p => !p)
  }
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <div onClick={handleOpen} style={{ background: T().inputBg, border: `1px solid ${borderColor || T().borderEdit}`, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: T().inputText, minHeight: 26, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
        {selected.length === 0
          ? <span style={{ color: T().textFaintest }}>（なし）</span>
          : selected.map(n => <span key={n} style={{ background: `${avatarColor(n)}22`, color: avatarColor(n), borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{n}</span>)
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
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? `${avatarColor(name)}15` : 'transparent' }}>
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
    if (orgErrors.length > 0) { setOrgTableError(true) } else { setOrgTableError(false) }

    const validLvls = (lvls || []).filter(l =>
      fiscalYear === '2026' ? (!l.fiscal_year || l.fiscal_year === '2026') : l.fiscal_year === fiscalYear
    )
    setLevels(validLvls)
    const metaMap = {}
    ;(meta || []).forEach(m => { metaMap[m.level_id] = m })
    setTeamMeta(metaMap)
    setMembers(mems || [])
    setTasks(taskData && taskData.length > 0 ? taskData : [])

    const rowMap = {}
    ;(jdData || []).forEach(row => {
      if (!rowMap[row.member_id]) rowMap[row.member_id] = []
      rowMap[row.member_id].push(row)
    })
    Object.keys(rowMap).forEach(k => rowMap[k].sort((a, b) => a.version_idx - b.version_idx))
    setJdRows(rowMap)
    setTaskHistory(histData || [])
    setManuals(manualData || [])
    setLoading(false)
  }, [fiscalYear])

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('org_realtime_' + fiscalYear)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_tasks' }, payload => {
        if (payload.eventType === 'INSERT') { setTasks(prev => prev.some(t => t.id === payload.new.id) ? prev : [...prev, payload.new]) }
        else if (payload.eventType === 'UPDATE') { setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t)) }
        else if (payload.eventType === 'DELETE') { setTasks(prev => prev.filter(t => t.id !== payload.old.id)) }
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
            const row = payload.new; const mid = row.member_id
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
// タブ1: 組織図
// ══════════════════════════════════════════════════
function OrgChart({ levels, teamMeta, members, onMemberClick, isAdmin, onTeamMetaUpdate }) {
  const [editingMeta, setEditingMeta] = useState(null)
  const [metaBuf, setMetaBuf] = useState({})
  const [saving, setSaving] = useState(false)
  const [webhookEdit, setWebhookEdit] = useState(null)

  const handleSaveWebhook = async (levelId, url) => {
    await supabase.from('levels').update({ slack_webhook_url: url || null }).eq('id', levelId)
    setWebhookEdit(null)
  }

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))
  const depts = roots.flatMap(root => getChildren(root.id).map(dept => ({ ...dept, teams: getChildren(dept.id), rootName: root.name })))

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
                  style={{ padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600, background: dept.slack_webhook_url ? T().badgeBg : T().bgHover, border: `1px solid ${dept.slack_webhook_url ? T().badgeBorder : T().border}`, color: dept.slack_webhook_url ? T().accent : T().textMuted }}>
                  {dept.slack_webhook_url ? '📨 Slack設定済み' : '📨 Slack設定'}
                </button>
              )}
            </div>
            {webhookEdit && webhookEdit.levelId === dept.id && (
              <div style={{ margin: '0 20px 12px', padding: '10px 14px', background: T().badgeBg, borderRadius: 10, border: `1px solid ${T().badgeBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T().accent, marginBottom: 6 }}>Slack Webhook URL</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={webhookEdit.url} onChange={e => setWebhookEdit(prev => ({ ...prev, url: e.target.value }))} placeholder="https://hooks.slack.com/services/..."
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: `1px solid ${T().border}`, background: T().inputBg, color: T().inputText, fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
                  <button onClick={() => handleSaveWebhook(dept.id, webhookEdit.url)} style={{ padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: T().accentSolid, border: 'none', color: '#fff' }}>保存</button>
                  <button onClick={() => setWebhookEdit(null)} style={{ padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, background: 'transparent', border: `1px solid ${T().border}`, color: T().textMuted }}>取消</button>
                </div>
              </div>
            )}
            {dept.teams.length === 0
              ? <div style={{ padding: '20px', fontSize: 12, color: T().textFaintest, fontStyle: 'italic', background: T().bgCard }}>チームがありません</div>
              : (
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
                          {isEditing
                            ? <select value={metaBuf.status} onChange={e => setMetaBuf(p => ({ ...p, status: e.target.value }))} style={{ background: T().selectBg, border: `1px solid ${T().borderMid}`, borderRadius: 5, padding: '2px 6px', color: T().text, fontSize: 10, outline: 'none', fontFamily: 'inherit' }}>{STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                            : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0, background: sb.bg, color: sb.color, border: `1px solid ${sb.border}` }}>{sb.label}</span>
                          }
                        </div>
                        {isEditing
                          ? <div style={{ marginBottom: 10 }}>
                              <input value={metaBuf.desc_text} onChange={e => setMetaBuf(p => ({ ...p, desc_text: e.target.value }))} placeholder="チームの説明" style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '5px 8px', color: T().inputText, fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
                              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <button onClick={() => saveTeamMeta(team.id)} disabled={saving} style={{ padding: '3px 10px', borderRadius: 5, background: T().accentSolid, border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓ 保存</button>
                                <button onClick={() => setEditingMeta(null)} style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
                              </div>
                            </div>
                          : meta.desc_text && <p style={{ fontSize: 11, color: T().textFaint, margin: '0 0 10px', lineHeight: 1.5 }}>{meta.desc_text}</p>
                        }
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {teamMembers.map(m => (
                            <div key={m.id} onClick={() => onMemberClick(m.name)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: `${avatarColor(m.name)}18`, border: `1px solid ${avatarColor(m.name)}40`, fontSize: 11, fontWeight: 600, color: avatarColor(m.name), cursor: 'pointer', transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = `${avatarColor(m.name)}30`} onMouseLeave={e => e.currentTarget.style.background = `${avatarColor(m.name)}18`}>
                              <Avatar name={m.name} size={18} avatar_url={m.avatar_url} />{m.name}
                            </div>
                          ))}
                          {teamMembers.length === 0 && <span style={{ fontSize: 10, color: T().textFaintest, fontStyle: 'italic' }}>メンバーなし</span>}
                        </div>
                        {isAdmin && !isEditing && <button onClick={() => { setMetaBuf({ status: meta.status || 'active', desc_text: meta.desc_text || '' }); setEditingMeta(team.id) }} style={{ marginTop: 8, fontSize: 10, color: T().accent, background: 'transparent', border: `1px dashed ${T().badgeBorder}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>✎ チーム情報を編集</button>}
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
// タブ2: 業務一覧（TaskList）
// ══════════════════════════════════════════════════
function TaskHistoryModal({ task, history, onClose }) {
  const records = history.filter(h => h.task_id === task.id).sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
  const fmt = (dateStr) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:T().bgCard, border:`1px solid ${T().borderMid}`, borderRadius:14, padding:24, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', color:T().text }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:T().textFaint, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:4 }}>引き継ぎ履歴</div>
            <div style={{ fontSize:14, fontWeight:700, color:T().text, lineHeight:1.4 }}>{task.task}</div>
          </div>
          <button onClick={onClose} style={{ background:T().bgInput, border:'none', color:T().textMuted, width:28, height:28, borderRadius:'50%', cursor:'pointer', fontSize:15, flexShrink:0, marginLeft:12 }}>✕</button>
        </div>
        {records.length === 0
          ? <div style={{ textAlign:'center', padding:'32px 0', color:T().textFaintest, fontSize:13 }}><div style={{ fontSize:28, marginBottom:8 }}>📋</div>引き継ぎ履歴はまだありません</div>
          : (
            <div style={{ position:'relative', paddingLeft:24 }}>
              <div style={{ position:'absolute', left:7, top:8, bottom:8, width:2, background:T().border, borderRadius:1 }} />
              {records.map((r, i) => {
                const isLatest = i === records.length - 1
                return (
                  <div key={r.id} style={{ position:'relative', marginBottom:i < records.length - 1 ? 16 : 0 }}>
                    <div style={{ position:'absolute', left:-20, top:10, width:10, height:10, borderRadius:'50%', background:isLatest?T().accent:T().borderMid, border:`2px solid ${isLatest?T().accent:T().border}` }} />
                    <div style={{ background:T().bgCard2, border:`1px solid ${T().border}`, borderRadius:8, padding:'10px 14px' }}>
                      <div style={{ fontSize:10, color:T().textFaint, marginBottom:6 }}>{fmt(r.changed_at)}{r.changed_by ? ` · ${r.changed_by}` : ''}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        {r.from_owner ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5, background:`${avatarColor(r.from_owner)}15`, color:avatarColor(r.from_owner), fontSize:12, fontWeight:600 }}><Avatar name={r.from_owner} size={16} />{r.from_owner}</span> : <span style={{ fontSize:12, color:T().textFaintest, fontStyle:'italic' }}>（未設定）</span>}
                        <span style={{ color:T().accent, fontSize:14, fontWeight:700 }}>→</span>
                        {r.to_owner ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5, background:`${avatarColor(r.to_owner)}15`, color:avatarColor(r.to_owner), fontSize:12, fontWeight:600 }}><Avatar name={r.to_owner} size={16} />{r.to_owner}</span> : <span style={{ fontSize:12, color:T().textFaintest, fontStyle:'italic' }}>（未設定）</span>}
                      </div>
                      {r.note && <div style={{ fontSize:11, color:T().textMuted, marginTop:6, padding:'5px 8px', background:T().bgInput, borderRadius:5 }}>{r.note}</div>}
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
  const dragId = useRef(null)
  const dragOverId = useRef(null)
  const memberNames = members.map(m => m.name)

  const levelHierarchy = useMemo(() => {
    if (!levels || levels.length === 0) return null
    const roots = levels.filter(l => !l.parent_id)
    const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))
    const result = {}
    roots.forEach(root => {
      getChildren(root.id).forEach(dept => {
        result[dept.name] = {}
        const teams = getChildren(dept.id)
        if (teams.length === 0) { result[dept.name][dept.name] = dept.id }
        else { teams.forEach(team => { result[dept.name][team.name] = team.id }) }
      })
    })
    return result
  }, [levels])

  const matchTask = useCallback((t) => {
    if (!levelHierarchy) return { dept: t.dept, team: t.team }
    if (t.level_id) {
      for (const [deptName, teams] of Object.entries(levelHierarchy)) {
        for (const [teamName, levelId] of Object.entries(teams)) {
          if (Number(t.level_id) === Number(levelId)) return { dept: deptName, team: teamName }
        }
      }
    }
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
    for (const [deptName, teams] of Object.entries(levelHierarchy)) {
      if (t.dept === deptName || (t.dept && (t.dept.includes(deptName) || deptName.includes(t.dept)))) {
        const firstTeam = Object.keys(teams)[0]
        if (firstTeam) return { dept: deptName, team: firstTeam }
      }
    }
    return { dept: t.dept, team: t.team }
  }, [levelHierarchy])

  const allDepts = levelHierarchy ? Object.keys(levelHierarchy) : [...new Set(tasks.map(t => t.dept))]
  const allOwners = [...new Set(tasks.map(t => t.owner).filter(o => o && o !== '（未定）'))]
  const sortedTasks = [...tasks].sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id))
  const activeTasks = sortedTasks.filter(t => !t.is_archived)
  const archivedTasks = sortedTasks.filter(t => t.is_archived)
  const baseFiltered = showArchived ? archivedTasks : activeTasks
  const filtered = baseFiltered.filter(t => {
    const m = matchTask(t)
    return (!filterDept || m.dept === filterDept) && (!filterOwner || t.owner === filterOwner || (t.support && t.support.includes(filterOwner))) && (!query || t.task.includes(query) || m.team.includes(query))
  })

  const grouped = {}
  if (levelHierarchy && !filterOwner && !query) {
    Object.entries(levelHierarchy).forEach(([deptName, teams]) => {
      if (filterDept && deptName !== filterDept) return
      grouped[deptName] = {}
      Object.keys(teams).forEach(teamName => { grouped[deptName][teamName] = [] })
    })
  }
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
    if (upsertError) { alert('業務の保存に失敗しました: ' + upsertError.message); setSaving(false); return }
    const prevOwner = t.owner || null; const nextOwner = updated.owner || null
    if (prevOwner !== nextOwner) {
      const histRow = { task_id: t.id, from_owner: prevOwner, to_owner: nextOwner, changed_by: currentUser || null, note: '' }
      const { data: hist } = await supabase.from('org_task_history').insert(histRow).select().single()
      if (hist) setTaskHistory(prev => [...prev, hist])
    }
    setTasks(prev => prev.map(x => x.id === t.id ? updated : x))
    setSaving(false); setEditingId(null)
  }
  const deleteTask = async (t) => {
    if (!window.confirm(`「${t.task}」を削除しますか？`)) return
    const { error } = await supabase.from('org_tasks').delete().eq('id', t.id)
    if (error) { alert('業務の削除に失敗しました: ' + error.message); return }
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
    if (error) { alert('業務の追加に失敗しました: ' + error.message); setSaving(false); return }
    setTasks(prev => prev.some(t => t.id === data.id) ? prev : [...prev, data])
    setNewBuf({ task: '', owner: '', support: '' }); setAddingTeam(null); setSaving(false)
  }

  const handleDragStart = (e, taskId) => { dragId.current = taskId; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.5' }
  const handleDragEnd = (e) => { e.currentTarget.style.opacity = '1'; dragId.current = null; dragOverId.current = null }
  const handleDragOver = (e, taskId) => { e.preventDefault(); dragOverId.current = taskId }
  const handleDrop = async (e, dept, team) => {
    e.preventDefault()
    const fromId = dragId.current; const toId = dragOverId.current
    if (!fromId || !toId || fromId === toId) return
    const teamTasks = sortedTasks.filter(t => { const m = matchTask(t); return m.dept === dept && m.team === team })
    const fromIdx = teamTasks.findIndex(t => t.id === fromId); const toIdx = teamTasks.findIndex(t => t.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...teamTasks]; const [moved] = reordered.splice(fromIdx, 1); reordered.splice(toIdx, 0, moved)
    const updates = reordered.map((t, i) => ({ ...t, sort_order: i + 1 }))
    const matchedIds = new Set(teamTasks.map(t => t.id))
    setTasks(prev => { const others = prev.filter(t => !matchedIds.has(t.id)); return [...others, ...updates].sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id)) })
    await Promise.all(updates.map(t => supabase.from('org_tasks').update({ sort_order: t.sort_order }).eq('id', t.id)))
    dragId.current = null; dragOverId.current = null
  }
  const archiveTask = async (t) => { await supabase.from('org_tasks').update({ is_archived: true }).eq('id', t.id); setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_archived: true } : x)) }
  const restoreTask = async (t) => { await supabase.from('org_tasks').update({ is_archived: false }).eq('id', t.id); setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_archived: false } : x)) }

  const sel = { background: T().selectBg, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: T().text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }

  if (orgTableError) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#c0392b', background:'#fdf0ef', border:'1px dashed #e74c3c', borderRadius:14 }}>
      <div style={{ fontSize:36, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:15, fontWeight:700 }}>org_tasks テーブルの読み込みに失敗しました</div>
      <div style={{ fontSize:13, marginTop:8, color:'#7f3b3b', lineHeight:1.6 }}>Supabase SQL Editor で supabase_setup.sql を実行してテーブルを作成してください。</div>
    </div>
  )

  return (
    <div>
      <div style={{ background:T().bgCard, border:`1px solid ${T().border}`, borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:T().textFaint }}>フィルター</span>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={sel}><option value="">事業部：すべて</option>{allDepts.map(d => <option key={d} value={d}>{d}</option>)}</select>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={sel}><option value="">担当者：すべて</option>{allOwners.map(o => <option key={o} value={o}>{o}</option>)}</select>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 業務・チームで検索..." style={{ ...sel, width: 200 }} onFocus={e => e.target.style.borderColor = T().accent} onBlur={e => e.target.style.borderColor = T().border}/>
        <span style={{ fontSize:11, color:T().textFaint, marginLeft:'auto' }}>{filtered.length}件</span>
        <button onClick={() => setShowArchived(p => !p)} style={{ padding:'4px 12px', borderRadius:6, border:`1px solid ${showArchived?T().warn:T().border}`, background:showArchived?T().warnBg:'transparent', color:showArchived?T().warn:T().textMuted, fontSize:11, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>{showArchived ? '📦 アーカイブ表示中' : `📦 アーカイブ (${archivedTasks.length})`}</button>
        {isAdmin && !showArchived && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:T().warnBg, color:T().warn, border:`1px solid ${T().warn}`, fontWeight:700 }}>👑 管理者モード　⠿ドラッグで並び替え可</span>}
        {(filterDept || filterOwner || query) && <button onClick={() => { setFilterDept(''); setFilterOwner(''); setQuery('') }} style={{ ...sel, color:T().accent, border:`1px solid ${T().badgeBorder}` }}>クリア</button>}
      </div>

      {Object.entries(grouped).map(([dept, teams]) => {
        const color = getDeptColor(dept)
        return (
          <div key={dept} style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, padding:'8px 14px', background:`${color}12`, border:`1px solid ${color}55`, borderRadius:8, borderLeft:`4px solid ${color}` }}>
              <span style={{ fontSize:14, fontWeight:700, color }}>{dept}</span>
            </div>
            {Object.entries(teams).map(([team, teamTasks]) => {
              const isAddingHere = addingTeam?.dept === dept && addingTeam?.team === team
              return (
                <div key={team} style={{ marginBottom:16, marginLeft:8 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T().textMuted, marginBottom:8 }}>└ {team}</div>
                  <div style={{ border:`1px solid ${T().border}`, borderRadius:8, background:T().bgCard, position:'relative' }} onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, dept, team)}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:T().bgTable }}>
                          {isAdmin && <th style={{ width:24, borderBottom:`1px solid ${T().border}` }} />}
                          <th style={{ padding:'7px 12px', textAlign:'left', fontSize:10, color:T().textFaint, width:110, borderBottom:`1px solid ${T().border}` }}>責任者</th>
                          <th style={{ padding:'7px 12px', textAlign:'left', fontSize:10, color:T().textFaint, borderBottom:`1px solid ${T().border}` }}>業務内容</th>
                          <th style={{ padding:'7px 12px', textAlign:'left', fontSize:10, color:T().textFaint, width:120, borderBottom:`1px solid ${T().border}` }}>担当（サポート）</th>
                          {isAdmin && <th style={{ width:80, borderBottom:`1px solid ${T().border}` }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {teamTasks.map((t, i) => {
                          const isEditing = editingId === t.id
                          const ownerColor = avatarColor(t.owner)
                          return (
                            <tr key={t.id} draggable={isAdmin && !isEditing && !showArchived} onDragStart={isAdmin && !showArchived ? e => handleDragStart(e, t.id) : undefined} onDragEnd={isAdmin && !showArchived ? handleDragEnd : undefined} onDragOver={isAdmin && !showArchived ? e => handleDragOver(e, t.id) : undefined}
                              style={{ borderBottom:i<teamTasks.length-1?`1px solid ${T().border}`:'none', background:isEditing?T().bgHover:showArchived?T().bgHover:'transparent', cursor:isAdmin&&!isEditing&&!showArchived?'grab':'default', opacity:showArchived?0.75:1 }}>
                              {isAdmin && <td style={{ padding:'0 4px 0 8px', color:T().textFaintest, fontSize:14, userSelect:'none', cursor:'grab' }}>⠿</td>}
                              <td style={{ padding:'8px 12px' }}>
                                {isEditing
                                  ? <select value={editBuf.owner ?? t.owner} onChange={e => setEditBuf(b => ({ ...b, owner: e.target.value }))} style={{ width:'100%', background:T().inputBg, border:`1px solid ${T().borderEdit}`, borderRadius:5, padding:'4px 6px', color:T().inputText, fontSize:11, outline:'none', fontFamily:'inherit' }}><option value="">（未定）</option>{memberNames.map(n => <option key={n} value={n}>{n}</option>)}</select>
                                  : t.owner && t.owner !== '（未定）'
                                    ? <span onClick={() => onMemberClick(t.owner)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:6, background:`${ownerColor}18`, color:ownerColor, fontSize:11, fontWeight:600, cursor:'pointer' }}><Avatar name={t.owner} size={16} />{t.owner}</span>
                                    : <span style={{ fontSize:11, color:T().textFaintest }}>{t.owner || '（未定）'}</span>
                                }
                              </td>
                              <td style={{ padding:'8px 12px' }}>
                                {isEditing
                                  ? <InlineInput value={editBuf.task ?? t.task} onChange={v => setEditBuf(b => ({ ...b, task: v }))} />
                                  : <span style={{ fontSize:12, color:T().textSub, lineHeight:1.5 }}>{t.task}</span>
                                }
                              </td>
                              <td style={{ padding:'8px 12px' }}>
                                {isEditing
                                  ? <SupportSelect value={editBuf.support ?? t.support ?? ''} onChange={v => setEditBuf(b => ({ ...b, support: v }))} memberNames={memberNames.filter(n => n !== (editBuf.owner ?? t.owner))} />
                                  : t.support ? <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>{t.support.split('・').filter(Boolean).map(n => <span key={n} style={{ fontSize:11, color:T().textFaint, padding:'2px 7px', background:T().bgInput, borderRadius:5 }}>{n}</span>)}</div> : null
                                }
                              </td>
                              {isAdmin && (
                                <td style={{ padding:'6px 10px', textAlign:'right' }}>
                                  {isEditing
                                    ? <div style={{ display:'flex', gap:4 }}><button onClick={() => saveEdit(t)} style={{ padding:'3px 10px', borderRadius:5, background:T().accentSolid, border:'none', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer' }}>✓</button><button onClick={() => setEditingId(null)} style={{ padding:'3px 8px', borderRadius:5, background:'transparent', border:`1px solid ${T().borderMid}`, color:T().textMuted, fontSize:10, cursor:'pointer' }}>✕</button></div>
                                    : showArchived
                                      ? <div style={{ display:'flex', gap:4 }}><button onClick={() => restoreTask(t)} style={{ padding:'3px 10px', borderRadius:5, background:T().badgeBg, border:`1px solid ${T().badgeBorder}`, color:T().accent, fontSize:10, fontWeight:700, cursor:'pointer' }}>↩ 復元</button><button onClick={() => deleteTask(t)} style={{ padding:'3px 8px', borderRadius:5, background:T().warnBg, border:`1px solid ${T().warn}`, color:T().warn, fontSize:10, cursor:'pointer' }}>✕</button></div>
                                      : <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                                          {taskHistory.filter(h => h.task_id === t.id).length > 0 && <button onClick={() => setHistoryTask(t)} style={{ padding:'3px 8px', borderRadius:5, background:T().badgeBg, border:`1px solid ${T().badgeBorder}`, color:T().accent, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>🔄 {taskHistory.filter(h => h.task_id === t.id).length}</button>}
                                          <button onClick={() => { setEditingId(t.id); setEditBuf({ owner:t.owner||'', task:t.task||'', support:t.support||'' }) }} style={{ padding:'3px 8px', borderRadius:5, background:T().badgeBg, border:`1px solid ${T().badgeBorder}`, color:T().accent, fontSize:10, cursor:'pointer' }}>✎</button>
                                          <button onClick={() => archiveTask(t)} style={{ padding:'3px 8px', borderRadius:5, background:T().warnBg, border:`1px solid ${T().warn}`, color:T().warn, fontSize:10, cursor:'pointer' }}>📦</button>
                                          <button onClick={() => deleteTask(t)} style={{ padding:'3px 8px', borderRadius:5, background:T().warnBg, border:`1px solid ${T().warn}`, color:T().warn, fontSize:10, cursor:'pointer' }}>✕</button>
                                        </div>
                                  }
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        {isAdmin && isAddingHere && (
                          <tr style={{ background:T().bgHover, borderTop:`1px dashed ${T().badgeBorder}` }}>
                            {isAdmin && <td />}
                            <td style={{ padding:'8px 12px' }}><select value={newBuf.owner} onChange={e => setNewBuf(b => ({ ...b, owner: e.target.value }))} style={{ width:'100%', background:T().inputBg, border:`1px solid ${T().badgeBorder}`, borderRadius:5, padding:'4px 6px', color:T().inputText, fontSize:11, outline:'none', fontFamily:'inherit' }}><option value="">（未定）</option>{memberNames.map(n => <option key={n} value={n}>{n}</option>)}</select></td>
                            <td style={{ padding:'8px 12px' }}><InlineInput value={newBuf.task} onChange={v => setNewBuf(b => ({ ...b, task: v }))} placeholder="業務内容" style={{ borderColor:T().badgeBorder }} /></td>
                            <td style={{ padding:'8px 12px' }}><SupportSelect value={newBuf.support} onChange={v => setNewBuf(b => ({ ...b, support: v }))} memberNames={memberNames.filter(n => n !== newBuf.owner)} borderColor={T().badgeBorder} /></td>
                            <td style={{ padding:'6px 10px', textAlign:'right' }}><div style={{ display:'flex', gap:4 }}><button onClick={() => addTask(dept, team)} disabled={saving} style={{ padding:'3px 10px', borderRadius:5, background:T().accentSolid, border:'none', color:'#fff', fontSize:10, fontWeight:700, cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}>{saving?'追加中...':'追加'}</button><button onClick={() => { setAddingTeam(null); setNewBuf({ task:'', owner:'', support:'' }) }} style={{ padding:'3px 8px', borderRadius:5, background:'transparent', border:`1px solid ${T().borderMid}`, color:T().textMuted, fontSize:10, cursor:'pointer' }}>✕</button></div></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {isAdmin && !isAddingHere && !showArchived && (
                      <div onClick={() => { setAddingTeam({ dept, team }); setNewBuf({ task:'', owner:'', support:'' }) }} style={{ padding:'8px 12px', fontSize:11, color:T().accent, cursor:'pointer', background:T().bgHover, borderTop:`1px dashed ${T().badgeBorder}`, display:'flex', alignItems:'center', gap:5 }}>＋ 業務を追加</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      {historyTask && <TaskHistoryModal task={historyTask} history={taskHistory} onClose={() => setHistoryTask(null)} />}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ3: 業務マニュアル（ManualTab）
// ══════════════════════════════════════════════════
function ManualTab({ tasks, manuals, setManuals, members, levels, isAdmin, currentUser, teamMeta }) {
  // ── state ─────────────────────────────────────────────────
  const [selectedId,  setSelectedId]  = useState(null)
  const [phases,      setPhases]      = useState([])   // org_manual_phases rows
  const [steps,       setSteps]       = useState({})   // phaseId → steps[]
  const [loadingDB,   setLoadingDB]   = useState(false)
  const [dbError,     setDbError]     = useState(null)
  const [editMode,    setEditMode]    = useState(false)
  const [dirty,       setDirty]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [savedFlash,  setSavedFlash]  = useState(false)
  const [expandedStep,setExpandedStep]= useState(null)  // "pi-si"
  const [query,       setQuery]       = useState('')

  // ── team hierarchy ─────────────────────────────────────────
  const roots = levels.filter(l => !l.parent_id)
  const getKids = id => levels.filter(l => Number(l.parent_id) === Number(id))

  const allTeams = useMemo(() => {
    const list = []
    roots.forEach(root => {
      getKids(root.id).forEach(dept => {
        const teams = getKids(dept.id)
        if (teams.length > 0) teams.forEach(t => list.push({ dept, team: t }))
        else list.push({ dept, team: dept })
      })
    })
    return list
  }, [levels])

  const filteredTeams = useMemo(() => {
    if (!query) return allTeams
    return allTeams.filter(({ dept, team }) =>
      dept.name.includes(query) || team.name.includes(query)
    )
  }, [allTeams, query])

  const groupedTeams = useMemo(() => {
    const g = {}
    filteredTeams.forEach(({ dept, team }) => {
      if (!g[dept.id]) g[dept.id] = { dept, teams: [] }
      g[dept.id].teams.push(team)
    })
    return Object.values(g)
  }, [filteredTeams])

  const selLevel = selectedId ? levels.find(l => Number(l.id) === Number(selectedId)) : null
  const selItem  = selectedId ? allTeams.find(i => Number(i.team.id) === Number(selectedId)) : null
  const deptAccent = selItem ? getDeptColor(selItem.dept.name) : T().accent

  // ── DB load ────────────────────────────────────────────────
  const loadManual = useCallback(async (levelId) => {
    setLoadingDB(true); setDbError(null)
    try {
      const { data: phData, error: pe } = await supabase
        .from('org_manual_phases')
        .select('*')
        .eq('level_id', levelId)
        .order('sort_order')
      if (pe) throw new Error(pe.message)

      const phRows = phData || []
      setPhases(phRows)

      if (phRows.length > 0) {
        const { data: stData, error: se } = await supabase
          .from('org_manual_steps')
          .select('*')
          .in('phase_id', phRows.map(p => p.id))
          .order('sort_order')
        if (se) throw new Error(se.message)
        const map = {}
        phRows.forEach(p => { map[p.id] = [] })
        ;(stData || []).forEach(s => { if (map[s.phase_id]) map[s.phase_id].push(s) })
        setSteps(map)
      } else {
        setSteps({})
      }
    } catch(e) { setDbError(e.message) }
    setLoadingDB(false)
  }, [])

  useEffect(() => {
    if (selectedId) { setEditMode(false); setDirty(false); setExpandedStep(null); loadManual(selectedId) }
  }, [selectedId])

  // ── concept steps (from phase titles) ──────────────────────
  const conceptSteps = useMemo(() => phases.flatMap(ph =>
    (steps[ph.id] || []).map(s => ({ title: s.title, badgeClass: ph.badge_class }))
  ), [phases, steps])

  // ── save all ───────────────────────────────────────────────
  const saveAll = async () => {
    if (!selectedId) return
    setSaving(true); setDbError(null)
    try {
      // delete old
      const oldIds = phases.map(p => p.id)
      if (oldIds.length > 0) {
        await supabase.from('org_manual_phases').delete().in('id', oldIds)
      }
      // re-insert phases + steps
      for (let pi = 0; pi < phases.length; pi++) {
        const ph = phases[pi]
        const { data: ins, error: pe } = await supabase
          .from('org_manual_phases')
          .insert({ level_id: selectedId, sort_order: pi, badge: ph.badge, badge_class: ph.badge_class, title: ph.title })
          .select('id').single()
        if (pe) throw new Error(pe.message)
        const phSteps = steps[ph.id] || []
        if (phSteps.length > 0) {
          const rows = phSteps.map((s, si) => ({
            phase_id: ins.id, sort_order: si,
            title: s.title||'', owner: s.owner||'', tool: s.tool||'',
            urls: s.urls||[], condition: s.condition||'', caution: s.caution||''
          }))
          const { error: se } = await supabase.from('org_manual_steps').insert(rows)
          if (se) throw new Error(se.message)
        }
      }
      await loadManual(selectedId)
      setDirty(false); setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch(e) { setDbError(e.message) }
    setSaving(false)
  }

  // ── mutations ──────────────────────────────────────────────
  const mut = (fn) => { fn(); setDirty(true) }

  const updatePhase = (pi, field, val) =>
    mut(() => setPhases(prev => prev.map((p, i) => i === pi ? { ...p, [field]: val } : p)))

  const addPhase = () =>
    mut(() => setPhases(prev => [...prev, { id: `new_${Date.now()}`, level_id: selectedId, sort_order: prev.length, badge: '新フェーズ', badge_class: 'operate', title: 'フェーズ名を入力' }]))

  const deletePhase = (pi) => {
    if (!confirm(`「${phases[pi].badge}」を削除しますか？`)) return
    const pid = phases[pi].id
    mut(() => {
      setPhases(prev => prev.filter((_, i) => i !== pi))
      setSteps(prev => { const n = {...prev}; delete n[pid]; return n })
    })
  }

  const updateStep = (phaseId, si, field, val) =>
    mut(() => setSteps(prev => ({
      ...prev,
      [phaseId]: (prev[phaseId]||[]).map((s, i) => i === si ? {...s, [field]: val} : s)
    })))

  const addStep = (phaseId) =>
    mut(() => setSteps(prev => ({
      ...prev,
      [phaseId]: [...(prev[phaseId]||[]), { id: `ns_${Date.now()}`, phase_id: phaseId, sort_order: (prev[phaseId]||[]).length, title: '新しいステップ', owner: '', tool: '', urls: [], condition: '', caution: '' }]
    })))

  const deleteStep = (phaseId, si) => {
    const title = (steps[phaseId]||[])[si]?.title || ''
    if (!confirm(`「${title}」を削除しますか？`)) return
    mut(() => setSteps(prev => ({
      ...prev,
      [phaseId]: (prev[phaseId]||[]).filter((_, i) => i !== si)
    })))
  }

  const updateUrl = (phaseId, si, ui, field, val) =>
    mut(() => {
      const phSteps = [...(steps[phaseId]||[])]
      const s = {...phSteps[si]}; const urls = [...(s.urls||[])]
      urls[ui] = {...urls[ui], [field]: val}
      s.urls = urls; phSteps[si] = s
      setSteps(prev => ({...prev, [phaseId]: phSteps}))
    })

  const addUrl = (phaseId, si) =>
    mut(() => {
      const phSteps = [...(steps[phaseId]||[])]
      const s = {...phSteps[si]}
      s.urls = [...(s.urls||[]), {label:'', href:''}]
      phSteps[si] = s
      setSteps(prev => ({...prev, [phaseId]: phSteps}))
    })

  const deleteUrl = (phaseId, si, ui) =>
    mut(() => {
      const phSteps = [...(steps[phaseId]||[])]
      const s = {...phSteps[si]}
      s.urls = (s.urls||[]).filter((_,i) => i !== ui)
      phSteps[si] = s
      setSteps(prev => ({...prev, [phaseId]: phSteps}))
    })

  // ── styles ─────────────────────────────────────────────────
  const S = {
    // sidebar
    sidebar: {
      width: 220, flexShrink: 0, background: '#17150E',
      borderRight: `1px solid rgba(255,255,255,0.08)`,
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
    },
    searchWrap: { padding: '12px 12px 8px' },
    searchInput: {
      width: '100%', boxSizing: 'border-box',
      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 7, padding: '6px 10px 6px 28px', color: '#fff',
      fontSize: 11, outline: 'none', fontFamily: 'inherit',
    },
    deptLabel: (color) => ({
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.1em', textTransform: 'uppercase', color,
    }),
    teamLink: (active) => ({
      display: 'block', padding: '7px 14px 7px 26px',
      fontSize: 12, cursor: 'pointer',
      color: active ? '#fff' : 'rgba(255,255,255,0.45)',
      fontWeight: active ? 700 : 400,
      background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
      borderLeft: `3px solid ${active ? '#B89240' : 'transparent'}`,
      transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }),
    // main
    main: { flex: 1, overflowY: 'auto', background: T().bg },
    wrap: { maxWidth: 820, margin: '0 auto', padding: '32px 28px 80px' },
    // hero
    hero: (accent, accentBg) => ({
      borderLeft: `5px solid ${accent}`,
      background: accentBg, borderRadius: 12,
      padding: '24px 28px', marginBottom: 28,
    }),
    heroTag: (color) => ({
      fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
      textTransform: 'uppercase', color, marginBottom: 6,
    }),
    heroTitle: { fontFamily: 'inherit', fontSize: 22, fontWeight: 800, marginBottom: 8, color: T().text },
    heroDesc: { fontSize: 13, color: T().textSub, lineHeight: 1.8 },
    // section label
    secLabel: {
      fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
      textTransform: 'uppercase', color: T().textMuted,
      marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
    },
    secLabelLine: { flex: 1, height: 1, background: T().border },
    // concept flow
    conceptFlow: {
      background: T().bgCard, border: `1px solid ${T().border}`,
      borderRadius: 12, padding: '18px 22px', marginBottom: 28, overflowX: 'auto',
    },
    conceptRow: { display: 'flex', alignItems: 'center', minWidth: 'max-content' },
    conceptStep: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 92, padding: '4px 2px' },
    conceptNum: (color) => ({ width: 28, height: 28, borderRadius: '50%', background: color, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, flexShrink: 0 }),
    conceptName: { fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: T().textSub },
    conceptArrow: { fontSize: 15, color: T().textFaint, padding: '0 2px', paddingBottom: 16 },
    // phase
    phaseBlock: { marginBottom: 32 },
    phaseHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
    badge: (cls) => {
      const isOnboard = cls === 'onboard'
      return {
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        padding: '4px 13px', borderRadius: 20, whiteSpace: 'nowrap',
        background: isOnboard ? '#EAF3EF' : '#FBF0E6',
        color: isOnboard ? '#3D7A6A' : '#B86B30',
      }
    },
    phaseTitle: { fontSize: 16, fontWeight: 700, color: T().text },
    // step card
    stepCard: (expanded) => ({
      background: T().bgCard, border: `1px solid ${expanded ? deptAccent + '40' : T().border}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden',
      boxShadow: expanded ? '0 4px 14px rgba(0,0,0,0.07)' : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s', position: 'relative',
    }),
    stepHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', userSelect: 'none' },
    stepNum: (accent) => ({ width: 24, height: 24, borderRadius: 7, background: accent, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),
    stepTitle: { fontSize: 13, fontWeight: 700, color: T().text, flex: 1 },
    stepArrow: (open) => ({ fontSize: 10, color: T().textFaint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }),
    // detail
    stepDetail: { padding: '0 16px 16px 52px', borderTop: `1px solid ${T().border}`, paddingTop: 14 },
    detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 12 },
    detailLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T().textMuted, marginBottom: 4 },
    detailValue: { fontSize: 12, color: T().text, background: T().bgCard2, borderRadius: 6, padding: '6px 9px', minHeight: 30 },
    conditionBox: { background: '#EAF3EF', border: '1px solid #3D7A6A', borderRadius: 8, padding: '9px 12px', marginBottom: 8 },
    conditionLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3D7A6A', marginBottom: 3 },
    cautionBox: { background: '#FFF8F0', border: '1px solid #E8C49A', borderRadius: 8, padding: '9px 12px' },
    cautionLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#B86B30', marginBottom: 3 },
    // url chip
    urlChip: { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 9px', fontSize: 11, color: '#2563EB', textDecoration: 'none', fontWeight: 500 },
    // edit inline input
    editInp: (multiline) => ({
      width: '100%', boxSizing: 'border-box',
      background: T().bgInput, border: `1px solid ${T().editRing}55`,
      borderRadius: 5, padding: '5px 8px', color: T().text,
      fontSize: 12, outline: 'none', fontFamily: 'inherit',
      resize: multiline ? 'vertical' : 'none',
      ...(multiline ? { minHeight: 50, lineHeight: 1.6 } : {})
    }),
    editBadgeSel: { background: T().bgInput, border: `1px solid ${T().borderMid}`, borderRadius: 5, padding: '4px 7px', color: T().text, fontSize: 11, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
    addDashedBtn: { width: '100%', padding: '8px', marginTop: 4, background: 'none', border: `1.5px dashed ${T().border}`, borderRadius: 9, cursor: 'pointer', color: T().textMuted, fontSize: 12, fontFamily: 'inherit', transition: '0.2s', display: 'block' },
    delBtn: { padding: '3px 8px', borderRadius: 5, border: `1px solid ${T().warn}`, background: T().warnBg, color: T().warn, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' },
  }

  // ── empty state ────────────────────────────────────────────
  const renderEmpty = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: T().textFaint, padding: 40 }}>
      <div style={{ fontSize: 48 }}>📖</div>
      <div style={{ fontSize: 15, color: T().textMuted }}>左のチームを選んでください</div>
      <div style={{ fontSize: 12 }}>チームごとの業務フロー・マニュアルが確認できます</div>
    </div>
  )

  // ── step card renderer ─────────────────────────────────────
  const renderStepCard = (ph, pi, step, si) => {
    const key = `${pi}-${si}`
    const expanded = expandedStep === key
    const phaseAccent = ph.badge_class === 'onboard' ? '#3D7A6A' : deptAccent

    return (
      <div key={si} style={S.stepCard(expanded)}>
        {/* header */}
        <div style={S.stepHead} onClick={() => setExpandedStep(expanded ? null : key)}>
          <div style={S.stepNum(phaseAccent)}>{si + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editMode
              ? <input value={step.title} onChange={e => updateStep(ph.id, si, 'title', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{...S.editInp(false), fontSize: 13, fontWeight: 700}} />
              : <span style={S.stepTitle}>{step.title || '（タイトル未入力）'}</span>
            }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!expanded && (step.urls||[]).filter(u=>u.href).length > 0 && (
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#EFF6FF', color: '#2563EB', fontWeight: 700, border: '1px solid #BFDBFE' }}>🔗{(step.urls||[]).filter(u=>u.href).length}</span>
            )}
            {editMode && (
              <button onClick={e => { e.stopPropagation(); deleteStep(ph.id, si) }}
                style={{ ...S.delBtn, fontSize: 9 }}>✕</button>
            )}
            <span style={S.stepArrow(expanded)}>▼</span>
          </div>
        </div>

        {/* detail */}
        {expanded && (
          <div style={S.stepDetail}>
            <div style={S.detailGrid}>
              {/* 担当者 */}
              <div>
                <div style={S.detailLabel}>担当者</div>
                {editMode
                  ? <input value={step.owner} onChange={e => updateStep(ph.id, si, 'owner', e.target.value)} style={S.editInp(false)} />
                  : <div style={S.detailValue}>{step.owner || <span style={{color:T().textFaint,fontStyle:'italic'}}>未設定</span>}</div>
                }
              </div>
              {/* ツール + URL */}
              <div>
                <div style={S.detailLabel}>使用ツール・場所</div>
                {editMode
                  ? <input value={step.tool} onChange={e => updateStep(ph.id, si, 'tool', e.target.value)} style={S.editInp(false)} />
                  : <div style={S.detailValue}>{step.tool || <span style={{color:T().textFaint,fontStyle:'italic'}}>未設定</span>}</div>
                }
                {/* URL chips */}
                {!editMode && (step.urls||[]).filter(u=>u.href).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {(step.urls||[]).filter(u=>u.href).map((u, ui) => (
                      <a key={ui} href={u.href} target="_blank" rel="noopener noreferrer" style={S.urlChip} onClick={e=>e.stopPropagation()}>
                        <span style={{fontSize:9}}>🔗</span>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{u.label||u.href}</span>
                      </a>
                    ))}
                  </div>
                )}
                {/* URL edit */}
                {editMode && (
                  <div style={{ marginTop: 6 }}>
                    {(step.urls||[]).map((u, ui) => (
                      <div key={ui} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '5px 8px', marginTop: 4 }}>
                        <input type="text" value={u.label} placeholder="表示名" onChange={e => updateUrl(ph.id, si, ui, 'label', e.target.value)}
                          style={{ width: 80, flexShrink: 0, background: 'transparent', border: 'none', borderBottom: '1px dashed #BFDBFE', color: '#2563EB', fontSize: 11, fontWeight: 600, outline: 'none', fontFamily: 'inherit' }} />
                        <span style={{color:T().textMuted,fontSize:9,flexShrink:0}}>→</span>
                        <input type="url" value={u.href} placeholder="https://..." onChange={e => updateUrl(ph.id, si, ui, 'href', e.target.value)}
                          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', borderBottom: '1px dashed #BFDBFE', color: T().textSub, fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
                        <button onClick={() => deleteUrl(ph.id, si, ui)}
                          style={{ background: 'none', border: 'none', color: T().textFaint, cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => addUrl(ph.id, si)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, background: 'none', border: `1px dashed ${T().borderMid}`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer', color: T().textMuted, fontSize: 11, fontFamily: 'inherit' }}>
                      ＋ URLを追加
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 完了条件 */}
            <div style={S.conditionBox}>
              <div style={S.conditionLabel}>✅ 完了条件</div>
              {editMode
                ? <textarea value={step.condition} onChange={e => updateStep(ph.id, si, 'condition', e.target.value)} rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', color: '#17150E', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.65 }} />
                : <div style={{ fontSize: 12, color: '#17150E', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{step.condition || <span style={{color:'#999',fontStyle:'italic'}}>未入力</span>}</div>
              }
            </div>

            {/* 注意点 */}
            {(step.caution || editMode) && (
              <div style={S.cautionBox}>
                <div style={S.cautionLabel}>⚠️ 注意点</div>
                {editMode
                  ? <textarea value={step.caution} onChange={e => updateStep(ph.id, si, 'caution', e.target.value)} rows={2} placeholder="（任意）特記事項"
                      style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', color: '#57524A', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.65 }} />
                  : <div style={{ fontSize: 12, color: '#57524A', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{step.caution}</div>
                }
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── main render ────────────────────────────────────────────
  const metaDesc = selLevel ? (teamMeta?.[selectedId]?.desc_text || '') : ''
  const accentBg = selItem ? (selItem.dept.name.includes('コミュニティ') ? '#EAF3EF' : selItem.dept.name.includes('ユース') ? '#EFEBF8' : selItem.dept.name.includes('パートナー') ? '#FBF0E6' : '#E6EFF8') : T().bgCard

  // tasks for this team
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
    <div style={{ display: 'flex', height: '100%', background: T().bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif' }}>

      {/* ── SIDEBAR ── */}
      <div style={S.sidebar}>
        {/* search */}
        <div style={S.searchWrap}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>🔍</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="チームを検索..."
              style={S.searchInput} />
          </div>
        </div>

        {/* team list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 20px' }}>
          {groupedTeams.map(({ dept, teams }) => {
            const dc = getDeptColor(dept.name)
            return (
              <div key={dept.id} style={{ marginBottom: 4 }}>
                <div style={S.deptLabel(dc)}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dc, flexShrink: 0 }} />
                  {dept.name}
                </div>
                {teams.map(team => {
                  const isAct = Number(selectedId) === Number(team.id)
                  return (
                    <div key={team.id} onClick={() => setSelectedId(team.id)}
                      style={S.teamLink(isAct)}
                      onMouseEnter={e => { if (!isAct) { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}}
                      onMouseLeave={e => { if (!isAct) { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'transparent' }}}>
                      {team.icon} {team.name}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {groupedTeams.length === 0 && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '20px 14px', fontStyle: 'italic' }}>チームが見つかりません</div>
          )}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={S.main}>
        {!selLevel && !loadingDB && renderEmpty()}
        {loadingDB && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: T().accent, fontSize: 14 }}>読み込み中...</div>
        )}

        {dbError && (
          <div style={{ margin: 24, padding: '14px 18px', background: T().warnBg, border: `1px solid ${T().warn}`, borderRadius: 10, color: T().warn, fontSize: 12 }}>
            <b>DBエラー:</b> {dbError}
            <button onClick={() => loadManual(selectedId)} style={{ marginLeft: 10, padding: '3px 10px', borderRadius: 5, background: T().accent, border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer' }}>再読み込み</button>
          </div>
        )}

        {selLevel && !loadingDB && !dbError && (
          <div style={S.wrap}>

            {/* ─ ヘッダー ─ */}
            <div style={S.hero(deptAccent, accentBg)}>
              <div style={S.heroTag(deptAccent)}>{selItem?.dept?.name}</div>
              <h1 style={S.heroTitle}>{selLevel.icon} {selLevel.name}</h1>
              {metaDesc && <p style={S.heroDesc}>{metaDesc}</p>}
            </div>

            {/* ─ 編集バー ─ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {isAdmin && (
                <button onClick={() => setEditMode(p => !p)}
                  style={{ padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: editMode ? T().editRing : T().bgCard, border: `1px solid ${editMode ? T().editRing : T().borderMid}`, color: editMode ? '#fff' : T().textSub, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: editMode ? '#fff' : T().textFaint }} />
                  {editMode ? '編集中...' : '✎ 編集モード'}
                </button>
              )}
              {dirty && (
                <>
                  <button onClick={saveAll} disabled={saving}
                    style={{ padding: '6px 16px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: T().accentSolid, border: 'none', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                    {saving ? '保存中...' : '保存する'}
                  </button>
                  <button onClick={() => { if (confirm('変更を破棄しますか？')) loadManual(selectedId) }}
                    style={{ padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted }}>
                    元に戻す
                  </button>
                </>
              )}
              {editMode && (
                <span style={{ fontSize: 11, color: T().editRing, marginLeft: 4 }}>テキストを直接編集できます</span>
              )}
            </div>

            {/* ─ 概念フロー ─ */}
            {conceptSteps.length > 0 && (
              <>
                <div style={S.secLabel}><span>全体の流れ（概念）</span><span style={S.secLabelLine} /></div>
                <div style={S.conceptFlow}>
                  <div style={S.conceptRow}>
                    {conceptSteps.map((cs, i) => (
                      <React.Fragment key={i}>
                        <div style={S.conceptStep}>
                          <div style={S.conceptNum(cs.badgeClass === 'onboard' ? '#3D7A6A' : deptAccent)}>{i + 1}</div>
                          <span style={S.conceptName}>{cs.title}</span>
                        </div>
                        {i < conceptSteps.length - 1 && <span style={S.conceptArrow}>→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ─ フェーズ ─ */}
            {phases.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={S.secLabel}><span>業務フロー</span><span style={S.secLabelLine} /></div>
                {phases.map((ph, pi) => {
                  const phSteps = steps[ph.id] || []
                  return (
                    <div key={ph.id} style={S.phaseBlock}>
                      {/* phase header */}
                      <div style={S.phaseHeader}>
                        {editMode ? (
                          <>
                            <select value={ph.badge_class} onChange={e => updatePhase(pi, 'badge_class', e.target.value)} style={S.editBadgeSel}>
                              <option value="onboard">入会フェーズ（緑）</option>
                              <option value="operate">運用フェーズ（オレンジ）</option>
                            </select>
                            <input value={ph.badge} onChange={e => updatePhase(pi, 'badge', e.target.value)}
                              style={{ ...S.editInp(false), width: 120, flexShrink: 0 }} placeholder="バッジ名" />
                            <input value={ph.title} onChange={e => updatePhase(pi, 'title', e.target.value)}
                              style={{ ...S.editInp(false), flex: 1, fontSize: 15, fontWeight: 700 }} placeholder="フェーズタイトル" />
                            <button onClick={() => deletePhase(pi)} style={{ ...S.delBtn, marginLeft: 'auto', whiteSpace: 'nowrap' }}>✕ フェーズ削除</button>
                          </>
                        ) : (
                          <>
                            <span style={S.badge(ph.badge_class)}>{ph.badge}</span>
                            <span style={S.phaseTitle}>{ph.title}</span>
                          </>
                        )}
                      </div>
                      {/* steps */}
                      {phSteps.map((step, si) => renderStepCard(ph, pi, step, si))}
                      {editMode && (
                        <button style={S.addDashedBtn} onClick={() => addStep(ph.id)}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = T().editRing; e.currentTarget.style.color = T().editRing }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = T().border; e.currentTarget.style.color = T().textMuted }}>
                          ＋ ステップを追加
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ─ フェーズ追加ボタン ─ */}
            {editMode && (
              <button style={{ ...S.addDashedBtn, marginBottom: 32 }} onClick={addPhase}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T().editRing; e.currentTarget.style.color = T().editRing }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T().border; e.currentTarget.style.color = T().textMuted }}>
                ＋ フェーズを追加
              </button>
            )}

            {/* ─ フェーズ0件 ─ */}
            {phases.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: `1px dashed ${T().border}`, borderRadius: 12, marginBottom: 28, color: T().textFaint }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 14, color: T().textMuted, marginBottom: 6 }}>業務フローがまだ登録されていません</div>
                {isAdmin && <div style={{ fontSize: 12 }}>編集モードをオンにして「＋ フェーズを追加」から始めてください</div>}
              </div>
            )}

            {/* ─ 業務一覧 ─ */}
            {teamTasks.length > 0 && (
              <>
                <div style={S.secLabel}><span>業務一覧</span><span style={S.secLabelLine} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 32 }}>
                  {teamTasks.map((t, i) => (
                    <div key={t.id} style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 9, padding: '11px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: deptAccent, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T().text, lineHeight: 1.5 }}>{t.task}</div>
                        {(t.owner || t.support) && (
                          <div style={{ fontSize: 11, color: T().textMuted, marginTop: 3 }}>
                            {t.owner && `実責：${t.owner}`}{t.owner && t.support ? ' / ' : ''}{t.support && `サポート：${t.support}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

          </div>
        )}
      </div>

      {/* ─ 保存フラッシュ ─ */}
      {savedFlash && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#3D7A6A', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 500, pointerEvents: 'none' }}>
          ✓ 保存しました
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════
// タブ4: メンバーJD（MemberJDTab / MemberDetail）
// ══════════════════════════════════════════════════
const JD_DEFAULT = {
  '加藤翼':   { role: 'ゼネラルマネージャー', emp: '正社員', period: '2022年4月1日 〜 現在', bio: 'NEO福岡の立ち上げから参画。全体マネジメントと対外連携を担当。', skills: 'マネジメント・採用・対外連携・事業企画' },
  '森朝香':   { role: 'コミュニティマネージャー', emp: '業務委託', period: '2022年6月1日 〜 現在', bio: 'コミュニティ運営のコアメンバー。メンバー体験の向上を推進。', skills: 'コミュニティ設計・イベント運営・広報' },
  '面川文香': { role: 'ユースディレクター', emp: '業務委託', period: '2023年1月1日 〜 現在', bio: '若者向けプログラムの企画・運営を担当。', skills: '教育設計・ファシリテーション・採用' },
  '古野絢太': { role: 'パートナーセールス', emp: '業務委託', period: '2023年4月1日 〜 現在', bio: 'パートナー企業との連携・営業活動を担当。', skills: '営業・法人開拓・提案資料作成' },
  '鬼木良輔': { role: 'クラブ連携マネージャー', emp: '業務委託', period: '2022年10月1日 〜 現在', bio: 'スポーツクラブとの連携強化と共同プロジェクトを推進。', skills: 'クラブ連携・プロジェクト管理・渉外' },
  '増田雄太朗': { role: 'マーケティングマネージャー', emp: '業務委託', period: '2023年7月1日 〜 現在', bio: 'デジタルマーケティングとブランディングを担当。', skills: 'SNS運用・コンテンツ制作・データ分析' },
  '菅雅也':   { role: 'オペレーションマネージャー', emp: '業務委託', period: '2023年4月1日 〜 現在', bio: '社内オペレーション・ツール整備・効率化を推進。', skills: '業務設計・ツール開発・データ管理' },
  '中島啓太': { role: 'ユースコーチ', emp: '業務委託', period: '2024年1月1日 〜 現在', bio: 'ユース育成プログラムの実施とコーチング。', skills: 'コーチング・育成プログラム設計・分析' },
  '中道稔':   { role: 'アドバイザー', emp: '業務委託', period: '2022年4月1日 〜 現在', bio: '経営・財務面でのアドバイスを提供。', skills: '経営戦略・財務・法務' },
  '元美和':   { role: 'コミュニティスタッフ', emp: '業務委託', period: '2024年4月1日 〜 現在', bio: 'コミュニティイベントのサポートと運営補助。', skills: 'イベント運営・コミュニケーション・広報' },
}

function MemberDetail({ member, jdRows, setJdRows, isAdmin, currentUser, onClose }) {
  const rows = (jdRows[member.id] || []).slice().sort((a, b) => a.version_idx - b.version_idx)
  const [editingId, setEditingId] = useState(null)
  const [editBuf, setEditBuf] = useState({})
  const [addingRow, setAddingRow] = useState(false)
  const [newBuf, setNewBuf] = useState({ role: '', emp: '業務委託', period: '', bio: '', skills: '', is_current: true })
  const [saving, setSaving] = useState(false)
  const [profileEdit, setProfileEdit] = useState(false)
  const [profileBuf, setProfileBuf] = useState({ name: member.name, email: member.email || '', avatar_url: member.avatar_url || '' })
  const defaultJd = JD_DEFAULT[member.name] || {}

  const color = avatarColor(member.name)
  const currentRow = rows.find(r => r.is_current) || rows[rows.length - 1] || null

  const inpSt = (extra = {}) => ({ background: T().bgInput, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '5px 8px', color: T().text, fontSize: 12, outline: 'none', fontFamily: 'inherit', ...extra })
  const lbl = { fontSize: 9, fontWeight: 700, color: T().textFaint, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }

  const saveRow = async (rowId) => {
    setSaving(true)
    await supabase.from('org_member_jd').update(editBuf).eq('id', rowId)
    setJdRows(prev => {
      const next = { ...prev }
      next[member.id] = (next[member.id] || []).map(r => r.id === rowId ? { ...r, ...editBuf } : r)
      return next
    })
    setEditingId(null); setEditBuf({}); setSaving(false)
  }

  const addRow = async () => {
    setSaving(true)
    const maxIdx = Math.max(-1, ...rows.map(r => r.version_idx))
    const row = { member_id: member.id, version_idx: maxIdx + 1, ...newBuf }
    const { data, error } = await supabase.from('org_member_jd').insert(row).select().single()
    if (error) { alert('追加に失敗しました: ' + error.message); setSaving(false); return }
    setJdRows(prev => {
      const next = { ...prev }
      const existing = next[member.id] || []
      const merged = [...existing, data].sort((a, b) => a.version_idx - b.version_idx)
      next[member.id] = merged
      return next
    })
    setAddingRow(false); setNewBuf({ role: '', emp: '業務委託', period: '', bio: '', skills: '', is_current: true }); setSaving(false)
  }

  const deleteRow = async (rowId) => {
    if (!window.confirm('このJDバージョンを削除しますか？')) return
    await supabase.from('org_member_jd').delete().eq('id', rowId)
    setJdRows(prev => { const next = { ...prev }; next[member.id] = (next[member.id] || []).filter(r => r.id !== rowId); return next })
  }

  const saveProfile = async () => {
    setSaving(true)
    await supabase.from('members').update({ name: profileBuf.name, email: profileBuf.email, avatar_url: profileBuf.avatar_url }).eq('id', member.id)
    setProfileEdit(false); setSaving(false)
  }

  const empBadge = getEmpBadge(currentRow?.emp || defaultJd.emp || '')

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: T().bgCard, border: `1px solid ${T().borderMid}`, borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', position: 'relative' }}>
        {/* ヘッダー */}
        <div style={{ background: `${color}18`, borderBottom: `1px solid ${T().border}`, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
          <Avatar name={member.name} size={60} avatar_url={member.avatar_url} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T().text, marginBottom: 4 }}>{member.name}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(currentRow?.role || defaultJd.role) && <span style={{ fontSize: 12, color: T().textSub, fontWeight: 600 }}>{currentRow?.role || defaultJd.role}</span>}
              {(currentRow?.emp || defaultJd.emp) && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700, background: `${empBadge.bg}`, color: empBadge.color }}>{currentRow?.emp || defaultJd.emp}</span>}
              {member.email && <span style={{ fontSize: 11, color: T().accent }}>✉ {member.email}</span>}
            </div>
          </div>
          {isAdmin && <button onClick={() => setProfileEdit(p => !p)} style={{ background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 600 }}>✎ プロフィール編集</button>}
          <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: T().bgInput, border: 'none', color: T().textMuted, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>
        </div>

        {/* プロフィール編集 */}
        {profileEdit && (
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T().border}`, background: T().bgHover }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T().accent, marginBottom: 12 }}>プロフィール情報を編集</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><div style={lbl}>名前</div><input value={profileBuf.name} onChange={e => setProfileBuf(p => ({ ...p, name: e.target.value }))} style={inpSt({ width: '100%', boxSizing: 'border-box' })} /></div>
              <div><div style={lbl}>メールアドレス</div><input type="email" value={profileBuf.email} onChange={e => setProfileBuf(p => ({ ...p, email: e.target.value }))} style={inpSt({ width: '100%', boxSizing: 'border-box' })} /></div>
              <div style={{ gridColumn: '1/-1' }}><div style={lbl}>アバター画像URL</div><input value={profileBuf.avatar_url} onChange={e => setProfileBuf(p => ({ ...p, avatar_url: e.target.value }))} placeholder="https://..." style={inpSt({ width: '100%', boxSizing: 'border-box' })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setProfileEdit(false)} style={{ padding: '5px 14px', borderRadius: 7, background: 'transparent', border: `1px solid ${T().border}`, color: T().textMuted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>キャンセル</button>
              <button onClick={saveProfile} disabled={saving} style={{ padding: '5px 14px', borderRadius: 7, background: T().accentSolid, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>保存</button>
            </div>
          </div>
        )}

        {/* JD一覧 */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T().textSub }}>JD履歴 ({rows.length}件)</div>
            {isAdmin && !addingRow && <button onClick={() => setAddingRow(true)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>＋ バージョン追加</button>}
          </div>

          {rows.length === 0 && !addingRow && (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: T().textFaint, border: `1px dashed ${T().border}`, borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13 }}>JDがまだ登録されていません</div>
              {defaultJd.role && <div style={{ fontSize: 11, marginTop: 8, color: T().textMuted }}>デフォルト情報：{defaultJd.role} / {defaultJd.emp}</div>}
            </div>
          )}

          {rows.map((row, idx) => {
            const isEditing = editingId === row.id
            const empB = getEmpBadge(row.emp || '')
            return (
              <div key={row.id} style={{ marginBottom: 12, border: `1px solid ${row.is_current ? T().badgeBorder : T().border}`, borderRadius: 10, padding: '14px 16px', background: row.is_current ? T().navActiveBg : T().bgCard2, position: 'relative' }}>
                {row.is_current && <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: T().accent, color: '#fff' }}>現在</div>}
                {isEditing ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><div style={lbl}>役職</div><input value={editBuf.role ?? row.role} onChange={e => setEditBuf(b => ({ ...b, role: e.target.value }))} style={inpSt({ width: '100%', boxSizing: 'border-box' })} /></div>
                    <div><div style={lbl}>雇用形態</div><select value={editBuf.emp ?? row.emp} onChange={e => setEditBuf(b => ({ ...b, emp: e.target.value }))} style={{ ...inpSt(), width: '100%', boxSizing: 'border-box' }}>{EMP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                    <div style={{ gridColumn: '1/-1' }}><div style={lbl}>期間</div><PeriodInput value={editBuf.period ?? row.period ?? ''} onChange={v => setEditBuf(b => ({ ...b, period: v }))} /></div>
                    <div style={{ gridColumn: '1/-1' }}><div style={lbl}>スキル・強み</div><input value={editBuf.skills ?? row.skills ?? ''} onChange={e => setEditBuf(b => ({ ...b, skills: e.target.value }))} style={inpSt({ width: '100%', boxSizing: 'border-box' })} /></div>
                    <div style={{ gridColumn: '1/-1' }}><div style={lbl}>自己紹介・背景</div><textarea value={editBuf.bio ?? row.bio ?? ''} onChange={e => setEditBuf(b => ({ ...b, bio: e.target.value }))} rows={3} style={{ ...inpSt(), width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
                    <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T().textSub, cursor: 'pointer', marginRight: 'auto' }}><input type="checkbox" checked={editBuf.is_current ?? row.is_current} onChange={e => setEditBuf(b => ({ ...b, is_current: e.target.checked }))} style={{ accentColor: T().accent }} />現在の役職として設定</label>
                      <button onClick={() => { setEditingId(null); setEditBuf({}) }} style={{ padding: '5px 14px', borderRadius: 7, background: 'transparent', border: `1px solid ${T().border}`, color: T().textMuted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>キャンセル</button>
                      <button onClick={() => saveRow(row.id)} disabled={saving} style={{ padding: '5px 14px', borderRadius: 7, background: T().accentSolid, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>{saving ? '保存中...' : '保存'}</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T().text }}>{row.role || '役職未設定'}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700, background: `${empB.bg}`, color: empB.color }}>{row.emp}</span>
                      {row.period && <span style={{ fontSize: 11, color: T().textFaint }}>📅 {row.period}</span>}
                    </div>
                    {row.skills && <div style={{ fontSize: 12, color: T().textSub, marginBottom: 6 }}>🔧 {row.skills}</div>}
                    {row.bio && <div style={{ fontSize: 12, color: T().textFaint, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{row.bio}</div>}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button onClick={() => { setEditingId(row.id); setEditBuf({}) }} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: T().badgeBg, border: `1px solid ${T().badgeBorder}`, color: T().accent, cursor: 'pointer', fontFamily: 'inherit' }}>✎ 編集</button>
                        {rows.length > 1 && <button onClick={() => deleteRow(row.id)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: T().warnBg, border: `1px solid ${T().warn}`, color: T().warn, cursor: 'pointer', fontFamily: 'inherit' }}>✕ 削除</button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {addingRow && (
            <div style={{ border: `1px dashed ${T().badgeBorder}`, borderRadius: 10, padding: '16px', background: T().bgHover, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T().accent, marginBottom: 12 }}>＋ 新しいJDバージョン</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div style={lbl}>役職</div><input value={newBuf.role} onChange={e => setNewBuf(b => ({ ...b, role: e.target.value }))} style={inpSt({ width: '100%', boxSizing: 'border-box' })} /></div>
                <div><div style={lbl}>雇用形態</div><select value={newBuf.emp} onChange={e => setNewBuf(b => ({ ...b, emp: e.target.value }))} style={{ ...inpSt(), width: '100%', boxSizing: 'border-box' }}>{EMP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                <div style={{ gridColumn: '1/-1' }}><div style={lbl}>期間</div><PeriodInput value={newBuf.period} onChange={v => setNewBuf(b => ({ ...b, period: v }))} /></div>
                <div style={{ gridColumn: '1/-1' }}><div style={lbl}>スキル・強み</div><input value={newBuf.skills} onChange={e => setNewBuf(b => ({ ...b, skills: e.target.value }))} style={inpSt({ width: '100%', boxSizing: 'border-box' })} /></div>
                <div style={{ gridColumn: '1/-1' }}><div style={lbl}>自己紹介・背景</div><textarea value={newBuf.bio} onChange={e => setNewBuf(b => ({ ...b, bio: e.target.value }))} rows={3} style={{ ...inpSt(), width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T().textSub, cursor: 'pointer', marginRight: 'auto' }}><input type="checkbox" checked={newBuf.is_current} onChange={e => setNewBuf(b => ({ ...b, is_current: e.target.checked }))} style={{ accentColor: T().accent }} />現在の役職として設定</label>
                  <button onClick={() => setAddingRow(false)} style={{ padding: '5px 14px', borderRadius: 7, background: 'transparent', border: `1px solid ${T().border}`, color: T().textMuted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>キャンセル</button>
                  <button onClick={addRow} disabled={saving} style={{ padding: '5px 14px', borderRadius: 7, background: T().accentSolid, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>{saving ? '追加中...' : '追加'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MemberJDTab({ members, jdRows, setJdRows, isAdmin, currentUser, tasks, levels }) {
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [filterEmp, setFilterEmp] = useState('')

  const filtered = members.filter(m => {
    const nameOk = !query || m.name.includes(query)
    const empOk = !filterEmp || (() => {
      const rows = jdRows[m.id] || []
      const cur = rows.find(r => r.is_current) || rows[rows.length - 1]
      return cur?.emp?.includes(filterEmp) || (!cur && (JD_DEFAULT[m.name]?.emp || '').includes(filterEmp))
    })()
    return nameOk && empOk
  })

  const sel = { background: T().selectBg, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: T().text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }
  const selectedMember = selected ? members.find(m => m.id === selected) : null

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 メンバー名で検索..." style={{ ...sel, minWidth: 180 }} onFocus={e => e.target.style.borderColor = T().accent} onBlur={e => e.target.style.borderColor = T().border} />
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={sel}><option value="">雇用形態：すべて</option>{EMP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}</select>
        <span style={{ fontSize: 11, color: T().textFaint, marginLeft: 'auto' }}>{filtered.length}名</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {filtered.map(m => {
          const rows = jdRows[m.id] || []
          const cur = rows.find(r => r.is_current) || rows[rows.length - 1]
          const def = JD_DEFAULT[m.name] || {}
          const role = cur?.role || def.role || '役職未設定'
          const emp = cur?.emp || def.emp || ''
          const hasJd = rows.length > 0
          const empB = getEmpBadge(emp)
          const color = avatarColor(m.name)
          const memberTasks = tasks.filter(t => t.owner === m.name && !t.is_archived)
          return (
            <div key={m.id} onClick={() => setSelected(m.id)}
              style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 12, padding: '16px', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}08` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T().border; e.currentTarget.style.background = T().bgCard }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Avatar name={m.name} size={40} avatar_url={m.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T().text }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: T().textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{role}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {emp && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: empB.bg, color: empB.color }}>{emp}</span>}
                {hasJd ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}` }}>JD {rows.length}件</span> : <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: T().bgInput, color: T().textFaint }}>JD未登録</span>}
                {memberTasks.length > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${color}15`, color, border: `1px solid ${color}30` }}>業務 {memberTasks.length}件</span>}
              </div>
            </div>
          )
        })}
      </div>

      {selectedMember && (
        <MemberDetail
          member={selectedMember}
          jdRows={jdRows}
          setJdRows={setJdRows}
          isAdmin={isAdmin}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// AddMemberModal
// ══════════════════════════════════════════════════
function AddMemberModal({ levels, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('メンバー')
  const [emp, setEmp] = useState('業務委託')
  const [selectedLevels, setSelectedLevels] = useState([])
  const [saving, setSaving] = useState(false)

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))
  const allTeams = roots.flatMap(root =>
    getChildren(root.id).flatMap(dept => {
      const teams = getChildren(dept.id)
      return teams.length > 0 ? teams.map(t => ({ dept: dept.name, team: t })) : [{ dept: dept.name, team: dept }]
    })
  )

  const toggleLevel = (id) => {
    setSelectedLevels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('members').insert({
      name: name.trim(), role, level_ids: selectedLevels, level_id: selectedLevels[0] || null
    }).select().single()
    if (error) { alert('追加に失敗しました: ' + error.message); setSaving(false); return }
    onAdded(data); setSaving(false); onClose()
  }

  const inp = { background: T().bgInput, border: `1px solid ${T().borderMid}`, borderRadius: 6, padding: '7px 10px', color: T().text, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const sel = { ...inp, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: T().bgCard, border: `1px solid ${T().borderMid}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: T().text, marginBottom: 20 }}>👤 メンバーを追加</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>名前 *</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="例: 山田太郎" style={inp} onFocus={e => e.target.style.borderColor = T().accent} onBlur={e => e.target.style.borderColor = T().borderMid} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>ロール</div>
            <select value={role} onChange={e => setRole(e.target.value)} style={sel}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>所属チーム（複数選択可）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', border: `1px solid ${T().border}`, borderRadius: 8, padding: '8px' }}>
              {allTeams.map(({ dept, team }) => {
                const isSelected = selectedLevels.includes(team.id)
                const color = getDeptColor(dept)
                return (
                  <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', background: isSelected ? `${color}15` : 'transparent', transition: '0.1s' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleLevel(team.id)} style={{ accentColor: color }} />
                    <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 70 }}>{dept}</span>
                    <span style={{ fontSize: 12, color: isSelected ? color : T().text, fontWeight: isSelected ? 600 : 400 }}>{team.icon} {team.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${T().border}`, background: 'transparent', color: T().textMuted, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={handleAdd} disabled={saving || !name.trim()} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: name.trim() ? T().accentSolid : T().border, color: '#fff', cursor: name.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? '追加中...' : '追加する'}</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// export default OrgPage
// ══════════════════════════════════════════════════
export default function OrgPage({ user, isAdmin, themeKey = 'dark', fiscalYear = '2026' }) {
  _T = THEMES[themeKey] || THEMES.dark

  const {
    levels, teamMeta, members, tasks, jdRows, taskHistory, setTaskHistory,
    manuals, setManuals, loading, syncStatus, orgTableError, reload,
    setLevels, setTeamMeta, setMembers, setTasks, setJdRows,
  } = useOrgData(fiscalYear)

  const [activeTab, setActiveTab] = useState('chart')
  const [showAddMember, setShowAddMember] = useState(false)

  const tabs = [
    { id: 'chart',    icon: '🏗',  label: '組織図' },
    { id: 'tasks',    icon: '📋',  label: '業務一覧' },
    { id: 'manual',   icon: '📖',  label: '業務マニュアル' },
    { id: 'members',  icon: '👤',  label: 'メンバーJD' },
    { id: 'users',    icon: '👥',  label: 'ユーザー管理' },
    { id: 'taskflow', icon: '🔄',  label: '業務フロー' },
  ]

  const handleMemberClick = useCallback((name) => {
    setActiveTab('members')
  }, [])

  const handleTeamMetaUpdate = useCallback((levelId, meta) => {
    setTeamMeta(prev => ({ ...prev, [levelId]: { ...prev[levelId], ...meta } }))
  }, [setTeamMeta])

  const handleMemberAdded = useCallback((newMember) => {
    setMembers(prev => prev.some(m => m.id === newMember.id) ? prev : [...prev, newMember])
  }, [setMembers])

  const syncDot = { synced: T().accent, connecting: T().warn, error: T().warn }[syncStatus] || T().textFaint

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, background: T().bg, color: T().accent, fontSize: 15, fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.7 }}>⏳</div>
          <div>組織データを読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: T().bg, color: T().text, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif' }}>
      {/* ヘッダー */}
      <div style={{ background: T().bgCard, borderBottom: `1px solid ${T().border}`, padding: '0 28px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', marginRight: 24 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: T().text }}>🏗 組織</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}` }}>{fiscalYear}年度</span>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: syncDot, marginLeft: 4 }} title={syncStatus} />
          </div>
          <div style={{ display: 'flex', flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {tabs.map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '18px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? T().navActiveText : T().textMuted, borderBottom: `2.5px solid ${isActive ? T().navActiveText : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                  <span>{tab.icon}</span><span>{tab.label}</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, paddingLeft: 16, flexShrink: 0 }}>
            {isAdmin && activeTab === 'chart' && (
              <button onClick={() => setShowAddMember(true)}
                style={{ padding: '7px 16px', borderRadius: 8, background: T().accentSolid, border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                ＋ メンバー追加
              </button>
            )}
            <button onClick={reload} style={{ padding: '7px 12px', borderRadius: 8, background: T().bgInput, border: `1px solid ${T().border}`, color: T().textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }} title="再読み込み">🔄</button>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div style={{ padding: (activeTab === 'taskflow' || activeTab === 'manual') ? 0 : '28px 28px', maxWidth: (activeTab === 'taskflow' || activeTab === 'manual') ? '100%' : 1100, margin: '0 auto' }}>
        {activeTab === 'chart' && (
          <OrgChart
            levels={levels}
            teamMeta={teamMeta}
            members={members}
            onMemberClick={handleMemberClick}
            isAdmin={isAdmin}
            onTeamMetaUpdate={handleTeamMetaUpdate}
          />
        )}
        {activeTab === 'tasks' && (
          <TaskList
            tasks={tasks}
            setTasks={setTasks}
            members={members}
            onMemberClick={handleMemberClick}
            isAdmin={isAdmin}
            taskHistory={taskHistory}
            setTaskHistory={setTaskHistory}
            currentUser={user?.email || user?.name || ''}
            levels={levels}
            orgTableError={orgTableError}
          />
        )}
        {activeTab === 'manual' && (
          <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            <ManualTab
              tasks={tasks}
              manuals={manuals}
              setManuals={setManuals}
              members={members}
              levels={levels}
              teamMeta={teamMeta}
              isAdmin={isAdmin}
              currentUser={user?.email || user?.name || ''}
            />
          </div>
        )}
        {activeTab === 'members' && (
          <MemberJDTab
            members={members}
            jdRows={jdRows}
            setJdRows={setJdRows}
            isAdmin={isAdmin}
            currentUser={user?.email || user?.name || ''}
            tasks={tasks}
            levels={levels}
          />
        )}
        {activeTab === 'users' && (
          <UserListTab
            members={members}
            currentUser={user}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'taskflow' && (
          <div style={{ height: 'calc(100vh - 60px)', minHeight: 600 }}>
            <TaskManualPage
              levels={levels}
              isAdmin={isAdmin}
              themeKey={themeKey}
            />
          </div>
        )}
      </div>

      {showAddMember && (
        <AddMemberModal
          levels={levels}
          onClose={() => setShowAddMember(false)}
          onAdded={handleMemberAdded}
        />
      )}
    </div>
  )
}
