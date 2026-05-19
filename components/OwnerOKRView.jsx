'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import KASection from './KASection'
import { COMMON_TOKENS } from '../lib/themeTokens'
import Icon from './Icon'

// KASection に渡すテーマオブジェクト (OwnerOKRView の THEMES から抽出)
function makeKATheme(t) {
  return {
    accent:       t.accent,
    accentSolid:  t.accent,
    text:         t.text,
    textSub:      t.textSub,
    textMuted:    t.textMuted,
    textFaint:    t.textFaint,
    textFaintest: t.textFaintest,
    bgCard:       t.bgCard,
    bgCard2:      t.sectionBg,
    border:       t.border,
    borderMid:    t.border,
    badgeBg:      t.accent,
    badgeBorder:  `${t.accent}40`,
  }
}

const THEMES = {
  dark: { ...COMMON_TOKENS.dark },
  light: { ...COMMON_TOKENS.light },
}

let _t = THEMES.dark
const T = () => _t

// 進捗率に応じた色 (4 段階)
function progressColor(t, pct) {
  if (pct >= 100) return t.success
  if (pct >= 60)  return t.accent
  if (pct >= 30)  return t.warn
  return t.danger
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

function rawPeriod(period) { return period?.includes('_') ? period.split('_').pop() : period }

const PERIOD_ORDER = { annual: 0, q1: 1, q2: 2, q3: 3, q4: 4 }
const PERIOD_LABELS = { annual: '通期', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }

// ─── ProgressBar (値で色が変わる 4 段階) ───────────────────────────────
function ProgressBar({ t, value, max = 100, showLabel = false, width }) {
  const pct = Math.min(Math.max(value || 0, 0), 150)
  const color = progressColor(t, pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width }}>
      <div style={{
        flex: 1, height: 4, background: t.sectionBg, borderRadius: 99, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${Math.min(pct, 100)}%`,
          background: color, borderRadius: 99,
          transition: 'width 300ms ease-out',
        }} />
      </div>
      {showLabel && (
        <span style={{
          fontSize: 11, fontWeight: 600, color: t.textSub,
          minWidth: 32, textAlign: 'right',
        }}>{pct}%</span>
      )}
    </div>
  )
}

// ─── Status タイル (KA の状態を 22×22 タイルで表現) ───────────────────
function StatusTile({ t, status }) {
  const cfg = {
    focus:  { bg: `${t.accent}1a`,  fg: t.accent,  mark: '◎' },
    good:   { bg: `${t.success}1a`, fg: t.success, mark: '✓' },
    more:   { bg: `${t.warn}1a`,    fg: t.warn,    mark: '▲' },
    normal: { bg: t.sectionBg,      fg: t.textMuted, mark: '—' },
    done:   { bg: `${t.success}1a`, fg: t.success, mark: '✓' },
  }[status] || { bg: t.sectionBg, fg: t.textMuted, mark: '—' }
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 6,
      background: cfg.bg, color: cfg.fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 600, flexShrink: 0,
    }}>{cfg.mark}</span>
  )
}

// KA タイトル表示用 (ReadOnly)
function KARowMini({ t, ka }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 18px',
      borderBottom: `1px solid ${t.border}`,
    }}>
      <StatusTile t={t} status={ka.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, color: t.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ka.ka_title || '(無題)'}</div>
        {(ka.good || ka.focus_output) && (
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: t.success, fontWeight: 600 }}>K</span> {(ka.good || ka.focus_output || '').slice(0, 60)}
          </div>
        )}
      </div>
      {ka.owner && (
        <span style={{
          fontSize: 11, color: t.textSub,
          minWidth: 80, textAlign: 'right',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ka.owner}</span>
      )}
      {ka.week_start && (
        <span style={{
          fontSize: 11, color: t.textMuted,
          fontFamily: 'ui-monospace, SF Mono, monospace',
          minWidth: 38, textAlign: 'right',
        }}>
          {(() => {
            const [, m, d] = ka.week_start.split('-')
            return `${Number(m)}/${Number(d)}`
          })()}
        </span>
      )}
    </div>
  )
}

export default function OwnerOKRView({ ownerName, levels, fiscalYear = '2026', themeKey = 'dark', onEdit, onDelete, refreshKey }) {
  _t = THEMES[themeKey] || THEMES.dark

  const [objectives, setObjectives] = useState([])
  const [kaReports, setKaReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [activePeriod, setActivePeriod] = useState('q1')

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
    const [{ data: objs }, { data: myKAs }, { data: myKRs }] = await Promise.all([
      supabase.from('objectives').select('id,level_id,period,title,owner,parent_objective_id,archived_at').eq('owner', ownerName).is('archived_at', null).order('period,id').range(0, 49999),
      supabase.from('weekly_reports').select('*').eq('owner', ownerName).neq('status', 'done').range(0, 49999),
      supabase.from('key_results').select('*').eq('owner', ownerName).range(0, 49999),
    ])
    const filtered = filterByFY(objs)
    const objIds = filtered.map(o => o.id)
    if (!filtered.length && !(myKRs || []).length && !(myKAs || []).length) {
      setObjectives([]); setKaReports([]); setLoading(false); return
    }
    let objKRs = []
    if (objIds.length > 0) {
      const { data } = await supabase.from('key_results').select('*').in('objective_id', objIds).range(0, 49999)
      objKRs = data || []
    }
    const krObjIds = (myKRs || []).map(kr => kr.objective_id).filter(id => !objIds.includes(id))
    const kaObjIds = (myKAs || []).map(r => r.objective_id).filter(Boolean).filter(id => !objIds.includes(id) && !krObjIds.includes(id))
    const missingObjIds = [...new Set([...krObjIds, ...kaObjIds])]
    let extraObjs = []
    if (missingObjIds.length > 0) {
      const { data } = await supabase.from('objectives').select('id,level_id,period,title,owner,parent_objective_id,archived_at').in('id', missingObjIds).is('archived_at', null).range(0, 49999)
      extraObjs = filterByFY(data)
    }
    const allObjs = [...filtered, ...extraObjs].filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i)
    const allKRs = [...objKRs, ...(myKRs || [])].filter((kr, i, arr) => arr.findIndex(k => k.id === kr.id) === i)
    const krMap = {}
    allKRs.forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
      krMap[kr.objective_id].push(kr)
    })
    const extraIds = extraObjs.map(o => o.id).filter(id => !krMap[id])
    if (extraIds.length > 0) {
      const { data } = await supabase.from('key_results').select('*').in('objective_id', extraIds).range(0, 49999)
      ;(data || []).forEach(kr => {
        if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
        krMap[kr.objective_id].push(kr)
      })
    }
    const fullObjs = allObjs.map(o => ({ ...o, key_results: krMap[o.id] || [] }))
    fullObjs.sort((a, b) => (PERIOD_ORDER[rawPeriod(a.period)] ?? 9) - (PERIOD_ORDER[rawPeriod(b.period)] ?? 9))

    let allKAs = myKAs || []
    const allObjIds = allObjs.map(o => o.id).filter(id => !allKAs.some(ka => Number(ka.objective_id) === Number(id)))
    if (allObjIds.length > 0) {
      const { data: objKAsData } = await supabase.from('weekly_reports').select('*').in('objective_id', allObjIds).neq('status', 'done')
      allKAs = [...allKAs, ...(objKAsData || [])].filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
    }
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
      <Icon name="user" size={36} stroke={1.4} />
      <div style={{ fontSize: 15, color: T().text, marginTop: 12 }}>メンバーを選択してください</div>
      <div style={{ fontSize: 13, marginTop: 6, color: T().textMuted }}>左のリストからメンバーを選ぶと、その人が担当する OKR が表示されます</div>
    </div>
  )

  if (loading) return <div style={{ padding: 40, color: T().textMuted, fontSize: 13 }}>読み込み中...</div>

  // 期間グループ化
  const grouped = {}
  objectives.forEach(o => {
    const rp = rawPeriod(o.period)
    if (!grouped[rp]) grouped[rp] = []
    grouped[rp].push(o)
  })
  const allPeriods = ['annual', 'q1', 'q2', 'q3', 'q4']
  const availablePeriods = allPeriods.filter(k => grouped[k]?.length)
  const effectivePeriod = grouped[activePeriod]?.length ? activePeriod : (availablePeriods[0] || 'q1')
  const currentObjs = grouped[effectivePeriod] || []

  if (!availablePeriods.length) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: T().textFaint, maxWidth: 600, margin: '40px auto' }}>
      <Icon name="target" size={36} stroke={1.4} />
      <div style={{ fontSize: 15, color: T().text, marginTop: 12 }}>{ownerName} さんの OKR がありません</div>
      <div style={{ fontSize: 13, marginTop: 6, color: T().textMuted }}>{fiscalYear} 年度の OKR が設定されていません</div>
    </div>
  )

  const t = T()
  const periodLabel = effectivePeriod === 'annual' ? '通期' : effectivePeriod.toUpperCase()

  return (
    <div style={{ padding: '24px 28px 80px', maxWidth: 1100, margin: '0 auto', background: t.bg, minHeight: '100%' }}>
      {/* ヘッダー: メンバー名 + 年度 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: t.text, letterSpacing: '-0.005em' }}>
            {ownerName} さんの OKR
          </div>
          <span style={{
            fontSize: 11, fontWeight: 600, color: t.accent,
            padding: '2px 8px', borderRadius: 99,
            background: `${t.accent}1a`, border: `1px solid ${t.accent}40`,
          }}>{fiscalYear}年度</span>
        </div>
        <div style={{ fontSize: 12, color: t.textMuted }}>担当する OKR の一覧と進捗状況</div>
      </div>

      {/* Period strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{
          display: 'inline-flex',
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: 9, overflow: 'hidden',
        }}>
          {allPeriods.map((p, i) => {
            const count = (grouped[p] || []).length
            const isActive = effectivePeriod === p
            return (
              <button key={p} onClick={() => setActivePeriod(p)} style={{
                padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                border: 'none',
                borderRight: i < allPeriods.length - 1 ? `1px solid ${t.border}` : 'none',
                background: isActive ? t.sectionBg : t.bgCard,
                color: isActive ? t.text : (count ? t.textSub : t.textFaint),
                fontWeight: isActive ? 600 : 500,
                opacity: count ? 1 : 0.5,
              }}>
                {PERIOD_LABELS[p]}{count > 0 && <span style={{ marginLeft: 4, fontSize: 10, color: t.textMuted }}>({count})</span>}
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: t.textMuted }}>
          {fiscalYear}年度 · {periodLabel}
        </span>
      </div>

      {/* Objective Cards */}
      {currentObjs.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: t.textFaint, fontSize: 13 }}>
          この期間の OKR はありません
        </div>
      )}

      {currentObjs.map(obj => {
        const prog = calcObjProgress(obj.key_results)
        const objKAs = kaReports.filter(r => Number(r.objective_id) === Number(obj.id))
        const totalKaCount = objKAs.length
        return (
          <div key={obj.id} style={{ marginBottom: 18 }}>
            {/* Objective Card */}
            <div style={{
              padding: 20, marginBottom: 12,
              background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12,
              display: 'flex', alignItems: 'flex-start', gap: 14,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 7,
                background: `${t.accent}1a`, color: t.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name="target" size={16} stroke={1.6} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 600, color: t.textMuted,
                  letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4,
                }}>
                  Objective{obj.owner ? ` · ${obj.owner}` : ''}
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 600, color: t.text,
                  letterSpacing: '-0.005em', lineHeight: 1.25, marginBottom: 12,
                }}>{obj.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ maxWidth: 320, flex: '1 1 200px' }}>
                    <ProgressBar t={t} value={prog} showLabel />
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: t.accent,
                    padding: '2px 8px', borderRadius: 99,
                    background: `${t.accent}1a`, border: `1px solid ${t.accent}40`,
                  }}>KR {obj.key_results.length}件</span>
                  <span style={{
                    fontSize: 11, fontWeight: 500, color: t.textSub,
                    padding: '2px 8px', borderRadius: 99,
                    background: t.sectionBg, border: `1px solid ${t.border}`,
                  }}>KA {totalKaCount}件</span>
                  {onEdit && (
                    <button onClick={() => onEdit(obj)} style={{
                      marginLeft: 'auto',
                      background: 'transparent', border: `1px solid ${t.border}`, color: t.textSub,
                      borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}>編集</button>
                  )}
                </div>
              </div>
            </div>

            {/* KR Blocks */}
            {obj.key_results.map(kr => {
              const kp = kr.target > 0
                ? Math.round((kr.lower_is_better
                    ? Math.max(0, ((kr.target * 2 - kr.current) / kr.target) * 100)
                    : (kr.current / kr.target) * 100))
                : 0
              const krKAs = objKAs.filter(ka => Number(ka.kr_id) === Number(kr.id))
              return (
                <div key={kr.id} style={{
                  marginBottom: 12, padding: 0,
                  background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12,
                  overflow: 'hidden',
                }}>
                  {/* KR ヘッダ */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px',
                    borderBottom: `1px solid ${t.border}`,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: t.accent,
                      padding: '2px 8px', borderRadius: 5,
                      background: `${t.accent}1a`, border: `1px solid ${t.accent}40`,
                      letterSpacing: '0.04em', flexShrink: 0,
                    }}>KR</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{kr.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: t.textSub }}>
                        <span style={{ fontFamily: 'ui-monospace, SF Mono, monospace' }}>
                          {kr.current ?? 0}
                          <span style={{ color: t.textMuted }}> / {kr.target ?? 0} {kr.unit || ''}</span>
                        </span>
                        {kr.owner && (
                          <>
                            <span style={{ width: 1, height: 12, background: t.border }} />
                            <span style={{ fontSize: 11.5, color: t.textSub }}>{kr.owner}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ width: 140, flexShrink: 0 }}>
                      <ProgressBar t={t} value={kp} showLabel />
                    </div>
                  </div>
                  {/* KA セクション (KASection を埋め込み) */}
                  <KASection krId={kr.id} objectiveId={obj.id} levelId={obj.level_id} theme={makeKATheme(t)} />
                </div>
              )
            })}

            {/* その他の KA (KR 紐付けなし) */}
            {(() => {
              const krIds = new Set(obj.key_results.map(kr => Number(kr.id)))
              const unlinked = objKAs.filter(ka => !ka.kr_id || !krIds.has(Number(ka.kr_id)))
              if (!unlinked.length) return null
              return (
                <div style={{
                  marginBottom: 12, padding: 0,
                  background: t.bgCard, border: `1px dashed ${t.border}`, borderRadius: 12,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, color: t.textMuted,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    padding: '12px 18px', borderBottom: `1px solid ${t.border}`,
                  }}>その他の KA ({unlinked.length}件)</div>
                  {unlinked.map(ka => <KARowMini key={ka.id} t={t} ka={ka} />)}
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
