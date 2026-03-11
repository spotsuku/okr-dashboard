'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import AIPanel from './AIPanel'

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

// ─── Small UI components ───────────────────────────────────────────────────────
function Stars({ score, size = 10 }) {
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

function Circle({ value, size = 46, stroke = 3.5, color }) {
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(value, 100) / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
    </svg>
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
            background: 'rgba(255,255,255,0.06)', border: 'none', color: '#a0a8be',
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
      {label && <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>{label}</div>}
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
      {label && <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>{label}</div>}
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

// ─── Objective Form (Add / Edit) ───────────────────────────────────────────────
function ObjForm({ initial, onSave, onClose, levels, activeLevelId, activePeriod }) {
  const [title, setTitle]   = useState(initial?.title || '')
  const [owner, setOwner]   = useState(initial?.owner || '')
  const [levelId, setLevelId] = useState(String(activeLevelId))
  const [period, setPeriod] = useState(activePeriod)
  const [krs, setKRs] = useState(
    initial?.key_results?.length
      ? initial.key_results.map(k => ({ ...k, target: String(k.target), current: String(k.current) }))
      : [{ _tmpId: Date.now(), title: '', target: '', current: '', unit: '', lower_is_better: false }]
  )
  const [saving, setSaving] = useState(false)

  const addKR = () => setKRs(p => [...p, { _tmpId: Date.now(), title: '', target: '', current: '', unit: '', lower_is_better: false }])
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
      <FSelect label="所属レベル" value={levelId} onChange={setLevelId}
        options={levels.map(l => ({ value: String(l.id), label: `${l.icon} ${l.name}` }))} />
      <FSelect label="期間" value={period} onChange={setPeriod} options={periodOpts} />
      <FInput label="目標タイトル" value={title} onChange={setTitle} placeholder="例: 市場シェアを拡大する" />
      <FInput label="オーナー" value={owner} onChange={setOwner} placeholder="例: 田中 CEO" />

      <div style={{ fontSize: 11, color: '#606880', marginBottom: 8, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Key Results</div>
      {krs.map((kr, i) => {
        const key = kr.id || kr._tmpId
        return (
          <div key={key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#606880' }}>KR {i + 1}</span>
              {krs.length > 1 && <Btn small danger variant="ghost" onClick={() => removeKR(key)}>削除</Btn>}
            </div>
            <FInput value={kr.title} onChange={v => updateKR(key, 'title', v)} placeholder="KR のタイトル" />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><FInput value={String(kr.target)} onChange={v => updateKR(key, 'target', v)} placeholder="目標値" type="number" /></div>
              <div style={{ flex: 1 }}><FInput value={String(kr.current)} onChange={v => updateKR(key, 'current', v)} placeholder="現在値" type="number" /></div>
              <div style={{ flex: 1 }}><FInput value={kr.unit} onChange={v => updateKR(key, 'unit', v)} placeholder="単位" /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#a0a8be' }}>
              <input type="checkbox" checked={!!kr.lower_is_better} onChange={e => updateKR(key, 'lower_is_better', e.target.checked)} />
              低い方が良い指標（チャーン率・バグ数など）
            </label>
          </div>
        )
      })}
      <Btn small variant="ghost" onClick={addKR}>＋ KR を追加</Btn>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 18 }}>
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
    <div style={{ marginBottom: 10 }}>
      <div style={{
        background: '#111828', border: `1px solid ${open ? levelColor + '50' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 12, overflow: 'hidden',
        boxShadow: open ? `0 0 24px ${levelColor}15` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}>
        <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
          onClick={() => setOpen(p => !p)}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Circle value={Math.min(prog, 100)} color={rating.color} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: rating.color }}>{prog}%</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${rating.color}18`, color: rating.color }}>{rating.label}</span>
              <Stars score={rating.score} />
              <span style={{ fontSize: 11, color: '#505878' }}>{obj.owner}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#dde0ec', lineHeight: 1.4 }}>{obj.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <button onClick={e => { e.stopPropagation(); onEdit(obj) }} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#606880',
              width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✎</button>
            <button onClick={e => { e.stopPropagation(); onDelete(obj.id) }} style={{
              background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b',
              width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
            <span style={{ color: '#404660', fontSize: 14, display: 'flex', alignItems: 'center', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginLeft: 2 }}>▾</span>
          </div>
        </div>

        {open && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.18)' }}>
            {(!obj.key_results || obj.key_results.length === 0) && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#404660' }}>KR がありません</div>
            )}
            {obj.key_results?.map((kr, i) => {
              const kprog = calcKRProgress(kr)
              const kr_rating = getRating(kprog)
              return (
                <div key={kr.id} style={{
                  padding: '12px 16px 12px 26px',
                  borderBottom: i < obj.key_results.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flexShrink: 0, width: 44, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: kr_rating.color, background: `${kr_rating.color}15`, padding: '2px 5px', borderRadius: 5, marginBottom: 3 }}>{kprog}%</div>
                    <Stars score={kr_rating.score} size={9} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5, gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#c0c4d8', lineHeight: 1.35 }}>{kr.title}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: '#505878', flexShrink: 0 }}>
                        {kr.current}{kr.unit} / {kr.target}{kr.unit}
                        {kr.lower_is_better && <span style={{ color: '#404660', marginLeft: 4 }}>↓良</span>}
                      </span>
                    </div>
                    <Bar value={kprog} color={kr_rating.color} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                      <span style={{ fontSize: 9, color: '#353c55', fontFamily: "'DM Mono',monospace" }}>60%=★1 · 80%=★2 · 100%=★3 · 120%=★4 · 150%=★5</span>
                    </div>
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

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ user, onSignOut }) {
  const [levels, setLevels]   = useState([])
  const [objectives, setObjectives] = useState([])
  const [activeLevelId, setActiveLevelId] = useState(null)
  const [activePeriod, setActivePeriod]   = useState('q1')
  const [modal, setModal]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAI, setShowAI] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)

  // Load levels once
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('levels').select('*').order('id')
      if (error) console.error('levels error:', error)
      if (data?.length) { setLevels(data); setActiveLevelId(data[0].id) }
      setLoading(false)
    }
    load()
  }, [])

  // Fetch objectives + key_results in two separate queries
  const loadObjectives = async (levelId, period) => {
    if (!levelId) return
    const { data: objs, error: e1 } = await supabase
      .from('objectives')
      .select('id, level_id, period, title, owner')
      .eq('level_id', levelId)
      .eq('period', period)
      .order('id')
    if (e1) { console.error('objectives error:', e1); return }
    if (!objs || objs.length === 0) { setObjectives([]); return }
    const ids = objs.map(o => o.id)
    const { data: krs, error: e2 } = await supabase
      .from('key_results')
      .select('id, objective_id, title, target, current, unit, lower_is_better')
      .in('objective_id', ids)
    if (e2) console.error('key_results error:', e2)
    const krMap = {}
    ;(krs || []).forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
      krMap[kr.objective_id].push(kr)
    })
    setObjectives(objs.map(o => ({ ...o, key_results: krMap[o.id] || [] })))
  }

  useEffect(() => {
    if (activeLevelId) loadObjectives(activeLevelId, activePeriod)
  }, [activeLevelId, activePeriod]) // eslint-disable-line

  // Save objective + KRs
  const handleSave = async ({ obj, krs }) => {
    let objectiveId = obj.id
    if (obj.id) {
      await supabase.from('objectives').update({ title: obj.title, owner: obj.owner, level_id: obj.level_id, period: obj.period }).eq('id', obj.id)
      await supabase.from('key_results').delete().eq('objective_id', obj.id)
    } else {
      const { data, error } = await supabase
        .from('objectives')
        .insert([{ title: obj.title, owner: obj.owner, level_id: obj.level_id, period: obj.period }])
        .select()
        .single()
      if (error) { console.error('insert error:', error); return }
      objectiveId = data.id
    }
    if (krs.length && objectiveId) {
      await supabase.from('key_results').insert(
        krs.map(k => ({ title: k.title, target: k.target, current: k.current, unit: k.unit, lower_is_better: k.lower_is_better, objective_id: objectiveId }))
      )
    }
    const targetLevelId = obj.level_id
    const targetPeriod = obj.period
    setActiveLevelId(targetLevelId)
    setActivePeriod(targetPeriod)
    await loadObjectives(targetLevelId, targetPeriod)
  }

  const handleDelete = async (objId) => {
    if (!window.confirm('この目標を削除しますか？')) return
    await supabase.from('key_results').delete().eq('objective_id', objId)
    await supabase.from('objectives').delete().eq('id', objId)
    await loadObjectives(activeLevelId, activePeriod)
  }

  const getPath = useCallback((levelId) => {
    const path = []
    let cur = levels.find(l => l.id === levelId)
    while (cur) { path.unshift(cur.name); cur = cur.parent_id ? levels.find(l => l.id === cur.parent_id) : null }
    return path.join(' › ')
  }, [levels])

  const periods = [
    { key: 'annual', label: '通期' },
    { key: 'q1', label: 'Q1' }, { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' }, { key: 'q4', label: 'Q4' },
  ]
  const activeLevel = levels.find(l => l.id === activeLevelId)
  const allProgs = objectives.map(o => calcObjProgress(o.key_results))
  const overallAvg = allProgs.length ? Math.round(allProgs.reduce((s, p) => s + p, 0) / allProgs.length) : 0
  const overallRating = getRating(overallAvg)
  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))

  function LevelItem({ level, depth = 0 }) {
    const active = activeLevelId === level.id
    const children = getChildren(level.id)
    return (
      <>
        <div onClick={() => setActiveLevelId(level.id)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: `7px 10px 7px ${10 + depth * 14}px`,
          borderRadius: 7, marginBottom: 2, cursor: 'pointer',
          background: active ? `${level.color}18` : 'transparent',
          border: active ? `1px solid ${level.color}35` : '1px solid transparent',
          transition: 'all 0.15s',
        }}>
          <span style={{ fontSize: 14 }}>{level.icon}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#e8eaf0' : '#8090b0' }}>{level.name}</span>
        </div>
        {children.map(c => <LevelItem key={c.id} level={c} depth={depth + 1} />)}
      </>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#090d18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#090d18', color: '#e8eaf0', fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #222840; border-radius: 4px; }
        input::placeholder { color: #404860; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .fu { animation: fadeUp 0.28s ease forwards; }
        @media (max-width: 640px) {
          .desktop-only { display: none !important; }
          .mobile-header { flex-wrap: nowrap !important; padding: 10px 14px !important; }
          .sidebar-panel { position: fixed !important; left: 0 !important; top: 0 !important; bottom: 0 !important; z-index: 300 !important; width: 240px !important; background: #0e1420 !important; box-shadow: 4px 0 24px rgba(0,0,0,0.6) !important; }
          .sidebar-overlay { display: block !important; }
          .main-content { padding: 14px 14px !important; }
        }
        .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 299; }
        .sidebar-close { display: none; }
        @media (max-width: 640px) { .sidebar-close { display: block !important; } }
      `}</style>

      {/* Top bar */}
      <div className="mobile-header" style={{
        padding: '13px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(9,13,24,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100, gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowSidebar(true)} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#a0a8be', width: 32, height: 32, borderRadius: 8,
            cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>☰</button>
          <div>
            <div style={{ fontSize: 9, color: '#4d9fff', letterSpacing: '0.18em', textTransform: 'uppercase' }}>OKR Management</div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>OKR ダッシュボード</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {periods.map(p => (
            <button key={p.key} onClick={() => setActivePeriod(p.key)} style={{
              padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: activePeriod === p.key ? '#4d9fff' : 'transparent',
              color: activePeriod === p.key ? '#fff' : '#606880',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
            }}>{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span className="desktop-only" style={{ fontSize: 11, color: '#505878' }}>{user.email}</span>
          <button onClick={onSignOut} className="desktop-only" style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            color: '#a0a8be', borderRadius: 8, padding: '5px 10px', fontSize: 11,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>ログアウト</button>
          <button onClick={() => setModal({ type: 'add' })} style={{
            background: '#4d9fff', border: 'none', color: '#fff',
            borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>＋ 追加</button>
          <button onClick={() => setShowAI(p => !p)} style={{
            background: '#a855f7', border: 'none', color: '#fff',
            borderRadius: 8, padding: '7px 10px', fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>🤖</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar overlay for mobile */}
        {showSidebar && <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />}
        {/* Sidebar */}
        <div className={showSidebar ? 'sidebar-panel' : ''} style={{
          width: 210, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '18px 10px', background: 'rgba(255,255,255,0.01)', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 10 }}>
            <div style={{ fontSize: 10, color: '#404660', letterSpacing: '0.15em', textTransform: 'uppercase' }}>組織階層</div>
            <button onClick={() => setShowSidebar(false)} style={{
              background: 'none', border: 'none', color: '#606880', cursor: 'pointer', fontSize: 16, padding: 2,
            }} className="sidebar-close">✕</button>
          </div>
          {roots.map(l => <LevelItem key={l.id} level={l} />)}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: '#404660', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2 }}>評価基準</div>
            {[...RATINGS].reverse().filter(r => r.score > 0).map(r => (
              <div key={r.score} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', borderRadius: 6, marginBottom: 2 }}>
                <Stars score={r.score} size={9} />
                <span style={{ fontSize: 10, color: r.color, flex: 1 }}>{r.label}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: '#404660' }}>{r.min}%+</span>
              </div>
            ))}
          </div>
          {/* Mobile logout */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: '#505878', marginBottom: 8, paddingLeft: 2 }}>{user.email}</div>
            <button onClick={onSignOut} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#a0a8be', borderRadius: 8, padding: '8px 14px', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', width: '100%',
            }}>ログアウト</button>
          </div>
        </div>

        {/* Main */}
        <div className="main-content" style={{ flex: 1, padding: '22px 26px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#404660', marginBottom: 3 }}>{getPath(activeLevelId)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 21, fontWeight: 700 }}>{activeLevel?.name}</span>
                <span style={{ fontSize: 18 }}>{activeLevel?.icon}</span>
                <span style={{ fontSize: 12, color: '#606880' }}>{periods.find(p => p.key === activePeriod)?.label}</span>
              </div>
            </div>
            {objectives.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: '平均達成率', value: `${overallAvg}%`, sub: <Stars score={overallRating.score} />, color: overallRating.color, bg: `${overallRating.color}12`, border: `${overallRating.color}28` },
                  { label: '目標数', value: objectives.length, sub: 'Objectives', color: '#e8eaf0', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
                  { label: 'KR 総数', value: objectives.reduce((s, o) => s + (o.key_results?.length || 0), 0), sub: 'Key Results', color: '#e8eaf0', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontSize: 10, color: '#606880', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 19, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ marginTop: 4, display: 'flex', justifyContent: 'center', fontSize: 10, color: '#505878' }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="fu">
            {objectives.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#404660', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 14 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, marginBottom: 6 }}>この期間に目標がありません</div>
                <div style={{ fontSize: 12 }}>「＋ 目標を追加」から新しい目標を設定しましょう</div>
              </div>
            ) : (
              objectives.map(obj => (
                <ObjCard key={obj.id} obj={obj} levelColor={activeLevel?.color || '#4d9fff'}
                  onEdit={o => setModal({ type: 'edit', obj: o })}
                  onDelete={handleDelete} />
              ))
            )}
          </div>
        </div>
      </div>

      {showAI && (
        <AIPanel
          onClose={() => setShowAI(false)}
          okrContext={{ levels, objectives, activePeriod }}
        />
      )}
      {modal && (
        <Modal title={modal.type === 'add' ? '目標を追加' : '目標を編集'} onClose={() => setModal(null)}>
          <ObjForm
            initial={modal.obj}
            onSave={handleSave}
            onClose={() => setModal(null)}
            levels={levels}
            activeLevelId={activeLevelId}
            activePeriod={activePeriod}
          />
        </Modal>
      )}
    </div>
  )
}
