'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buildQuarterMap } from '../lib/objectiveMatching'
import { COMMON_TOKENS } from '../lib/themeTokens'
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
// テーマは lib/themeTokens.js で一元管理。固有フィールドだけ上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    bgExpanded: 'rgba(0,0,0,0.2)',
    bgInner: 'rgba(255,255,255,0.03)', bgKr: 'rgba(255,255,255,0.03)',
    bgKrOuter: 'rgba(255,255,255,0.02)',
    borderDash: 'rgba(255,255,255,0.08)',
    borderKr: 'rgba(255,255,255,0.06)',
    progressBg: 'rgba(255,255,255,0.06)',
    btnEditBg: 'rgba(10,132,255,0.16)', btnEditBorder: 'rgba(10,132,255,0.30)', btnEditColor: '#0A84FF',
    btnDelBg: 'rgba(255,69,58,0.16)', btnDelBorder: 'rgba(255,69,58,0.30)', btnDelColor: '#FF453A',
    tabActiveBg: 'rgba(255,255,255,0.05)',
    badgePeriodBg: 'rgba(255,255,255,0.06)',
    addBtnBg: '#0A84FF',
    refBg: 'rgba(48,209,88,0.16)', refBorder: 'rgba(48,209,88,0.30)',
  },
  light: {
    ...COMMON_TOKENS.light,
    bgExpanded: 'rgba(0,0,0,0.03)',
    bgInner: 'rgba(0,0,0,0.02)', bgKr: 'rgba(0,0,0,0.03)',
    bgKrOuter: 'rgba(0,0,0,0.02)',
    borderDash: 'rgba(0,0,0,0.10)',
    borderKr: 'rgba(0,0,0,0.06)',
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
    <div style={{ padding: '0 24px 24px', maxWidth: 1400, margin: '0 auto', position: 'relative' }}>
      <div aria-hidden style={{
        position: 'absolute', top: -150, left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 400,
        background: `radial-gradient(ellipse, ${T().addBtnBg}18 0%, transparent 60%)`,
        pointerEvents: 'none', filter: 'blur(40px)', zIndex: 0,
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ marginBottom: 22, padding: '20px 0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: T().text, margin: 0, letterSpacing: '-0.02em' }}>年間ブレイクダウン</h1>
          <div style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: `${T().addBtnBg}15`, color: T().addBtnBg }}>
            📅 {fiscalYear}年度
          </div>
        </div>
        <div style={{ fontSize: 13, color: T().textMuted, fontWeight: 500 }}>通期OKRをクリックして四半期への展開を確認・管理できます</div>
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
        const qData = quarterMap[ann.id] || { q1: [], q2: [], q3: [], q4: [] }

        return (
          <div key={ann.id} style={{
            marginBottom: 18,
            background: `linear-gradient(180deg, ${T().bgCard} 0%, ${lColor}05 100%)`,
            border: `1px solid ${isOpen ? lColor + '40' : lColor + '15'}`,
            borderRadius: 18, overflow: 'hidden',
            position: 'relative',
            boxShadow: isOpen
              ? `0 1px 2px rgba(0,0,0,0.05), 0 8px 24px ${lColor}26, 0 16px 40px rgba(0,0,0,0.04)`
              : '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
            transition: 'all 0.25s ease',
          }}>
            {/* 上端に薄い色グラデ帯 (左の太線の代わり) */}
            <div aria-hidden style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, ${lColor} 0%, ${lColor}80 100%)`,
            }} />
            {/* 右上に放射状グロウ */}
            <div aria-hidden style={{
              position: 'absolute', top: -40, right: -40, width: 200, height: 200,
              background: `radial-gradient(circle, ${lColor}10 0%, transparent 65%)`,
              pointerEvents: 'none',
            }} />

            {/* 通期ヘッダー */}
            <div onClick={() => toggleExpand(ann.id)} style={{
              padding: '20px 24px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 14,
              position: 'relative', zIndex: 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: `${lColor}1f`, color: lColor, fontWeight: 700 }}>{levelIcon} {levelName}</span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textMuted, fontWeight: 700 }}>通期</span>
                  {r && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: `${r.color}1f`, color: r.color, fontWeight: 800 }}>{r.label}</span>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T().text, lineHeight: 1.45, marginBottom: ann.owner ? 8 : 12, letterSpacing: '-0.01em' }}>{ann.title}</div>
                {ann.owner && <div style={{ fontSize: 11, color: T().textMuted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar name={ann.owner} avatarUrl={members.find(m=>m.name===ann.owner)?.avatar_url} size={20} />
                  <span style={{ fontWeight: 600 }}>担当：{ann.owner}</span>
                </div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length) : null
                    const qr = qProg != null ? getRating(qProg) : null
                    return (
                      <div key={qKey} style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 8, fontWeight: 700,
                        background: qr ? `${qr.color}15` : 'rgba(0,0,0,0.04)',
                        color: qr ? qr.color : T().textFaintest,
                      }}>
                        {Q_LABELS[qKey]} {qProg != null ? `${qProg}%` : '未設定'}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: r?.color || T().textFaint, letterSpacing: '-0.02em' }}>{ann.key_results.length ? `${prog}%` : '−'}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {onEdit && <button onClick={e => { e.stopPropagation(); onEdit(ann) }} style={{ background: T().btnEditBg, border: 'none', color: T().btnEditColor, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                  {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(ann.id) }} style={{ background: T().btnDelBg, border: 'none', color: T().btnDelColor, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                  <div style={{ fontSize: 18, color: isOpen ? lColor : T().textFaint, transition: 'transform 0.25s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</div>
                </div>
              </div>
            </div>

            {/* 展開：四半期 4 列ビュー (Q1〜Q4 を同時表示して編集できる表形式) */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T().border}`, background: T().bgExpanded, padding: '14px 16px' }}>
                {/* Q1〜Q4 を 1 行 4 列で固定表示 (会議で全四半期を同時に確認・編集) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 10,
                  marginBottom: ann.key_results.length > 0 ? 16 : 0,
                }}>
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length) : null
                    const qr = qProg != null ? getRating(qProg) : null
                    const accent = qr?.color || T().textFaint
                    return (
                      <div key={qKey} style={{
                        background: T().bgInner,
                        border: `1px solid ${accent}30`,
                        borderTop: `3px solid ${accent}`,
                        borderRadius: 10,
                        padding: 12,
                        minHeight: 180,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}>
                        {/* Q ラベル + 進捗 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: accent, letterSpacing: '0.05em' }}>{Q_LABELS[qKey]}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: accent }}>
                            {qProg != null ? `${qProg}%` : (qObjs.length ? '計画中' : '未設定')}
                          </span>
                        </div>

                        {qObjs.length > 0 ? qObjs.map(qObj => {
                          const objProg = calcObjProgress(qObj.key_results)
                          const objR = getRating(objProg)
                          return (
                            <div key={qObj.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {/* Q OKR タイトル + 編集/削除 */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: T().textSub, lineHeight: 1.4 }}>
                                  {qObj.title}
                                </div>
                                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                  {onEdit && <button onClick={() => onEdit(qObj)} style={{ background: T().btnEditBg, border: 'none', color: T().btnEditColor, borderRadius: 5, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                                  {onDelete && <button onClick={() => onDelete(qObj.id)} style={{ background: T().btnDelBg, border: 'none', color: T().btnDelColor, borderRadius: 5, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                                </div>
                              </div>
                              {qObj.owner && (
                                <div style={{ fontSize: 10, color: T().textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Avatar name={qObj.owner} avatarUrl={members.find(m=>m.name===qObj.owner)?.avatar_url} size={14} />
                                  <span>{qObj.owner}</span>
                                </div>
                              )}
                              <div style={{ height: 4, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(objProg, 100)}%`, background: objR.color, borderRadius: 99 }} />
                              </div>
                              {/* KR リスト (コンパクト) */}
                              {qObj.key_results.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                  {qObj.key_results.map((kr, i) => {
                                    const kp = kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0
                                    const kr_r = getRating(kp)
                                    return (
                                      <div key={i} style={{ background: T().bgKr, borderRadius: 6, padding: '6px 8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: `${kr_r.color}18`, color: kr_r.color, fontWeight: 700, flexShrink: 0 }}>{kr_r.label}</span>
                                          <span style={{ fontSize: 11, color: T().textSub, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={kr.title}>{kr.title}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          <div style={{ flex: 1, height: 3, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                                          </div>
                                          <span style={{ fontSize: 9, color: kr_r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{kr.current?.toLocaleString()}/{kr.target?.toLocaleString()}{kr.unit}</span>
                                        </div>
                                        <div style={{ marginTop: 4 }}>
                                          <KASection krId={kr.id} objectiveId={qObj.id} levelId={qObj.level_id} theme={makeKATheme(T())} />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        }) : (
                          // 未作成: + 作成ボタン
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 8px', border: `1px dashed ${T().borderDash}`, borderRadius: 8, color: T().textFaint }}>
                            <div style={{ fontSize: 11, marginBottom: 8, color: T().textMuted }}>{Q_LABELS[qKey]} OKR 未作成</div>
                            <button onClick={() => handleAddQ(ann.id, qKey, ann.level_id)} style={{ background: T().addBtnBg, border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              ＋ 作成
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 通期KR累計貢献 (4 列の下にフルワイドで配置) */}
                {ann.key_results.length > 0 && (
                  <div style={{ paddingTop: 12, borderTop: `1px solid ${T().border}` }}>
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
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}
