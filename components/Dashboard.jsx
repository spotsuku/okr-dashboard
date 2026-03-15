'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import AIPanel from './AIPanel'
import MemberPage from './MemberPage'
import CsvPage from './CsvPage'
import AnnualView from './AnnualView'
import WeeklyMTGPage from './WeeklyMTGPage'
import MyOKRPageNew from './MyOKRPage'

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:          '#090d18',
    bgCard:      '#0e1420',
    bgCard2:     '#111828',
    bgSidebar:   '#0e1420',
    border:      'rgba(255,255,255,0.07)',
    borderLight: 'rgba(255,255,255,0.04)',
    borderMid:   'rgba(255,255,255,0.1)',
    text:        '#e8eaf0',
    textSub:     '#a0a8be',
    textMuted:   '#606880',
    textFaint:   '#404660',
    textFaintest:'#303450',
    headerBg:    '#090d18',
    connector:   'rgba(255,255,255,0.12)',
    connectorArrow: 'rgba(255,255,255,0.2)',
  },
  light: {
    bg:          '#f0f2f7',
    bgCard:      '#ffffff',
    bgCard2:     '#f7f8fc',
    bgSidebar:   '#ffffff',
    border:      'rgba(0,0,0,0.08)',
    borderLight: 'rgba(0,0,0,0.05)',
    borderMid:   'rgba(0,0,0,0.12)',
    text:        '#1a1f36',
    textSub:     '#4a5270',
    textMuted:   '#7080a0',
    textFaint:   '#90a0bc',
    textFaintest:'#b0bcd0',
    headerBg:    '#ffffff',
    connector:   'rgba(0,0,0,0.15)',
    connectorArrow: 'rgba(0,0,0,0.2)',
  },
}

// グローバルテーマ参照（コンポーネント間で共有）
let _T = THEMES.dark
const getT = () => _T

// ─── Rating helpers ────────────────────────────────────────────────────────────
const RATINGS = [
  { min: 150, score: 5, label: '奇跡',    color: '#ff9f43' },
  { min: 120, score: 4, label: '変革',    color: '#a855f7' },
  { min: 100, score: 3, label: '順調以上', color: '#00d68f' },
  { min:  80, score: 2, label: '順調',    color: '#4d9fff' },
  { min:  60, score: 1, label: '最低限',  color: '#ffd166' },
  { min:   0, score: 0, label: '未達',    color: '#ff6b6b' },
]
const getRating = pct => RATINGS.find(r => Math.min(pct, 150) >= r.min) || RATINGS[RATINGS.length - 1]

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

// 絶対レイヤー深度（経営=0, 事業部=1, チーム=2）
function getAbsoluteDepth(levelId, levels) {
  let depth = 0
  let cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) {
    depth++
    cur = levels.find(l => Number(l.id) === Number(cur.parent_id))
  }
  return depth
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }
const getLayerColor = absDepth => LAYER_COLORS[absDepth] || '#a0a8be'
const getLayerLabel = absDepth => LAYER_LABELS[absDepth] || ''

// アバター：名前から頭文字2文字を生成
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

// ─── Small UI components ───────────────────────────────────────────────────────
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
    <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: `${marker}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)', zIndex: 2 }} />
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)', boxShadow: `0 0 6px ${color}80` }} />
    </div>
  )
}

function Ring({ value, color, size = 46 }) {
  const s = 3.5, r = (size - s * 2) / 2, c = 2 * Math.PI * r
  const offset = c - (Math.min(value, 100) / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={s} />
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
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#141926', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
        padding: 26, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 28px 80px rgba(0,0,0,0.65)',
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
          borderRadius: 8, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none',
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
        width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none',
        fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer',
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Btn({ children, onClick, color = '#4d9fff', variant = 'filled', small, danger, disabled }) {
  const bg = danger ? '#ff6b6b' : color
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: variant === 'filled' ? bg : 'transparent',
      border: `1px solid ${variant === 'ghost' ? 'rgba(255,255,255,0.1)' : bg}`,
      color: variant === 'filled' ? '#fff' : (danger ? '#ff6b6b' : '#a0a8be'),
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
  const [levelId, setLevelId] = useState(String(activeLevelId || levels[0]?.id))
  const [period, setPeriod]   = useState(activePeriod)
  const [krs, setKRs] = useState(
    initial?.key_results?.length
      ? initial.key_results.map(k => ({ ...k, target: String(k.target), current: String(k.current) }))
      : [{ _tmpId: Date.now(), title: '', target: '', current: '', unit: '', lower_is_better: false }]
  )
  const [saving, setSaving] = useState(false)

  const addKR    = () => setKRs(p => [...p, { _tmpId: Date.now(), title: '', target: '', current: '', unit: '', lower_is_better: false }])
  const removeKR = key => setKRs(p => p.filter(k => (k.id || k._tmpId) !== key))
  const updateKR = (key, field, val) => setKRs(p => p.map(k => (k.id || k._tmpId) === key ? { ...k, [field]: val } : k))

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave({
      obj: { id: initial?.id, title, owner, level_id: parseInt(levelId), period },
      krs: krs.map(k => ({ ...k, target: parseFloat(k.target) || 0, current: parseFloat(k.current) || 0 })),
    })
    setSaving(false)
    onClose()
  }

  const periodOpts = [
    { value: 'annual', label: '通期' },
    { value: 'q1', label: 'Q1' }, { value: 'q2', label: 'Q2' },
    { value: 'q3', label: 'Q3' }, { value: 'q4', label: 'Q4' },
  ]

  return (
    <>
      {/* 年度表示バッジ */}
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>年度</div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: fiscalYear === '2026' ? 'rgba(77,159,255,0.15)' : 'rgba(255,159,67,0.15)',
          border: `1px solid ${fiscalYear === '2026' ? 'rgba(77,159,255,0.4)' : 'rgba(255,159,67,0.4)'}`,
          borderRadius: 8, padding: '6px 12px',
          color: fiscalYear === '2026' ? '#4d9fff' : '#ff9f43',
          fontSize: 13, fontWeight: 700,
        }}>
          📅 {fiscalYear}年度
        </div>
      </div>
      <FSelect label="所属レベル" value={levelId} onChange={setLevelId}
        options={levels.map(l => ({ value: String(l.id), label: `${l.icon} ${l.name}` }))} />
      <FSelect label="期間" value={period} onChange={setPeriod} options={periodOpts} />
      <FInput label="目標タイトル" value={title} onChange={setTitle} placeholder="例: 市場シェアを拡大する" />
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 5 }}>オーナー</div>
        <select value={owner} onChange={e => setOwner(e.target.value)} style={{
          width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '9px 12px', color: owner ? '#e8eaf0' : '#505878', fontSize: 13,
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer',
        }}>
          <option value="">-- 未設定 --</option>
          {(members || []).map(m => <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 8, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Key Results</div>
      {krs.map((kr, i) => {
        const key = kr.id || kr._tmpId
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: getT().textSub }}>
              <input type="checkbox" checked={!!kr.lower_is_better} onChange={e => updateKR(key, 'lower_is_better', e.target.checked)} />
              低い方が良い指標（チャーン率・バグ数など）
            </label>
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

// ─── KA Section ───────────────────────────────────────────────────────────────
function KASection({ krId }) {
  const [kas, setKAs] = useState([])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('all')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState('normal')
  const [loading, setLoading] = useState(false)

  const weekStart = (() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const mon = new Date(d.setDate(diff))
    return mon.toISOString().split('T')[0]
  })()

  useEffect(() => {
    if (!open) return
    load()
  }, [open, krId])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('key_actions')
      .select('*')
      .eq('key_result_id', krId)
      .eq('week_start', weekStart)
      .order('id')
    setKAs(data || [])
    setLoading(false)
  }

  const addKA = async () => {
    if (!newTitle.trim()) return
    const { data } = await supabase.from('key_actions')
      .insert([{ key_result_id: krId, title: newTitle.trim(), type: newType, week_start: weekStart }])
      .select().single()
    if (data) { setKAs(p => [...p, data]); setNewTitle(''); setAdding(false) }
  }

  const deleteKA = async (id) => {
    await supabase.from('key_actions').delete().eq('id', id)
    setKAs(p => p.filter(k => k.id !== id))
  }

  const updateType = async (id, type) => {
    await supabase.from('key_actions').update({ type }).eq('id', id)
    setKAs(p => p.map(k => k.id === id ? { ...k, type } : k))
  }

  const TYPE_CONFIG = {
    normal: { label: '未分類', color: '#606880', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
    focus:  { label: '🎯 今週注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.1)', border: 'rgba(77,159,255,0.25)' },
    good:   { label: '✅ Good',    color: '#00d68f', bg: 'rgba(0,214,143,0.08)', border: 'rgba(0,214,143,0.2)' },
    more:   { label: '🔺 More',   color: '#ff6b6b', bg: 'rgba(255,107,107,0.08)', border: 'rgba(255,107,107,0.2)' },
  }

  const filtered = tab === 'all' ? kas : kas.filter(k => k.type === tab)
  const focusCount = kas.filter(k => k.type === 'focus').length

  return (
    <div style={{ marginLeft: 50, marginTop: 6, marginBottom: 8 }}>
      <div
        onClick={() => setOpen(p => !p)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginBottom: open ? 8 : 0 }}
      >
        <span style={{ fontSize: 10, color: '#4d9fff', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
        <span style={{ fontSize: 11, color: '#4d9fff' }}>{open ? 'KA を閉じる' : 'KA を表示'}</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(77,159,255,0.15)', color: '#4d9fff' }}>
          {open ? kas.length : ''}
        </span>
        {!open && focusCount > 0 && (
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'rgba(77,159,255,0.15)', color: '#4d9fff', fontWeight: 700 }}>🎯 {focusCount}</span>
        )}
      </div>

      {open && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(77,159,255,0.06)', border: '1px solid rgba(77,159,255,0.15)', borderRadius: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11 }}>📅</span>
            <span style={{ fontSize: 11, color: '#4d9fff', fontWeight: 600 }}>今週のKA</span>
            <span style={{ fontSize: 10, color: getT().textMuted, marginLeft: 'auto' }}>{weekStart}</span>
          </div>

          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {[['all','すべて'],['focus','🎯 注力'],['good','✅ Good'],['more','🔺 More']].map(([key, lbl]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                background: tab === key ? (key === 'all' ? 'rgba(255,255,255,0.12)' : `${TYPE_CONFIG[key]?.bg || 'rgba(255,255,255,0.1)'}`) : 'transparent',
                border: `1px solid ${tab === key ? (key === 'all' ? 'rgba(255,255,255,0.25)' : TYPE_CONFIG[key]?.border || 'rgba(255,255,255,0.2)') : 'rgba(255,255,255,0.1)'}`,
                color: tab === key ? (key === 'all' ? '#e8eaf0' : TYPE_CONFIG[key]?.color) : getT().textMuted,
              }}>{lbl}</button>
            ))}
          </div>

          {loading && <div style={{ fontSize: 11, color: getT().textMuted, padding: '4px 0' }}>読み込み中...</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
            {filtered.map(ka => (
              <div key={ka.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 10px', borderRadius: 7, background: TYPE_CONFIG[ka.type]?.bg, border: `1px solid ${TYPE_CONFIG[ka.type]?.border}` }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_CONFIG[ka.type]?.color, flexShrink: 0, marginTop: 5 }} />
                <span style={{ flex: 1, fontSize: 12, color: getT().textSub, lineHeight: 1.4 }}>{ka.title}</span>
                <select value={ka.type} onChange={e => updateType(ka.id, e.target.value)} onClick={e => e.stopPropagation()} style={{
                  fontSize: 9, background: 'transparent', border: 'none', color: TYPE_CONFIG[ka.type]?.color,
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0, outline: 'none',
                }}>
                  <option value="normal">未分類</option>
                  <option value="focus">🎯 注力</option>
                  <option value="good">✅ Good</option>
                  <option value="more">🔺 More</option>
                </select>
                <button onClick={() => deleteKA(ka.id)} style={{ background: 'none', border: 'none', color: getT().textFaint, cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}>✕</button>
              </div>
            ))}
            {filtered.length === 0 && !loading && (
              <div style={{ fontSize: 11, color: getT().textFaintest, fontStyle: 'italic', padding: '2px 0' }}>KAがありません</div>
            )}
          </div>

          {adding ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addKA(); if (e.key === 'Escape') setAdding(false) }}
                placeholder="KAを入力してEnter"
                style={{ flex: 1, background: getT().bgCard, border: `1px solid ${getT().borderMid}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, color: getT().text, outline: 'none', fontFamily: 'inherit' }}
              />
              <select value={newType} onChange={e => setNewType(e.target.value)} style={{ fontSize: 11, background: getT().bgCard, border: `1px solid ${getT().borderMid}`, borderRadius: 6, padding: '5px 6px', color: getT().text, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
                <option value="normal">未分類</option>
                <option value="focus">🎯 注力</option>
                <option value="good">✅ Good</option>
                <option value="more">🔺 More</option>
              </select>
              <button onClick={addKA} style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>追加</button>
              <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', color: getT().textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4d9fff', background: 'rgba(77,159,255,0.08)', border: '1px dashed rgba(77,159,255,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ＋ KAを追加
            </button>
          )}
        </>
      )}
    </div>
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
            <button onClick={e => { e.stopPropagation(); onDelete(obj.id) }} style={{
              background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b',
              width: 24, height: 24, borderRadius: 5, cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
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
                        <span style={{ fontSize: 13, color: getT().textSub, lineHeight: 1.35 }}>{kr.title}</span>
                        <span style={{ fontSize: 11, color: getT().textMuted, flexShrink: 0 }}>
                          {kr.current}{kr.unit} / {kr.target}{kr.unit}
                          {kr.lower_is_better && <span style={{ color: getT().textFaint, marginLeft: 4 }}>↓良</span>}
                        </span>
                      </div>
                      <Bar value={kprog} color={kr_rating.color} />
                    </div>
                  </div>
                  <KASection krId={kr.id} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Level Column（横並びの1列） ──────────────────────────────────────────────
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
  const dragRef = useRef(null)
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

        <div
          onMouseDown={onMouseDownResize}
          style={{
            position: 'absolute', top: 0, right: -4, width: 8, height: '100%',
            cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 3, height: 40, borderRadius: 2,
            background: `${layerColor}60`,
            opacity: 0.4,
            transition: 'opacity 0.15s',
          }}
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

// ─── Node Block ──────────────────────────────────────────────────────────────
function NodeBlock({ levelId, levels, nodeObjectives, onEdit, onDelete, _depth = 0 }) {
  if (_depth > 5) return null
  const children = levels.filter(l => Number(l.parent_id) === Number(levelId))
  const hasChildren = children.length > 0

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      <LevelColumn
        levelId={levelId}
        levels={levels}
        nodeObjectives={nodeObjectives}
        onEdit={onEdit}
        onDelete={onDelete}
        isLast={!hasChildren}
      />

      {hasChildren && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 22, flexShrink: 0, width: 36 }}>
            <div style={{ flex: 1, height: 2, background: getT().connector }} />
            <div style={{ fontSize: 18, color: getT().connectorArrow, lineHeight: 1, marginTop: 1 }}>›</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {children.map(child => (
              <NodeBlock
                key={child.id}
                levelId={child.id}
                levels={levels}
                nodeObjectives={nodeObjectives}
                onEdit={onEdit}
                onDelete={onDelete}
                _depth={_depth + 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Org Modal ────────────────────────────────────────────────────────────────
function OrgModal({ levels, onClose, onAdd, onDelete }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('👥')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === id)

  const addableParents = levels.filter(l => {
    const depth = (() => {
      let d = 0, cur = l
      while (cur && cur.parent_id) { d++; cur = levels.find(x => x.id === cur.parent_id) }
      return d
    })()
    return depth < 2
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

  function LevelRow({ level, depth = 0 }) {
    const children = getChildren(level.id)
    const absD = (() => { let d=0,cur=level; while(cur&&cur.parent_id){d++;cur=levels.find(x=>x.id===cur.parent_id)} return d })()
    const col = { 0:'#ff6b6b', 1:'#4d9fff', 2:'#00d68f' }[absD] || '#a0a8be'
    const lbl = { 0:'経営', 1:'事業部', 2:'チーム' }[absD] || ''
    const isRoot = absD === 0
    return (
      <>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:`8px 10px 8px ${10+depth*16}px`, borderRadius:7, marginBottom:3, background:'rgba(255,255,255,0.03)', border:`1px solid ${getT().border}` }}>
          <span style={{ fontSize:13 }}>{level.icon}</span>
          <span style={{ flex:1, fontSize:12, fontWeight:500, color:getT().text }}>{level.name}</span>
          <span style={{ fontSize:9, padding:'2px 6px', borderRadius:99, background:`${col}18`, color:col, fontWeight:700 }}>{lbl}</span>
          {!isRoot && (
            <button onClick={() => confirmDelete(level)} disabled={deleting === level.id} style={{
              background:'rgba(255,107,107,0.1)', border:'1px solid rgba(255,107,107,0.25)', color:'#ff6b6b',
              borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit',
              opacity: deleting === level.id ? 0.5 : 1,
            }}>{deleting === level.id ? '削除中' : '削除'}</button>
          )}
        </div>
        {children.map(c => <LevelRow key={c.id} level={c} depth={depth+1} />)}
      </>
    )
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,0.78)', backdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:'#141926', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16,
        padding:26, width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto',
        boxShadow:'0 28px 80px rgba(0,0,0,0.65)',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>🏗️ 組織を管理</h3>
          <button onClick={onClose} style={{ background:getT().border, border:'none', color:'#a0a8be', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10, color:'#606880', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>現在の組織</div>
          {roots.map(l => <LevelRow key={l.id} level={l} />)}
        </div>

        <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:18 }}>
          <div style={{ fontSize:10, color:'#606880', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>新しい組織を追加</div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'#606880', marginBottom:5 }}>親組織</div>
            <select value={parentId} onChange={e => setParentId(e.target.value)} style={{
              width:'100%', background:'#1a2030', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:8, padding:'9px 12px', color: parentId ? '#e8eaf0' : '#606880', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', cursor:'pointer',
            }}>
              <option value=''>選択してください</option>
              {addableParents.map(l => {
                const d = (() => { let dep=0,cur=l; while(cur&&cur.parent_id){dep++;cur=levels.find(x=>x.id===cur.parent_id)} return dep })()
                const label = d===0 ? '事業部として追加' : 'チームとして追加'
                return <option key={l.id} value={l.id}>{l.icon} {l.name}の下に（{label}）</option>
              })}
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'#606880', marginBottom:5 }}>組織名</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="例: 西日本営業チーム"
              style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'9px 12px', color:'#e8eaf0', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:'#606880', marginBottom:8 }}>アイコン</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {ICONS.map(ic => (
                <button key={ic} onClick={() => setIcon(ic)} style={{
                  width:34, height:34, borderRadius:7, border:`1px solid ${icon===ic ? '#4d9fff' : 'rgba(255,255,255,0.1)'}`,
                  background: icon===ic ? 'rgba(77,159,255,0.15)' : 'rgba(255,255,255,0.04)',
                  cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center',
                }}>{ic}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button onClick={onClose} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'#a0a8be', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={save} disabled={saving || !name.trim() || !parentId} style={{
              background: (!name.trim() || !parentId) ? 'rgba(77,159,255,0.3)' : '#4d9fff',
              border:'none', color:'#fff', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:600,
              cursor: (!name.trim() || !parentId) ? 'not-allowed' : 'pointer', fontFamily:'inherit',
            }}>{saving ? '追加中...' : '＋ 追加する'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── My OKR Page ───────────────────────────────────────────────────────────────
function MyOKRPage({ user, levels, members, subtreeObjs, activePeriod }) {
  const [myObjs, setMyObjs] = useState([])
  const [allObjs, setAllObjs] = useState([])
  const [loading, setLoading] = useState(true)

  const myMember = members.find(m => m.email === user.email)
  const myName = myMember?.name || user.email

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: objs } = await supabase
        .from('objectives').select('id,level_id,period,title,owner').eq('owner', myName).order('id')
      if (!objs || !objs.length) { setMyObjs([]); setAllObjs([]); setLoading(false); return }
      const ids = objs.map(o => o.id)
      const { data: krs } = await supabase
        .from('key_results').select('id,objective_id,title,target,current,unit,lower_is_better').in('objective_id', ids)
      const krMap = {}
      ;(krs || []).forEach(kr => { if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []; krMap[kr.objective_id].push(kr) })
      const full = objs.map(o => ({ ...o, key_results: krMap[o.id] || [] }))
      setMyObjs(full)
      setAllObjs(full)
      setLoading(false)
    }
    load()
  }, [myName]) // eslint-disable-line

  const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
  const getLevelColor = (levelId) => {
    let d = 0, cur = levels.find(l => Number(l.id) === Number(levelId))
    while (cur && cur.parent_id) { d++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
    return LAYER_COLORS[d] || '#a0a8be'
  }
  const getLevelName = (levelId) => levels.find(l => Number(l.id) === Number(levelId))?.name || ''

  const handleLinkGoogle = async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) alert('紐づけに失敗しました: ' + error.message)
  }

  const hasGoogle = user?.identities?.some(i => i.provider === 'google')

  const periods = [
    { key: 'annual', label: '通期' }, { key: 'q1', label: 'Q1' },
    { key: 'q2', label: 'Q2' }, { key: 'q3', label: 'Q3' }, { key: 'q4', label: 'Q4' },
  ]

  if (loading) return <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(77,159,255,0.15)', border: '2px solid rgba(77,159,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#4d9fff' }}>
          {myName.charAt(0)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 2 }}>{myMember?.role || 'メンバー'} · {getLevelName(myMember?.level_id)}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: getT().text }}>{myName} のOKR</div>
        </div>
        {!myMember && (
          <div style={{ marginLeft: 'auto', fontSize: 11, color: '#ffd166', background: 'rgba(255,209,102,0.1)', border: '1px solid rgba(255,209,102,0.2)', borderRadius: 8, padding: '6px 12px' }}>
            ⚠️ 組織図にメンバー登録するとより詳しい情報が表示されます
          </div>
        )}
      </div>

      {myObjs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: getT().textFaint, border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, marginBottom: 6 }}>担当OKRがありません</div>
          <div style={{ fontSize: 13 }}>目標の担当者名を <strong style={{ color: '#4d9fff' }}>{myName}</strong> に設定するとここに表示されます</div>
        </div>
      ) : (
        <>
          {periods.map(p => {
            const objs = myObjs.filter(o => o.period === p.key)
            if (!objs.length) return null
            return (
              <div key={p.key} style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: getT().text }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: getT().textFaint }}>{objs.length}件</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                  {objs.map(obj => {
                    const prog = calcObjProgress(obj.key_results)
                    const rating = getRating(prog)
                    const lColor = getLevelColor(obj.level_id)
                    return (
                      <div key={obj.id} style={{ background: getT().bgCard2, border: `1px solid ${rating.color}25`, borderRadius: 14, padding: '18px 20px', borderLeft: `4px solid ${lColor}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: `${rating.color}18`, color: rating.color, fontWeight: 700 }}>{rating.label}</span>
                          <span style={{ fontSize: 24, fontWeight: 800, color: rating.color }}>{prog}%</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: getT().text, lineHeight: 1.5, marginBottom: 12 }}>{obj.title}</div>
                        <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                          <div style={{ height: '100%', width: `${Math.min(prog, 100)}%`, background: rating.color, borderRadius: 99, boxShadow: `0 0 6px ${rating.color}80` }} />
                        </div>
                        <div style={{ fontSize: 11, color: getT().textMuted }}>
                          {getLevelName(obj.level_id)} · {obj.key_results.length}KR
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ user, onSignOut }) {
  const [levels, setLevels]               = useState([])
  const [nodeObjectives, setNodeObjectives] = useState({})
  const [activeLevelId, setActiveLevelId]   = useState(null)
  const [fiscalYear, setFiscalYear]         = useState('2026') // ← 年度state追加
  const [activePeriod, setActivePeriod]     = useState('q1')
  const [modal, setModal]                   = useState(null)
  const [loading, setLoading]               = useState(true)
  const [showAI, setShowAI]                 = useState(false)
  const [initialAIMessage, setInitialAIMessage] = useState(null)
  const [showOrgModal, setShowOrgModal]     = useState(false)
  const [showSidebar, setShowSidebar]       = useState(false)
  const [isMobile, setIsMobile]             = useState(false)
  const [activePage, setActivePage]         = useState('okr')
  const [viewMode, setViewMode]             = useState('org')
  const [annualRefreshKey, setAnnualRefreshKey] = useState(0)
  const [themeKey, setThemeKey]                 = useState('dark')
  const T = THEMES[themeKey]
  _T = T
  if (typeof window !== 'undefined') window.__OKR_THEME__ = T
  const [members, setMembers]               = useState([])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const load = async () => {
      const [{ data: lvls, error }, { data: mems }] = await Promise.all([
        supabase.from('levels').select('*').order('id'),
        supabase.from('members').select('*').order('id'),
      ])
      if (error) console.error('levels error:', error)
      if (lvls?.length) { setLevels(lvls); setActiveLevelId(lvls[0].id) }
      if (mems) setMembers(mems)
      setLoading(false)
    }
    load()
  }, [])

  // ─── 年度に応じたperiodキーを生成 ─────────────────────────────────────────
  // 2026年度: 'q1', 'q2', 'q3', 'q4', 'annual' （既存データそのまま）
  // 2025年度: '2025_q1', '2025_q2', '2025_q3', '2025_q4', '2025_annual'
  const toPeriodKey = (period, year) => year === '2026' ? period : `${year}_${period}`
  const fromPeriodKey = (periodKey) => {
    if (periodKey.includes('_')) {
      const parts = periodKey.split('_')
      return parts[parts.length - 1] // 'q1' など
    }
    return periodKey
  }

  const fetchForLevel = async (levelId, period, year = '2026') => {
    const periodKey = toPeriodKey(period, year)
    const { data: objs } = await supabase
      .from('objectives').select('id,level_id,period,title,owner')
      .eq('level_id', levelId).eq('period', periodKey).order('id')
    if (!objs || objs.length === 0) return []
    const ids = objs.map(o => o.id)
    const { data: krs } = await supabase
      .from('key_results').select('id,objective_id,title,target,current,unit,lower_is_better')
      .in('objective_id', ids)
    const krMap = {}
    ;(krs || []).forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
      krMap[kr.objective_id].push(kr)
    })
    return objs.map(o => ({ ...o, key_results: krMap[o.id] || [] }))
  }

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
  }, [activeLevelId, activePeriod, levels, fiscalYear]) // eslint-disable-line

  const handleSave = async ({ obj, krs }) => {
    // 年度プレフィックスを付与してperiodKeyを生成
    const periodKey = toPeriodKey(obj.period, fiscalYear)
    const objToSave = { ...obj, period: periodKey }

    let objectiveId = objToSave.id
    if (objToSave.id) {
      await supabase.from('objectives').update({ title: objToSave.title, owner: objToSave.owner, level_id: objToSave.level_id, period: objToSave.period }).eq('id', objToSave.id)
      await supabase.from('key_results').delete().eq('objective_id', objToSave.id)
    } else {
      const { data, error } = await supabase
        .from('objectives')
        .insert([{ title: objToSave.title, owner: objToSave.owner, level_id: objToSave.level_id, period: objToSave.period, parent_objective_id: objToSave.parent_objective_id || null }])
        .select().single()
      if (error) { console.error('insert error:', error); return }
      objectiveId = data.id
    }
    if (krs.length && objectiveId) {
      await supabase.from('key_results').insert(
        krs.map(k => ({ title: k.title, target: k.target, current: k.current, unit: k.unit, lower_is_better: k.lower_is_better, objective_id: objectiveId }))
      )
    }
    setActiveLevelId(objToSave.level_id)
    await loadSubtree(objToSave.level_id, obj.period, levels, fiscalYear)
    setAnnualRefreshKey(k => k + 1)
  }

  const handleDelete = async (objId) => {
    if (!window.confirm('この目標を削除しますか？')) return
    await supabase.from('key_results').delete().eq('objective_id', objId)
    await supabase.from('objectives').delete().eq('id', objId)
    await loadSubtree(activeLevelId, activePeriod, levels, fiscalYear)
  }

  const handleAddLevel = async ({ name, icon, parent_id }) => {
    const { data, error } = await supabase
      .from('levels').insert([{ name, icon, parent_id: parent_id || null, color: '#4d9fff' }]).select().single()
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
    const newLevels = levels.filter(l => !subtree.includes(l.id))
    setLevels(newLevels)
    if (subtree.includes(activeLevelId)) {
      const newRoot = newLevels.find(l => !l.parent_id)
      setActiveLevelId(newRoot?.id || null)
    }
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
    { key: 'annual', label: '通期' },
    { key: 'q1', label: 'Q1' }, { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' }, { key: 'q4', label: 'Q4' },
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

  if (loading || !levels.length) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4d9fff', fontSize: 14 }}>
      読み込み中...
    </div>
  )

  // サイドバーの共通コンテンツ
  function SidebarContent() {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 8 }}>
          <span style={{ fontSize: 12, color: getT().textFaint, letterSpacing: '0.15em', textTransform: 'uppercase' }}>組織階層</span>
          {isMobile && <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: getT().textMuted, cursor: 'pointer', fontSize: 16 }}>✕</button>}
        </div>
        {roots.map(l => <LevelItem key={l.id} level={l} />)}
        <button onClick={() => setShowOrgModal(true)} style={{
          width:'100%', marginTop:10, background:'rgba(77,159,255,0.08)', border:'1px dashed rgba(77,159,255,0.3)',
          color:'#4d9fff', borderRadius:7, padding:'7px 10px', fontSize:11, fontWeight:600,
          cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:5,
        }}>🏗️ 組織を管理</button>
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
            <div style={{ fontSize: 11, color: '#00d68f', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>✅ Google連携済み</div>
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
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Header：2行構成 */}
      <div style={{
        borderBottom: `1px solid ${T.border}`, background: T.headerBg,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        {/* 1行目：ロゴ・ページナビ・ユーザー操作 */}
        <div style={{
          padding: isMobile ? '8px 12px' : '8px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowSidebar(p => !p)} style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: getT().textSub, width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>☰</button>
            {!isMobile && (
              <div>
                <div style={{ fontSize: 10, color: '#4d9fff', letterSpacing: '0.18em', textTransform: 'uppercase' }}>OKR Management</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>OKR ダッシュボード</div>
              </div>
            )}
          </div>

          {/* ページナビ（中央） */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.border}` }}>
            {[{key:'okr',label:'OKR'},{key:'myokr',label:'マイOKR'},{key:'csv',label:'CSV登録'},{key:'members',label:'組織図'},{key:'weekly',label:'週次MTG'}].map(pg => (
              <button key={pg.key} onClick={() => setActivePage(pg.key)} style={{
                padding: isMobile ? '5px 6px' : '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: activePage === pg.key ? '#4d9fff' : 'transparent',
                color: activePage === pg.key ? '#fff' : '#606880',
                fontSize: isMobile ? 11 : 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}>{pg.label}</button>
            ))}
          </div>

          {/* 右側：ユーザー操作 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {!isMobile && <span style={{ fontSize: 12, color: getT().textMuted }}>{user.email}</span>}
            {!isMobile && hasGoogle && (
              <span style={{ fontSize: 11, color: '#00d68f' }}>✅ Google連携済み</span>
            )}
            {!isMobile && !hasGoogle && (
              <button onClick={handleLinkGoogle} style={{
                background: 'rgba(255,255,255,0.9)', border: 'none', color: '#333',
                borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <svg width="13" height="13" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Google連携
              </button>
            )}
            {!isMobile && (
              <button onClick={onSignOut} style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: getT().textSub, borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>ログアウト</button>
            )}
            <button onClick={() => setModal({ type: 'add' })} style={{
              background: '#4d9fff', border: 'none', color: '#fff',
              borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>＋ 追加</button>
            <button onClick={() => setThemeKey(k => k === 'dark' ? 'light' : 'dark')} style={{
              background: T.bgCard, border: `1px solid ${T.borderMid}`,
              color: T.textSub, borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>{themeKey === 'dark' ? '☀️' : '🌙'}</button>
            <button onClick={() => setShowAI(p => !p)} style={{
              background: '#a855f7', border: 'none', color: '#fff',
              borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>🤖</button>
          </div>
        </div>

        {/* 2行目：ビュー切替・年度・期間（OKRページのみ表示） */}
        {activePage === 'okr' && (
          <div style={{
            padding: '5px 20px', display: 'flex', alignItems: 'center', gap: 6,
            borderTop: `1px solid ${T.border}`, background: T.headerBg,
          }}>
            {/* ビュー切替 */}
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.border}` }}>
              {[{key:'org',label:'🏢 組織'},{key:'annual',label:'📅 年間'}].map(v => (
                <button key={v.key} onClick={() => setViewMode(v.key)} style={{
                  padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: viewMode === v.key ? '#a855f7' : 'transparent',
                  color: viewMode === v.key ? '#fff' : '#606880',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
                }}>{v.label}</button>
              ))}
            </div>

            {/* 年度切替（組織ビューのみ） */}
            {viewMode === 'org' && (
              <>
                <div style={{ width: 1, height: 18, background: T.border }} />
                <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.border}` }}>
                  {['2025', '2026'].map(yr => (
                    <button key={yr} onClick={() => setFiscalYear(yr)} style={{
                      padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: fiscalYear === yr ? '#ff9f43' : 'transparent',
                      color: fiscalYear === yr ? '#fff' : '#606880',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
                    }}>{yr}年度</button>
                  ))}
                </div>

                <div style={{ width: 1, height: 18, background: T.border }} />

                {/* 期間切替 */}
                <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.border}` }}>
                  {periods.map(p => (
                    <button key={p.key} onClick={() => setActivePeriod(p.key)} style={{
                      padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: activePeriod === p.key ? '#a855f7' : 'transparent',
                      color: activePeriod === p.key ? '#fff' : '#606880',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    }}>{p.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── ページ切替 ─── */}
      {activePage === 'members' && <div style={{ flex: 1, overflowY: 'auto' }}><MemberPage /></div>}
      {activePage === 'weekly' && <div style={{ flex: 1, overflowY: 'auto' }}><WeeklyMTGPage levels={levels} themeKey={themeKey} fiscalYear={fiscalYear} /></div>}
      {activePage === 'csv' && <div style={{ flex: 1, overflowY: 'auto' }}><CsvPage levels={levels} fiscalYear={fiscalYear} /></div>}
      {activePage === 'myokr' && <div style={{ flex: 1, overflow: 'hidden', display:'flex' }}><MyOKRPageNew user={user} levels={levels} members={members} themeKey={themeKey} fiscalYear={fiscalYear} onAIFeedback={(msg) => { setInitialAIMessage(msg); setShowAI(true) }} /></div>}

      {/* Annual View */}
      <div style={{ display: activePage === 'okr' && viewMode === 'annual' ? 'flex' : 'none', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isMobile && showSidebar && (
          <div onClick={() => setShowSidebar(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 299 }} />
        )}
        <div style={{
          width: 210, flexShrink: 0,
          borderRight: `1px solid ${T.border}`,
          padding: '16px 10px', background: T.bgSidebar, overflowY: 'auto',
          ...(isMobile ? {
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300,
            transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            boxShadow: showSidebar ? '4px 0 24px rgba(0,0,0,0.6)' : 'none',
          } : {}),
        }}>
          <SidebarContent />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AnnualView
            levels={levels}
            refreshKey={annualRefreshKey}
            onAddObjective={({ parentObjectiveId, period, level_id }) => {
              setModal({ type: 'add', obj: { parent_objective_id: parentObjectiveId, period, level_id } })
            }}
            onEdit={obj => setModal({ type: 'edit', obj })}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Org View */}
      <div style={{ display: activePage === 'okr' && viewMode === 'org' ? 'flex' : 'none', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isMobile && showSidebar && (
          <div onClick={() => setShowSidebar(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 299 }} />
        )}

        {/* Sidebar */}
        <div style={{
          width: 210, flexShrink: 0,
          borderRight: `1px solid ${T.border}`,
          padding: '16px 10px', background: T.bgSidebar, overflowY: 'auto',
          ...(isMobile ? {
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300,
            transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            boxShadow: showSidebar ? '4px 0 24px rgba(0,0,0,0.6)' : 'none',
          } : {}),
        }}>
          <SidebarContent />
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: isMobile ? '14px' : '20px 24px', overflow: 'auto', minWidth: 0 }}>
          {/* ヘッダー */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{activeLevel?.name}</span>
              <span style={{ fontSize: 16 }}>{activeLevel?.icon}</span>
              {/* 年度バッジ */}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: fiscalYear === '2026' ? 'rgba(77,159,255,0.15)' : 'rgba(255,159,67,0.15)',
                color: fiscalYear === '2026' ? '#4d9fff' : '#ff9f43',
                border: `1px solid ${fiscalYear === '2026' ? 'rgba(77,159,255,0.3)' : 'rgba(255,159,67,0.3)'}`,
              }}>{fiscalYear}年度</span>
              <span style={{ fontSize: 13, color: getT().textMuted }}>{periods.find(p => p.key === activePeriod)?.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: `${globalR.color}10`, border: `1px solid ${globalR.color}30`, borderRadius: 10, padding: '8px 14px' }}>
              <div>
                <div style={{ fontSize: 11, color: getT().textMuted, marginBottom: 1 }}>全社平均達成率</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: globalR.color, lineHeight: 1 }}>{globalAvg}%</div>
              </div>
              <Stars score={globalR.score} size={11} />
            </div>
          </div>

          {/* 凡例 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ label: '経営', color: '#ff6b6b' }, { label: '事業部', color: '#4d9fff' }, { label: 'チーム', color: '#00d68f' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                <span style={{ fontSize: 12, color: getT().textSub }}>{l.label}</span>
              </div>
            ))}
          </div>

          {/* 階層ツリー */}
          {activeLevelId && (
            <NodeBlock
              levelId={activeLevelId}
              levels={levels}
              nodeObjectives={nodeObjectives}
              onEdit={o => setModal({ type: 'edit', obj: o })}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      {showOrgModal && (
        <OrgModal
          levels={levels}
          onClose={() => setShowOrgModal(false)}
          onAdd={handleAddLevel}
          onDelete={handleDeleteLevel}
        />
      )}
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
    </div>
  )
}
