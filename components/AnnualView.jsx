'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buildQuarterMap } from '../lib/objectiveMatching'
import KASection from './KASection'

// KASection に渡すテーマオブジェクト (AnnualView の THEMES を元に必要 key だけ抽出)
function makeKATheme(t) {
  return {
    accent:       t.btnEditColor || '#4d9fff',
    accentSolid:  t.addBtnBg     || '#4d9fff',
    text:         t.text,
    textSub:      t.textSub,
    textMuted:    t.textMuted,
    textFaint:    t.textFaint,
    textFaintest: t.textFaintest,
    bgCard:       t.bgCard,
    bgCard2:      t.bgKr,
    border:       t.border,
    borderMid:    t.borderDash,
    badgeBg:      t.btnEditColor || '#4d9fff',
    badgeBorder:  t.btnEditBorder || 'rgba(77,159,255,0.25)',
  }
}

// ─── themes ────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '#0F1117', bgCard: '#111828', bgExpanded: 'rgba(0,0,0,0.2)',
    bgInner: 'rgba(255,255,255,0.03)', bgKr: 'rgba(255,255,255,0.03)',
    bgKrOuter: 'rgba(255,255,255,0.02)',
    text: '#E8ECF0', textSub: '#dde0ec', textMuted: '#606880',
    textFaint: '#404660', textFaintest: '#303650',
    border: 'rgba(255,255,255,0.06)', borderDash: 'rgba(255,255,255,0.08)',
    borderLight: 'rgba(255,255,255,0.07)', borderKr: 'rgba(255,255,255,0.06)',
    progressBg: 'rgba(255,255,255,0.06)',
    btnEditBg: 'rgba(77,159,255,0.12)', btnEditBorder: 'rgba(77,159,255,0.25)', btnEditColor: '#4d9fff',
    btnDelBg: 'rgba(255,107,107,0.1)', btnDelBorder: 'rgba(255,107,107,0.2)', btnDelColor: '#ff6b6b',
    tabActiveBg: 'rgba(255,255,255,0.05)',
    badgePeriodBg: 'rgba(255,255,255,0.06)',
    addBtnBg: '#4d9fff',
    refBg: 'rgba(255,255,255,0.03)', refBorder: 'rgba(255,255,255,0.08)',
  },
  // iOS/iPadOS 風のシステムカラー (light)
  light: {
    bg: '#F2F2F7', bgCard: '#FFFFFF', bgExpanded: 'rgba(0,0,0,0.03)',
    bgInner: 'rgba(0,0,0,0.02)', bgKr: 'rgba(0,0,0,0.03)',
    bgKrOuter: 'rgba(0,0,0,0.02)',
    text: '#1C1C1E', textSub: '#3A3A3C', textMuted: '#8E8E93',
    textFaint: '#C7C7CC', textFaintest: 'rgba(0,0,0,0.06)',
    border: 'rgba(0,0,0,0.06)', borderDash: 'rgba(0,0,0,0.10)',
    borderLight: 'rgba(0,0,0,0.06)', borderKr: 'rgba(0,0,0,0.06)',
    progressBg: 'rgba(0,0,0,0.06)',
    btnEditBg: 'rgba(0,122,255,0.10)', btnEditBorder: 'rgba(0,122,255,0.30)', btnEditColor: '#007AFF',
    btnDelBg: 'rgba(255,59,48,0.10)', btnDelBorder: 'rgba(255,59,48,0.30)', btnDelColor: '#FF3B30',
    tabActiveBg: '#F2F2F7',
    badgePeriodBg: '#F2F2F7',
    addBtnBg: '#007AFF',
    refBg: 'rgba(52,199,89,0.08)', refBorder: 'rgba(52,199,89,0.30)',
  },
}

let _theme = THEMES.dark
const T = () => _theme

// ─── helpers ────────────────────────────────────────────────────────────────
const RATINGS = [
  { min: 120, label: '奇跡',   color: '#ff9f43' },
  { min: 110, label: '変革',   color: '#a855f7' },
  { min: 100, label: '好調',   color: '#00d68f' },
  { min:  90, label: '順調',   color: '#4d9fff' },
  { min:  80, label: '最低限', color: '#ffd166' },
  { min:   0, label: '未達',   color: '#ff6b6b' },
]
const getRating = p => p == null ? null : (RATINGS.find(r => Math.min(p, 150) >= r.min) || RATINGS[RATINGS.length - 1])

function calcObjProgress(krs) {
  if (!krs?.length) return 0
  const valid = krs.filter(k => k.target > 0)
  if (!valid.length) return 0
  return Math.round(valid.reduce((s, k) => {
    const raw = k.lower_is_better
      ? Math.max(0, ((k.target * 2 - k.current) / k.target) * 100)
      : (k.current / k.target) * 100
    return s + Math.min(raw, 150)
  }, 0) / valid.length)
}

function getAbsoluteDepth(levelId, levels) {
  let depth = 0
  let cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) { depth++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
  return depth
}

// ─── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function Avatar({ name, avatarUrl, size = 20 }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:`1.5px solid ${avatarColor(name)}60` }} />
  }
  if (!name) return null
  const c = avatarColor(name)
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`${c}25`, border:`1.5px solid ${c}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.36, fontWeight:700, color:c, flexShrink:0 }}>
      {name.slice(0,2)}
    </div>
  )
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
const Q_KEYS = ['q1', 'q2', 'q3', 'q4']
const Q_LABELS = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }

function toPeriodKey(period, fiscalYear) {
  return fiscalYear === '2026' ? period : `${fiscalYear}_${period}`
}

// サイドバーで選択中のlevelIdの子孫を全て取得
function getDescendantIds(levelId, levels) {
  const ids = [Number(levelId)]
  let frontier = [Number(levelId)]
  while (frontier.length) {
    const next = levels.filter(l => frontier.includes(Number(l.parent_id))).map(l => Number(l.id))
    ids.push(...next)
    frontier = next
  }
  return ids
}

// ─── AnnualView ─────────────────────────────────────────────────────────────
export default function AnnualView({ levels, onAddObjective, onEdit, onDelete, refreshKey, fiscalYear = '2026', themeKey = 'dark', activeLevelId, members = [] }) {
  _theme = THEMES[themeKey] || THEMES.dark

  const [annualObjs, setAnnualObjs] = useState([])
  const [quarterMap, setQuarterMap] = useState({})
  const [expanded,   setExpanded]   = useState({})
  const [activeQ,    setActiveQ]    = useState({})
  const [loading,    setLoading]    = useState(true)

  useEffect(() => { loadAll() }, [refreshKey, fiscalYear]) // eslint-disable-line

  const loadAll = async () => {
    setLoading(true)

    const annualKey = toPeriodKey('annual', fiscalYear)
    const { data: annObjs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .eq('period', annualKey)
      .order('level_id,id')
      .range(0, 49999)

    if (!annObjs?.length) { setAnnualObjs([]); setQuarterMap({}); setLoading(false); return }

    const annIds = annObjs.map(o => o.id)
    const { data: annKRs } = await supabase
      .from('key_results')
      .select('id,objective_id,title,target,current,unit,lower_is_better,owner')
      .in('objective_id', annIds)
      .range(0, 49999)

    const annKRMap = {}
    ;(annKRs || []).forEach(kr => {
      if (!annKRMap[kr.objective_id]) annKRMap[kr.objective_id] = []
      annKRMap[kr.objective_id].push(kr)
    })
    const fullAnnObjs = annObjs.map(o => ({ ...o, key_results: annKRMap[o.id] || [] }))
    setAnnualObjs(fullAnnObjs)

    const qKeys = Q_KEYS.map(q => toPeriodKey(q, fiscalYear))
    // 年度プレフィックスの有無両方で検索（データ不整合対応）
    const allQKeys = [...new Set([...qKeys, ...Q_KEYS, ...Q_KEYS.map(q => `${fiscalYear}_${q}`)])]
    const { data: qObjs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .in('period', allQKeys)
      .order('id')
      .range(0, 49999)

    if (!qObjs?.length) { setQuarterMap({}); setLoading(false); return }

    const qIds = qObjs.map(o => o.id)
    const { data: qKRs } = await supabase
      .from('key_results')
      .select('id,objective_id,title,target,current,unit,lower_is_better,owner')
      .in('objective_id', qIds)
      .range(0, 49999)

    const qKRMap = {}
    ;(qKRs || []).forEach(kr => {
      if (!qKRMap[kr.objective_id]) qKRMap[kr.objective_id] = []
      qKRMap[kr.objective_id].push(kr)
    })
    const fullQObjs = qObjs.map(o => ({ ...o, key_results: qKRMap[o.id] || [] }))

    const qMap = buildQuarterMap(fullAnnObjs, fullQObjs, (qObjId, annualObjId) => {
      // 自動修復: parent_objective_id が未設定のQ期OKRを自動的にDBに書き込む
      supabase.from('objectives').update({ parent_objective_id: annualObjId }).eq('id', qObjId).then(() => {})
    })

    setQuarterMap(qMap)
    setLoading(false)
  }

  const toggleExpand = (id) => {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
    if (!activeQ[id]) setActiveQ(p => ({ ...p, [id]: 'q1' }))
  }

  const handleAddQ = (annualObjId, qKey, levelId) => {
    onAddObjective({ parentObjectiveId: annualObjId, period: qKey, level_id: levelId })
  }

  // 組織フィルタリング（選択したレベルのOKRのみ表示、子孫は含めない）
  const filteredObjs = activeLevelId
    ? annualObjs.filter(o => Number(o.level_id) === Number(activeLevelId))
    : annualObjs

  if (loading) return <div style={{ padding: 40, color: T().addBtnBg, fontSize: 14 }}>読み込み中...</div>
  if (!levels?.length) return <div style={{ padding: 40, color: T().addBtnBg, fontSize: 14 }}>読み込み中...</div>

  if (!filteredObjs.length) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: T().textFaint, border: `1px dashed ${T().borderDash}`, borderRadius: 14, maxWidth: 600, margin: '40px auto' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 15, marginBottom: 6, color: T().text }}>{activeLevelId ? 'この組織の' : ''}{fiscalYear}年度の通期OKRがありません</div>
      <div style={{ fontSize: 13 }}>まず「通期」の目標を追加してください</div>
    </div>
  )

  return (
    <div style={{ padding: '24px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: T().text }}>年間ブレイクダウン</div>
          <div style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: `${T().addBtnBg}15`, color: T().addBtnBg, border: `1px solid ${T().addBtnBg}40` }}>
            📅 {fiscalYear}年度
          </div>
        </div>
        <div style={{ fontSize: 13, color: T().textMuted }}>通期OKRをクリックして四半期への展開を確認・管理できます</div>
      </div>

      {filteredObjs.map(ann => {
        const prog = calcObjProgress(ann.key_results)
        const r = getRating(prog)
        const depth = getAbsoluteDepth(ann.level_id, levels)
        const lColor = LAYER_COLORS[depth] || '#a0a8be'
        const lLabel = { 0: '経営', 1: '事業部', 2: 'チーム' }[depth] || ''
        const levelName = levels.find(l => Number(l.id) === Number(ann.level_id))?.name || ''
        const levelIcon = levels.find(l => Number(l.id) === Number(ann.level_id))?.icon || ''
        const isOpen = expanded[ann.id]
        const curQ = activeQ[ann.id] || 'q1'
        const qData = quarterMap[ann.id] || { q1: [], q2: [], q3: [], q4: [] }

        return (
          <div key={ann.id} style={{ marginBottom: 16, background: T().bgCard, border: `1px solid ${isOpen ? lColor + '40' : lColor + '18'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}>

            {/* 通期ヘッダー */}
            <div onClick={() => toggleExpand(ann.id)} style={{ padding: '18px 20px', cursor: 'pointer', borderLeft: `4px solid ${lColor}`, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${lColor}15`, color: lColor, fontWeight: 600 }}>{levelIcon} {levelName}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: T().badgePeriodBg, color: T().textMuted }}>通期</span>
                  {r && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${r.color}18`, color: r.color, fontWeight: 700 }}>{r.label}</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T().textSub, lineHeight: 1.4, marginBottom: ann.owner ? 6 : 10 }}>{ann.title}</div>
                {ann.owner && <div style={{ fontSize: 11, color: T().textMuted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Avatar name={ann.owner} avatarUrl={members.find(m=>m.name===ann.owner)?.avatar_url} size={18} />
                  <span>担当：{ann.owner}</span>
                </div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length) : null
                    const qr = qProg != null ? getRating(qProg) : null
                    return (
                      <div key={qKey} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, fontWeight: 600, background: qr ? `${qr.color}15` : T().badgePeriodBg, color: qr ? qr.color : T().textFaintest, border: `1px solid ${qr ? qr.color + '30' : T().borderLight}` }}>
                        {Q_LABELS[qKey]} {qProg != null ? `${qProg}%` : '未設定'}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: r?.color || T().textFaint }}>{ann.key_results.length ? `${prog}%` : '−'}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {onEdit && <button onClick={e => { e.stopPropagation(); onEdit(ann) }} style={{ background: T().btnEditBg, border: `1px solid ${T().btnEditBorder}`, color: T().btnEditColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                  {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(ann.id) }} style={{ background: T().btnDelBg, border: `1px solid ${T().btnDelBorder}`, color: T().btnDelColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                  <div style={{ fontSize: 16, color: isOpen ? T().btnEditColor : T().textFaint, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</div>
                </div>
              </div>
            </div>

            {/* 展開：四半期ドリルダウン */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T().border}`, background: T().bgExpanded }}>
                <div style={{ display: 'flex', borderBottom: `1px solid ${T().border}` }}>
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length) : null
                    const qr = qProg != null ? getRating(qProg) : null
                    const isActive = curQ === qKey
                    return (
                      <button key={qKey} onClick={() => setActiveQ(p => ({ ...p, [ann.id]: qKey }))} style={{ flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer', background: isActive ? T().tabActiveBg : 'transparent', borderBottom: isActive ? `2px solid ${qr?.color || T().addBtnBg}` : '2px solid transparent', color: isActive ? (qr?.color || T().addBtnBg) : qObjs.length ? T().textMuted : T().textFaintest, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s' }}>
                        {Q_LABELS[qKey]}
                        <div style={{ fontSize: 10, marginTop: 2, fontWeight: 400 }}>{qProg != null ? `${qProg}%` : qObjs.length ? '計画中' : '未設定'}</div>
                      </button>
                    )
                  })}
                </div>

                <div style={{ padding: '18px 20px' }}>
                  {qData[curQ]?.length > 0 ? (
                    <div>
                      {qData[curQ].map(qObj => {
                        const qProg = calcObjProgress(qObj.key_results)
                        const qr = getRating(qProg)
                        return (
                          <div key={qObj.id} style={{ marginBottom: 14 }}>
                            <div style={{ background: T().bgInner, border: `1px solid ${qr.color}25`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${qr.color}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${qr.color}18`, color: qr.color, fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>{qr.label}</span>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: T().textSub, lineHeight: 1.4 }}>{qObj.title}</div>
                                  {qObj.owner && <div style={{ fontSize: 11, color: T().textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Avatar name={qObj.owner} avatarUrl={members.find(m=>m.name===qObj.owner)?.avatar_url} size={16} />
                                    <span>担当：{qObj.owner}</span>
                                  </div>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                                  <div style={{ fontSize: 24, fontWeight: 800, color: qr.color }}>{qProg}%</div>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    {onEdit && <button onClick={() => onEdit(qObj)} style={{ background: T().btnEditBg, border: `1px solid ${T().btnEditBorder}`, color: T().btnEditColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                                    {onDelete && <button onClick={() => onDelete(qObj.id)} style={{ background: T().btnDelBg, border: `1px solid ${T().btnDelBorder}`, color: T().btnDelColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                                  </div>
                                </div>
                              </div>
                              <div style={{ height: 5, background: T().progressBg, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                                <div style={{ height: '100%', width: `${Math.min(qProg, 100)}%`, background: qr.color, borderRadius: 99 }} />
                              </div>
                              {qObj.key_results.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ fontSize: 10, color: T().textFaint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>この四半期のKR</div>
                                  {qObj.key_results.map((kr, i) => {
                                    const kp = kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0
                                    const kr_r = getRating(kp)
                                    return (
                                      <div key={i} style={{ marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T().bgKr, borderRadius: 7, padding: '7px 10px' }}>
                                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${kr_r.color}18`, color: kr_r.color, fontWeight: 700, flexShrink: 0 }}>{kr_r.label}</span>
                                          <span style={{ fontSize: 11, color: T().textSub, flex: 1, minWidth: 0 }}>{kr.title}</span>
                                          {kr.owner && <Avatar name={kr.owner} avatarUrl={members.find(m=>m.name===kr.owner)?.avatar_url} size={18} />}
                                          <div style={{ width: 80, height: 3, background: T().progressBg, borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                                            <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                                          </div>
                                          <span style={{ fontSize: 11, color: kr_r.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{kr.current?.toLocaleString()}{kr.unit} / {kr.target?.toLocaleString()}{kr.unit}</span>
                                        </div>
                                        <div style={{ marginLeft: 16 }}>
                                          <KASection krId={kr.id} objectiveId={qObj.id} levelId={qObj.level_id} theme={makeKATheme(T())} />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {ann.key_results.length > 0 && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T().border}` }}>
                          <div style={{ fontSize: 11, color: T().textFaint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>通期KRへの貢献（累計）</div>
                          {ann.key_results.map((kr, i) => {
                            const kp = kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0
                            const kr_r = getRating(kp)
                            return (
                              <div key={i} style={{ marginBottom: 6 }}>
                                <div style={{ background: T().bgKrOuter, border: `1px solid ${T().borderKr}`, borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${kr_r.color}18`, color: kr_r.color, fontWeight: 700, flexShrink: 0 }}>{kr_r.label}</span>
                                  <span style={{ fontSize: 12, color: T().textMuted, flex: 1 }}>{kr.title}</span>
                                  {kr.owner && <Avatar name={kr.owner} avatarUrl={members.find(m=>m.name===kr.owner)?.avatar_url} size={18} />}
                                  <div style={{ width: 100, height: 3, background: T().progressBg, borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                                    <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontSize: 12, color: kr_r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{kr.current?.toLocaleString()}{kr.unit} / {kr.target?.toLocaleString()}{kr.unit}</span>
                                </div>
                                <div style={{ marginLeft: 16 }}>
                                  <KASection krId={kr.id} objectiveId={ann.id} levelId={ann.level_id} theme={makeKATheme(T())} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '28px 20px', border: `1px dashed ${T().borderDash}`, borderRadius: 12, color: T().textFaint }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>＋</div>
                      <div style={{ fontSize: 13, marginBottom: 4, color: T().textMuted }}>{Q_LABELS[curQ]}のOKRを追加</div>
                      <div style={{ fontSize: 11, color: T().textFaintest, marginBottom: 16 }}>この通期OKRに紐づいた四半期目標を設定します</div>
                      <button onClick={() => handleAddQ(ann.id, curQ, ann.level_id)} style={{ background: T().addBtnBg, border: 'none', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ＋ {Q_LABELS[curQ]} OKRを追加
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
