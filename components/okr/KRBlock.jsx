'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { avatarColor } from '../../lib/avatarColor'
import { supabase } from '../../lib/supabase'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS } from '../../lib/themeTokens'
import { useAutoSave } from '../../lib/useAutoSave'
import { computeKAKey } from '../../lib/kaKey'
import Icon from '../Icon'
import { kaCellStyle, kaTextareaStyle } from '../../lib/okrKaStyles'
import KATableHeader from './KATableHeader'
import { pctColor as okrPctColor } from '../../lib/okrColors'
import AssigneeChip from './AssigneeChip'
import ProgressBar from './ProgressBar'

// テーマは lib/themeTokens.js で一元管理
const DARK_T  = { ...COMMON_TOKENS.dark }

// ステータス pill を themeTokens の状態色に解決 (枠 + pill のみ、淡グラデ背景は使わない)
function statusCfg(key, T) {
  switch (key) {
    case 'good':   return { label: 'Good',  color: T.success, bg: T.successBg, border: `${T.success}4d` }
    case 'more':   return { label: 'More',  color: T.danger,  bg: T.dangerBg,  border: `${T.danger}4d` }
    case 'focus':  return { label: '注力',  color: T.accent,  bg: T.accentBg,  border: `${T.accent}4d` }
    case 'done':   return { label: '完了',  color: T.textMuted, bg: T.borderLight, border: T.border }
    default:       return { label: '未分類', color: T.textMuted, bg: T.sunken, border: T.border }
  }
}
const STATUS_ORDER = ['normal','focus','good','more','done']

// 達成率 % → 4 段階の状態色 (0-29 danger / 30-59 warn / 60-99 success / 100+ accent)
function pctColorOf(pct, T) { return okrPctColor(T, pct) }

// ─── 週ヘルパー ──────────────────────────────────────────────────────────────
// JST基準で「入力日時を含む週の月曜日(00:00 JST)」を Date(UTC midnight) として返す
function getMonday(d) {
  const dt = typeof d === 'string' ? new Date(d) : (d || new Date())
  const jst = new Date(dt.getTime() + 9 * 3600 * 1000)
  const jstDay = jst.getUTCDay()
  const diff = jstDay === 0 ? -6 : 1 - jstDay
  return new Date(Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + diff
  ))
}
function toDateStr(d) {
  if (typeof d === 'string') return d
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}

// textarea を内容に応じて自動拡張 (KA記入欄用)
function autoGrowTextarea(el, minRows = 3) {
  if (!el) return
  el.style.height = 'auto'
  // フォントサイズ11, lineHeight 1.55 → 1行 ≒ 17px。パディング込みで minRows * 17 + 12
  const minH = minRows * 17 + 12
  el.style.height = Math.max(el.scrollHeight, minH) + 'px'
}

function formatWeekLabel(mondayStr) {
  // mondayStrは "YYYY-MM-DD" を想定（JSTの月曜日）。曜日依存ロジックを避けてパース
  const [y, m, day] = mondayStr.split('-').map(Number)
  // 月曜日から +6 日を足してその週の日曜日を計算（JST曜日にズレがないようUTCで計算）
  const sun = new Date(Date.UTC(y, m - 1, day + 6))
  const m2 = sun.getUTCMonth() + 1
  const d2 = sun.getUTCDate()
  return m === m2 ? `${m}/${day}〜${d2}` : `${m}/${day}〜${m2}/${d2}`
}
// 「先週」の月曜日(週の月曜から-7日)
function getPrevMondayStr(mondayStr) {
  const [y, m, day] = mondayStr.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, day - 7))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,'0')}-${String(prev.getUTCDate()).padStart(2,'0')}`
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
function OwnerBadge({ name, members, size = 18, T = DARK_T }) {
  if (!name) return null
  const m = members.find(x => x.name === name)
  return <AssigneeChip T={T} name={name} avatarUrl={m?.avatar_url} size={size} />
}

// ─── 天気 ──────────────────────────────────────────────────────────────────────
const WEATHER_CFG = [
  { score:0, icon:null,     label:'未選択',      color:'#606880', bg:'rgba(255,255,255,0.05)' },
  { score:1, icon:'storm',  label:'嵐',          color:'#8090b0', bg:'rgba(128,144,176,0.12)' },
  { score:2, icon:'rain',   label:'雨',          color:'#4d9fff', bg:'rgba(77,159,255,0.12)'  },
  { score:3, icon:'cloud',  label:'曇り',        color:'#a0a8be', bg:'rgba(160,168,190,0.12)' },
  { score:4, icon:'partly', label:'晴れのち曇り', color:'#ffd166', bg:'rgba(255,209,102,0.15)' },
  { score:5, icon:'sun',    label:'快晴',        color:'#ff9f43', bg:'rgba(255,159,67,0.12)'  },
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
            style={{ display:'flex', alignItems:'center', gap:5, padding:`6px ${SPACING.md}px`, borderRadius:RADIUS.sm, cursor:'pointer', userSelect:'none', background:on?w.bg:'transparent', border:`1px solid ${on?w.color+'70':wT().borderMid}`, transform:on?'scale(1.06)':'scale(1)', transition:'all 0.15s' }}>
            <span style={{ display:'inline-flex', color:w.color }}><Icon name={w.icon} size={20} /></span>
            <span style={{ ...TYPO.footnote, fontWeight:on?700:500, color:on?w.color:wT().textMuted }}>{w.label}</span>
          </div>
        )
      })}
      {value > 0 && <button onClick={() => onChange(0)} style={{ ...TYPO.caption, fontWeight:600, color:wT().textFaint, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:`${SPACING.xs}px ${SPACING.sm}px`, cursor:'pointer', fontFamily:'inherit' }}>リセット</button>}
    </div>
  )
}

// ─── タスクポップオーバー ──────────────────────────────────────────────────────
function TaskPopover({ report, members, wT, onClose, onTaskCountChange, kaTitle, objectiveTitle, completedBy }) {
  const reportId = report?.id
  const kaKey = computeKAKey(report)
  const [tasks, setTasks] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState({})
  const ref = useRef(null)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  useEffect(() => {
    if (!kaKey) return
    // ka_keyが同じタスクを全て取得（週を跨いで同じKAの全タスク）
    supabase.from('ka_tasks').select('*').eq('ka_key', kaKey).order('id')
      .then(({data}) => { setTasks(data||[]); setLoaded(true) })
  }, [kaKey])

  useEffect(() => {
    if (loaded && onTaskCountChange) {
      const saved = tasks.filter(t => t.id)
      onTaskCountChange({ done: saved.filter(t => t.done).length, total: saved.length })
    }
  }, [tasks, loaded]) // eslint-disable-line

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // タスク追加時に即座にDBに挿入して実IDを取得
  const addTask = async () => {
    const d = { title:'', assignee:null, due_date:null, done:false, report_id:reportId, ka_key:kaKey }
    const {data:ins} = await supabase.from('ka_tasks').insert(d).select().single()
    if (ins) setTasks(p => [...p, ins])
  }
  const updateTask = (key, f, v) => {
    setTasks(p => p.map(t => t.id===key ? {...t,[f]:v} : t))
  }
  const removeTask = async (key) => {
    await supabase.from('ka_tasks').delete().eq('id', key)
    setTasks(p => p.filter(x => x.id!==key))
  }
  const toggleDone = async (key) => {
    const t = tasks.find(x => x.id===key)
    const nd = !t.done
    await supabase.from('ka_tasks').update({ done:nd }).eq('id', key)
    setTasks(p => p.map(x => x.id===key ? {...x,done:nd} : x))
  }
  const saveTask = async (key) => {
    const t = tasksRef.current.find(x => x.id===key)
    if (!t) return
    setSaving(p => ({...p, [key]: true}))
    const d = { title:t.title||'', assignee:t.assignee||null, due_date:t.due_date||null, done:t.done }
    await supabase.from('ka_tasks').update(d).eq('id', t.id)
    setSaving(p => { const n = {...p}; delete n[key]; return n })
  }
  const doneCount = tasks.filter(t=>t.done).length

  return (
    <div ref={ref} style={{ position:'absolute', top:'100%', right:0, zIndex:100, width:420, background:wT().bgCard, border:`1px solid ${wT().borderMid}`, borderRadius:RADIUS.md, boxShadow:SHADOWS.lg, padding:SPACING.md }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:SPACING.sm }}>
        <span style={{ ...TYPO.caption, fontWeight:700, color:'#a855f7', display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="note" size={11} /> タスク {doneCount}/{tasks.length}</span>
        <button onClick={onClose} style={{ marginLeft:'auto', background:'transparent', border:'none', color:wT().textFaint, cursor:'pointer', display:'inline-flex', alignItems:'center' }}><Icon name="cross" size={14} /></button>
      </div>
      {!loaded && <div style={{ ...TYPO.footnote, fontWeight:500, color:wT().textMuted, padding:SPACING.sm }}>読み込み中...</div>}
      {tasks.map(t => {
        const key = t.id; const tc = avatarColor(t.assignee); const isSaving = saving[key]
        return (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:6, padding:`5px ${SPACING.sm}px`, borderRadius:RADIUS.xs + 1, marginBottom:SPACING.xs, background:t.done?wT().borderLight:wT().bgCard, border:`1px solid ${t.done?wT().border:wT().borderMid}`, opacity:t.done?0.6:1 }}>
            <div onClick={()=>toggleDone(key)} style={{ width:16, height:16, borderRadius:RADIUS.xs - 2, border:`1.5px solid ${t.done?wT().success:wT().borderMid}`, background:t.done?wT().success:'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}>
              {t.done && <Icon name="check" size={9} />}
            </div>
            <input value={t.title} onChange={e=>updateTask(key,'title',e.target.value)} placeholder="タスク内容" style={{ flex:1, background:'transparent', border:'none', color:t.done?wT().textMuted:wT().text, ...TYPO.subhead, fontWeight:500, outline:'none', fontFamily:'inherit', textDecoration:t.done?'line-through':'none' }}/>
            <select value={t.assignee||''} onChange={e=>updateTask(key,'assignee',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs - 1, padding:'2px 6px', color:t.assignee?tc:wT().textMuted, ...TYPO.footnote, fontWeight:500, cursor:'pointer', fontFamily:'inherit', outline:'none', flexShrink:0, maxWidth:80 }}>
              <option value="">担当</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <input type="date" value={t.due_date||''} onChange={e=>updateTask(key,'due_date',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs - 1, padding:'2px 6px', color:t.due_date?wT().text:wT().textMuted, ...TYPO.footnote, fontWeight:500, outline:'none', fontFamily:'inherit', flexShrink:0, maxWidth:110 }}/>
            <button onClick={()=>saveTask(key)} disabled={isSaving} style={{ padding:'2px 8px', borderRadius:RADIUS.xs - 2, border:'none', background:isSaving?wT().textMuted:'#a855f7', color:'#fff', ...TYPO.caption, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>{isSaving?'...':'保存'}</button>
            <button onClick={()=>removeTask(key)} style={{ width:18, height:18, borderRadius:RADIUS.xs - 3, border:'none', background:'transparent', color:wT().textFaint, cursor:'pointer', flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center' }}><Icon name="cross" size={12} /></button>
          </div>
        )
      })}
      <div onClick={addTask} style={{ display:'flex', alignItems:'center', gap:6, padding:`5px ${SPACING.sm}px`, borderRadius:RADIUS.xs + 1, border:`1px dashed ${wT().borderMid}`, cursor:'pointer', color:wT().textMuted, ...TYPO.footnote, fontWeight:500, marginTop:2 }}>
        <Icon name="plus" size={13} /> タスクを追加
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
  const cfg = statusCfg(status, wT())
  const ownerMember = members.find(m => m.name === (ownerDraft||report.owner))

  // タスクカウント取得（ka_keyで同じKAの全タスクをカウント）
  const kaKey = computeKAKey(report)
  useEffect(() => {
    if (!kaKey) return
    supabase.from('ka_tasks').select('id,done').eq('ka_key', kaKey)
      .then(({data}) => {
        if (data) setTaskCount({ done:data.filter(t=>t.done).length, total:data.length })
      })
  }, [kaKey])

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

  // KA のタイトル/オーナー変更時に、既存タスクの ka_key を追従更新する
  // （同じKAの他週の行が更新される場合もあるので ka_key 単位で UPDATE）
  const syncTaskKaKey = async (oldKey, newKey) => {
    if (!oldKey || !newKey || oldKey === newKey) return
    await supabase.from('ka_tasks').update({ ka_key: newKey }).eq('ka_key', oldKey)
  }

  // 同じ KA (同じ ka_key) を持つ他週の weekly_reports 行にも同じフィールドを
  // 反映させる。Postgres では owner の NULL と '' が別物扱いになるため、
  // 候補を取得してから JS 側で正規化比較して UPDATE 対象 id を決める。
  const syncSiblingWeeks = async (field, value) => {
    const { data: candidates } = await supabase.from('weekly_reports')
      .select('id, owner')
      .eq('kr_id', report.kr_id)
      .eq('ka_title', report.ka_title || '')
      .eq('objective_id', report.objective_id)
      .neq('id', report.id)
    const targetOwner = (report.owner || '').trim()
    const ids = (candidates || [])
      .filter(r => (r.owner || '').trim() === targetOwner)
      .map(r => r.id)
    if (ids.length === 0) return
    await supabase.from('weekly_reports').update({ [field]: value }).in('id', ids)
  }

  const handleOwnerChange = (val) => {
    setOwnerDraft(val)
    autoSave.save('owner', val)
    onSave({ ...report, owner: val })
    const oldKey = computeKAKey(report)
    const newKey = computeKAKey({ ...report, owner: val })
    syncTaskKaKey(oldKey, newKey)
    // 他週の同じ KA 行の owner も追従
    syncSiblingWeeks('owner', val)
  }

  const handleTitleBlur = () => {
    setEditingTitle(false)
    autoSave.setFocusedField(null)
    if (kaTitle.trim() && kaTitle !== report.ka_title) {
      const newTitle = kaTitle.trim()
      autoSave.saveNow('ka_title', newTitle)
      onSave({ ...report, ka_title: newTitle })
      const oldKey = computeKAKey(report)
      const newKey = computeKAKey({ ...report, ka_title: newTitle })
      syncTaskKaKey(oldKey, newKey)
      // 他週の同じ KA 行の ka_title も追従
      syncSiblingWeeks('ka_title', newTitle)
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

  const cellS = kaCellStyle(wT())
  // KA記入欄 (.cell): 軽い sunken 背景 + 1px 枠 + radius7。改行が気になりすぎないよう
  // fontSize 11、lineHeight 1.55、自動拡張。フォーカス時は状態色に枠が変わる。
  const taS = kaTextareaStyle(wT())
  const isDone = status === 'done'
  const isDragging = dragIdx !== undefined && dragIdx === rowIdx
  const isDragOver = overIdx !== undefined && overIdx === rowIdx && dragIdx !== null && dragIdx !== rowIdx

  return (
    <tr style={{ opacity: isDone ? 0.5 : isDragging ? 0.4 : 1, background: isDone ? wT().borderLight : 'transparent', borderTop: isDragOver ? `2px solid ${wT().accent}` : 'none' }}
      onDragOver={onDragOver} onDrop={onDrop}>
      {/* ドラッグハンドル */}
      <td style={{ ...cellS, width:28, textAlign:'center', cursor:'grab' }}>
        <span {...(dragHandleProps||{})} style={{ color:wT().textFaint, fontSize:13, userSelect:'none' }} title="ドラッグで並べ替え"><Icon name="more" size={14} /></span>
      </td>
      {/* 担当 (アイコンのみ・クリックで担当変更) */}
      <td style={{ ...cellS, width:52 }}>
        {canEdit ? (
          <div style={{ position:'relative', width:22, height:22 }} title={ownerDraft||report.owner||''}>
            <Avatar name={ownerDraft||report.owner} avatarUrl={ownerMember?.avatar_url} size={22} />
            <select value={ownerDraft} onChange={e=>handleOwnerChange(e.target.value)}
              onFocus={()=>autoSave.setFocusedField('owner')} onBlur={()=>autoSave.setFocusedField(null)}
              aria-label="担当" title={ownerDraft||report.owner||'担当'}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0, cursor:'pointer', border:'none', appearance:'none', WebkitAppearance:'none', padding:0, margin:0 }}>
              <option value="">--</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        ) : (
          <Avatar name={ownerDraft||report.owner} avatarUrl={ownerMember?.avatar_url} size={22} title={ownerDraft||report.owner||''} />
        )}
      </td>
      {/* KAタイトル */}
      <td style={{ ...cellS, minWidth:120 }}>
        {editingTitle && canEdit ? (
          <textarea autoFocus value={kaTitle} onChange={e=>setKaTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            rows={2}
            style={{ width:'100%', boxSizing:'border-box', background:wT().bgCard2, border:`1px solid ${wT().accent}80`, borderRadius:RADIUS.xs - 1, padding:`${SPACING.xs}px 6px`, color:wT().text, ...TYPO.subhead, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.5 }} />
        ) : (
          <div onClick={() => { if (canEdit) { setEditingTitle(true); autoSave.setFocusedField('ka_title') } }}
            style={{ ...TYPO.subhead, color:isDone?wT().textMuted:wT().text, textDecoration:isDone?'line-through':'none', cursor:canEdit?'text':'default', lineHeight:1.4, minHeight:20, whiteSpace:'pre-wrap' }}>
            {kaTitle||report.ka_title||'(無題)'}
          </div>
        )}
      </td>
      {/* ステータス */}
      <td style={{ ...cellS, width:70, textAlign:'center' }}>
        <span onClick={canEdit?cycleStatus:undefined}
          style={{ ...TYPO.caption, fontWeight:700, padding:'3px 7px', borderRadius:RADIUS.pill, cursor:canEdit?'pointer':'default', background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, whiteSpace:'nowrap', display:'inline-block' }}>
          {cfg.label}
        </span>
      </td>
      {/* Good */}
      <td style={cellS}>
        <textarea value={good} readOnly={!canEdit}
          ref={el => { if (el) autoGrowTextarea(el, 3) }}
          onChange={e=>{ handleFieldChange('good', e.target.value, setGood); autoGrowTextarea(e.target, 3) }}
          onFocus={e=>{ autoSave.setFocusedField('good'); e.target.style.borderColor=wT().success; autoGrowTextarea(e.target, 5) }}
          onBlur={e=>{ autoSave.setFocusedField(null); autoSave.saveNow('good',good); e.target.style.borderColor=wT().border; autoGrowTextarea(e.target, 3) }}
          placeholder={canEdit?"良かったこと・続けたいこと":""}
          style={{ ...taS, fontStyle:good?'normal':'italic', color:good?wT().text:wT().textMuted }} />
      </td>
      {/* More */}
      <td style={cellS}>
        <textarea value={more} readOnly={!canEdit}
          ref={el => { if (el) autoGrowTextarea(el, 3) }}
          onChange={e=>{ handleFieldChange('more', e.target.value, setMore); autoGrowTextarea(e.target, 3) }}
          onFocus={e=>{ autoSave.setFocusedField('more'); e.target.style.borderColor=wT().warn; autoGrowTextarea(e.target, 5) }}
          onBlur={e=>{ autoSave.setFocusedField(null); autoSave.saveNow('more',more); e.target.style.borderColor=wT().border; autoGrowTextarea(e.target, 3) }}
          placeholder={canEdit?"課題・改善点":""}
          style={{ ...taS, fontStyle:more?'normal':'italic', color:more?wT().text:wT().textMuted }} />
      </td>
      {/* Focus */}
      <td style={cellS}>
        <textarea value={focusOutput} readOnly={!canEdit}
          ref={el => { if (el) autoGrowTextarea(el, 3) }}
          onChange={e=>{ handleFieldChange('focus_output', e.target.value, setFocusOutput); autoGrowTextarea(e.target, 3) }}
          onFocus={e=>{ autoSave.setFocusedField('focus_output'); e.target.style.borderColor=wT().accent; autoGrowTextarea(e.target, 5) }}
          onBlur={e=>{ autoSave.setFocusedField(null); autoSave.saveNow('focus_output',focusOutput); e.target.style.borderColor=wT().border; autoGrowTextarea(e.target, 3) }}
          placeholder={canEdit?"重点アクション":""}
          style={{ ...taS, fontStyle:focusOutput?'normal':'italic', color:focusOutput?wT().text:wT().textMuted }} />
      </td>
      {/* Tasks + Delete */}
      <td style={{ ...cellS, width:70, textAlign:'center', position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
          <span onClick={()=>setShowTasks(p=>!p)} style={{ ...TYPO.footnote, color:'#a855f7', cursor:'pointer', fontWeight:600, padding:'2px 6px', borderRadius:RADIUS.xs - 2, background:showTasks?'rgba(168,85,247,0.12)':'transparent' }}>
            {`${taskCount.done}/${taskCount.total}`}
          </span>
          <button onClick={()=>onDelete(report.id)} style={{ width:18, height:18, borderRadius:RADIUS.xs - 3, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', background:wT().dangerBg, color:wT().danger, flexShrink:0 }}><Icon name="cross" size={11} /></button>
        </div>
        {showTasks && <TaskPopover report={report} members={members} wT={wT} onClose={()=>setShowTasks(false)} onTaskCountChange={setTaskCount} kaTitle={report.ka_title} objectiveTitle={objectiveTitle} completedBy={completedBy} />}
      </td>
      {/* 自動保存インジケーター */}
      <td style={{ ...cellS, width:20, padding:'6px 2px' }}>
        {autoSave.saving && <span style={{ color:wT().accent, display:'inline-flex' }}><Icon name="refresh" size={10} /></span>}
        {autoSave.saved && <span style={{ color:wT().success, display:'inline-flex' }}><Icon name="check" size={10} /></span>}
      </td>
    </tr>
  )
}

// ─── KRブロック ───────────────────────────────────────────────────────────────
function KRBlock({ kr, reports, onAddKA, onSaveKA, onDeleteKA, members, wT, levelId, objId, objOwner, canEditKA, onKROwnerChange, onKRUpdate, activeWeek, reviewVersion, onReorder, objectiveTitle, completedBy, weeksList, onMoveKA, viewMode = 'both' }) {
  // viewMode: 'kr' = KR重点 / 'ka' = KA重点 / 'both' = 両方表示
  const activeReports = reports.filter(r => Number(r.kr_id)===Number(kr.id) && r.status !== 'done')
    .sort((a, b) => (a.sort_order||0) - (b.sort_order||0))
  const doneReports   = reports.filter(r => Number(r.kr_id)===Number(kr.id) && r.status === 'done')
  const [showDone, setShowDone] = useState(false)
  const [showKAInKRMode, setShowKAInKRMode] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const [dropHighlight, setDropHighlight] = useState(false)

  const handleDragStart = (idx, reportId) => {
    setDragIdx(idx)
    // cross-KR drag用にdataTransferにreportIdとsource kr_idをセット
    window.__dragKA = { reportId, sourceKrId: kr.id }
  }
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
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null); setDropHighlight(false); window.__dragKA = null }

  // Cross-KR drop handler
  const handleKRDragOver = (e) => {
    e.preventDefault()
    if (window.__dragKA && window.__dragKA.sourceKrId !== kr.id) {
      setDropHighlight(true)
    }
  }
  const handleKRDragLeave = () => setDropHighlight(false)
  const handleKRDrop = async (e) => {
    e.preventDefault()
    setDropHighlight(false)
    const drag = window.__dragKA
    if (!drag || drag.sourceKrId === kr.id) return
    window.__dragKA = null
    // KAを別のKRに移動
    if (onMoveKA) await onMoveKA(drag.reportId, kr.id)
  }

  const pct = kr.target ? Math.min(Math.round((kr.current/kr.target)*100), 150) : 0
  const pctColor = pctColorOf(pct, wT())
  const stars = calcStars(kr.current, kr.target, kr.lower_is_better)
  const starCfg = KR_STAR_CFG[stars] || KR_STAR_CFG[0]

  const [review,       setReview]       = useState(null)
  const [weather,      setWeather]      = useState(0)
  const [good,         setGood]         = useState('')
  const [more,         setMore]         = useState('')
  const [focus,        setFocus]        = useState('')
  const [reviewOpen,   setReviewOpen]   = useState(viewMode === 'kr')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewSaved,  setReviewSaved]  = useState(false)
  const reviewRef = useRef(null) // review IDをrefで保持
  const autoSaveTimer = useRef(null)
  const [krEditing,    setKrEditing]    = useState(false)
  const [krTitle,      setKrTitle]      = useState(kr.title || '')
  const [krCurrent,    setKrCurrent]    = useState(String(kr.current ?? ''))
  const [krTarget,     setKrTarget]     = useState(String(kr.target ?? ''))
  const [krUnit,       setKrUnit]       = useState(kr.unit || '')
  const [krSaving,     setKrSaving]     = useState(false)
  const [krSaved,      setKrSaved]      = useState(false)
  const weekStart = activeWeek || toDateStr(getMonday(new Date()))

  useEffect(() => {
    supabase.from('kr_weekly_reviews').select('*').eq('kr_id', kr.id).eq('week_start', weekStart).maybeSingle()
      .then(({data}) => {
        if (data) { setReview(data); reviewRef.current = data.id; setWeather(data.weather||0); setGood(data.good||''); setMore(data.more||''); setFocus(data.focus||'') }
        else { setReview(null); reviewRef.current = null; setWeather(0); setGood(''); setMore(''); setFocus('') }
      })
  }, [kr.id, weekStart, reviewVersion])

  // 自動保存（デバウンス1秒）
  const doSaveReview = useCallback(async (w, g, m, f) => {
    setReviewSaving(true)
    const payload = { kr_id:kr.id, week_start:weekStart, weather:w, good:g, more:m, focus:f, updated_at:new Date().toISOString() }
    if (reviewRef.current) {
      await supabase.from('kr_weekly_reviews').update(payload).eq('id', reviewRef.current)
    } else {
      const {data} = await supabase.from('kr_weekly_reviews').insert(payload).select().single()
      if (data) { reviewRef.current = data.id; setReview(data) }
    }
    setReviewSaving(false); setReviewSaved(true); setTimeout(() => setReviewSaved(false), 1500)
  }, [kr.id, weekStart])

  const scheduleAutoSave = (w, g, m, f) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => doSaveReview(w, g, m, f), 1000)
  }
  useEffect(() => { return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) } }, [])

  const updateGood = (v) => { setGood(v); scheduleAutoSave(weather, v, more, focus) }
  const updateMore = (v) => { setMore(v); scheduleAutoSave(weather, good, v, focus) }
  const updateFocus = (v) => { setFocus(v); scheduleAutoSave(weather, good, more, v) }
  const updateWeather = (v) => { setWeather(v); doSaveReview(v, good, more, focus) } // 天気は即時保存

  const saveReview = () => doSaveReview(weather, good, more, focus)

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

  // 完了 KR をアーカイブ (この会議カードから非表示。アーカイブ画面から復元可能)
  const krDone = kr.target > 0 && (kr.lower_is_better ? kr.current <= kr.target : kr.current >= kr.target)
  const archiveKR = async () => {
    if (!onKRUpdate) return
    if (!window.confirm(`「${kr.title}」をアーカイブしますか？\nこの会議の KR 一覧から非表示になります (アーカイブ画面から復元可能)`)) return
    await onKRUpdate(kr.id, { archived_at: new Date().toISOString() })
  }

  const addKA = async () => {
    const maxOrder = activeReports.reduce((max, r) => Math.max(max, r.sort_order||0), 0)
    const payload = {
      week_start: weekStart, level_id:levelId, objective_id:objId,
      kr_id:kr.id, kr_title:kr.title, ka_title:'新しいKA', status:'normal',
      sort_order: maxOrder + 1,
    }
    // 1回目: sort_order あり
    let firstRes = await supabase.from('weekly_reports').insert(payload).select().single()
    if (firstRes.error) {
      console.warn('KA insert failed (with sort_order), retrying without:', firstRes.error)
      // sort_order カラムが無い環境向けのフォールバック。それ以外のエラーならその時点で alert
      const isSortOrderIssue = /sort_order/i.test(firstRes.error.message || '')
      if (!isSortOrderIssue) {
        alert('KAの追加に失敗しました: ' + (firstRes.error.message || JSON.stringify(firstRes.error)))
        return
      }
      const { sort_order, ...payloadNoSort } = payload
      const res = await supabase.from('weekly_reports').insert(payloadNoSort).select().single()
      if (res.error) {
        console.error('KA追加エラー (retry):', res.error)
        alert('KAの追加に失敗しました: ' + (res.error.message || JSON.stringify(res.error)))
        return
      }
      firstRes = res
    }
    // insert が成功しても SELECT で見えないケース (RLS の USING が restrictive など) を検知
    if (!firstRes.data) {
      alert('KAをDBには書き込めましたが、読み戻しに失敗しています。Supabase の RLS (SELECT USING) 設定を確認してください。')
      return
    }
    // 追加した行を直接親に渡してローカル state に反映する (reload() のページング上限で
    // 新 KA が欠落するケースに備える)
    onAddKA(firstRes.data)
  }

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs + 1, padding:'7px 9px', color:wT().text, fontSize:TYPO.subhead.fontSize, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }
  const hasReview = weather > 0 || good || more || focus

  return (
    <div style={{ marginBottom:SPACING.lg, border: dropHighlight ? `2px dashed ${wT().accent}` : '2px solid transparent', borderRadius:RADIUS.lg - 2, transition:'border-color 0.15s' }}
      onDragOver={handleKRDragOver} onDragLeave={handleKRDragLeave} onDrop={handleKRDrop}>
      {/* KRヘッダー */}
      <div onClick={() => setReviewOpen(p=>!p)} style={{ padding:`${SPACING.sm + 2}px ${SPACING.lg - 2}px`, background:wT().bgCard, cursor:'pointer', userSelect:'none', borderRadius:`${RADIUS.md}px ${RADIUS.md}px 0 0`, border:`1px solid ${wT().border}`, borderBottom: reviewOpen ? `1px solid ${wT().border}` : 'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm, marginBottom:6 }}>
          <div style={{ ...TYPO.footnote, fontWeight:700, fontFamily:'ui-monospace, monospace', color:pctColor, background:`${pctColor}1f`, padding:'2px 7px', borderRadius:RADIUS.xs - 2, flexShrink:0 }}>{pct}%</div>
          <span style={{ ...TYPO.subhead, color:wT().text, lineHeight:1.4, flex:1 }}>
            <span style={{ ...TYPO.caption, fontWeight:700, color:wT().accentText, background:wT().accentBg, padding:'1px 6px', borderRadius:RADIUS.xs - 1, marginRight:6, verticalAlign:'middle' }}>KR</span>
            {kr.title}
          </span>
          <span style={{ ...TYPO.footnote, fontWeight:500, color:wT().textMuted, flexShrink:0 }}>{kr.current}{kr.unit} / {kr.target}{kr.unit}</span>
          {/* KR担当: アイコンのみ (クリックで変更)。名前の二重表示を避ける */}
          <div onClick={e => e.stopPropagation()} style={{ position:'relative', width:22, height:22, flexShrink:0 }} title={kr.owner||'KR担当'}>
            {kr.owner
              ? <Avatar name={kr.owner} avatarUrl={members.find(m=>m.name===kr.owner)?.avatar_url} size={22} />
              : <div style={{ width:22, height:22, borderRadius:'50%', border:`1.5px dashed ${wT().borderMid}`, color:wT().textFaint, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>+</div>}
            <select value={kr.owner||''} onChange={e => onKROwnerChange(kr.id, e.target.value)} aria-label="KR担当"
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0, cursor:'pointer', border:'none', appearance:'none', WebkitAppearance:'none', padding:0, margin:0 }}>
              <option value="">KR担当</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <span style={{ display:'inline-flex', flexShrink:0, color:starCfg.color }}>{Array.from({length:5}).map((_,i)=><Icon key={i} name="star" size={13} style={{ opacity: i < stars ? 1 : 0.25 }} />)}</span>
          {!reviewOpen && weather > 0 && <span style={{ display:'inline-flex', color:WEATHER_CFG[weather]?.color }}><Icon name={WEATHER_CFG[weather]?.icon} size={18} /></span>}
          <span style={{ color:wT().textFaint, transform:reviewOpen?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s', flexShrink:0, display:'inline-flex' }}><Icon name="chevronD" size={13} /></span>
        </div>
        <ProgressBar T={wT()} pct={pct} height={4} track={wT().borderLight} />
        {!reviewOpen && hasReview && (
          <div style={{ display:'flex', gap:SPACING.md, marginTop:6, flexWrap:'wrap' }}>
            {good && <div style={{ ...TYPO.footnote, fontWeight:500, color:wT().textSub, display:'flex', alignItems:'center', gap:4 }}><Icon name="check" size={11} style={{ color:wT().success }} />{good.slice(0,50)}{good.length>50?'…':''}</div>}
            {more && <div style={{ ...TYPO.footnote, fontWeight:500, color:wT().textSub, display:'flex', alignItems:'center', gap:4 }}><Icon name="alert" size={11} style={{ color:wT().danger }} />{more.slice(0,50)}{more.length>50?'…':''}</div>}
          </div>
        )}
      </div>

      {/* KRレビュー */}
      {reviewOpen && (
        <div style={{ padding:`${SPACING.md}px ${SPACING.lg - 2}px`, background:wT().bgCard2, border:`1px solid ${wT().border}`, borderTop:'none' }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:SPACING.lg, marginBottom:SPACING.lg - 2, padding:`${SPACING.sm + 2}px ${SPACING.md}px`, background:wT().bgCard, borderRadius:RADIUS.sm, border:`1px solid ${wT().border}` }}>
            <div style={{ borderRight:`1px solid ${wT().border}`, paddingRight:SPACING.lg }}>
              <div style={{ ...TYPO.caption, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>KR達成評価（自動）</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ display:'inline-flex', color:starCfg.color }}>{Array.from({length:5}).map((_,i)=><Icon key={i} name="star" size={20} style={{ color: i < stars ? starCfg.color : wT().borderMid }} />)}</div>
                <div>
                  <div style={{ ...TYPO.subhead, fontWeight:700, color:starCfg.color }}>{starCfg.label}</div>
                  <div style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted }}>達成率 {pct}%</div>
                </div>
              </div>
            </div>
            <div>
              <div style={{ ...TYPO.caption, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>今週の体感・主観</div>
              <WeatherPicker value={weather} onChange={updateWeather} wT={wT} />
            </div>
          </div>
          {/* KR編集セクション */}
          <div style={{ marginBottom:SPACING.md, padding:`${SPACING.sm + 2}px ${SPACING.md}px`, background:wT().bgCard, borderRadius:RADIUS.sm, border:`1px solid ${krEditing?wT().warn:wT().border}`, transition:'border-color 0.15s' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:krEditing?SPACING.sm:0 }}>
              <div style={{ ...TYPO.caption, fontWeight:700, color:wT().warn, textTransform:'uppercase', display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="pencil" size={11} /> KR設定</div>
              {!krEditing && (
                <div style={{ display:'flex', gap:6 }}>
                  {krDone && (
                    <button onClick={archiveKR}
                      title="完了した KR をアーカイブ (この会議の一覧から非表示・アーカイブ画面から復元可能)"
                      style={{ ...TYPO.caption, padding:'3px 10px', borderRadius:RADIUS.xs - 1, border:`1px solid ${wT().borderMid}`, background:'transparent', color:wT().textSub, cursor:'pointer', fontFamily:'inherit', fontWeight:600, display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="inbox" size={11} /> アーカイブ</button>
                  )}
                  <button onClick={() => setKrEditing(true)} style={{ ...TYPO.caption, padding:'3px 10px', borderRadius:RADIUS.xs - 1, border:`1px solid ${wT().warn}4d`, background:wT().warnBg, color:wT().warn, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>編集</button>
                </div>
              )}
            </div>
            {!krEditing ? (
              <div style={{ display:'flex', gap:SPACING.lg, alignItems:'center', marginTop:6, ...TYPO.subhead, fontWeight:500, color:wT().textSub }}>
                <span>タイトル: <b style={{ color:wT().text }}>{kr.title}</b></span>
                <span>現在値: <b style={{ color:pctColor }}>{kr.current}{kr.unit}</b></span>
                <span>目標: <b style={{ color:wT().text }}>{kr.target}{kr.unit}</b></span>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom:6 }}>
                  <div style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, marginBottom:3 }}>タイトル</div>
                  <input value={krTitle} onChange={e=>setKrTitle(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs + 1, padding:'7px 9px', color:wT().text, ...TYPO.subhead, fontWeight:500, outline:'none', fontFamily:'inherit' }} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:SPACING.sm, marginBottom:SPACING.sm }}>
                  <div>
                    <div style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, marginBottom:3 }}>現在値</div>
                    <input type="number" value={krCurrent} onChange={e=>setKrCurrent(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs + 1, padding:'7px 9px', color:pctColor, fontSize:TYPO.body.fontSize, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
                  </div>
                  <div>
                    <div style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, marginBottom:3 }}>目標値</div>
                    <input type="number" value={krTarget} onChange={e=>setKrTarget(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs + 1, padding:'7px 9px', color:wT().text, fontSize:TYPO.body.fontSize, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
                  </div>
                  <div>
                    <div style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, marginBottom:3 }}>単位</div>
                    <input value={krUnit} onChange={e=>setKrUnit(e.target.value)} placeholder="件, %, 万円..." style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs + 1, padding:'7px 9px', color:wT().text, ...TYPO.subhead, fontWeight:500, outline:'none', fontFamily:'inherit' }} />
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:6 }}>
                  <button onClick={() => { setKrEditing(false); setKrTitle(kr.title||''); setKrCurrent(String(kr.current??'')); setKrTarget(String(kr.target??'')); setKrUnit(kr.unit||'') }}
                    style={{ padding:`${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius:RADIUS.xs, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, ...TYPO.caption, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>キャンセル</button>
                  <button onClick={saveKR} disabled={krSaving}
                    style={{ padding:`${SPACING.xs}px ${SPACING.lg - 2}px`, borderRadius:RADIUS.xs, background:krSaved?wT().success:wT().warn, border:'none', color:'#fff', ...TYPO.caption, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4 }}>
                    {krSaved?<><Icon name="check" size={11} /> 保存済み</>:krSaving?'保存中...':'KRを保存'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:SPACING.sm, marginBottom:SPACING.sm }}>
            <div>
              <div style={{ ...TYPO.caption, fontWeight:700, color:wT().success, background:wT().successBg, padding:'3px 8px', borderRadius:RADIUS.xs - 1, marginBottom:4, display:'inline-flex', alignItems:'center', gap:6 }}>
                <Icon name="check" size={11} /> good<span style={{ fontSize:9, fontWeight:500, opacity:0.8 }}>{activeWeek ? `(${formatWeekLabel(getPrevMondayStr(activeWeek))})` : ''}</span>
              </div>
              <textarea value={good} onChange={e=>updateGood(e.target.value)} rows={3} style={taS} onFocus={e=>e.target.style.borderColor=wT().success} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
            <div>
              <div style={{ ...TYPO.caption, fontWeight:700, color:wT().danger, background:wT().dangerBg, padding:'3px 8px', borderRadius:RADIUS.xs - 1, marginBottom:4, display:'inline-flex', alignItems:'center', gap:6 }}>
                <Icon name="alert" size={11} /> more<span style={{ fontSize:9, fontWeight:500, opacity:0.8 }}>{activeWeek ? `(${formatWeekLabel(getPrevMondayStr(activeWeek))})` : ''}</span>
              </div>
              <textarea value={more} onChange={e=>updateMore(e.target.value)} rows={3} style={taS} onFocus={e=>e.target.style.borderColor=wT().danger} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:SPACING.sm }}>
            <div style={{ flex:1, height:1, background:wT().border }}/><span style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, display:'inline-flex', alignItems:'center', gap:3 }}><Icon name="chevronD" size={11} /> Moreへの対応</span><div style={{ flex:1, height:1, background:wT().border }}/>
          </div>
          <div style={{ marginBottom:SPACING.sm + 2 }}>
            <div style={{ ...TYPO.caption, fontWeight:700, color:wT().accent, background:wT().accentBg, padding:'3px 8px', borderRadius:RADIUS.xs - 1, marginBottom:4, display:'inline-flex', alignItems:'center', gap:6 }}>
              <Icon name="target" size={11} /> focus<span style={{ fontSize:9, fontWeight:500, opacity:0.8 }}>{activeWeek ? `(${formatWeekLabel(activeWeek)})` : ''}</span>
            </div>
            <textarea value={focus} onChange={e=>updateFocus(e.target.value)} rows={2} style={taS} onFocus={e=>e.target.style.borderColor=wT().accent} onBlur={e=>e.target.style.borderColor=wT().border}/>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:SPACING.sm }}>
            <span style={{ ...TYPO.caption, color: reviewSaved ? wT().success : reviewSaving ? wT().textMuted : 'transparent', fontWeight:600, transition:'color 0.3s', display:'inline-flex', alignItems:'center', gap:3 }}>
              {reviewSaved ? <><Icon name="check" size={11} /> 自動保存済み</> : reviewSaving ? '保存中...' : ''}
            </span>
            <button onClick={()=>setReviewOpen(false)} style={{ padding:`5px ${SPACING.md}px`, borderRadius:RADIUS.xs, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, ...TYPO.footnote, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={saveReview} disabled={reviewSaving} style={{ padding:`5px ${SPACING.lg}px`, borderRadius:RADIUS.xs, background:reviewSaved?wT().success:wT().accent, border:'none', color:'#fff', ...TYPO.footnote, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background 0.3s', display:'inline-flex', alignItems:'center', gap:4 }}>
              {reviewSaved?<><Icon name="check" size={11} /> 保存済み</>:reviewSaving?'保存中...':'保存して週次MTGに反映'}
            </button>
          </div>
        </div>
      )}

      {/* KAテーブル: KR重点モードでは折り畳み */}
      {viewMode === 'kr' && !showKAInKRMode && (
        <div style={{ padding:`${SPACING.sm}px ${SPACING.lg - 2}px`, background:wT().bgCard, borderRadius: `0 0 ${RADIUS.md}px ${RADIUS.md}px`, border:`1px solid ${wT().border}`, borderTop:'none', display:'flex', alignItems:'center', gap:SPACING.sm }}>
          <button onClick={() => setShowKAInKRMode(true)} style={{
            ...TYPO.caption, fontWeight:600, color:wT().textMuted, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs - 1, padding:'3px 10px', cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4,
          }}><Icon name="note" size={11} /> KA {activeReports.length}件{doneReports.length > 0 ? ` (完了${doneReports.length}件)` : ''} を表示</button>
        </div>
      )}
      {(viewMode !== 'kr' || showKAInKRMode) && (
      <div style={{ border:`1px solid ${wT().border}`, borderTop: reviewOpen ? 'none' : `1px solid ${wT().border}`, borderRadius: reviewOpen ? `0 0 ${RADIUS.md}px ${RADIUS.md}px` : `0 0 ${RADIUS.md}px ${RADIUS.md}px`, overflow:'auto', WebkitOverflowScrolling:'touch' }}>
        <table style={{ width:'100%', minWidth:700, borderCollapse:'collapse', tableLayout:'fixed' }}>
          <colgroup>
            <col style={{ width:28 }} />
            <col style={{ width:52 }} />
            <col style={{ width:'18%' }} />
            <col style={{ width:64 }} />
            <col />
            <col />
            <col />
            <col style={{ width:56 }} />
            <col style={{ width:20 }} />
          </colgroup>
          <KATableHeader T={wT()} dragCol
            subGood={activeWeek ? formatWeekLabel(getPrevMondayStr(activeWeek)) : ''}
            subMore={activeWeek ? formatWeekLabel(getPrevMondayStr(activeWeek)) : ''}
            subFocus={activeWeek ? formatWeekLabel(activeWeek) : ''} />
          <tbody>
            {activeReports.map((r, idx) => (
              <KARow key={r.id} report={r} onSave={onSaveKA} onDelete={onDeleteKA} members={members} wT={wT}
                canEdit={canEditKA(r.owner, objOwner, kr.owner)}
                dragIdx={dragIdx} overIdx={overIdx} rowIdx={idx}
                dragHandleProps={{ draggable:true, onDragStart:() => handleDragStart(idx, r.id), onDragEnd:handleDragEnd }}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                objectiveTitle={objectiveTitle} completedBy={completedBy} />
            ))}
          </tbody>
        </table>

        {/* 完了済みKA（折りたたみ） */}
        {doneReports.length > 0 && (
          <div style={{ padding:`${SPACING.xs}px ${SPACING.md}px`, background:wT().bgCard, borderTop:`1px solid ${wT().border}` }}>
            <button onClick={() => setShowDone(p=>!p)}
              style={{ ...TYPO.caption, fontWeight:600, color:wT().textFaint, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs - 1, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4 }}>
              {showDone ? '完了を隠す' : <><Icon name="check" size={11} /> 完了済み {doneReports.length}件</>}
            </button>
          </div>
        )}
        {showDone && doneReports.length > 0 && (
          <table style={{ width:'100%', minWidth:700, borderCollapse:'collapse', tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:28 }} />
              <col style={{ width:52 }} />
              <col style={{ width:'18%' }} />
              <col style={{ width:64 }} />
              <col />
              <col />
              <col />
              <col style={{ width:56 }} />
              <col style={{ width:20 }} />
            </colgroup>
            <tbody>
              {doneReports.map(r => (
                <KARow key={r.id} report={r} onSave={onSaveKA} onDelete={onDeleteKA} members={members} wT={wT}
                  canEdit={canEditKA(r.owner, objOwner, kr.owner)} objectiveTitle={objectiveTitle} completedBy={completedBy} />
              ))}
            </tbody>
          </table>
        )}

        {/* KA追加ボタン */}
        <div onClick={addKA} style={{ display:'flex', alignItems:'center', gap:6, padding:`6px ${SPACING.md}px`, cursor:'pointer', color:wT().textMuted, ...TYPO.footnote, fontWeight:500, borderTop:`1px solid ${wT().border}`, background:wT().bgCard }}>
          <Icon name="plus" size={13} /> このKRにKAを追加
        </div>
      </div>
      )}
    </div>
  )
}

export {
  KRBlock,
  Avatar,
  OwnerBadge,
  formatWeekLabel,
  getPrevMondayStr,
  statusCfg,
  autoGrowTextarea,
  calcStars,
  KARow,
  TaskPopover,
  WeatherPicker,
}
