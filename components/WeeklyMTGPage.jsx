'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── テーマ ────────────────────────────────────────────────────────────────────
const DARK_T = {
  bg:'#090d18', bgCard:'#0e1420', bgCard2:'#111828', bgSidebar:'#0e1420',
  border:'rgba(255,255,255,0.07)', borderLight:'rgba(255,255,255,0.04)',
  borderMid:'rgba(255,255,255,0.1)', text:'#e8eaf0', textSub:'#a0a8be',
  textMuted:'#606880', textFaint:'#404660', textFaintest:'#303450',
  headerBg:'#090d18',
}
const LIGHT_T = {
  bg:'#f0f2f7', bgCard:'#ffffff', bgCard2:'#f7f8fc', bgSidebar:'#ffffff',
  border:'rgba(0,0,0,0.08)', borderLight:'rgba(0,0,0,0.05)',
  borderMid:'rgba(0,0,0,0.12)', text:'#1a1f36', textSub:'#4a5270',
  textMuted:'#7080a0', textFaint:'#90a0bc', textFaintest:'#b0bcd0',
  headerBg:'#ffffff',
}
const W_THEMES = { dark: DARK_T, light: LIGHT_T }

// ─── ヘルパー ──────────────────────────────────────────────────────────────────
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}
function formatWeekLabel(w) {
  const d = new Date(w)
  return `${d.getMonth()+1}/${d.getDate()}`
}
function getPastWeeks(n = 10) {
  const weeks = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i * 7)
    weeks.push(getMondayOf(d))
  }
  return [...new Set(weeks)].sort((a, b) => b.localeCompare(a))
}
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
const STATUS_CFG = {
  focus:  { label: '🎯 注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)',  border: 'rgba(77,159,255,0.3)' },
  good:   { label: '✅ Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)',    border: 'rgba(0,214,143,0.3)' },
  more:   { label: '🔺 More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)',  border: 'rgba(255,107,107,0.3)' },
  normal: { label: '未分類',  color: '#606880', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' },
}
const STATUS_ORDER = ['normal','focus','good','more']
const PERIOD_LABELS = { annual:'通期', q1:'Q1', q2:'Q2', q3:'Q3', q4:'Q4' }

function Avatar({ name, size=22 }) {
  if (!name) return null
  const color = avatarColor(name)
  return <div style={{ width:size, height:size, borderRadius:'50%', background:`${color}25`, border:`1.5px solid ${color}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.36, fontWeight:700, color, flexShrink:0 }}>{name.slice(0,2)}</div>
}

// ─── KAカード（インライン編集） ────────────────────────────────────────────────
function KACard({ report, onSave, onDelete, objectives, members, wT, defaultOpen=false }) {
  const [open,        setOpen]        = useState(defaultOpen)
  const [good,        setGood]        = useState(report.good || '')
  const [more,        setMore]        = useState(report.more || '')
  const [focusOutput, setFocusOutput] = useState(report.focus_output || '')
  const [status,      setStatus]      = useState(report.status || 'normal')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [tasks,       setTasks]       = useState([])
  const [tasksLoaded, setTasksLoaded] = useState(false)

  const cfg = STATUS_CFG[status] || STATUS_CFG.normal
  const ownerColor = avatarColor(report.owner)

  // タスク読み込み
  useEffect(() => {
    if (!open || tasksLoaded) return
    supabase.from('ka_tasks').select('*').eq('report_id', report.id).order('id')
      .then(({data}) => { setTasks(data||[]); setTasksLoaded(true) })
  }, [open])

  const addTask = () => setTasks(p => [...p, { _tmp: Date.now(), title:'', assignee:'', due_date:'', done:false, report_id: report.id }])

  const updateTask = (key, field, val) => setTasks(p => p.map(t => (t.id||t._tmp)===key ? {...t, [field]:val} : t))

  const removeTask = async (key) => {
    const task = tasks.find(t => (t.id||t._tmp)===key)
    if (task?.id) await supabase.from('ka_tasks').delete().eq('id', task.id)
    setTasks(p => p.filter(t => (t.id||t._tmp)!==key))
  }

  const toggleDone = async (key) => {
    const task = tasks.find(t => (t.id||t._tmp)===key)
    const newDone = !task.done
    if (task?.id) await supabase.from('ka_tasks').update({ done: newDone }).eq('id', task.id)
    setTasks(p => p.map(t => (t.id||t._tmp)===key ? {...t, done:newDone} : t))
  }

  const cycleStatus = (e) => {
    e.stopPropagation()
    const idx = STATUS_ORDER.indexOf(status)
    setStatus(STATUS_ORDER[(idx+1) % STATUS_ORDER.length])
  }

  const save = async (e) => {
    e && e.stopPropagation()
    setSaving(true)
    await supabase.from('weekly_reports').update({ good, more, focus_output: focusOutput, status }).eq('id', report.id)
    // タスクの保存
    for (const t of tasks) {
      const data = { title:t.title||'', assignee:t.assignee||null, due_date:t.due_date||null, done:t.done, report_id:report.id }
      if (t.id) { await supabase.from('ka_tasks').update(data).eq('id', t.id) }
      else if (t.title?.trim()) {
        const {data:inserted} = await supabase.from('ka_tasks').insert([data]).select().single()
        if (inserted) setTasks(p => p.map(tk => tk._tmp===t._tmp ? inserted : tk))
      }
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    onSave({ ...report, good, more, focus_output: focusOutput, status })
  }

  const taStyle = { width:'100%', background: wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55, transition:'border-color 0.15s' }
  const flblStyle = (color, bg) => ({ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, display:'inline-flex', alignItems:'center', gap:4, marginBottom:3, color, background:bg })
  const doneTasks = tasks.filter(t=>t.done).length

  return (
    <div onClick={() => !open && setOpen(true)} style={{ background: open ? `${wT().bgCard}` : wT().bgCard, border:`1px solid ${open ? '#4d9fff50' : wT().border}`, borderRadius:10, marginBottom:8, overflow:'hidden', cursor: open ? 'default' : 'pointer', transition:'border-color 0.15s' }}>

      {/* ヘッダー */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }} onClick={() => setOpen(p=>!p)}>
        <Avatar name={report.owner} size={22} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:wT().text, lineHeight:1.3 }}>{report.ka_title}</div>
          {report.kr_title && <div style={{ fontSize:10, color:'#4d9fff', background:'rgba(77,159,255,0.08)', border:'1px solid rgba(77,159,255,0.2)', borderRadius:4, padding:'1px 6px', display:'inline-block', marginTop:3, maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📊 {report.kr_title}</div>}
        </div>
        <span onClick={cycleStatus} style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:99, cursor:'pointer', flexShrink:0, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, whiteSpace:'nowrap' }}>{cfg.label}</span>
        {report.owner && <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}><span style={{ fontSize:11, color:ownerColor, fontWeight:600 }}>{report.owner}</span></div>}
        {report.report_time && <span style={{ fontSize:10, color:wT().textFaint, flexShrink:0 }}>⏱{report.report_time}</span>}
        <button onClick={e=>{e.stopPropagation();onDelete(report.id)}} style={{ width:22, height:22, borderRadius:4, border:'none', cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,107,107,0.08)', color:'#ff6b6b', flexShrink:0 }}>✕</button>
        <span style={{ color:wT().textFaint, fontSize:11, transform:open?'rotate(180deg)':'rotate(0deg)', transition:'transform 0.2s', display:'inline-block', flexShrink:0 }}>▾</span>
      </div>

      {/* 閉じてるときのプレビュー */}
      {!open && (good || more || focusOutput) && (
        <div style={{ display:'flex', gap:10, padding:'0 12px 8px 42px', flexWrap:'wrap' }}>
          {good && <div style={{ display:'flex', alignItems:'flex-start', gap:4, fontSize:11, color:wT().textSub, lineHeight:1.4, maxWidth:280 }}><span style={{ color:'#00d68f', fontWeight:700, fontSize:10, flexShrink:0, marginTop:1 }}>✅</span><span>{good.slice(0,60)}{good.length>60?'…':''}</span></div>}
          {more && <div style={{ display:'flex', alignItems:'flex-start', gap:4, fontSize:11, color:wT().textSub, lineHeight:1.4, maxWidth:280 }}><span style={{ color:'#ff6b6b', fontWeight:700, fontSize:10, flexShrink:0, marginTop:1 }}>🔺</span><span>{more.slice(0,60)}{more.length>60?'…':''}</span></div>}
        </div>
      )}

      {/* 開いてるときの編集エリア */}
      {open && (
        <div style={{ padding:'0 12px 12px' }} onClick={e=>e.stopPropagation()}>
          {/* Good / More */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <div style={flblStyle('#00d68f','rgba(0,214,143,0.1)')}>✅ Good — うまくいったこと</div>
              <textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} placeholder="うまくいったこと・継続したいこと" style={taStyle} onFocus={e=>e.target.style.borderColor='rgba(0,214,143,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border} />
            </div>
            <div>
              <div style={flblStyle('#ff6b6b','rgba(255,107,107,0.1)')}>🔺 More — 課題・改善点</div>
              <textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} placeholder="うまくいかなかったこと・課題" style={taStyle} onFocus={e=>e.target.style.borderColor='rgba(255,107,107,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border} />
            </div>
          </div>

          {/* コネクター */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 0', marginBottom:8 }}>
            <div style={{ flex:1, height:1, background:wT().border }} />
            <span style={{ fontSize:10, color:wT().textMuted, whiteSpace:'nowrap' }}>↓ Moreへの対応</span>
            <div style={{ flex:1, height:1, background:wT().border }} />
          </div>

          {/* 注力アクション */}
          <div style={{ marginBottom:10 }}>
            <div style={flblStyle('#4d9fff','rgba(77,159,255,0.1)')}>🎯 今週の注力アクション</div>
            <textarea value={focusOutput} onChange={e=>setFocusOutput(e.target.value)} rows={2} placeholder="Moreに対してどう動くか" style={taStyle} onFocus={e=>e.target.style.borderColor='rgba(77,159,255,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border} />
          </div>

          {/* タスクリスト */}
          <div style={{ marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={flblStyle('#a855f7','rgba(168,85,247,0.1)')}>📋 タスク {doneTasks}/{tasks.length}</div>
            </div>
            {/* タスク行 */}
            {tasks.map(t => {
              const key = t.id || t._tmp
              const tc = avatarColor(t.assignee)
              return (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, marginBottom:4, background: t.done ? wT().borderLight : wT().bgCard, border:`1px solid ${t.done?wT().border:wT().borderMid}`, opacity: t.done?0.6:1 }}>
                  {/* 完了チェック */}
                  <div onClick={()=>toggleDone(key)} style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${t.done?'#00d68f':wT().borderMid}`, background:t.done?'#00d68f':'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {t.done && <span style={{ fontSize:9, color:'#fff', fontWeight:700 }}>✓</span>}
                  </div>
                  {/* タスク名 */}
                  <input value={t.title} onChange={e=>updateTask(key,'title',e.target.value)} placeholder="タスク内容" style={{ flex:1, background:'transparent', border:'none', color:t.done?wT().textMuted:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', textDecoration:t.done?'line-through':'none' }} />
                  {/* 担当者 */}
                  <select value={t.assignee||''} onChange={e=>updateTask(key,'assignee',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.assignee?tc:wT().textMuted, fontSize:11, cursor:'pointer', fontFamily:'inherit', outline:'none', flexShrink:0, maxWidth:80 }}>
                    <option value="">担当者</option>
                    {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  {/* 期日 */}
                  <input type="date" value={t.due_date||''} onChange={e=>updateTask(key,'due_date',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.due_date?wT().text:wT().textMuted, fontSize:11, outline:'none', fontFamily:'inherit', flexShrink:0, maxWidth:110 }} />
                  {/* 削除 */}
                  <button onClick={()=>removeTask(key)} style={{ width:18, height:18, borderRadius:3, border:'none', background:'transparent', color:wT().textFaint, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                </div>
              )
            })}
            {/* タスク追加ボタン */}
            <div onClick={addTask} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, border:`1px dashed ${wT().borderMid}`, cursor:'pointer', color:wT().textMuted, fontSize:11, marginTop:2 }}>
              <span style={{ fontSize:14, lineHeight:1 }}>+</span> タスクを追加
            </div>
          </div>

          {/* フッター */}
          <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:8, borderTop:`1px solid ${wT().border}` }}>
            <span style={{ fontSize:10, color:wT().textFaintest, marginRight:'auto' }}>💾 Tabキーで次のフィールドへ移動</span>
            <button onClick={()=>setOpen(false)} style={{ padding:'5px 12px', borderRadius:6, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={save} disabled={saving} style={{ padding:'5px 16px', borderRadius:6, background: saved?'#00d68f':'#4d9fff', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background 0.3s' }}>
              {saved ? '✓ 保存済み' : saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KA追加モーダル ────────────────────────────────────────────────────────────
function AddKAModal({ onSave, onClose, levels, weekStart, objectives, members, defaultLevelId, defaultObjId, wT }) {
  const [kaTitle,     setKaTitle]     = useState('')
  const [levelId,     setLevelId]     = useState(String(defaultLevelId || levels[0]?.id || ''))
  const [objectiveId, setObjectiveId] = useState(String(defaultObjId || ''))
  const [owner,       setOwner]       = useState('')
  const [status,      setStatus]      = useState('normal')
  const [saving,      setSaving]      = useState(false)

  const levelObjs = objectives.filter(o => Number(o.level_id) === Number(levelId))

  const save = async () => {
    if (!kaTitle.trim()) return
    setSaving(true)
    await onSave({
      week_start: weekStart,
      level_id: parseInt(levelId),
      objective_id: objectiveId ? parseInt(objectiveId) : null,
      ka_title: kaTitle.trim(),
      owner: owner || null,
      status,
    })
    setSaving(false)
    onClose()
  }

  const iStyle = { width:'100%', background:wT().bgCard, border:`1px solid ${wT().borderMid}`, borderRadius:8, padding:'9px 12px', color:wT().text, fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', marginBottom:12 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:wT().bgCard2, border:`1px solid ${wT().borderMid}`, borderRadius:14, width:'100%', maxWidth:480 }}>
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${wT().border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontSize:15, color:wT().text }}>KAを追加</span>
          <button onClick={onClose} style={{ background:wT().borderLight, border:'none', color:wT().textSub, width:28, height:28, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:11, color:wT().textMuted, marginBottom:5 }}>所属部署</div>
          <select value={levelId} onChange={e=>{setLevelId(e.target.value);setObjectiveId('')}} style={{ ...iStyle, background:wT().bgCard2, cursor:'pointer' }}>
            {levels.map(l=><option key={l.id} value={String(l.id)}>{l.icon} {l.name}</option>)}
          </select>
          <div style={{ fontSize:11, color:wT().textMuted, marginBottom:5 }}>紐づくOKR（任意）</div>
          <select value={objectiveId} onChange={e=>setObjectiveId(e.target.value)} style={{ ...iStyle, background:wT().bgCard2, cursor:'pointer' }}>
            <option value="">-- OKRを選択 --</option>
            {levelObjs.map(o=><option key={o.id} value={String(o.id)}>[{PERIOD_LABELS[o.period]||o.period}] {o.title}</option>)}
          </select>
          <div style={{ fontSize:11, color:wT().textMuted, marginBottom:5 }}>KAタイトル *</div>
          <input value={kaTitle} onChange={e=>setKaTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} placeholder="例：CSジャーニーの可視化" style={iStyle} autoFocus />
          <div style={{ fontSize:11, color:wT().textMuted, marginBottom:8 }}>KA責任者</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
            {members.map(m => {
              const c = avatarColor(m.name); const isSel = owner===m.name
              return <div key={m.id} onClick={()=>setOwner(isSel?'':m.name)} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:8, cursor:'pointer', border:`1px solid ${isSel?c+'80':wT().borderMid}`, background:isSel?`${c}15`:'transparent' }}>
                <Avatar name={m.name} size={18} /><span style={{ fontSize:12, color:isSel?c:wT().textSub, fontWeight:isSel?700:400 }}>{m.name}</span>
              </div>
            })}
            {members.length===0 && <input value={owner} onChange={e=>setOwner(e.target.value)} placeholder="例：鬼木" style={{ ...iStyle, marginBottom:0 }} />}
          </div>
          <div style={{ fontSize:11, color:wT().textMuted, marginBottom:8 }}>ステータス</div>
          <div style={{ display:'flex', gap:6, marginBottom:16 }}>
            {Object.entries(STATUS_CFG).map(([key,cfg])=>(
              <button key={key} onClick={()=>setStatus(key)} style={{ flex:1, padding:'6px 4px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:600, border:`1px solid ${status===key?cfg.border:wT().borderMid}`, background:status===key?cfg.bg:'transparent', color:status===key?cfg.color:wT().textMuted }}>{cfg.label}</button>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>キャンセル</button>
            <button onClick={save} disabled={saving||!kaTitle.trim()} style={{ background:'#4d9fff', border:'none', color:'#fff', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', opacity:saving||!kaTitle.trim()?0.5:1 }}>{saving?'追加中...':'追加'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── KRブロック（KR + KA一覧） ────────────────────────────────────────────────
function KRBlock({ kr, reports, onAddKA, onSaveKA, onDeleteKA, members, objectives, wT, weekStart, levelId, objId }) {
  const krReports = reports.filter(r => r.kr_id === kr.id)
  const pct = kr.target ? Math.min(Math.round((kr.current / kr.target) * 100), 150) : 0
  const pctColor = pct >= 100 ? '#00d68f' : pct >= 60 ? '#4d9fff' : '#ff6b6b'

  const addKA = async () => {
    const { error } = await supabase.from('weekly_reports').insert([{
      week_start: weekStart,
      level_id: levelId,
      objective_id: objId,
      kr_id: kr.id,
      kr_title: kr.title,
      ka_title: '新しいKA',
      status: 'normal',
    }])
    if (error) console.error('KA追加エラー:', error)
    else onAddKA()
  }

  return (
    <div style={{ marginBottom:16 }}>
      {/* KRヘッダー */}
      <div style={{ padding:'8px 12px', background: wT().bgCard, border:`1px solid ${wT().border}`, borderLeft:`3px solid ${pctColor}`, borderRadius:8, marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
          <div style={{ fontSize:11, fontWeight:700, color:pctColor, background:`${pctColor}15`, padding:'2px 7px', borderRadius:4 }}>{pct}%</div>
          <span style={{ fontSize:12, color:wT().textSub, lineHeight:1.4, flex:1 }}>{kr.title}</span>
          <span style={{ fontSize:11, color:wT().textMuted, flexShrink:0 }}>{kr.current}{kr.unit} / {kr.target}{kr.unit}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ flex:1, height:4, borderRadius:2, background:wT().borderLight, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:pctColor, borderRadius:2 }} />
          </div>
        </div>
      </div>

      {/* このKRのKA一覧 */}
      <div style={{ paddingLeft:12 }}>
        {krReports.map(r => (
          <KACard key={r.id} report={r} onSave={onSaveKA} onDelete={onDeleteKA} objectives={objectives} members={members} wT={wT} />
        ))}
        {/* KA追加ボタン */}
        <div onClick={addKA} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:7, border:`1px dashed ${wT().borderMid}`, cursor:'pointer', color:wT().textMuted, fontSize:11, marginTop:4 }}>
          <span style={{ fontSize:14, lineHeight:1 }}>+</span> このKRにKAを追加
        </div>
      </div>
    </div>
  )
}

// ─── メインページ ──────────────────────────────────────────────────────────────
export default function WeeklyMTGPage({ levels, themeKey = 'dark' }) {
  const wT = () => W_THEMES[themeKey] || W_THEMES.dark
  const weeks = getPastWeeks(10)
  const [weekIdx,       setWeekIdx]       = useState(0)
  const [reports,       setReports]       = useState([])
  const [objectives,    setObjectives]    = useState([])
  const [keyResults,    setKeyResults]    = useState([])
  const [members,       setMembers]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [activeLevelId, setActiveLevelId] = useState(null)
  const [activeObjId,   setActiveObjId]   = useState(null)
  const [activePeriod,  setActivePeriod]  = useState('all')

  const currentWeek = weeks[weekIdx]

  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period').order('level_id').then(({data})=>setObjectives(data||[]))
    supabase.from('key_results').select('*').order('objective_id').then(({data})=>setKeyResults(data||[]))
    supabase.from('members').select('id,name,role,level_id').order('name').then(({data})=>setMembers(data||[]))
  }, [])

  useEffect(() => {
    if (!currentWeek) return
    setLoading(true)
    supabase.from('weekly_reports').select('*').eq('week_start', currentWeek).order('id')
      .then(({data})=>{ setReports(data||[]); setLoading(false) })
  }, [currentWeek])

  const reload = async () => {
    const {data} = await supabase.from('weekly_reports').select('*').eq('week_start', currentWeek).order('id')
    setReports(data||[])
  }

  const handleSave = (updated) => setReports(p => p.map(r => r.id===updated.id ? updated : r))
  const handleDelete = async (id) => {
    if (!window.confirm('削除しますか？')) return
    await supabase.from('weekly_reports').delete().eq('id', id)
    setReports(p => p.filter(r => r.id!==id))
  }

  // 表示OKR
  const visibleLevels = activeLevelId ? levels.filter(l=>Number(l.id)===Number(activeLevelId)) : levels
  const visibleObjs = objectives.filter(o => {
    const levelOk = visibleLevels.some(l => Number(l.id) === Number(o.level_id))
    const periodOk = activePeriod==='all' || o.period===activePeriod
    return levelOk && periodOk
  })
  const selectedObj = activeObjId ? objectives.find(o => o.id===Number(activeObjId)) : null
  const selectedObjKRs = activeObjId ? keyResults.filter(kr => Number(kr.objective_id)===Number(activeObjId)) : []
  const depth = selectedObj ? getDepth(selectedObj.level_id, levels) : 0
  const objColor = LAYER_COLORS[depth] || '#a0a8be'

  // サイドバー
  const roots = levels.filter(l => !l.parent_id)
  function renderSb(level, indent=0) {
    const d = getDepth(level.id, levels)
    const color = LAYER_COLORS[d] || '#a0a8be'
    const isActive = Number(activeLevelId) === Number(level.id)
    return (
      <div key={level.id}>
        <div onClick={()=>{ setActiveLevelId(isActive?null:level.id); setActiveObjId(null) }} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', paddingLeft:8+indent*14, borderRadius:7, cursor:'pointer', marginBottom:2, border:`1px solid ${isActive?color+'40':'transparent'}`, background:isActive?`${color}18`:'transparent' }}>
          <span style={{ fontSize:13 }}>{level.icon}</span>
          <span style={{ fontSize:11, flex:1, fontWeight:isActive?700:500, color:isActive?color:wT().textSub }}>{level.name}</span>
        </div>
        {levels.filter(l=>Number(l.parent_id)===Number(level.id)).map(c=>renderSb(c, indent+1))}
      </div>
    )
  }

  const periodTabs = [['all','すべて'],['annual','通期'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4']]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:wT().bg, color:wT().text, fontFamily:'system-ui,sans-serif' }}>

      {/* ヘッダー */}
      <div style={{ padding:'11px 16px', borderBottom:`1px solid ${wT().border}`, display:'flex', alignItems:'center', gap:8, flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ fontSize:16, fontWeight:700 }}>週次KA確認</div>
        <div style={{ display:'flex', gap:4, alignItems:'center', marginLeft:8 }}>
          {weeks.slice(0,6).map((w,i)=>(
            <button key={w} onClick={()=>setWeekIdx(i)} style={{ padding:'4px 10px', borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:600, background:weekIdx===i?'rgba(77,159,255,0.18)':'transparent', border:`1px solid ${weekIdx===i?'rgba(77,159,255,0.45)':wT().borderMid}`, color:weekIdx===i?'#4d9fff':wT().textSub }}>
              {formatWeekLabel(w)}{i===0?'（今週）':''}
            </button>
          ))}
        </div>
        <span style={{ marginLeft:'auto', fontSize:11, color:wT().textMuted }}>{currentWeek}</span>
      </div>

      {/* 期間タブ */}
      <div style={{ display:'flex', gap:4, padding:'7px 16px', borderBottom:`1px solid ${wT().border}`, flexShrink:0, alignItems:'center' }}>
        <span style={{ fontSize:11, color:wT().textMuted, fontWeight:700, marginRight:4 }}>期間：</span>
        {periodTabs.map(([key,lbl])=>(
          <button key={key} onClick={()=>{setActivePeriod(key);setActiveObjId(null)}} style={{ padding:'4px 12px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, background:activePeriod===key?(key==='all'?wT().borderMid:'rgba(77,159,255,0.15)'):'transparent', border:`1px solid ${activePeriod===key?(key==='all'?wT().border:'rgba(77,159,255,0.4)'):wT().borderMid}`, color:activePeriod===key?(key==='all'?wT().text:'#4d9fff'):wT().textMuted }}>{lbl}</button>
        ))}
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

        {/* 中央：Objective一覧 */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${wT().border}`, overflowY:'auto', padding:10, background:wT().bg }}>
          <div style={{ fontSize:10, color:'#4d9fff', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>🎯 Objective（{visibleObjs.length}件）</div>
          {visibleObjs.length===0 && <div style={{ fontSize:12, color:wT().textFaintest, fontStyle:'italic', padding:'10px 4px' }}>Objectiveがありません</div>}
          {visibleObjs.map(obj => {
            const isActive = Number(activeObjId)===Number(obj.id)
            const d = getDepth(obj.level_id, levels)
            const color = LAYER_COLORS[d] || '#a0a8be'
            const level = levels.find(l=>Number(l.id)===Number(obj.level_id))
            const krCount = keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id)).length
            const kaCount = reports.filter(r=>Number(r.objective_id)===Number(obj.id)).length
            return (
              <div key={obj.id} onClick={()=>setActiveObjId(isActive?null:obj.id)} style={{ padding:'10px 12px', borderRadius:9, marginBottom:7, cursor:'pointer', border:`1px solid ${isActive?color+'60':wT().border}`, background:isActive?`${color}10`:wT().bgCard, transition:'all 0.12s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:99, background:`${color}18`, color }}>{PERIOD_LABELS[obj.period]||obj.period}</span>
                  {level && <span style={{ fontSize:10, color:wT().textMuted }}>{level.icon} {level.name}</span>}
                </div>
                <div style={{ fontSize:12, fontWeight:600, lineHeight:1.4, marginBottom:6, color:isActive?wT().text:wT().textSub }}>{obj.title}</div>
                <div style={{ display:'flex', gap:8, fontSize:10, color:wT().textMuted }}>
                  <span>KR {krCount}件</span>
                  <span style={{ color: kaCount>0?'#4d9fff':wT().textFaint }}>KA {kaCount}件</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 右：Objective詳細 + KR + KA */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', background:wT().bgCard2 }}>
          {!selectedObj ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:10, color:wT().textFaint }}>
              <div style={{ fontSize:36 }}>🎯</div>
              <div style={{ fontSize:13 }}>左のObjectiveをクリックしてください</div>
            </div>
          ) : (
            <>
              {/* Objective詳細ヘッダー */}
              <div style={{ padding:'12px 14px', background:`${objColor}0e`, border:`1px solid ${objColor}30`, borderLeft:`4px solid ${objColor}`, borderRadius:10, marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:`${objColor}20`, color:objColor }}>{PERIOD_LABELS[selectedObj.period]||selectedObj.period}</span>
                  <span style={{ fontSize:10, color:wT().textMuted }}>Objective</span>
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:wT().text, lineHeight:1.5 }}>{selectedObj.title}</div>
              </div>

              {/* KRがない場合 */}
              {selectedObjKRs.length===0 && (
                <div style={{ textAlign:'center', padding:30, color:wT().textFaint, fontSize:12 }}>
                  KRが登録されていません。OKRページからKRを追加してください。
                </div>
              )}

              {/* KRごとにブロック表示 */}
              {loading && <div style={{ textAlign:'center', padding:20, color:'#4d9fff', fontSize:13 }}>読み込み中...</div>}
              {!loading && selectedObjKRs.map(kr => (
                <KRBlock
                  key={kr.id}
                  kr={kr}
                  reports={reports}
                  onAddKA={reload}
                  onSaveKA={handleSave}
                  onDeleteKA={handleDelete}
                  members={members}
                  objectives={objectives}
                  wT={wT}
                  weekStart={currentWeek}
                  levelId={selectedObj.level_id}
                  objId={selectedObj.id}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
