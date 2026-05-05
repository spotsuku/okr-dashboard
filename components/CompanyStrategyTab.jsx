'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_TOKENS, RADIUS, SPACING, TYPO, SHADOWS } from '../lib/themeTokens'
import {
  cardStyle, pillStyle, btnPrimary, accentRingStyle,
  largeTitle, pageSubtitle, progressBarStyle, progressFillStyle,
  kpiNumber, inputStyle,
} from '../lib/iosStyles'

const THEMES = { dark: COMMON_TOKENS.dark, light: COMMON_TOKENS.light }

const MODE_META = {
  exploit: { label: '深化', icon: '🔧', color: '#007AFF', desc: '既存パターンを伸ばす' },
  explore: { label: '探索', icon: '🧭', color: '#AF52DE', desc: '新しい打ち手を試す' },
}
const STATUS_META = {
  testing: { label: '検証中', icon: '⏳', color: '#FF9500' },
  success: { label: '成功',   icon: '✓',  color: '#34C759' },
  failure: { label: '失敗',   icon: '✗',  color: '#FF3B30' },
  paused:  { label: '停止',   icon: '⏸',  color: '#8E8E93' },
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
  const [strategiesByKr, setStrategiesByKr] = useState({})  // {kr_id: row}
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

      // 戦略テキスト
      const { data: strategies } = await supabase.from('kr_strategies')
        .select('*').in('kr_id', allKrs.map(k => k.id)).range(0, 999)
      const sm = {}; (strategies || []).forEach(s => { sm[s.kr_id] = s })
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
        {/* ヘッダ (コンパクト) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.md, flexWrap: 'wrap' }}>
          <div style={accentRingStyle({ color: '#AF52DE', size: 32 })}>
            <span style={{ fontSize: 16 }}>🧭</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...TYPO.title2, color: T.text, margin: 0 }}>経営戦略</h1>
            <div style={{ ...TYPO.footnote, color: T.textMuted, marginTop: 1 }}>
              全社の重要 KR をどう達成するか — 経営の意図と試している施策を可視化
            </div>
          </div>
        </div>

        {/* 期間フィルタ */}
        <div style={{ display: 'flex', gap: SPACING.xs + 2, marginBottom: SPACING.md, flexWrap: 'wrap' }}>
          {[['annual', '通期'], ['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4'], ['all', '全期']].map(([k, l]) => (
            <button key={k} onClick={() => { setFilter(k); setSelectedKrId(null) }}
              style={{
                padding: '4px 12px', borderRadius: RADIUS.pill,
                border: `1px solid ${filter === k ? T.accent : T.border}`,
                background: filter === k ? `${T.accent}15` : 'transparent',
                color: filter === k ? T.accent : T.textSub,
                fontSize: TYPO.footnote.fontSize, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer',
              }}>{l}</button>
          ))}
        </div>

        {/* 2カラム: 左=KR一覧 (狭め), 右=施策詳細 (広く) — 施策が主役 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) 1fr', gap: SPACING.md, alignItems: 'start' }}>
          {/* 左: KR一覧 */}
          <div style={cardStyle({ T, padding: SPACING.sm + 2 })}>
            <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700, padding: `${SPACING.xs}px ${SPACING.xs + 2}px ${SPACING.xs + 2}px` }}>
              KR 一覧 ({filteredKrs.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '70vh', overflowY: 'auto' }}>
              {filteredKrs.length === 0 && (
                <div style={{ padding: SPACING.md, fontSize: TYPO.body.fontSize, color: T.textMuted, textAlign: 'center' }}>
                  KR がありません
                </div>
              )}
              {filteredKrs.map(kr => {
                const pct = calcKRPct(kr)
                const inits = initiativesByKr[kr.id] || []
                const cTesting = inits.filter(i => i.status === 'testing').length
                const cSuccess = inits.filter(i => i.status === 'success').length
                const cFailure = inits.filter(i => i.status === 'failure').length
                const isSelected = Number(selectedKrId) === Number(kr.id)
                return (
                  <button key={kr.id} onClick={() => setSelectedKrId(kr.id)}
                    style={{
                      textAlign: 'left', padding: SPACING.sm + 2, borderRadius: RADIUS.md,
                      border: `1px solid ${isSelected ? T.accent : T.borderLight}`,
                      background: isSelected ? `${T.accent}10` : T.sectionBg,
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={pillStyle({ color: T.textSub, size: 'sm' })}>{PERIOD_LABELS[kr._period] || kr._period}</span>
                      <span style={{ ...TYPO.subhead, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={kr.title}>{kr.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, ...progressBarStyle({ T, height: 4 }) }}>
                        <div style={progressFillStyle({ color: pct < 50 ? T.danger : pct < 80 ? T.warn : T.success, value: pct })} />
                      </div>
                      <span style={{ ...TYPO.caption, color: pct < 50 ? T.danger : pct < 80 ? T.warn : T.success, fontWeight: 800, fontSize: 11 }}>{Math.round(pct)}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, ...TYPO.caption, color: T.textMuted, fontWeight: 600 }}>
                      {cTesting > 0 && <span style={{ color: STATUS_META.testing.color }}>⏳{cTesting}</span>}
                      {cSuccess > 0 && <span style={{ color: STATUS_META.success.color }}>✓{cSuccess}</span>}
                      {cFailure > 0 && <span style={{ color: STATUS_META.failure.color }}>✗{cFailure}</span>}
                      {(cTesting + cSuccess + cFailure) === 0 && <span>施策未登録</span>}
                      <span style={{ marginLeft: 'auto' }}>{kr.owner || '−'}</span>
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
  const pctColor = pct < 50 ? T.danger : pct < 80 ? T.warn : T.success
  const exploitInits = initiatives.filter(i => i.mode === 'exploit')
  const exploreInits = initiatives.filter(i => i.mode === 'explore')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
      {/* KR ヘッダ */}
      <div style={cardStyle({ T, accent: pctColor, padding: SPACING.lg })}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACING.md }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <span style={pillStyle({ color: T.textSub, size: 'sm' })}>{PERIOD_LABELS[kr._period] || kr._period}</span>
              {kr.owner && <span style={pillStyle({ color: T.accent, size: 'sm' })}>担当: {kr.owner}</span>}
            </div>
            <div style={{ ...TYPO.title3, color: T.text, marginBottom: 8 }}>{kr.title}</div>
            {kr._objTitle && (
              <div style={{ ...TYPO.footnote, color: T.textMuted, marginBottom: 8 }}>
                所属 OBJ: {kr._objTitle}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2 }}>
              <div style={{ flex: 1, ...progressBarStyle({ T, height: 8 }) }}>
                <div style={progressFillStyle({ color: pctColor, value: pct })} />
              </div>
              <span style={{ ...TYPO.subhead, color: T.textSub, whiteSpace: 'nowrap' }}>
                {Number(kr.current || 0).toLocaleString()} / {Number(kr.target || 0).toLocaleString()} {kr.unit}
              </span>
            </div>
          </div>
          <div style={{ ...kpiNumber({ color: pctColor, size: 36 }), flexShrink: 0 }}>{Math.round(pct)}%</div>
        </div>
      </div>

      {/* 経営からのメッセージ */}
      <StrategyMessageEditor T={T} kr={kr} strategy={strategy} myName={myName} onChanged={onChanged} />

      {/* 施策一覧 */}
      <InitiativesSection T={T} kr={kr} initiatives={initiatives}
        exploitInits={exploitInits} exploreInits={exploreInits}
        myName={myName} isAdmin={isAdmin} onChanged={onChanged} />
    </div>
  )
}

// ─── 経営メッセージ (テキストエリア + autosave) ──────────────────
function StrategyMessageEditor({ T, kr, strategy, myName, onChanged }) {
  const [text, setText] = useState(strategy?.message || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setText(strategy?.message || '') }, [strategy?.id, strategy?.message])

  const save = async () => {
    setSaving(true)
    const payload = { kr_id: kr.id, message: text, updated_by: myName, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('kr_strategies').upsert(payload, { onConflict: 'kr_id' })
    setSaving(false)
    if (error) { alert('保存失敗: ' + error.message); return }
    setEditing(false)
    if (onChanged) await onChanged()
  }

  return (
    <div style={cardStyle({ T, accent: '#AF52DE', padding: SPACING.lg })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <div style={accentRingStyle({ color: '#AF52DE', size: 28 })}><span style={{ fontSize: 14 }}>📝</span></div>
        <div style={{ ...TYPO.callout, color: T.text, flex: 1 }}>経営からのメッセージ</div>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={{ ...btnPrimary({ T, size: 'sm', color: '#AF52DE' }), padding: '4px 10px', fontSize: 11 }}>
            ✎ 編集
          </button>
        ) : (
          <>
            <button onClick={() => { setEditing(false); setText(strategy?.message || '') }} disabled={saving}
              style={{ padding: '4px 10px', borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              キャンセル
            </button>
            <button onClick={save} disabled={saving}
              style={{ ...btnPrimary({ T, size: 'sm', color: T.success }), padding: '4px 10px', fontSize: 11 }}>
              {saving ? '保存中…' : '✓ 保存'}
            </button>
          </>
        )}
      </div>
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
        text.trim() ? (
          <div style={{ ...TYPO.body, color: T.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{text}</div>
        ) : (
          <div style={{ padding: SPACING.md, ...TYPO.body, color: T.textMuted, textAlign: 'center', fontStyle: 'italic' }}>
            まだメッセージが登録されていません。「✎ 編集」から経営の意図を記入してください。
          </div>
        )
      )}
    </div>
  )
}

// ─── 施策一覧 (深化 + 探索) ─────────────────────────────────────
function InitiativesSection({ T, kr, initiatives, exploitInits, exploreInits, myName, isAdmin, onChanged }) {
  const [adding, setAdding] = useState(null) // { mode } | null

  return (
    <div style={cardStyle({ T, padding: SPACING.lg })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm + 2 }}>
        <div style={accentRingStyle({ color: T.accent, size: 28 })}><span style={{ fontSize: 14 }}>🎯</span></div>
        <div style={{ ...TYPO.callout, color: T.text, flex: 1 }}>施策一覧</div>
        <span style={{ ...TYPO.caption, color: T.textMuted }}>合計 {initiatives.length} 件</span>
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
  return (
    <div style={{
      marginBottom: SPACING.md,
      border: `1px solid ${meta.color}30`, borderRadius: RADIUS.md,
      background: `${meta.color}06`, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.sm,
        padding: `${SPACING.sm}px ${SPACING.md}px`,
        borderBottom: `1px solid ${meta.color}20`,
      }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <span style={{ ...TYPO.subhead, color: meta.color, fontWeight: 800 }}>{meta.label}</span>
        <span style={{ ...TYPO.caption, color: T.textMuted }}>{meta.desc}</span>
        <span style={{ ...TYPO.caption, color: T.textMuted, marginLeft: 'auto' }}>{inits.length} 件</span>
        <button onClick={onAdd} style={{
          padding: '3px 10px', borderRadius: RADIUS.sm, border: `1px solid ${meta.color}`,
          background: 'transparent', color: meta.color, fontSize: 11, fontWeight: 800,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>＋ 追加</button>
      </div>
      <div style={{ padding: SPACING.sm, display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
        {inits.length === 0 ? (
          <div style={{ padding: SPACING.sm + 2, ...TYPO.caption, color: T.textMuted, textAlign: 'center', fontStyle: 'italic' }}>
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

// ─── 施策カード ──────────────────────────────────────────────────
function InitiativeCard({ T, initiative, kr, myName, isAdmin, onChanged }) {
  const meta = STATUS_META[initiative.status] || STATUS_META.testing
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
      background: T.bgCard, border: `1px solid ${T.borderLight}`,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: RADIUS.sm + 2, padding: `${SPACING.sm}px ${SPACING.md}px`,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, flexWrap: 'wrap' }}>
        <span style={{
          padding: '2px 8px', borderRadius: RADIUS.pill,
          background: `${meta.color}1f`, color: meta.color,
          fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap',
        }}>{meta.icon} {meta.label}</span>
        <span style={{ ...TYPO.subhead, color: T.text, flex: 1, minWidth: 0 }}>{initiative.title}</span>
        {initiative.target_value != null && (
          <span style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 700, whiteSpace: 'nowrap' }}>
            目標 {Number(initiative.target_value).toLocaleString()}{initiative.unit || ''}
            {initiative.actual_value != null && ` / 実績 ${Number(initiative.actual_value).toLocaleString()}${initiative.unit || ''}`}
          </span>
        )}
        <button onClick={() => setEditing(true)} style={{
          padding: '2px 6px', borderRadius: RADIUS.xs, border: `1px solid ${T.border}`,
          background: 'transparent', color: T.textSub, fontSize: 10, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>編集</button>
        <button onClick={removeInit} style={{
          padding: '2px 6px', borderRadius: RADIUS.xs, border: `1px solid ${T.danger}40`,
          background: 'transparent', color: T.danger, fontSize: 10, fontWeight: 700,
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
          <strong style={{ fontWeight: 800 }}>✗ 失敗の理由: </strong>{initiative.failure_reason}
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

// ─── 施策追加/編集モーダル ───────────────────────────────────────
function InitiativeFormModal({ T, kr, mode, myName, onCancel, onSaved }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
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

  const inputBase = { ...inputStyle({ T }), padding: '6px 10px', fontSize: 12 }
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
            <option value="exploit">🔧 深化 (既存パターンを伸ばす)</option>
            <option value="explore">🧭 探索 (新しい打ち手)</option>
          </select>
        </div>
        <div>
          <Label>ステータス</Label>
          <select value={status} onChange={e => setStatus(e.target.value)} disabled={saving}
            style={{ ...inputBase, width: '100%' }}>
            <option value="testing">⏳ 検証中</option>
            <option value="success">✓ 成功</option>
            <option value="failure">✗ 失敗</option>
            <option value="paused">⏸ 停止</option>
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
          検証中の施策は終了日 (≒結論期限) を入れておくと、進捗管理しやすくなります
        </div>
      </div>

      <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.xs }}>
        <button onClick={onCancel} disabled={saving}
          style={{ flex: 1, padding: '8px 14px', borderRadius: RADIUS.md,
            border: `1px solid ${T.border}`, background: 'transparent', color: T.textSub,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          キャンセル
        </button>
        <button onClick={save} disabled={saving}
          style={{ flex: 1, ...btnPrimary({ T, size: 'md' }), opacity: saving ? 0.7 : 1 }}>
          {saving ? '保存中…' : (initial.id ? '✓ 更新' : '✓ 追加')}
        </button>
      </div>
    </div>
  )
}
