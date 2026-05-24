'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS, BRAND_GRADIENT } from '../lib/themeTokens'
import { btnBrand } from '../lib/iosStyles'
import { HeroCard, DashboardTile } from './iosUI'
import { useAutoSave } from '../lib/useAutoSave'
import { buildQuarterMap } from '../lib/objectiveMatching'
import { computeKAKey } from '../lib/kaKey'
import { WEEKLY_MTG_MEETINGS, getMeeting } from '../lib/meetings'
import { useWeeklyMTGMeetings } from '../lib/orgMeetings'
import WeeklyMTGFacilitation from './WeeklyMTGFacilitation'
import Icon, { DataIcon } from './Icon'
import { kaCellStyle, kaTextareaStyle } from '../lib/okrKaStyles'
import KATableHeader from './okr/KATableHeader'
import { pctColor as okrPctColor, pctColorBg as okrPctColorBg } from '../lib/okrColors'
import AssigneeChip from './okr/AssigneeChip'
import QTabs from './okr/QTabs'
import OkrCard from './okr/OkrCard'
import ProgressBar from './okr/ProgressBar'

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
  // プログラム別定例: タグアイコン
  'program-regular':   p => <Ico {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></Ico>,
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
// 部署スコープ用の定義済みパープル (success/accent/warn 以外の第4軸として既存パープルを踏襲)
const PURPLE    = '#a855f7'
const PURPLE_BG = 'rgba(168,85,247,0.14)'

// ★ doneを追加した5種ステータス
// 色は themeTokens のステータス色に揃える (light/dark で自動切替するよう描画側で wT() 参照)。
// ここでは fallback 用に固定値を残しつつ、描画時に statusCfg(wT) で上書きする。
const STATUS_CFG = {
  focus:  { label: '注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)',  border: 'rgba(77,159,255,0.3)' },
  good:   { label: 'Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)',    border: 'rgba(0,214,143,0.3)' },
  more:   { label: 'More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)',  border: 'rgba(255,107,107,0.3)' },
  normal: { label: '未分類',  color: '#606880', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' },
  done:   { label: '完了',  color: '#a0a8be', bg: 'rgba(160,168,190,0.08)', border: 'rgba(160,168,190,0.2)' },
}
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
  return (
    <OkrCard T={wT()} padding={expanded ? `${SPACING.sm + 2}px ${SPACING.lg - 2}px` : `7px ${SPACING.md}px`} style={style}>
      <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm }}>
        <span style={{ ...TYPO.caption, fontWeight:700, padding:'2px 7px', borderRadius:RADIUS.pill, background:`${labelColor}22`, color:labelColor, flexShrink:0 }}>{label}</span>
        {!expanded && (
          <div style={{
            flex: 1, minWidth: 0,
            ...TYPO.subhead, fontWeight: 700, color: titleColor,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.4,
          }} title={title}>{title}</div>
        )}
        {expanded && (
          <span style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted }}>Objective</span>
        )}
        {isDone && expanded && (
          <span style={{ ...TYPO.caption, fontWeight:700, padding:'2px 8px', borderRadius:RADIUS.pill, background:wT().successBg, color:wT().success, display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="trophy" size={11} /> 達成済み</span>
        )}
        {ownerName && <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <OwnerBadge name={ownerName} members={members} size={18} T={wT()} />
        </div>}
        <button
          onClick={toggle}
          title={expanded ? '折りたたむ' : '全文表示'}
          style={{
            background: 'transparent', border: `1px solid ${wT().border}`,
            borderRadius: RADIUS.xs - 1, padding: '2px 7px', fontSize: 10,
            cursor: 'pointer', fontFamily: 'inherit', color: wT().textMuted,
            flexShrink: 0, display:'inline-flex', alignItems:'center',
          }}
        ><Icon name={expanded ? 'chevronU' : 'chevronD'} size={12} /></button>
      </div>
      {expanded && (
        <div style={{ ...TYPO.headline, fontWeight:700, color:titleColor, lineHeight:1.5, marginTop:6 }}>
          {title}
        </div>
      )}
    </OkrCard>
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

// ─── メインページ ──────────────────────────────────────────────────────────────
function getCurrentQ() { const m = new Date().getMonth(); return m >= 3 && m <= 5 ? 'q1' : m >= 6 && m <= 8 ? 'q2' : m >= 9 && m <= 11 ? 'q3' : 'q4' }
export default function WeeklyMTGPage({ levels, themeKey='dark', fiscalYear='2026', user, initialPeriod, forceMode = null, forceLevelId = undefined }) {
  const wT = () => W_THEMES[themeKey] || W_THEMES.dark
  const { isMobile, isTablet, isMobileOrTablet } = useResponsive()
  // 組織別の会議リスト (新規組織は空、NEO福岡は旧固定リスト)
  const { meetings: orgMeetings } = useWeeklyMTGMeetings()
  const displayMeetings = orgMeetings.length > 0 ? orgMeetings : []
  const [mobilePanel, setMobilePanel] = useState('list') // 'list' | 'detail'
  const [reports,       setReports]       = useState([])
  const [objectives,    setObjectives]    = useState([])
  const [keyResults,    setKeyResults]    = useState([])
  const [reviewVersion, setReviewVersion] = useState(0)
  const [members,       setMembers]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [activeLevelId, setActiveLevelId] = useState(() => {
    // forceLevelId が指定されたらそれを優先 (= OKR タブ「週次+組織」のパネル式から)
    if (forceLevelId !== undefined) return forceLevelId
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('weeklyMTG_activeLevelId')
    return saved && saved !== 'null' ? Number(saved) : null
  })
  // forceLevelId が後から変わったら state も追従
  useEffect(() => {
    if (forceLevelId !== undefined) setActiveLevelId(forceLevelId)
  }, [forceLevelId])
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
  // forceMode が渡されている場合はそれを強制 (OKR タブ「週次」/「会議」ナビ用)
  const [mtgMode, setMtgMode] = useState(() => {
    if (forceMode) return forceMode
    if (typeof window === 'undefined') return 'facilitation'
    return localStorage.getItem('weeklyMTG_mode') || 'facilitation'
  })
  useEffect(() => {
    if (forceMode) return  // forceMode 中は localStorage を汚さない
    if (typeof window === 'undefined') return
    localStorage.setItem('weeklyMTG_mode', mtgMode)
  }, [mtgMode, forceMode])
  // forceMode が後から変わったら state も追従
  useEffect(() => {
    if (forceMode && forceMode !== mtgMode) setMtgMode(forceMode)
  }, [forceMode, mtgMode])

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
    // forceMode='list' (= OKR タブ「週次」) のときは会議選択画面を飛ばして
    // 自動で最初の会議を選択 → ユーザーは会議切り替え UI で他の会議も見られる
    if (forceMode === 'list' && WEEKLY_MTG_MEETINGS.length > 0) {
      selectMeeting(WEEKLY_MTG_MEETINGS[0].key)
      return
    }
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
    supabase.from('objectives').select('id,title,level_id,period,owner,parent_objective_id,archived_at').order('level_id').range(0, 49999).then(({data})=>setObjectives((data||[]).filter(o => !o.archived_at)))
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objectives' }, payload => {
        // archive (archived_at セット) や復元 (NULL) も含めて反映
        if (payload.eventType === 'UPDATE' && payload.new) {
          const o = payload.new
          if (o.archived_at) {
            // archived → state から除外
            setObjectives(prev => prev.filter(x => x.id !== o.id))
          } else {
            // 復元 or 通常更新
            setObjectives(prev => prev.some(x => x.id === o.id)
              ? prev.map(x => x.id === o.id ? { ...x, ...o } : x)
              : [...prev, o])
          }
        } else if (payload.eventType === 'INSERT' && payload.new) {
          const o = payload.new
          if (!o.archived_at) {
            setObjectives(prev => prev.some(x => x.id === o.id) ? prev : [...prev, o])
          }
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setObjectives(prev => prev.filter(x => x.id !== payload.old.id))
        }
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
  // アーカイブ済み objective に紐付く KR を非表示にするため、有効な objective.id で
  // フィルタした visible 版を作る (objectives 自体は load 時に archived_at で除外済み)
  const visibleKeyResults = useMemo(() => {
    const validObjIds = new Set(objectives.map(o => Number(o.id)))
    return keyResults.filter(kr => !kr.archived_at && validObjIds.has(Number(kr.objective_id)))
  }, [keyResults, objectives])

  const selectedObjKRs = useMemo(() => {
    if (!rightObj && rightPeriod !== 'annual' && selectedObj) {
      // Q期OBJが存在しない場合、通期OBJのKRをperiodでフィルタ
      const annKRs = visibleKeyResults.filter(kr => Number(kr.objective_id) === Number(selectedObj.id))
      const filtered = annKRs.filter(kr => kr.period === rightPeriod)
      return filtered.length > 0 ? filtered : []
    }
    return rightObj ? visibleKeyResults.filter(kr => Number(kr.objective_id)===Number(rightObj.id)) : []
  }, [rightObj, rightPeriod, selectedObj, visibleKeyResults])
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
    const isActive = Number(activeLevelId)===Number(level.id)
    return (
      <div key={level.id}>
        <div onClick={()=>{ setActiveLevelId(isActive?null:level.id); setActiveObjId(null) }}
          style={{ display:'flex', alignItems:'center', gap:6, padding:`6px ${SPACING.sm}px`, paddingLeft:8+indent*14, borderRadius:7, cursor:'pointer', marginBottom:2, border:`1px solid ${isActive?`${wT().accent}40`:'transparent'}`, background:isActive?wT().accentBg:'transparent' }}>
          <span style={{ display:'inline-flex', color:isActive?wT().accentText:wT().textMuted }}><DataIcon value={level.icon} size={13}/></span>
          <span style={{ ...TYPO.footnote, flex:1, fontWeight:isActive?700:500, color:isActive?wT().accentText:wT().textSub }}>{level.name}</span>
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
      <div style={{ display:'flex', flexDirection:'column', height:'100%', flex:1, width:'100%', minWidth:0, background:wT().bg, color:wT().text, fontFamily:'system-ui,sans-serif', overflow:'auto' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 24px', width: '100%', boxSizing:'border-box' }}>
          {needsDeptSelect ? (
            // 事業部選択モード（マネージャー定例など）
            <>
              <div style={{ display:'flex', alignItems:'center', gap:SPACING.md, marginBottom:SPACING.xl }}>
                <button onClick={backToMeetingSelect} style={{
                  padding:`6px ${SPACING.md}px`, borderRadius:RADIUS.xs + 1, border:`1px solid ${wT().borderMid}`,
                  background:'transparent', color:wT().text, cursor:'pointer', ...TYPO.subhead, fontWeight:500, fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4,
                }}><Icon name="chevronL" size={13} /> 会議選択に戻る</button>
                <div style={{ ...TYPO.title3, fontWeight:700 }}>{currentMeeting?.title} ・ 事業部を選択</div>
              </div>
              <div style={{ ...TYPO.subhead, fontWeight:500, color:wT().textMuted, marginBottom:SPACING.lg }}>
                マネージャー定例で確認するチームの所属事業部を選んでください。
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:SPACING.md }}>
                {topDepts.map(d => (
                  <button key={d.id} onClick={() => setActiveLevelId(d.id)} style={{
                    padding:`${SPACING.xl}px ${SPACING.lg}px`, borderRadius:RADIUS.lg - 2, border:`1px solid ${wT().borderMid}`,
                    background:wT().bgCard, color:wT().text, cursor:'pointer', fontFamily:'inherit', textAlign:'left',
                    display:'flex', alignItems:'center', gap:SPACING.sm + 2, transition:'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = (d.color || wT().accent); e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = wT().borderMid; e.currentTarget.style.transform = 'none' }}
                  >
                    <DataIcon value={d.icon} size={22} fallback="folder"/>
                    <span style={{ ...TYPO.headline, fontWeight:700 }}>{d.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            // 会議選択モード (全画面を活用したスタイリッシュなレイアウト)
            <>
              <div style={{ marginBottom: SPACING['2xl'] - 2, display:'flex', alignItems:'baseline', gap:SPACING.md + 2, flexWrap:'wrap' }}>
                <div style={{ ...TYPO.footnote, fontWeight: 800, color: wT().accent, letterSpacing:'0.1em', textTransform:'uppercase' }}>Weekly MTG</div>
                <div style={{ ...TYPO.title1, color: wT().text }}>今週の会議を選択</div>
                <div style={{ ...TYPO.subhead, fontWeight:500, color: wT().textMuted }}>会議ごとに対象の部署・チーム・観点が自動で絞り込まれます</div>
              </div>
              {displayMeetings.length === 0 && (
                <div style={{
                  padding: '40px 24px', textAlign: 'center',
                  background: wT().bgCard, border: `1px dashed ${wT().border}`, borderRadius: RADIUS.xl - 2,
                  marginBottom: SPACING.md + 2,
                }}>
                  <div style={{ ...TYPO.headline, fontWeight:500, color: wT().textSub, marginBottom: SPACING.md + 2, lineHeight: 1.7 }}>
                    まだ会議が登録されていません。<br />
                    組織設定から会議を新規作成してください。
                  </div>
                  <button
                    onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('open-org-settings', { detail: { section: 'meetings' } })) }}
                    style={{
                      ...btnBrand({ size: 'lg' }),
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}><Icon name="plus" size={14} /> 会議を新規作成</button>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap:SPACING.md + 2 }}>
                {displayMeetings.map(m => {
                  const wm = m.weeklyMTG || {}
                  const viewBadge = wm.withDiscussion ? 'チームサマリー'
                    : wm.viewMode === 'kr' ? 'KR重点'
                    : wm.viewMode === 'ka' ? 'KA重点'
                    : '両方'
                  const scope = wm.levelName || (wm.levelSelect === 'department' ? '事業部選択' : '全社')
                  const Icon = MEETING_ICONS[m.key] || MEETING_ICONS._default
                  // scope ピル: 両方=accent / チームサマリー=success / 部署系=purple
                  const isDeptScope = wm.levelSelect === 'department' || !!wm.levelName
                  const pillBg   = viewBadge === 'チームサマリー' ? wT().successBg
                    : isDeptScope ? PURPLE_BG
                    : wT().accentBg
                  const pillFg   = viewBadge === 'チームサマリー' ? wT().success
                    : isDeptScope ? PURPLE
                    : wT().accentText
                  return (
                    <button key={m.key} onClick={() => selectMeeting(m.key)}
                      style={{
                        textAlign:'left', cursor:'pointer', fontFamily:'inherit',
                        background: wT().bgCard,
                        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                        border: `1px solid ${wT().border}`,
                        borderRadius: RADIUS.lg, padding: SPACING.lg,
                        display: 'flex', flexDirection:'column', gap: SPACING.md + 2,
                        position: 'relative', overflow: 'hidden',
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                        boxShadow: SHADOWS.sm,
                        minHeight: 132,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = wT().borderMid
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = SHADOWS.md
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = wT().border
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = SHADOWS.sm
                      }}>
                      {/* ヘッダ行: アイコン + ビューバッジ */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', zIndex:1 }}>
                        <div style={{
                          flexShrink:0, width:38, height:38, borderRadius:RADIUS.md,
                          background: BRAND_GRADIENT.cta,
                          color:'#fff',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          boxShadow: SHADOWS.glassInset,
                        }}>
                          <Icon size={20} />
                        </div>
                        <span style={{
                          flexShrink:0, ...TYPO.caption, fontWeight:800,
                          padding:'3px 10px', borderRadius:RADIUS.pill,
                          background:pillBg, color:pillFg, whiteSpace:'nowrap',
                        }}>{viewBadge}</span>
                      </div>
                      {/* タイトル */}
                      <div style={{ position:'relative', zIndex:1 }}>
                        <div style={{ ...TYPO.headline, fontWeight:800, fontSize:15, color: wT().text, marginBottom: 4, lineHeight:1.4 }}>{m.title}</div>
                        <div style={{ ...TYPO.footnote, fontWeight:500, color: wT().textMuted, display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:3,
                            padding:'1px 7px', borderRadius:RADIUS.pill,
                            background: wT().bgSection || wT().sectionBg, color: wT().textSub,
                            ...TYPO.caption, fontWeight:700,
                          }}>{m.schedule}</span>
                          <span>{scope}</span>
                        </div>
                      </div>
                      {/* CTA */}
                      <div style={{
                        marginTop:'auto', position:'relative', zIndex:1,
                        display:'flex', alignItems:'center', gap:6,
                        ...TYPO.footnote, fontSize:12, fontWeight:600, color: wT().accentText,
                      }}>会議を開始 <Icon name="arrowRight" size={13} /></div>
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
      {/* 会議コンテキストバー (forceMode='list' = OKRタブ「週次」埋め込み時のみ非表示)
          forceMode='facilitation' (週次MTG ナビ) では従来通り表示 */}
      {forceMode !== 'list' && (
      <div style={{
        padding:`${SPACING.sm}px ${SPACING.lg}px`, borderBottom:`2px solid ${meetingColor}`,
        background:`${meetingColor}08`, display:'flex', alignItems:'center', gap:SPACING.sm + 2, flexShrink:0, flexWrap:'wrap',
      }}>
        <button onClick={backToMeetingSelect} style={{
          padding:`5px ${SPACING.md}px`, borderRadius:RADIUS.xs + 1, border:`1px solid ${meetingColor}40`,
          background:`${meetingColor}10`, color:meetingColor, cursor:'pointer', ...TYPO.footnote, fontWeight:700, fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4,
        }}><Icon name="chevronL" size={12} /> 会議を変更</button>
        <div style={{
          width:28, height:28, borderRadius:RADIUS.sm, background:`${meetingColor}15`,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0,
        }}><DataIcon value={currentMeeting?.icon} size={15} fallback="note"/></div>
        <div style={{ ...TYPO.headline, fontWeight:700 }}>{currentMeeting?.title || 'KAレビュー'}</div>

        {/* ファシリ / 一覧 モード切替トグル — forceMode 指定時 (OKR タブ「週次」/「会議」ナビ) は非表示 */}
        {!forceMode && (
          <div style={{ display:'flex', gap:0, padding:2, background:wT().bgCard, borderRadius:RADIUS.xs + 1, border:`1px solid ${wT().border}` }}>
            <button onClick={() => setMtgMode('facilitation')}
              title="進行ガイド付きステップ式 (ファシリが変わっても会議が進めやすい)"
              style={{
                padding:`${SPACING.xs}px 10px`, borderRadius:RADIUS.xs - 1, border:'none', cursor:'pointer', fontFamily:'inherit',
                background: mtgMode === 'facilitation' ? meetingColor : 'transparent',
                color: mtgMode === 'facilitation' ? '#fff' : wT().textSub,
                ...TYPO.footnote, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4,
              }}><Icon name="cmd" size={12} /> ファシリ</button>
            <button onClick={() => setMtgMode('list')}
              title="従来の3ペイン表形式（KR/KAを一覧編集）"
              style={{
                padding:`${SPACING.xs}px 10px`, borderRadius:RADIUS.xs - 1, border:'none', cursor:'pointer', fontFamily:'inherit',
                background: mtgMode === 'list' ? meetingColor : 'transparent',
                color: mtgMode === 'list' ? '#fff' : wT().textSub,
                ...TYPO.footnote, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4,
              }}><Icon name="note" size={12} /> 一覧</button>
          </div>
        )}

        <span style={{ ...TYPO.caption, fontWeight:600, padding:'2px 8px', borderRadius:RADIUS.pill, background:`${meetingColor}15`, color:meetingColor }}
          title={currentMeeting?.weeklyMTG?.withDiscussion ? 'チーム別の Good/More/Focus サマリー + 横断連携の確認'
            : meetingViewMode === 'kr' ? 'KR詳細(天気/Good/More/Focus)が展開、KAテーブルは折り畳み表示'
            : meetingViewMode === 'ka' ? 'KAテーブルを常時表示、KR詳細は折り畳み'
            : 'KRとKA両方表示'}>
          {currentMeeting?.weeklyMTG?.withDiscussion ? 'チームサマリー'
            : meetingViewMode === 'kr' ? 'KR重点'
            : meetingViewMode === 'ka' ? 'KA重点'
            : '両方'}
        </span>
        <span style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, fontStyle:'italic', display:'inline-block', minWidth:0 }}>
          {currentMeeting?.weeklyMTG?.withDiscussion ? 'チーム別 Good/More/Focus サマリー + 横断連携'
            : meetingViewMode === 'kr' ? 'KRレビュー中心・KAは折り畳み'
            : meetingViewMode === 'ka' ? 'KA進捗中心・KR詳細は折り畳み'
            : 'KR・KA両方表示'}
        </span>
        <div style={{ ...TYPO.footnote, fontWeight:700, padding:'3px 10px', borderRadius:RADIUS.pill, background:fiscalYear==='2026'?wT().accentBg:wT().warnBg, color:fiscalYear==='2026'?wT().accent:wT().warn, border:`1px solid ${fiscalYear==='2026'?wT().accent:wT().warn}4d` }}>
          {fiscalYear}年度
        </div>
        {myMember && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:RADIUS.pill, background:`${avatarColor(myName)}12`, border:`1px solid ${avatarColor(myName)}30` }}>
            <Avatar name={myName} avatarUrl={myMember.avatar_url} size={18} />
            <span style={{ ...TYPO.footnote, color:avatarColor(myName), fontWeight:600 }}>{myName}</span>
            <span style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted }}>（会議中は全員KA編集可）</span>
          </div>
        )}
        {/* KAステータス凡例 */}
        <div style={{ display:'flex', gap:5, alignItems:'center', marginLeft:'auto', flexWrap:'wrap' }}>
          {STATUS_ORDER.filter(k=>k!=='done').map(k => {
            const v = statusCfg(k, wT())
            return <span key={k} style={{ ...TYPO.caption, fontWeight:600, padding:'2px 8px', borderRadius:RADIUS.pill, background:v.bg, color:v.color, border:`1px solid ${v.border}` }}>{v.label}</span>
          })}
          {(() => { const v = statusCfg('done', wT()); return (
            <span style={{ ...TYPO.caption, fontWeight:600, padding:'2px 8px', borderRadius:RADIUS.pill, background:v.bg, color:v.color, border:`1px solid ${v.border}` }}>{v.label}</span>
          ) })()}
        </div>
      </div>
      )}

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
        <span style={{ ...TYPO.footnote, color:wT().textMuted, fontWeight:700, marginRight:4, flexShrink:0 }}>会議日：</span>
        {weeksList.map(w => {
          const isActive = activeWeek === w
          const thisMonday = toDateStr(getMonday(new Date()))
          const isThisWeek = w === thisMonday
          const meetingDay = formatMeetingDayLabel(w, currentMeeting?.schedule)
          return (
            <button key={w} onClick={() => setActiveWeek(w)} style={{
              padding:`7px 11px`, borderRadius:7, cursor:'pointer', fontFamily:'inherit', flexShrink:0,
              background: isActive ? wT().accentBg : wT().sunken,
              border: `1px solid ${isActive ? `${wT().accent}4d` : wT().border}`,
              color: isActive ? wT().accentText : wT().textSub,
              display:'flex', flexDirection:'column', alignItems:'center', gap:1, lineHeight:1.3,
            }}
              title={`${formatWeekLabel(w)}の週 (${currentMeeting?.title || 'MTG'}: ${currentMeeting?.schedule || ''})`}
            >
              <span style={{ fontSize:12, fontWeight:700, color: isActive ? wT().accentText : wT().text }}>{meetingDay}</span>
              <span style={{ fontSize:10, fontWeight:500, color:wT().textMuted }}>
                {formatWeekLabel(w)}{isThisWeek ? ' · 今週' : ''}
              </span>
            </button>
          )
        })}
        <button onClick={createNextWeek} style={{
          marginLeft:'auto', padding:`7px 11px`, borderRadius:7, cursor:'pointer', fontFamily:'inherit', ...TYPO.footnote, fontWeight:700, flexShrink:0,
          background:'transparent', border:`1px solid ${wT().border}`, color:wT().textSub, display:'inline-flex', alignItems:'center', gap:4,
        }}><Icon name="plus" size={12} /> 翌週を作成</button>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* 部署サイドバー (組織階層) — 幅 240px に統一 */}
        <div style={{ width: isMobile ? 0 : isTablet ? 120 : 240, flexShrink:0, borderRight: isMobile ? 'none' : `1px solid ${wT().border}`, padding: isMobile ? 0 : `${SPACING.sm + 2}px ${SPACING.sm}px`, overflowY:'auto', background:wT().bgSidebar, display: isMobile ? 'none' : 'block' }}>
          <div style={{ ...TYPO.caption, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', marginBottom:SPACING.sm, paddingLeft:SPACING.sm }}>部署</div>
          <div onClick={()=>{setActiveLevelId(null);setActiveObjId(null)}} style={{ display:'flex', alignItems:'center', gap:6, padding:`6px ${SPACING.sm}px`, borderRadius:RADIUS.xs + 1, cursor:'pointer', marginBottom:2, border:`1px solid ${!activeLevelId?wT().accent:'transparent'}`, background:!activeLevelId?wT().accentBg:'transparent' }}>
            <Icon name="building" size={13} style={{ color:!activeLevelId?wT().accent:wT().textSub }} /><span style={{ ...TYPO.footnote, flex:1, fontWeight:!activeLevelId?700:500, color:!activeLevelId?wT().accent:wT().textSub }}>全部署</span>
          </div>
          {roots.map(r=>renderSb(r,0))}
        </div>

        {/* Objective一覧 */}
        <div style={{ width: isMobile ? '100%' : isTablet ? 220 : 260, flexShrink: isMobile ? 1 : 0, borderRight: isMobile ? 'none' : `1px solid ${wT().border}`, overflowY:'auto', padding: isMobile ? SPACING.sm : SPACING.sm + 2, background:wT().bg, display: isMobile && mobilePanel !== 'list' ? 'none' : 'block', flex: isMobile ? 1 : 'none' }}>
          <div style={{ ...TYPO.caption, color:wT().accent, fontWeight:700, textTransform:'uppercase', marginBottom:SPACING.sm }}>Objective ({activeObjs.length}件)</div>
          {visibleObjs.length===0 && <div style={{ ...TYPO.subhead, fontWeight:500, color:wT().textFaintest, fontStyle:'italic', padding:`${SPACING.sm + 2}px ${SPACING.xs}px` }}>Objectiveがありません</div>}

          {/* アクティブなObjective */}
          {activeObjs.map(obj => {
            const isActive = Number(activeObjId)===Number(obj.id)
            const d = getDepth(obj.level_id, levels)
            const color = LAYER_COLORS[d] || '#a0a8be'
            const level = levels.find(l=>Number(l.id)===Number(obj.level_id))
            const krs = keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id))
            const kaCount = weekReports.filter(r=>Number(r.objective_id)===Number(obj.id)&&r.status!=='done').length
            return (
              <OkrCard key={obj.id} T={wT()} active={isActive} onClick={()=>{setActiveObjId(isActive?null:obj.id);setRightPeriod(getCurrentQ());if(isMobile&&!isActive)setMobilePanel('detail')}} padding={`${SPACING.sm + 2}px ${SPACING.md}px`} style={{ marginBottom:7 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                  <span style={{ ...TYPO.caption, fontWeight:700, padding:'2px 6px', borderRadius:RADIUS.pill, background:`${color}18`, color }}>{getPeriodLabel(obj.period)}</span>
                  {level && <span style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, display:'inline-flex', alignItems:'center', gap:3 }}><DataIcon value={level.icon} size={12}/> {level.name}</span>}
                </div>
                <div style={{ ...TYPO.subhead, lineHeight:1.4, marginBottom:5, color:isActive?wT().text:wT().textSub }}>{obj.title}</div>
                {obj.owner && <div style={{ marginBottom:5 }}><OwnerBadge name={obj.owner} members={members} size={16} T={wT()} /></div>}
                <div style={{ display:'flex', gap:SPACING.sm, ...TYPO.caption, fontWeight:600, color:wT().textMuted }}>
                  <span>KR {krs.length}件</span>
                  <span style={{ color:kaCount>0?wT().accent:wT().textFaint }}>KA {kaCount}件</span>
                </div>
              </OkrCard>
            )
          })}

          {/* ★ 達成済みObjective（折りたたみ） */}
          {doneObjs.length > 0 && (
            <div style={{ marginTop:SPACING.sm }}>
              <button onClick={() => setShowDoneObjs(p=>!p)} style={{ width:'100%', padding:`7px ${SPACING.sm + 2}px`, borderRadius:RADIUS.sm, border:`1px solid ${wT().success}33`, background:wT().successBg, color:wT().success, cursor:'pointer', fontFamily:'inherit', ...TYPO.footnote, fontWeight:700, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                <Icon name="trophy" size={12} /> 達成済み {doneObjs.length}件 <Icon name={showDoneObjs?'chevronU':'chevronD'} size={12} />
              </button>
              {showDoneObjs && doneObjs.map(obj => {
                const isActive = Number(activeObjId)===Number(obj.id)
                const d = getDepth(obj.level_id, levels)
                const color = LAYER_COLORS[d] || '#a0a8be'
                const level = levels.find(l=>Number(l.id)===Number(obj.level_id))
                return (
                  <OkrCard key={obj.id} T={wT()} active={isActive} onClick={()=>{setActiveObjId(isActive?null:obj.id);setRightPeriod(getCurrentQ());if(isMobile&&!isActive)setMobilePanel('detail')}} padding={`9px ${SPACING.md}px`} style={{ marginTop:5, opacity:0.8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                      <Icon name="trophy" size={11} style={{ color:wT().success }} />
                      <span style={{ ...TYPO.caption, fontWeight:700, padding:'1px 6px', borderRadius:RADIUS.pill, background:wT().successBg, color:wT().success }}>{getPeriodLabel(obj.period)}</span>
                      {level && <span style={{ ...TYPO.caption, fontWeight:600, color:wT().textMuted, display:'inline-flex', alignItems:'center', gap:3 }}><DataIcon value={level.icon} size={11}/> {level.name}</span>}
                    </div>
                    <div style={{ ...TYPO.footnote, fontWeight:600, lineHeight:1.4, color:wT().success }}>{obj.title}</div>
                  </OkrCard>
                )
              })}
            </div>
          )}
        </div>

        {/* 右：KR + KA詳細 */}
        <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '10px' : '14px 16px', background:wT().bgCard2, display: isMobile && mobilePanel !== 'detail' ? 'none' : 'block' }}>
          {isMobile && mobilePanel === 'detail' && (
            <button onClick={() => setMobilePanel('list')} style={{ marginBottom: SPACING.sm, padding: `6px ${SPACING.md}px`, borderRadius: RADIUS.xs + 1, border: `1px solid ${wT().border}`, background: 'transparent', color: wT().textSub, ...TYPO.subhead, fontWeight:500, cursor: 'pointer', fontFamily: 'inherit', display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="chevronL" size={13} /> Objective一覧に戻る</button>
          )}
          {!selectedObj ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:SPACING.sm + 2, color:wT().textFaint }}>
              <Icon name="target" size={36} stroke={1.4} />
              <div style={{ ...TYPO.subhead, fontWeight:500 }}>{isMobile ? 'Objectiveを選択' : '左のObjectiveをクリックしてください'}</div>
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
                style={{ marginBottom: SPACING.sm + 2 }}
              />

              {/* 期間切替タブ (.qtab: 下線スタイル・共有部品) */}
              <QTabs
                T={wT()}
                tabs={[['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['annual','通期']].map(([key,label]) => ({ key, label }))}
                active={rightPeriod}
                onChange={(key)=>setRightPeriod(key)}
                trailing={`${fiscalYear}年度 · ${getPeriodLabel(rightPeriod === 'annual' ? 'annual' : rightPeriod)}`}
              />

              {/* 選択期間のObjective表示 (コンパクト) */}
              {rightObj && rightPeriod !== 'annual' && (
                <ObjectiveCompactCard
                  title={rightObj.title}
                  ownerName={rightObj.owner}
                  members={members}
                  wT={wT}
                  label={getPeriodLabel(rightObj.period)}
                  labelColor={wT().accent}
                  titleColor={isObjDone(rightObj) ? wT().success : wT().text}
                  isDone={isObjDone(rightObj)}
                  storageKey={`weeklymtg-obj-expand-${rightObj.id}`}
                  style={{ marginBottom: SPACING.sm + 2 }}
                />
              )}
              {!rightObj && rightPeriod !== 'annual' && selectedObjKRs.length === 0 && (
                <div style={{ textAlign:'center', padding:SPACING['2xl'] + 6, color:wT().textFaint, ...TYPO.subhead, fontWeight:500 }}>この期間のOKRはまだ設定されていません</div>
              )}
              {!rightObj && rightPeriod !== 'annual' && selectedObjKRs.length > 0 && (
                <OkrCard T={wT()} padding={`${SPACING.sm + 2}px ${SPACING.lg - 2}px`} style={{ marginBottom:SPACING.lg - 2 }}>
                  <div style={{ ...TYPO.subhead, fontWeight:700, color:wT().textSub, marginBottom:4 }}>
                    {rightPeriod.toUpperCase()} ― 通期OKRのKR
                  </div>
                  <div style={{ ...TYPO.body, fontWeight:600, color:wT().text, lineHeight:1.4 }}>{selectedObj?.title}</div>
                </OkrCard>
              )}

              {rightObj && selectedObjKRs.length===0 && <div style={{ textAlign:'center', padding:SPACING['2xl'] + 6, color:wT().textFaint, ...TYPO.subhead, fontWeight:500 }}>KRが登録されていません。OKRページからKRを追加してください。</div>}
              {loading && <div style={{ textAlign:'center', padding:SPACING.xl, color:wT().accent, ...TYPO.body }}>読み込み中...</div>}
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
                    // 移動元のKA情報を取得 (old ka_key の算出と sibling 週特定のため)
                    const { data: src } = await supabase.from('weekly_reports')
                      .select('id, kr_id, ka_title, owner, objective_id')
                      .eq('id', reportId).maybeSingle()
                    if (!src) { await reload(); return }
                    if (Number(src.kr_id) === Number(targetKrId)) { await reload(); return }
                    const oldKaKey = computeKAKey(src)
                    const newKaKey = computeKAKey({ ...src, kr_id: targetKrId })
                    // 移動先KRの title を取得 (weekly_reports.kr_title は denormalized)
                    const { data: targetKr } = await supabase.from('key_results')
                      .select('id, title').eq('id', targetKrId).maybeSingle()
                    // sibling 週 (同じ ka_key) の行 id をまとめて取得
                    const { data: siblings } = await supabase.from('weekly_reports')
                      .select('id, owner')
                      .eq('kr_id', src.kr_id)
                      .eq('ka_title', src.ka_title || '')
                      .eq('objective_id', src.objective_id)
                    const srcOwner = (src.owner || '').trim()
                    const ids = (siblings || [])
                      .filter(r => (r.owner || '').trim() === srcOwner)
                      .map(r => r.id)
                    const updateIds = ids.length > 0 ? ids : [reportId]
                    // weekly_reports の kr_id / kr_title をまとめて更新
                    await supabase.from('weekly_reports')
                      .update({ kr_id: targetKrId, kr_title: targetKr?.title || '' })
                      .in('id', updateIds)
                    // ka_tasks.ka_key を新しい値に追従更新 (タスクが切れないように)
                    if (oldKaKey && newKaKey && oldKaKey !== newKaKey) {
                      await supabase.from('ka_tasks')
                        .update({ ka_key: newKaKey }).eq('ka_key', oldKaKey)
                    }
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
