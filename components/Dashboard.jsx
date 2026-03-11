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

// 絶対レイヤー深度（経営=0, 事業部=1, チーム=2）
function getAbsoluteDepth(levelId, levels) {
  let depth = 0
  let cur = levels.find(l => l.id === levelId)
  while (cur && cur.parent_id) {
    depth++
    cur = levels.find(l => l.id === cur.parent_id)
  }
  return depth
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }
const getLayerColor = absDepth => LAYER_COLORS[absDepth] || '#a0a8be'
const getLayerLabel = absDepth => LAYER_LABELS[absDepth] || ''

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
        <span style={{ fontSize: 9, fontWeight: 800, color }}>{value}%</span>
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

// ─── Objective Form ────────────────────────────────────────────────────────────
function ObjForm({ initial, onSave, onClose, levels, activeLevelId, activePeriod }) {
  const [title, setTitle]     = useState(initial?.title || '')
  const [owner, setOwner]     = useState(initial?.owner || '')
  const [levelId, setLevelId] = useState(String(activeLevelId))
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
    <div style={{ marginBottom: 6 }}>
      <div style={{
        background: '#0e1420', border: `1px solid ${open ? levelColor + '50' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
      }}>
        <div style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
          onClick={() => setOpen(p => !p)}>
          <Ring value={Math.min(prog, 100)} color={rating.color} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: `${rating.color}18`, color: rating.color }}>{rating.label}</span>
              <Stars score={rating.score} size={9} />
              <span style={{ fontSize: 10, color: '#505878' }}>{obj.owner}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#dde0ec', lineHeight: 1.4 }}>{obj.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
            <button onClick={e => { e.stopPropagation(); onEdit(obj) }} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#606880',
              width: 24, height: 24, borderRadius: 5, cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✎</button>
            <button onClick={e => { e.stopPropagation(); onDelete(obj.id) }} style={{
              background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b',
              width: 24, height: 24, borderRadius: 5, cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
            <span style={{ color: '#404660', fontSize: 13, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
          </div>
        </div>

        {open && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
            {(!obj.key_results || obj.key_results.length === 0) && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#404660' }}>KR がありません</div>
            )}
            {obj.key_results?.map((kr, i) => {
              const kprog = calcKRProgress(kr)
              const kr_rating = getRating(kprog)
              return (
                <div key={kr.id} style={{
                  padding: '10px 14px 10px 20px',
                  borderBottom: i < obj.key_results.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flexShrink: 0, width: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: kr_rating.color, background: `${kr_rating.color}15`, padding: '2px 4px', borderRadius: 4, marginBottom: 2 }}>{kprog}%</div>
                    <Stars score={kr_rating.score} size={8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#c0c4d8', lineHeight: 1.35 }}>{kr.title}</span>
                      <span style={{ fontSize: 9, color: '#505878', flexShrink: 0 }}>
                        {kr.current}{kr.unit} / {kr.target}{kr.unit}
                        {kr.lower_is_better && <span style={{ color: '#404660', marginLeft: 4 }}>↓良</span>}
                      </span>
                    </div>
                    <Bar value={kprog} color={kr_rating.color} />
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

// ─── Node Block (Hierarchy Tree) ───────────────────────────────────────────────
function NodeBlock({ levelId, levels, nodeObjectives, parentColor = null, isLast = false, onEdit, onDelete }) {
  const [childrenOpen, setChildrenOpen] = useState(true)
  const level = levels.find(l => l.id === levelId)
  const children = levels.filter(l => Number(l.parent_id) === levelId)
  const objs = nodeObjectives[levelId] || []
  const absDepth = getAbsoluteDepth(levelId, levels)
  const layerColor = getLayerColor(absDepth)
  const layerLabel = getLayerLabel(absDepth)
  const allProgs = objs.map(o => calcObjProgress(o.key_results))
  const avg = allProgs.length ? Math.round(allProgs.reduce((s, p) => s + p, 0) / allProgs.length) : null
  const avgR = avg !== null ? getRating(avg) : null
  if (!level) return null

  return (
    <div style={{ position: 'relative' }}>
      {/* 縦線 */}
      {parentColor && (
        <div style={{ position: 'absolute', left: -14, top: 0, bottom: isLast ? 24 : 0, width: 2, background: `linear-gradient(to bottom,${parentColor}80,${parentColor}10)`, borderRadius: 2 }} />
      )}
      {/* 横線 */}
      {parentColor && (
        <div style={{ position: 'absolute', left: -14, top: 24, width: 14, height: 2, background: `${parentColor}70`, borderRadius: 2 }} />
      )}

      <div style={{ marginBottom: 8 }}>
        {/* レベルヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, background: `${layerColor}10`, border: `1px solid ${layerColor}25`, borderLeft: `3px solid ${layerColor}`, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>{level.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#dde0ec' }}>{level.name}</span>
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, background: `${layerColor}22`, color: layerColor, fontWeight: 700, textTransform: 'uppercase' }}>{layerLabel}</span>
          {avg !== null && (
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: avgR.color }}>{avg}%</span>
          )}
          {/* 折りたたみ時の子達成率サマリー */}
          {!childrenOpen && children.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {children.map(c => {
                const cobjs = nodeObjectives[c.id] || []
                const cprogs = cobjs.map(o => calcObjProgress(o.key_results))
                const cavg = cprogs.length ? Math.round(cprogs.reduce((s, p) => s + p, 0) / cprogs.length) : null
                const cr = cavg !== null ? getRating(cavg) : null
                return cavg !== null ? (
                  <span key={c.id} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, background: `${cr.color}15`, color: cr.color, fontWeight: 700 }}>
                    {c.icon}{cavg}%
                  </span>
                ) : null
              })}
            </div>
          )}
          {/* 展開ボタン */}
          {children.length > 0 && (
            <button onClick={() => setChildrenOpen(p => !p)} style={{
              background: `${layerColor}15`, border: `1px solid ${layerColor}40`, color: layerColor,
              borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.2s', transform: childrenOpen ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0,
            }}>▾</button>
          )}
        </div>

        {/* OKRカード */}
        {objs.length === 0
          ? <div style={{ marginLeft: 8, marginBottom: 4, fontSize: 11, color: '#303450', fontStyle: 'italic' }}>目標なし</div>
          : <div style={{ marginLeft: 8 }}>{objs.map(obj => <ObjCard key={obj.id} obj={obj} levelColor={layerColor} onEdit={onEdit} onDelete={onDelete} />)}</div>
        }
      </div>

      {/* 子ノード */}
      {childrenOpen && children.length > 0 && (
        <div style={{ marginLeft: 28, position: 'relative' }}>
          {children.map((child, i) => (
            <NodeBlock key={child.id} levelId={child.id} levels={levels} nodeObjectives={nodeObjectives}
              parentColor={layerColor} isLast={i === children.length - 1}
              onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ user, onSignOut }) {
  const [levels, setLevels]               = useState([])
  const [nodeObjectives, setNodeObjectives] = useState({})
  const [activeLevelId, setActiveLevelId]   = useState(null)
  const [activePeriod, setActivePeriod]     = useState('q1')
  const [modal, setModal]                   = useState(null)
  const [loading, setLoading]               = useState(true)
  const [showAI, setShowAI]                 = useState(false)
  const [showSidebar, setShowSidebar]       = useState(false)
  const [isMobile, setIsMobile]             = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Load levels
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('levels').select('*').order('id')
      if (error) console.error('levels error:', error)
      if (data?.length) { setLevels(data); setActiveLevelId(data[0].id) }
      setLoading(false)
    }
    load()
  }, [])

  // Fetch objectives + KRs for a single level
  const fetchForLevel = async (levelId, period) => {
    const { data: objs } = await supabase
      .from('objectives').select('id,level_id,period,title,owner')
      .eq('level_id', levelId).eq('period', period).order('id')
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

  // Get subtree of level ids
  const getSubtree = useCallback((id, lvls) => {
    const ids = [id]
    lvls.filter(l => Number(l.parent_id) === id).forEach(c => ids.push(...getSubtree(c.id, lvls)))
    return ids
  }, [])

  // Load all objectives in the subtree
  const loadSubtree = useCallback(async (rootId, period, lvls) => {
    if (!rootId || !lvls.length) return
    const subtree = getSubtree(rootId, lvls)
    const map = {}
    for (const lid of subtree) {
      map[lid] = await fetchForLevel(lid, period)
    }
    setNodeObjectives(map)
  }, [getSubtree]) // eslint-disable-line

  useEffect(() => {
    if (activeLevelId && levels.length) loadSubtree(activeLevelId, activePeriod, levels)
  }, [activeLevelId, activePeriod, levels]) // eslint-disable-line

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
        .select().single()
      if (error) { console.error('insert error:', error); return }
      objectiveId = data.id
    }
    if (krs.length && objectiveId) {
      await supabase.from('key_results').insert(
        krs.map(k => ({ title: k.title, target: k.target, current: k.current, unit: k.unit, lower_is_better: k.lower_is_better, objective_id: objectiveId }))
      )
    }
    setActiveLevelId(obj.level_id)
    setActivePeriod(obj.period)
    await loadSubtree(obj.level_id, obj.period, levels)
  }

  const handleDelete = async (objId) => {
    if (!window.confirm('この目標を削除しますか？')) return
    await supabase.from('key_results').delete().eq('objective_id', objId)
    await supabase.from('objectives').delete().eq('id', objId)
    await loadSubtree(activeLevelId, activePeriod, levels)
  }

  const periods = [
    { key: 'annual', label: '通期' },
    { key: 'q1', label: 'Q1' }, { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' }, { key: 'q4', label: 'Q4' },
  ]

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))
  const activeLevel = levels.find(l => l.id === activeLevelId)

  // 全社平均（表示中サブツリー全体）
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
          <span style={{ fontSize: 14 }}>{level.icon}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#e8eaf0' : '#8090b0' }}>{level.name}</span>
        </div>
        {children.map(c => <LevelItem key={c.id} level={c} depth={depth + 1} />)}
      </>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#090d18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4d9fff', fontSize: 14 }}>
      読み込み中...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#090d18', color: '#e8eaf0', fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '10px 12px' : '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#090d18',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowSidebar(p => !p)} style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#a0a8be', width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>☰</button>
          {!isMobile && (
            <div>
              <div style={{ fontSize: 9, color: '#4d9fff', letterSpacing: '0.18em', textTransform: 'uppercase' }}>OKR Management</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>OKR ダッシュボード</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {periods.map(p => (
            <button key={p.key} onClick={() => setActivePeriod(p.key)} style={{
              padding: isMobile ? '5px 7px' : '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: activePeriod === p.key ? '#4d9fff' : 'transparent',
              color: activePeriod === p.key ? '#fff' : '#606880',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            }}>{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {!isMobile && <span style={{ fontSize: 11, color: '#505878' }}>{user.email}</span>}
          {!isMobile && (
            <button onClick={onSignOut} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#a0a8be', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>ログアウト</button>
          )}
          <button onClick={() => setModal({ type: 'add' })} style={{
            background: '#4d9fff', border: 'none', color: '#fff',
            borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>＋ 追加</button>
          <button onClick={() => setShowAI(p => !p)} style={{
            background: '#a855f7', border: 'none', color: '#fff',
            borderRadius: 8, padding: '7px 10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>🤖</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isMobile && showSidebar && (
          <div onClick={() => setShowSidebar(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 299 }} />
        )}

        {/* Sidebar */}
        <div style={{
          width: 210, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: '16px 10px', background: isMobile ? '#0e1420' : 'rgba(255,255,255,0.01)', overflowY: 'auto',
          ...(isMobile ? {
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300,
            transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            boxShadow: showSidebar ? '4px 0 24px rgba(0,0,0,0.6)' : 'none',
          } : {}),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 8 }}>
            <span style={{ fontSize: 10, color: '#404660', letterSpacing: '0.15em', textTransform: 'uppercase' }}>組織階層</span>
            {isMobile && <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: '#606880', cursor: 'pointer', fontSize: 16 }}>✕</button>}
          </div>
          {roots.map(l => <LevelItem key={l.id} level={l} />)}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: '#404660', textTransform: 'uppercase', marginBottom: 8 }}>評価基準</div>
            {[...RATINGS].reverse().filter(r => r.score > 0).map(r => (
              <div key={r.score} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px', marginBottom: 2 }}>
                <Stars score={r.score} size={9} />
                <span style={{ fontSize: 10, color: r.color, flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 9, color: '#404660' }}>{r.min}%+</span>
              </div>
            ))}
          </div>
          {/* Mobile logout */}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: '#505878', marginBottom: 8 }}>{user.email}</div>
            <button onClick={onSignOut} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#a0a8be', borderRadius: 8, padding: '8px 14px', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', width: '100%',
            }}>ログアウト</button>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: isMobile ? '14px' : '20px 24px', overflowY: 'auto', minWidth: 0 }}>
          {/* ヘッダー */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{activeLevel?.name}</span>
              <span style={{ fontSize: 16 }}>{activeLevel?.icon}</span>
              <span style={{ fontSize: 11, color: '#606880' }}>{periods.find(p => p.key === activePeriod)?.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: `${globalR.color}10`, border: `1px solid ${globalR.color}30`, borderRadius: 10, padding: '8px 14px' }}>
              <div>
                <div style={{ fontSize: 9, color: '#606880', marginBottom: 1 }}>全社平均達成率</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: globalR.color, lineHeight: 1 }}>{globalAvg}%</div>
              </div>
              <Stars score={globalR.score} size={11} />
            </div>
          </div>

          {/* 凡例 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ label: '経営', color: '#ff6b6b' }, { label: '事業部', color: '#4d9fff' }, { label: 'チーム', color: '#00d68f' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: l.color }} />
                <span style={{ fontSize: 10, color: '#8090b0' }}>{l.label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: '#404660' }}>▾ で子階層を展開・折りたたみ</span>
          </div>

          {/* 階層ツリー */}
          {activeLevelId && (
            <NodeBlock
              levelId={activeLevelId}
              levels={levels}
              nodeObjectives={nodeObjectives}
              parentColor={null}
              isLast={true}
              onEdit={o => setModal({ type: 'edit', obj: o })}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      {showAI && (
        <AIPanel
          onClose={() => setShowAI(false)}
          okrContext={{ levels, objectives: subtreeObjs, activePeriod }}
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
