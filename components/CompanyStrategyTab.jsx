'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_TOKENS, RADIUS, SPACING, TYPO, SHADOWS } from '../lib/themeTokens'
import {
  cardStyle, pillStyle, btnPrimary, btnSecondary, accentRingStyle,
  largeTitle, pageSubtitle, progressBarStyle, progressFillStyle,
  kpiNumber, inputStyle,
} from '../lib/iosStyles'
import Icon from './Icon'

const THEMES = { dark: COMMON_TOKENS.dark, light: COMMON_TOKENS.light }

// 施策の分類メタ。ハンドオフ §2: 深化=success / 探索=warn。色はテーマトークンの key を参照する。
const MODE_META = {
  exploit: { label: '深化', icon: 'tools', colorKey: 'success', desc: '既存パターンを伸ばす' },
  explore: { label: '探索', icon: 'target', colorKey: 'warn', desc: '新しい打ち手を試す' },
}
// ステータスメタ。色はテーマトークン key を参照 (テーマ追従)。
const STATUS_META = {
  testing: { label: '検証中', icon: 'clock',  colorKey: 'warn' },
  success: { label: '成功',   icon: 'check',  colorKey: 'success' },
  failure: { label: '失敗',   icon: 'cross',  colorKey: 'danger' },
  paused:  { label: '停止',   icon: 'circle', colorKey: 'textMuted' },
}

// KR % の 4 段階色 (ハンドオフ §2): ~30% danger / 30-60% warn / 60-100% success / 100+ accent
function krPctColor(T, pct) {
  if (pct >= 100) return T.accent
  if (pct >= 60) return T.success
  if (pct >= 30) return T.warn
  return T.danger
}

function calcKRPct(kr) {
  const t = Number(kr.target) || 0
  const c = Number(kr.current) || 0
  if (!t) return 0
  if (kr.lower_is_better) return Math.max(0, Math.min(150, ((t * 2 - c) / t) * 100))
  return Math.min(150, (c / t) * 100)
}

const toPeriodKey = (period, year) => year === '2026' ? period : `${year}_${period}`
const PERIOD_LABELS = { annual: '通期', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }
function rawPeriod(p) { return (p || '').replace(/^\d{4}_/, '') }

export default function CompanyStrategyTab({ T: parentT, themeKey = 'dark', levels = [], members = [], fiscalYear = '2026', myName, isAdmin }) {
  const T = parentT || THEMES[themeKey] || THEMES.dark

  const [loading, setLoading] = useState(true)
  const [krs, setKrs] = useState([])      // 全社の KR (objectives 経由で fetch)
  const [strategiesByKr, setStrategiesByKr] = useState({})  // {kr_id: [messages...]}
  const [initiativesByKr, setInitiativesByKr] = useState({}) // {kr_id: [...]}
  const [selectedKrId, setSelectedKrId] = useState(null)
  const [filter, setFilter] = useState('annual')  // 'annual' | 'q1'..'q4' | 'all'

  // 一括ロード
  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 全社レベルのみ (parent_id が無い = ルート階層) に絞る
      const rootLevelIds = (levels || []).filter(l => !l.parent_id).map(l => l.id)
      if (!rootLevelIds.length) {
        setKrs([]); setStrategiesByKr({}); setInitiativesByKr({})
        setLoading(false); return
      }
      // Objective を取得 (今年度の全期, 全社レベル限定)
      const periods = ['annual', 'q1', 'q2', 'q3', 'q4'].map(p => toPeriodKey(p, fiscalYear))
      const { data: objs } = await supabase.from('objectives')
        .select('id,level_id,period,title,owner')
        .in('level_id', rootLevelIds).in('period', periods).range(0, 999)
      const objIds = (objs || []).map(o => o.id)
      const objMap = Object.fromEntries((objs || []).map(o => [o.id, o]))
      let allKrs = []
      if (objIds.length) {
        for (let i = 0; i < objIds.length; i += 200) {
          const chunk = objIds.slice(i, i + 200)
          const { data: krRows } = await supabase.from('key_results')
            .select('id,objective_id,title,owner,current,target,unit,lower_is_better')
            .in('objective_id', chunk).range(0, 999)
          if (krRows) allKrs = allKrs.concat(krRows)
        }
      }
      // KRに紐づく Objective 情報を merge
      const krWithObj = allKrs.map(kr => {
        const obj = objMap[kr.objective_id] || {}
        return { ...kr, _period: rawPeriod(obj.period), _objTitle: obj.title, _levelId: obj.level_id, _objOwner: obj.owner }
      })
      setKrs(krWithObj)

      // 戦略メッセージ (kr_strategy_messages: 日付付き履歴) を読み込み
      const krIds = allKrs.map(k => k.id)
      const { data: messages } = await supabase.from('kr_strategy_messages')
        .select('*').in('kr_id', krIds).order('message_date', { ascending: false }).range(0, 9999)
      const sm = {}
      ;(messages || []).forEach(m => {
        if (!sm[m.kr_id]) sm[m.kr_id] = []
        sm[m.kr_id].push(m)
      })
      // 互換: kr_strategies に行があってまだ移行されていない KR は今日の日付として取り込む
      const { data: legacyStrategies } = await supabase.from('kr_strategies')
        .select('*').in('kr_id', krIds).range(0, 999)
      ;(legacyStrategies || []).forEach(s => {
        if (!s.message) return
        const list = sm[s.kr_id] || []
        // 既に kr_strategy_messages に何か入っていればスキップ
        if (list.length > 0) return
        const todayJst = (() => {
          const d = new Date(Date.now() + 9 * 3600 * 1000)
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        })()
        sm[s.kr_id] = [{
          id: `legacy-${s.kr_id}`,
          kr_id: s.kr_id,
          message_date: todayJst,
          message: s.message,
          updated_by: s.updated_by,
          updated_at: s.updated_at,
          _legacy: true,
        }]
      })
      setStrategiesByKr(sm)

      // 施策
      const { data: inits } = await supabase.from('kr_initiatives')
        .select('*').in('kr_id', allKrs.map(k => k.id))
        .order('mode').order('sort_order').order('id').range(0, 999)
      const im = {}; (inits || []).forEach(it => {
        if (!im[it.kr_id]) im[it.kr_id] = []
        im[it.kr_id].push(it)
      })
      setInitiativesByKr(im)
    } catch (e) {
      console.warn('strategy load error:', e)
    } finally {
      setLoading(false)
    }
  }, [levels, fiscalYear])

  useEffect(() => { load() }, [load])

  // フィルタした KR
  const filteredKrs = useMemo(() => {
    if (filter === 'all') return krs
    return krs.filter(k => k._period === filter)
  }, [krs, filter])

  // 選択中の KR
  const selectedKr = useMemo(() => krs.find(k => Number(k.id) === Number(selectedKrId)) || null, [krs, selectedKrId])

  // 初期選択: 通期の最初の KR
  useEffect(() => {
    if (!selectedKrId && filteredKrs.length > 0) {
      setSelectedKrId(filteredKrs[0].id)
    }
  }, [filteredKrs, selectedKrId])

  if (loading) {
    return (
      <div style={{ flex: 1, padding: SPACING['3xl'], color: T.textMuted, fontSize: TYPO.body.fontSize, textAlign: 'center', overflowY: 'auto' }}>
        経営戦略を読み込み中...
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${SPACING.lg}px ${SPACING.xl}px ${SPACING['2xl']}px`, background: T.bg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        {/* ページヘッダ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.md, flexWrap: 'wrap' }}>
          <div style={accentRingStyle({ color: T.accent, size: 32 })}>
            <Icon name="target" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...TYPO.title2, color: T.text, margin: 0 }}>経営戦略</h1>
            <div style={{ ...TYPO.footnote, color: T.textMuted, marginTop: 1 }}>
              全社の重要 KR をどう達成するか — 経営の意図と試している施策を可視化
            </div>
          </div>
        </div>

        {/* 期間セグメント (segment: padding 3px / radius 9, active のみ塗り + 影) */}
        <div style={{
          display: 'inline-flex', gap: 2, marginBottom: SPACING.md, flexWrap: 'wrap',
          padding: 3, borderRadius: 9, background: T.sunken, border: `1px solid ${T.border}`,
        }}>
          {[['annual', '通期'], ['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4'], ['all', '全期']].map(([k, l]) => {
            const on = filter === k
            return (
              <button key={k} onClick={() => { setFilter(k); setSelectedKrId(null) }}
                style={{
                  padding: '4px 12px', borderRadius: 7,
                  border: 'none',
                  background: on ? T.bgCard : 'transparent',
                  color: on ? T.text : T.textSub,
                  boxShadow: on ? SHADOWS.xs : 'none',
                  fontSize: TYPO.footnote.fontSize, fontWeight: on ? 700 : 600, fontFamily: 'inherit',
                  cursor: 'pointer',
                }}>{l}</button>
            )
          })}
        </div>

        {/* 2カラム: 左=KR一覧 (320px), 右=詳細 (1fr) */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: SPACING.md, alignItems: 'start' }}>
          {/* 左: KR一覧 (Glass カード, 行は border-bottom 区切り) */}
          <div style={{ ...cardStyle({ T, padding: 0 }) }}>
            <div style={{
              padding: '10px 14px', borderBottom: `1px solid ${T.border}`,
              ...TYPO.footnote, color: T.textMuted, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              KR 一覧 ({filteredKrs.length})
            </div>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {filteredKrs.length === 0 && (
                <div style={{ padding: SPACING.md, fontSize: TYPO.body.fontSize, color: T.textMuted, textAlign: 'center' }}>
                  KR がありません
                </div>
              )}
              {filteredKrs.map((kr, i) => {
                const pct = calcKRPct(kr)
                const pctColor = krPctColor(T, pct)
                const inits = initiativesByKr[kr.id] || []
                const cTesting = inits.filter(i => i.status === 'testing').length
                const cSuccess = inits.filter(i => i.status === 'success').length
                const cFailure = inits.filter(i => i.status === 'failure').length
                const cTotal = cTesting + cSuccess + cFailure
                const isSelected = Number(selectedKrId) === Number(kr.id)
                const isLast = i === filteredKrs.length - 1
                return (
                  <button key={kr.id} onClick={() => setSelectedKrId(kr.id)}
                    style={{
                      textAlign: 'left', width: '100%',
                      // active: 淡 accent 背景 + border-left 3px accent + padding-left 11px
                      padding: isSelected ? '12px 14px 12px 11px' : '12px 14px',
                      borderLeft: isSelected ? `3px solid ${T.accent}` : 'none',
                      borderTop: 'none', borderRight: 'none',
                      borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
                      background: isSelected ? `${T.accent}10` : 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...pillStyle({ color: T.accent, size: 'sm' }), background: T.accentBg, color: T.accentText, fontWeight: 600, padding: '2px 7px' }}>{PERIOD_LABELS[kr._period] || kr._period}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={kr.title}>{kr.title}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: pctColor }}>{Math.round(pct)}%</span>
                    </div>
                    <div style={{ ...progressBarStyle({ T, height: 3 }), background: T.sunken }}>
                      <div style={progressFillStyle({ color: pctColor, value: pct })} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: T.textMuted, fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {cTesting > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: T.warn }}><Icon name={STATUS_META.testing.icon} size={11} />{cTesting}</span>}
                        {cSuccess > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: T.success }}><Icon name={STATUS_META.success.icon} size={11} />{cSuccess}</span>}
                        {cFailure > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: T.danger }}><Icon name={STATUS_META.failure.icon} size={11} />{cFailure}</span>}
                        {cTotal === 0 && <span>施策 未登録</span>}
                      </span>
                      <span>{kr.owner || '—'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 右: 詳細 */}
          <div>
            {selectedKr ? (
              <KrStrategyDetail T={T} kr={selectedKr}
                strategy={strategiesByKr[selectedKr.id] || null}
                initiatives={initiativesByKr[selectedKr.id] || []}
                myName={myName} isAdmin={isAdmin}
                onChanged={load} />
            ) : (
              <div style={cardStyle({ T, padding: SPACING.xl })}>
                <div style={{ textAlign: 'center', color: T.textMuted, ...TYPO.body }}>
                  左の一覧から KR を選択してください
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 選択された KR の詳細 (戦略テキスト + 施策一覧) ─────────────
function KrStrategyDetail({ T, kr, strategy, initiatives, myName, isAdmin, onChanged }) {
  const pct = calcKRPct(kr)
  const pctColor = krPctColor(T, pct)
  const exploitInits = initiatives.filter(i => i.mode === 'exploit')
  const exploreInits = initiatives.filter(i => i.mode === 'explore')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
      {/* KR ヘッダ: アイコンタイル 40×40 + 本文 + 右寄せ大数字 32px */}
      <div style={cardStyle({ T, padding: SPACING.lg })}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACING.lg }}>
          {/* アイコンタイル 40×40 (accent-bg / accent-text) */}
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: T.accentBg, color: T.accentText,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="target" size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ ...pillStyle({ color: T.accent, size: 'sm' }), background: T.accentBg, color: T.accentText }}>{PERIOD_LABELS[kr._period] || kr._period} KR</span>
              {kr.owner && <span style={pillStyle({ color: T.textSub, size: 'sm' })}>担当: {kr.owner}</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.005em', color: T.text, marginBottom: 6 }}>{kr.title}</div>
            {kr._objTitle && (
              <div style={{ fontSize: 11.5, color: T.textSub, lineHeight: 1.55, marginBottom: 8 }}>
                所属 OBJ: {kr._objTitle}
              </div>
            )}
          </div>
          {/* 右寄せ統計: 大数字 32px monospace + 現在値/目標値 */}
          <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em', lineHeight: 1, color: pctColor }}>
              {Math.round(pct)}<span style={{ fontSize: 18 }}>%</span>
            </div>
            <div style={{ fontSize: 11.5, color: T.textMuted, fontFamily: 'ui-monospace, monospace', marginTop: 6 }}>
              {Number(kr.current || 0).toLocaleString()} / {Number(kr.target || 0).toLocaleString()} {kr.unit}
            </div>
          </div>
        </div>
        {/* 進捗バー 5px フルワイド */}
        <div style={{ ...progressBarStyle({ T, height: 5 }), background: T.sunken, marginTop: 14 }}>
          <div style={progressFillStyle({ color: pctColor, value: pct })} />
        </div>
      </div>

      {/* 経営からのメッセージ (日付タブで履歴切替) */}
      <StrategyMessageEditor T={T} kr={kr} messages={Array.isArray(strategy) ? strategy : (strategy ? [strategy] : [])}
        myName={myName} onChanged={onChanged} />

      {/* 施策一覧 */}
      <InitiativesSection T={T} kr={kr} initiatives={initiatives}
        exploitInits={exploitInits} exploreInits={exploreInits}
        myName={myName} isAdmin={isAdmin} onChanged={onChanged} />
    </div>
  )
}

// ─── 経営メッセージ (日付タブで履歴切替 + 編集) ──────────────
// messages: [{ kr_id, message_date 'YYYY-MM-DD', message, updated_by, updated_at }, ...]
//   - 日付降順で並んでいる前提 (load 時に order by message_date desc)
// 編集は「今日 (JST)」の行に対して upsert (onConflict: kr_id,message_date)
function todayJstYMD() {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function formatMessageDate(ymd) {
  // 'YYYY-MM-DD' → 'M/D(曜)'
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = ['日', '月', '火', '水', '木', '金', '土'][dt.getUTCDay()]
  return `${m}/${d}(${dow})`
}

function StrategyMessageEditor({ T, kr, messages, myName, onChanged }) {
  const today = todayJstYMD()

  // タブ一覧 = 今日 + 履歴 (今日は履歴に含まれていなければ先頭に挿入)
  const tabs = useMemo(() => {
    const list = [...(messages || [])]
    const hasToday = list.some(m => m.message_date === today)
    if (!hasToday) {
      list.unshift({ kr_id: kr.id, message_date: today, message: '', updated_by: null, updated_at: null, _new: true })
    }
    // 日付降順
    return list.sort((a, b) => (a.message_date < b.message_date ? 1 : a.message_date > b.message_date ? -1 : 0))
  }, [messages, today, kr.id])

  const [activeDate, setActiveDate] = useState(today)
  // 選択中タブが消えたら今日 (= 先頭) に戻す
  useEffect(() => {
    if (!tabs.find(t => t.message_date === activeDate)) setActiveDate(tabs[0]?.message_date || today)
  }, [tabs, activeDate, today])

  const active = tabs.find(t => t.message_date === activeDate) || tabs[0] || { message: '' }
  const isToday = active.message_date === today

  const [text, setText] = useState(active.message || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  // タブ切替時に入力欄をリセット
  useEffect(() => {
    setText(active.message || '')
    setEditing(false)
  }, [active.message_date, active.message])

  const save = async () => {
    setSaving(true)
    const payload = {
      kr_id: kr.id,
      message_date: today,
      message: text,
      updated_by: myName,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('kr_strategy_messages')
      .upsert(payload, { onConflict: 'kr_id,message_date' })
    setSaving(false)
    if (error) { alert('保存失敗: ' + error.message); return }
    // 互換: 旧 kr_strategies も同じメッセージで upsert (既存読み手のため)
    try {
      await supabase.from('kr_strategies').upsert({
        kr_id: kr.id, message: text, updated_by: myName, updated_at: new Date().toISOString(),
      }, { onConflict: 'kr_id' })
    } catch {}
    setEditing(false)
    setActiveDate(today)
    if (onChanged) await onChanged()
  }

  return (
    <div style={{ ...cardStyle({ T, padding: 0 }) }}>
      {/* カードヘッダ: 24×24 accent アイコンタイル + タイトル + 今日(M/D) NEW ピル */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
        padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: RADIUS.xs, flexShrink: 0,
          background: T.accentBg, color: T.accentText,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="note" size={14} /></div>
        <h3 style={{ ...TYPO.callout, color: T.text, margin: 0, flex: 1 }}>経営からのメッセージ</h3>
        <span style={{
          ...pillStyle({ color: T.accent, size: 'sm' }),
          fontWeight: 700, letterSpacing: '0.04em',
        }}>今日 ({formatMessageDate(today)}) NEW</span>
      </div>

      <div style={{ padding: SPACING.lg }}>
        {/* 日付タブ (今日が先頭、横スクロール可) */}
        {tabs.length > 0 && (
          <div style={{
            display: 'flex', gap: 4, marginBottom: SPACING.sm,
            overflowX: 'auto', paddingBottom: 4,
          }}>
            {tabs.map(t => {
              const tabIsToday = t.message_date === today
              const isActive = t.message_date === activeDate
              return (
                <button key={t.message_date} onClick={() => setActiveDate(t.message_date)}
                  style={{
                    padding: '4px 10px', borderRadius: RADIUS.pill,
                    border: `1px solid ${isActive ? T.accent : T.border}`,
                    background: isActive ? T.accentBg : 'transparent',
                    color: isActive ? T.accentText : T.textSub,
                    fontSize: TYPO.footnote.fontSize, fontWeight: 700, fontFamily: 'inherit',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                  title={t.updated_by ? `更新: ${t.updated_by}` : ''}
                >
                  {tabIsToday ? `今日 (${formatMessageDate(t.message_date)})` : formatMessageDate(t.message_date)}
                  {t._new && <span style={{ marginLeft: 4, opacity: 0.5 }}>(新規)</span>}
                </button>
              )
            })}
          </div>
        )}

        {editing ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            placeholder="例: 今期は法人向けA商品を主軸に新規100社開拓。既存顧客のアップセル(B商品)で残り3000万を確保..."
            style={{
              ...inputStyle({ T }), width: '100%', resize: 'vertical',
              fontSize: TYPO.body.fontSize, lineHeight: 1.65, minHeight: 120,
            }}
          />
        ) : (
          active.message && active.message.trim() ? (
            <>
              <div style={{ ...TYPO.body, color: T.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{active.message}</div>
              {active.updated_by && (
                <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: 8, textAlign: 'right' }}>
                  — {active.updated_by} ({formatMessageDate(active.message_date)})
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '24px 18px', ...TYPO.subhead, color: T.textMuted, textAlign: 'center', fontWeight: 500 }}>
              {isToday
                ? 'まだメッセージが登録されていません。「編集」から経営の意図を記入してください。'
                : 'この日のメッセージはありません。'}
            </div>
          )
        )}
      </div>

      {/* フッタ: 右寄せ secondary 編集ボタン (薄背景) */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm - 2,
        padding: '10px 16px', borderTop: `1px solid ${T.border}`,
        background: T.sectionBg,
      }}>
        {!editing && isToday && (
          <button onClick={() => setEditing(true)}
            style={{ ...btnSecondary({ T, size: 'sm' }), padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="pencil" size={11} /> 編集
          </button>
        )}
        {!editing && !isToday && (
          <button onClick={() => { setActiveDate(today); setEditing(true) }}
            style={{ ...btnSecondary({ T, size: 'sm' }), padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="pencil" size={11} /> 今日の版で編集
          </button>
        )}
        {editing && (
          <>
            <button onClick={() => { setEditing(false); setText(active.message || '') }} disabled={saving}
              style={{ ...btnSecondary({ T, size: 'sm' }), padding: '4px 10px' }}>
              キャンセル
            </button>
            <button onClick={save} disabled={saving}
              style={{ ...btnPrimary({ T, size: 'sm' }), padding: '4px 10px', fontSize: TYPO.footnote.fontSize, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {saving ? '保存中…' : <><Icon name="check" size={11} /> {formatMessageDate(today)} で保存</>}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── 施策一覧 (深化 + 探索) ─────────────────────────────────
function InitiativesSection({ T, kr, initiatives, exploitInits, exploreInits, myName, isAdmin, onChanged }) {
  const [adding, setAdding] = useState(null) // { mode } | null

  return (
    <div style={{ ...cardStyle({ T, padding: 0 }) }}>
      {/* カードヘッダ: 24×24 accent アイコンタイル + タイトル + 件数 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
        padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: RADIUS.xs, flexShrink: 0,
          background: T.accentBg, color: T.accentText,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="target" size={14} /></div>
        <h3 style={{ ...TYPO.callout, color: T.text, margin: 0, flex: 1 }}>施策一覧</h3>
        <span style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 600 }}>合計 {initiatives.length} 件</span>
      </div>

      {/* 深化 */}
      <ModeBlock T={T} mode="exploit" inits={exploitInits} kr={kr}
        onAdd={() => setAdding({ mode: 'exploit' })}
        myName={myName} isAdmin={isAdmin} onChanged={onChanged} />
      {/* 探索 */}
      <ModeBlock T={T} mode="explore" inits={exploreInits} kr={kr}
        onAdd={() => setAdding({ mode: 'explore' })}
        myName={myName} isAdmin={isAdmin} onChanged={onChanged} />

      {/* 追加モーダル */}
      {adding && (
        <InitiativeFormModal T={T} kr={kr} mode={adding.mode}
          myName={myName}
          onCancel={() => setAdding(null)}
          onSaved={() => { setAdding(null); if (onChanged) onChanged() }} />
      )}
    </div>
  )
}

function ModeBlock({ T, mode, inits, kr, onAdd, myName, isAdmin, onChanged }) {
  const meta = MODE_META[mode]
  // colorKey をテーマトークンへ解決 (深化=success / 探索=warn)
  const c = T[meta.colorKey] || T.accent
  const cBg = T[meta.colorKey + 'Bg'] || T.accentBg
  return (
    <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
        {/* 24×24 アイコンタイル: 深化 success-bg/success, 探索 warn-bg/warn */}
        <div style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          background: cBg, color: c,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name={meta.icon} size={13} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{meta.label}</div>
          <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 500 }}>{meta.desc}</div>
        </div>
        <span style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 600, marginLeft: 'auto' }}>{inits.length} 件</span>
        {/* [+ 追加] は accent-bg / accent-text */}
        <button onClick={onAdd} style={{
          padding: '4px 10px', borderRadius: RADIUS.xs, border: `1px solid ${T.accent}40`,
          background: T.accentBg, color: T.accentText, fontSize: TYPO.footnote.fontSize, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}><Icon name="plus" size={11} /> 追加</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
        {inits.length === 0 ? (
          <div style={{
            padding: SPACING.md + 2, ...TYPO.footnote, color: T.textMuted, fontWeight: 500,
            textAlign: 'center', background: T.sectionBg,
            borderRadius: RADIUS.sm, border: `1px dashed ${T.borderMid}`,
          }}>
            まだ施策がありません
          </div>
        ) : inits.map(it => (
          <InitiativeCard key={it.id} T={T} initiative={it} kr={kr}
            myName={myName} isAdmin={isAdmin} onChanged={onChanged} />
        ))}
      </div>
    </div>
  )
}

// ─── 施策カード ────────────────────────────────────────────
function InitiativeCard({ T, initiative, kr, myName, isAdmin, onChanged }) {
  const meta = STATUS_META[initiative.status] || STATUS_META.testing
  // colorKey をテーマトークンへ解決
  const metaColor = T[meta.colorKey] || T.textMuted
  const [editing, setEditing] = useState(false)

  const removeInit = async () => {
    if (!window.confirm(`「${initiative.title}」を削除しますか？`)) return
    const { error } = await supabase.from('kr_initiatives').delete().eq('id', initiative.id)
    if (error) { alert('削除失敗: ' + error.message); return }
    if (onChanged) await onChanged()
  }

  if (editing) {
    return (
      <InitiativeForm T={T} kr={kr} initial={initiative} myName={myName}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); if (onChanged) onChanged() }} />
    )
  }

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: RADIUS.sm + 2, padding: `${SPACING.sm}px ${SPACING.md}px`,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, flexWrap: 'wrap' }}>
        <span style={{
          ...pillStyle({ color: metaColor, size: 'sm' }),
        }}><Icon name={meta.icon} size={10} /> {meta.label}</span>
        <span style={{ ...TYPO.subhead, color: T.text, flex: 1, minWidth: 0 }}>{initiative.title}</span>
        {initiative.target_value != null && (
          <span style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 700, whiteSpace: 'nowrap' }}>
            目標 {Number(initiative.target_value).toLocaleString()}{initiative.unit || ''}
            {initiative.actual_value != null && ` / 実績 ${Number(initiative.actual_value).toLocaleString()}${initiative.unit || ''}`}
          </span>
        )}
        <button onClick={() => setEditing(true)} style={{
          padding: '2px 6px', borderRadius: RADIUS.xs, border: `1px solid ${T.border}`,
          background: 'transparent', color: T.textSub, fontSize: TYPO.caption.fontSize, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>編集</button>
        <button onClick={removeInit} style={{
          padding: '2px 6px', borderRadius: RADIUS.xs, border: `1px solid ${T.danger}40`,
          background: 'transparent', color: T.danger, fontSize: TYPO.caption.fontSize, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>削除</button>
      </div>
      {initiative.description && (
        <div style={{ ...TYPO.footnote, color: T.textSub, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {initiative.description}
        </div>
      )}
      {initiative.status === 'failure' && initiative.failure_reason && (
        <div style={{
          marginTop: 4, padding: '6px 10px', borderRadius: RADIUS.xs,
          background: `${T.danger}10`, border: `1px solid ${T.danger}30`,
          ...TYPO.footnote, color: T.danger, lineHeight: 1.55,
        }}>
          <strong style={{ fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}><Icon name="cross" size={11} /> 失敗の理由: </strong>{initiative.failure_reason}
        </div>
      )}
      <div style={{ ...TYPO.caption, color: T.textMuted, display: 'flex', gap: 8, fontWeight: 600, flexWrap: 'wrap' }}>
        {initiative.owner && <span>担当: {initiative.owner}</span>}
        {(initiative.start_date || initiative.end_date) && (
          <span style={{
            padding: '1px 6px', borderRadius: 4,
            background: T.sectionBg, color: T.textSub, fontWeight: 700,
          }}>
            検証 {String(initiative.start_date || '').slice(5, 10) || '?'} 〜 {String(initiative.end_date || '').slice(5, 10) || '?'}
            {initiative.end_date && initiative.status === 'testing' && (() => {
              const days = Math.round((new Date(initiative.end_date) - new Date()) / 86400000)
              if (days < 0) return <span style={{ marginLeft: 4, color: T.danger }}>(期限超過 {Math.abs(days)}日)</span>
              if (days <= 7) return <span style={{ marginLeft: 4, color: T.warn }}>(あと{days}日)</span>
              return <span style={{ marginLeft: 4, color: T.textMuted }}>(あと{days}日)</span>
            })()}
          </span>
        )}
        {initiative.updated_at && <span style={{ marginLeft: 'auto' }}>更新: {String(initiative.updated_at).slice(0, 10)}</span>}
      </div>
    </div>
  )
}

// ─── 施策追加/編集モーダル ─────────────────────────────────
function InitiativeFormModal({ T, kr, mode, myName, onCancel, onSaved }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: SPACING.xl,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, borderRadius: RADIUS.lg,
        padding: SPACING.lg, maxWidth: 560, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: SHADOWS.lg,
      }}>
        <InitiativeForm T={T} kr={kr} initial={{ mode, status: 'testing', unit: kr.unit || '' }}
          myName={myName} onCancel={onCancel} onSaved={onSaved} isModal />
      </div>
    </div>
  )
}

function InitiativeForm({ T, kr, initial = {}, myName, onCancel, onSaved, isModal = false }) {
  const [title, setTitle] = useState(initial.title || '')
  const [description, setDescription] = useState(initial.description || '')
  const [mode, setMode] = useState(initial.mode || 'exploit')
  const [status, setStatus] = useState(initial.status || 'testing')
  const [failureReason, setFailureReason] = useState(initial.failure_reason || '')
  const [targetValue, setTargetValue] = useState(initial.target_value ?? '')
  const [actualValue, setActualValue] = useState(initial.actual_value ?? '')
  const [unit, setUnit] = useState(initial.unit || kr.unit || '')
  const [owner, setOwner] = useState(initial.owner || '')
  // 検証期間 (start_date / end_date) — 施策がいつ動いていたか / いつまでに結論を出すか
  const [startDate, setStartDate] = useState(initial.start_date ? String(initial.start_date).slice(0, 10) : '')
  const [endDate,   setEndDate]   = useState(initial.end_date   ? String(initial.end_date).slice(0, 10)   : '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) { alert('タイトルを入力してください'); return }
    setSaving(true)
    const payload = {
      kr_id: kr.id, title: title.trim(), description, mode, status,
      failure_reason: status === 'failure' ? failureReason : '',
      target_value: targetValue === '' ? null : Number(targetValue),
      actual_value: actualValue === '' ? null : Number(actualValue),
      unit, owner,
      start_date: startDate || null,
      end_date: endDate || null,
      updated_at: new Date().toISOString(),
    }
    // start_date / end_date 列が存在しない旧スキーマへのフォールバック
    const tryWithFallback = async (op) => {
      let res = await op(payload)
      if (res.error && /start_date|end_date/.test(res.error.message || '')) {
        const stripped = { ...payload }
        delete stripped.start_date
        delete stripped.end_date
        res = await op(stripped)
      }
      return res
    }
    if (initial.id) {
      const { error } = await tryWithFallback(p => supabase.from('kr_initiatives').update(p).eq('id', initial.id))
      if (error) { alert('更新失敗: ' + error.message); setSaving(false); return }
    } else {
      payload.created_by = myName
      const { error } = await tryWithFallback(p => supabase.from('kr_initiatives').insert(p))
      if (error) { alert('作成失敗: ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    if (onSaved) onSaved()
  }

  const inputBase = { ...inputStyle({ T }), padding: '6px 10px', fontSize: TYPO.subhead.fontSize }
  const Label = ({ children }) => <div style={{ ...TYPO.caption, color: T.textSub, fontWeight: 700, marginBottom: 3 }}>{children}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2 }}>
      {isModal && (
        <div style={{ ...TYPO.headline, color: T.text, marginBottom: 4 }}>
          施策を追加 <span style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 600, marginLeft: 6 }}>({MODE_META[mode].label})</span>
        </div>
      )}

      <div>
        <Label>施策タイトル *</Label>
        <input value={title} onChange={e => setTitle(e.target.value)} disabled={saving}
          placeholder="例: 法人向けA商品 値上げ" style={{ ...inputBase, width: '100%' }} />
      </div>

      <div>
        <Label>説明 / 仮説</Label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} disabled={saving}
          placeholder="どういう打ち手か、なぜ効くと考えるか"
          style={{ ...inputBase, width: '100%', resize: 'vertical', minHeight: 60 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm }}>
        <div>
          <Label>分類</Label>
          <select value={mode} onChange={e => setMode(e.target.value)} disabled={saving}
            style={{ ...inputBase, width: '100%' }}>
            <option value="exploit">深化 (既存パターンを伸ばす)</option>
            <option value="explore">探索 (新しい打ち手)</option>
          </select>
        </div>
        <div>
          <Label>ステータス</Label>
          <select value={status} onChange={e => setStatus(e.target.value)} disabled={saving}
            style={{ ...inputBase, width: '100%' }}>
            <option value="testing">検証中</option>
            <option value="success">成功</option>
            <option value="failure">失敗</option>
            <option value="paused">停止</option>
          </select>
        </div>
      </div>

      {status === 'failure' && (
        <div>
          <Label>失敗の理由 (社員が読んで納得できる説明)</Label>
          <textarea value={failureReason} onChange={e => setFailureReason(e.target.value)} rows={2} disabled={saving}
            placeholder="例: 顧客ニーズと不一致 / コストが想定の2倍 / 想定リード数の30%しか取れず"
            style={{ ...inputBase, width: '100%', resize: 'vertical', minHeight: 50 }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.sm }}>
        <div>
          <Label>寄与目標</Label>
          <input value={targetValue} onChange={e => setTargetValue(e.target.value)} type="number" disabled={saving}
            placeholder="例: 5000" style={{ ...inputBase, width: '100%' }} />
        </div>
        <div>
          <Label>実績</Label>
          <input value={actualValue} onChange={e => setActualValue(e.target.value)} type="number" disabled={saving}
            placeholder="現時点" style={{ ...inputBase, width: '100%' }} />
        </div>
        <div>
          <Label>単位</Label>
          <input value={unit} onChange={e => setUnit(e.target.value)} disabled={saving}
            placeholder="例: 万円" style={{ ...inputBase, width: '100%' }} />
        </div>
      </div>

      <div>
        <Label>担当者</Label>
        <input value={owner} onChange={e => setOwner(e.target.value)} disabled={saving}
          placeholder="例: 三木智弘" style={{ ...inputBase, width: '100%' }} />
      </div>

      {/* 検証期間: 施策をいつから/いつまで動かしたか (もしくは結論期限) */}
      <div>
        <Label>検証期間</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: SPACING.xs + 2, alignItems: 'center' }}>
          <input value={startDate} onChange={e => setStartDate(e.target.value)} type="date" disabled={saving}
            style={{ ...inputBase, width: '100%' }} />
          <span style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 700 }}>〜</span>
          <input value={endDate} onChange={e => setEndDate(e.target.value)} type="date" disabled={saving}
            style={{ ...inputBase, width: '100%' }} />
        </div>
        <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: 3 }}>
          検証中の施策は終了日 (≈結論期限) を入れておくと、進捗管理しやすくなります
        </div>
      </div>

      <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.xs }}>
        <button onClick={onCancel} disabled={saving}
          style={{ flex: 1, ...btnSecondary({ T, size: 'md' }), textAlign: 'center' }}>
          キャンセル
        </button>
        <button onClick={save} disabled={saving}
          style={{ flex: 1, ...btnPrimary({ T, size: 'md' }), opacity: saving ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {saving ? '保存中…' : <><Icon name="check" size={13} /> {initial.id ? '更新' : '追加'}</>}
        </button>
      </div>
    </div>
  )
}
