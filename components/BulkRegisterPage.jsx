'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { computeKAKey } from '../lib/kaKey'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS, TRANSITION } from '../lib/themeTokens'
import { cardStyle, pillStyle, btnPrimary, btnSecondary, btnGhost, btnDanger, inputStyle, sectionHeaderStyle } from '../lib/iosStyles'
import { LargeTitle, BgGlow } from './iosUI'
import Icon from './Icon'

// ─── ヘルパー ──────────────────────────────────────────────────────────────────
// JST基準で「入力日時を含む週の月曜日」のYYYY-MM-DD文字列を返す
function getMondayOf(date) {
  const dt = typeof date === 'string' ? new Date(date) : (date || new Date())
  const jst = new Date(dt.getTime() + 9 * 3600 * 1000)
  const jstDay = jst.getUTCDay()
  const diff = jstDay === 0 ? -6 : 1 - jstDay
  const mon = new Date(Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + diff
  ))
  return mon.toISOString().split('T')[0]
}
function getPastWeeks(n = 8) {
  const weeks = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i * 7)
    weeks.push(getMondayOf(d))
  }
  return [...new Set(weeks)].sort((a, b) => b.localeCompare(a))
}
function getLevelDepth(levelId, levels) {
  let d = 0, cur = levels.find(l => l.id === levelId)
  while (cur && cur.parent_id) { d++; cur = levels.find(l => l.id === cur.parent_id) }
  return d
}
function toPeriodKey(period, fiscalYear) {
  return fiscalYear === '2026' ? period : `${fiscalYear}_${period}`
}
function getPeriodLabel(periodKey) {
  if (!periodKey) return ''
  const base = periodKey.includes('_') ? periodKey.split('_').pop() : periodKey
  return { annual: '通期', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }[base] || periodKey
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }
const PERIOD_OPTS = [
  { value: 'annual', label: '通期' },
  { value: 'q1', label: 'Q1' }, { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' }, { value: 'q4', label: 'Q4' },
]
const STATUS_OPTIONS = [
  { value: 'normal', label: '未分類',  color: '#606880' },
  { value: 'focus',  label: '🎯 注力', color: '#4d9fff' },
  { value: 'good',   label: '✅ Good', color: '#00d68f' },
  { value: 'more',   label: '🔺 More', color: '#ff6b6b' },
]

const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ─── 共通UI ───────────────────────────────────────────────────────────────────
function DeptSelect({ value, onChange, levels, wT }) {
  const roots = levels.filter(l => !l.parent_id)
  const renderOpts = (levelId, indent = 0) => {
    const level = levels.find(l => l.id === levelId)
    if (!level) return []
    const depth = getLevelDepth(levelId, levels)
    const prefix = '\u3000'.repeat(indent)
    const result = [<option key={level.id} value={String(level.id)}>{prefix}{level.icon} {level.name}（{LAYER_LABELS[depth] || ''}）</option>]
    levels.filter(l => Number(l.parent_id) === Number(levelId)).forEach(c => result.push(...renderOpts(c.id, indent + 1)))
    return result
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: value ? wT.text : wT.textMuted, ...TYPO.subhead, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
      <option value="">-- 部署を選択 --</option>
      {roots.flatMap(r => renderOpts(r.id, 0))}
    </select>
  )
}

// ─── OKR一括登録タブ ──────────────────────────────────────────────────────────
function OKRBulkTab({ levels, members, fiscalYear, wT }) {
  const emptyKR = () => ({ _id: Date.now() + Math.random(), title: '', target: '', current: '', unit: '' })
  const emptyRow = (idx) => ({
    _id: Date.now() + Math.random(),
    _idx: idx,
    title: '',
    levelId: '',
    owner: '',
    period: 'q1',
    krs: [emptyKR()],
  })

  const [rows, setRows] = useState([emptyRow(1), emptyRow(2)])
  const [step, setStep] = useState('input') // input | preview | done
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')

  const addRow = () => setRows(p => [...p, emptyRow(p.length + 1)])
  const removeRow = (id) => setRows(p => p.filter(r => r._id !== id).map((r, i) => ({ ...r, _idx: i + 1 })))
  const updateRow = (id, field, val) => setRows(p => p.map(r => r._id === id ? { ...r, [field]: val } : r))
  const addKR = (id) => setRows(p => p.map(r => r._id === id ? { ...r, krs: [...r.krs, emptyKR()] } : r))
  const removeKR = (rowId, krId) => setRows(p => p.map(r => r._id === rowId ? { ...r, krs: r.krs.filter(k => k._id !== krId) } : r))
  const updateKR = (rowId, krId, field, val) => setRows(p => p.map(r => r._id === rowId ? { ...r, krs: r.krs.map(k => k._id === krId ? { ...k, [field]: val } : k) } : r))

  const validRows = rows.filter(r => r.title.trim() && r.levelId)

  const handleRegister = async () => {
    setRegistering(true); setError('')
    let ok = 0, ng = 0
    for (const row of validRows) {
      const periodKey = toPeriodKey(row.period, fiscalYear)
      const { data: obj, error: e1 } = await supabase.from('objectives')
        .insert({ title: row.title.trim(), owner: row.owner || null, level_id: parseInt(row.levelId), period: periodKey })
        .select().single()
      if (e1) { ng++; continue }
      const validKRs = row.krs.filter(k => k.title.trim())
      if (validKRs.length > 0) {
        await supabase.from('key_results').insert(
          validKRs.map(k => ({ title: k.title.trim(), target: parseFloat(k.target) || 0, current: parseFloat(k.current) || 0, unit: k.unit || '', lower_is_better: false, objective_id: obj.id }))
        )
      }
      ok++
    }
    setRegistering(false)
    if (ng > 0) setError(`⚠️ ${ng}件の登録に失敗しました`)
    if (ok > 0) setStep('done')
  }

  const reset = () => { setRows([emptyRow(1), emptyRow(2)]); setStep('input'); setError('') }

  const sInput = (extra) => ({ background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: wT.text, ...TYPO.subhead, fontWeight: 400, outline: 'none', fontFamily: 'inherit', ...extra })

  if (step === 'done') return (
    <div style={{ textAlign: 'center', padding: `${SPACING['3xl'] + SPACING.lg}px ${SPACING.xl}px` }}>
      <div style={{ marginBottom: SPACING.lg, color: wT.success, display: 'flex', justifyContent: 'center' }}><Icon name="check" size={56} /></div>
      <div style={{ ...TYPO.title1, color: wT.text, marginBottom: SPACING.sm }}>OKR登録完了！</div>
      <div style={{ ...TYPO.headline, fontWeight: 500, color: wT.textMuted, marginBottom: SPACING['3xl'] - 4 }}>{fiscalYear}年度のOKRダッシュボードに反映されました</div>
      <button onClick={reset} style={{ ...btnPrimary({ T: wT, size: 'lg', color: wT.accent }) }}>続けて登録する</button>
    </div>
  )

  if (step === 'preview') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.md, marginBottom: SPACING.xl, background: wT.accentBg, border: `1px solid ${wT.accentBg}` }}>
        <span style={{ color: wT.accent, display: 'inline-flex' }}><Icon name="calendar" size={18} /></span>
        <span style={{ ...TYPO.callout, color: wT.accent }}>{fiscalYear}年度として{validRows.length}件のOKRを登録します</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2, marginBottom: SPACING.xl }}>
        {validRows.map((row, i) => {
          const level = levels.find(l => l.id === parseInt(row.levelId))
          const d = level ? getLevelDepth(level.id, levels) : 0
          const color = LAYER_COLORS[d] || '#a0a8be'
          const validKRs = row.krs.filter(k => k.title.trim())
          return (
            <div key={row._id} style={{ ...cardStyle({ T: wT, padding: `${SPACING.md + 2}px ${SPACING.lg}px` }), border: `1px solid ${color}30`, borderLeft: `3px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <span style={{ ...pillStyle({ color, size: 'md' }), gap: 4 }}><Icon name="building" size={11} /> {level?.name}</span>
                <span style={{ ...TYPO.footnote, fontWeight: 600, color: wT.textMuted }}>{getPeriodLabel(toPeriodKey(row.period, fiscalYear))}</span>
                {row.owner && <span style={{ ...TYPO.footnote, color: avatarColor(row.owner), display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="user" size={11} /> {row.owner}</span>}
              </div>
              <div style={{ ...TYPO.headline, color: wT.text, marginBottom: validKRs.length ? SPACING.sm + 2 : 0 }}>{row.title}</div>
              {validKRs.map((kr, ki) => (
                <div key={kr._id} style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: `${SPACING.xs + 1}px ${SPACING.sm}px`, background: wT.bgCard2, borderRadius: RADIUS.xs, marginTop: SPACING.xs + 1 }}>
                  <span style={{ ...TYPO.caption, color: wT.accent }}>KR{ki + 1}</span>
                  <span style={{ ...TYPO.subhead, color: wT.textSub, flex: 1 }}>{kr.title}</span>
                  <span style={{ ...TYPO.footnote, color: wT.textMuted }}>{kr.current || 0}{kr.unit} / {kr.target || 0}{kr.unit}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {error && <div style={{ color: wT.danger, background: wT.dangerBg, borderRadius: RADIUS.sm, padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, ...TYPO.subhead, marginBottom: SPACING.md }}>{error}</div>}
      <div style={{ display: 'flex', gap: SPACING.sm + 2 }}>
        <button onClick={() => setStep('input')} style={{ ...btnSecondary({ T: wT, size: 'md' }), color: wT.textSub }}>← 戻って修正する</button>
        <button onClick={handleRegister} disabled={registering} style={{ flex: 1, ...btnPrimary({ T: wT, size: 'lg', color: wT.accent }), opacity: registering ? 0.6 : 1, cursor: registering ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {registering ? '登録中...' : <><Icon name="check" size={14} /> {validRows.length}件のOKRを{fiscalYear}年度に登録する</>}
        </button>
      </div>
    </div>
  )

  // 入力フォーム
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg }}>
        <div style={{ ...pillStyle({ color: fiscalYear === '2026' ? wT.accent : wT.warn, size: 'md' }), gap: 4 }}><Icon name="calendar" size={11} /> {fiscalYear}年度</div>
        <div style={{ ...TYPO.subhead, color: wT.textMuted }}>OKRタイトル・部署・担当者・KRを入力してください</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md, marginBottom: SPACING.lg }}>
        {rows.map((row) => (
          <div key={row._id} style={{ ...cardStyle({ T: wT, padding: `${SPACING.md + 2}px ${SPACING.lg}px` }), border: `1px solid ${row.title && row.levelId ? wT.accentBg : wT.border}`, borderLeft: `3px solid ${row.title && row.levelId ? wT.accent : wT.border}` }}>
            {/* ヘッダー行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm + 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: RADIUS.pill, background: wT.accentBg, border: `1px solid ${wT.accentBg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPO.caption, color: wT.accent, flexShrink: 0 }}>{row._idx}</div>
              <input value={row.title} onChange={e => updateRow(row._id, 'title', e.target.value)} placeholder="目標タイトル（必須）"
                style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${wT.border}`, color: wT.text, ...TYPO.headline, fontWeight: 600, outline: 'none', fontFamily: 'inherit', padding: '3px 4px' }}
                onFocus={e => e.target.style.borderBottomColor = wT.accent}
                onBlur={e => e.target.style.borderBottomColor = wT.border} />
              {rows.length > 1 && (
                <button onClick={() => removeRow(row._id)} style={{ width: 22, height: 22, borderRadius: RADIUS.xs - 2, border: 'none', background: wT.dangerBg, color: wT.danger, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cross" size={12} /></button>
              )}
            </div>
            {/* 部署・担当者・期間 */}
            <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap', marginBottom: SPACING.sm + 2, paddingLeft: 30 }}>
              <div style={{ flex: 2, minWidth: 140 }}>
                <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>部署 <span style={{ color: wT.danger }}>*</span></div>
                <DeptSelect value={row.levelId} onChange={val => updateRow(row._id, 'levelId', val)} levels={levels} wT={wT} />
              </div>
              <div style={{ flex: 2, minWidth: 100 }}>
                <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>担当者</div>
                <select value={row.owner} onChange={e => updateRow(row._id, 'owner', e.target.value)}
                  style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: row.owner ? avatarColor(row.owner) : wT.textMuted, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: row.owner ? 600 : 400 }}>
                  <option value="">-- 未設定 --</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 80 }}>
                <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>期間</div>
                <select value={row.period} onChange={e => updateRow(row._id, 'period', e.target.value)}
                  style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: wT.text, ...TYPO.subhead, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                  {PERIOD_OPTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            {/* KR入力 */}
            <div style={{ paddingLeft: 30 }}>
              <div style={{ ...TYPO.caption, color: wT.accent, textTransform: 'uppercase', marginBottom: SPACING.xs + 2 }}>Key Results</div>
              {row.krs.map((kr, ki) => (
                <div key={kr._id} style={{ display: 'flex', gap: SPACING.xs + 2, alignItems: 'center', marginBottom: SPACING.xs + 2, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, background: wT.bgCard2, borderRadius: RADIUS.sm - 1, border: `1px solid ${wT.border}` }}>
                  <span style={{ ...TYPO.caption, color: wT.accent, flexShrink: 0 }}>KR{ki + 1}</span>
                  <input value={kr.title} onChange={e => updateKR(row._id, kr._id, 'title', e.target.value)} placeholder="KRタイトル"
                    style={{ flex: 3, minWidth: 80, ...sInput({}) }} />
                  <input value={kr.current} onChange={e => updateKR(row._id, kr._id, 'current', e.target.value)} placeholder="現在値"
                    style={{ width: 64, ...sInput({}) }} />
                  <span style={{ ...TYPO.caption, color: wT.textFaint }}>/</span>
                  <input value={kr.target} onChange={e => updateKR(row._id, kr._id, 'target', e.target.value)} placeholder="目標値"
                    style={{ width: 64, ...sInput({}) }} />
                  <input value={kr.unit} onChange={e => updateKR(row._id, kr._id, 'unit', e.target.value)} placeholder="単位"
                    style={{ width: 44, ...sInput({}) }} />
                  {row.krs.length > 1 && (
                    <button onClick={() => removeKR(row._id, kr._id)} style={{ width: 18, height: 18, borderRadius: RADIUS.xs - 3, border: 'none', background: 'transparent', color: wT.textFaint, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cross" size={11} /></button>
                  )}
                </div>
              ))}
              <button onClick={() => addKR(row._id)} style={{ ...TYPO.caption, color: wT.accent, background: wT.accentBg, border: `1px dashed ${wT.accentBg}`, borderRadius: RADIUS.xs, padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="plus" size={11} /> KRを追加</button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRow} style={{ width: '100%', background: wT.sectionBg, border: `1px dashed ${wT.borderMid}`, color: wT.textMuted, borderRadius: RADIUS.md, padding: SPACING.sm + 2, ...TYPO.subhead, cursor: 'pointer', fontFamily: 'inherit', marginBottom: SPACING.lg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Icon name="plus" size={13} /> OKRを追加
      </button>

      <button onClick={() => { if (validRows.length === 0) { setError('タイトルと部署を1件以上入力してください'); return } setError(''); setStep('preview') }}
        style={{ width: '100%', ...(validRows.length > 0 ? btnPrimary({ T: wT, size: 'lg', color: wT.accent }) : { background: wT.sunken, border: 'none', color: wT.textFaint, borderRadius: RADIUS.md, fontWeight: 800, fontFamily: 'inherit' }), padding: SPACING.md + 2, fontSize: 15, cursor: validRows.length > 0 ? 'pointer' : 'not-allowed' }}>
        プレビューを確認する（{validRows.length}件）→
      </button>
      {error && <div style={{ color: wT.danger, ...TYPO.footnote, marginTop: SPACING.sm }}>{error}</div>}
    </div>
  )
}

// ─── KA一括登録タブ ────────────────────────────────────────────────────────────
function KABulkTab({ levels, members, fiscalYear, wT }) {
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const weeks = getPastWeeks(8)

  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period').order('level_id').then(({ data }) => setObjectives(data || []))
    supabase.from('key_results').select('id,title,objective_id').order('objective_id').then(({ data }) => setKeyResults(data || []))
  }, [])

  const emptyRow = (idx) => ({
    _id: Date.now() + Math.random(),
    _idx: idx,
    kaTitle: '',
    owner: '',
    levelId: '',
    objectiveId: '',
    krId: '',
    krTitle: '',
    status: 'normal',
    weekStart: getMondayOf(new Date()),
  })

  const [rows, setRows] = useState([emptyRow(1), emptyRow(2), emptyRow(3)])
  const [step, setStep] = useState('input')
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')

  const addRow = () => setRows(p => [...p, emptyRow(p.length + 1)])
  const removeRow = (id) => setRows(p => p.filter(r => r._id !== id).map((r, i) => ({ ...r, _idx: i + 1 })))
  const updateRow = (id, field, val) => setRows(p => p.map(r => r._id === id ? { ...r, [field]: val } : r))

  const validRows = rows.filter(r => r.kaTitle.trim())

  // 年度フィルタ済みOKR
  const filteredObjs = objectives.filter(o =>
    fiscalYear === '2026' ? !o.period.includes('_') : o.period.startsWith(`${fiscalYear}_`)
  )
  const getObjsForLevel = (levelId) => filteredObjs.filter(o => Number(o.level_id) === Number(levelId))
  const getKRsForObj = (objId) => keyResults.filter(kr => Number(kr.objective_id) === Number(objId))

  const handleRegister = async () => {
    setRegistering(true); setError('')
    let ok = 0, ng = 0
    for (const row of validRows) {
      const kr = row.krId ? keyResults.find(k => k.id === parseInt(row.krId)) : null
      const { error: e } = await supabase.from('weekly_reports').insert({
        week_start: row.weekStart,
        level_id: row.levelId ? parseInt(row.levelId) : null,
        objective_id: row.objectiveId ? parseInt(row.objectiveId) : null,
        kr_id: row.krId ? parseInt(row.krId) : null,
        kr_title: kr ? kr.title : null,
        ka_title: row.kaTitle.trim(),
        owner: row.owner || null,
        status: row.status,
      })
      if (e) { ng++; console.error('KA insert error:', e) } else ok++
    }
    setRegistering(false)
    if (ng > 0) setError(`⚠️ ${ng}件の登録に失敗しました`)
    if (ok > 0) setStep('done')
  }

  const reset = () => { setRows([emptyRow(1), emptyRow(2), emptyRow(3)]); setStep('input'); setError('') }

  if (step === 'done') return (
    <div style={{ textAlign: 'center', padding: `${SPACING['3xl'] + SPACING.lg}px ${SPACING.xl}px` }}>
      <div style={{ marginBottom: SPACING.lg, color: wT.success, display: 'flex', justifyContent: 'center' }}><Icon name="check" size={56} /></div>
      <div style={{ ...TYPO.title1, color: wT.text, marginBottom: SPACING.sm }}>KA登録完了！</div>
      <div style={{ ...TYPO.headline, fontWeight: 500, color: wT.textMuted, marginBottom: SPACING['3xl'] - 4 }}>週次MTGページに反映されました</div>
      <button onClick={reset} style={{ ...btnPrimary({ T: wT, size: 'lg', color: wT.success }) }}>続けて登録する</button>
    </div>
  )

  if (step === 'preview') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.md, marginBottom: SPACING.xl, background: wT.successBg, border: `1px solid ${wT.successBg}` }}>
        <span style={{ color: wT.success, display: 'inline-flex' }}><Icon name="note" size={18} /></span>
        <span style={{ ...TYPO.callout, color: wT.success }}>{validRows.length}件のKAを登録します</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm, marginBottom: SPACING.xl }}>
        {validRows.map((row) => {
          const statusCfg = STATUS_OPTIONS.find(s => s.value === row.status) || STATUS_OPTIONS[0]
          const level = row.levelId ? levels.find(l => l.id === parseInt(row.levelId)) : null
          const obj = row.objectiveId ? objectives.find(o => o.id === parseInt(row.objectiveId)) : null
          const kr = row.krId ? keyResults.find(k => k.id === parseInt(row.krId)) : null
          return (
            <div key={row._id} style={{ ...cardStyle({ T: wT, padding: `${SPACING.md}px ${SPACING.md + 2}px` }), border: `1px solid ${statusCfg.color}30`, borderLeft: `3px solid ${statusCfg.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs + 2, flexWrap: 'wrap' }}>
                <span style={{ ...pillStyle({ color: statusCfg.color, size: 'md' }) }}>{statusCfg.label}</span>
                {level && <span style={{ ...TYPO.footnote, color: wT.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="building" size={11} /> {level.name}</span>}
                {row.owner && <span style={{ ...TYPO.footnote, color: avatarColor(row.owner), display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="user" size={11} /> {row.owner}</span>}
                <span style={{ ...TYPO.footnote, fontWeight: 600, color: wT.textFaint, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={11} /> {row.weekStart}</span>
              </div>
              <div style={{ ...TYPO.subhead, color: wT.text, marginBottom: (obj || kr) ? SPACING.xs + 2 : 0 }}>{row.kaTitle}</div>
              {obj && <div style={{ ...TYPO.footnote, color: wT.accent, background: wT.accentBg, borderRadius: RADIUS.xs - 1, padding: `2px ${SPACING.sm}px`, display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: SPACING.xs + 2 }}><Icon name="target" size={11} /> {obj.title}</div>}
              {kr && <div style={{ ...TYPO.footnote, color: '#a855f7', background: 'rgba(168,85,247,0.08)', borderRadius: RADIUS.xs - 1, padding: `2px ${SPACING.sm}px`, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="chart" size={11} /> {kr.title}</div>}
            </div>
          )
        })}
      </div>
      {error && <div style={{ color: wT.danger, background: wT.dangerBg, borderRadius: RADIUS.sm, padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, ...TYPO.subhead, marginBottom: SPACING.md }}>{error}</div>}
      <div style={{ display: 'flex', gap: SPACING.sm + 2 }}>
        <button onClick={() => setStep('input')} style={{ ...btnSecondary({ T: wT, size: 'md' }), color: wT.textSub }}>← 戻って修正する</button>
        <button onClick={handleRegister} disabled={registering} style={{ flex: 1, ...btnPrimary({ T: wT, size: 'lg', color: wT.success }), opacity: registering ? 0.6 : 1, cursor: registering ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {registering ? '登録中...' : <><Icon name="check" size={14} /> {validRows.length}件のKAを登録する</>}
        </button>
      </div>
    </div>
  )

  // 入力フォーム
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg }}>
        <div style={{ ...TYPO.subhead, color: wT.textMuted }}>KAタイトル・担当者・部署・紐づくKRを入力してください</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2, marginBottom: SPACING.lg }}>
        {rows.map((row) => {
          const statusCfg = STATUS_OPTIONS.find(s => s.value === row.status) || STATUS_OPTIONS[0]
          const objsForLevel = row.levelId ? getObjsForLevel(row.levelId) : filteredObjs
          const krsForObj = row.objectiveId ? getKRsForObj(row.objectiveId) : []
          return (
            <div key={row._id} style={{ ...cardStyle({ T: wT, padding: `${SPACING.md}px ${SPACING.md + 2}px` }), border: `1px solid ${row.kaTitle ? statusCfg.color + '35' : wT.border}`, borderLeft: `3px solid ${row.kaTitle ? statusCfg.color : wT.border}` }}>
              {/* タイトル行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm + 2 }}>
                <div style={{ width: 22, height: 22, borderRadius: RADIUS.pill, background: `${statusCfg.color}15`, border: `1px solid ${statusCfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPO.caption, color: statusCfg.color, flexShrink: 0 }}>{row._idx}</div>
                <input value={row.kaTitle} onChange={e => updateRow(row._id, 'kaTitle', e.target.value)} placeholder="KAタイトルを入力（必須）"
                  style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${wT.border}`, color: wT.text, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', padding: '3px 4px' }}
                  onFocus={e => e.target.style.borderBottomColor = wT.success}
                  onBlur={e => e.target.style.borderBottomColor = wT.border} />
                {rows.length > 1 && (
                  <button onClick={() => removeRow(row._id)} style={{ width: 22, height: 22, borderRadius: RADIUS.xs - 2, border: 'none', background: wT.dangerBg, color: wT.danger, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cross" size={12} /></button>
                )}
              </div>
              {/* 詳細入力 */}
              <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap', paddingLeft: 30, marginBottom: SPACING.sm }}>
                <div style={{ flex: 2, minWidth: 130 }}>
                  <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>部署</div>
                  <DeptSelect value={row.levelId} onChange={val => {
                    updateRow(row._id, 'levelId', val)
                    updateRow(row._id, 'objectiveId', '')
                    updateRow(row._id, 'krId', '')
                    updateRow(row._id, 'krTitle', '')
                  }} levels={levels} wT={wT} />
                </div>
                <div style={{ flex: 2, minWidth: 100 }}>
                  <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>担当者</div>
                  <select value={row.owner} onChange={e => updateRow(row._id, 'owner', e.target.value)}
                    style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: row.owner ? avatarColor(row.owner) : wT.textMuted, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: row.owner ? 600 : 400 }}>
                    <option value="">-- 未設定 --</option>
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>ステータス</div>
                  <select value={row.status} onChange={e => updateRow(row._id, 'status', e.target.value)}
                    style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${statusCfg.color}50`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: statusCfg.color, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>週</div>
                  <select value={row.weekStart} onChange={e => updateRow(row._id, 'weekStart', e.target.value)}
                    style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: wT.text, ...TYPO.footnote, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                    {weeks.map(w => <option key={w} value={w}>{w}{w === weeks[0] ? '（今週）' : ''}</option>)}
                  </select>
                </div>
              </div>
              {/* OKR・KR紐付け */}
              <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap', paddingLeft: 30 }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.accent, marginBottom: 3, textTransform: 'uppercase' }}>紐づくObjective（任意）</div>
                  <select value={row.objectiveId} onChange={e => {
                    updateRow(row._id, 'objectiveId', e.target.value)
                    updateRow(row._id, 'krId', '')
                    updateRow(row._id, 'krTitle', '')
                  }}
                    style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.accentBg}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: wT.text, ...TYPO.footnote, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                    <option value="">-- OKRを選択（任意）--</option>
                    {objsForLevel.map(o => <option key={o.id} value={String(o.id)}>[{getPeriodLabel(o.period)}] {o.title}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <div style={{ ...TYPO.caption, fontWeight: 600, color: '#a855f7', marginBottom: 3, textTransform: 'uppercase' }}>紐づくKR（任意）</div>
                  <select value={row.krId} onChange={e => {
                    const kr = keyResults.find(k => k.id === parseInt(e.target.value))
                    updateRow(row._id, 'krId', e.target.value)
                    updateRow(row._id, 'krTitle', kr ? kr.title : '')
                  }}
                    disabled={!row.objectiveId}
                    style={{ width: '100%', background: wT.bgCard2, border: '1px solid rgba(168,85,247,0.2)', borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: row.objectiveId ? wT.text : wT.textFaint, ...TYPO.footnote, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: row.objectiveId ? 'pointer' : 'not-allowed' }}>
                    <option value="">-- KRを選択（任意）--</option>
                    {krsForObj.map(kr => <option key={kr.id} value={String(kr.id)}>{kr.title}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={addRow} style={{ width: '100%', background: wT.sectionBg, border: `1px dashed ${wT.borderMid}`, color: wT.textMuted, borderRadius: RADIUS.md, padding: SPACING.sm + 2, ...TYPO.subhead, cursor: 'pointer', fontFamily: 'inherit', marginBottom: SPACING.lg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Icon name="plus" size={13} /> KAを追加
      </button>

      <button onClick={() => { if (validRows.length === 0) { setError('KAタイトルを1件以上入力してください'); return } setError(''); setStep('preview') }}
        style={{ width: '100%', ...(validRows.length > 0 ? btnPrimary({ T: wT, size: 'lg', color: wT.success }) : { background: wT.sunken, border: 'none', color: wT.textFaint, borderRadius: RADIUS.md, fontWeight: 800, fontFamily: 'inherit' }), padding: SPACING.md + 2, fontSize: 15, cursor: validRows.length > 0 ? 'pointer' : 'not-allowed' }}>
        プレビューを確認する（{validRows.length}件）→
      </button>
      {error && <div style={{ color: wT.danger, ...TYPO.footnote, marginTop: SPACING.sm }}>{error}</div>}
    </div>
  )
}

// ─── Notion議事録インポートタブ ──────────────────────────────────────────────
function NotionImportTab({ levels, members, fiscalYear, wT }) {
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const weeks = getPastWeeks(8)

  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period').order('level_id').then(({ data }) => setObjectives(data || []))
    supabase.from('key_results').select('id,title,objective_id').order('objective_id').then(({ data }) => setKeyResults(data || []))
  }, [])

  const [notionUrl, setNotionUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [rows, setRows] = useState([])
  const [step, setStep] = useState('input') // input | preview | done
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [resultCount, setResultCount] = useState({ ka: 0, task: 0 })

  const makeRow = (text, idx) => ({
    _id: Date.now() + Math.random(),
    _idx: idx,
    kaTitle: text,
    owner: '',
    levelId: '',
    objectiveId: '',
    krId: '',
    krTitle: '',
    status: 'focus',
    weekStart: getMondayOf(new Date()),
    createTask: true,
    dueDate: '',
    assignee: '',
  })

  const updateRow = (id, field, val) => setRows(p => p.map(r => r._id === id ? { ...r, [field]: val } : r))
  const removeRow = (id) => setRows(p => p.filter(r => r._id !== id).map((r, i) => ({ ...r, _idx: i + 1 })))

  const validRows = rows.filter(r => r.kaTitle.trim())
  const taskCount = validRows.filter(r => r.createTask).length

  const filteredObjs = objectives.filter(o =>
    fiscalYear === '2026' ? !o.period.includes('_') : o.period.startsWith(`${fiscalYear}_`)
  )
  const getObjsForLevel = (levelId) => filteredObjs.filter(o => Number(o.level_id) === Number(levelId))
  const getKRsForObj = (objId) => keyResults.filter(kr => Number(kr.objective_id) === Number(objId))

  const handleFetch = async () => {
    if (!notionUrl.trim()) return
    setFetching(true); setFetchError('')
    try {
      const res = await fetch('/api/notion-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionUrl: notionUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFetchError(data.error || 'エラーが発生しました')
        setFetching(false)
        return
      }
      setPageTitle(data.pageTitle || '')
      if (data.actionItems && data.actionItems.length > 0) {
        setRows(data.actionItems.filter(a => !a.checked).map((a, i) => makeRow(a.text, i + 1)))
      } else {
        setFetchError('アクションアイテムが見つかりませんでした')
      }
    } catch (e) {
      setFetchError('Notion APIとの通信に失敗しました')
    }
    setFetching(false)
  }

  const handleRegister = async () => {
    setRegistering(true); setError('')
    let kaOk = 0, taskOk = 0, ng = 0
    for (const row of validRows) {
      const kr = row.krId ? keyResults.find(k => k.id === parseInt(row.krId)) : null
      const { data: ka, error: e1 } = await supabase.from('weekly_reports').insert({
        week_start: row.weekStart,
        level_id: row.levelId ? parseInt(row.levelId) : null,
        objective_id: row.objectiveId ? parseInt(row.objectiveId) : null,
        kr_id: row.krId ? parseInt(row.krId) : null,
        kr_title: kr ? kr.title : null,
        ka_title: row.kaTitle.trim(),
        owner: row.owner || null,
        status: row.status,
      }).select().single()
      if (e1) { ng++; console.error('KA insert error:', e1); continue }
      kaOk++
      if (row.createTask && ka) {
        const { error: e2 } = await supabase.from('ka_tasks').insert({
          report_id: ka.id,
          title: row.kaTitle.trim(),
          assignee: row.assignee || row.owner || null,
          due_date: row.dueDate || null,
          done: false,
          ka_key: computeKAKey(ka),
        })
        if (!e2) taskOk++
      }
    }
    setRegistering(false)
    if (ng > 0) setError(`${ng}件の登録に失敗しました`)
    setResultCount({ ka: kaOk, task: taskOk })
    if (kaOk > 0) setStep('done')
  }

  const reset = () => {
    setNotionUrl(''); setPageTitle(''); setRows([])
    setStep('input'); setError(''); setFetchError('')
    setResultCount({ ka: 0, task: 0 })
  }

  // ── Done ──
  if (step === 'done') return (
    <div style={{ textAlign: 'center', padding: `${SPACING['3xl'] + SPACING.lg}px ${SPACING.xl}px` }}>
      <div style={{ marginBottom: SPACING.lg, color: wT.warn, display: 'flex', justifyContent: 'center' }}><Icon name="check" size={56} /></div>
      <div style={{ ...TYPO.title1, color: wT.text, marginBottom: SPACING.sm }}>Notion議事録インポート完了！</div>
      <div style={{ ...TYPO.headline, fontWeight: 500, color: wT.textMuted, marginBottom: SPACING.sm }}>
        KA: {resultCount.ka}件 / タスク: {resultCount.task}件 登録しました
      </div>
      {pageTitle && <div style={{ ...TYPO.footnote, color: wT.textFaint, marginBottom: SPACING['3xl'] - 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="note" size={12} /> {pageTitle}</div>}
      <button onClick={reset} style={{ ...btnPrimary({ T: wT, size: 'lg', color: wT.warn }) }}>続けてインポートする</button>
    </div>
  )

  // ── Preview ──
  if (step === 'preview') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.md, marginBottom: SPACING.xl, background: wT.warnBg, border: `1px solid ${wT.warnBg}` }}>
        <span style={{ color: wT.warn, display: 'inline-flex' }}><Icon name="pencil" size={18} /></span>
        <span style={{ ...TYPO.callout, color: wT.warn }}>
          {validRows.length}件のKA + {taskCount}件のタスクを登録します
        </span>
      </div>
      {pageTitle && (
        <div style={{ ...TYPO.subhead, color: wT.textMuted, marginBottom: SPACING.md + 2, padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`, background: wT.sectionBg, borderRadius: RADIUS.xs, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="note" size={12} /> {pageTitle}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm, marginBottom: SPACING.xl }}>
        {validRows.map((row) => {
          const statusCfg = STATUS_OPTIONS.find(s => s.value === row.status) || STATUS_OPTIONS[0]
          const level = row.levelId ? levels.find(l => l.id === parseInt(row.levelId)) : null
          const obj = row.objectiveId ? objectives.find(o => o.id === parseInt(row.objectiveId)) : null
          const kr = row.krId ? keyResults.find(k => k.id === parseInt(row.krId)) : null
          return (
            <div key={row._id} style={{ ...cardStyle({ T: wT, padding: `${SPACING.md}px ${SPACING.md + 2}px` }), border: `1px solid ${statusCfg.color}30`, borderLeft: `3px solid ${statusCfg.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs + 2, flexWrap: 'wrap' }}>
                <span style={{ ...pillStyle({ color: statusCfg.color, size: 'md' }) }}>{statusCfg.label}</span>
                {level && <span style={{ ...TYPO.footnote, color: wT.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="building" size={11} /> {level.name}</span>}
                {row.owner && <span style={{ ...TYPO.footnote, color: avatarColor(row.owner), display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="user" size={11} /> {row.owner}</span>}
                <span style={{ ...TYPO.footnote, fontWeight: 600, color: wT.textFaint, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={11} /> {row.weekStart}</span>
              </div>
              <div style={{ ...TYPO.subhead, color: wT.text, marginBottom: (obj || kr || row.createTask) ? SPACING.xs + 2 : 0 }}>{row.kaTitle}</div>
              <div style={{ display: 'flex', gap: SPACING.xs + 2, flexWrap: 'wrap' }}>
                {obj && <div style={{ ...TYPO.footnote, color: wT.accent, background: wT.accentBg, borderRadius: RADIUS.xs - 1, padding: `2px ${SPACING.sm}px`, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="target" size={11} /> {obj.title}</div>}
                {kr && <div style={{ ...TYPO.footnote, color: '#a855f7', background: 'rgba(168,85,247,0.08)', borderRadius: RADIUS.xs - 1, padding: `2px ${SPACING.sm}px`, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="chart" size={11} /> {kr.title}</div>}
                {row.createTask && (
                  <div style={{ ...TYPO.footnote, color: wT.success, background: wT.successBg, borderRadius: RADIUS.xs - 1, padding: `2px ${SPACING.sm}px`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="check" size={11} /> タスク作成{row.dueDate ? ` (〜${row.dueDate})` : ''}{row.assignee ? ` → ${row.assignee}` : ''}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {error && <div style={{ color: wT.danger, background: wT.dangerBg, borderRadius: RADIUS.sm, padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, ...TYPO.subhead, marginBottom: SPACING.md }}>{error}</div>}
      <div style={{ display: 'flex', gap: SPACING.sm + 2 }}>
        <button onClick={() => setStep('input')} style={{ ...btnSecondary({ T: wT, size: 'md' }), color: wT.textSub }}>← 戻って修正する</button>
        <button onClick={handleRegister} disabled={registering} style={{ flex: 1, ...btnPrimary({ T: wT, size: 'lg', color: wT.warn }), opacity: registering ? 0.6 : 1, cursor: registering ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {registering ? '登録中...' : <><Icon name="check" size={14} /> {validRows.length}件のKA + {taskCount}件のタスクを登録する</>}
        </button>
      </div>
    </div>
  )

  // ── Input ──
  return (
    <div>
      {/* URL入力 */}
      <div style={{ marginBottom: SPACING.xl }}>
        <div style={{ ...TYPO.subhead, color: wT.textMuted, marginBottom: SPACING.sm }}>Notionの議事録ページURLを入力してください</div>
        <div style={{ display: 'flex', gap: SPACING.sm }}>
          <input
            value={notionUrl} onChange={e => setNotionUrl(e.target.value)}
            placeholder="https://www.notion.so/..."
            onKeyDown={e => e.key === 'Enter' && handleFetch()}
            style={{ ...inputStyle({ T: wT }), background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, ...TYPO.subhead, padding: `${SPACING.sm + 2}px ${SPACING.md}px` }}
          />
          <button onClick={handleFetch} disabled={fetching || !notionUrl.trim()}
            style={{ ...(fetching ? { background: wT.bgCard2, color: wT.textMuted, border: 'none', borderRadius: RADIUS.sm, fontWeight: 800, fontFamily: 'inherit' } : btnPrimary({ T: wT, size: 'lg', color: wT.warn })), padding: `${SPACING.sm + 2}px ${SPACING.xl}px`, cursor: fetching ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {fetching ? '取得中...' : '取得'}
          </button>
        </div>
        {fetchError && <div style={{ color: wT.danger, ...TYPO.footnote, marginTop: SPACING.sm }}>{fetchError}</div>}
      </div>

      {/* 取得結果 */}
      {rows.length > 0 && (
        <>
          {pageTitle && (
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, background: wT.warnBg, border: `1px solid ${wT.warnBg}` }}>
              <span style={{ color: wT.warn, display: 'inline-flex' }}><Icon name="note" size={14} /></span>
              <span style={{ ...TYPO.subhead, color: wT.warn }}>{pageTitle}</span>
              <span style={{ ...TYPO.footnote, color: wT.textMuted, marginLeft: 'auto' }}>{rows.length}件のアクションアイテム</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2, marginBottom: SPACING.lg }}>
            {rows.map((row) => {
              const statusCfg = STATUS_OPTIONS.find(s => s.value === row.status) || STATUS_OPTIONS[0]
              const objsForLevel = row.levelId ? getObjsForLevel(row.levelId) : filteredObjs
              const krsForObj = row.objectiveId ? getKRsForObj(row.objectiveId) : []
              return (
                <div key={row._id} style={{ ...cardStyle({ T: wT, padding: `${SPACING.md}px ${SPACING.md + 2}px` }), border: `1px solid ${row.kaTitle ? statusCfg.color + '35' : wT.border}`, borderLeft: `3px solid ${row.kaTitle ? statusCfg.color : wT.border}` }}>
                  {/* タイトル行 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm + 2 }}>
                    <div style={{ width: 22, height: 22, borderRadius: RADIUS.pill, background: `${statusCfg.color}15`, border: `1px solid ${statusCfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYPO.caption, color: statusCfg.color, flexShrink: 0 }}>{row._idx}</div>
                    <input value={row.kaTitle} onChange={e => updateRow(row._id, 'kaTitle', e.target.value)} placeholder="KAタイトル"
                      style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${wT.border}`, color: wT.text, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', padding: '3px 4px' }}
                      onFocus={e => e.target.style.borderBottomColor = wT.warn}
                      onBlur={e => e.target.style.borderBottomColor = wT.border} />
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row._id)} style={{ width: 22, height: 22, borderRadius: RADIUS.xs - 2, border: 'none', background: wT.dangerBg, color: wT.danger, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cross" size={12} /></button>
                    )}
                  </div>
                  {/* 詳細入力 */}
                  <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap', paddingLeft: 30, marginBottom: SPACING.sm }}>
                    <div style={{ flex: 2, minWidth: 130 }}>
                      <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>部署</div>
                      <DeptSelect value={row.levelId} onChange={val => {
                        updateRow(row._id, 'levelId', val)
                        updateRow(row._id, 'objectiveId', '')
                        updateRow(row._id, 'krId', '')
                        updateRow(row._id, 'krTitle', '')
                      }} levels={levels} wT={wT} />
                    </div>
                    <div style={{ flex: 2, minWidth: 100 }}>
                      <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>担当者</div>
                      <select value={row.owner} onChange={e => updateRow(row._id, 'owner', e.target.value)}
                        style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: row.owner ? avatarColor(row.owner) : wT.textMuted, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: row.owner ? 600 : 400 }}>
                        <option value="">-- 未設定 --</option>
                        {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 90 }}>
                      <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>ステータス</div>
                      <select value={row.status} onChange={e => updateRow(row._id, 'status', e.target.value)}
                        style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${statusCfg.color}50`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: statusCfg.color, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>週</div>
                      <select value={row.weekStart} onChange={e => updateRow(row._id, 'weekStart', e.target.value)}
                        style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: wT.text, ...TYPO.footnote, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {weeks.map(w => <option key={w} value={w}>{w}{w === weeks[0] ? '（今週）' : ''}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* OKR・KR紐付け */}
                  <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap', paddingLeft: 30, marginBottom: SPACING.sm }}>
                    <div style={{ flex: 2, minWidth: 160 }}>
                      <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.accent, marginBottom: 3, textTransform: 'uppercase' }}>紐づくObjective（任意）</div>
                      <select value={row.objectiveId} onChange={e => {
                        updateRow(row._id, 'objectiveId', e.target.value)
                        updateRow(row._id, 'krId', '')
                        updateRow(row._id, 'krTitle', '')
                      }}
                        style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.accentBg}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: wT.text, ...TYPO.footnote, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                        <option value="">-- OKRを選択（任意）--</option>
                        {objsForLevel.map(o => <option key={o.id} value={String(o.id)}>[{getPeriodLabel(o.period)}] {o.title}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 2, minWidth: 160 }}>
                      <div style={{ ...TYPO.caption, fontWeight: 600, color: '#a855f7', marginBottom: 3, textTransform: 'uppercase' }}>紐づくKR（任意）</div>
                      <select value={row.krId} onChange={e => {
                        const kr = keyResults.find(k => k.id === parseInt(e.target.value))
                        updateRow(row._id, 'krId', e.target.value)
                        updateRow(row._id, 'krTitle', kr ? kr.title : '')
                      }}
                        disabled={!row.objectiveId}
                        style={{ width: '100%', background: wT.bgCard2, border: '1px solid rgba(168,85,247,0.2)', borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: row.objectiveId ? wT.text : wT.textFaint, ...TYPO.footnote, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: row.objectiveId ? 'pointer' : 'not-allowed' }}>
                        <option value="">-- KRを選択（任意）--</option>
                        {krsForObj.map(kr => <option key={kr.id} value={String(kr.id)}>{kr.title}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* タスク作成オプション */}
                  <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap', paddingLeft: 30, alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, cursor: 'pointer', ...TYPO.subhead, color: row.createTask ? wT.success : wT.textMuted, fontWeight: row.createTask ? 600 : 400 }}>
                      <input type="checkbox" checked={row.createTask} onChange={e => updateRow(row._id, 'createTask', e.target.checked)}
                        style={{ accentColor: wT.success }} />
                      タスクも作成
                    </label>
                    {row.createTask && (
                      <>
                        <div style={{ minWidth: 100 }}>
                          <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>担当者</div>
                          <select value={row.assignee} onChange={e => updateRow(row._id, 'assignee', e.target.value)}
                            style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: row.assignee ? avatarColor(row.assignee) : wT.textMuted, ...TYPO.subhead, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: row.assignee ? 600 : 400 }}>
                            <option value="">-- KA担当者と同じ --</option>
                            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </div>
                        <div style={{ minWidth: 130 }}>
                          <div style={{ ...TYPO.caption, fontWeight: 600, color: wT.textMuted, marginBottom: 3, textTransform: 'uppercase' }}>期限</div>
                          <input type="date" value={row.dueDate} onChange={e => updateRow(row._id, 'dueDate', e.target.value)}
                            style={{ width: '100%', background: wT.bgCard2, border: `1px solid ${wT.borderMid}`, borderRadius: RADIUS.xs, padding: `${SPACING.sm - 2}px ${SPACING.sm}px`, color: wT.text, ...TYPO.subhead, fontWeight: 400, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <button onClick={() => { if (validRows.length === 0) { setError('KAタイトルを1件以上入力してください'); return } setError(''); setStep('preview') }}
            style={{ width: '100%', ...(validRows.length > 0 ? btnPrimary({ T: wT, size: 'lg', color: wT.warn }) : { background: wT.sunken, border: 'none', color: wT.textFaint, borderRadius: RADIUS.md, fontWeight: 800, fontFamily: 'inherit' }), padding: SPACING.md + 2, fontSize: 15, cursor: validRows.length > 0 ? 'pointer' : 'not-allowed' }}>
            プレビューを確認する（KA {validRows.length}件 + タスク {taskCount}件）→
          </button>
          {error && <div style={{ color: wT.danger, ...TYPO.footnote, marginTop: SPACING.sm }}>{error}</div>}
        </>
      )}
    </div>
  )
}

// ─── メインコンポーネント ──────────────────────────────────────────────────────
export default function BulkRegisterPage({ levels, themeKey = 'dark', fiscalYear = '2026' }) {
  // テーマは lib/themeTokens.js で一元管理
  const W_THEMES = {
    dark:  { ...COMMON_TOKENS.dark },
    light: { ...COMMON_TOKENS.light },
  }
  const wT = W_THEMES[themeKey] || W_THEMES.dark

  const [activeTab, setActiveTab] = useState('okr')
  const [members, setMembers] = useState([])

  useEffect(() => {
    supabase.from('members').select('id,name,role').order('name').then(({ data }) => setMembers(data || []))
  }, [])

  const tabs = [
    { key: 'okr', label: 'OKR一括登録', icon: 'target', desc: '目標・KRをまとめて入力', color: wT.accent },
    { key: 'ka',  label: 'KA一括登録',  icon: 'note',   desc: 'KAをまとめて入力',      color: wT.success },
    { key: 'notion', label: 'Notion取込', icon: 'pencil', desc: '議事録からKA・タスク登録', color: wT.warn },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: wT.bg, color: wT.text, position: 'relative' }}>
      <BgGlow T={wT} color="#AF52DE" />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: `0 ${SPACING['3xl'] - 4}px ${SPACING['3xl'] - 4}px`, position: 'relative', zIndex: 1 }}>
        <LargeTitle T={wT}
          title="一括登録"
          subtitle={`${fiscalYear}年度 ・ OKR・KA・Notion を複数件まとめて入力`}
          right={<span style={{ ...pillStyle({ color: wT.accent, size: 'lg' }), gap: 4 }}><Icon name="calendar" size={12} /> {fiscalYear}年度</span>}
        />

        {/* タブ */}
        <div style={{ display: 'flex', gap: SPACING.xs, marginBottom: SPACING['3xl'] - 4, background: wT.sectionBg, padding: SPACING.xs, borderRadius: RADIUS.lg, border: `1px solid ${wT.border}` }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex: 1, padding: `${SPACING.sm + 2}px ${SPACING.lg}px`, borderRadius: RADIUS.md - 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: activeTab === tab.key ? `linear-gradient(135deg, ${tab.color} 0%, ${tab.color}d0 100%)` : 'transparent',
              color: activeTab === tab.key ? '#fff' : wT.textMuted,
              transition: TRANSITION.fast,
            }}>
              <div style={{ ...TYPO.headline, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs + 2 }}><Icon name={tab.icon} size={14} /> {tab.label}</div>
              <div style={{ ...TYPO.caption, fontWeight: 600, opacity: activeTab === tab.key ? 0.85 : 0.6, marginTop: 2 }}>{tab.desc}</div>
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        {activeTab === 'okr' && <OKRBulkTab levels={levels} members={members} fiscalYear={fiscalYear} wT={wT} />}
        {activeTab === 'ka'  && <KABulkTab  levels={levels} members={members} fiscalYear={fiscalYear} wT={wT} />}
        {activeTab === 'notion' && <NotionImportTab levels={levels} members={members} fiscalYear={fiscalYear} wT={wT} />}
      </div>
    </div>
  )
}
