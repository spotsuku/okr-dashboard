'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAutoSave } from '../lib/useAutoSave'
import { buildQuarterMap } from '../lib/objectiveMatching'

const DARK_T = {
  bg:'#090d18', bgCard:'#0e1420', bgCard2:'#111828', bgSidebar:'#0e1420',
  border:'rgba(255,255,255,0.07)', borderLight:'rgba(255,255,255,0.04)',
  borderMid:'rgba(255,255,255,0.1)', text:'#e8eaf0', textSub:'#a0a8be',
  textMuted:'#606880', textFaint:'#404660', textFaintest:'#303450',
}
const LIGHT_T = {
  bg:'#f0f2f7', bgCard:'#ffffff', bgCard2:'#f7f8fc', bgSidebar:'#ffffff',
  border:'rgba(0,0,0,0.08)', borderLight:'rgba(0,0,0,0.05)',
  borderMid:'rgba(0,0,0,0.12)', text:'#1a1f36', textSub:'#4a5270',
  textMuted:'#7080a0', textFaint:'#90a0bc', textFaintest:'#b0bcd0',
}
const W_THEMES = { dark: DARK_T, light: LIGHT_T }

// ─── ヘルパー ──────────────────────────────────────────────────────────────────
function getDepth(levelId, levels) {
  let d = 0, cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) { d++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
  return d
}
const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f', 3: '#ffd166' }

// ★ doneを追加した5種ステータス
const STATUS_CFG = {
  focus:  { label: '🎯 注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)',  border: 'rgba(77,159,255,0.3)' },
  good:   { label: '✅ Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)',    border: 'rgba(0,214,143,0.3)' },
  more:   { label: '🔺 More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)',  border: 'rgba(255,107,107,0.3)' },
  normal: { label: '未分類',  color: '#606880', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' },
  done:   { label: '✓ 完了',  color: '#a0a8be', bg: 'rgba(160,168,190,0.08)', border: 'rgba(160,168,190,0.2)' },
}
const STATUS_ORDER = ['normal','focus','good','more','done']

function getPeriodLabel(periodKey) {
  if (!periodKey) return ''
  const base = periodKey.includes('_') ? periodKey.split('_').pop() : periodKey
  return { annual:'通期', q1:'Q1', q2:'Q2', q3:'Q3', q4:'Q4' }[base] || periodKey
}

function calcObjProgress(krs) {
  if (!krs?.length) return 0
  const valid = krs.filter(k => k.target > 0)
  if (!valid.length) return 0
  return Math.round(valid.reduce((s, k) => {
    const raw = k.lower_is_better ? Math.max(0, ((k.target*2-k.current)/k.target)*100) : (k.current/k.target)*100
    return s + Math.min(raw, 150)
  }, 0) / valid.length)
}

// ─── 週ヘルパー ──────────────────────────────────────────────────────────────
function getMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  dt.setHours(0, 0, 0, 0)
  return dt
}
function toDateStr(d) {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toISOString().split('T')[0]
}
function formatWeekLabel(mondayStr) {
  const d = new Date(mondayStr)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const sun = new Date(d)
  sun.setDate(sun.getDate() + 6)
  const m2 = sun.getMonth() + 1
  const d2 = sun.getDate()
  return m === m2 ? `${m}/${day}〜${d2}` : `${m}/${day}〜${m2}/${d2}`
}
function isFriday() { return new Date().getDay() === 5 }
function getNextMonday() {
  const d = getMonday(new Date())
  d.setDate(d.getDate() + 7)
  return toDateStr(d)
}

// ─── アバター ─────────────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 22 }) {
  const [hov, setHov] = useState(false)
  if (!name) return null
  const color = avatarColor(name)
  return (
    <div style={{ position:'relative', display:'inline-flex', flexShrink:0 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', border:`1.5px solid ${color}60` }} />
        : <div style={{ width:size, height:size, borderRadius:'50%', background:`${color}25`, border:`1.5px solid ${color}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.38, fontWeight:700, color }}>{name.slice(0,2)}</div>
      }
      {hov && <div style={{ position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.88)', color:'#fff', fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:5, whiteSpace:'nowrap', zIndex:200, pointerEvents:'none' }}>{name}</div>}
    </div>
  )
}
function OwnerBadge({ name, members, size = 18 }) {
  if (!name) return null
  const m = members.find(x => x.name === name)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
      <Avatar name={name} avatarUrl={m?.avatar_url} size={size} />
      <span style={{ fontSize:size*0.65, color:avatarColor(name), fontWeight:600 }}>{name}</span>
    </div>
  )
}

// ─── 天気 ──────────────────────────────────────────────────────────────────────
const WEATHER_CFG = [
  { score:0, icon:'—',  label:'未選択',      color:'#606880', bg:'rgba(255,255,255,0.05)' },
  { score:1, icon:'⛈', label:'嵐',          color:'#8090b0', bg:'rgba(128,144,176,0.12)' },
  { score:2, icon:'🌧', label:'雨',          color:'#4d9fff', bg:'rgba(77,159,255,0.12)'  },
  { score:3, icon:'☁️', label:'曇り',        color:'#a0a8be', bg:'rgba(160,168,190,0.12)' },
  { score:4, icon:'🌤', label:'晴れのち曇り', color:'#ffd166', bg:'rgba(255,209,102,0.15)' },
  { score:5, icon:'☀️', label:'快晴',        color:'#ff9f43', bg:'rgba(255,159,67,0.12)'  },
]
const KR_STAR_CFG = [
  { label:'80%未満', color:'#606880' },{ label:'80%〜89%', color:'#ffd166' },
  { label:'90%〜99%', color:'#4d9fff' },{ label:'100%〜109%', color:'#00d68f' },
  { label:'110%〜119%', color:'#ff9f43' },{ label:'120%以上', color:'#a855f7' },
]
function calcStars(cur, tgt, lib) {
  if (!tgt) return 0
  const p = (lib ? tgt/Math.max(cur,0.001) : cur/tgt)*100
  if (p>=120) return 5; if (p>=110) return 4; if (p>=100) return 3
  if (p>=90)  return 2; if (p>=80)  return 1; return 0
}
function WeatherPicker({ value, onChange, wT }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
      {WEATHER_CFG.slice(1).map(w => {
        const on = w.score === value
        return (
          <div key={w.score} onClick={() => onChange(on ? 0 : w.score)}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, cursor:'pointer', userSelect:'none', background:on?w.bg:'transparent', border:`1px solid ${on?w.color+'70':wT().borderMid}`, transform:on?'scale(1.06)':'scale(1)', transition:'all 0.15s' }}>
            <span style={{ fontSize:20 }}>{w.icon}</span>
            <span style={{ fontSize:11, fontWeight:on?700:500, color:on?w.color:wT().textMuted }}>{w.label}</span>
          </div>
        )
      })}
      {value > 0 && <button onClick={() => onChange(0)} style={{ fontSize:10, color:wT().textFaint, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:6, padding:'4px 8px', cursor:'pointer', fontFamily:'inherit' }}>リセット</button>}
    </div>
  )
}

// ─── タスクポップオーバー ──────────────────────────────────────────────────────
function TaskPopover({ reportId, members, wT, onClose, onTaskCountChange, kaTitle, objectiveTitle, completedBy }) {
  const [tasks, setTasks] = useState([])
  const [loaded, setLoaded] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    supabase.from('ka_tasks').select('*').eq('report_id', reportId).order('id')
      .then(({data}) => { setTasks(data||[]); setLoaded(true) })
  }, [reportId])

  useEffect(() => {
    if (loaded && onTaskCountChange) {
      const saved = tasks.filter(t => t.id || t.title?.trim())
      onTaskCountChange({ done: saved.filter(t => t.done).length, total: saved.length })
    }
  }, [tasks, loaded]) // eslint-disable-line

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const addTask = () => setTasks(p => [...p, { _tmp:Date.now(), title:'', assignee:'', due_date:'', done:false, report_id:reportId }])
  const updateTask = (key, f, v) => setTasks(p => p.map(t => (t.id||t._tmp)===key ? {...t,[f]:v} : t))
  const removeTask = async (key) => {
    const t = tasks.find(x => (x.id||x._tmp)===key)
    if (t?.id) await supabase.from('ka_tasks').delete().eq('id', t.id)
    setTasks(p => p.filter(x => (x.id||x._tmp)!==key))
  }
  const toggleDone = async (key) => {
    const t = tasks.find(x => (x.id||x._tmp)===key)
    const nd = !t.done
    if (t?.id) await supabase.from('ka_tasks').update({ done:nd }).eq('id', t.id)
    setTasks(p => p.map(x => (x.id||x._tmp)===key ? {...x,done:nd} : x))
    if (nd && t?.id) {
      fetch('/api/slack-task-done', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: t.id, taskTitle: t.title, kaTitle, objectiveTitle, completedBy }),
      }).catch(() => {})
    }
  }
  const saveTask = async (key) => {
    const t = tasks.find(x => (x.id||x._tmp)===key)
    if (!t) return
    const d = { title:t.title||'', assignee:t.assignee||null, due_date:t.due_date||null, done:t.done, report_id:reportId }
    if (t.id) { await supabase.from('ka_tasks').update(d).eq('id', t.id) }
    else if (t.title?.trim()) {
      const {data:ins} = await supabase.from('ka_tasks').insert(d).select().single()
      if (ins) setTasks(p => p.map(tk => tk._tmp===t._tmp ? ins : tk))
    }
  }
  const doneCount = tasks.filter(t=>t.done).length

  return (
    <div ref={ref} style={{ position:'absolute', top:'100%', right:0, zIndex:100, width:380, background:wT().bgCard, border:`1px solid ${wT().borderMid}`, borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,0.3)', padding:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:700, color:'#a855f7' }}>📋 タスク {doneCount}/{tasks.length}</span>
        <button onClick={onClose} style={{ marginLeft:'auto', background:'transparent', border:'none', color:wT().textFaint, cursor:'pointer', fontSize:14 }}>✕</button>
      </div>
      {!loaded && <div style={{ fontSize:11, color:wT().textMuted, padding:8 }}>読み込み中...</div>}
      {tasks.map(t => {
        const key = t.id||t._tmp; const tc = avatarColor(t.assignee)
        return (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, marginBottom:4, background:t.done?wT().borderLight:wT().bgCard, border:`1px solid ${t.done?wT().border:wT().borderMid}`, opacity:t.done?0.6:1 }}>
            <div onClick={()=>toggleDone(key)} style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${t.done?'#00d68f':wT().borderMid}`, background:t.done?'#00d68f':'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {t.done && <span style={{ fontSize:9, color:'#fff', fontWeight:700 }}>✓</span>}
            </div>
            <input value={t.title} onChange={e=>updateTask(key,'title',e.target.value)} onBlur={()=>saveTask(key)} placeholder="タスク内容" style={{ flex:1, background:'transparent', border:'none', color:t.done?wT().textMuted:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', textDecoration:t.done?'line-through':'none' }}/>
            <select value={t.assignee||''} onChange={e=>{updateTask(key,'assignee',e.target.value); setTimeout(()=>saveTask(key),50)}} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.assignee?tc:wT().textMuted, fontSize:11, cursor:'pointer', fontFamily:'inherit', outline:'none', flexShrink:0, maxWidth:80 }}>
              <option value="">担当</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <input type="date" value={t.due_date||''} onChange={e=>{updateTask(key,'due_date',e.target.value); setTimeout(()=>saveTask(key),50)}} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.due_date?wT().text:wT().textMuted, fontSize:11, outline:'none', fontFamily:'inherit', flexShrink:0, maxWidth:110 }}/>
            <button onClick={()=>removeTask(key)} style={{ width:18, height:18, borderRadius:3, border:'none', background:'transparent', color:wT().textFaint, cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
          </div>
        )
      })}
      <div onClick={addTask} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, border:`1px dashed ${wT().borderMid}`, cursor:'pointer', color:wT().textMuted, fontSize:11, marginTop:2 }}>
        <span style={{ fontSize:14, lineHeight:1 }}>+</span> タスクを追加
      </div>
    </div>
  )
}

// ─── KAテーブル行 ──────────────────────────────────────────────────────────────
function KARow({ report, onSave, onDelete, members, wT, canEdit, dragHandleProps, dragIdx, overIdx, rowIdx, onDragOver, onDrop, objectiveTitle, completedBy }) {
  const [good,         setGood]         = useState(report.good || '')
  const [more,         setMore]         = useState(report.more || '')
  const [focusOutput,  setFocusOutput]  = useState(report.focus_output || '')
  const [status,       setStatus]       = useState(report.status || 'normal')
  const [ownerDraft,   setOwnerDraft]   = useState(report.owner || '')
  const [kaTitle,      setKaTitle]      = useState(report.ka_title || '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [showTasks,    setShowTasks]    = useState(false)
  const [taskCount,    setTaskCount]    = useState({ done:0, total:0 })
  const lastEnterRef   = useRef(0)

  const autoSave = useAutoSave('weekly_reports', report.id, { enabled: canEdit })
  const cfg = STATUS_CFG[status] || STATUS_CFG.normal
  const ownerMember = members.find(m => m.name === (ownerDraft||report.owner))

  // タスクカウント取得
  useEffect(() => {
    supabase.from('ka_tasks').select('id,done').eq('report_id', report.id)
      .then(({data}) => {
        if (data) setTaskCount({ done:data.filter(t=>t.done).length, total:data.length })
      })
  }, [report.id])

  // リモート更新をマージ（フォーカス中フィールドは上書きしない）
  useEffect(() => {
    const ff = autoSave.focusedField
    if (ff !== 'good' && report.good !== undefined) setGood(report.good || '')
    if (ff !== 'more' && report.more !== undefined) setMore(report.more || '')
    if (ff !== 'focus_output' && report.focus_output !== undefined) setFocusOutput(report.focus_output || '')
    if (ff !== 'status') setStatus(report.status || 'normal')
    if (ff !== 'owner') setOwnerDraft(report.owner || '')
    if (ff !== 'ka_title') setKaTitle(report.ka_title || '')
  }, [report.good, report.more, report.focus_output, report.status, report.owner, report.ka_title])

  const handleFieldChange = (field, value, setter) => {
    setter(value)
    autoSave.save(field, value)
    onSave({ ...report, [field]: value })
  }

  const cycleStatus = () => {
    const idx = STATUS_ORDER.indexOf(status)
    const next = STATUS_ORDER[(idx+1) % STATUS_ORDER.length]
    setStatus(next)
    autoSave.save('status', next)
    onSave({ ...report, status: next })
  }

  const handleOwnerChange = (val) => {
    setOwnerDraft(val)
    autoSave.save('owner', val)
    onSave({ ...report, owner: val })
  }

  const handleTitleBlur = () => {
    setEditingTitle(false)
    autoSave.setFocusedField(null)
    if (kaTitle.trim() && kaTitle !== report.ka_title) {
      autoSave.saveNow('ka_title', kaTitle.trim())
      onSave({ ...report, ka_title: kaTitle.trim() })
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setKaTitle(report.ka_title)
      setEditingTitle(false)
      autoSave.setFocusedField(null)
      return
    }
    if (e.key === 'Enter') {
      const now = Date.now()
      if (now - lastEnterRef.current < 500) {
        // ダブルEnter → 確定（最後の改行を除去）
        e.preventDefault()
        setKaTitle(prev => prev.replace(/\n$/, ''))
        // 次のティックでblur
        setTimeout(() => e.target?.blur(), 0)
      }
      lastEnterRef.current = now
    }
  }

  const cellS = { padding:'6px 8px', borderBottom:`1px solid ${wT().border}`, verticalAlign:'top', fontSize:12 }
  const taS = { width:'100%', boxSizing:'border-box', background:'transparent', border:`1px solid transparent`, borderRadius:5, padding:'4px 6px', color:wT().text, fontSize:11, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.5, minHeight:36, transition:'border-color 0.15s' }
  const isDone = status === 'done'
  const isDragging = dragIdx !== undefined && dragIdx === rowIdx
  const isDragOver = overIdx !== undefined && overIdx === rowIdx && dragIdx !== null && dragIdx !== rowIdx

  return (
    <tr style={{ opacity: isDone ? 0.5 : isDragging ? 0.4 : 1, background: isDone ? wT().borderLight : 'transparent', borderTop: isDragOver ? '2px solid #4d9fff' : 'none' }}
      onDragOver={onDragOver} onDrop={onDrop}>
      {/* ドラッグハンドル */}
      <td style={{ ...cellS, width:28, textAlign:'center', cursor:'grab' }}>
        <span {...(dragHandleProps||{})} style={{ color:wT().textFaint, fontSize:13, userSelect:'none' }} title="ドラッグで並べ替え">⠿</span>
      </td>
      {/* 担当 */}
      <td style={{ ...cellS, width:90 }}>
        {canEdit ? (
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <Avatar name={ownerDraft||report.owner} avatarUrl={ownerMember?.avatar_url} size={20} />
            <select value={ownerDraft} onChange={e=>handleOwnerChange(e.target.value)}
              onFocus={()=>autoSave.setFocusedField('owner')} onBlur={()=>autoSave.setFocusedField(null)}
              style={{ flex:1, background:'transparent', border:'none', color:ownerDraft?avatarColor(ownerDraft):wT().textMuted, fontSize:11, cursor:'pointer', fontFamily:'inherit', outline:'none', fontWeight:600, minWidth:0, maxWidth:60 }}>
              <option value="">--</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        ) : (
          <OwnerBadge name={ownerDraft||report.owner} members={members} size={20} />
        )}
      </td>
      {/* KAタイトル */}
      <td style={{ ...cellS, minWidth:120 }}>
        {editingTitle && canEdit ? (
          <textarea autoFocus value={kaTitle} onChange={e=>setKaTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            rows={2}
            style={{ width:'100%', boxSizing:'border-box', background:wT().bgCard2, border:'1px solid #4d9fff80', borderRadius:5, padding:'4px 6px', color:wT().text, fontSize:12, fontWeight:600, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.5 }} />
        ) : (
          <div onClick={() => { if (canEdit) { setEditingTitle(true); autoSave.setFocusedField('ka_title') } }}
            style={{ fontSize:12, fontWeight:600, color:isDone?wT().textMuted:wT().text, textDecoration:isDone?'line-through':'none', cursor:canEdit?'text':'default', lineHeight:1.4, minHeight:20, whiteSpace:'pre-wrap' }}>
            {kaTitle||report.ka_title||'(無題)'}
          </div>
        )}
      </td>
      {/* ステータス */}
      <td style={{ ...cellS, width:70, textAlign:'center' }}>
        <span onClick={canEdit?cycleStatus:undefined}
          style={{ fontSize:10, fontWeight:700, padding:'3px 7px', borderRadius:99, cursor:canEdit?'pointer':'default', background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, whiteSpace:'nowrap', display:'inline-block' }}>
          {cfg.label}
        </span>
      </td>
      {/* Good */}
      <td style={cellS}>
        <textarea value={good} readOnly={!canEdit}
          onChange={e=>handleFieldChange('good', e.target.value, setGood)}
          onFocus={e=>{autoSave.setFocusedField('good');e.target.style.borderColor='rgba(0,214,143,0.4)';e.target.rows=4}}
          onBlur={e=>{autoSave.setFocusedField(null);autoSave.saveNow('good',good);e.target.style.borderColor='transparent';e.target.rows=2}}
          rows={2} placeholder={canEdit?"Good":""}
          style={{ ...taS, color:good?wT().text:wT().textFaint }} />
      </td>
      {/* More */}
      <td style={cellS}>
        <textarea value={more} readOnly={!canEdit}
          onChange={e=>handleFieldChange('more', e.target.value, setMore)}
          onFocus={e=>{autoSave.setFocusedField('more');e.target.style.borderColor='rgba(255,107,107,0.4)';e.target.rows=4}}
          onBlur={e=>{autoSave.setFocusedField(null);autoSave.saveNow('more',more);e.target.style.borderColor='transparent';e.target.rows=2}}
          rows={2} placeholder={canEdit?"More":""}
          style={{ ...taS, color:more?wT().text:wT().textFaint }} />
      </td>
      {/* Focus */}
      <td style={cellS}>
        <textarea value={focusOutput} readOnly={!canEdit}
          onChange={e=>handleFieldChange('focus_output', e.target.value, setFocusOutput)}
          onFocus={e=>{autoSave.setFocusedField('focus_output');e.target.style.borderColor='rgba(77,159,255,0.4)';e.target.rows=4}}
          onBlur={e=>{autoSave.setFocusedField(null);autoSave.saveNow('focus_output',focusOutput);e.target.style.borderColor='transparent';e.target.rows=2}}
          rows={2} placeholder={canEdit?"Focus":""}
          style={{ ...taS, color:focusOutput?wT().text:wT().textFaint }} />
      </td>
      {/* Tasks + Delete */}
      <td style={{ ...cellS, width:70, textAlign:'center', position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
          <span onClick={()=>setShowTasks(p=>!p)} style={{ fontSize:11, color:'#a855f7', cursor:'pointer', fontWeight:600, padding:'2px 6px', borderRadius:4, background:showTasks?'rgba(168,85,247,0.12)':'transparent' }}>
            {`${taskCount.done}/${taskCount.total}`}
          </span>
          <button onClick={()=>onDelete(report.id)} style={{ width:18, height:18, borderRadius:3, border:'none', cursor:'pointer', fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,107,107,0.08)', color:'#ff6b6b', flexShrink:0 }}>✕</button>
        </div>
        {showTasks && <TaskPopover reportId={report.id} members={members} wT={wT} onClose={()=>setShowTasks(false)} onTaskCountChange={setTaskCount} kaTitle={report.ka_title} objectiveTitle={objectiveTitle} completedBy={completedBy} />}
      </td>
      {/* 自動保存インジケーター */}
      <td style={{ ...cellS, width:20, padding:'6px 2px' }}>
        {autoSave.saving && <span style={{ fontSize:9, color:'#4d9fff' }}>⟳</span>}
        {autoSave.saved && <span style={{ fontSize:9, color:'#00d68f' }}>✓</span>}
      </td>
    </tr>
  )
}

// ─── KRブロック ───────────────────────────────────────────────────────────────
function KRBlock({ kr, reports, onAddKA, onSaveKA, onDeleteKA, members, wT, levelId, objId, objOwner, canEditKA, onKROwnerChange, onKRUpdate, activeWeek, onReorder, objectiveTitle, completedBy, weeksList }) {
  // ★ doneを除いたKAのみ表示（doneは折りたたみ）
  const activeReports = reports.filter(r => Number(r.kr_id)===Number(kr.id) && r.status !== 'done')
    .sort((a, b) => (a.sort_order||0) - (b.sort_order||0))
  const doneReports   = reports.filter(r => Number(r.kr_id)===Number(kr.id) && r.status === 'done')
  const [showDone, setShowDone] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)

  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDragOver = (e, idx) => { e.preventDefault(); setOverIdx(idx) }
  const handleDrop = async (idx) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return }
    const reordered = [...activeReports]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(idx, 0, moved)
    const updates = reordered.map((r, i) => ({ id: r.id, sort_order: i }))
    setDragIdx(null); setOverIdx(null)
    for (const u of updates) {
      await supabase.from('weekly_reports').update({ sort_order: u.sort_order }).eq('id', u.id)
    }
    if (onReorder) onReorder()
  }
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null) }

  const pct = kr.target ? Math.min(Math.round((kr.current/kr.target)*100), 150) : 0
  const pctColor = pct >= 100 ? '#00d68f' : pct >= 60 ? '#4d9fff' : '#ff6b6b'
  const stars = calcStars(kr.current, kr.target, kr.lower_is_better)
  const starCfg = KR_STAR_CFG[stars] || KR_STAR_CFG[0]

  const [review,       setReview]       = useState(null)
  const [weather,      setWeather]      = useState(0)
  const [good,         setGood]         = useState('')
  const [more,         setMore]         = useState('')
  const [focus,        setFocus]        = useState('')
  const [reviewOpen,   setReviewOpen]   = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewSaved,  setReviewSaved]  = useState(false)
  const [krEditing,    setKrEditing]    = useState(false)
  const [krTitle,      setKrTitle]      = useState(kr.title || '')
  const [krCurrent,    setKrCurrent]    = useState(String(kr.current ?? ''))
  const [krTarget,     setKrTarget]     = useState(String(kr.target ?? ''))
  const [krUnit,       setKrUnit]       = useState(kr.unit || '')
  const [krSaving,     setKrSaving]     = useState(false)
  const [krSaved,      setKrSaved]      = useState(false)
  const weekStart = activeWeek || toDateStr(getMonday(new Date()))

  useEffect(() => {
    supabase.from('kr_weekly_reviews').select('*').eq('kr_id', kr.id).order('week_start', { ascending:false }).limit(1).maybeSingle()
      .then(({data}) => {
        if (data) { setReview(data); setWeather(data.weather||0); setGood(data.good||''); setMore(data.more||''); setFocus(data.focus||'') }
      })
  }, [kr.id])

  const saveReview = async () => {
    setReviewSaving(true)
    const payload = { kr_id:kr.id, week_start:weekStart, weather, good, more, focus, updated_at:new Date().toISOString() }
    if (review?.id) { await supabase.from('kr_weekly_reviews').update(payload).eq('id', review.id) }
    else { const {data} = await supabase.from('kr_weekly_reviews').insert(payload).select().single(); if (data) setReview(data) }
    setReviewSaving(false); setReviewSaved(true); setTimeout(() => setReviewSaved(false), 1500)
  }

  const saveKR = async () => {
    if (!onKRUpdate) return
    setKrSaving(true)
    const ok = await onKRUpdate(kr.id, {
      title: krTitle.trim() || kr.title,
      current: parseFloat(krCurrent) || 0,
      target: parseFloat(krTarget) || 0,
      unit: krUnit,
    })
    setKrSaving(false)
    if (ok) { setKrSaved(true); setTimeout(() => setKrSaved(false), 1500); setKrEditing(false) }
  }

  const addKA = async () => {
    const maxOrder = activeReports.reduce((max, r) => Math.max(max, r.sort_order||0), 0)
    const payload = {
      week_start: weekStart, level_id:levelId, objective_id:objId,
      kr_id:kr.id, kr_title:kr.title, ka_title:'新しいKA', status:'normal',
      sort_order: maxOrder + 1,
    }
    let { error } = await supabase.from('weekly_reports').insert(payload)
    if (error) {
      console.warn('KA insert failed, retrying without sort_order:', error.message)
      const { sort_order, ...payloadNoSort } = payload
      const res = await supabase.from('weekly_reports').insert(payloadNoSort)
      if (res.error) { console.error('KA追加エラー:', res.error); alert('KAの追加に失敗しました: ' + res.error.message); return }
    }
    onAddKA()
  }

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }
  const hasReview = weather > 0 || good || more || focus

  return (
    <div style={{ marginBottom:16 }}>
      {/* KRヘッダー */}
      <div onClick={() => setReviewOpen(p=>!p)} style={{ padding:'10px 14px', background:wT().bgCard, borderLeft:`4px solid ${pctColor}`, cursor:'pointer', userSelect:'none', borderRadius:'10px 10px 0 0', border:`1px solid ${wT().border}`, borderBottom: reviewOpen ? `1px solid ${wT().border}` : 'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <div style={{ fontSize:11, fontWeight:700, color:pctColor, background:`${pctColor}15`, padding:'2px 7px', borderRadius:4, flexShrink:0 }}>{pct}%</div>
          <span style={{ fontSize:13, fontWeight:600, color:wT().text, lineHeight:1.4, flex:1 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'#4d9fff', background:'rgba(77,159,255,0.12)', padding:'1px 5px', borderRadius:3, marginRight:6, verticalAlign:'middle' }}>KR</span>
            {kr.title}
          </span>
          <span style={{ fontSize:11, color:wT().textMuted, flexShrink:0 }}>{kr.current}{kr.unit} / {kr.target}{kr.unit}</span>
          {kr.owner && <OwnerBadge name={kr.owner} members={members} size={20} />}
          <div onClick={e => e.stopPropagation()} style={{ flexShrink:0 }}>
            <select value={kr.owner||''} onChange={e => onKROwnerChange(kr.id, e.target.value)}
              style={{ background:wT().bgCard2, border:`1px solid ${wT().borderMid}`, borderRadius:5, padding:'3px 8px', color:kr.owner?avatarColor(kr.owner):wT().textMuted, fontSize:11, cursor:'pointer', fontFamily:'inherit', outline:'none', minWidth:80 }}>
              <option value="">KR担当</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <span style={{ fontSize:13, letterSpacing:1, flexShrink:0, color:starCfg.color }}>{'★'.repeat(stars)}{'☆'.repeat(5-stars)}</span>
          {!reviewOpen && weather > 0 && <span style={{ fontSize:18 }}>{WEATHER_CFG[weather]?.icon}</span>}
          <span style={{ fontSize:11, color:wT().textFaint, transform:reviewOpen?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s', flexShrink:0 }}>▾</span>
        </div>
        <div style={{ height:4, borderRadius:2, background:wT().borderLight, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:pctColor, borderRadius:2 }}/>
        </div>
        {!reviewOpen && hasReview && (
          <div style={{ display:'flex', gap:12, marginTop:6, flexWrap:'wrap' }}>
            {good && <div style={{ fontSize:11, color:wT().textSub, display:'flex', gap:4 }}><span style={{ color:'#00d68f', fontSize:10, fontWeight:700 }}>✅</span>{good.slice(0,50)}{good.length>50?'…':''}</div>}
            {more && <div style={{ fontSize:11, color:wT().textSub, display:'flex', gap:4 }}><span style={{ color:'#ff6b6b', fontSize:10, fontWeight:700 }}>🔺</span>{more.slice(0,50)}{more.length>50?'…':''}</div>}
          </div>
        )}
      </div>

      {/* KRレビュー */}
      {reviewOpen && (
        <div style={{ padding:'12px 14px', background:wT().bgCard2, border:`1px solid ${wT().border}`, borderTop:'none' }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:16, marginBottom:14, padding:'10px 12px', background:wT().bgCard, borderRadius:8, border:`1px solid ${wT().border}` }}>
            <div style={{ borderRight:`1px solid ${wT().border}`, paddingRight:16 }}>
              <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>KR達成評価（自動）</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ fontSize:22, letterSpacing:2, color:starCfg.color }}>{'★'.repeat(stars)}<span style={{ color:wT().borderMid }}>{'★'.repeat(5-stars)}</span></div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:starCfg.color }}>{starCfg.label}</div>
                  <div style={{ fontSize:10, color:wT().textMuted }}>達成率 {pct}%</div>
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>今週の体感・主観</div>
              <WeatherPicker value={weather} onChange={setWeather} wT={wT} />
            </div>
          </div>
          {/* KR編集セクション */}
          <div style={{ marginBottom:12, padding:'10px 12px', background:wT().bgCard, borderRadius:8, border:`1px solid ${krEditing?'rgba(255,159,67,0.4)':wT().border}`, transition:'border-color 0.15s' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:krEditing?8:0 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#ff9f43', textTransform:'uppercase', letterSpacing:'0.08em' }}>📝 KR設定</div>
              {!krEditing && (
                <button onClick={() => setKrEditing(true)} style={{ fontSize:10, padding:'3px 10px', borderRadius:5, border:`1px solid rgba(255,159,67,0.3)`, background:'rgba(255,159,67,0.08)', color:'#ff9f43', cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>編集</button>
              )}
            </div>
            {!krEditing ? (
              <div style={{ display:'flex', gap:16, alignItems:'center', marginTop:6, fontSize:12, color:wT().textSub }}>
                <span>タイトル: <b style={{ color:wT().text }}>{kr.title}</b></span>
                <span>現在値: <b style={{ color:pctColor }}>{kr.current}{kr.unit}</b></span>
                <span>目標: <b style={{ color:wT().text }}>{kr.target}{kr.unit}</b></span>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom:6 }}>
                  <div style={{ fontSize:10, color:wT().textMuted, marginBottom:3 }}>タイトル</div>
                  <input value={krTitle} onChange={e=>setKrTitle(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit' }} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:10, color:wT().textMuted, marginBottom:3 }}>現在値</div>
                    <input type="number" value={krCurrent} onChange={e=>setKrCurrent(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:pctColor, fontSize:13, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:wT().textMuted, marginBottom:3 }}>目標値</div>
                    <input type="number" value={krTarget} onChange={e=>setKrTarget(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:13, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:wT().textMuted, marginBottom:3 }}>単位</div>
                    <input value={krUnit} onChange={e=>setKrUnit(e.target.value)} placeholder="件, %, 万円..." style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit' }} />
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:6 }}>
                  <button onClick={() => { setKrEditing(false); setKrTitle(kr.title||''); setKrCurrent(String(kr.current??'')); setKrTarget(String(kr.target??'')); setKrUnit(kr.unit||'') }}
                    style={{ padding:'4px 10px', borderRadius:6, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>キャンセル</button>
                  <button onClick={saveKR} disabled={krSaving}
                    style={{ padding:'4px 14px', borderRadius:6, background:krSaved?'#00d68f':'#ff9f43', border:'none', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    {krSaved?'✓ 保存済み':krSaving?'保存中...':'KRを保存'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#00d68f', background:'rgba(0,214,143,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>✅ Good</div>
              <textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} style={taS} onFocus={e=>e.target.style.borderColor='rgba(0,214,143,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#ff6b6b', background:'rgba(255,107,107,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>🔺 More</div>
              <textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} style={taS} onFocus={e=>e.target.style.borderColor='rgba(255,107,107,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ flex:1, height:1, background:wT().border }}/><span style={{ fontSize:10, color:wT().textMuted }}>↓ Moreへの対応</span><div style={{ flex:1, height:1, background:wT().border }}/>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#4d9fff', background:'rgba(77,159,255,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>🎯 今週の注力アクション</div>
            <textarea value={focus} onChange={e=>setFocus(e.target.value)} rows={2} style={taS} onFocus={e=>e.target.style.borderColor='rgba(77,159,255,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button onClick={()=>setReviewOpen(false)} style={{ padding:'5px 12px', borderRadius:6, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={saveReview} disabled={reviewSaving} style={{ padding:'5px 16px', borderRadius:6, background:reviewSaved?'#00d68f':'#4d9fff', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background 0.3s' }}>
              {reviewSaved?'✓ 保存済み':reviewSaving?'保存中...':'保存'}
            </button>
          </div>
        </div>
      )}

      {/* KAテーブル */}
      <div style={{ border:`1px solid ${wT().border}`, borderTop: reviewOpen ? 'none' : `1px solid ${wT().border}`, borderRadius: reviewOpen ? '0 0 10px 10px' : '0 0 10px 10px', overflow:'visible' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
          <colgroup>
            <col style={{ width:28 }} />
            <col style={{ width:90 }} />
            <col style={{ width:'18%' }} />
            <col style={{ width:70 }} />
            <col />
            <col />
            <col />
            <col style={{ width:70 }} />
            <col style={{ width:20 }} />
          </colgroup>
          <thead>
            <tr style={{ background:wT().bgCard }}>
              <th style={{ padding:'6px 4px', fontSize:9, color:wT().textMuted, fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'center' }}></th>
              <th style={{ padding:'6px 8px', fontSize:9, color:wT().textMuted, fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>担当</th>
              <th style={{ padding:'6px 8px', fontSize:9, color:wT().textMuted, fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>KAタイトル</th>
              <th style={{ padding:'6px 8px', fontSize:9, color:wT().textMuted, fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'center' }}>状態</th>
              <th style={{ padding:'6px 8px', fontSize:9, color:'#00d68f', fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>✅ Good</th>
              <th style={{ padding:'6px 8px', fontSize:9, color:'#ff6b6b', fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>🔺 More</th>
              <th style={{ padding:'6px 8px', fontSize:9, color:'#4d9fff', fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>🎯 Focus</th>
              <th style={{ padding:'6px 8px', fontSize:9, color:wT().textMuted, fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'center' }}>Tasks</th>
              <th style={{ padding:'6px 2px', borderBottom:`1px solid ${wT().border}` }}></th>
            </tr>
          </thead>
          <tbody>
            {activeReports.map((r, idx) => (
              <KARow key={r.id} report={r} onSave={onSaveKA} onDelete={onDeleteKA} members={members} wT={wT}
                canEdit={canEditKA(r.owner, objOwner)}
                dragIdx={dragIdx} overIdx={overIdx} rowIdx={idx}
                dragHandleProps={{ draggable:true, onDragStart:() => handleDragStart(idx), onDragEnd:handleDragEnd }}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                objectiveTitle={objectiveTitle} completedBy={completedBy} />
            ))}
          </tbody>
        </table>

        {/* 完了済みKA（折りたたみ） */}
        {doneReports.length > 0 && (
          <div style={{ padding:'4px 12px', background:wT().bgCard, borderTop:`1px solid ${wT().border}` }}>
            <button onClick={() => setShowDone(p=>!p)}
              style={{ fontSize:10, color:wT().textFaint, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit' }}>
              {showDone ? '完了を隠す' : `✓ 完了済み ${doneReports.length}件`}
            </button>
          </div>
        )}
        {showDone && doneReports.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:28 }} />
              <col style={{ width:90 }} />
              <col style={{ width:'18%' }} />
              <col style={{ width:70 }} />
              <col />
              <col />
              <col />
              <col style={{ width:70 }} />
              <col style={{ width:20 }} />
            </colgroup>
            <tbody>
              {doneReports.map(r => (
                <KARow key={r.id} report={r} onSave={onSaveKA} onDelete={onDeleteKA} members={members} wT={wT}
                  canEdit={canEditKA(r.owner, objOwner)} objectiveTitle={objectiveTitle} completedBy={completedBy} />
              ))}
            </tbody>
          </table>
        )}

        {/* KA追加ボタン */}
        <div onClick={addKA} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', cursor:'pointer', color:wT().textMuted, fontSize:11, borderTop:`1px solid ${wT().border}`, background:wT().bgCard }}>
          <span style={{ fontSize:14, lineHeight:1 }}>+</span> このKRにKAを追加
        </div>
      </div>
    </div>
  )
}

// ─── メインページ ──────────────────────────────────────────────────────────────
function getCurrentQ() { const m = new Date().getMonth(); return m >= 3 && m <= 5 ? 'q1' : m >= 6 && m <= 8 ? 'q2' : m >= 9 && m <= 11 ? 'q3' : 'q4' }
export default function WeeklyMTGPage({ levels, themeKey='dark', fiscalYear='2026', user, initialPeriod }) {
  const wT = () => W_THEMES[themeKey] || W_THEMES.dark
  const [reports,       setReports]       = useState([])
  const [objectives,    setObjectives]    = useState([])
  const [keyResults,    setKeyResults]    = useState([])
  const [members,       setMembers]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [activeLevelId, setActiveLevelId] = useState(null)
  const [activeObjId,   setActiveObjId]   = useState(null)
  const [activePeriod,  setActivePeriod]  = useState(initialPeriod || getCurrentQ())
  const [activeWeek,    setActiveWeek]    = useState(toDateStr(getMonday(new Date())))
  const [slackPreview,  setSlackPreview]  = useState(null) // { text, type, memberCount, levelName, params }
  const [slackSending,  setSlackSending]  = useState(false)

  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period,owner,parent_objective_id').order('level_id').then(({data})=>setObjectives(data||[]))
    supabase.from('key_results').select('*').order('objective_id').then(({data})=>setKeyResults((data||[]).map(kr => kr.current === undefined && kr.current_value !== undefined ? { ...kr, current: kr.current_value } : kr)))
    supabase.from('members').select('*').order('name').then(({data, error})=>{ if(error) console.error('members load error:', error); setMembers(data||[]) })
  }, [])

  useEffect(() => {
    setLoading(true)
    supabase.from('weekly_reports').select('*').order('sort_order').order('id')
      .then(({data, error}) => {
        if (error) {
          console.warn('sort_order order failed, falling back:', error.message)
          return supabase.from('weekly_reports').select('*').order('id')
        }
        return { data, error: null }
      })
      .then(({data}) => { setReports(data||[]); setLoading(false) })
  }, [])

  // ★ 週一覧をreportsのweek_startから計算（既存の週 + 今週）
  const weeksList = (() => {
    const thisMonday = toDateStr(getMonday(new Date()))
    const set = new Set([thisMonday])
    reports.forEach(r => { if (r.week_start) set.add(r.week_start) })
    return [...set].sort()
  })()

  // ★ 金曜日に翌週分を自動作成（createWeekで重複チェック済み）
  useEffect(() => {
    if (!isFriday()) return
    if (reports.length === 0) return
    const nextMon = getNextMonday()
    const thisMonday = toDateStr(getMonday(new Date()))
    const thisWeekKAs = reports.filter(r => r.week_start === thisMonday && r.status !== 'done')
    if (thisWeekKAs.length === 0) return
    // 既にコピー済みのものはcreateWeek内でスキップされる
    createWeek(nextMon)
  }, [reports.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = async () => {
    let { data, error } = await supabase.from('weekly_reports').select('*').order('sort_order').order('id')
    if (error) {
      const res = await supabase.from('weekly_reports').select('*').order('id')
      data = res.data
    }
    setReports(data||[])
  }

  // ★ Supabase Realtime購読（weekly_reports変更を即時同期）
  useEffect(() => {
    const channel = supabase
      .channel('weekly_mtg_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_reports' }, payload => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setReports(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
        } else if (payload.eventType === 'INSERT' && payload.new) {
          setReports(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setReports(prev => prev.filter(r => r.id !== payload.old.id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ★ 手動で週を作成（前週のKAをKR単位でコピー、既存KRはスキップ）
  const copyingRef = useRef(new Set())
  const createWeek = async (targetMonday) => {
    // 多重実行防止
    if (copyingRef.current.has(targetMonday)) return
    copyingRef.current.add(targetMonday)
    try {
      // 直近の既存週からコピー
      const prevWeeks = weeksList.filter(w => w < targetMonday)
      const srcWeek = prevWeeks.length > 0 ? prevWeeks[prevWeeks.length - 1] : null
      if (!srcWeek) return

      const srcKAs = reports.filter(r => r.week_start === srcWeek && r.status !== 'done')
      if (srcKAs.length === 0) return

      // DB上の対象週データを直接取得（stateとのズレを防止）
      const { data: existingData } = await supabase.from('weekly_reports').select('kr_id,ka_title').eq('week_start', targetMonday)
      const existingKeys = new Set((existingData || []).map(r => `${r.kr_id}_${r.ka_title}`))

      // 未コピーのKAのみ抽出
      const toCopy = srcKAs.filter(r => !existingKeys.has(`${r.kr_id}_${r.ka_title}`))
      if (toCopy.length === 0) return

      const copies = toCopy.map(r => ({
        week_start: targetMonday, level_id: r.level_id, objective_id: r.objective_id,
        kr_id: r.kr_id, kr_title: r.kr_title, ka_title: r.ka_title,
        owner: r.owner, status: 'normal',
      }))
      await supabase.from('weekly_reports').insert(copies)
      await reload()
      setActiveWeek(targetMonday)
    } finally {
      copyingRef.current.delete(targetMonday)
    }
  }

  // ★ 週を開いた時に前週から未コピーKAを自動補完
  useEffect(() => {
    if (!activeWeek || loading || reports.length === 0) return
    const prevWeeks = weeksList.filter(w => w < activeWeek)
    if (prevWeeks.length === 0) return
    const srcWeek = prevWeeks[prevWeeks.length - 1]
    const srcKAs = reports.filter(r => r.week_start === srcWeek && r.status !== 'done')
    const existingKeys = new Set(
      reports.filter(r => r.week_start === activeWeek)
        .map(r => `${r.kr_id}_${r.ka_title}`)
    )
    const missing = srcKAs.filter(r => !existingKeys.has(`${r.kr_id}_${r.ka_title}`))
    if (missing.length > 0) {
      createWeek(activeWeek)
    }
  }, [activeWeek, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ★ 翌週分を手動作成
  const createNextWeek = () => {
    const lastWeek = weeksList.length > 0 ? weeksList[weeksList.length - 1] : toDateStr(getMonday(new Date()))
    const nextMon = new Date(lastWeek)
    nextMon.setDate(nextMon.getDate() + 7)
    createWeek(toDateStr(nextMon))
  }
  const handleSave   = (updated) => setReports(p => p.map(r => r.id===updated.id ? updated : r))
  const handleDelete = async (id) => {
    if (!window.confirm('削除しますか？')) return
    await supabase.from('weekly_reports').delete().eq('id', id)
    setReports(p => p.filter(r => r.id!==id))
  }
  const handleKROwnerChange = async (krId, newOwner) => {
    const { error } = await supabase.from('key_results').update({ owner: newOwner }).eq('id', krId)
    if (error) { console.error('KR owner update failed:', error); alert('KR担当者の保存に失敗しました。DBにownerカラムが必要です。'); return }
    setKeyResults(p => p.map(kr => kr.id === krId ? { ...kr, owner: newOwner } : kr))
  }
  const handleKRUpdate = async (krId, fields) => {
    const { error } = await supabase.from('key_results').update(fields).eq('id', krId)
    if (error) { console.error('KR update failed:', error); return false }
    setKeyResults(p => p.map(kr => kr.id === krId ? { ...kr, ...fields } : kr))
    return true
  }

  const myMember = members.find(m => m.email === user?.email)
  const myName   = myMember?.name || ''
  const isAdmin  = myMember?.is_admin === true
  const canEditKA = useCallback((kaOwner, objOwner) => {
    if (isAdmin) return true                          // 管理者は全KA編集可
    if (!kaOwner || kaOwner==='') return true          // 未設定は誰でも編集可
    if (!myName) return false
    if (myName === kaOwner) return true                // KA担当者本人
    if (objOwner && myName === objOwner) return true   // Objective責任者
    return false
  }, [myName, isAdmin])

  // 年度・部署フィルタ（左パネルは通期OKRのみ表示）
  const visibleLevelIds = activeLevelId ? [Number(activeLevelId)] : levels.map(l=>l.id)
  const visibleLevels = levels.filter(l => visibleLevelIds.includes(Number(l.id)))
  const annualPeriodKey = fiscalYear === '2026' ? 'annual' : `${fiscalYear}_annual`
  const visibleObjs = objectives.filter(o => {
    const levelOk = visibleLevels.some(l => Number(l.id)===Number(o.level_id))
    if (!levelOk) return false
    return o.period === annualPeriodKey
  })

  const selectedObj    = activeObjId ? objectives.find(o => o.id===Number(activeObjId)) : null
  const [rightPeriod, setRightPeriod] = useState(getCurrentQ())
  // 右パネル：期間タブに応じたOKRを表示（buildQuarterMapで通期→四半期の正確なマッピングを使用）
  const annualObjsForMap = useMemo(() =>
    objectives.filter(o => o.period === annualPeriodKey), [objectives, annualPeriodKey])
  const quarterObjsForMap = useMemo(() =>
    objectives.filter(o => ['q1','q2','q3','q4'].some(q => o.period?.endsWith(q))), [objectives])
  const quarterMap = useMemo(() =>
    buildQuarterMap(annualObjsForMap, quarterObjsForMap), [annualObjsForMap, quarterObjsForMap])
  const rightObj = useMemo(() => {
    if (!selectedObj) return null
    if (rightPeriod === 'annual') return selectedObj
    // まずquarterMapで検索
    const fromMap = (quarterMap[selectedObj.id]?.[rightPeriod] || [])[0]
    if (fromMap) return fromMap
    // フォールバック：objectives全体からperiodとlevel_idでマッチング
    return objectives.find(o =>
      o.period === rightPeriod &&
      (Number(o.parent_objective_id) === Number(selectedObj.id) ||
       Number(o.level_id) === Number(selectedObj.level_id))
    ) || null
  }, [selectedObj, rightPeriod, quarterMap, objectives])
  const selectedObjKRs = useMemo(() => {
    if (!rightObj && rightPeriod !== 'annual' && selectedObj) {
      // Q期OBJが存在しない場合、通期OBJのKRをperiodでフィルタ
      const annKRs = keyResults.filter(kr => Number(kr.objective_id) === Number(selectedObj.id))
      const filtered = annKRs.filter(kr => kr.period === rightPeriod)
      return filtered.length > 0 ? filtered : []
    }
    return rightObj ? keyResults.filter(kr => Number(kr.objective_id)===Number(rightObj.id)) : []
  }, [rightObj, rightPeriod, selectedObj, keyResults])
  const depth          = selectedObj ? getDepth(selectedObj.level_id, levels) : 0
  const objColor       = LAYER_COLORS[depth] || '#a0a8be'

  // ★ 選択中の週のレポートのみ
  const weekReports = activeWeek ? reports.filter(r => r.week_start === activeWeek) : reports

  // ★ KRの達成状況を判定（100%以上 = 達成済み）
  const isKRDone = (kr) => kr.target > 0 && kr.current >= kr.target

  // ★ Objectiveの達成状況（全KRが100%以上）
  const isObjDone = (obj) => {
    const krs = keyResults.filter(kr => Number(kr.objective_id)===Number(obj.id))
    return krs.length > 0 && krs.every(kr => isKRDone(kr))
  }

  // ★ 達成済みObjを別に分離
  const activeObjs = visibleObjs.filter(o => !isObjDone(o))
  const doneObjs   = visibleObjs.filter(o => isObjDone(o))
  const [showDoneObjs, setShowDoneObjs] = useState(false)

  const roots = levels.filter(l => !l.parent_id)
  function renderSb(level, indent=0) {
    const d = getDepth(level.id, levels)
    const color = LAYER_COLORS[d] || '#a0a8be'
    const isActive = Number(activeLevelId)===Number(level.id)
    return (
      <div key={level.id}>
        <div onClick={()=>{ setActiveLevelId(isActive?null:level.id); setActiveObjId(null) }}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', paddingLeft:8+indent*14, borderRadius:7, cursor:'pointer', marginBottom:2, border:`1px solid ${isActive?color+'40':'transparent'}`, background:isActive?`${color}18`:'transparent' }}>
          <span style={{ fontSize:13 }}>{level.icon}</span>
          <span style={{ fontSize:11, flex:1, fontWeight:isActive?700:500, color:isActive?color:wT().textSub }}>{level.name}</span>
        </div>
        {levels.filter(l=>Number(l.parent_id)===Number(level.id)).map(c=>renderSb(c, indent+1))}
      </div>
    )
  }

  const periodTabs = [['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['all','通期']]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:wT().bg, color:wT().text, fontFamily:'system-ui,sans-serif' }}>
      {/* ヘッダー */}
      <div style={{ padding:'11px 16px', borderBottom:`1px solid ${wT().border}`, display:'flex', alignItems:'center', gap:8, flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ fontSize:16, fontWeight:700 }}>KAレビュー</div>
        <div style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, background:fiscalYear==='2026'?'rgba(77,159,255,0.15)':'rgba(255,159,67,0.15)', color:fiscalYear==='2026'?'#4d9fff':'#ff9f43', border:`1px solid ${fiscalYear==='2026'?'rgba(77,159,255,0.3)':'rgba(255,159,67,0.3)'}` }}>
          📅 {fiscalYear}年度
        </div>
        {myMember && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:99, background:`${avatarColor(myName)}12`, border:`1px solid ${avatarColor(myName)}30` }}>
            <Avatar name={myName} avatarUrl={myMember.avatar_url} size={18} />
            <span style={{ fontSize:11, color:avatarColor(myName), fontWeight:600 }}>{myName}</span>
            <span style={{ fontSize:10, color:wT().textMuted }}>（自分のKAのみ編集可）</span>
          </div>
        )}
        {/* KAステータス凡例 */}
        <div style={{ display:'flex', gap:5, alignItems:'center', marginLeft:'auto', flexWrap:'wrap' }}>
          {Object.entries(STATUS_CFG).filter(([k])=>k!=='done').map(([k,v]) => (
            <span key={k} style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:v.bg, color:v.color, border:`1px solid ${v.border}` }}>{v.label}</span>
          ))}
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:STATUS_CFG.done.bg, color:STATUS_CFG.done.color, border:`1px solid ${STATUS_CFG.done.border}` }}>{STATUS_CFG.done.label}</span>
        </div>
      </div>

      {/* 週タブ */}
      <div style={{ display:'flex', gap:4, padding:'7px 16px', borderBottom:`1px solid ${wT().border}`, flexShrink:0, alignItems:'center', overflowX:'auto' }}>
        <span style={{ fontSize:11, color:wT().textMuted, fontWeight:700, marginRight:4, flexShrink:0 }}>週：</span>
        {weeksList.map(w => {
          const isActive = activeWeek === w
          const thisMonday = toDateStr(getMonday(new Date()))
          const isThisWeek = w === thisMonday
          return (
            <button key={w} onClick={() => setActiveWeek(w)} style={{
              padding:'4px 12px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, flexShrink:0,
              background: isActive ? 'rgba(77,159,255,0.15)' : 'transparent',
              border: `1px solid ${isActive ? 'rgba(77,159,255,0.4)' : wT().borderMid}`,
              color: isActive ? '#4d9fff' : wT().textMuted,
            }}>
              {formatWeekLabel(w)}{isThisWeek ? ' (今週)' : ''}
            </button>
          )
        })}
        <button onClick={createNextWeek} style={{
          padding:'4px 10px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, flexShrink:0,
          background:'rgba(0,214,143,0.1)', border:'1px solid rgba(0,214,143,0.3)', color:'#00d68f',
        }}>＋ 翌週を作成</button>
        {isAdmin && (
          <button onClick={async () => {
            try {
              const params = new URLSearchParams({ type: 'tasks', week: activeWeek, preview: 'true' })
              if (activeLevelId) params.set('levelId', activeLevelId)
              const res = await fetch(`/api/slack-reminder?${params}`, { method: 'POST' })
              const json = await res.json()
              if (json.error) { alert('エラー: ' + json.error); return }
              if (json.memberCount === 0) { alert(json.message || '通知対象のメンバーがいません'); return }
              // プレビュー用のパラメータ（送信時に再利用）
              const sendParams = new URLSearchParams({ type: 'tasks', week: activeWeek })
              if (activeLevelId) sendParams.set('levelId', activeLevelId)
              setSlackPreview({ text: json.text, type: json.type, memberCount: json.memberCount, levelName: json.levelName, params: sendParams.toString(), hasPerDeptWebhooks: json.hasPerDeptWebhooks })
            } catch (e) { alert('プレビュー取得エラー: ' + e.message) }
          }} style={{
            padding:'4px 10px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, flexShrink:0,
            background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.3)', color:'#a855f7', marginLeft:8,
          }}>📨 Slackに通知</button>
        )}
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* 部署サイドバー */}
        <div style={{ width:155, flexShrink:0, borderRight:`1px solid ${wT().border}`, padding:'10px 8px', overflowY:'auto', background:wT().bgSidebar }}>
          <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, paddingLeft:8 }}>部署</div>
          <div onClick={()=>{setActiveLevelId(null);setActiveObjId(null)}} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:7, cursor:'pointer', marginBottom:2, border:`1px solid ${!activeLevelId?'rgba(77,159,255,0.3)':'transparent'}`, background:!activeLevelId?'rgba(77,159,255,0.12)':'transparent' }}>
            <span>🏢</span><span style={{ fontSize:11, flex:1, fontWeight:!activeLevelId?700:500, color:!activeLevelId?'#4d9fff':wT().textSub }}>全部署</span>
          </div>
          {roots.map(r=>renderSb(r,0))}
        </div>

        {/* Objective一覧 */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${wT().border}`, overflowY:'auto', padding:10, background:wT().bg }}>
          <div style={{ fontSize:10, color:'#4d9fff', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>🎯 Objective（{activeObjs.length}件）</div>
          {visibleObjs.length===0 && <div style={{ fontSize:12, color:wT().textFaintest, fontStyle:'italic', padding:'10px 4px' }}>Objectiveがありません</div>}

          {/* アクティブなObjective */}
          {activeObjs.map(obj => {
            const isActive = Number(activeObjId)===Number(obj.id)
            const d = getDepth(obj.level_id, levels)
            const color = LAYER_COLORS[d] || '#a0a8be'
            const level = levels.find(l=>Number(l.id)===Number(obj.level_id))
            const krs = keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id))
            const kaCount = weekReports.filter(r=>Number(r.objective_id)===Number(obj.id)&&r.status!=='done').length
            return (
              <div key={obj.id} onClick={()=>{setActiveObjId(isActive?null:obj.id);setRightPeriod('annual')}} style={{ padding:'10px 12px', borderRadius:9, marginBottom:7, cursor:'pointer', border:`1px solid ${isActive?color+'60':wT().border}`, background:isActive?`${color}10`:wT().bgCard, transition:'all 0.12s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:99, background:`${color}18`, color }}>{getPeriodLabel(obj.period)}</span>
                  {level && <span style={{ fontSize:10, color:wT().textMuted }}>{level.icon} {level.name}</span>}
                </div>
                <div style={{ fontSize:12, fontWeight:600, lineHeight:1.4, marginBottom:5, color:isActive?wT().text:wT().textSub }}>{obj.title}</div>
                {obj.owner && <div style={{ marginBottom:5 }}><OwnerBadge name={obj.owner} members={members} size={16} /></div>}
                <div style={{ display:'flex', gap:8, fontSize:10, color:wT().textMuted }}>
                  <span>KR {krs.length}件</span>
                  <span style={{ color:kaCount>0?'#4d9fff':wT().textFaint }}>KA {kaCount}件</span>
                </div>
              </div>
            )
          })}

          {/* ★ 達成済みObjective（折りたたみ） */}
          {doneObjs.length > 0 && (
            <div style={{ marginTop:8 }}>
              <button onClick={() => setShowDoneObjs(p=>!p)} style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:`1px solid rgba(0,214,143,0.2)`, background:'rgba(0,214,143,0.05)', color:'#00d68f', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                🏆 達成済み {doneObjs.length}件 {showDoneObjs?'▲':'▼'}
              </button>
              {showDoneObjs && doneObjs.map(obj => {
                const isActive = Number(activeObjId)===Number(obj.id)
                const d = getDepth(obj.level_id, levels)
                const color = LAYER_COLORS[d] || '#a0a8be'
                const level = levels.find(l=>Number(l.id)===Number(obj.level_id))
                return (
                  <div key={obj.id} onClick={()=>{setActiveObjId(isActive?null:obj.id);setRightPeriod('annual')}} style={{ padding:'9px 12px', borderRadius:9, marginTop:5, cursor:'pointer', border:`1px solid ${isActive?'rgba(0,214,143,0.5)':'rgba(0,214,143,0.15)'}`, background:isActive?'rgba(0,214,143,0.1)':'rgba(0,214,143,0.04)', transition:'all 0.12s', opacity:0.8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                      <span style={{ fontSize:11 }}>🏆</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:99, background:'rgba(0,214,143,0.15)', color:'#00d68f' }}>{getPeriodLabel(obj.period)}</span>
                      {level && <span style={{ fontSize:10, color:wT().textMuted }}>{level.icon} {level.name}</span>}
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, lineHeight:1.4, color:'#00d68f' }}>{obj.title}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 右：KR + KA詳細 */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', background:wT().bgCard2 }}>
          {!selectedObj ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:10, color:wT().textFaint }}>
              <div style={{ fontSize:36 }}>🎯</div>
              <div style={{ fontSize:13 }}>左のObjectiveをクリックしてください</div>
            </div>
          ) : (
            <>
              {/* 通期Objectiveヘッダー */}
              <div style={{ padding:'12px 14px', background:`${objColor}0e`, border:`1px solid ${objColor}30`, borderLeft:`4px solid ${objColor}`, borderRadius:10, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:`${objColor}20`, color:objColor }}>通期</span>
                  <span style={{ fontSize:10, color:wT().textMuted }}>Objective</span>
                  {selectedObj.owner && <div style={{ marginLeft:'auto' }}><OwnerBadge name={selectedObj.owner} members={members} size={24} /></div>}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:wT().text, lineHeight:1.5 }}>{selectedObj.title}</div>
              </div>

              {/* 期間切替タブ */}
              <div style={{ display:'flex', gap:4, marginBottom:14 }}>
                {[['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['annual','通期']].map(([key,lbl]) => (
                  <button key={key} onClick={()=>setRightPeriod(key)} style={{ padding:'5px 14px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, background:rightPeriod===key?'rgba(77,159,255,0.15)':'transparent', border:`1px solid ${rightPeriod===key?'rgba(77,159,255,0.4)':wT().borderMid}`, color:rightPeriod===key?'#4d9fff':wT().textMuted }}>{lbl}</button>
                ))}
              </div>

              {/* 選択期間のObjective表示 */}
              {rightObj && rightPeriod !== 'annual' && (
                <div style={{ padding:'10px 14px', background: isObjDone(rightObj)?'rgba(0,214,143,0.08)':wT().bgCard, border:`1px solid ${isObjDone(rightObj)?'rgba(0,214,143,0.3)':wT().border}`, borderRadius:8, marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:'rgba(77,159,255,0.15)', color:'#4d9fff' }}>{getPeriodLabel(rightObj.period)}</span>
                    <span style={{ fontSize:10, color:wT().textMuted }}>Objective</span>
                    {isObjDone(rightObj) && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'rgba(0,214,143,0.15)', color:'#00d68f' }}>🏆 達成済み</span>}
                    {rightObj.owner && <div style={{ marginLeft:'auto' }}><OwnerBadge name={rightObj.owner} members={members} size={22} /></div>}
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color: isObjDone(rightObj)?'#00d68f':wT().text, lineHeight:1.4 }}>{rightObj.title}</div>
                </div>
              )}
              {!rightObj && rightPeriod !== 'annual' && selectedObjKRs.length === 0 && (
                <div style={{ textAlign:'center', padding:30, color:wT().textFaint, fontSize:12 }}>この期間のOKRはまだ設定されていません</div>
              )}
              {!rightObj && rightPeriod !== 'annual' && selectedObjKRs.length > 0 && (
                <div style={{ padding:'10px 14px', background: wT().bgCard, border: `1px solid ${wT().border}`, borderRadius:8, marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:wT().textSub, marginBottom:4 }}>
                    {rightPeriod.toUpperCase()} ― 通期OKRのKR
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:wT().text, lineHeight:1.4 }}>{selectedObj?.title}</div>
                </div>
              )}

              {rightObj && selectedObjKRs.length===0 && <div style={{ textAlign:'center', padding:30, color:wT().textFaint, fontSize:12 }}>KRが登録されていません。OKRページからKRを追加してください。</div>}
              {loading && <div style={{ textAlign:'center', padding:20, color:'#4d9fff', fontSize:13 }}>読み込み中...</div>}
              {!loading && rightObj && selectedObjKRs.map(kr => (
                <KRBlock
                  key={kr.id}
                  kr={kr}
                  reports={weekReports}
                  onAddKA={reload}
                  onSaveKA={handleSave}
                  onDeleteKA={handleDelete}
                  members={members}
                  wT={wT}
                  levelId={rightObj.level_id}
                  objId={rightObj.id}
                  objOwner={rightObj.owner}
                  canEditKA={canEditKA}
                  onKROwnerChange={handleKROwnerChange}
                  onKRUpdate={handleKRUpdate}
                  activeWeek={activeWeek}
                  onReorder={reload}
                  objectiveTitle={rightObj.title}
                  completedBy={myName}
                  weeksList={weeksList}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Slack通知プレビューモーダル */}
      {slackPreview && (
        <div onClick={() => { if (!slackSending) setSlackPreview(null) }} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:wT().bgCard, border:`1px solid ${wT().border}`, borderRadius:14,
            width:'100%', maxWidth:640, maxHeight:'80vh', display:'flex', flexDirection:'column',
            boxShadow:'0 20px 60px rgba(0,0,0,0.5)',
          }}>
            {/* ヘッダー */}
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'14px 18px', borderBottom:`1px solid ${wT().border}`,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:16 }}>📨</span>
                <span style={{ fontSize:14, fontWeight:700, color:wT().text }}>Slack通知プレビュー</span>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:'rgba(168,85,247,0.12)', color:'#a855f7', fontWeight:600 }}>
                  {slackPreview.levelName || '全部署'} ・ {slackPreview.memberCount}名
                </span>
              </div>
              <button onClick={() => setSlackPreview(null)} disabled={slackSending} style={{
                background:'transparent', border:'none', color:wT().textMuted, fontSize:18, cursor:'pointer', padding:'2px 6px',
              }}>✕</button>
            </div>

            {/* メッセージ本文 */}
            <div style={{
              flex:1, overflowY:'auto', padding:'16px 18px',
              fontFamily:'monospace', fontSize:12, lineHeight:1.7,
              color:wT().text, whiteSpace:'pre-wrap', wordBreak:'break-word',
              background:wT().bgCard2, borderBottom:`1px solid ${wT().border}`,
            }}>
              {slackPreview.text || '(メッセージなし)'}
            </div>

            {/* フッター */}
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10,
              padding:'12px 18px',
            }}>
              <button onClick={() => setSlackPreview(null)} disabled={slackSending} style={{
                padding:'7px 16px', borderRadius:8, cursor:'pointer', fontFamily:'inherit',
                fontSize:12, fontWeight:600, background:'transparent',
                border:`1px solid ${wT().borderMid}`, color:wT().textSub,
              }}>キャンセル</button>
              {slackPreview.hasPerDeptWebhooks && (
                <button
                  disabled={slackSending}
                  onClick={async () => {
                    setSlackSending(true)
                    try {
                      const res = await fetch(`/api/slack-reminder?${slackPreview.params}&perDept=true`, { method: 'POST' })
                      const json = await res.json()
                      if (json.error) { alert('送信失敗: ' + json.error); setSlackSending(false); return }
                      setSlackPreview(null)
                      setSlackSending(false)
                      alert(`部署別チャンネルに通知しました（${json.channelCount}チャンネル, ${json.memberCount}名分）`)
                    } catch (e) { alert('送信エラー: ' + e.message); setSlackSending(false) }
                  }}
                  style={{
                    padding:'7px 16px', borderRadius:8, cursor: slackSending ? 'wait' : 'pointer',
                    fontFamily:'inherit', fontSize:12, fontWeight:700,
                    background: slackSending ? 'rgba(0,214,143,0.3)' : 'rgba(0,214,143,0.12)',
                    border:'1px solid rgba(0,214,143,0.3)', color:'#00d68f',
                    opacity: slackSending ? 0.7 : 1,
                  }}
                >{slackSending ? '送信中...' : '🏢 部署別に送信'}</button>
              )}
              <button
                disabled={slackSending}
                onClick={async () => {
                  setSlackSending(true)
                  try {
                    const res = await fetch(`/api/slack-reminder?${slackPreview.params}`, { method: 'POST' })
                    const json = await res.json()
                    if (json.error) { alert('送信失敗: ' + json.error); setSlackSending(false); return }
                    setSlackPreview(null)
                    setSlackSending(false)
                    alert(`Slackに通知しました（${json.levelName}: ${json.memberCount}名分）`)
                  } catch (e) { alert('送信エラー: ' + e.message); setSlackSending(false) }
                }}
                style={{
                  padding:'7px 20px', borderRadius:8, cursor: slackSending ? 'wait' : 'pointer',
                  fontFamily:'inherit', fontSize:12, fontWeight:700,
                  background: slackSending ? 'rgba(168,85,247,0.3)' : '#a855f7',
                  border:'none', color:'#fff',
                  opacity: slackSending ? 0.7 : 1,
                }}
              >{slackSending ? '送信中...' : '📨 Slackに送信'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
