'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_TOKENS } from '../lib/themeTokens'
import { useCurrentOrg } from '../lib/orgContext'
import AIPanel from './AIPanel'
import CsvPage from './CsvPage'
import AnnualView from './AnnualView'
import WeeklyMTGPage from './WeeklyMTGPage'
import MyOKRPageNew from './MyOKRPage'
import BulkRegisterPage from './BulkRegisterPage'
import CompanySummaryPage from './CompanySummaryPage'
import OrgPage from './OrgPage'
import MilestonePage from './MilestonePage'
import OwnerOKRView from './OwnerOKRView'
import MyTasksPage from './MyTasksPage'
import MyCoachPage from './MyCoachPage'
import MyPageShell from './MyPageShell'
import PortalPage from './PortalPage'
import MorningMeetingPage from './MorningMeetingPage'
import { computeKAKey } from '../lib/kaKey'
import KASection from './KASection'

// ─── Theme ────────────────────────────────────────────────────────────────────
// テーマは lib/themeTokens.js で一元管理。固有フィールドだけここで上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    headerBg:     '#1C1C1E',
    connector:    'rgba(255,255,255,0.10)',
    connectorArrow:'rgba(255,255,255,0.18)',
    badgeBg:      'rgba(10,132,255,0.18)',
    badgeBorder:  'rgba(10,132,255,0.40)',
    navActiveBg:  'rgba(10,132,255,0.18)',
    navActiveBorder:'#0A84FF',
    navActiveText:'#5EB3FF',
    navHoverBg:   'rgba(255,255,255,0.05)',
    progressBg:   'rgba(255,255,255,0.10)',
    progressFill: '#0A84FF',
    syncBadgeText:'#30D158',
    syncBadgeBg:  'rgba(48,209,88,0.16)',
    syncBadgeBorder:'rgba(48,209,88,0.30)',
    syncDot:      '#30D158',
    eventBandBg:  '#0A84FF',
    eventBandText:'#FFFFFF',
    eventBandBorder:'rgba(10,132,255,0.30)',
  },
  light: {
    ...COMMON_TOKENS.light,
    bgCard2:      '#FFFFFF',  // Dashboard 専用: card2 を card と揃える
    headerBg:     '#FFFFFF',
    connector:    'rgba(0,0,0,0.06)',
    connectorArrow:'#8E8E93',
    badgeBg:      '#007AFF',
    badgeBorder:  '#007AFF',
    navActiveBg:  'rgba(0,122,255,0.10)',
    navActiveBorder:'#007AFF',
    navActiveText:'#0062CC',
    navHoverBg:   'rgba(0,0,0,0.03)',
    progressBg:   'rgba(0,0,0,0.06)',
    progressFill: '#007AFF',
    syncBadgeText:'#34C759',
    syncBadgeBg:  'rgba(52,199,89,0.10)',
    syncBadgeBorder:'rgba(52,199,89,0.30)',
    syncDot:      '#34C759',
    eventBandBg:  '#007AFF',
    eventBandText:'#FFFFFF',
    eventBandBorder:'#007AFF',
  },
}

let _T = THEMES.dark
const getT = () => _T

// ─── Rating helpers ────────────────────────────────────────────────────────────
const RATINGS = [
  { min: 120, score: 5, label: '奇跡',   color: '#ff9f43' },
  { min: 110, score: 4, label: '変革',   color: '#a855f7' },
  { min: 100, score: 3, label: '好調',   color: '#00d68f' },
  { min:  90, score: 2, label: '順調',   color: '#4d9fff' },
  { min:  80, score: 1, label: '最低限', color: '#ffd166' },
  { min:   0, score: 0, label: '未達',   color: '#E8875A' },
]
const getRating = pct => RATINGS.find(r => Math.min(pct, 150) >= r.min) || RATINGS[RATINGS.length - 1]

// DBカラム名 current_value → current への正規化
function normalizeKR(kr) {
  if (kr.current === undefined && kr.current_value !== undefined) {
    return { ...kr, current: kr.current_value }
  }
  return kr
}

function calcKRProgress(kr) {
  if (!kr.target || kr.target === 0) return 0
  const raw = kr.lower_is_better
    ? Math.max(0, ((kr.target * 2 - kr.current) / kr.target) * 100)
    : (kr.current / kr.target) * 100
  return Math.min(Math.round(raw), 150)
}
function calcObjProgress(krs) {
  if (!krs?.length) return 0
  return Math.round(krs.reduce((s, kr) => s + calcKRProgress(kr), 0) / krs.length)
}

function getAbsoluteDepth(levelId, levels) {
  let depth = 0
  let cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) {
    depth++
    cur = levels.find(l => Number(l.id) === Number(cur.parent_id))
  }
  return depth
}

const LAYER_COLORS = { 0: '#E8875A', 1: '#5DCAA5', 2: '#5DCAA5' }
const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }
const getLayerColor = absDepth => LAYER_COLORS[absDepth] || '#B0BAC8'
const getLayerLabel = absDepth => LAYER_LABELS[absDepth] || ''

function Avatar({ name, color, size = 28 }) {
  if (!name) return null
  const initials = name.replace(/\s+/g, '').slice(0, 2)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${color}30`, border: `1.5px solid ${color}60`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: color, letterSpacing: '-0.03em',
    }}>{initials}</div>
  )
}

function Stars({ score, size = 13 }) {
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: size, opacity: i <= score ? 1 : 0.18 }}>★</span>)}
    </div>
  )
}

function Bar({ value, color, max = 150 }) {
  const pct = Math.min((value / max) * 100, 100)
  const marker = (100 / max) * 100
  return (
    <div style={{ width: '100%', height: 4, background: getT().progressBg, borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: `${marker}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)', zIndex: 2 }} />
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
    </div>
  )
}

function Ring({ value, color, size = 46 }) {
  const s = 3.5, r = (size - s * 2) / 2, c = 2 * Math.PI * r
  const offset = c - (Math.min(value, 100) / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={getT().progressBg} strokeWidth={s} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={s}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{value}%</span>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: getT().bgCard, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
        padding: 26, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{
            background: getT().border, border: 'none', color: getT().textSub,
            width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FInput({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 13 }}>
      {label && <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>{label}</div>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '9px 12px', color: getT().text, fontSize: 13, outline: 'none',
          fontFamily: 'inherit', boxSizing: 'border-box',
        }} />
    </div>
  )
}

function FSelect({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 13 }}>
      {label && <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>{label}</div>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', background: getT().bgCard2, border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '9px 12px', color: getT().text, fontSize: 13, outline: 'none',
        fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer',
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Btn({ children, onClick, color = getT().accentSolid, variant = 'filled', small, danger, disabled }) {
  const bg = danger ? getT().warn : color
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: variant === 'filled' ? bg : 'transparent',
      border: `1px solid ${variant === 'ghost' ? 'rgba(255,255,255,0.1)' : bg}`,
      color: variant === 'filled' ? '#fff' : (danger ? getT().warn : getT().textMuted),
      borderRadius: 8, padding: small ? '5px 12px' : '8px 18px',
      fontSize: small ? 11 : 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
    }}>
      {children}
    </button>
  )
}

// ─── Objective Form ────────────────────────────────────────────────────────────
function ObjForm({ initial, onSave, onClose, levels, activeLevelId, activePeriod, fiscalYear, members }) {
  const [title, setTitle]     = useState(initial?.title || '')
  const [owner, setOwner]     = useState(initial?.owner || '')
  const [levelId, setLevelId] = useState(String(initial?.level_id || activeLevelId || levels[0]?.id))
  const [period, setPeriod]   = useState(activePeriod === 'all' ? 'q1' : activePeriod)
  const [programTags, setProgramTags] = useState(Array.isArray(initial?.program_tags) ? initial.program_tags : [])
  const [tagInput, setTagInput] = useState('')
  const [allTags, setAllTags] = useState([])  // サジェスト用 (既存の全タグ)
  const [krs, setKRs] = useState(
    initial?.key_results?.length
      ? initial.key_results.map(k => ({ ...k, target: String(k.target), current: String(k.current), owner: k.owner || '', parent_kr_id: k.parent_kr_id || null, aggregation_type: k.aggregation_type || 'manual' }))
      : [{ _tmpId: Date.now(), title: '', target: '', current: '', unit: '', lower_is_better: false, owner: '', parent_kr_id: null, aggregation_type: 'manual' }]
  )
  const [saving, setSaving] = useState(false)
  const [parentObj, setParentObj] = useState(null)
  const [parentId, setParentId] = useState(initial?.parent_objective_id || null)
  const [annualObjList, setAnnualObjList] = useState([]) // 同組織の通期OKR一覧

  // 四半期OKRの場合、同組織の通期OKR一覧を取得
  useEffect(() => {
    const isQuarterly = ['q1','q2','q3','q4'].includes(period)
    if (!isQuarterly) { setAnnualObjList([]); setParentObj(null); return }
    ;(async () => {
      const annualKey = fiscalYear === '2026' ? 'annual' : `${fiscalYear}_annual`
      const { data: objs } = await supabase.from('objectives').select('id,title,owner').eq('period', annualKey).eq('level_id', parseInt(levelId))
      setAnnualObjList(objs || [])
    })()
  }, [period, levelId, fiscalYear])

  // プログラムタグ マスタ (program_definitions) から候補を取得。
  // マスタが無い旧環境では objectives.program_tags の distinct で補完。
  useEffect(() => {
    ;(async () => {
      const defRes = await supabase.from('program_definitions').select('name').order('sort_order', { ascending: true }).order('name', { ascending: true }).range(0, 999)
      if (!defRes.error && defRes.data) {
        setAllTags(defRes.data.map(d => d.name))
        return
      }
      // フォールバック
      const { data, error } = await supabase.from('objectives').select('program_tags').not('program_tags', 'is', null).range(0, 999)
      if (error) return
      const set = new Set()
      ;(data || []).forEach(o => (o.program_tags || []).forEach(t => { if (t) set.add(t) }))
      setAllTags([...set].sort())
    })()
  }, [])

  function addTag(t) {
    const v = (t || '').trim()
    if (!v) return
    if (programTags.includes(v)) return
    setProgramTags(prev => [...prev, v])
    setTagInput('')
  }
  function removeTag(t) {
    setProgramTags(prev => prev.filter(x => x !== t))
  }

  // 選択中の通期OKRの詳細（KR含む）を取得
  useEffect(() => {
    if (!parentId) { setParentObj(null); return }
    ;(async () => {
      const { data: obj } = await supabase.from('objectives').select('id,title,owner').eq('id', parentId).single()
      if (!obj) { setParentObj(null); return }
      // 新カラムが無い環境向けフォールバック付き
      let krRes = await supabase.from('key_results').select('id,title,target,current,unit,lower_is_better,parent_kr_id,aggregation_type').eq('objective_id', obj.id)
      if (krRes.error && /parent_kr_id|aggregation_type|column/i.test(krRes.error.message || '')) {
        krRes = await supabase.from('key_results').select('id,title,target,current,unit,lower_is_better').eq('objective_id', obj.id)
      }
      const krData = krRes.data
      setParentObj({ ...obj, key_results: krData || [] })
    })()
  }, [parentId])

  const addKR    = () => setKRs(p => [...p, { _tmpId: Date.now(), title: '', target: '', current: '', unit: '', lower_is_better: false, owner: '', parent_kr_id: null, aggregation_type: 'manual' }])
  const removeKR = key => setKRs(p => p.filter(k => (k.id || k._tmpId) !== key))
  const updateKR = (key, field, val) => setKRs(p => p.map(k => (k.id || k._tmpId) === key ? { ...k, [field]: val } : k))

  const save = async () => {
    if (!title.trim()) return
    // Q期OBJはparent_objective_idが必須
    const isQ = ['q1','q2','q3','q4'].includes(period)
    if (isQ && !parentId) {
      alert('Q期OBJには紐付ける通期OKRを選択してください。')
      return
    }
    setSaving(true)
    await onSave({
      obj: { id: initial?.id, title, owner, level_id: parseInt(levelId), period, parent_objective_id: parentId || null, program_tags: programTags },
      krs: krs.map(k => ({ ...k, target: parseFloat(k.target) || 0, current: parseFloat(k.current) || 0 })),
    })
    setSaving(false)
    onClose()
  }

  // 通期・Q期どちらも選択可能（Q期選択時は通期OKR紐付けドロップダウンが表示される）
  const periodOpts = [
    { value: 'annual', label: '通期' },
    { value: 'q1', label: 'Q1' }, { value: 'q2', label: 'Q2' },
    { value: 'q3', label: 'Q3' }, { value: 'q4', label: 'Q4' },
  ]

  return (
    <>
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>年度</div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: getT().badgeBg,
          border: `1px solid ${getT().badgeBorder}`,
          borderRadius: 8, padding: '6px 12px',
          color: '#fff',
          fontSize: 13, fontWeight: 700,
        }}>
          📅 {fiscalYear}年度
        </div>
      </div>
      <FSelect label="所属組織" value={levelId} onChange={setLevelId}
        options={levels.map(l => {
          const depth = (() => { let d=0,cur=l; while(cur&&cur.parent_id){d++;cur=levels.find(x=>x.id===cur.parent_id)} return d })()
          return { value: String(l.id), label: `${'　'.repeat(depth)}${l.icon} ${l.name}` }
        })} />
      <FSelect label="期間" value={period} onChange={v => { setPeriod(v); if (v === 'annual') setParentId(null) }} options={periodOpts} />
      {['q1','q2','q3','q4'].includes(period) && (
        <div style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>紐付け通期OKR <span style={{ color: '#ff6b6b' }}>*</span></div>
          <select value={parentId || ''} onChange={e => setParentId(e.target.value ? parseInt(e.target.value) : null)} style={{
            width: '100%', background: getT().bgCard2, border: `1px solid ${parentId ? 'rgba(255,255,255,0.1)' : 'rgba(255,107,107,0.4)'}`,
            borderRadius: 8, padding: '9px 12px', color: parentId ? '#e8eaf0' : '#505878', fontSize: 13,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer',
          }}>
            <option value="">-- 通期OKRを選択 --</option>
            {annualObjList.map(o => <option key={o.id} value={o.id}>{o.title}{o.owner ? ` (${o.owner})` : ''}</option>)}
          </select>
          {annualObjList.length === 0 && (
            <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 4 }}>この組織に通期OKRがありません。先に通期OKRを作成してください。</div>
          )}
        </div>
      )}
      <FInput label="目標タイトル" value={title} onChange={setTitle} placeholder="例: 市場シェアを拡大する" />
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>オーナー</div>
        <select value={owner} onChange={e => setOwner(e.target.value)} style={{
          width: '100%', background: getT().bgCard2, border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '9px 12px', color: owner ? '#e8eaf0' : '#505878', fontSize: 13,
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer',
        }}>
          <option value="">-- 未設定 --</option>
          {(members || []).map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
        </select>
      </div>
      {/* プログラムタグ: マスタ (program_definitions) から選択。新規追加は組織ページで管理。 */}
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>
          🏷 プログラムタグ <span style={{ color: getT().textFaint }}>(複数可・週次MTGの絞り込みに使用 / 新規は「組織ページ → プログラム管理」で追加)</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', padding: 6, background: getT().bgCard2, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
          {programTags.map(t => {
            const isOrphan = !allTags.includes(t)
            return (
              <span key={t} title={isOrphan ? 'マスタから削除されたタグです。組織ページで再定義してください。' : ''}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: isOrphan ? 'rgba(232,155,155,0.15)' : 'rgba(107,150,199,0.15)', color: isOrphan ? '#E89B9B' : '#6B96C7', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                {isOrphan ? '⚠ ' : ''}{t}
                <button type="button" onClick={() => removeTag(t)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
              </span>
            )
          })}
          {(() => {
            const candidates = allTags.filter(t => !programTags.includes(t))
            return candidates.length > 0 ? (
              <select value="" onChange={e => { if (e.target.value) addTag(e.target.value) }}
                style={{ flex: 1, minWidth: 140, background: 'transparent', border: 'none', color: '#9aa3b8', fontSize: 13, outline: 'none', padding: '3px 4px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="">＋ プログラムを追加</option>
                {candidates.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : programTags.length === 0 ? (
              <span style={{ fontSize: 11, color: '#9aa3b8' }}>マスタにタグがありません — 組織ページで定義してください</span>
            ) : null
          })()}
        </div>
      </div>

      {parentObj && (
        <div style={{ marginBottom: 16, padding: '14px 16px', background: getT().navActiveBg, border: `1px solid ${getT().navActiveBorder}40`, borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: getT().textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            📌 通期OKR（参照）
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: getT().text, marginBottom: 10, lineHeight: 1.4 }}>{parentObj.title}</div>
          {parentObj.key_results.map((kr, i) => {
            const kp = kr.target > 0 ? Math.round((kr.lower_is_better ? Math.max(0, ((kr.target * 2 - kr.current) / kr.target) * 100) : (kr.current / kr.target) * 100)) : 0
            const r = RATINGS.find(r => Math.min(kp, 150) >= r.min) || RATINGS[RATINGS.length - 1]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, padding: '6px 10px', background: getT().bgCard, borderRadius: 7, border: `1px solid ${getT().border}` }}>
                <span style={{ fontSize: 11, color: getT().textSub, flex: 1, minWidth: 0 }}>KR{i + 1}: {kr.title}</span>
                <div style={{ width: 60, height: 3, background: getT().progressBg, borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: r.color, borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 11, color: r.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{kr.current?.toLocaleString()}{kr.unit} / {kr.target?.toLocaleString()}{kr.unit} ({kp}%)</span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 8, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Key Results</div>
      {krs.map((kr, i) => {
        const key = kr.id || kr._tmpId
        const isQuarterly = ['q1','q2','q3','q4'].includes(period)
        const isAnnualPeriod = period === 'annual'
        return (
          <div key={key} style={{ background: getT().bgCard, border: `1px solid ${getT().border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: getT().textMuted }}>KR {i + 1}</span>
              {krs.length > 1 && <Btn small danger variant="ghost" onClick={() => removeKR(key)}>削除</Btn>}
            </div>
            <FInput value={kr.title} onChange={v => updateKR(key, 'title', v)} placeholder="KR のタイトル" />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><FInput value={String(kr.target)} onChange={v => updateKR(key, 'target', v)} placeholder="目標値" type="number" /></div>
              <div style={{ flex: 1 }}><FInput value={String(kr.current)} onChange={v => updateKR(key, 'current', v)} placeholder="現在値" type="number" /></div>
              <div style={{ flex: 1 }}><FInput value={kr.unit} onChange={v => updateKR(key, 'unit', v)} placeholder="単位" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: getT().textSub, flex: 1 }}>
                <input type="checkbox" checked={!!kr.lower_is_better} onChange={e => updateKR(key, 'lower_is_better', e.target.checked)} />
                低い方が良い指標（チャーン率・バグ数など）
              </label>
              <select value={kr.owner||''} onChange={e => updateKR(key, 'owner', e.target.value)} style={{
                background: getT().bgCard2, border: `1px solid ${getT().border}`, borderRadius: 8,
                padding: '5px 8px', color: kr.owner ? getT().text : getT().textFaint, fontSize: 12,
                outline: 'none', fontFamily: 'inherit', cursor: 'pointer', maxWidth: 160,
              }}>
                <option value="">KR担当者</option>
                {(members || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            {/* Q期 KR: 親 (通期) KR を選択。マトリクス表示で同じ行に並ぶ。 */}
            {isQuarterly && parentObj?.key_results?.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: getT().textMuted, flexShrink: 0 }}>↗ 紐付け先 通期KR</span>
                <select value={kr.parent_kr_id || ''} onChange={e => updateKR(key, 'parent_kr_id', e.target.value ? Number(e.target.value) : null)}
                  style={{ flex: 1, background: getT().bgCard2, border: `1px solid ${getT().border}`, borderRadius: 8, padding: '5px 8px', color: kr.parent_kr_id ? getT().text : getT().textFaint, fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="">(未紐付け)</option>
                  {parentObj.key_results.map(pk => (
                    <option key={pk.id} value={pk.id}>{pk.title}</option>
                  ))}
                </select>
              </div>
            )}
            {/* 通期 KR: 集計方法を選択 (Q期 KR の current から自動算出) */}
            {isAnnualPeriod && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: getT().textMuted, flexShrink: 0 }}>📊 集計方法</span>
                <select value={kr.aggregation_type || 'manual'} onChange={e => updateKR(key, 'aggregation_type', e.target.value)}
                  style={{ flex: 1, background: getT().bgCard2, border: `1px solid ${getT().border}`, borderRadius: 8, padding: '5px 8px', color: getT().text, fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="manual">手動 (子から集計しない)</option>
                  <option value="cumulative">累積 (Q1〜Q4 の合計) — 粗利 / 新規獲得 等</option>
                  <option value="average">平均 (Q1〜Q4 の平均) — 満足度 / 達成率 等</option>
                  <option value="latest">最新 (直近Q の値) — NPS / 在籍人数 等</option>
                </select>
              </div>
            )}
          </div>
        )
      })}
      <Btn small variant="ghost" onClick={addKR}>＋ KR を追加</Btn>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, borderTop: `1px solid ${getT().border}`, paddingTop: 18 }}>
        <Btn variant="ghost" onClick={onClose}>キャンセル</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? '保存中...' : '保存する'}</Btn>
      </div>
    </>
  )
}

// ─── OKR Card ──────────────────────────────────────────────────────────────────
function ObjCard({ obj, levelColor, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const prog = calcObjProgress(obj.key_results)
  const rating = getRating(prog)

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        background: getT().bgCard, border: `1px solid ${open ? levelColor + '50' : getT().border}`,
        borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
      }}>
        <div style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
          onClick={() => setOpen(p => !p)}>
          <Ring value={Math.min(prog, 100)} color={rating.color} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: levelColor, padding: '1px 6px', borderRadius: 3 }}>Objective</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${rating.color}18`, color: rating.color }}>{rating.label}</span>
              <Stars score={rating.score} size={9} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: getT().text, lineHeight: 1.4, marginBottom: 6 }}>{obj.title}</div>
            {obj.owner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Avatar name={obj.owner} color={levelColor} size={22} />
                <span style={{ fontSize: 12, color: getT().textSub }}>{obj.owner}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
            <button onClick={e => { e.stopPropagation(); onEdit(obj) }} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: getT().textMuted,
              width: 24, height: 24, borderRadius: 5, cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✎</button>
            <button onClick={e => { e.stopPropagation(); onDelete(obj.id) }}
              title="アーカイブ (アーカイブ画面から復元・完全削除可能)"
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: getT().textMuted,
                width: 24, height: 24, borderRadius: 5, cursor: 'pointer', fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>📦</button>
            <span style={{ color: getT().textFaint, fontSize: 13, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
          </div>
        </div>

        {open && (
          <div style={{ borderTop: `1px solid ${getT().borderLight}`, background: getT().bgCard2 }}>
            {(!obj.key_results || obj.key_results.length === 0) && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: getT().textFaint }}>KR がありません</div>
            )}
            {obj.key_results?.map((kr, i) => {
              const kprog = calcKRProgress(kr)
              const kr_rating = getRating(kprog)
              return (
                <div key={kr.id} style={{
                  padding: '10px 14px 10px 20px',
                  borderBottom: i < obj.key_results.length - 1 ? `1px solid ${getT().borderLight}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flexShrink: 0, width: 40, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: kr_rating.color, background: `${kr_rating.color}15`, padding: '2px 4px', borderRadius: 4, marginBottom: 2 }}>{kprog}%</div>
                      <Stars score={kr_rating.score} size={8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                        <span style={{ fontSize: 13, color: getT().textSub, lineHeight: 1.35 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: getT().badgeBg, padding: '1px 5px', borderRadius: 3, marginRight: 6, verticalAlign: 'middle' }}>KR</span>
                          {kr.title}
                        </span>
                        <span style={{ fontSize: 11, color: getT().textMuted, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {kr.owner && <span style={{ fontSize: 10, color: getT().accent, background: `${getT().accent}15`, padding: '1px 6px', borderRadius: 4 }}>{kr.owner}</span>}
                          {kr.current}{kr.unit} / {kr.target}{kr.unit}
                          {kr.lower_is_better && <span style={{ color: getT().textFaint, marginLeft: 4 }}>↓良</span>}
                        </span>
                      </div>
                      <Bar value={kprog} color={kr_rating.color} />
                    </div>
                  </div>
                  <KASection krId={kr.id} objectiveId={obj.id} levelId={obj.level_id} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Level Column ─────────────────────────────────────────────────────────────
function LevelColumn({ levelId, levels, nodeObjectives, onEdit, onDelete, isLast }) {
  const level = levels.find(l => Number(l.id) === Number(levelId))
  const objs = nodeObjectives[levelId] || []
  const absDepth = getAbsoluteDepth(levelId, levels)
  const layerColor = getLayerColor(absDepth)
  const layerLabel = getLayerLabel(absDepth)
  const allProgs = objs.map(o => calcObjProgress(o.key_results))
  const avg = allProgs.length ? Math.round(allProgs.reduce((s, p) => s + p, 0) / allProgs.length) : null
  const avgR = avg !== null ? getRating(avg) : null
  const [colWidth, setColWidth] = useState(280)
  if (!level) return null

  const onMouseDownResize = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = colWidth
    const onMove = (me) => setColWidth(Math.max(180, Math.min(520, startW + me.clientX - startX)))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      <div style={{ width: colWidth, flexShrink: 0, position: 'relative' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          borderRadius: 8, background: `${layerColor}12`, border: `1px solid ${layerColor}30`,
          borderLeft: `3px solid ${layerColor}`, marginBottom: 10,
        }}>
          <span style={{ fontSize: 17 }}>{level.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: getT().text }}>{level.name}</div>
            <div style={{ fontSize: 10, color: layerColor, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{layerLabel}</div>
          </div>
          {avg !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: avgR.color, lineHeight: 1 }}>{avg}%</div>
              <Stars score={avgR.score} size={8} />
            </div>
          )}
        </div>

        {objs.length === 0
          ? <div style={{ fontSize: 12, color: getT().textFaintest, fontStyle: 'italic', padding: '8px 4px' }}>目標なし</div>
          : objs.map(obj => <ObjCard key={obj.id} obj={obj} levelColor={layerColor} onEdit={onEdit} onDelete={onDelete} />)
        }

        <div onMouseDown={onMouseDownResize} style={{ position: 'absolute', top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 3, height: 40, borderRadius: 2, background: `${layerColor}60`, opacity: 0.4, transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
          />
        </div>
      </div>

      {!isLast && (
        <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 20, flexShrink: 0, width: 36 }}>
          <div style={{ width: 14, height: 2, background: getT().connector, marginTop: 10 }} />
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.2)', lineHeight: 1, marginTop: 2 }}>›</div>
          <div style={{ width: 8, height: 2, background: getT().connector, marginTop: 10 }} />
        </div>
      )}
    </div>
  )
}

function NodeBlock({ levelId, levels, nodeObjectives, onEdit, onDelete, _depth = 0 }) {
  if (_depth > 5) return null
  const children = levels.filter(l => Number(l.parent_id) === Number(levelId))
  const hasChildren = children.length > 0

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      <LevelColumn levelId={levelId} levels={levels} nodeObjectives={nodeObjectives} onEdit={onEdit} onDelete={onDelete} isLast={!hasChildren} />
      {hasChildren && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 22, flexShrink: 0, width: 36 }}>
            <div style={{ flex: 1, height: 2, background: getT().connector }} />
            <div style={{ fontSize: 18, color: getT().connectorArrow, lineHeight: 1, marginTop: 1 }}>›</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {children.map(child => (
              <NodeBlock key={child.id} levelId={child.id} levels={levels} nodeObjectives={nodeObjectives} onEdit={onEdit} onDelete={onDelete} _depth={_depth + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}


// ─── アーカイブ済み OKR 一覧パネル ────────────────────────────────────────
// archived_at IS NOT NULL の objectives を新しい順に表示し、復元ボタンを提供。
// 親 OKR (annual) を復元する際は子の Q 期 obj は archived_at を変更しないので、
// もし子も archive されていたら個別に復元が必要 (現状は親のみアーカイブ前提)。
function ArchivedOKRPanel({ T, levels, members, fiscalYear, onRestore, onPurge, refreshKey }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [purgingId, setPurgingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('objectives')
      .select('id, level_id, period, title, owner, archived_at, parent_objective_id')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .range(0, 999)
    if (error) {
      // archived_at 列が無い古い環境
      console.warn('[ArchivedOKRPanel] archived_at 列が見つかりません。supabase_objectives_archive.sql を実行してください。', error.message)
      setItems([])
    } else {
      setItems(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const periodLabel = (p) => {
    const m = (p || '').match(/(annual|q[1-4])$/)
    if (!m) return p
    return { annual: '通期', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }[m[1]] || p
  }
  const levelOf = (id) => levels.find(l => Number(l.id) === Number(id))?.name || `level=${id}`
  const memberOf = (name) => members.find(m => m.name === name)
  const fmtDate = (s) => {
    if (!s) return ''
    const d = new Date(s)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const handleRestore = async (id) => {
    setBusyId(id)
    await onRestore(id)
    setBusyId(null)
    load()
  }

  const handlePurge = async (obj) => {
    setPurgingId(obj.id)
    await onPurge(obj)
    setPurgingId(null)
    load()
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.01em' }}>📦 アーカイブ OKR</h1>
        <span style={{ fontSize: 12, color: T.textMuted }}>{loading ? '読み込み中…' : `${items.length} 件`}</span>
        <span style={{ flex: 1 }} />
        <button onClick={load} title="再読み込み"
          style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.textSub, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          ⟳ 更新
        </button>
      </div>
      {!loading && items.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: T.textFaint, border: `1px dashed ${T.border}`, borderRadius: 12, background: T.bgCard }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, color: T.textSub }}>アーカイブされた OKR はありません</div>
        </div>
      )}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(o => {
            const m = memberOf(o.owner)
            return (
              <div key={o.id} style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T.textSub }}>{levelOf(o.level_id)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T.textSub }}>{periodLabel(o.period)}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>アーカイブ日時: {fmtDate(o.archived_at)}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={o.title}>{o.title}</div>
                  {o.owner && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 11, color: T.textMuted }}>
                      {m?.avatar_url
                        ? <img src={m.avatar_url} alt={o.owner} style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
                        : <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />}
                      <span>{o.owner}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleRestore(o.id)} disabled={busyId === o.id || purgingId === o.id}
                    style={{
                      background: T.accentSolid, border: 'none', color: '#fff',
                      borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                      cursor: busyId === o.id ? 'wait' : 'pointer', fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}>
                    {busyId === o.id ? '復元中…' : '↩ 復元'}
                  </button>
                  <button onClick={() => handlePurge(o)} disabled={busyId === o.id || purgingId === o.id}
                    title="完全削除 (DB から物理削除・復元不可)"
                    style={{
                      background: 'transparent', border: `1px solid ${T.danger}`, color: T.danger,
                      borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                      cursor: purgingId === o.id ? 'wait' : 'pointer', fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}>
                    {purgingId === o.id ? '削除中…' : '🗑 完全削除'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ user, onSignOut }) {
  // 現在アクティブな組織。マルチテナント環境で複数 org に所属しているユーザー
  // (例: 同 email が NEO 福岡とデモ org の両方にいる guest@demo.local) でも、
  // levels / members など全データクエリをこの id で絞ることで他 org のデータが
  // 混ざらないようにする (RLS は両 org を許容するためフロント側で明示フィルタ必須)。
  const { currentOrg } = useCurrentOrg()
  // OKR / KR の追加・編集・アーカイブ・並び替え等のミューテーションは
  // owner / admin ロールのみに許可。member は閲覧のみ。
  // KA (KASection / weekly_reports) は対象外で従来どおり全員編集可。
  const canEditOKR = ['owner', 'admin'].includes(currentOrg?.role)
  const [levels, setLevels]               = useState([])
  const [nodeObjectives, setNodeObjectives] = useState({})
  const [activeLevelId, setActiveLevelId]   = useState(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('dashboard_activeLevelId')
    return saved && saved !== 'null' ? Number(saved) : null
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeLevelId == null) localStorage.removeItem('dashboard_activeLevelId')
    else localStorage.setItem('dashboard_activeLevelId', String(activeLevelId))
  }, [activeLevelId])
  const [fiscalYear, setFiscalYear]         = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('fy') || '2026'
    }
    return '2026'
  })
  const [activePeriod, setActivePeriod]     = useState(() => { const m = new Date().getMonth(); return m >= 3 && m <= 5 ? 'q1' : m >= 6 && m <= 8 ? 'q2' : m >= 9 && m <= 11 ? 'q3' : 'q4' })
  const [modal, setModal]                   = useState(null)
  const [loading, setLoading]               = useState(true)
  const [showAI, setShowAI]                 = useState(false)
  const [initialAIMessage, setInitialAIMessage] = useState(null)
  const [showSidebar, setShowSidebar]       = useState(false)
  const [isMobile, setIsMobile]             = useState(false)
  const [activePage, setActivePage]         = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('page') || 'portal'
    }
    return 'portal'
  })
  const [viewMode, setViewMode]             = useState('annual')
  const [annualRefreshKey, setAnnualRefreshKey] = useState(0)
  const [themeKey, setThemeKey]                 = useState('light')
  const [syncStatus, setSyncStatus]             = useState('connecting')
  const [selectedOwner, setSelectedOwner]       = useState(null)
  const [taskViewMode, setTaskViewMode]         = useState('my') // 'my' | 'all'
  const T = THEMES[themeKey]
  _T = T
  if (typeof window !== 'undefined') window.__OKR_THEME__ = T
  const [members, setMembers]               = useState([])
  const [undoDelete, setUndoDelete]         = useState(null) // { objId, obj, timer, hardDelete? }
  const [showArchive, setShowArchive]       = useState(false) // OKR 画面をアーカイブ一覧に切替

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // スマホではマイページ (mycoach) を強制 (他ページは非表示)
  useEffect(() => {
    if (isMobile && activePage !== 'mycoach') {
      setActivePage('mycoach')
    }
  }, [isMobile])  // activePage を依存に入れると無限ループになるので除外

  // URL にページ・年度を同期（リロード時に復元される）
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('page', activePage)
    params.set('fy', fiscalYear)
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', newUrl)
  }, [activePage, fiscalYear])

  useEffect(() => {
    // currentOrg が確定するまでは何もしない (空配列で初期化されたまま)。
    // currentOrg が切り替わったら organization_id で絞り直して再ロードする。
    if (!currentOrg?.id) return
    const orgId = currentOrg.id
    const load = async () => {
      setLoading(true)
      const [{ data: lvls, error }, { data: mems }] = await Promise.all([
        supabase.from('levels').select('*').eq('organization_id', orgId).order('id'),
        supabase.from('members').select('*').eq('organization_id', orgId).order('id'),
      ])
      if (error) console.error('levels error:', error)
      const validLvls = (lvls || []).filter(l => l.fiscal_year === fiscalYear)
      if (validLvls.length) { setLevels(validLvls); setActiveLevelId(validLvls[0].id) }
      else { setLevels([]); setActiveLevelId(null) }
      if (mems) setMembers(mems)
      setLoading(false)
    }
    load()

    // ── Supabase Realtime ─────────────────────────────────
    const channel = supabase
      .channel('dashboard_realtime_' + fiscalYear)
      // objectives 変更 → 該当levelのOKRを再取得
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objectives' }, payload => {
        const levelId = payload.new?.level_id || payload.old?.level_id
        if (!levelId) return
        setAnnualRefreshKey(k => k + 1)
        if (window.__fetchForLevel) {
          window.__fetchForLevel(levelId).then(data => {
            setNodeObjectives(m => ({ ...m, [levelId]: data }))
          })
        }
      })
      // key_results 変更 → 親objectiveのlevelを取得して再描画
      .on('postgres_changes', { event: '*', schema: 'public', table: 'key_results' }, async payload => {
        const objId = payload.new?.objective_id || payload.old?.objective_id
        if (!objId) return
        const { data: obj } = await supabase.from('objectives').select('level_id').eq('id', objId).single()
        if (!obj?.level_id) return
        setAnnualRefreshKey(k => k + 1)
        if (window.__fetchForLevel) {
          window.__fetchForLevel(obj.level_id).then(data => {
            setNodeObjectives(m => ({ ...m, [obj.level_id]: data }))
          })
        }
      })
      // key_actions 変更 → KAの親KR→Objective→levelを辿って再描画
      .on('postgres_changes', { event: '*', schema: 'public', table: 'key_actions' }, async payload => {
        const krId = payload.new?.key_result_id || payload.old?.key_result_id
        if (!krId) return
        const { data: kr } = await supabase.from('key_results').select('objective_id').eq('id', krId).single()
        if (!kr?.objective_id) return
        const { data: obj } = await supabase.from('objectives').select('level_id').eq('id', kr.objective_id).single()
        if (!obj?.level_id) return
        if (window.__fetchForLevel) {
          window.__fetchForLevel(obj.level_id).then(data => {
            setNodeObjectives(m => ({ ...m, [obj.level_id]: data }))
          })
        }
      })
      // members 変更
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, payload => {
        // 他 org のリアルタイム更新が混ざらないよう organization_id で除外
        const orgId = currentOrg?.id
        const row = payload.new || payload.old
        if (orgId && row?.organization_id != null && Number(row.organization_id) !== Number(orgId)) return
        if (payload.eventType === 'INSERT') setMembers(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
        else if (payload.eventType === 'UPDATE') setMembers(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
        else if (payload.eventType === 'DELETE') setMembers(prev => prev.filter(m => m.id !== payload.old.id))
      })
      // levels 変更（組織名変更等）
      .on('postgres_changes', { event: '*', schema: 'public', table: 'levels' }, payload => {
        const orgId = currentOrg?.id
        const row = payload.new || payload.old
        if (orgId && row?.organization_id != null && Number(row.organization_id) !== Number(orgId)) return
        if (payload.eventType === 'INSERT') setLevels(prev => prev.some(l => l.id === payload.new.id) ? prev : [...prev, payload.new])
        else if (payload.eventType === 'UPDATE') setLevels(prev => prev.map(l => l.id === payload.new.id ? payload.new : l))
        else if (payload.eventType === 'DELETE') setLevels(prev => prev.filter(l => l.id !== payload.old.id))
      })
      .subscribe(status => {
        setSyncStatus(status === 'SUBSCRIBED' ? 'synced' : status === 'CHANNEL_ERROR' ? 'error' : 'connecting')
      })

    return () => { supabase.removeChannel(channel) }
  }, [fiscalYear, currentOrg?.id]) // eslint-disable-line

  // ─── 不正なperiodキーを自動修正 ─────────────────────────────────────────
  useEffect(() => {
    const fixBadPeriods = async () => {
      const { data: objs } = await supabase.from('objectives').select('id,period').range(0, 49999)
      if (!objs) return
      let fixed = 0
      // 二重プレフィックス修正 (2025_2025_q1 → 2025_q1)
      const doublePrefix = objs.filter(o => /^\d{4}_\d{4}_/.test(o.period))
      for (const o of doublePrefix) {
        await supabase.from('objectives').update({ period: o.period.replace(/^(\d{4})_\1_/, '$1_') }).eq('id', o.id)
        fixed++
      }
      // 無効な period='all' / '2025_all' 等を削除（KR含む）
      const invalidAll = objs.filter(o => o.period === 'all' || o.period.endsWith('_all'))
      for (const o of invalidAll) {
        await supabase.from('key_results').delete().eq('objective_id', o.id)
        await supabase.from('weekly_reports').delete().eq('objective_id', o.id)
        await supabase.from('objectives').delete().eq('id', o.id)
      }
      if (invalidAll.length > 0) console.log(`Deleted ${invalidAll.length} objectives with invalid period='all'`)
      if ((fixed + invalidAll.length) > 0) {
        if (activeLevelId && levels.length) loadSubtree(activeLevelId, activePeriod, levels, fiscalYear)
      }
    }
    fixBadPeriods()
  }, []) // eslint-disable-line

  // ─── 年度に応じたperiodキーを生成 ─────────────────────────────────────────
  // 2026年度: 'q1', 'q2', 'q3', 'q4', 'annual' （既存データそのまま）
  // 2025年度: '2025_q1', '2025_q2', '2025_q3', '2025_q4', '2025_annual'
  const toPeriodKey = (period, year) => year === '2026' ? period : `${year}_${period}`

  // window経由でRealtimeハンドラからアクセスできるよう公開
  const fetchForLevel = async (levelId, period, year = '2026') => {
    let query = supabase.from('objectives').select('id,level_id,period,title,owner,archived_at').eq('level_id', levelId).order('id')
    query = query.eq('period', toPeriodKey(period, year))
    let { data: objs, error } = await query
    if (error && /archived_at|column/i.test(error.message || '')) {
      // archived_at 列が無い古い環境向けフォールバック
      const r = await supabase.from('objectives').select('id,level_id,period,title,owner').eq('level_id', levelId).eq('period', toPeriodKey(period, year)).order('id')
      objs = r.data
    } else if (objs) {
      // archived_at IS NOT NULL の行を除外 (アーカイブ済みは表示しない)
      objs = objs.filter(o => !o.archived_at)
    }
    if (!objs || objs.length === 0) return []
    const ids = objs.map(o => o.id)
    const { data: rawKrs } = await supabase
      .from('key_results').select('*')
      .in('objective_id', ids)
    const krMap = {}
    ;(rawKrs || []).map(normalizeKR).forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
      krMap[kr.objective_id].push(kr)
    })
    return objs.map(o => ({ ...o, key_results: krMap[o.id] || [] }))
  }

  // Realtimeハンドラから現在のactivePeriod/fiscalYearを使えるよう公開
  useEffect(() => {
    window.__fetchForLevel = (levelId) => fetchForLevel(levelId, activePeriod, fiscalYear)
    return () => { delete window.__fetchForLevel }
  }, [activePeriod, fiscalYear]) // eslint-disable-line

  const getSubtree = useCallback((id, lvls) => {
    const ids = [id]
    lvls.filter(l => Number(l.parent_id) === id).forEach(c => ids.push(...getSubtree(c.id, lvls)))
    return ids
  }, [])

  const loadSubtree = useCallback(async (rootId, period, lvls, year = '2026') => {
    if (!rootId || !lvls.length) return
    const subtree = getSubtree(rootId, lvls)
    const map = {}
    for (const lid of subtree) {
      map[lid] = await fetchForLevel(lid, period, year)
    }
    setNodeObjectives(map)
  }, [getSubtree]) // eslint-disable-line

  useEffect(() => {
    if (activeLevelId && levels.length) loadSubtree(activeLevelId, activePeriod, levels, fiscalYear)
  }, [activeLevelId, activePeriod, levels, fiscalYear, activePage]) // eslint-disable-line

  const handleSave = async ({ obj, krs }) => {
    const safePeriod = obj.period === 'all' ? 'q1' : obj.period
    const periodKey = safePeriod.includes('_') && fiscalYear !== '2026'
      ? safePeriod
      : toPeriodKey(safePeriod, fiscalYear)
    const objToSave = { ...obj, period: periodKey }

    let objectiveId = objToSave.id
    if (objToSave.id) {
      const updatePayload = { title: objToSave.title, owner: objToSave.owner, level_id: objToSave.level_id, period: objToSave.period }
      if (objToSave.parent_objective_id !== undefined) updatePayload.parent_objective_id = objToSave.parent_objective_id
      if (objToSave.program_tags !== undefined) updatePayload.program_tags = objToSave.program_tags
      let { error: updErr } = await supabase.from('objectives').update(updatePayload).eq('id', objToSave.id)
      if (updErr && /program_tags|column/i.test(updErr.message || '')) {
        // 列が無い古い環境: tags を抜いて再試行
        delete updatePayload.program_tags
        const r = await supabase.from('objectives').update(updatePayload).eq('id', objToSave.id)
        updErr = r.error
      }
      if (updErr) { console.error('objective update error:', updErr); alert('目標の更新に失敗しました: ' + updErr.message); return }

      // 所属組織変更時、紐づくKA(weekly_reports)のlevel_idも更新
      await supabase.from('weekly_reports').update({ level_id: objToSave.level_id }).eq('objective_id', objToSave.id)

      // KRを選択的に更新（全削除→再作成ではなく、個別にupsert/delete）
      const validKRs = krs.filter(k => k.title?.trim())
      const existingKRIds = validKRs.filter(k => k.id && !String(k.id).startsWith('_tmp')).map(k => k.id)

      // 削除されたKRのみ削除（フォームから消えたものだけ）
      const { data: currentKRs } = await supabase.from('key_results').select('id').eq('objective_id', objToSave.id)
      const currentIds = (currentKRs || []).map(k => k.id)
      const idsToDelete = currentIds.filter(id => !existingKRIds.includes(id))
      if (idsToDelete.length > 0) {
        await supabase.from('key_results').delete().in('id', idsToDelete)
      }

      // 既存KRを更新 (新カラム不在環境ではフォールバック)
      for (const kr of validKRs) {
        if (kr.id && !String(kr.id).startsWith('_tmp')) {
          const fullPayload = {
            title: kr.title, target: kr.target, current: kr.current, unit: kr.unit,
            lower_is_better: !!kr.lower_is_better, owner: kr.owner || '',
            parent_kr_id: kr.parent_kr_id || null,
            aggregation_type: kr.aggregation_type || 'manual',
          }
          let res = await supabase.from('key_results').update(fullPayload).eq('id', kr.id)
          if (res.error && /parent_kr_id|aggregation_type|column/i.test(res.error.message || '')) {
            const { parent_kr_id, aggregation_type, ...legacy } = fullPayload
            await supabase.from('key_results').update(legacy).eq('id', kr.id)
          }
        }
      }

      // 新規KRのみ挿入
      const newKRs = validKRs.filter(k => !k.id || String(k.id).startsWith('_tmp'))
      if (newKRs.length > 0) {
        const krPayloads = newKRs.map(kr => ({
          title: kr.title, target: kr.target, current: kr.current, unit: kr.unit,
          lower_is_better: !!kr.lower_is_better, objective_id: objectiveId, owner: kr.owner || '',
          parent_kr_id: kr.parent_kr_id || null,
          aggregation_type: kr.aggregation_type || 'manual',
        }))
        let krRes = await supabase.from('key_results').insert(krPayloads)
        if (krRes.error && /parent_kr_id|aggregation_type|column/i.test(krRes.error.message || '')) {
          const stripped = krPayloads.map(({ parent_kr_id, aggregation_type, ...rest }) => rest)
          krRes = await supabase.from('key_results').insert(stripped)
        }
        if (krRes.error) { console.error('KR insert error:', krRes.error); alert('KRの保存に失敗しました: ' + krRes.error.message) }
      }
    } else {
      const insertPayload = { title: objToSave.title, owner: objToSave.owner, level_id: objToSave.level_id, period: objToSave.period }
      if (objToSave.parent_objective_id) insertPayload.parent_objective_id = objToSave.parent_objective_id
      if (objToSave.program_tags?.length) insertPayload.program_tags = objToSave.program_tags
      let { data, error } = await supabase
        .from('objectives')
        .insert(insertPayload)
        .select().single()
      if (error && /program_tags|column/i.test(error.message || '')) {
        delete insertPayload.program_tags
        const r = await supabase.from('objectives').insert(insertPayload).select().single()
        data = r.data; error = r.error
      }
      if (error) { console.error('objective insert error:', error); alert('目標の保存に失敗しました: ' + error.message); return }
      objectiveId = data.id
      const validKRs = krs.filter(k => k.title?.trim())
      if (validKRs.length) {
        const krPayloads = validKRs.map(kr => ({
          title: kr.title, target: kr.target, current: kr.current, unit: kr.unit,
          lower_is_better: !!kr.lower_is_better, objective_id: objectiveId, owner: kr.owner || '',
          parent_kr_id: kr.parent_kr_id || null,
          aggregation_type: kr.aggregation_type || 'manual',
        }))
        let krRes = await supabase.from('key_results').insert(krPayloads)
        if (krRes.error && /parent_kr_id|aggregation_type|column/i.test(krRes.error.message || '')) {
          const stripped = krPayloads.map(({ parent_kr_id, aggregation_type, ...rest }) => rest)
          krRes = await supabase.from('key_results').insert(stripped)
        }
        if (krRes.error) { console.error('KR insert error:', krRes.error); alert('KRの保存に失敗しました: ' + krRes.error.message) }
      }
    }
    setActiveLevelId(objToSave.level_id)
    await loadSubtree(objToSave.level_id, activePeriod, levels, fiscalYear)
    setAnnualRefreshKey(k => k + 1)
  }

  const handleDelete = async (objId) => {
    // 1. 対象データのバックアップ (Undo トースト用)
    const { data: obj } = await supabase.from('objectives').select('*').eq('id', objId).single()
    if (!obj) return

    // 2. ソフトデリート: archived_at = NOW() を UPDATE。key_results は触らない
    //    (親 obj が archived だと表示クエリの in 句に乗らないため自動的に隠れる)
    const { error: archErr } = await supabase
      .from('objectives')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', objId)
    if (archErr) {
      // archived_at 列が無い古い環境向けフォールバック: 従来どおり DELETE
      if (/archived_at|column/i.test(archErr.message || '')) {
        const { data: krs } = await supabase.from('key_results').select('*').eq('objective_id', objId)
        await supabase.from('key_results').delete().eq('objective_id', objId)
        await supabase.from('objectives').delete().eq('id', objId)
        await loadSubtree(activeLevelId, activePeriod, levels, fiscalYear)
        setAnnualRefreshKey(k => k + 1)
        if (undoDelete?.timer) clearTimeout(undoDelete.timer)
        const timer = setTimeout(() => setUndoDelete(null), 10000)
        setUndoDelete({ objId, obj, krs: krs || [], timer, hardDelete: true })
        return
      }
      alert('アーカイブに失敗しました: ' + archErr.message)
      return
    }

    // 3. UI 即時更新 (archived 行はクエリで自動的に除外される)
    await loadSubtree(activeLevelId, activePeriod, levels, fiscalYear)
    setAnnualRefreshKey(k => k + 1)

    // 4. 前の Undo タイマをクリア
    if (undoDelete?.timer) clearTimeout(undoDelete.timer)

    // 5. Undo トースト (10 秒)。10 秒経過しても archived_at は残るため
    //    「📦 アーカイブ OKR」画面からいつでも復元可能
    const timer = setTimeout(() => setUndoDelete(null), 10000)
    setUndoDelete({ objId, obj, timer })
  }

  const handleUndoDelete = async () => {
    if (!undoDelete) return
    clearTimeout(undoDelete.timer)
    if (undoDelete.hardDelete) {
      // 旧フォールバック (DELETE) 経路: 従来どおり obj + krs を再 INSERT
      const { obj, krs } = undoDelete
      const { id, ...objData } = obj
      const { data: restored } = await supabase.from('objectives').insert(objData).select().single()
      if (restored && krs?.length) {
        const krPayloads = krs.map(({ id, objective_id, ...kr }) => ({ ...kr, objective_id: restored.id }))
        await supabase.from('key_results').insert(krPayloads)
      }
    } else {
      // 通常: archived_at = null に戻すだけ (KR は触ってないので自動復活)
      await supabase.from('objectives').update({ archived_at: null }).eq('id', undoDelete.objId)
    }
    setUndoDelete(null)
    await loadSubtree(activeLevelId, activePeriod, levels, fiscalYear)
    setAnnualRefreshKey(k => k + 1)
  }

  // アーカイブ済み OKR の復元 (アーカイブ画面の「↩ 復元」ボタンから)
  const handleRestoreArchived = async (objId) => {
    const { error } = await supabase.from('objectives').update({ archived_at: null }).eq('id', objId)
    if (error) { alert('復元に失敗しました: ' + error.message); return }
    await loadSubtree(activeLevelId, activePeriod, levels, fiscalYear)
    setAnnualRefreshKey(k => k + 1)
  }

  // アーカイブ済み OKR の完全削除 (DB から物理 DELETE)。アーカイブ画面のみで実行可能。
  // 紐付く key_results と子 Q 期 objective も明示的に削除する。
  const handlePurgeArchived = async (obj) => {
    if (!obj?.id) return
    const ok = window.confirm(`「${obj.title}」を完全に削除します。\nこの OKR と紐付く KR / 子 Q 期 OKR がすべて DB から消え、復元できなくなります。\n本当に削除しますか？`)
    if (!ok) return
    // 1. 子 Q 期 objective も対象 (同じ annual の親) — 子の KR 含めて削除
    const { data: childObjs } = await supabase.from('objectives').select('id').eq('parent_objective_id', obj.id)
    const allObjIds = [obj.id, ...((childObjs || []).map(o => o.id))]
    // 2. 関連 key_results を全削除
    await supabase.from('key_results').delete().in('objective_id', allObjIds)
    // 3. objectives を削除
    const { error } = await supabase.from('objectives').delete().in('id', allObjIds)
    if (error) { alert('完全削除に失敗しました: ' + error.message); return }
    setAnnualRefreshKey(k => k + 1)
  }

  const handleLinkGoogle = async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) alert('紐づけに失敗しました: ' + error.message)
  }

  const hasGoogle = user?.identities?.some(i => i.provider === 'google')

  const periods = [
    { key: 'q1', label: 'Q1' }, { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' }, { key: 'q4', label: 'Q4' },
    { key: 'annual', label: '通期' },
  ]

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))
  const activeLevel = levels.find(l => Number(l.id) === Number(activeLevelId))

  const subtreeObjs = Object.values(nodeObjectives).flat()
  const allProgs = subtreeObjs.map(o => calcObjProgress(o.key_results))
  const globalAvg = allProgs.length ? Math.round(allProgs.reduce((s, p) => s + p, 0) / allProgs.length) : 0
  const globalR = getRating(globalAvg)

  function LevelItem({ level, depth = 0 }) {
    const active = activeLevelId === level.id
    const children = getChildren(level.id)
    const absD = getAbsoluteDepth(level.id, levels)
    const col = getLayerColor(absD)
    return (
      <>
        <div onClick={() => { setActiveLevelId(level.id); setShowSidebar(false) }} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: `7px 10px 7px ${10 + depth * 14}px`,
          borderRadius: 7, marginBottom: 2, cursor: 'pointer',
          background: active ? `${col}18` : 'transparent',
          border: active ? `1px solid ${col}35` : '1px solid transparent',
          transition: 'all 0.15s',
        }}>
          <span style={{ fontSize: 17 }}>{level.icon}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 600 : 400, color: active ? '#e8eaf0' : T.textSub }}>{level.name}</span>
        </div>
        {children.map(c => <LevelItem key={c.id} level={c} depth={depth + 1} />)}
      </>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent, fontSize: 14 }}>
      読み込み中...
    </div>
  )

  function SidebarContent() {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 8 }}>
          <span style={{ fontSize: 12, color: getT().textFaint, letterSpacing: '0.15em', textTransform: 'uppercase' }}>組織階層</span>
          {isMobile && <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: getT().textMuted, cursor: 'pointer', fontSize: 16 }}>✕</button>}
        </div>
        {roots.map(l => <LevelItem key={l.id} level={l} />)}
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: getT().textFaint, textTransform: 'uppercase', marginBottom: 8 }}>評価基準</div>
          {[...RATINGS].reverse().filter(r => r.score > 0).map(r => (
            <div key={r.score} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px', marginBottom: 2 }}>
              <Stars score={r.score} size={9} />
              <span style={{ fontSize: 12, color: r.color, flex: 1 }}>{r.label}</span>
              <span style={{ fontSize: 11, color: getT().textFaint }}>{r.min}%+</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, color: getT().textMuted, marginBottom: 8 }}>{user.email}</div>
          {!hasGoogle && (
            <button onClick={handleLinkGoogle} style={{
              background: 'rgba(255,255,255,0.9)', border: 'none',
              color: '#333', borderRadius: 8, padding: '8px 14px', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600,
            }}>
              <svg width="14" height="14" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Googleと紐づける
            </button>
          )}
          {hasGoogle && (
            <div style={{ fontSize: 11, color: T.accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>✅ Google連携済み</div>
          )}
          <button onClick={onSignOut} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: getT().textSub, borderRadius: 8, padding: '8px 14px', fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit', width: '100%',
          }}>ログアウト</button>
        </div>
      </>
    )
  }

  return (
    <div style={{ height: '100vh', background: T.bg, color: T.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100vw', overflow: 'hidden' }}>
      {/* Demo モードバナー */}
      <DemoBanner />
      <OrgSwitcherTopBar />
      {/* Header (スマホでは非表示 - MyPageShell の下メニューでナビゲート) */}
      <div style={{ display: isMobile ? 'none' : 'block', borderBottom: `1px solid ${T.border}`, background: T.headerBg, position: 'sticky', top: 0, zIndex: 50, overflow: 'visible' }}>
        {/* 1行目 */}
        <div style={{ padding: isMobile ? '8px 12px' : '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0, overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowSidebar(p => !p)} style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: getT().textSub, width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>☰</button>
            {!isMobile && (
              <div>
                <div style={{ fontSize: 10, color: T.accent, letterSpacing: '0.18em', textTransform: 'uppercase' }}>NEO Management</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>NEO 運営DB</div>
              </div>
            )}
          </div>

          {/* ページナビ */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.border}`, flexShrink: 0, overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {/* ホーム */}
            <button onClick={() => setActivePage('portal')} style={{ padding: isMobile ? '5px 8px' : '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: activePage === 'portal' ? T.navActiveBg : 'transparent', color: activePage === 'portal' ? T.navActiveText : T.textSub, fontSize: isMobile ? 11 : 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>🏠 ホーム</button>
            {/* ワークスペース (旧マイページ) */}
            <button onClick={() => setActivePage('mycoach')} style={{ padding: isMobile ? '5px 8px' : '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: activePage === 'mycoach' ? T.navActiveBg : 'transparent', color: activePage === 'mycoach' ? T.navActiveText : T.textSub, fontSize: isMobile ? 11 : 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>ワークスペース</button>
            {/* OKR (詳細のみ) */}
            <button onClick={() => setActivePage('okr')} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: activePage === 'okr' ? T.navActiveBg : 'transparent', color: activePage === 'okr' ? T.navActiveText : T.textSub, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>OKR</button>
            {/* 週次MTG */}
            <button onClick={() => setActivePage('weekly')} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: activePage === 'weekly' ? T.navActiveBg : 'transparent', color: activePage === 'weekly' ? T.navActiveText : T.textSub, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>週次MTG</button>
            {/* 朝会 */}
            <button onClick={() => setActivePage('morning')} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: activePage === 'morning' ? T.navActiveBg : 'transparent', color: activePage === 'morning' ? T.navActiveText : T.textSub, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>🌅 朝会</button>
            {/* 組織 */}
            <button onClick={() => setActivePage('orgjd')} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: activePage === 'orgjd' ? T.navActiveBg : 'transparent', color: activePage === 'orgjd' ? T.navActiveText : T.textSub, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>組織</button>
          </div>

          {/* 年度切り替え */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.border}`, flexShrink: 0 }}>
            {['2025', '2026'].map(yr => (
              <button key={yr} onClick={() => setFiscalYear(yr)} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: fiscalYear === yr ? T.accentSolid : 'transparent', color: fiscalYear === yr ? '#fff' : T.textMuted, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s' }}>{yr}年度</button>
            ))}
          </div>

          {/* 右側 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={() => setThemeKey(k => k === 'dark' ? 'light' : 'dark')} style={{ background: T.bgCard, border: `1px solid ${T.borderMid}`, color: T.textSub, borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{themeKey === 'dark' ? '☀️' : '🌙'}</button>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700, cursor: 'default', background: syncStatus === 'synced' ? T.syncBadgeBg : syncStatus === 'error' ? T.warnBg : 'rgba(180,83,9,0.1)', color: syncStatus === 'synced' ? T.syncBadgeText : syncStatus === 'error' ? T.warn : T.warn, border: `1px solid ${syncStatus === 'synced' ? T.syncBadgeBorder : syncStatus === 'error' ? T.warnBg : 'rgba(180,83,9,0.25)'}` }}>
              {syncStatus === 'synced' ? '🟢' : syncStatus === 'error' ? '🔴' : '🟡'}
            </span>
            {/* ユーザーメニュー */}
            <div style={{ position: 'relative' }} onMouseEnter={e => e.currentTarget.querySelector('.user-dropdown').style.display='block'} onMouseLeave={e => e.currentTarget.querySelector('.user-dropdown').style.display='none'}>
              <button style={{ background: T.bgCard, border: `1px solid ${T.borderMid}`, color: T.textSub, borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                👤 <span style={{ fontSize: 11 }}>▾</span>
              </button>
              <div className="user-dropdown" style={{ display: 'none', position: 'absolute', top: '100%', right: 0, zIndex: 200, background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: 4, minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                <div style={{ padding: '8px 12px', fontSize: 12, color: T.textMuted, borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>{user.email}</div>
                <button onClick={() => setActivePage('bulk')} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: T.text, fontSize: 12, fontFamily: 'inherit' }}>一括登録</button>
                <button onClick={() => setActivePage('csv')} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: T.text, fontSize: 12, fontFamily: 'inherit' }}>CSV登録</button>
                {hasGoogle
                  ? <div style={{ padding: '7px 12px', fontSize: 11, color: T.accent }}>✅ Google連携済み</div>
                  : <button onClick={handleLinkGoogle} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: T.text, fontSize: 12, fontFamily: 'inherit' }}>Google連携</button>
                }
                <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
                <button onClick={onSignOut} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: T.warn, fontSize: 12, fontFamily: 'inherit' }}>ログアウト</button>
              </div>
            </div>
            <button onClick={() => setShowAI(p => !p)} style={{ background: T.textMuted, border: 'none', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>🤖</button>
          </div>
        </div>

        {/* 2行目：OKRページのみ（ビュー切替・期間フィルタ + OKR追加） */}
        {activePage === 'okr' && (
          <div style={{ padding: '5px 20px', display: 'flex', alignItems: 'center', gap: 6, borderTop: `1px solid ${T.border}`, background: T.headerBg }}>
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.border}` }}>
              {[{key:'annual',label:'📅 年間'},{key:'owner',label:'👤 担当'}].map(v => (
                <button key={v.key} onClick={() => setViewMode(v.key)} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: viewMode === v.key ? T.navActiveBg : 'transparent', color: viewMode === v.key ? T.navActiveText : T.textMuted, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s' }}>{v.label}</button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {canEditOKR && (
              <>
                <button onClick={() => setShowArchive(p => !p)}
                  title={showArchive ? '通常のOKR画面に戻る' : 'アーカイブされたOKRを一覧表示'}
                  style={{
                    background: showArchive ? T.accentSolid : 'transparent',
                    border: `1px solid ${showArchive ? T.accentSolid : T.border}`,
                    color: showArchive ? '#fff' : T.textSub,
                    borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>
                  {showArchive ? '← 戻る' : '📦 アーカイブ OKR'}
                </button>
                <button onClick={() => setModal({ type: 'add', obj: { period: 'annual' } })} style={{ background: T.accentSolid, border: 'none', color: '#fff', borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  ＋ OKR を追加
                </button>
              </>
            )}
            {!canEditOKR && (
              <span style={{ fontSize: 11, color: T.textMuted }} title="OKR / KR の編集には組織の admin / owner ロールが必要です">
                👁 閲覧のみ
              </span>
            )}
          </div>
        )}
      </div>

      {/* ─── ページ切替 ─── */}
      {activePage === 'portal' && <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}><PortalPage user={user} onNavigate={setActivePage} themeKey={themeKey} members={members} T={T} /></div>}
      {activePage === 'bulk' && <BulkRegisterPage levels={levels} themeKey={themeKey} fiscalYear={fiscalYear} />}
      {activePage === 'weekly' && <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}><WeeklyMTGPage levels={levels} themeKey={themeKey} fiscalYear={fiscalYear} user={user} initialPeriod={activePeriod} /></div>}
      {activePage === 'morning' && <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}><MorningMeetingPage user={user} members={members} themeKey={themeKey} /></div>}
      {activePage === 'csv' && <div style={{ flex: 1, overflowY: 'auto' }}><CsvPage levels={levels} fiscalYear={fiscalYear} /></div>}
      {activePage === 'myokr' && <div style={{ flex: 1, overflow: 'hidden', display:'flex' }}><MyOKRPageNew user={user} levels={levels} members={members} themeKey={themeKey} fiscalYear={fiscalYear} onAIFeedback={(msg) => { setInitialAIMessage(msg); setShowAI(true) }} /></div>}
      {activePage === 'mytasks' && <div style={{ flex: 1, overflow: 'hidden', display:'flex' }}><MyTasksPage user={user} members={members} themeKey={themeKey} initialViewMode={taskViewMode} onViewModeChange={setTaskViewMode} /></div>}
      {activePage === 'mycoach' && <div style={{ flex: 1, overflow: 'hidden', display:'flex' }}><MyPageShell user={user} members={members} levels={levels} themeKey={themeKey} fiscalYear={fiscalYear} onAIFeedback={(msg) => { setInitialAIMessage(msg); setShowAI(true) }} /></div>}
      {activePage === 'summary' && <div style={{ flex: 1, overflowY: 'auto' }}><CompanySummaryPage levels={levels} members={members} themeKey={themeKey} fiscalYear={fiscalYear} /></div>}
      {activePage === 'milestone' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <MilestonePage levels={levels} themeKey={themeKey} fiscalYear={fiscalYear} user={user} members={members} onLevelsChanged={async () => {
            const orgId = currentOrg?.id
            const q = supabase.from('levels').select('*').order('id')
            const { data: lvls } = orgId ? await q.eq('organization_id', orgId) : await q
            const validLvls = (lvls || []).filter(l => l.fiscal_year === fiscalYear)
            setLevels(validLvls.length ? validLvls : [])
          }} />
        </div>
      )}
      {activePage === 'orgjd' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <OrgPage themeKey={themeKey} user={user} fiscalYear={fiscalYear} />
        </div>
      )}

      {/* Archive View (📦 アーカイブ OKR ボタンで切替) */}
      <div style={{ display: activePage === 'okr' && showArchive ? 'flex' : 'none', flex: 1, overflow: 'auto', flexDirection: 'column' }}>
        <ArchivedOKRPanel T={T} levels={levels} members={members} fiscalYear={fiscalYear}
          onRestore={handleRestoreArchived} onPurge={handlePurgeArchived} refreshKey={annualRefreshKey} />
      </div>
      {/* Annual View */}
      <div style={{ display: activePage === 'okr' && viewMode === 'annual' && !showArchive ? 'flex' : 'none', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isMobile && showSidebar && (
          <div onClick={() => setShowSidebar(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 299 }} />
        )}
        <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${T.border}`, padding: '16px 10px', background: T.bgSidebar, overflowY: 'auto', ...(isMobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300, transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease', boxShadow: 'none' } : {}) }}>
          <SidebarContent />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AnnualView
            levels={levels}
            members={members}
            refreshKey={annualRefreshKey}
            fiscalYear={fiscalYear}
            themeKey={themeKey}
            activeLevelId={activeLevelId}
            canEditOKR={canEditOKR}
            onAddObjective={canEditOKR ? ({ parentObjectiveId, period, level_id }) => {
              setModal({ type: 'add', obj: { parent_objective_id: parentObjectiveId, period, level_id } })
            } : null}
            onEdit={canEditOKR ? (obj => setModal({ type: 'edit', obj })) : null}
            onDelete={canEditOKR ? handleDelete : null}
          />
        </div>
      </div>
      {/* Owner View */}
      <div style={{ display: activePage === 'okr' && viewMode === 'owner' && !showArchive ? 'flex' : 'none', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isMobile && showSidebar && (
          <div onClick={() => setShowSidebar(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 299 }} />
        )}
        <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${T.border}`, padding: '16px 10px', background: T.bgSidebar, overflowY: 'auto', ...(isMobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300, transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease', boxShadow: 'none' } : {}) }}>
          <div style={{ fontSize: 10, color: getT().textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>メンバー</div>
          {members.map(m => {
            const active = selectedOwner === m.name
            const c = ['#5A8A7A','#E8875A','#6B8DB5','#B07D9E','#C4956A','#5B9EA6','#8B7EC8','#D4816B']
            const color = c[Math.abs([...m.name].reduce((h, ch) => ch.charCodeAt(0) + ((h << 5) - h), 0)) % c.length]
            return (
              <div key={m.id} onClick={() => { setSelectedOwner(m.name); setShowSidebar(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: active ? T.navActiveBg : 'transparent', border: active ? `1px solid ${T.navActiveBorder}` : '1px solid transparent', transition: 'all 0.15s' }}>
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt={m.name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${color}20`, border: `1.5px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>{m.name.slice(0, 2)}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? T.navActiveText : getT().text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  {m.role && <div style={{ fontSize: 9, color: getT().textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.role}</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <OwnerOKRView
            ownerName={selectedOwner}
            levels={levels}
            fiscalYear={fiscalYear}
            themeKey={themeKey}
            onEdit={canEditOKR ? (obj => setModal({ type: 'edit', obj })) : null}
            onDelete={canEditOKR ? handleDelete : null}
            refreshKey={annualRefreshKey}
          />
        </div>
      </div>

      {showAI && (
        <AIPanel
          onClose={() => { setShowAI(false); setInitialAIMessage(null) }}
          okrContext={{ levels, objectives: subtreeObjs, activePeriod }}
          initialMessage={initialAIMessage}
        />
      )}
      {modal && (
        <Modal title={modal.type === 'add' ? '目標を追加' : '目標を編集'} onClose={() => setModal(null)}>
          <ObjForm
            initial={modal.obj}
            onSave={handleSave}
            onClose={() => setModal(null)}
            levels={levels}
            activeLevelId={modal.obj?.level_id || activeLevelId}
            activePeriod={modal.obj?.period || activePeriod}
            fiscalYear={fiscalYear}
            members={members}
          />
        </Modal>
      )}
      {undoDelete && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: T.text, minWidth: 300 }}>
          <span style={{ flex: 1 }}>「{undoDelete.obj.title?.slice(0, 20)}{undoDelete.obj.title?.length > 20 ? '…' : ''}」を{undoDelete.hardDelete ? '削除' : 'アーカイブ'}しました</span>
          <button onClick={handleUndoDelete} style={{ background: T.accentSolid, border: 'none', color: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>元に戻す</button>
          <button onClick={() => { clearTimeout(undoDelete.timer); setUndoDelete(null) }} style={{ background: 'transparent', border: 'none', color: T.textMuted, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </div>
      )}
    </div>
  )
}

// ─── Demo モードバナー ──────────────────────────────────────
import OrgSettingsPanel from './OrgSettingsPanel'
function DemoBanner() {
  const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  if (!DEMO_MODE) return null
  return (
    <div style={{
      background: 'linear-gradient(90deg, #ec4899 0%, #f97316 50%, #facc15 100%)',
      color: '#1f2937',
      padding: '6px 16px',
      fontSize: 12, fontWeight: 800, fontFamily: '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderBottom: '1px solid rgba(0,0,0,0.1)',
    }}>
      <span>🎭 デモモード — どなたでも自由に編集できます (週次リセット)</span>
      <span style={{ opacity: 0.7, fontSize: 11 }}>※ Google連携・Slack通知などは実際には送信されません</span>
    </div>
  )
}

// ─── 組織切替バー (組織設定ボタン付き) ─
function OrgSwitcherTopBar() {
  const { currentOrg, orgs, switchOrg, loading } = useCurrentOrg()
  const [settingsOpen, setSettingsOpen] = useState(false)
  if (loading) return null
  if (!currentOrg) return null
  // 1組織のみ所属でも、組織設定ボタンを表示する
  return (
    <>
      <div style={{
        padding: '4px 16px', background: 'rgba(0,0,0,0.04)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
      }}>
        <span style={{ color: '#666' }}>🏢 組織:</span>
        {orgs.length > 1 ? (
          <select value={currentOrg?.slug || ''} onChange={e => switchOrg(e.target.value)} style={{
            padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
            background: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          }}>
            {orgs.map(o => <option key={o.slug} value={o.slug}>{o.name} ({o.role})</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#333' }}>{currentOrg.name} ({currentOrg.role})</span>
        )}
        <button onClick={() => setSettingsOpen(true)} title="組織設定" style={{
          padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
          background: 'transparent', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>⚙️ 設定</button>
      </div>
      {settingsOpen && <OrgSettingsPanelWrapper onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

function OrgSettingsPanelWrapper({ onClose }) {
  const T = COMMON_TOKENS.dark
  const [user, setUser] = useState(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null))
  }, [])
  return <OrgSettingsPanel T={{ ...T, accentBg: 'rgba(10,132,255,0.16)', warnBg: 'rgba(255,159,10,0.16)', sectionBg: 'rgba(255,255,255,0.04)' }} myEmail={user?.email} onClose={onClose} />
}
