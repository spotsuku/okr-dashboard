'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

// ─── KAカード ─────────────────────────────────────────────────────────────────
function KACard({ report, onSave, onDelete, members, wT, canEdit, dragHandleProps }) {
  const [open,         setOpen]         = useState(false)
  const [good,         setGood]         = useState(report.good || '')
  const [more,         setMore]         = useState(report.more || '')
  const [focusOutput,  setFocusOutput]  = useState(report.focus_output || '')
  const [status,       setStatus]       = useState(report.status || 'normal')
  const [ownerDraft,   setOwnerDraft]   = useState(report.owner || '')
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [tasks,        setTasks]        = useState([])
  const [tasksLoaded,  setTasksLoaded]  = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [kaTitle,      setKaTitle]      = useState(report.ka_title || '')
  const [titleSaving,  setTitleSaving]  = useState(false)

  const cfg = STATUS_CFG[status] || STATUS_CFG.normal
  const ownerMember = members.find(m => m.name === report.owner)

  useEffect(() => {
    if (!open || tasksLoaded) return
    supabase.from('ka_tasks').select('*').eq('report_id', report.id).order('id')
      .then(({data}) => { setTasks(data||[]); setTasksLoaded(true) })
  }, [open])

  const addTask    = () => setTasks(p => [...p, { _tmp:Date.now(), title:'', assignee:'', due_date:'', done:false, report_id:report.id }])
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
  }
  const cycleStatus = (e) => {
    e.stopPropagation()
    const idx = STATUS_ORDER.indexOf(status)
    setStatus(STATUS_ORDER[(idx+1) % STATUS_ORDER.length])
  }
  const saveTitleInline = async () => {
    if (!kaTitle.trim() || kaTitle===report.ka_title) { setEditingTitle(false); return }
    setTitleSaving(true)
    await supabase.from('weekly_reports').update({ ka_title:kaTitle.trim() }).eq('id', report.id)
    setTitleSaving(false); setEditingTitle(false)
    onSave({ ...report, ka_title:kaTitle.trim(), good, more, focus_output:focusOutput, status })
  }
  const save = async (e) => {
    e && e.stopPropagation(); setSaving(true)
    const { error:repErr } = await supabase.from('weekly_reports').update({ good, more, focus_output:focusOutput, status, owner:ownerDraft||report.owner }).eq('id', report.id)
    if (repErr) console.error('KA save error:', repErr)
    for (const t of tasks) {
      const d = { title:t.title||'', assignee:t.assignee||null, due_date:t.due_date||null, done:t.done, report_id:report.id }
      if (t.id) { const {error:tErr} = await supabase.from('ka_tasks').update(d).eq('id', t.id); if(tErr) console.error('task update error:', tErr) }
      else if (t.title?.trim()) {
        const {data:ins} = await supabase.from('ka_tasks').insert([d]).select().single()
        if (ins) setTasks(p => p.map(tk => tk._tmp===t._tmp ? ins : tk))
      }
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1500)
    onSave({ ...report, ka_title:kaTitle, good, more, focus_output:focusOutput, status, owner:ownerDraft||report.owner })
  }

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }
  const fl  = (c,b) => ({ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, display:'inline-flex', alignItems:'center', gap:4, marginBottom:3, color:c, background:b })
  const done = tasks.filter(t=>t.done).length

  return (
    <div onClick={() => !open && setOpen(true)} style={{ background:wT().bgCard, border:`1px solid ${open?'#4d9fff50':wT().border}`, borderRadius:10, marginBottom:8, overflow:'hidden', cursor:open?'default':'pointer', transition:'border-color 0.15s', opacity: status==='done' ? 0.55 : 1 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }} onClick={() => setOpen(p=>!p)}>
        <div {...(dragHandleProps||{})} style={{ cursor:'grab', color:wT().textFaint, fontSize:14, lineHeight:1, flexShrink:0, userSelect:'none', padding:'0 2px' }} title="ドラッグで並べ替え">⠿</div>
        <div onClick={e => e.stopPropagation()} style={{ flexShrink:0 }}>
          <Avatar name={ownerDraft||report.owner} avatarUrl={ownerMember?.avatar_url} size={24} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          {editingTitle && canEdit ? (
            <div style={{ display:'flex', alignItems:'flex-start', gap:6 }} onClick={e => e.stopPropagation()}>
              <textarea autoFocus value={kaTitle} onChange={e => setKaTitle(e.target.value)}
                onKeyDown={e => { if ((e.metaKey||e.ctrlKey) && e.key==='Enter') saveTitleInline(); if (e.key==='Escape') { setKaTitle(report.ka_title); setEditingTitle(false) } }}
                rows={2}
                style={{ flex:1, background:wT().bgCard2, border:'1px solid #4d9fff80', borderRadius:6, padding:'6px 8px', color:wT().text, fontSize:13, fontWeight:600, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.5 }} />
              <button onClick={e => { e.stopPropagation(); saveTitleInline() }} disabled={titleSaving}
                style={{ padding:'3px 10px', borderRadius:5, background:'#4d9fff', border:'none', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', flexShrink:0, marginTop:4 }}>{titleSaving?'…':'✓'}</button>
              <button onClick={e => { e.stopPropagation(); setKaTitle(report.ka_title); setEditingTitle(false) }}
                style={{ padding:'3px 8px', borderRadius:5, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textMuted, fontSize:10, cursor:'pointer', flexShrink:0 }}>✕</button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:13, fontWeight:600, color: status==='done'?wT().textMuted:wT().text, lineHeight:1.3, textDecoration: status==='done'?'line-through':'none' }}>{kaTitle||report.ka_title}</span>
              {canEdit && <button onClick={e => { e.stopPropagation(); setEditingTitle(true) }}
                style={{ background:'transparent', border:`1px solid ${wT().border}`, color:wT().textFaint, borderRadius:4, width:18, height:18, fontSize:9, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity:0.7 }} title="タイトル編集">✎</button>}
            </div>
          )}
          {report.kr_title && (
            <div style={{ fontSize:10, color:'#4d9fff', background:'rgba(77,159,255,0.1)', border:'1px solid rgba(77,159,255,0.3)', borderRadius:4, padding:'2px 8px', display:'inline-flex', alignItems:'center', gap:4, marginTop:3 }}>
              <span style={{ fontWeight:700, flexShrink:0 }}>📊 KR</span><span style={{ color:'rgba(77,159,255,0.7)', margin:'0 2px' }}>|</span><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{report.kr_title}</span>
            </div>
          )}
        </div>
        <span onClick={cycleStatus} style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:99, cursor:'pointer', flexShrink:0, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, whiteSpace:'nowrap' }}>{cfg.label}</span>
        {(ownerDraft||report.owner) && <span style={{ fontSize:11, color:avatarColor(ownerDraft||report.owner), fontWeight:600, flexShrink:0 }}>{ownerDraft||report.owner}</span>}
        <button onClick={e=>{e.stopPropagation();onDelete(report.id)}} style={{ width:22, height:22, borderRadius:4, border:'none', cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,107,107,0.08)', color:'#ff6b6b', flexShrink:0 }}>✕</button>
        <span style={{ color:wT().textFaint, fontSize:11, transform:open?'rotate(180deg)':'rotate(0deg)', transition:'transform 0.2s', display:'inline-block', flexShrink:0 }}>▾</span>
      </div>

      {!open && (good||more) && (
        <div style={{ display:'flex', gap:10, padding:'0 12px 8px 44px', flexWrap:'wrap' }}>
          {good && <div style={{ display:'flex', gap:4, fontSize:11, color:wT().textSub }}><span style={{ color:'#00d68f', fontSize:10, fontWeight:700 }}>✅</span>{good.slice(0,60)}{good.length>60?'…':''}</div>}
          {more && <div style={{ display:'flex', gap:4, fontSize:11, color:wT().textSub }}><span style={{ color:'#ff6b6b', fontSize:10, fontWeight:700 }}>🔺</span>{more.slice(0,60)}{more.length>60?'…':''}</div>}
        </div>
      )}

      {open && (
        <div style={{ padding:'0 12px 12px' }} onClick={e=>e.stopPropagation()}>
          {/* 担当者変更 */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:wT().bgCard, borderRadius:8, border:`1px solid ${wT().border}`, marginBottom:10 }}>
            <span style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', flexShrink:0 }}>担当者</span>
            <Avatar name={ownerDraft} avatarUrl={members.find(m=>m.name===ownerDraft)?.avatar_url} size={20} />
            <select value={ownerDraft} onChange={e=>setOwnerDraft(e.target.value)}
              style={{ flex:1, background:wT().bgCard2, border:`1px solid ${wT().borderMid}`, borderRadius:6, padding:'5px 8px', color:ownerDraft?avatarColor(ownerDraft):wT().textMuted, fontSize:12, outline:'none', fontFamily:'inherit', cursor:'pointer', fontWeight:ownerDraft?600:400 }}>
              <option value="">-- 未設定 --</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <span style={{ fontSize:10, color:wT().textFaint }}>※保存で反映</span>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, minWidth:0 }}>
            <div><div style={fl('#00d68f','rgba(0,214,143,0.1)')}>✅ Good</div><textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} placeholder="うまくいったこと" style={taS} onFocus={e=>e.target.style.borderColor='rgba(0,214,143,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/></div>
            <div><div style={fl('#ff6b6b','rgba(255,107,107,0.1)')}>🔺 More</div><textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} placeholder="課題・改善点" style={taS} onFocus={e=>e.target.style.borderColor='rgba(255,107,107,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/></div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 0', marginBottom:8 }}>
            <div style={{ flex:1, height:1, background:wT().border }}/><span style={{ fontSize:10, color:wT().textMuted }}>↓ Moreへの対応</span><div style={{ flex:1, height:1, background:wT().border }}/>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={fl('#4d9fff','rgba(77,159,255,0.1)')}>🎯 注力アクション</div>
            <textarea value={focusOutput} onChange={e=>setFocusOutput(e.target.value)} rows={2} placeholder="Moreに対してどう動くか" style={taS} onFocus={e=>e.target.style.borderColor='rgba(77,159,255,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
          </div>
          {/* タスク */}
          <div style={{ marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={fl('#a855f7','rgba(168,85,247,0.1)')}>📋 タスク {done}/{tasks.length}</div>
            </div>
            {tasks.map(t => {
              const key = t.id||t._tmp; const tc = avatarColor(t.assignee)
              return (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, marginBottom:4, background:t.done?wT().borderLight:wT().bgCard, border:`1px solid ${t.done?wT().border:wT().borderMid}`, opacity:t.done?0.6:1 }}>
                  <div onClick={()=>toggleDone(key)} style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${t.done?'#00d68f':wT().borderMid}`, background:t.done?'#00d68f':'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {t.done && <span style={{ fontSize:9, color:'#fff', fontWeight:700 }}>✓</span>}
                  </div>
                  <input value={t.title} onChange={e=>updateTask(key,'title',e.target.value)} placeholder="タスク内容" style={{ flex:1, background:'transparent', border:'none', color:t.done?wT().textMuted:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', textDecoration:t.done?'line-through':'none' }}/>
                  <select value={t.assignee||''} onChange={e=>updateTask(key,'assignee',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.assignee?tc:wT().textMuted, fontSize:11, cursor:'pointer', fontFamily:'inherit', outline:'none', flexShrink:0, maxWidth:80 }}>
                    <option value="">担当者</option>
                    {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <input type="date" value={t.due_date||''} onChange={e=>updateTask(key,'due_date',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.due_date?wT().text:wT().textMuted, fontSize:11, outline:'none', fontFamily:'inherit', flexShrink:0, maxWidth:110 }}/>
                  <button onClick={()=>removeTask(key)} style={{ width:18, height:18, borderRadius:3, border:'none', background:'transparent', color:wT().textFaint, cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
                </div>
              )
            })}
            <div onClick={addTask} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, border:`1px dashed ${wT().borderMid}`, cursor:'pointer', color:wT().textMuted, fontSize:11, marginTop:2 }}>
              <span style={{ fontSize:14, lineHeight:1 }}>+</span> タスクを追加
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:8, borderTop:`1px solid ${wT().border}` }}>
            <span style={{ fontSize:10, color:wT().textFaintest, marginRight:'auto' }}>ステータスをクリックで切り替え</span>
            <button onClick={()=>setOpen(false)} style={{ padding:'5px 12px', borderRadius:6, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={save} disabled={saving} style={{ padding:'5px 16px', borderRadius:6, background:saved?'#00d68f':'#4d9fff', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background 0.3s' }}>
              {saved?'✓ 保存済み':saving?'保存中...':'保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KRブロック ───────────────────────────────────────────────────────────────
function KRBlock({ kr, reports, onAddKA, onSaveKA, onDeleteKA, members, wT, levelId, objId, objOwner, canEditKA, onKROwnerChange, activeWeek, onReorder }) {
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
    // sort_orderを更新
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
    else { const {data} = await supabase.from('kr_weekly_reviews').insert([payload]).select().single(); if (data) setReview(data) }
    setReviewSaving(false); setReviewSaved(true); setTimeout(() => setReviewSaved(false), 1500)
  }

  const addKA = async () => {
    const maxOrder = activeReports.reduce((max, r) => Math.max(max, r.sort_order||0), 0)
    const payload = {
      week_start: weekStart, level_id:levelId, objective_id:objId,
      kr_id:kr.id, kr_title:kr.title, ka_title:'新しいKA', status:'normal',
      sort_order: maxOrder + 1,
    }
    let { error } = await supabase.from('weekly_reports').insert([payload])
    if (error) {
      // sort_orderカラムが無い場合のフォールバック
      console.warn('KA insert failed, retrying without sort_order:', error.message)
      const { sort_order, ...payloadNoSort } = payload
      const res = await supabase.from('weekly_reports').insert([payloadNoSort])
      if (res.error) { console.error('KA追加エラー:', res.error); alert('KAの追加に失敗しました: ' + res.error.message); return }
    }
    onAddKA()
  }

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }
  const hasReview = weather > 0 || good || more || focus

  return (
    <div style={{ marginBottom:20, border:`1px solid ${wT().border}`, borderRadius:10, overflow:'hidden' }}>
      {/* KRヘッダー */}
      <div onClick={() => setReviewOpen(p=>!p)} style={{ padding:'10px 14px', background:wT().bgCard, borderLeft:`4px solid ${pctColor}`, cursor:'pointer', userSelect:'none' }}>
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
        <div style={{ padding:'12px 14px', background:wT().bgCard2, borderBottom:`1px solid ${wT().border}` }} onClick={e=>e.stopPropagation()}>
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

      {/* KA一覧 */}
      <div style={{ padding:'10px 12px', background:wT().bgCard2 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>📋 KA一覧</div>
          <div style={{ fontSize:10, color:wT().textFaint }}>{activeReports.length}件</div>
          {doneReports.length > 0 && (
            <button onClick={() => setShowDone(p=>!p)}
              style={{ fontSize:10, color:wT().textFaint, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit', marginLeft:'auto' }}>
              {showDone ? '完了を隠す' : `完了済み ${doneReports.length}件を表示`}
            </button>
          )}
        </div>
        {/* アクティブなKA */}
        {activeReports.map((r, idx) => (
          <div key={r.id}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={() => handleDrop(idx)}
            style={{
              opacity: dragIdx === idx ? 0.4 : 1,
              borderTop: overIdx === idx && dragIdx !== null && dragIdx !== idx ? '2px solid #4d9fff' : '2px solid transparent',
              transition: 'opacity 0.15s',
            }}
          >
            <KACard report={r} onSave={onSaveKA} onDelete={onDeleteKA} members={members} wT={wT} canEdit={canEditKA(r.owner, objOwner)}
              dragHandleProps={{ draggable:true, onDragStart:() => handleDragStart(idx), onDragEnd:handleDragEnd }} />
          </div>
        ))}
        {/* 完了済みKA（折りたたみ） */}
        {showDone && doneReports.length > 0 && (
          <div style={{ marginTop:8, paddingTop:8, borderTop:`1px dashed ${wT().border}` }}>
            <div style={{ fontSize:10, color:wT().textFaint, marginBottom:6 }}>✓ 完了済み</div>
            {doneReports.map(r => (
              <KACard key={r.id} report={r} onSave={onSaveKA} onDelete={onDeleteKA} members={members} wT={wT} canEdit={canEditKA(r.owner, objOwner)} />
            ))}
          </div>
        )}
        <div onClick={addKA} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:7, border:`1px dashed ${wT().borderMid}`, cursor:'pointer', color:wT().textMuted, fontSize:11, marginTop:4 }}>
          <span style={{ fontSize:14, lineHeight:1 }}>+</span> このKRにKAを追加
        </div>
      </div>
    </div>
  )
}

// ─── メインページ ──────────────────────────────────────────────────────────────
export default function WeeklyMTGPage({ levels, themeKey='dark', fiscalYear='2026', user, initialPeriod='all' }) {
  const wT = () => W_THEMES[themeKey] || W_THEMES.dark
  const [reports,       setReports]       = useState([])
  const [objectives,    setObjectives]    = useState([])
  const [keyResults,    setKeyResults]    = useState([])
  const [members,       setMembers]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [activeLevelId, setActiveLevelId] = useState(null)
  const [activeObjId,   setActiveObjId]   = useState(null)
  const [activePeriod,  setActivePeriod]  = useState(initialPeriod)
  const [activeWeek,    setActiveWeek]    = useState(toDateStr(getMonday(new Date())))

  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period,owner').order('level_id').then(({data})=>setObjectives(data||[]))
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

  // ★ 金曜日に翌週分を自動作成（未作成の場合のみ）
  useEffect(() => {
    if (!isFriday()) return
    if (reports.length === 0) return
    const nextMon = getNextMonday()
    const hasNext = reports.some(r => r.week_start === nextMon)
    if (hasNext) return
    // 今週のKAを翌週にコピー（done以外）
    const thisMonday = toDateStr(getMonday(new Date()))
    const thisWeekKAs = reports.filter(r => r.week_start === thisMonday && r.status !== 'done')
    if (thisWeekKAs.length === 0) return
    const copies = thisWeekKAs.map(r => ({
      week_start: nextMon, level_id: r.level_id, objective_id: r.objective_id,
      kr_id: r.kr_id, kr_title: r.kr_title, ka_title: r.ka_title,
      owner: r.owner, status: 'normal',
    }))
    supabase.from('weekly_reports').insert(copies).then(() => reload())
  }, [reports.length])

  const reload = async () => {
    let { data, error } = await supabase.from('weekly_reports').select('*').order('sort_order').order('id')
    if (error) {
      const res = await supabase.from('weekly_reports').select('*').order('id')
      data = res.data
    }
    setReports(data||[])
  }

  // ★ 手動で週を作成（今週のKAをコピー）
  const createWeek = async (targetMonday) => {
    const hasData = reports.some(r => r.week_start === targetMonday)
    if (hasData) return
    // 直近の既存週からコピー
    const prevWeeks = weeksList.filter(w => w < targetMonday)
    const srcWeek = prevWeeks.length > 0 ? prevWeeks[prevWeeks.length - 1] : null
    if (srcWeek) {
      const srcKAs = reports.filter(r => r.week_start === srcWeek && r.status !== 'done')
      if (srcKAs.length > 0) {
        const copies = srcKAs.map(r => ({
          week_start: targetMonday, level_id: r.level_id, objective_id: r.objective_id,
          kr_id: r.kr_id, kr_title: r.kr_title, ka_title: r.ka_title,
          owner: r.owner, status: 'normal',
        }))
        await supabase.from('weekly_reports').insert(copies)
      }
    }
    await reload()
    setActiveWeek(targetMonday)
  }

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

  // 年度・部署フィルタ（子階層も含む：OKRページと同じサブツリー方式）
  const getSubtreeIds = (id) => {
    const ids = [Number(id)]
    levels.filter(l => Number(l.parent_id) === Number(id)).forEach(c => ids.push(...getSubtreeIds(c.id)))
    return ids
  }
  const visibleLevelIds = activeLevelId ? getSubtreeIds(activeLevelId) : levels.map(l=>l.id)
  const visibleLevels = levels.filter(l => visibleLevelIds.includes(Number(l.id)))
  const visibleObjs = objectives.filter(o => {
    const levelOk = visibleLevels.some(l => Number(l.id)===Number(o.level_id))
    if (!levelOk) return false
    if (activePeriod === 'all') {
      return fiscalYear==='2026' ? !o.period.includes('_') : o.period.startsWith(`${fiscalYear}_`)
    }
    const pk = fiscalYear==='2026' ? activePeriod : `${fiscalYear}_${activePeriod}`
    return o.period === pk
  })

  const selectedObj    = activeObjId ? objectives.find(o => o.id===Number(activeObjId)) : null
  const selectedObjKRs = activeObjId ? keyResults.filter(kr => Number(kr.objective_id)===Number(activeObjId)) : []
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

  const periodTabs = [['all','通期'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4']]

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

      {/* 期間タブ */}
      <div style={{ display:'flex', gap:4, padding:'7px 16px', borderBottom:`1px solid ${wT().border}`, flexShrink:0, alignItems:'center' }}>
        <span style={{ fontSize:11, color:wT().textMuted, fontWeight:700, marginRight:4 }}>期間：</span>
        {periodTabs.map(([key,lbl]) => (
          <button key={key} onClick={()=>{setActivePeriod(key);setActiveObjId(null)}} style={{ padding:'4px 12px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, background:activePeriod===key?(key==='all'?wT().borderMid:'rgba(77,159,255,0.15)'):'transparent', border:`1px solid ${activePeriod===key?(key==='all'?wT().border:'rgba(77,159,255,0.4)'):wT().borderMid}`, color:activePeriod===key?(key==='all'?wT().text:'#4d9fff'):wT().textMuted }}>{lbl}</button>
        ))}
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
              <div key={obj.id} onClick={()=>setActiveObjId(isActive?null:obj.id)} style={{ padding:'10px 12px', borderRadius:9, marginBottom:7, cursor:'pointer', border:`1px solid ${isActive?color+'60':wT().border}`, background:isActive?`${color}10`:wT().bgCard, transition:'all 0.12s' }}>
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
                  <div key={obj.id} onClick={()=>setActiveObjId(isActive?null:obj.id)} style={{ padding:'9px 12px', borderRadius:9, marginTop:5, cursor:'pointer', border:`1px solid ${isActive?'rgba(0,214,143,0.5)':'rgba(0,214,143,0.15)'}`, background:isActive?'rgba(0,214,143,0.1)':'rgba(0,214,143,0.04)', transition:'all 0.12s', opacity:0.8 }}>
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
              {/* Objectiveヘッダー */}
              <div style={{ padding:'12px 14px', background: isObjDone(selectedObj)?'rgba(0,214,143,0.08)':`${objColor}0e`, border:`1px solid ${isObjDone(selectedObj)?'rgba(0,214,143,0.3)':objColor+'30'}`, borderLeft:`4px solid ${isObjDone(selectedObj)?'#00d68f':objColor}`, borderRadius:10, marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:`${objColor}20`, color:objColor }}>{getPeriodLabel(selectedObj.period)}</span>
                  <span style={{ fontSize:10, color:wT().textMuted }}>Objective</span>
                  {isObjDone(selectedObj) && <span style={{ fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:99, background:'rgba(0,214,143,0.15)', color:'#00d68f', border:'1px solid rgba(0,214,143,0.3)' }}>🏆 達成済み</span>}
                  {selectedObj.owner && <div style={{ marginLeft:'auto' }}><OwnerBadge name={selectedObj.owner} members={members} size={24} /></div>}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color: isObjDone(selectedObj)?'#00d68f':wT().text, lineHeight:1.5 }}>{selectedObj.title}</div>
              </div>

              {selectedObjKRs.length===0 && <div style={{ textAlign:'center', padding:30, color:wT().textFaint, fontSize:12 }}>KRが登録されていません。OKRページからKRを追加してください。</div>}
              {loading && <div style={{ textAlign:'center', padding:20, color:'#4d9fff', fontSize:13 }}>読み込み中...</div>}
              {!loading && selectedObjKRs.map(kr => (
                <KRBlock
                  key={kr.id}
                  kr={kr}
                  reports={weekReports}
                  onAddKA={reload}
                  onSaveKA={handleSave}
                  onDeleteKA={handleDelete}
                  members={members}
                  wT={wT}
                  levelId={selectedObj.level_id}
                  objId={selectedObj.id}
                  objOwner={selectedObj.owner}
                  canEditKA={canEditKA}
                  onKROwnerChange={handleKROwnerChange}
                  activeWeek={activeWeek}
                  onReorder={reload}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
