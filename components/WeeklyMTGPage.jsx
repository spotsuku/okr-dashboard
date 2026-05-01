'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import { COMMON_TOKENS } from '../lib/themeTokens'
import { HeroCard, DashboardTile } from './iosUI'
import { useAutoSave } from '../lib/useAutoSave'
import { buildQuarterMap } from '../lib/objectiveMatching'
import { computeKAKey } from '../lib/kaKey'
import { WEEKLY_MTG_MEETINGS, getMeeting } from '../lib/meetings'
import WeeklyMTGFacilitation from './WeeklyMTGFacilitation'

// 会議ごとのアイコン (SVG・currentColor を継承)
const Ico = ({ size=22, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const MEETING_ICONS = {
  'kickoff-partner':   p => <Ico {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Ico>,                                         // パルス波形 (ローンチ)
  'kickoff-youth':     p => <Ico {...p}><path d="M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 5.56 5.56 0 0 0 3.8 1.5c1.63-.225 2.65-1.213 3.9-2.2 1.25-.987 2.27-1.975 3.9-2.2 1.96-.295 3.272.633 4.7 2.2"/><path d="M2 16c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 5.56 5.56 0 0 0 3.8 1.5c1.63-.225 2.65-1.213 3.9-2.2 1.25-.987 2.27-1.975 3.9-2.2 1.96-.295 3.272.633 4.7 2.2"/><path d="M2 10c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 5.56 5.56 0 0 0 3.8 1.5c1.63-.225 2.65-1.213 3.9-2.2 1.25-.987 2.27-1.975 3.9-2.2 1.96-.295 3.272.633 4.7 2.2"/></Ico>,
  'kickoff-community': p => <Ico {...p}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="17" cy="7" r="3"/><path d="M22 21v-1a4 4 0 0 0-3-3.87"/></Ico>,
  'sales':             p => <Ico {...p}><path d="M22 7L13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/></Ico>,                       // 上昇トレンド
  'manager':           p => <Ico {...p}><circle cx="12" cy="8" r="5"/><path d="M3 21a9 9 0 0 1 18 0"/></Ico>,
  'director':          p => <Ico {...p}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></Ico>,
  'planning':          p => <Ico {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="15" y2="11"/></Ico>,
  'board':             p => <Ico {...p}><path d="M12 2L4 7v6c0 5 3.4 9.5 8 11 4.6-1.5 8-6 8-11V7l-8-5z"/></Ico>,             // 盾 (役員)
  _default:            p => <Ico {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Ico>,
}

// テーマは lib/themeTokens.js で一元管理
const DARK_T  = { ...COMMON_TOKENS.dark }
const LIGHT_T = { ...COMMON_TOKENS.light }
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
// JST基準で「入力日時を含む週の月曜日(00:00 JST)」を Date(UTC midnight) として返す
//   JST 月 4/13 00:30 → UTC 4/12 15:30 → +9h = UTC 4/13 00:30 → jstDay=1 → UTC 4/13 00:00
//   JST 日 4/12 23:00 → UTC 4/12 14:00 → +9h = UTC 4/12 23:00 → jstDay=0 → UTC 4/6 00:00
//   JST 金 4/10 08:39 → UTC 4/9 23:39  → +9h = UTC 4/10 08:39 → jstDay=5 → UTC 4/6 00:00
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
// Objective 1行コンパクト表示 + ▾ で全文展開 (localStorage に状態保持)
function ObjectiveCompactCard({ title, ownerName, members, wT, label, labelColor, titleColor, isDone, storageKey, style }) {
  const [expanded, setExpanded] = useState(false)
  // 初期値をlocalStorageから読む
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return
    try {
      const v = localStorage.getItem(storageKey)
      if (v === '1') setExpanded(true)
    } catch {}
  }, [storageKey])
  const toggle = () => {
    setExpanded(e => {
      const next = !e
      if (storageKey && typeof window !== 'undefined') {
        try { localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
      }
      return next
    })
  }
  const bgBase = isDone ? 'rgba(0,214,143,0.08)' : `${labelColor}0e`
  const borderBase = isDone ? 'rgba(0,214,143,0.3)' : `${labelColor}30`
  return (
    <div style={{
      padding: expanded ? '10px 14px' : '7px 12px',
      background: bgBase,
      border: `1px solid ${borderBase}`,
      borderLeft: `3px solid ${labelColor}`,
      borderRadius: 8,
      ...style,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:`${labelColor}22`, color:labelColor, flexShrink:0 }}>{label}</span>
        {!expanded && (
          <div style={{
            flex: 1, minWidth: 0,
            fontSize: 12, fontWeight: 700, color: titleColor,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.4,
          }} title={title}>{title}</div>
        )}
        {expanded && (
          <span style={{ fontSize:10, color:wT().textMuted }}>Objective</span>
        )}
        {isDone && expanded && (
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'rgba(0,214,143,0.15)', color:'#00d68f' }}>🏆 達成済み</span>
        )}
        {ownerName && <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <OwnerBadge name={ownerName} members={members} size={20} />
        </div>}
        <button
          onClick={toggle}
          title={expanded ? '折りたたむ' : '全文表示'}
          style={{
            background: 'transparent', border: `1px solid ${wT().border}`,
            borderRadius: 5, padding: '2px 7px', fontSize: 10,
            cursor: 'pointer', fontFamily: 'inherit', color: wT().textMuted,
            flexShrink: 0,
          }}
        >{expanded ? '▴' : '▾'}</button>
      </div>
      {expanded && (
        <div style={{ fontSize:14, fontWeight:700, color:titleColor, lineHeight:1.5, marginTop:6 }}>
          {title}
        </div>
      )}
    </div>
  )
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
// schedule文字列(月曜/火曜/...)から月曜起点の曜日offset(0-6)を返す
function scheduleToOffset(schedule) {
  const map = { '月曜':0, '火曜':1, '水曜':2, '木曜':3, '金曜':4, '土曜':5, '日曜':6 }
  return map[schedule] ?? 0  // 不明・「平日毎日」は月曜扱い
}
// その週の会議日ラベル: "4/22(火) MTG" を返す
function formatMeetingDayLabel(mondayStr, schedule) {
  const [y, m, day] = mondayStr.split('-').map(Number)
  const offset = scheduleToOffset(schedule)
  const meetDate = new Date(Date.UTC(y, m - 1, day + offset))
  const wd = ['日','月','火','水','木','金','土'][meetDate.getUTCDay()]
  return `${meetDate.getUTCMonth()+1}/${meetDate.getUTCDate()}(${wd})`
}
// 「先週」の月曜日(週の月曜から-7日)
function getPrevMondayStr(mondayStr) {
  const [y, m, day] = mondayStr.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, day - 7))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,'0')}-${String(prev.getUTCDate()).padStart(2,'0')}`
}
function isFriday() {
  // JST基準の曜日判定
  const jst = new Date(Date.now() + 9 * 3600 * 1000)
  return jst.getUTCDay() === 5
}
function getNextMonday() {
  // 翌週の月曜日 = 今週の月曜日 + 7日
  const thisMon = getMonday(new Date())
  const nextMon = new Date(Date.UTC(
    thisMon.getUTCFullYear(),
    thisMon.getUTCMonth(),
    thisMon.getUTCDate() + 7
  ))
  return toDateStr(nextMon)
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
    <div ref={ref} style={{ position:'absolute', top:'100%', right:0, zIndex:100, width:420, background:wT().bgCard, border:`1px solid ${wT().borderMid}`, borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,0.3)', padding:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:700, color:'#a855f7' }}>📋 タスク {doneCount}/{tasks.length}</span>
        <button onClick={onClose} style={{ marginLeft:'auto', background:'transparent', border:'none', color:wT().textFaint, cursor:'pointer', fontSize:14 }}>✕</button>
      </div>
      {!loaded && <div style={{ fontSize:11, color:wT().textMuted, padding:8 }}>読み込み中...</div>}
      {tasks.map(t => {
        const key = t.id; const tc = avatarColor(t.assignee); const isSaving = saving[key]
        return (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', borderRadius:7, marginBottom:4, background:t.done?wT().borderLight:wT().bgCard, border:`1px solid ${t.done?wT().border:wT().borderMid}`, opacity:t.done?0.6:1 }}>
            <div onClick={()=>toggleDone(key)} style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${t.done?'#00d68f':wT().borderMid}`, background:t.done?'#00d68f':'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {t.done && <span style={{ fontSize:9, color:'#fff', fontWeight:700 }}>✓</span>}
            </div>
            <input value={t.title} onChange={e=>updateTask(key,'title',e.target.value)} placeholder="タスク内容" style={{ flex:1, background:'transparent', border:'none', color:t.done?wT().textMuted:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', textDecoration:t.done?'line-through':'none' }}/>
            <select value={t.assignee||''} onChange={e=>updateTask(key,'assignee',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.assignee?tc:wT().textMuted, fontSize:11, cursor:'pointer', fontFamily:'inherit', outline:'none', flexShrink:0, maxWidth:80 }}>
              <option value="">担当</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <input type="date" value={t.due_date||''} onChange={e=>updateTask(key,'due_date',e.target.value)} style={{ background:wT().bgCard2, border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 6px', color:t.due_date?wT().text:wT().textMuted, fontSize:11, outline:'none', fontFamily:'inherit', flexShrink:0, maxWidth:110 }}/>
            <button onClick={()=>saveTask(key)} disabled={isSaving} style={{ padding:'2px 8px', borderRadius:4, border:'none', background:isSaving?'#666':'#a855f7', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>{isSaving?'...':'保存'}</button>
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

  const cellS = { padding:'6px 8px', borderBottom:`1px solid ${wT().border}`, verticalAlign:'top', fontSize:12 }
  // KA記入欄: 改行が気になりすぎないよう fontSize 11、lineHeight 1.55、自動拡張
  const taS = { width:'100%', boxSizing:'border-box', background:'transparent', border:`1px solid transparent`, borderRadius:5, padding:'5px 7px', color:wT().text, fontSize:11, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55, overflow:'hidden', transition:'border-color 0.15s' }
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
          ref={el => { if (el) autoGrowTextarea(el, 3) }}
          onChange={e=>{ handleFieldChange('good', e.target.value, setGood); autoGrowTextarea(e.target, 3) }}
          onFocus={e=>{ autoSave.setFocusedField('good'); e.target.style.borderColor='rgba(0,214,143,0.4)'; autoGrowTextarea(e.target, 5) }}
          onBlur={e=>{ autoSave.setFocusedField(null); autoSave.saveNow('good',good); e.target.style.borderColor='transparent'; autoGrowTextarea(e.target, 3) }}
          placeholder={canEdit?"良かったこと・続けたいこと":""}
          style={{ ...taS, color:good?wT().text:wT().textFaint }} />
      </td>
      {/* More */}
      <td style={cellS}>
        <textarea value={more} readOnly={!canEdit}
          ref={el => { if (el) autoGrowTextarea(el, 3) }}
          onChange={e=>{ handleFieldChange('more', e.target.value, setMore); autoGrowTextarea(e.target, 3) }}
          onFocus={e=>{ autoSave.setFocusedField('more'); e.target.style.borderColor='rgba(255,107,107,0.4)'; autoGrowTextarea(e.target, 5) }}
          onBlur={e=>{ autoSave.setFocusedField(null); autoSave.saveNow('more',more); e.target.style.borderColor='transparent'; autoGrowTextarea(e.target, 3) }}
          placeholder={canEdit?"課題・改善点":""}
          style={{ ...taS, color:more?wT().text:wT().textFaint }} />
      </td>
      {/* Focus */}
      <td style={cellS}>
        <textarea value={focusOutput} readOnly={!canEdit}
          ref={el => { if (el) autoGrowTextarea(el, 3) }}
          onChange={e=>{ handleFieldChange('focus_output', e.target.value, setFocusOutput); autoGrowTextarea(e.target, 3) }}
          onFocus={e=>{ autoSave.setFocusedField('focus_output'); e.target.style.borderColor='rgba(77,159,255,0.4)'; autoGrowTextarea(e.target, 5) }}
          onBlur={e=>{ autoSave.setFocusedField(null); autoSave.saveNow('focus_output',focusOutput); e.target.style.borderColor='transparent'; autoGrowTextarea(e.target, 3) }}
          placeholder={canEdit?"重点アクション":""}
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
        {showTasks && <TaskPopover report={report} members={members} wT={wT} onClose={()=>setShowTasks(false)} onTaskCountChange={setTaskCount} kaTitle={report.ka_title} objectiveTitle={objectiveTitle} completedBy={completedBy} />}
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
  const pctColor = pct >= 100 ? '#00d68f' : pct >= 60 ? '#4d9fff' : '#ff6b6b'
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

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }
  const hasReview = weather > 0 || good || more || focus

  return (
    <div style={{ marginBottom:16, border: dropHighlight ? '2px dashed #4d9fff' : '2px solid transparent', borderRadius:12, transition:'border-color 0.15s' }}
      onDragOver={handleKRDragOver} onDragLeave={handleKRDragLeave} onDrop={handleKRDrop}>
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
              <WeatherPicker value={weather} onChange={updateWeather} wT={wT} />
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
              <div style={{ fontSize:10, fontWeight:700, color:'#00d68f', background:'rgba(0,214,143,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-flex', alignItems:'center', gap:6 }}>
                ✅ good<span style={{ fontSize:9, fontWeight:500, opacity:0.8 }}>{activeWeek ? `(${formatWeekLabel(getPrevMondayStr(activeWeek))})` : ''}</span>
              </div>
              <textarea value={good} onChange={e=>updateGood(e.target.value)} rows={3} style={taS} onFocus={e=>e.target.style.borderColor='rgba(0,214,143,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#ff6b6b', background:'rgba(255,107,107,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-flex', alignItems:'center', gap:6 }}>
                🔺 more<span style={{ fontSize:9, fontWeight:500, opacity:0.8 }}>{activeWeek ? `(${formatWeekLabel(getPrevMondayStr(activeWeek))})` : ''}</span>
              </div>
              <textarea value={more} onChange={e=>updateMore(e.target.value)} rows={3} style={taS} onFocus={e=>e.target.style.borderColor='rgba(255,107,107,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ flex:1, height:1, background:wT().border }}/><span style={{ fontSize:10, color:wT().textMuted }}>↓ Moreへの対応</span><div style={{ flex:1, height:1, background:wT().border }}/>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#4d9fff', background:'rgba(77,159,255,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-flex', alignItems:'center', gap:6 }}>
              🎯 focus<span style={{ fontSize:9, fontWeight:500, opacity:0.8 }}>{activeWeek ? `(${formatWeekLabel(activeWeek)})` : ''}</span>
            </div>
            <textarea value={focus} onChange={e=>updateFocus(e.target.value)} rows={2} style={taS} onFocus={e=>e.target.style.borderColor='rgba(77,159,255,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <span style={{ fontSize:10, color: reviewSaved ? '#00d68f' : reviewSaving ? wT().textMuted : 'transparent', fontWeight:600, transition:'color 0.3s' }}>
              {reviewSaved ? '✓ 自動保存済み' : reviewSaving ? '保存中...' : ''}
            </span>
            <button onClick={()=>setReviewOpen(false)} style={{ padding:'5px 12px', borderRadius:6, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={saveReview} disabled={reviewSaving} style={{ padding:'5px 16px', borderRadius:6, background:reviewSaved?'#00d68f':'#4d9fff', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background 0.3s' }}>
              {reviewSaved?'✓ 保存済み':reviewSaving?'保存中...':'保存して週次MTGに反映'}
            </button>
          </div>
        </div>
      )}

      {/* KAテーブル: KR重点モードでは折り畳み */}
      {viewMode === 'kr' && !showKAInKRMode && (
        <div style={{ padding:'8px 14px', background:wT().bgCard, borderRadius: '0 0 10px 10px', border:`1px solid ${wT().border}`, borderTop:'none', display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setShowKAInKRMode(true)} style={{
            fontSize:10, color:wT().textMuted, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:5, padding:'3px 10px', cursor:'pointer', fontFamily:'inherit',
          }}>📋 KA {activeReports.length}件{doneReports.length > 0 ? ` (完了${doneReports.length}件)` : ''} を表示</button>
        </div>
      )}
      {(viewMode !== 'kr' || showKAInKRMode) && (
      <div style={{ border:`1px solid ${wT().border}`, borderTop: reviewOpen ? 'none' : `1px solid ${wT().border}`, borderRadius: reviewOpen ? '0 0 10px 10px' : '0 0 10px 10px', overflow:'auto', WebkitOverflowScrolling:'touch' }}>
        <table style={{ width:'100%', minWidth:700, borderCollapse:'collapse', tableLayout:'fixed' }}>
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
              <th style={{ padding:'6px 8px', fontSize:9, color:'#00d68f', fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>
                ✅ good<div style={{ fontSize:8, fontWeight:500, color:wT().textMuted, marginTop:1 }}>{activeWeek ? formatWeekLabel(getPrevMondayStr(activeWeek)) : ''}</div>
              </th>
              <th style={{ padding:'6px 8px', fontSize:9, color:'#ff6b6b', fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>
                🔺 more<div style={{ fontSize:8, fontWeight:500, color:wT().textMuted, marginTop:1 }}>{activeWeek ? formatWeekLabel(getPrevMondayStr(activeWeek)) : ''}</div>
              </th>
              <th style={{ padding:'6px 8px', fontSize:9, color:'#4d9fff', fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'left' }}>
                🎯 focus<div style={{ fontSize:8, fontWeight:500, color:wT().textMuted, marginTop:1 }}>{activeWeek ? formatWeekLabel(activeWeek) : ''}</div>
              </th>
              <th style={{ padding:'6px 8px', fontSize:9, color:wT().textMuted, fontWeight:700, borderBottom:`1px solid ${wT().border}`, textAlign:'center' }}>Tasks</th>
              <th style={{ padding:'6px 2px', borderBottom:`1px solid ${wT().border}` }}></th>
            </tr>
          </thead>
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
          <div style={{ padding:'4px 12px', background:wT().bgCard, borderTop:`1px solid ${wT().border}` }}>
            <button onClick={() => setShowDone(p=>!p)}
              style={{ fontSize:10, color:wT().textFaint, background:'transparent', border:`1px solid ${wT().border}`, borderRadius:5, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit' }}>
              {showDone ? '完了を隠す' : `✓ 完了済み ${doneReports.length}件`}
            </button>
          </div>
        )}
        {showDone && doneReports.length > 0 && (
          <table style={{ width:'100%', minWidth:700, borderCollapse:'collapse', tableLayout:'fixed' }}>
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
                  canEdit={canEditKA(r.owner, objOwner, kr.owner)} objectiveTitle={objectiveTitle} completedBy={completedBy} />
              ))}
            </tbody>
          </table>
        )}

        {/* KA追加ボタン */}
        <div onClick={addKA} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', cursor:'pointer', color:wT().textMuted, fontSize:11, borderTop:`1px solid ${wT().border}`, background:wT().bgCard }}>
          <span style={{ fontSize:14, lineHeight:1 }}>+</span> このKRにKAを追加
        </div>
      </div>
      )}
    </div>
  )
}

// ─── メインページ ──────────────────────────────────────────────────────────────
function getCurrentQ() { const m = new Date().getMonth(); return m >= 3 && m <= 5 ? 'q1' : m >= 6 && m <= 8 ? 'q2' : m >= 9 && m <= 11 ? 'q3' : 'q4' }
export default function WeeklyMTGPage({ levels, themeKey='dark', fiscalYear='2026', user, initialPeriod }) {
  const wT = () => W_THEMES[themeKey] || W_THEMES.dark
  const { isMobile, isTablet, isMobileOrTablet } = useResponsive()
  const [mobilePanel, setMobilePanel] = useState('list') // 'list' | 'detail'
  const [reports,       setReports]       = useState([])
  const [objectives,    setObjectives]    = useState([])
  const [keyResults,    setKeyResults]    = useState([])
  const [reviewVersion, setReviewVersion] = useState(0)
  const [members,       setMembers]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [activeLevelId, setActiveLevelId] = useState(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('weeklyMTG_activeLevelId')
    return saved && saved !== 'null' ? Number(saved) : null
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeLevelId == null) localStorage.removeItem('weeklyMTG_activeLevelId')
    else localStorage.setItem('weeklyMTG_activeLevelId', String(activeLevelId))
  }, [activeLevelId])
  const [activeObjId,   setActiveObjId]   = useState(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('weeklyMTG_activeObjId')
    return saved && saved !== 'null' ? Number(saved) : null
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeObjId == null) localStorage.removeItem('weeklyMTG_activeObjId')
    else localStorage.setItem('weeklyMTG_activeObjId', String(activeObjId))
  }, [activeObjId])
  const [activePeriod,  setActivePeriod]  = useState(initialPeriod || getCurrentQ())
  const [activeWeek,    setActiveWeek]    = useState(toDateStr(getMonday(new Date())))

  // 会議別ビュー: どの会議モードで表示するか (null = 会議選択画面)
  // 起動時はデフォルトで会議選択画面から開始するが、
  // 進行中のセッションがあれば下の useEffect でその会議を自動オープンする
  const [activeMeetingKey, setActiveMeetingKey] = useState(null)

  // ファシリ / 一覧 モード切替 (会議選択後)
  // localStorage で保存して同じ会議に戻った時の好みを記憶
  const [mtgMode, setMtgMode] = useState(() => {
    if (typeof window === 'undefined') return 'facilitation'
    return localStorage.getItem('weeklyMTG_mode') || 'facilitation'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('weeklyMTG_mode', mtgMode)
  }, [mtgMode])

  // 会議名で levels から該当レベルを検索
  const findLevelByName = (name) => {
    if (!name || !levels?.length) return null
    return levels.find(l => l.name === name) || null
  }

  // 会議を選択 → フィルタを設定
  const selectMeeting = (meetingKey) => {
    const m = getMeeting(meetingKey)
    if (!m?.weeklyMTG) return
    setActiveMeetingKey(meetingKey)
    setActiveObjId(null)
    if (m.weeklyMTG.levelName) {
      const lvl = findLevelByName(m.weeklyMTG.levelName)
      setActiveLevelId(lvl?.id || null)
    } else if (m.weeklyMTG.levelSelect === 'department') {
      setActiveLevelId(null) // 事業部をユーザーに選ばせる
    } else {
      setActiveLevelId(null) // 全社
    }
  }

  const backToMeetingSelect = () => {
    setActiveMeetingKey(null)
    setActiveObjId(null)
  }

  // 進行中のセッションがあれば自動でその会議を開く
  // (started_at != null かつ finished_at == null) を「進行中」とみなす
  useEffect(() => {
    // 既に何か開いていれば何もしない
    if (activeMeetingKey) return
    let alive = true
    const weekMon = toDateStr(getMonday(new Date()))
    supabase.from('weekly_mtg_sessions')
      .select('meeting_key, step, started_at, finished_at')
      .eq('week_start', weekMon)
      .not('started_at', 'is', null)
      .is('finished_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        if (data.meeting_key && WEEKLY_MTG_MEETINGS.some(m => m.key === data.meeting_key)) {
          selectMeeting(data.meeting_key)
        }
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentMeeting = activeMeetingKey ? getMeeting(activeMeetingKey) : null
  // マネージャー定例などで事業部を選んでいない状態
  const needsDeptSelect = currentMeeting?.weeklyMTG?.levelSelect === 'department' && activeLevelId == null

  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period,owner,parent_objective_id').order('level_id').range(0, 49999).then(({data})=>setObjectives(data||[]))
    supabase.from('key_results').select('*').order('objective_id').range(0, 49999).then(({data})=>setKeyResults((data||[]).map(kr => kr.current === undefined && kr.current_value !== undefined ? { ...kr, current: kr.current_value } : kr)))
    supabase.from('members').select('*').order('name').then(({data, error})=>{ if(error) console.error('members load error:', error); setMembers(data||[]) })
  }, [])

  useEffect(() => {
    setLoading(true)
    // PostgREST のデフォルト上限 (1000) を超える本番データ量を想定し range() で拡張
    supabase.from('weekly_reports').select('*').order('sort_order').order('id').range(0, 49999)
      .then(({data, error}) => {
        if (error) {
          console.warn('sort_order order failed, falling back:', error.message)
          return supabase.from('weekly_reports').select('*').order('id').range(0, 49999)
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

  // reload() は並列実行されうる (連続 KA 追加など)。古い SELECT 結果が後から来て
  // 新しい結果を上書きする race を防ぐため、reload ごとに ID を振って「最新のみ適用」する
  const reloadIdRef = useRef(0)
  const reload = async () => {
    const thisId = ++reloadIdRef.current
    // PostgREST の 1000 行上限を超えるデータでも全件取得する
    let { data, error } = await supabase.from('weekly_reports').select('*').order('sort_order').order('id').range(0, 49999)
    if (error) {
      const res = await supabase.from('weekly_reports').select('*').order('id').range(0, 49999)
      data = res.data
    }
    // このリクエスト中に後続の reload が始まっていたら、古い結果は捨てる
    if (thisId !== reloadIdRef.current) return
    setReports(data||[])
  }

  // ★ Supabase Realtime購読（weekly_reports + key_results 変更を即時同期）
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'key_results' }, payload => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          const kr = payload.new
          const normalized = kr.current === undefined && kr.current_value !== undefined ? { ...kr, current: kr.current_value } : kr
          setKeyResults(prev => prev.map(k => k.id === normalized.id ? { ...k, ...normalized } : k))
        } else if (payload.eventType === 'INSERT' && payload.new) {
          const kr = payload.new
          const normalized = kr.current === undefined && kr.current_value !== undefined ? { ...kr, current: kr.current_value } : kr
          setKeyResults(prev => prev.some(k => k.id === normalized.id) ? prev : [...prev, normalized])
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setKeyResults(prev => prev.filter(k => k.id !== payload.old.id))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kr_weekly_reviews' }, () => {
        setReviewVersion(v => v + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ★ 手動で週を作成（前週のKAをKR単位でコピー、既存KRはスキップ）
  const copyingRef = useRef(new Set())
  // プレースホルダー判定: タイトルが「新しいKA」のまま + owner 無し + 本文全て空
  //   (追加ボタンを押して放置された未完成 KA は carry-forward しない)
  const isOrphanedPlaceholder = (r) => {
    if (!r) return false
    const titleIsPlaceholder = (r.ka_title || '').trim() === '新しいKA'
    const noOwner = !(r.owner || '').trim()
    const noContent = !(r.good || '').trim() && !(r.more || '').trim() && !(r.focus_output || '').trim()
    return titleIsPlaceholder && noOwner && noContent
  }
  const createWeek = async (targetMonday) => {
    // 多重実行防止
    if (copyingRef.current.has(targetMonday)) return
    copyingRef.current.add(targetMonday)
    try {
      // 過去の全週から ka_key でユニークな active KA を集める
      //   (直前1週だけに頼ると、古い週にしか存在しない KA が永久に取り残される)
      //   同じ ka_key の場合、より新しい週のデータを優先する
      const srcMap = new Map()
      for (const r of reports) {
        if (r.week_start >= targetMonday) continue  // 未来週は除外
        if (r.status === 'done') continue            // 完了は引き継がない
        if (isOrphanedPlaceholder(r)) continue       // 未完成プレースホルダーは除外
        const k = computeKAKey(r)
        const cur = srcMap.get(k)
        if (!cur || (r.week_start || '') > (cur.week_start || '')) srcMap.set(k, r)
      }
      const srcKAs = Array.from(srcMap.values())
      if (srcKAs.length === 0) return

      // DB上の対象週データを直接取得 (state とのズレを防止)
      const { data: existingData } = await supabase.from('weekly_reports')
        .select('kr_id,ka_title,owner,objective_id').eq('week_start', targetMonday)
      // ka_key (4 列の組合せ) で判定。旧実装の kr_id+ka_title 同定は、
      // owner 違いの同タイトル KA を誤って重複扱いしていた
      const existingKeys = new Set(
        (existingData || []).map(r => computeKAKey(r))
      )

      // 未コピーの KA のみ抽出
      const toCopy = srcKAs.filter(r => !existingKeys.has(computeKAKey(r)))
      if (toCopy.length === 0) return

      const copies = toCopy.map(r => ({
        week_start: targetMonday, level_id: r.level_id, objective_id: r.objective_id,
        kr_id: r.kr_id, kr_title: r.kr_title, ka_title: r.ka_title,
        owner: r.owner, status: 'normal',
      }))
      await supabase.from('weekly_reports').insert(copies).select()

      // ★ ka_tasks は ka_key で週をまたぐ。コピー不要

      await reload()
      setActiveWeek(targetMonday)
    } finally {
      copyingRef.current.delete(targetMonday)
    }
  }

  // ★ 週を開いた時に過去週から未コピー KA を自動補完
  useEffect(() => {
    if (!activeWeek || loading || reports.length === 0) return
    // 過去の全週で active だった KA の ka_key セット
    //   未完成プレースホルダー (新しいKA / owner 無し / 本文空) は引き継がない
    const pastActive = new Map()
    for (const r of reports) {
      if (r.week_start >= activeWeek) continue
      if (r.status === 'done') continue
      if (isOrphanedPlaceholder(r)) continue
      const k = computeKAKey(r)
      if (!pastActive.has(k)) pastActive.set(k, true)
    }
    if (pastActive.size === 0) return
    // 選択週に既存の ka_key
    const existing = new Set(
      reports.filter(r => r.week_start === activeWeek).map(r => computeKAKey(r))
    )
    const missing = [...pastActive.keys()].filter(k => !existing.has(k))
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
  // KA 削除: 同じ ka_key を持つ他週の行もまとめて削除する
  //   (週ごとに別レコードの設計なので、1行だけ消すと他週から「復活」して見えるため)
  const handleDelete = async (id) => {
    if (!window.confirm('この KA を全週分 まとめて削除しますか？')) return
    const target = reports.find(r => r.id === id)
    if (!target) {
      await supabase.from('weekly_reports').delete().eq('id', id)
      setReports(p => p.filter(r => r.id!==id))
      return
    }
    // 同じ ka_key に属する行をすべて集めて一括削除
    const kaKey = computeKAKey(target)
    const sameKaIds = reports
      .filter(r => computeKAKey(r) === kaKey)
      .map(r => r.id)
    const { error } = await supabase.from('weekly_reports').delete().in('id', sameKaIds)
    if (error) { alert('削除失敗: ' + error.message); return }
    setReports(p => p.filter(r => !sameKaIds.includes(r.id)))
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
  // 週次MTG中の共同編集を許可: ログイン済みユーザー全員が KA を編集可能
  //   (旧: 管理者・KA担当・Obj責任者・KR担当のみだったが、会議中の不便さから解放)
  //   注: members テーブルに登録されていないユーザー (email マッチしない場合も)
  //       認証済みなら編集可とする (myName が空でも user.email があれば OK)
  const canEditKA = useCallback(() => !!(myName || user?.email), [myName, user?.email])

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

  // 会議モードに入ったときに最初の Objective を自動選択 (空画面回避)
  useEffect(() => {
    if (!activeMeetingKey || activeObjId) return
    if (!visibleObjs || visibleObjs.length === 0) return
    setActiveObjId(visibleObjs[0].id)
  }, [activeMeetingKey, activeLevelId, activeObjId, visibleObjs])
  // 右パネル：期間タブに応じたOKRを表示（buildQuarterMapで通期→四半期の正確なマッピングを使用）
  const annualObjsForMap = useMemo(() =>
    objectives.filter(o => o.period === annualPeriodKey), [objectives, annualPeriodKey])
  const quarterObjsForMap = useMemo(() =>
    objectives.filter(o => ['q1','q2','q3','q4'].some(q => o.period?.endsWith(q))), [objectives])
  const quarterMap = useMemo(() =>
    buildQuarterMap(annualObjsForMap, quarterObjsForMap, (qObjId, annualObjId) => {
      supabase.from('objectives').update({ parent_objective_id: annualObjId }).eq('id', qObjId).then(() => {})
    }), [annualObjsForMap, quarterObjsForMap])
  const rightObj = useMemo(() => {
    if (!selectedObj) return null
    if (rightPeriod === 'annual') return selectedObj
    // まずquarterMapで検索
    const fromMap = (quarterMap[selectedObj.id]?.[rightPeriod] || [])[0]
    if (fromMap) return fromMap
    // フォールバック：parent_objective_idまたはlevel_id（1対1の場合のみ）でマッチ
    const byParent = objectives.find(o =>
      o.period === rightPeriod &&
      Number(o.parent_objective_id) === Number(selectedObj.id)
    )
    if (byParent) return byParent
    // level_idフォールバック（同level_idの通期OKRが1つだけの場合）
    const sameLevel = annualObjsForMap.filter(a => Number(a.level_id) === Number(selectedObj.level_id))
    if (sameLevel.length === 1) {
      return objectives.find(o =>
        o.period === rightPeriod &&
        Number(o.level_id) === Number(selectedObj.level_id)
      ) || null
    }
    return null
  }, [selectedObj, rightPeriod, quarterMap, objectives, annualObjsForMap])
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

  // ─── 会議選択画面（会議が未選択、または事業部選択待ち） ───────────
  if (!activeMeetingKey || needsDeptSelect) {
    const topDepts = (levels || []).filter(l => !l.parent_id)
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', background:wT().bg, color:wT().text, fontFamily:'system-ui,sans-serif', overflow:'auto' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 24px', width: '100%', boxSizing:'border-box' }}>
          {needsDeptSelect ? (
            // 事業部選択モード（マネージャー定例など）
            <>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                <button onClick={backToMeetingSelect} style={{
                  padding:'6px 12px', borderRadius:7, border:`1px solid ${wT().borderMid}`,
                  background:'transparent', color:wT().text, cursor:'pointer', fontSize:12, fontFamily:'inherit',
                }}>← 会議選択に戻る</button>
                <div style={{ fontSize:16, fontWeight:700 }}>{currentMeeting?.title} ・ 事業部を選択</div>
              </div>
              <div style={{ fontSize:12, color:wT().textMuted, marginBottom:16 }}>
                マネージャー定例で確認するチームの所属事業部を選んでください。
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12 }}>
                {topDepts.map(d => (
                  <button key={d.id} onClick={() => setActiveLevelId(d.id)} style={{
                    padding:'20px 16px', borderRadius:12, border:`1px solid ${wT().borderMid}`,
                    background:wT().bgCard, color:wT().text, cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                    display:'flex', alignItems:'center', gap:10, transition:'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = (d.color || '#4d9fff'); e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = wT().borderMid; e.currentTarget.style.transform = 'none' }}
                  >
                    <span style={{ fontSize:22 }}>{d.icon || '📁'}</span>
                    <span style={{ fontSize:14, fontWeight:700 }}>{d.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            // 会議選択モード (全画面を活用したスタイリッシュなレイアウト)
            <>
              <div style={{ marginBottom: 22, display:'flex', alignItems:'baseline', gap:14, flexWrap:'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#007AFF', letterSpacing:'0.1em', textTransform:'uppercase' }}>Weekly MTG</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: wT().text, letterSpacing:'-0.01em' }}>今週の会議を選択</div>
                <div style={{ fontSize: 12, color: wT().textMuted }}>会議ごとに対象の部署・チーム・観点が自動で絞り込まれます</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:14 }}>
                {WEEKLY_MTG_MEETINGS.map(m => {
                  const viewBadge = m.weeklyMTG.withDiscussion ? 'チームサマリー'
                    : m.weeklyMTG.viewMode === 'kr' ? 'KR重点'
                    : m.weeklyMTG.viewMode === 'ka' ? 'KA重点'
                    : '両方'
                  const scope = m.weeklyMTG.levelName || (m.weeklyMTG.levelSelect === 'department' ? '事業部選択' : '全社')
                  const Icon = MEETING_ICONS[m.key] || MEETING_ICONS._default
                  return (
                    <button key={m.key} onClick={() => selectMeeting(m.key)}
                      style={{
                        textAlign:'left', cursor:'pointer', fontFamily:'inherit',
                        background: wT().bgCard,
                        border: `1px solid ${wT().border}`,
                        borderRadius: 16, padding: '20px 22px',
                        display: 'flex', flexDirection:'column', gap: 14,
                        position: 'relative', overflow: 'hidden',
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.04)',
                        minHeight: 132,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = `${m.color}66`
                        e.currentTarget.style.transform = 'translateY(-3px)'
                        e.currentTarget.style.boxShadow = `0 1px 2px rgba(0,0,0,0.04), 0 12px 28px ${m.color}26`
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = wT().border
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.04)'
                      }}>
                      {/* 装飾: 右上に淡いカラーグロー */}
                      <div aria-hidden style={{
                        position: 'absolute', top: -40, right: -40, width: 140, height: 140,
                        background: `radial-gradient(circle, ${m.color}1c 0%, transparent 65%)`,
                        pointerEvents: 'none',
                      }} />
                      {/* ヘッダ行: アイコン + ビューバッジ */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', zIndex:1 }}>
                        <div style={{
                          flexShrink:0, width:46, height:46, borderRadius:12,
                          background: `linear-gradient(135deg, ${m.color} 0%, ${m.color}c0 100%)`,
                          color:'#fff',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px ${m.color}55`,
                        }}>
                          <Icon size={22} />
                        </div>
                        <span style={{
                          flexShrink:0, fontSize:10, fontWeight:800,
                          padding:'3px 10px', borderRadius:99,
                          background:`${m.color}14`, color:m.color, whiteSpace:'nowrap',
                          border: `1px solid ${m.color}30`,
                        }}>{viewBadge}</span>
                      </div>
                      {/* タイトル */}
                      <div style={{ position:'relative', zIndex:1 }}>
                        <div style={{ fontSize:15, fontWeight:800, color: wT().text, marginBottom: 4, lineHeight:1.4 }}>{m.title}</div>
                        <div style={{ fontSize:11, color: wT().textMuted, display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:3,
                            padding:'1px 7px', borderRadius:99,
                            background: wT().bgSection || 'rgba(0,0,0,0.04)', color: wT().textSub,
                            fontSize:10, fontWeight:700,
                          }}>{m.schedule}</span>
                          <span>{scope}</span>
                        </div>
                      </div>
                      {/* CTA */}
                      <div style={{
                        marginTop:'auto', position:'relative', zIndex:1,
                        display:'flex', alignItems:'center', gap:6,
                        fontSize:11, fontWeight:800, color: m.color,
                      }}>会議を開始 <span aria-hidden>→</span></div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  const meetingViewMode = currentMeeting?.weeklyMTG?.viewMode || 'both'
  const meetingColor = currentMeeting?.color || '#4d9fff'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:wT().bg, color:wT().text, fontFamily:'system-ui,sans-serif' }}>
      {/* 会議コンテキストバー */}
      <div style={{
        padding:'8px 16px', borderBottom:`2px solid ${meetingColor}`,
        background:`${meetingColor}08`, display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap',
      }}>
        <button onClick={backToMeetingSelect} style={{
          padding:'5px 12px', borderRadius:7, border:`1px solid ${meetingColor}40`,
          background:`${meetingColor}10`, color:meetingColor, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit',
        }}>← 会議を変更</button>
        <div style={{
          width:28, height:28, borderRadius:8, background:`${meetingColor}15`,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0,
        }}>{currentMeeting?.icon || '📋'}</div>
        <div style={{ fontSize:14, fontWeight:700 }}>{currentMeeting?.title || 'KAレビュー'}</div>

        {/* ファシリ / 一覧 モード切替トグル */}
        <div style={{ display:'flex', gap:0, padding:2, background:wT().bgCard, borderRadius:7, border:`1px solid ${wT().border}` }}>
          <button onClick={() => setMtgMode('facilitation')}
            title="進行ガイド付きステップ式 (ファシリが変わっても会議が進めやすい)"
            style={{
              padding:'4px 10px', borderRadius:5, border:'none', cursor:'pointer', fontFamily:'inherit',
              background: mtgMode === 'facilitation' ? meetingColor : 'transparent',
              color: mtgMode === 'facilitation' ? '#fff' : wT().textSub,
              fontSize:11, fontWeight:700,
            }}>🧭 ファシリ</button>
          <button onClick={() => setMtgMode('list')}
            title="従来の3ペイン表形式（KR/KAを一覧編集）"
            style={{
              padding:'4px 10px', borderRadius:5, border:'none', cursor:'pointer', fontFamily:'inherit',
              background: mtgMode === 'list' ? meetingColor : 'transparent',
              color: mtgMode === 'list' ? '#fff' : wT().textSub,
              fontSize:11, fontWeight:700,
            }}>📋 一覧</button>
        </div>

        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:`${meetingColor}15`, color:meetingColor, fontWeight:600 }}
          title={currentMeeting?.weeklyMTG?.withDiscussion ? 'チーム別の Good/More/Focus サマリー + 横断連携の確認'
            : meetingViewMode === 'kr' ? 'KR詳細(天気/Good/More/Focus)が展開、KAテーブルは折り畳み表示'
            : meetingViewMode === 'ka' ? 'KAテーブルを常時表示、KR詳細は折り畳み'
            : 'KRとKA両方表示'}>
          {currentMeeting?.weeklyMTG?.withDiscussion ? '🤝 チームサマリー'
            : meetingViewMode === 'kr' ? '🎯 KR重点'
            : meetingViewMode === 'ka' ? '📋 KA重点'
            : '📊 両方'}
        </span>
        <span style={{ fontSize:10, color:wT().textMuted, fontStyle:'italic', display:'inline-block', minWidth:0 }}>
          {currentMeeting?.weeklyMTG?.withDiscussion ? 'チーム別 Good/More/Focus サマリー + 横断連携'
            : meetingViewMode === 'kr' ? 'KRレビュー中心・KAは折り畳み'
            : meetingViewMode === 'ka' ? 'KA進捗中心・KR詳細は折り畳み'
            : 'KR・KA両方表示'}
        </span>
        <div style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, background:fiscalYear==='2026'?'rgba(77,159,255,0.15)':'rgba(255,159,67,0.15)', color:fiscalYear==='2026'?'#4d9fff':'#ff9f43', border:`1px solid ${fiscalYear==='2026'?'rgba(77,159,255,0.3)':'rgba(255,159,67,0.3)'}` }}>
          📅 {fiscalYear}年度
        </div>
        {myMember && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:99, background:`${avatarColor(myName)}12`, border:`1px solid ${avatarColor(myName)}30` }}>
            <Avatar name={myName} avatarUrl={myMember.avatar_url} size={18} />
            <span style={{ fontSize:11, color:avatarColor(myName), fontWeight:600 }}>{myName}</span>
            <span style={{ fontSize:10, color:wT().textMuted }}>（会議中は全員KA編集可）</span>
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

      {/* ── ファシリモードならステップ式UI、一覧モードなら従来3ペイン ── */}
      {mtgMode === 'facilitation' ? (
        <WeeklyMTGFacilitation
          meeting={currentMeeting}
          weekStart={activeWeek}
          levels={levels}
          members={members}
          myName={myName}
          themeKey={themeKey}
          onSwitchToList={() => setMtgMode('list')}
        />
      ) : (
      <>
      {/* 週タブ：会議日を主表示 */}
      <div style={{ display:'flex', gap:4, padding: isMobile ? '5px 8px' : '7px 16px', borderBottom:`1px solid ${wT().border}`, flexShrink:0, alignItems:'center', overflowX:'auto', WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
        <span style={{ fontSize:11, color:wT().textMuted, fontWeight:700, marginRight:4, flexShrink:0 }}>会議日：</span>
        {weeksList.map(w => {
          const isActive = activeWeek === w
          const thisMonday = toDateStr(getMonday(new Date()))
          const isThisWeek = w === thisMonday
          const meetingDay = formatMeetingDayLabel(w, currentMeeting?.schedule)
          return (
            <button key={w} onClick={() => setActiveWeek(w)} style={{
              padding:'4px 12px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', flexShrink:0,
              background: isActive ? 'rgba(77,159,255,0.15)' : 'transparent',
              border: `1px solid ${isActive ? 'rgba(77,159,255,0.4)' : wT().borderMid}`,
              color: isActive ? '#4d9fff' : wT().textMuted,
              display:'flex', flexDirection:'column', alignItems:'center', gap:1,
            }}
              title={`${formatWeekLabel(w)}の週 (${currentMeeting?.title || 'MTG'}: ${currentMeeting?.schedule || ''})`}
            >
              <span style={{ fontSize:12, fontWeight:700 }}>{meetingDay}</span>
              <span style={{ fontSize:9, fontWeight:500, opacity:0.75 }}>
                {formatWeekLabel(w)}{isThisWeek ? ' · 今週' : ''}
              </span>
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
        <div style={{ width: isMobile ? 0 : isTablet ? 120 : 155, flexShrink:0, borderRight: isMobile ? 'none' : `1px solid ${wT().border}`, padding: isMobile ? 0 : '10px 8px', overflowY:'auto', background:wT().bgSidebar, display: isMobile ? 'none' : 'block' }}>
          <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, paddingLeft:8 }}>部署</div>
          <div onClick={()=>{setActiveLevelId(null);setActiveObjId(null)}} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:7, cursor:'pointer', marginBottom:2, border:`1px solid ${!activeLevelId?'rgba(77,159,255,0.3)':'transparent'}`, background:!activeLevelId?'rgba(77,159,255,0.12)':'transparent' }}>
            <span>🏢</span><span style={{ fontSize:11, flex:1, fontWeight:!activeLevelId?700:500, color:!activeLevelId?'#4d9fff':wT().textSub }}>全部署</span>
          </div>
          {roots.map(r=>renderSb(r,0))}
        </div>

        {/* Objective一覧 */}
        <div style={{ width: isMobile ? '100%' : isTablet ? 220 : 260, flexShrink: isMobile ? 1 : 0, borderRight: isMobile ? 'none' : `1px solid ${wT().border}`, overflowY:'auto', padding: isMobile ? 8 : 10, background:wT().bg, display: isMobile && mobilePanel !== 'list' ? 'none' : 'block', flex: isMobile ? 1 : 'none' }}>
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
              <div key={obj.id} onClick={()=>{setActiveObjId(isActive?null:obj.id);setRightPeriod(getCurrentQ());if(isMobile&&!isActive)setMobilePanel('detail')}} style={{ padding:'10px 12px', borderRadius:9, marginBottom:7, cursor:'pointer', border:`1px solid ${isActive?color+'60':wT().border}`, background:isActive?`${color}10`:wT().bgCard, transition:'all 0.12s' }}>
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
                  <div key={obj.id} onClick={()=>{setActiveObjId(isActive?null:obj.id);setRightPeriod(getCurrentQ());if(isMobile&&!isActive)setMobilePanel('detail')}} style={{ padding:'9px 12px', borderRadius:9, marginTop:5, cursor:'pointer', border:`1px solid ${isActive?'rgba(0,214,143,0.5)':'rgba(0,214,143,0.15)'}`, background:isActive?'rgba(0,214,143,0.1)':'rgba(0,214,143,0.04)', transition:'all 0.12s', opacity:0.8 }}>
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
        <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '10px' : '14px 16px', background:wT().bgCard2, display: isMobile && mobilePanel !== 'detail' ? 'none' : 'block' }}>
          {isMobile && mobilePanel === 'detail' && (
            <button onClick={() => setMobilePanel('list')} style={{ marginBottom: 8, padding: '6px 12px', borderRadius: 7, border: `1px solid ${wT().border}`, background: 'transparent', color: wT().textSub, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>← Objective一覧に戻る</button>
          )}
          {!selectedObj ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:10, color:wT().textFaint }}>
              <div style={{ fontSize:36 }}>🎯</div>
              <div style={{ fontSize:13 }}>{isMobile ? 'Objectiveを選択' : '左のObjectiveをクリックしてください'}</div>
            </div>
          ) : (
            <>
              {/* 通期Objectiveヘッダー (デフォルト折り畳み・▾で展開) */}
              <ObjectiveCompactCard
                title={selectedObj.title}
                ownerName={selectedObj.owner}
                members={members}
                wT={wT}
                label="通期"
                labelColor={objColor}
                titleColor={wT().text}
                storageKey={`weeklymtg-obj-expand-${selectedObj.id}`}
                style={{ marginBottom: 10 }}
              />

              {/* 期間切替タブ (コンパクト) */}
              <div style={{ display:'flex', gap:3, marginBottom:10 }}>
                {[['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['annual','通期']].map(([key,lbl]) => (
                  <button key={key} onClick={()=>setRightPeriod(key)} style={{ padding:'3px 12px', borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:600, background:rightPeriod===key?'rgba(77,159,255,0.15)':'transparent', border:`1px solid ${rightPeriod===key?'rgba(77,159,255,0.4)':wT().borderMid}`, color:rightPeriod===key?'#4d9fff':wT().textMuted }}>{lbl}</button>
                ))}
              </div>

              {/* 選択期間のObjective表示 (コンパクト) */}
              {rightObj && rightPeriod !== 'annual' && (
                <ObjectiveCompactCard
                  title={rightObj.title}
                  ownerName={rightObj.owner}
                  members={members}
                  wT={wT}
                  label={getPeriodLabel(rightObj.period)}
                  labelColor="#4d9fff"
                  titleColor={isObjDone(rightObj) ? '#00d68f' : wT().text}
                  isDone={isObjDone(rightObj)}
                  storageKey={`weeklymtg-obj-expand-${rightObj.id}`}
                  style={{ marginBottom: 10 }}
                />
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
                  onAddKA={(newRow) => {
                    // 直接 state に追加 (reload のページング上限で落ちない)
                    // realtime も同じ行を配信するが id でdedup 済
                    if (newRow && newRow.id) {
                      setReports(prev => prev.some(r => r.id === newRow.id) ? prev : [...prev, newRow])
                    } else {
                      reload()
                    }
                  }}
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
                  reviewVersion={reviewVersion}
                  onReorder={reload}
                  objectiveTitle={rightObj.title}
                  completedBy={myName}
                  weeksList={weeksList}
                  onMoveKA={async (reportId, targetKrId) => {
                    await supabase.from('weekly_reports').update({ kr_id: targetKrId }).eq('id', reportId)
                    reload()
                  }}
                  viewMode={meetingViewMode}
                />
              ))}
            </>
          )}
        </div>
      </div>
      </>
      )}

    </div>
  )
}
