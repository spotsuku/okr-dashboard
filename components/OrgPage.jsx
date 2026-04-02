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
function ManualTab({ tasks, manuals, setManuals, members, levels, isAdmin, currentUser }) {
  const [filterDept, setFilterDept] = useState('')
  const [filterTask, setFilterTask] = useState(null)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editBuf, setEditBuf] = useState({})
  const [addingTaskId, setAddingTaskId] = useState(null)
  const [newBuf, setNewBuf] = useState({ title: '', content: '', category: '' })
  const [saving, setSaving] = useState(false)
  const [expandedManual, setExpandedManual] = useState(null)

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
    return { dept: t.dept, team: t.team }
  }, [levelHierarchy])

  const allDepts = levelHierarchy ? Object.keys(levelHierarchy) : [...new Set(tasks.map(t => t.dept))]
  const activeTasks = tasks.filter(t => !t.is_archived)
  const manualCountByTask = useMemo(() => {
    const counts = {}
    manuals.forEach(m => { counts[m.task_id] = (counts[m.task_id] || 0) + 1 })
    return counts
  }, [manuals])

  const filteredTasks = activeTasks.filter(t => {
    const m = matchTask(t)
    return (!filterDept || m.dept === filterDept) && (!query || t.task.includes(query) || m.team.includes(query) || (t.owner && t.owner.includes(query)))
  })

  const grouped = {}
  if (levelHierarchy && !query) {
    Object.entries(levelHierarchy).forEach(([deptName, teams]) => {
      if (filterDept && deptName !== filterDept) return
      grouped[deptName] = {}
      Object.keys(teams).forEach(teamName => { grouped[deptName][teamName] = [] })
    })
  }
  filteredTasks.forEach(t => {
    const m = matchTask(t)
    if (!grouped[m.dept]) grouped[m.dept] = {}
    if (!grouped[m.dept][m.team]) grouped[m.dept][m.team] = []
    grouped[m.dept][m.team].push(t)
  })

  const taskManuals = filterTask ? manuals.filter(m => m.task_id === filterTask.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : []
  const CATEGORIES = ['手順書', 'ルール', 'テンプレート', 'FAQ', 'その他']

  const saveManual = async () => {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('org_task_manuals').update({ ...editBuf, updated_by: currentUser || '', updated_at: new Date().toISOString() }).eq('id', editingId)
    if (error) { alert('保存に失敗しました: ' + error.message); setSaving(false); return }
    setManuals(prev => prev.map(m => m.id === editingId ? { ...m, ...editBuf, updated_by: currentUser || '', updated_at: new Date().toISOString() } : m))
    setEditingId(null); setEditBuf({}); setSaving(false)
  }

  const addManual = async () => {
    if (!addingTaskId || !newBuf.title.trim()) return
    setSaving(true)
    const maxOrder = Math.max(0, ...taskManuals.map(m => m.sort_order ?? 0))
    const row = { task_id: addingTaskId, ...newBuf, sort_order: maxOrder + 1, updated_by: currentUser || '' }
    const { data, error } = await supabase.from('org_task_manuals').insert(row).select().single()
    if (error) { alert('追加に失敗しました: ' + error.message); setSaving(false); return }
    setManuals(prev => [...prev, data])
    setNewBuf({ title: '', content: '', category: '' }); setAddingTaskId(null); setSaving(false)
  }

  const deleteManual = async (id) => {
    if (!window.confirm('このマニュアルを削除しますか？')) return
    const { error } = await supabase.from('org_task_manuals').delete().eq('id', id)
    if (error) { alert('削除に失敗しました: ' + error.message); return }
    setManuals(prev => prev.filter(m => m.id !== id))
    if (expandedManual === id) setExpandedManual(null)
  }

  const sel = { background: T().selectBg, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: T().text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }
  const catColor = (cat) => {
    const colors = { '手順書': '#5DCAA5', 'ルール': '#4d9fff', 'テンプレート': '#ffd166', 'FAQ': '#ff6b6b', 'その他': '#B0BAC8' }
    return colors[cat] || T().textMuted
  }

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 500 }}>
      {/* 左ペイン: 業務一覧 */}
      <div style={{ width: filterTask ? 340 : '100%', flexShrink: 0, transition: 'width 0.2s' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={sel}><option value="">全部署</option>{allDepts.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 業務名・チーム名で検索..." style={{ ...sel, flex: 1, minWidth: 160, background: T().bgInput }} onFocus={e => e.target.style.borderColor = T().accent} onBlur={e => e.target.style.borderColor = T().border} />
        </div>
        {Object.entries(grouped).map(([dept, teams]) => (
          <div key={dept} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T().accent, padding: '6px 10px', background: T().navActiveBg, borderRadius: 8, marginBottom: 6 }}>{dept}</div>
            {Object.entries(teams).map(([team, teamTasks]) => (
              <div key={team} style={{ marginLeft: 8, marginBottom: 8 }}>
                {team !== dept && <div style={{ fontSize: 11, color: T().textMuted, fontWeight: 600, padding: '3px 8px', marginBottom: 4 }}>{team}</div>}
                {teamTasks.map(t => {
                  const isSelected = filterTask?.id === t.id
                  const count = manualCountByTask[t.id] || 0
                  return (
                    <div key={t.id} onClick={() => setFilterTask(isSelected ? null : t)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: isSelected ? T().navActiveBg : 'transparent', border: isSelected ? `1px solid ${T().badgeBorder}` : '1px solid transparent', transition: 'all 0.15s' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T().bgHover }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? T().accent : T().text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.task}</div>
                        <div style={{ fontSize: 11, color: T().textMuted, marginTop: 2 }}>{t.owner || '未定'}</div>
                      </div>
                      {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}` }}>{count}件</span>}
                      <span style={{ fontSize: 14, color: T().textFaint }}>›</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
        {Object.keys(grouped).length === 0 && <div style={{ textAlign: 'center', padding: '40px 20px', color: T().textMuted, fontSize: 13 }}>業務が見つかりません</div>}
      </div>

      {/* 右ペイン: マニュアル詳細 */}
      {filterTask && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: T().bgCard, borderRadius: 12, border: `1px solid ${T().border}`, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T().text }}>{filterTask.task}</div>
                <div style={{ fontSize: 12, color: T().textMuted, marginTop: 2 }}>担当: {filterTask.owner || '未定'}{filterTask.support ? ` ／ サポート: ${filterTask.support}` : ''}</div>
              </div>
              <button onClick={() => setFilterTask(null)} style={{ background: 'none', border: 'none', color: T().textMuted, cursor: 'pointer', fontSize: 18, fontFamily: 'inherit' }}>✕</button>
            </div>
            {taskManuals.length === 0 && !addingTaskId && <div style={{ textAlign: 'center', padding: '30px 20px', color: T().textMuted, fontSize: 13, background: T().bgHover, borderRadius: 10 }}>📄 まだマニュアルがありません</div>}
            {taskManuals.map(m => {
              const isEditing = editingId === m.id
              const isExpanded = expandedManual === m.id
              return (
                <div key={m.id} style={{ marginBottom: 10, borderRadius: 10, border: `1px solid ${T().border}`, overflow: 'hidden', background: T().bgCard2 }}>
                  <div onClick={() => { if (!isEditing) setExpandedManual(isExpanded ? null : m.id) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', background: isExpanded ? T().bgHover : 'transparent', transition: 'background 0.15s' }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = T().bgHover }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ fontSize: 12, color: T().textFaint, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    {m.category && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${catColor(m.category)}22`, color: catColor(m.category), border: `1px solid ${catColor(m.category)}44` }}>{m.category}</span>}
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T().text }}>{m.title}</div>
                    {m.updated_at && <span style={{ fontSize: 10, color: T().textFaint }}>{new Date(m.updated_at).toLocaleDateString('ja-JP')}</span>}
                  </div>
                  {isExpanded && !isEditing && (
                    <div style={{ padding: '12px 14px', borderTop: `1px solid ${T().border}` }}>
                      <div style={{ fontSize: 13, color: T().text, whiteSpace: 'pre-wrap', lineHeight: 1.7, minHeight: 40 }}>{m.content || '（内容なし）'}</div>
                      {m.updated_by && <div style={{ fontSize: 10, color: T().textFaint, marginTop: 10, textAlign: 'right' }}>最終更新: {m.updated_by}</div>}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditingId(m.id); setEditBuf({ title: m.title, content: m.content, category: m.category || '' }) }} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: T().badgeBg, color: T().accent, border: `1px solid ${T().badgeBorder}`, cursor: 'pointer', fontFamily: 'inherit' }}>✏️ 編集</button>
                          <button onClick={() => deleteManual(m.id)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: T().warnBg, color: T().warn, border: `1px solid ${T().warn}`, cursor: 'pointer', fontFamily: 'inherit' }}>🗑 削除</button>
                        </div>
                      )}
                    </div>
                  )}
                  {isExpanded && isEditing && (
                    <div style={{ padding: '12px 14px', borderTop: `1px solid ${T().border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={editBuf.title || ''} onChange={e => setEditBuf(b => ({ ...b, title: e.target.value }))} placeholder="タイトル" style={{ ...sel, flex: 1, background: T().bgInput, fontWeight: 600 }} />
                        <select value={editBuf.category || ''} onChange={e => setEditBuf(b => ({ ...b, category: e.target.value }))} style={{ ...sel, width: 120 }}><option value="">カテゴリ</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                      </div>
                      <textarea value={editBuf.content || ''} onChange={e => setEditBuf(b => ({ ...b, content: e.target.value }))} placeholder="マニュアルの内容を入力..." rows={10} style={{ ...sel, background: T().bgInput, resize: 'vertical', lineHeight: 1.7, minHeight: 160 }} />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditingId(null); setEditBuf({}) }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, background: 'transparent', color: T().textMuted, border: `1px solid ${T().border}`, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
                        <button onClick={saveManual} disabled={saving} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, background: T().accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>{saving ? '保存中...' : '💾 保存'}</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {addingTaskId === filterTask.id
              ? (
                <div style={{ marginTop: 12, padding: 14, borderRadius: 10, border: `1px dashed ${T().badgeBorder}`, background: T().bgHover }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T().accent, marginBottom: 10 }}>📝 新しいマニュアルを追加</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input value={newBuf.title} onChange={e => setNewBuf(b => ({ ...b, title: e.target.value }))} placeholder="タイトル" style={{ ...sel, flex: 1, background: T().bgInput, fontWeight: 600 }} />
                    <select value={newBuf.category} onChange={e => setNewBuf(b => ({ ...b, category: e.target.value }))} style={{ ...sel, width: 120 }}><option value="">カテゴリ</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
                  <textarea value={newBuf.content} onChange={e => setNewBuf(b => ({ ...b, content: e.target.value }))} placeholder="マニュアルの内容を入力..." rows={8} style={{ ...sel, width: '100%', boxSizing: 'border-box', background: T().bgInput, resize: 'vertical', lineHeight: 1.7, minHeight: 120, marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setAddingTaskId(null); setNewBuf({ title: '', content: '', category: '' }) }} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, background: 'transparent', color: T().textMuted, border: `1px solid ${T().border}`, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
                    <button onClick={addManual} disabled={saving || !newBuf.title.trim()} style={{ fontSize: 11, padding: '5px 16px', borderRadius: 6, background: T().accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', opacity: (saving || !newBuf.title.trim()) ? 0.5 : 1 }}>{saving ? '追加中...' : '＋ 追加'}</button>
                  </div>
                </div>
              )
              : isAdmin && (
                <button onClick={() => setAddingTaskId(filterTask.id)}
                  style={{ marginTop: 12, width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px dashed ${T().badgeBorder}`, background: T().bgHover, color: T().accent, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = T().badgeBg}
                  onMouseLeave={e => e.currentTarget.style.background = T().bgHover}>
                  ＋ マニュアルを追加
                </button>
              )}
          </div>
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
      <div style={{ padding: activeTab === 'taskflow' ? 0 : '28px 28px', maxWidth: activeTab === 'taskflow' ? '100%' : 1100, margin: '0 auto' }}>
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
          <ManualTab
            tasks={tasks}
            manuals={manuals}
            setManuals={setManuals}
            members={members}
            levels={levels}
            isAdmin={isAdmin}
            currentUser={user?.email || user?.name || ''}
          />
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
