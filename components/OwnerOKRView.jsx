'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const THEMES = {
  dark: {
    bg: '#0F1117', bgCard: '#111828', bgKr: 'rgba(255,255,255,0.03)',
    text: '#E8ECF0', textSub: '#dde0ec', textMuted: '#606880',
    textFaint: '#404660', textFaintest: '#303650',
    border: 'rgba(255,255,255,0.06)', borderDash: 'rgba(255,255,255,0.08)',
    progressBg: 'rgba(255,255,255,0.06)',
    btnEditBg: 'rgba(77,159,255,0.12)', btnEditBorder: 'rgba(77,159,255,0.25)', btnEditColor: '#4d9fff',
    btnDelBg: 'rgba(255,107,107,0.1)', btnDelBorder: 'rgba(255,107,107,0.2)', btnDelColor: '#ff6b6b',
    sectionBg: 'rgba(255,255,255,0.02)',
  },
  light: {
    bg: '#EEF2F5', bgCard: '#FFFFFF', bgKr: '#F5F7FA',
    text: '#2D3748', textSub: '#2D3748', textMuted: '#5A6577',
    textFaint: '#A0AEC0', textFaintest: '#DDE4EA',
    border: '#E2E8F0', borderDash: '#CBD5E0',
    progressBg: '#E8EEF2',
    btnEditBg: '#EBF4FF', btnEditBorder: '#B3D4FC', btnEditColor: '#3B82C4',
    btnDelBg: '#FFF1F0', btnDelBorder: '#FECACA', btnDelColor: '#DC6B6B',
    sectionBg: '#F8FAFC',
  },
}

let _t = THEMES.dark
const T = () => _t

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

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }

function toPeriodKey(period, fiscalYear) {
  return fiscalYear === '2026' ? period : `${fiscalYear}_${period}`
}
function rawPeriod(period) { return period?.includes('_') ? period.split('_').pop() : period }

const PERIOD_ORDER = { annual: 0, q1: 1, q2: 2, q3: 3, q4: 4 }
const PERIOD_LABELS = { annual: '通期', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }

export default function OwnerOKRView({ ownerName, levels, fiscalYear = '2026', themeKey = 'dark', onEdit, onDelete, refreshKey }) {
  _t = THEMES[themeKey] || THEMES.dark

  const [objectives, setObjectives] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ownerName) { setObjectives([]); setLoading(false); return }
    loadData()
  }, [ownerName, fiscalYear, refreshKey]) // eslint-disable-line

  const loadData = async () => {
    setLoading(true)

    // 1. ownerNameが担当のObjectivesを取得
    const { data: objs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .eq('owner', ownerName)
      .order('period,id')

    // 年度フィルタ
    const filtered = (objs || []).filter(o => {
      if (fiscalYear === '2026') return !o.period.includes('_')
      return o.period.startsWith(`${fiscalYear}_`)
    })

    if (!filtered.length) { setObjectives([]); setLoading(false); return }

    // 2. KR取得（自分がObjective担当 + 自分がKR担当）
    const objIds = filtered.map(o => o.id)
    const [{ data: objKRs }, { data: myKRs }] = await Promise.all([
      supabase.from('key_results').select('*').in('objective_id', objIds),
      supabase.from('key_results').select('*').eq('owner', ownerName),
    ])

    // KR担当のObjectiveも追加取得
    const krObjIds = (myKRs || []).map(kr => kr.objective_id).filter(id => !objIds.includes(id))
    let extraObjs = []
    if (krObjIds.length > 0) {
      const { data } = await supabase.from('objectives').select('id,level_id,period,title,owner,parent_objective_id').in('id', krObjIds)
      extraObjs = (data || []).filter(o => {
        if (fiscalYear === '2026') return !o.period.includes('_')
        return o.period.startsWith(`${fiscalYear}_`)
      })
    }

    // 全Objectiveを統合
    const allObjs = [...filtered, ...extraObjs].filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i)

    // KRマップ作成
    const allKRs = [...(objKRs || []), ...(myKRs || [])].filter((kr, i, arr) => arr.findIndex(k => k.id === kr.id) === i)
    const krMap = {}
    allKRs.forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
      krMap[kr.objective_id].push(kr)
    })

    // 追加Objectiveに不足しているKRも取得
    const extraIds = extraObjs.map(o => o.id).filter(id => !krMap[id])
    if (extraIds.length > 0) {
      const { data } = await supabase.from('key_results').select('*').in('objective_id', extraIds)
      ;(data || []).forEach(kr => {
        if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
        krMap[kr.objective_id].push(kr)
      })
    }

    const fullObjs = allObjs.map(o => ({ ...o, key_results: krMap[o.id] || [] }))
    // 期間順にソート
    fullObjs.sort((a, b) => (PERIOD_ORDER[rawPeriod(a.period)] ?? 9) - (PERIOD_ORDER[rawPeriod(b.period)] ?? 9))

    setObjectives(fullObjs)
    setLoading(false)
  }

  if (!ownerName) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: T().textFaint }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
      <div style={{ fontSize: 15, color: T().text }}>メンバーを選択してください</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>左のリストからメンバーを選ぶと、その人が担当するOKRが表示されます</div>
    </div>
  )

  if (loading) return <div style={{ padding: 40, color: T().btnEditColor, fontSize: 14 }}>読み込み中...</div>

  // 期間ごとにグループ化
  const grouped = {}
  objectives.forEach(o => {
    const rp = rawPeriod(o.period)
    if (!grouped[rp]) grouped[rp] = []
    grouped[rp].push(o)
  })
  const sections = ['annual', 'q1', 'q2', 'q3', 'q4'].filter(k => grouped[k]?.length)

  if (!sections.length) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: T().textFaint, maxWidth: 600, margin: '40px auto' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, color: T().text }}>{ownerName} さんのOKRがありません</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{fiscalYear}年度のOKRが設定されていません</div>
    </div>
  )

  return (
    <div style={{ padding: '24px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: T().text }}>{ownerName}</div>
          <div style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: `${T().btnEditColor}15`, color: T().btnEditColor, border: `1px solid ${T().btnEditColor}40` }}>
            📅 {fiscalYear}年度
          </div>
        </div>
        <div style={{ fontSize: 13, color: T().textMuted }}>担当するOKRの一覧と進捗状況</div>
      </div>

      {sections.map(sectionKey => (
        <div key={sectionKey} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T().text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ padding: '3px 10px', borderRadius: 6, background: T().sectionBg, border: `1px solid ${T().border}`, fontSize: 12 }}>{PERIOD_LABELS[sectionKey]}</span>
            <span style={{ fontSize: 11, color: T().textFaint }}>{grouped[sectionKey].length}件</span>
          </div>

          {grouped[sectionKey].map(obj => {
            const prog = calcObjProgress(obj.key_results)
            const r = getRating(prog)
            const depth = getAbsoluteDepth(obj.level_id, levels)
            const lColor = LAYER_COLORS[depth] || '#a0a8be'
            const levelName = levels.find(l => Number(l.id) === Number(obj.level_id))?.name || ''
            const levelIcon = levels.find(l => Number(l.id) === Number(obj.level_id))?.icon || ''

            return (
              <div key={obj.id} style={{ marginBottom: 12, background: T().bgCard, border: `1px solid ${lColor}18`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 18px', borderLeft: `4px solid ${lColor}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${lColor}15`, color: lColor, fontWeight: 600 }}>{levelIcon} {levelName}</span>
                      {obj.owner !== ownerName && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: T().sectionBg, color: T().textMuted, border: `1px solid ${T().border}` }}>KR担当</span>
                      )}
                      {r && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${r.color}18`, color: r.color, fontWeight: 700 }}>{r.label}</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T().textSub, lineHeight: 1.4, marginBottom: 4 }}>{obj.title}</div>
                    {obj.owner && obj.owner !== ownerName && (
                      <div style={{ fontSize: 11, color: T().textMuted, marginBottom: 4 }}>Objective担当: {obj.owner}</div>
                    )}

                    {obj.key_results.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {obj.key_results.map((kr, i) => {
                          const kp = kr.target > 0 ? Math.round((kr.lower_is_better ? Math.max(0, ((kr.target * 2 - kr.current) / kr.target) * 100) : (kr.current / kr.target) * 100)) : 0
                          const kr_r = getRating(kp)
                          const isMyKR = kr.owner === ownerName
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, padding: '6px 10px', background: T().bgKr, borderRadius: 7, border: isMyKR ? `1px solid ${T().btnEditColor}20` : 'none' }}>
                              <span style={{ fontSize: 11, color: T().textSub, flex: 1, minWidth: 0 }}>
                                {isMyKR && <span style={{ color: T().btnEditColor, fontWeight: 600, marginRight: 4 }}>★</span>}
                                {kr.title}
                              </span>
                              <div style={{ width: 60, height: 3, background: T().progressBg, borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                                <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                              </div>
                              <span style={{ fontSize: 11, color: kr_r.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{kp}%</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: r?.color || T().textFaint }}>{obj.key_results.length ? `${prog}%` : '−'}</div>
                    {obj.key_results.length > 0 && (
                      <div style={{ height: 4, width: 60, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(prog, 100)}%`, background: r?.color || T().textFaint, borderRadius: 99 }} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4 }}>
                      {onEdit && <button onClick={() => onEdit(obj)} style={{ background: T().btnEditBg, border: `1px solid ${T().btnEditBorder}`, color: T().btnEditColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                      {onDelete && <button onClick={() => onDelete(obj.id)} style={{ background: T().btnDelBg, border: `1px solid ${T().btnDelBorder}`, color: T().btnDelColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
