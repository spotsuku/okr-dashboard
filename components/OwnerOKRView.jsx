'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import KASection from './KASection'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS, GLASS } from '../lib/themeTokens'
import { btnSecondary } from '../lib/iosStyles'
import Icon from './Icon'
import { pctColor as okrPctColor, pctColorBg as okrPctColorBg } from '../lib/okrColors'

// 担当チップ (.ot.ow) [厳守] — 18×18 グラデアバター + 名前
function OwnerChip({ t, name, mono = false }) {
  if (!name) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px 3px 4px',
      background: 'rgba(255,255,255,.7)',
      border: `1px solid ${t.border}`,
      borderRadius: RADIUS.pill,
      fontSize: 11, fontWeight: 500, color: t.textSub,
      fontFamily: mono ? 'inherit' : undefined,
      verticalAlign: mono ? -4 : undefined,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: RADIUS.pill,
        background: 'linear-gradient(135deg,#fb923c,#fbbf24)',
        color: '#fff', fontSize: 9, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{name.slice(0, 1)}</span>
      {name}
    </span>
  )
}

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

// 進捗率に応じた色 (4 段階): 0-29 danger / 30-59 warn / 60-99 success / 100+ accent
function progressColor(t, pct) { return okrPctColor(t, pct) }

// 進捗率に応じた淡背景 (pill 用)
function progStatusBg(t, pct) { return okrPctColorBg(t, pct) }

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
function ProgressBar({ t, value, max = 100, height = 4, fixedWidth }) {
  const pct = Math.min(Math.max(value || 0, 0), 150)
  const color = progressColor(t, pct)
  return (
    <div style={{
      flex: fixedWidth ? `0 0 ${fixedWidth}px` : 1,
      width: fixedWidth, height, background: t.sunken,
      borderRadius: RADIUS.pill, overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', width: `${Math.max(Math.min(pct, 100), 1)}%`,
        background: color,
        transition: 'width 300ms ease-out',
      }} />
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
      width: 22, height: 22, borderRadius: RADIUS.xs,
      background: cfg.bg, color: cfg.fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...TYPO.subhead, flexShrink: 0,
    }}>{cfg.mark}</span>
  )
}

// KA タイトル表示用 (ReadOnly)
function KARowMini({ t, ka }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACING.md,
      padding: '10px 18px',
      borderBottom: `1px solid ${t.border}`,
    }}>
      <StatusTile t={t} status={ka.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          ...TYPO.body, color: t.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ka.ka_title || '(無題)'}</div>
        {(ka.good || ka.focus_output) && (
          <div style={{ ...TYPO.footnote, color: t.textMuted, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: t.success, fontWeight: 600 }}>K</span> {(ka.good || ka.focus_output || '').slice(0, 60)}
          </div>
        )}
      </div>
      {ka.owner && (
        <span style={{
          ...TYPO.footnote, color: t.textSub,
          minWidth: 80, textAlign: 'right',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ka.owner}</span>
      )}
      {ka.week_start && (
        <span style={{
          ...TYPO.footnote, color: t.textMuted,
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

export default function OwnerOKRView({ ownerName, levels, members = [], fiscalYear = '2026', themeKey = 'dark', onEdit, onDelete, refreshKey }) {
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
    // アーカイブ済み KR はカードに表示しない
    const allKRs = [...objKRs, ...(myKRs || [])].filter(kr => !kr.archived_at).filter((kr, i, arr) => arr.findIndex(k => k.id === kr.id) === i)
    const krMap = {}
    allKRs.forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
      krMap[kr.objective_id].push(kr)
    })
    const extraIds = extraObjs.map(o => o.id).filter(id => !krMap[id])
    if (extraIds.length > 0) {
      const { data } = await supabase.from('key_results').select('*').in('objective_id', extraIds).range(0, 49999)
      ;(data || []).forEach(kr => {
        if (kr.archived_at) return // アーカイブ済み KR は非表示
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
      <div style={{ ...TYPO.headline, fontWeight: 500, color: T().text, marginTop: SPACING.md }}>メンバーを選択してください</div>
      <div style={{ ...TYPO.body, marginTop: 6, color: T().textMuted }}>左のリストからメンバーを選ぶと、その人が担当する OKR が表示されます</div>
    </div>
  )

  if (loading) return <div style={{ padding: 40, color: T().textMuted, ...TYPO.body }}>読み込み中...</div>

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
      <div style={{ ...TYPO.headline, fontWeight: 500, color: T().text, marginTop: SPACING.md }}>{ownerName} さんの OKR がありません</div>
      <div style={{ ...TYPO.body, marginTop: 6, color: T().textMuted }}>{fiscalYear} 年度の OKR が設定されていません</div>
    </div>
  )

  const t = T()
  const periodLabel = effectivePeriod === 'annual' ? '通期' : effectivePeriod.toUpperCase()

  return (
    <div style={{ padding: '24px 28px 80px', maxWidth: 1100, margin: '0 auto', background: t.bg, minHeight: '100%' }}>
      {/* ヘッダー: アバター + 役職 + {名前} のOKR + 年度 (週次ビューと統一様式) */}
      {(() => {
        const om = (members || []).find(m => m.name === ownerName)
        const palette = ['#5A8A7A','#E8875A','#6B8DB5','#B07D9E','#C4956A','#5B9EA6','#8B7EC8','#D4816B']
        const ac = palette[Math.abs([...ownerName].reduce((h, ch) => ch.charCodeAt(0) + ((h << 5) - h), 0)) % palette.length]
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xl }}>
            {om?.avatar_url ? (
              <img src={om.avatar_url} alt={ownerName} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${ac}60`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${ac}25`, border: `2px solid ${ac}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: TYPO.headline.fontSize, fontWeight: 700, color: ac, flexShrink: 0 }}>{ownerName.slice(0, 2)}</div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ ...TYPO.caption, fontWeight: 500, color: t.textMuted, marginBottom: 1 }}>{om?.role || 'メンバー'}</div>
              <div style={{ ...TYPO.title3, fontWeight: 700, color: t.text }}>{ownerName} のOKR</div>
            </div>
            <span style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', fontSize: 11, fontWeight: 700, borderRadius: RADIUS.pill,
              background: t.accentBg, color: t.accentText,
            }}><Icon name="calendar" size={12} /> {fiscalYear}年度</span>
          </div>
        )
      })()}

      {/* Q タブ (.qtab) — 下線スタイル + 件数バッジ */}
      <div style={{
        display: 'flex', gap: 0, alignItems: 'baseline',
        borderBottom: `1px solid ${t.border}`, marginBottom: 14, flexWrap: 'wrap',
      }}>
        {allPeriods.map((p) => {
          const count = (grouped[p] || []).length
          const isActive = effectivePeriod === p
          return (
            <button key={p} onClick={() => setActivePeriod(p)} style={{
              padding: '8px 14px', fontSize: 12.5,
              fontWeight: isActive ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer',
              background: 'none', border: 0,
              borderBottom: `2px solid ${isActive ? t.accent : 'transparent'}`,
              color: isActive ? t.accentText : t.textSub,
            }}>
              {PERIOD_LABELS[p]}
              <span style={{ fontSize: 11, fontWeight: 500, color: t.textMuted, marginLeft: 3 }}>({count})</span>
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: t.textMuted, padding: '0 4px' }}>
          {fiscalYear}年度 · {periodLabel}
        </span>
      </div>

      {/* Objective Cards */}
      {currentObjs.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: t.textFaint, ...TYPO.body }}>
          この期間の OKR はありません
        </div>
      )}

      {currentObjs.map(obj => {
        const prog = calcObjProgress(obj.key_results)
        const objKAs = kaReports.filter(r => Number(r.objective_id) === Number(obj.id))
        const totalKaCount = objKAs.length
        return (
          <div key={obj.id} style={{ marginBottom: SPACING['2xl'] }}>
            {/* OBJECTIVE ヘッダ (.objh) [厳守] */}
            <div style={{
              padding: '18px 22px',
              background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: RADIUS.lg,
              display: 'flex', gap: 14,
              backdropFilter: GLASS.blur,
              WebkitBackdropFilter: GLASS.blur,
              boxShadow: `${SHADOWS.glassInset}, ${SHADOWS.xs}`,
              marginBottom: 14,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: t.accentBg, color: t.accentText,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name="target" size={18} stroke={1.7} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 8px', fontSize: 10.5, fontWeight: 700, borderRadius: RADIUS.pill,
                    background: t.sectionBg, color: t.textSub,
                  }}>OBJECTIVE</span>
                  <span style={{
                    padding: '2px 8px', fontSize: 10.5, fontWeight: 700, borderRadius: RADIUS.pill,
                    background: progStatusBg(t, prog), color: progressColor(t, prog),
                  }}>{prog}% 達成</span>
                  <OwnerChip t={t} name={obj.owner} />
                </div>
                <h2 style={{
                  fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.45, letterSpacing: '-0.005em',
                  color: t.text,
                }}>{obj.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                  <ProgressBar t={t} value={prog} fixedWidth={140} />
                  <span style={{
                    fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                    color: progressColor(t, prog),
                  }}>{prog}%</span>
                  <span style={{
                    padding: '2px 10px', fontSize: 11, fontWeight: 600, borderRadius: RADIUS.pill,
                    background: t.accentBg, color: t.accentText,
                  }}>KR {obj.key_results.length}件</span>
                  <span style={{
                    padding: '2px 10px', fontSize: 11, fontWeight: 600, borderRadius: RADIUS.pill,
                    background: t.sectionBg, color: t.textSub,
                  }}>KA {totalKaCount}件</span>
                  {onEdit && (
                    <button onClick={() => onEdit(obj)} style={{
                      ...btnSecondary({ T: t, size: 'sm' }),
                      marginLeft: 'auto', color: t.textSub,
                    }}>編集</button>
                  )}
                </div>
              </div>
            </div>

            {/* Key Results → Key Actions ストリップ */}
            <div style={{
              fontSize: 10.5, fontWeight: 700, color: t.textMuted,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              margin: '14px 0 8px',
            }}>Key Results → Key Actions</div>

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
                  marginBottom: 10, padding: 0,
                  background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: RADIUS.md,
                  backdropFilter: GLASS.blur,
                  WebkitBackdropFilter: GLASS.blur,
                  overflow: 'hidden',
                }}>
                  {/* KR カード ヘッダ (.krc) */}
                  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        padding: '1px 7px', fontSize: 10, fontWeight: 700,
                        background: t.accentBg, color: t.accentText, borderRadius: RADIUS.xs,
                        flexShrink: 0,
                      }}>KR</span>
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: t.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{kr.title}</span>
                      <span style={{
                        fontSize: 10.5, color: t.textMuted, fontFamily: 'ui-monospace, monospace',
                        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      }}>
                        {kr.current ?? 0} / {kr.target ?? 0} {kr.unit || ''}
                        {kr.owner && (<>{' · '}<OwnerChip t={t} name={kr.owner} mono /></>)}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                        color: progressColor(t, kp), flexShrink: 0,
                      }}>{kp}%</span>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex' }}>
                      <ProgressBar t={t} value={kp} height={3} />
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
                  marginBottom: SPACING.md, padding: 0,
                  background: t.bgCard, border: `1px dashed ${t.border}`, borderRadius: RADIUS.lg,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    ...TYPO.caption, fontWeight: 600, color: t.textMuted,
                    textTransform: 'uppercase',
                    padding: '12px 18px', borderBottom: `1px solid ${t.border}`,
                  }}>その他の KA ({unlinked.length}件)</div>
                  {unlinked.map(ka => <KARowMini key={ka.id} t={t} ka={ka} />)}
                </div>
              )
            })()}

            {/* AI コーチカード (.aifb) — KR カード列の末尾 */}
            <div style={{
              padding: '12px 14px',
              background: 'linear-gradient(135deg, rgba(37,99,235,.06), rgba(34,211,238,.06))',
              border: '1px solid rgba(37,99,235,.18)', borderRadius: RADIUS.md,
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: RADIUS.sm,
                background: 'linear-gradient(135deg,#3b82f6,#1e3a8a)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(30,58,138,.24)', flexShrink: 0,
              }}>
                <Icon name="sparkle" size={14} stroke={1.7} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.accentText }}>AI コーチにフィードバックをもらう</div>
                <div style={{ fontSize: 10.5, color: t.textSub, marginTop: 1 }}>現在の KR・KA 状況をもとにアドバイスをもらえます</div>
              </div>
              <span style={{ color: t.accentText, display: 'inline-flex', flexShrink: 0 }}>
                <Icon name="arrowRight" size={13} stroke={2} />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
