'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import KASection from './KASection'
import { COMMON_TOKENS } from '../lib/themeTokens'

// KASection に渡すテーマオブジェクト (OwnerOKRView の THEMES から抽出)
function makeKATheme(t) {
  return {
    accent:       t.btnEditColor || '#4d9fff',
    accentSolid:  t.btnEditColor || '#4d9fff',
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

// テーマは lib/themeTokens.js で一元管理。固有フィールドだけ上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    bgKr: 'rgba(255,255,255,0.03)',
    borderDash: 'rgba(255,255,255,0.08)',
    progressBg: 'rgba(255,255,255,0.06)',
    btnEditBg: 'rgba(10,132,255,0.16)', btnEditBorder: 'rgba(10,132,255,0.30)', btnEditColor: '#0A84FF',
    btnDelBg: 'rgba(255,69,58,0.16)', btnDelBorder: 'rgba(255,69,58,0.30)', btnDelColor: '#FF453A',
  },
  light: {
    ...COMMON_TOKENS.light,
    bgKr: 'rgba(0,0,0,0.03)',
    borderDash: 'rgba(0,0,0,0.10)',
    progressBg: 'rgba(0,0,0,0.06)',
    btnEditBg: 'rgba(0,122,255,0.10)', btnEditBorder: 'rgba(0,122,255,0.30)', btnEditColor: '#007AFF',
    btnDelBg: 'rgba(255,59,48,0.10)', btnDelBorder: 'rgba(255,59,48,0.30)', btnDelColor: '#FF3B30',
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

const KA_STATUS = {
  focus:  { label: '注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)' },
  good:   { label: 'Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)' },
  more:   { label: 'More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)' },
  normal: { label: '−',    color: '#606880', bg: 'rgba(255,255,255,0.04)' },
}

function ReadOnlyKARow({ ka }) {
  const cfg = KA_STATUS[ka.status] || KA_STATUS.normal
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 11 }}>
      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(168,85,247,0.12)', color: '#a855f7', flexShrink: 0 }}>KA</span>
      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {cfg.label}
      </span>
      <span style={{ color: T().textSub, flex: 1, minWidth: 0 }}>
        {ka.ka_title || '(無題)'}
      </span>
      {ka.owner && <span style={{ fontSize: 10, color: T().textMuted, flexShrink: 0 }}>👤 {ka.owner}</span>}
    </div>
  )
}

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
  const [kaReports, setKaReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [activePeriod, setActivePeriod] = useState('q1')
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'obj' | 'kr' | 'ka'

  useEffect(() => {
    if (!ownerName) { setObjectives([]); setKaReports([]); setLoading(false); return }
    loadData()
  }, [ownerName, fiscalYear, refreshKey]) // eslint-disable-line

  const loadData = async () => {
    setLoading(true)

    const filterByFY = (arr) => (arr || []).filter(o => {
      if (fiscalYear === '2026') return !o.period.includes('_')
      return o.period.startsWith(`${fiscalYear}_`)
    })

    // 1. ownerNameが担当のObjectives + KAを並行取得
    const [{ data: objs }, { data: myKAs }, { data: myKRs }] = await Promise.all([
      supabase.from('objectives').select('id,level_id,period,title,owner,parent_objective_id').eq('owner', ownerName).order('period,id').range(0, 49999),
      supabase.from('weekly_reports').select('*').eq('owner', ownerName).neq('status', 'done').range(0, 49999),
      supabase.from('key_results').select('*').eq('owner', ownerName).range(0, 49999),
    ])

    // 年度フィルタ
    const filtered = filterByFY(objs)
    const objIds = filtered.map(o => o.id)

    // KAのみ担当の場合も含め、早期returnはOKR・KR・KA全て空の場合のみ
    if (!filtered.length && !(myKRs || []).length && !(myKAs || []).length) {
      setObjectives([]); setKaReports([]); setLoading(false); return
    }

    // 2. KR取得（自分がObjective担当のもの）
    let objKRs = []
    if (objIds.length > 0) {
      const { data } = await supabase.from('key_results').select('*').in('objective_id', objIds).range(0, 49999)
      objKRs = data || []
    }

    // 3. KR担当・KA担当のObjectiveも追加取得
    const krObjIds = (myKRs || []).map(kr => kr.objective_id).filter(id => !objIds.includes(id))
    const kaObjIds = (myKAs || []).map(r => r.objective_id).filter(Boolean).filter(id => !objIds.includes(id) && !krObjIds.includes(id))
    const missingObjIds = [...new Set([...krObjIds, ...kaObjIds])]
    let extraObjs = []
    if (missingObjIds.length > 0) {
      const { data } = await supabase.from('objectives').select('id,level_id,period,title,owner,parent_objective_id').in('id', missingObjIds).range(0, 49999)
      extraObjs = filterByFY(data)
    }

    // 全Objectiveを統合
    const allObjs = [...filtered, ...extraObjs].filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i)

    // KRマップ作成
    const allKRs = [...objKRs, ...(myKRs || [])].filter((kr, i, arr) => arr.findIndex(k => k.id === kr.id) === i)
    const krMap = {}
    allKRs.forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
      krMap[kr.objective_id].push(kr)
    })

    // 追加Objectiveに不足しているKRも取得
    const extraIds = extraObjs.map(o => o.id).filter(id => !krMap[id])
    if (extraIds.length > 0) {
      const { data } = await supabase.from('key_results').select('*').in('objective_id', extraIds).range(0, 49999)
      ;(data || []).forEach(kr => {
        if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
        krMap[kr.objective_id].push(kr)
      })
    }

    const fullObjs = allObjs.map(o => ({ ...o, key_results: krMap[o.id] || [] }))
    // 期間順にソート
    fullObjs.sort((a, b) => (PERIOD_ORDER[rawPeriod(a.period)] ?? 9) - (PERIOD_ORDER[rawPeriod(b.period)] ?? 9))

    // 4. 表示する全ObjectiveのKAを取得（担当者本人のKA + Objective配下の全KA）
    const allObjIds = fullObjs.map(o => o.id)
    let allKAs = [...(myKAs || [])]
    if (allObjIds.length > 0) {
      const { data: objKAsData } = await supabase.from('weekly_reports').select('*').in('objective_id', allObjIds).neq('status', 'done')
      allKAs = [...allKAs, ...(objKAsData || [])].filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
    }

    // ★ 週コピーで同じKAが複数週に存在する場合、最新週のもの1つだけ残す
    const kaByKey = {}
    for (const ka of allKAs) {
      const key = `${ka.kr_id}_${ka.ka_title}_${ka.owner}_${ka.objective_id}`
      if (!kaByKey[key] || (ka.week_start || '') > (kaByKey[key].week_start || '')) {
        kaByKey[key] = ka
      }
    }
    const dedupedKAs = Object.values(kaByKey)

    setObjectives(fullObjs)
    setKaReports(dedupedKAs.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)))
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
  const allPeriods = ['q1', 'q2', 'q3', 'q4', 'annual']
  const availablePeriods = allPeriods.filter(k => grouped[k]?.length)
  const effectivePeriod = grouped[activePeriod]?.length ? activePeriod : (availablePeriods[0] || 'q1')
  const currentObjs = grouped[effectivePeriod] || []

  // サマリー計算（自分が担当しているもののみカウント）
  const totalObj = currentObjs.filter(o => o.owner === ownerName).length
  const totalKR = currentObjs.reduce((s, o) => s + o.key_results.filter(kr => kr.owner === ownerName).length, 0)
  const totalKA = currentObjs.reduce((s, o) => s + kaReports.filter(r => Number(r.objective_id) === Number(o.id) && r.owner === ownerName).length, 0)

  // フィルター適用
  const filteredObjs = currentObjs.filter(obj => {
    if (filterMode === 'all') return true
    if (filterMode === 'obj') return obj.owner === ownerName
    if (filterMode === 'kr') return obj.key_results.some(kr => kr.owner === ownerName)
    if (filterMode === 'ka') return kaReports.some(r => Number(r.objective_id) === Number(obj.id) && r.owner === ownerName)
    return true
  })

  if (!availablePeriods.length) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: T().textFaint, maxWidth: 600, margin: '40px auto' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, color: T().text }}>{ownerName} さんのOKRがありません</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{fiscalYear}年度のOKRが設定されていません</div>
    </div>
  )

  return (
    <div style={{ padding: '24px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: T().text }}>{ownerName}</div>
          <div style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: `${T().btnEditColor}15`, color: T().btnEditColor, border: `1px solid ${T().btnEditColor}40` }}>
            📅 {fiscalYear}年度
          </div>
        </div>
        <div style={{ fontSize: 13, color: T().textMuted }}>担当するOKRの一覧と進捗状況</div>
      </div>

      {/* 期間タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {allPeriods.map(p => {
          const count = (grouped[p] || []).length
          const isActive = activePeriod === p
          return (
            <button key={p} onClick={() => setActivePeriod(p)} style={{
              padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, border: `1px solid ${effectivePeriod === p ? T().btnEditColor + '60' : T().border}`,
              background: effectivePeriod === p ? `${T().btnEditColor}15` : 'transparent',
              color: effectivePeriod === p ? T().btnEditColor : count ? T().textSub : T().textFaint,
              opacity: count ? 1 : 0.5,
            }}>
              {PERIOD_LABELS[p]} {count > 0 && <span style={{ fontSize: 10, marginLeft: 4 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {/* サマリーカード（フィルター機能付き） */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: '全て', count: totalObj + totalKR + totalKA, color: T().textSub },
          { key: 'obj', label: 'Objective', count: totalObj, color: '#4d9fff' },
          { key: 'kr', label: 'Key Result', count: totalKR, color: '#00d68f' },
          { key: 'ka', label: 'Key Action', count: totalKA, color: '#a855f7' },
        ].map(f => (
          <div key={f.key} onClick={() => setFilterMode(f.key)} style={{
            padding: '10px 18px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
            background: filterMode === f.key ? `${f.color}12` : T().sectionBg,
            border: `2px solid ${filterMode === f.key ? f.color : T().border}`,
          }}>
            <div style={{ fontSize: 10, color: filterMode === f.key ? f.color : T().textMuted, fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: f.color }}>{f.count}<span style={{ fontSize: 11, color: T().textMuted, marginLeft: 2 }}>件</span></div>
          </div>
        ))}
      </div>

      {/* Objective一覧 */}
      {filteredObjs.length === 0 && (
        <div style={{ padding: '30px 20px', textAlign: 'center', color: T().textFaint, fontSize: 13 }}>該当するOKRがありません</div>
      )}
      <div>
          {filteredObjs.map(obj => {
            const prog = calcObjProgress(obj.key_results)
            const r = getRating(prog)
            const depth = getAbsoluteDepth(obj.level_id, levels)
            const lColor = LAYER_COLORS[depth] || '#a0a8be'
            const levelName = levels.find(l => Number(l.id) === Number(obj.level_id))?.name || ''
            const levelIcon = levels.find(l => Number(l.id) === Number(obj.level_id))?.icon || ''
            const objKAs = kaReports.filter(r => Number(r.objective_id) === Number(obj.id))
            const isObjOwner = obj.owner === ownerName
            const isKROwner = obj.key_results.some(kr => kr.owner === ownerName)
            const isKAOnly = !isObjOwner && !isKROwner && objKAs.length > 0

            return (
              <div key={obj.id} style={{ marginBottom: 12, background: T().bgCard, border: `1px solid ${lColor}18`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 18px', borderLeft: `4px solid ${lColor}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: 'rgba(77,159,255,0.12)', color: '#4d9fff' }}>OBJ</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${lColor}15`, color: lColor, fontWeight: 600 }}>{levelIcon} {levelName}</span>
                      {isObjOwner && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(77,159,255,0.1)', color: '#4d9fff', border: '1px solid rgba(77,159,255,0.3)', fontWeight: 600 }}>👤 責任者</span>
                      )}
                      {!isObjOwner && isKROwner && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: T().sectionBg, color: T().textMuted, border: `1px solid ${T().border}` }}>KR担当</span>
                      )}
                      {isKAOnly && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: T().sectionBg, color: T().textMuted, border: `1px solid ${T().border}` }}>KA担当</span>
                      )}
                      {r && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${r.color}18`, color: r.color, fontWeight: 700 }}>{r.label}</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T().textSub, lineHeight: 1.4, marginBottom: 4 }}>{obj.title}</div>
                    {obj.owner && (
                      <div style={{ fontSize: 11, color: isObjOwner ? '#4d9fff' : T().textMuted, marginBottom: 4 }}>👤 {obj.owner}{isObjOwner ? '' : '（Objective担当）'}</div>
                    )}

                    {obj.key_results.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {obj.key_results.map((kr, i) => {
                          const kp = kr.target > 0 ? Math.round((kr.lower_is_better ? Math.max(0, ((kr.target * 2 - kr.current) / kr.target) * 100) : (kr.current / kr.target) * 100)) : 0
                          const kr_r = getRating(kp)
                          const isMyKR = kr.owner === ownerName
                          const krKAs = objKAs.filter(ka => Number(ka.kr_id) === Number(kr.id))
                          return (
                            <div key={i} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: T().bgKr, borderRadius: 7, border: isMyKR ? `1px solid ${T().btnEditColor}20` : 'none' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,214,143,0.12)', color: '#00d68f', flexShrink: 0 }}>KR</span>
                                <span style={{ fontSize: 11, color: T().textSub, flex: 1, minWidth: 0 }}>
                                  {kr.title}
                                </span>
                                {kr.owner && <span style={{ fontSize: 10, fontWeight: 600, color: isMyKR ? T().btnEditColor : T().textMuted, flexShrink: 0 }}>👤 {kr.owner}</span>}
                                <div style={{ width: 60, height: 3, background: T().progressBg, borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                                  <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 11, color: kr_r.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{kp}%</span>
                              </div>
                              <div style={{ marginLeft: 16, borderLeft: `2px solid ${T().border}`, paddingLeft: 8, marginTop: 2, marginBottom: 2 }}>
                                <KASection krId={kr.id} objectiveId={obj.id} levelId={obj.level_id} theme={makeKATheme(T())} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {(() => {
                      const krIds = new Set(obj.key_results.map(kr => Number(kr.id)))
                      const unlinked = objKAs.filter(ka => !ka.kr_id || !krIds.has(Number(ka.kr_id)))
                      if (!unlinked.length) return null
                      return (
                        <div style={{ marginTop: 6, paddingTop: 4, borderTop: `1px dashed ${T().borderDash}` }}>
                          <div style={{ fontSize: 10, color: T().textMuted, fontWeight: 600, marginBottom: 2 }}>📋 その他のKA（{unlinked.length}件）</div>
                          {unlinked.map(ka => <ReadOnlyKARow key={ka.id} ka={ka} />)}
                        </div>
                      )
                    })()}
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
    </div>
  )
}
