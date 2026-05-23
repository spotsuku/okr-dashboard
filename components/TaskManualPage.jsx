'use client'
/**
 * TaskManualPage.jsx  v3.0  — DB必須版
 *
 * ■ Supabase テーブル（supabase_manual_setup.sql を実行してから使用）
 *   - org_manual_phases : フェーズ管理
 *   - org_manual_steps  : ステップ管理（urls は JSONB）
 *
 * ■ OrgPage.jsx への組み込み
 *   1) import TaskManualPage from './TaskManualPage'
 *   2) tabs 配列に { id:'taskflow', icon:'🔄', label:'業務フロー' } を追加
 *   3) activeTab==='taskflow' のとき TaskManualPage を render
 *        levels, isAdmin, themeKey を props として渡す
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { btnPrimary, btnSecondary, inputStyle } from '../lib/iosStyles'
import Icon from './Icon'

// ─────────────────────────────────────────────────
// テーマ
// ─────────────────────────────────────────────────
// テーマは lib/themeTokens.js で一元管理。固有フィールドだけ上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    bgCard2: '#1C1C1E',
    bgInput: 'rgba(255,255,255,0.06)', bgHover: 'rgba(255,255,255,0.05)',
    borderDash: 'rgba(255,255,255,0.12)',
    green: '#30D158', greenBg: 'rgba(48,209,88,0.16)', greenBorder: 'rgba(48,209,88,0.35)',
    link: '#0A84FF', linkBg: 'rgba(10,132,255,0.16)', linkBorder: 'rgba(10,132,255,0.35)',
    navActiveBg: 'rgba(10,132,255,0.18)', navBorder: '#0A84FF', navText: '#5EB3FF',
    badgeBg: 'rgba(10,132,255,0.18)', badgeBorder: 'rgba(10,132,255,0.40)',
    editRing: '#0A84FF',
    errorBg: 'rgba(255,69,58,0.16)', errorBorder: 'rgba(255,69,58,0.30)', errorText: '#FF453A',
  },
  light: {
    ...COMMON_TOKENS.light,
    bgCard2: '#FAFAFC',
    bgInput: '#F2F2F7', bgHover: 'rgba(0,0,0,0.03)',
    borderDash: 'rgba(0,0,0,0.10)',
    green: '#34C759', greenBg: 'rgba(52,199,89,0.10)', greenBorder: 'rgba(52,199,89,0.30)',
    link: '#007AFF', linkBg: 'rgba(0,122,255,0.10)', linkBorder: 'rgba(0,122,255,0.30)',
    navActiveBg: 'rgba(0,122,255,0.10)', navBorder: '#007AFF', navText: '#0062CC',
    badgeBg: 'rgba(0,122,255,0.10)', badgeBorder: 'rgba(0,122,255,0.30)',
    editRing: '#007AFF',
    errorBg: 'rgba(255,59,48,0.10)', errorBorder: 'rgba(255,59,48,0.30)', errorText: '#FF3B30',
  },
}

// ─────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────
const DEPT_COLORS = [
  { match: 'コミュニティ', color: '#3D7A6A' },
  { match: 'ユース',       color: '#5D4E8C' },
  { match: 'パートナー',   color: '#B86B30' },
  { match: '経営',         color: '#2F5F8C' },
  { match: 'クラブ',       color: '#1A7A5A' },
]
const getDeptColor = (name) => (DEPT_COLORS.find(r => name?.includes(r.match))?.color ?? '#5A8A7A')

const NEW_STEP  = () => ({ title: '新しいステップ', owner: '', tool: '', urls: [], condition: '', caution: '' })
const NEW_PHASE = () => ({ badge: '新フェーズ', badgeClass: 'operate', title: 'フェーズ名を入力', steps: [NEW_STEP()] })

// ─────────────────────────────────────────────────
// Supabase CRUD（DB必須・エラー時は例外を投げる）
// ─────────────────────────────────────────────────
async function dbFetch(levelId) {
  // メタ（役割・スタンス）取得
  const { data: metaRow } = await supabase
    .from('org_manual_meta')
    .select('role, stance')
    .eq('level_id', levelId)
    .maybeSingle()

  const { data: phases, error: e1 } = await supabase
    .from('org_manual_phases')
    .select('id, sort_order, badge, badge_class, title')
    .eq('level_id', levelId)
    .order('sort_order')
  if (e1) throw new Error(`フェーズ取得エラー: ${e1.message}`)

  if (!phases || phases.length === 0) return { phases: [] }

  const { data: steps, error: e2 } = await supabase
    .from('org_manual_steps')
    .select('id, phase_id, sort_order, title, owner, tool, urls, condition, caution')
    .in('phase_id', phases.map(p => p.id))
    .order('sort_order')
  if (e2) throw new Error(`ステップ取得エラー: ${e2.message}`)

  const stepMap = {}
  ;(steps || []).forEach(s => {
    if (!stepMap[s.phase_id]) stepMap[s.phase_id] = []
    stepMap[s.phase_id].push({
      _dbId: s.id,
      title: s.title, owner: s.owner, tool: s.tool,
      urls: Array.isArray(s.urls) ? s.urls : (typeof s.urls === 'string' ? JSON.parse(s.urls) : []),
      condition: s.condition, caution: s.caution,
    })
  })

  return {
    role:   metaRow?.role   || '',
    stance: Array.isArray(metaRow?.stance) ? metaRow.stance : [],
    phases: phases.map(p => ({
      _dbId: p.id,
      badge: p.badge, badgeClass: p.badge_class, title: p.title,
      steps: stepMap[p.id] || [],
    })),
  }
}

async function dbSave(levelId, data) {
  // 0. メタ（役割・スタンス）保存
  const { error: me } = await supabase
    .from('org_manual_meta')
    .upsert({ level_id: levelId, role: data.role || '', stance: data.stance || [] }, { onConflict: 'level_id' })
  if (me) throw new Error(`メタ保存エラー: ${me.message}`)

  // 1. 旧データ全削除（CASCADE で steps も消える）
  const { data: old } = await supabase
    .from('org_manual_phases')
    .select('id')
    .eq('level_id', levelId)
  const oldIds = (old || []).map(r => r.id)
  if (oldIds.length > 0) {
    const { error: de } = await supabase.from('org_manual_phases').delete().in('id', oldIds)
    if (de) throw new Error(`削除エラー: ${de.message}`)
  }

  // 2. フェーズ＆ステップを順次 INSERT
  for (let pi = 0; pi < data.phases.length; pi++) {
    const ph = data.phases[pi]
    const { data: ins, error: pe } = await supabase
      .from('org_manual_phases')
      .insert({ level_id: levelId, sort_order: pi, badge: ph.badge, badge_class: ph.badgeClass, title: ph.title })
      .select('id')
      .single()
    if (pe) throw new Error(`フェーズ登録エラー: ${pe.message}`)

    if (ph.steps.length > 0) {
      const rows = ph.steps.map((s, si) => ({
        phase_id: ins.id, sort_order: si,
        title: s.title || '', owner: s.owner || '', tool: s.tool || '',
        urls: s.urls || [],          // JSONB カラム → 配列のまま渡す
        condition: s.condition || '', caution: s.caution || '',
      }))
      const { error: se } = await supabase.from('org_manual_steps').insert(rows)
      if (se) throw new Error(`ステップ登録エラー: ${se.message}`)
    }
  }
}

// ─────────────────────────────────────────────────
// UI 部品
// ─────────────────────────────────────────────────
function UrlChip({ url, T }) {
  if (!url.href) return null
  return (
    <a href={url.href} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: T.linkBg, border: `1px solid ${T.linkBorder}`,
        borderRadius: RADIUS.xs, padding: '3px 10px', fontSize: TYPO.footnote.fontSize,
        color: T.link, textDecoration: 'none', fontWeight: 500,
        maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
      <Icon name="link" size={11} />{url.label || url.href}
    </a>
  )
}

function UrlEditRow({ url, onChangeLabel, onChangeHref, onDelete, T }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACING.xs + 2,
      background: T.linkBg, border: `1px solid ${T.linkBorder}`,
      borderRadius: RADIUS.xs + 1, padding: '5px 9px', marginTop: SPACING.xs,
    }}>
      <input type="text" value={url.label} placeholder="表示名" onChange={e => onChangeLabel(e.target.value)}
        style={{ width: 88, flexShrink: 0, background: 'transparent', border: 'none', borderBottom: `1px dashed ${T.borderMid}`, color: T.link, fontSize: TYPO.footnote.fontSize, fontWeight: 600, outline: 'none', fontFamily: 'inherit', paddingBottom: 1 }} />
      <span style={{ color: T.textMuted, fontSize: TYPO.caption.fontSize, flexShrink: 0 }}><Icon name="arrowRight" size={11} /></span>
      <input type="url" value={url.href} placeholder="https://..." onChange={e => onChangeHref(e.target.value)}
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', borderBottom: `1px dashed ${T.borderMid}`, color: T.textSub, fontSize: TYPO.footnote.fontSize, outline: 'none', fontFamily: 'inherit', paddingBottom: 1 }} />
      <button onClick={onDelete}
        style={{ background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer', fontSize: TYPO.callout.fontSize, padding: '0 2px', lineHeight: 1, display: 'inline-flex' }}
        onMouseEnter={e => e.currentTarget.style.color = T.warn}
        onMouseLeave={e => e.currentTarget.style.color = T.textFaint}><Icon name="cross" size={13} /></button>
    </div>
  )
}

// ─────────────────────────────────────────────────
// ステップカード
// ─────────────────────────────────────────────────
function StepCard({ step, si, phaseColor, editMode, onChange, onDelete, T }) {
  const [open, setOpen] = useState(false)

  const updateUrl = (ui, field, val) => {
    const urls = [...(step.urls || [])]
    urls[ui] = { ...urls[ui], [field]: val }
    onChange('urls', urls)
  }
  const addUrl    = (e) => { e.stopPropagation(); onChange('urls', [...(step.urls || []), { label: '', href: '' }]) }
  const deleteUrl = (ui) => { const u = [...(step.urls || [])]; u.splice(ui, 1); onChange('urls', u) }

  const inSt = (extra = {}) => ({
    width: '100%', boxSizing: 'border-box',
    background: T.bgInput, border: `1px solid ${T.editRing}55`,
    borderRadius: RADIUS.xs - 1, padding: '5px 8px', color: T.text,
    fontSize: TYPO.subhead.fontSize, outline: 'none', fontFamily: 'inherit', ...extra,
  })
  const dispSt = (extra = {}) => ({
    fontSize: TYPO.subhead.fontSize, color: T.textSub, lineHeight: 1.65,
    background: T.bgCard2, borderRadius: RADIUS.xs - 1, padding: '5px 9px', minHeight: 30,
    whiteSpace: 'pre-wrap', ...extra,
  })

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${open ? phaseColor + '45' : T.border}`,
      borderRadius: RADIUS.md, marginBottom: SPACING.sm, overflow: 'hidden',
      boxShadow: open ? SHADOWS.sm : SHADOWS.none,
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* ヘッダー */}
      <div onClick={() => setOpen(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, padding: '13px 16px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{
          width: 26, height: 26, borderRadius: RADIUS.xs + 1, flexShrink: 0,
          background: phaseColor, color: '#fff', fontSize: TYPO.footnote.fontSize, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{si + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editMode
            ? <input value={step.title} onClick={e => e.stopPropagation()} onChange={e => onChange('title', e.target.value)} placeholder="ステップ名" style={inSt({ fontWeight: 600, fontSize: TYPO.callout.fontSize })} />
            : <span style={{ fontSize: TYPO.callout.fontSize, fontWeight: 700, color: T.text }}>{step.title || '（ステップ名未入力）'}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexShrink: 0 }}>
          {!open && (step.urls || []).filter(u => u.href).length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, padding: '1px 6px', borderRadius: RADIUS.pill, background: T.linkBg, color: T.link, fontWeight: 700, border: `1px solid ${T.linkBorder}` }}>
              <Icon name="link" size={10} />{(step.urls || []).filter(u => u.href).length}
            </span>
          )}
          {editMode && (
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: T.warnBg, border: `1px solid ${T.warn}40`, color: T.warn, borderRadius: RADIUS.xs - 1, padding: '2px 8px', fontSize: TYPO.caption.fontSize, cursor: 'pointer' }}>
              <Icon name="cross" size={10} /> 削除
            </button>
          )}
          <span style={{ color: T.textFaint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-flex' }}><Icon name="chevronD" size={12} /></span>
        </div>
      </div>

      {/* 詳細 */}
      {open && (
        <div style={{ padding: '0 16px 16px 54px', borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.md }}>
            {/* 担当者 */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>担当者</div>
              {editMode
                ? <input value={step.owner} onChange={e => onChange('owner', e.target.value)} placeholder="担当者名" style={inSt()} />
                : <div style={dispSt()}>{step.owner || <span style={{ color: T.textFaint, fontStyle: 'italic' }}>未設定</span>}</div>}
            </div>
            {/* ツール・URL */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>使用ツール・場所</div>
              {editMode
                ? <input value={step.tool} onChange={e => onChange('tool', e.target.value)} placeholder="ツール名" style={inSt()} />
                : <div style={dispSt()}>{step.tool || <span style={{ color: T.textFaint, fontStyle: 'italic' }}>未設定</span>}</div>}
              {/* URL */}
              <div style={{ marginTop: 6 }}>
                {(step.urls || []).map((url, ui) => (
                  editMode
                    ? <UrlEditRow key={ui} url={url}
                        onChangeLabel={v => updateUrl(ui, 'label', v)}
                        onChangeHref={v => updateUrl(ui, 'href', v)}
                        onDelete={() => deleteUrl(ui)} T={T} />
                    : url.href ? <div key={ui} style={{ marginTop: SPACING.xs }}><UrlChip url={url} T={T} /></div> : null
                ))}
                {editMode && (
                  <button onClick={addUrl}
                    style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs, marginTop: 5, background: 'none', border: `1px dashed ${T.borderMid}`, borderRadius: RADIUS.xs - 1, padding: '3px 9px', cursor: 'pointer', color: T.textMuted, fontSize: TYPO.footnote.fontSize, fontFamily: 'inherit', transition: '0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.link; e.currentTarget.style.color = T.link }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.color = T.textMuted }}>
                    <Icon name="plus" size={12} /> URLを追加
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 完了条件 */}
          <div style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: RADIUS.sm, padding: '10px 13px', marginBottom: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: T.green, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}><Icon name="check" size={11} /> 完了条件</div>
            {editMode
              ? <textarea value={step.condition} onChange={e => onChange('condition', e.target.value)} placeholder="完了の定義を記入" rows={2}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', color: T.text, fontSize: TYPO.subhead.fontSize, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }} />
              : <span style={{ fontSize: TYPO.subhead.fontSize, color: T.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{step.condition || <span style={{ color: T.textFaint, fontStyle: 'italic' }}>未入力</span>}</span>}
          </div>

          {/* 注意点 */}
          {(step.caution || editMode) && (
            <div style={{ background: T.warnBg, border: `1px solid ${T.warn}40`, borderRadius: RADIUS.sm, padding: '10px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: T.warn, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}><Icon name="alert" size={11} /> 注意点</div>
              {editMode
                ? <textarea value={step.caution} onChange={e => onChange('caution', e.target.value)} placeholder="（任意）特記事項・落とし穴など" rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', color: T.textSub, fontSize: TYPO.subhead.fontSize, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }} />
                : <span style={{ fontSize: TYPO.subhead.fontSize, color: T.textSub, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{step.caution}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────
// フェーズブロック
// ─────────────────────────────────────────────────
function PhaseBlock({ phase, pi, deptColor, editMode, onUpdate, onDelete, onAddStep, onUpdateStep, onDeleteStep, onReorderStep, T }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const isOnboard  = phase.badgeClass === 'onboard'
  const phaseColor = isOnboard ? T.green : deptColor
  const badgeSt    = isOnboard
    ? { background: T.greenBg, color: T.green, border: `1px solid ${T.greenBorder}` }
    : { background: `${deptColor}18`, color: deptColor, border: `1px solid ${deptColor}40` }

  const selSt = { background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.xs, padding: '4px 8px', color: T.text, fontSize: TYPO.footnote.fontSize, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }
  const inpSt = (fw) => ({ background: T.bgInput, border: `1px solid ${T.editRing}55`, borderRadius: RADIUS.xs - 1, padding: '4px 8px', color: T.text, outline: 'none', fontFamily: 'inherit', fontSize: fw ? 15 : TYPO.footnote.fontSize, fontWeight: fw ? 700 : 400 })

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: 14, flexWrap: 'wrap' }}>
        {editMode ? (
          <>
            <select value={phase.badgeClass} onChange={e => onUpdate(pi, 'badgeClass', e.target.value)} style={selSt}>
              <option value="onboard">入会フェーズ（緑）</option>
              <option value="operate">運用フェーズ（アクセント）</option>
            </select>
            <input value={phase.badge} onChange={e => onUpdate(pi, 'badge', e.target.value)} placeholder="バッジ名" style={{ ...inpSt(false), width: 120 }} />
            <input value={phase.title} onChange={e => onUpdate(pi, 'title', e.target.value)} placeholder="フェーズのタイトル" style={{ ...inpSt(true), flex: 1, minWidth: 160 }} />
            <button onClick={() => onDelete(pi)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: RADIUS.xs - 1, background: T.warnBg, border: `1px solid ${T.warn}40`, color: T.warn, fontSize: TYPO.footnote.fontSize, cursor: 'pointer', marginLeft: 'auto', whiteSpace: 'nowrap' }}><Icon name="cross" size={11} /> フェーズ削除</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: TYPO.footnote.fontSize, fontWeight: 700, padding: '3px 13px', borderRadius: RADIUS.pill, ...badgeSt }}>{phase.badge}</span>
            <span style={{ fontSize: TYPO.title3.fontSize, fontWeight: 700, color: T.text }}>{phase.title}</span>
          </>
        )}
      </div>
      {phase.steps.map((step, si) => (
        <div key={si}
          draggable={editMode}
          onDragStart={() => setDragIdx(si)}
          onDragEnd={() => { if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) onReorderStep(pi, dragIdx, overIdx); setDragIdx(null); setOverIdx(null) }}
          onDragOver={e => { e.preventDefault(); setOverIdx(si) }}
          style={{ opacity: dragIdx === si ? 0.4 : 1, borderTop: editMode && overIdx === si && dragIdx !== null && dragIdx !== si ? `2px solid ${phaseColor}` : '2px solid transparent', transition: 'opacity 0.15s', cursor: editMode ? 'grab' : 'default' }}
        >
          <StepCard step={step} si={si} phaseColor={phaseColor} editMode={editMode}
            onChange={(f, v) => onUpdateStep(pi, si, f, v)}
            onDelete={() => onDeleteStep(pi, si)} T={T} />
        </div>
      ))}
      {editMode && (
        <button onClick={() => onAddStep(pi)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', padding: '9px', marginTop: SPACING.xs, background: 'none', border: `1.5px dashed ${T.borderDash}`, borderRadius: RADIUS.sm + 1, cursor: 'pointer', color: T.textMuted, fontSize: TYPO.subhead.fontSize, fontFamily: 'inherit', transition: '0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.editRing; e.currentTarget.style.color = T.editRing }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderDash; e.currentTarget.style.color = T.textMuted }}>
          <Icon name="plus" size={13} /> ステップを追加
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────
// 概念フロー図
// ─────────────────────────────────────────────────
function ConceptFlow({ phases, deptColor, T }) {
  const steps = phases.flatMap(ph => ph.steps.map(s => ({ title: s.title, cls: ph.badgeClass })))
  if (steps.length === 0) return null
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '16px 20px', marginBottom: 28, overflowX: 'auto' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.textMuted, marginBottom: SPACING.sm + 2 }}>全体の流れ（概念）</div>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content' }}>
        {steps.map((s, i) => {
          const c = s.cls === 'onboard' ? T.green : deptColor
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 96, padding: '4px 2px' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: c, color: '#fff', fontSize: TYPO.subhead.fontSize, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>{i + 1}</div>
                <span style={{ fontSize: TYPO.footnote.fontSize, fontWeight: 600, lineHeight: 1.4, color: T.textSub }}>{s.title || '…'}</span>
              </div>
              {i < steps.length - 1 && <span style={{ color: T.textFaint, padding: '0 2px', paddingBottom: 18, display: 'inline-flex' }}><Icon name="arrowRight" size={16} /></span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────
// RoleBlock（チームの役割）
// ─────────────────────────────────────────────────
function RoleBlock({ role, deptColor, editMode, onUpdate, T }) {
  if (!role && !editMode) return null
  return (
    <div style={{
      background: `${deptColor}0d`,
      border: `1px solid ${deptColor}30`,
      borderLeft: `4px solid ${deptColor}`,
      borderRadius: RADIUS.md, padding: '16px 20px', marginBottom: SPACING.xl,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs, fontSize: TYPO.caption.fontSize, fontWeight: 700, color: deptColor, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: SPACING.sm }}>
        <Icon name="target" size={12} /> チームの役割
      </div>
      {editMode ? (
        <textarea
          value={role}
          onChange={e => onUpdate(e.target.value)}
          rows={3}
          placeholder="このチームの役割・ミッションを入力"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: T.bgInput, border: `1px solid ${T.editRing}55`,
            borderRadius: RADIUS.xs, padding: '8px 10px', color: T.text,
            fontSize: TYPO.body.fontSize, lineHeight: 1.75, outline: 'none',
            fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      ) : (
        <p style={{ fontSize: TYPO.body.fontSize, color: T.textSub, lineHeight: 1.85, margin: 0 }}>{role}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────
// StanceBlock（考え方・スタンス）
// ─────────────────────────────────────────────────
function StanceBlock({ stance, deptColor, editMode, onUpdate, T }) {
  if ((!stance || stance.length === 0) && !editMode) return null

  const addItem = () => onUpdate([...(stance || []), { icon: '💡', title: '新しいスタンス', body: '内容を入力' }])
  const delItem = (i) => { const n = [...stance]; n.splice(i, 1); onUpdate(n) }
  const updItem = (i, field, val) => { const n = [...stance]; n[i] = { ...n[i], [field]: val }; onUpdate(n) }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACING.xs, fontSize: TYPO.footnote.fontSize, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.textMuted }}>
          <Icon name="sparkle" size={13} /> 考え方・スタンス
        </span>
        <div style={{ flex: 1, height: 1, background: T.border }} />
        {editMode && (
          <button onClick={addItem} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'none', border: `1px dashed ${T.borderMid}`,
            borderRadius: RADIUS.xs, padding: '3px 10px', cursor: 'pointer',
            color: T.textMuted, fontSize: TYPO.footnote.fontSize, fontFamily: 'inherit',
          }}><Icon name="plus" size={11} /> 追加</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: SPACING.sm + 3 }}>
        {(stance || []).map((item, i) => (
          <div key={i} style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: RADIUS.lg, padding: SPACING.lg, position: 'relative',
          }}>
            {editMode && (
              <button onClick={() => delItem(i)} style={{
                position: 'absolute', top: 8, right: 8,
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.textFaint, fontSize: TYPO.callout.fontSize, padding: '0 2px',
                display: 'inline-flex',
              }}
                onMouseEnter={e => e.currentTarget.style.color = T.warn}
                onMouseLeave={e => e.currentTarget.style.color = T.textFaint}
              ><Icon name="cross" size={13} /></button>
            )}
            {editMode ? (
              <>
                <input value={item.icon} onChange={e => updItem(i, 'icon', e.target.value)}
                  style={{ width: 36, background: 'transparent', border: 'none', fontSize: 19, outline: 'none', marginBottom: 7, display: 'block', cursor: 'text' }} />
                <input value={item.title} onChange={e => updItem(i, 'title', e.target.value)}
                  placeholder="タイトル"
                  style={{ width: '100%', boxSizing: 'border-box', background: T.bgInput, border: `1px solid ${T.editRing}55`, borderRadius: RADIUS.xs - 1, padding: '4px 7px', color: T.text, fontSize: TYPO.body.fontSize, fontWeight: 700, outline: 'none', fontFamily: 'inherit', marginBottom: SPACING.xs + 2 }} />
                <textarea value={item.body} onChange={e => updItem(i, 'body', e.target.value)}
                  rows={3} placeholder="内容"
                  style={{ width: '100%', boxSizing: 'border-box', background: T.bgInput, border: `1px solid ${T.editRing}55`, borderRadius: RADIUS.xs - 1, padding: '4px 7px', color: T.textSub, fontSize: TYPO.subhead.fontSize, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.65 }} />
              </>
            ) : (
              <>
                <div style={{ fontSize: 19, marginBottom: 7 }}>{item.icon}</div>
                <div style={{ fontSize: TYPO.body.fontSize, fontWeight: 700, color: T.text, marginBottom: SPACING.xs }}>{item.title}</div>
                <div style={{ fontSize: 12.5, color: T.textSub, lineHeight: 1.7 }}>{item.body}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// サイドバー
// ─────────────────────────────────────────────────
function Sidebar({ levels, selected, onSelect, query, onQuery, T }) {
  const roots  = levels.filter(l => !l.parent_id)
  const byId   = id => levels.find(l => Number(l.id) === Number(id))
  const kids   = id => levels.filter(l => Number(l.parent_id) === Number(id))

  const allTeams = useMemo(() => {
    const list = []
    roots.forEach(root => kids(root.id).forEach(dept => {
      const teams = kids(dept.id)
      teams.length > 0
        ? teams.forEach(t => list.push({ dept, team: t }))
        : list.push({ dept, team: dept })
    }))
    return list
  }, [levels])

  const filtered = query
    ? allTeams.filter(({ dept, team }) => dept.name.includes(query) || team.name.includes(query))
    : allTeams

  const grouped = {}
  filtered.forEach(item => {
    const k = item.dept.id
    if (!grouped[k]) grouped[k] = { dept: item.dept, teams: [] }
    grouped[k].teams.push(item.team)
  })

  return (
    <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 10px 8px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: T.textFaint, pointerEvents: 'none', display: 'inline-flex' }}><Icon name="search" size={12} /></span>
          <input type="text" value={query} onChange={e => onQuery(e.target.value)} placeholder="チームを検索..."
            style={{ width: '100%', boxSizing: 'border-box', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: RADIUS.xs + 1, padding: '6px 8px 6px 28px', color: T.text, fontSize: TYPO.footnote.fontSize, outline: 'none', fontFamily: 'inherit' }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {Object.values(grouped).map(({ dept, teams }) => {
          const dc = getDeptColor(dept.name)
          return (
            <div key={dept.id} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: TYPO.caption.fontSize, fontWeight: 700, color: dc, padding: '6px 8px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dc, flexShrink: 0 }} />{dept.name}
              </div>
              {teams.map(team => {
                const isAct = Number(selected) === Number(team.id)
                return (
                  <div key={team.id} onClick={() => onSelect(team.id)}
                    style={{ padding: '7px 8px 7px 16px', borderRadius: RADIUS.xs + 1, cursor: 'pointer', marginBottom: 2, fontSize: TYPO.subhead.fontSize, fontWeight: isAct ? 700 : 500, color: isAct ? T.navText : T.textSub, background: isAct ? T.navActiveBg : 'transparent', borderLeft: `2px solid ${isAct ? T.navBorder : 'transparent'}`, transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = T.bgHover }}
                    onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = 'transparent' }}>
                    {team.icon} {team.name}
                  </div>
                )
              })}
            </div>
          )
        })}
        {Object.keys(grouped).length === 0 && (
          <div style={{ fontSize: TYPO.subhead.fontSize, color: T.textFaint, fontStyle: 'italic', padding: '16px 8px', textAlign: 'center' }}>チームが見つかりません</div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────
export default function TaskManualPage({ levels, isAdmin, themeKey = 'dark' }) {
  const T = THEMES[themeKey] || THEMES.dark

  const [selectedId,  setSelectedId]  = useState(null)
  const [editMode,    setEditMode]    = useState(false)
  const [data,        setData]        = useState({})   // levelId → {role, stance, phases:[...]}
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [savedFlash,  setSavedFlash]  = useState(false)
  const [dirty,       setDirty]       = useState(false)
  const [dbError,     setDbError]     = useState(null) // エラーメッセージ
  const [query,       setQuery]       = useState('')

  // チーム情報
  const allTeams = useMemo(() => {
    const roots = levels.filter(l => !l.parent_id)
    const kids  = id => levels.filter(l => Number(l.parent_id) === Number(id))
    const list  = []
    roots.forEach(root => kids(root.id).forEach(dept => {
      const teams = kids(dept.id)
      teams.length > 0
        ? teams.forEach(t => list.push({ dept, team: t }))
        : list.push({ dept, team: dept })
    }))
    return list
  }, [levels])

  const selLevel = selectedId ? levels.find(l => Number(l.id) === Number(selectedId)) : null
  const selItem  = selectedId ? allTeams.find(i => Number(i.team.id) === Number(selectedId)) : null
  const deptColor = selItem ? getDeptColor(selItem.dept.name) : '#5A8A7A'

  // ── データ読み込み ──────────────────────────────
  const loadData = useCallback(async (lid) => {
    if (!lid) return
    setLoading(true)
    setDirty(false)
    setDbError(null)
    try {
      const fetched = await dbFetch(lid)
      setData(prev => ({ ...prev, [lid]: fetched }))
    } catch (e) {
      setDbError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) { setEditMode(false); loadData(selectedId) }
  }, [selectedId, loadData])

  // ── 保存 ─────────────────────────────────────────
  const saveData = async () => {
    if (!selectedId) return
    const cur = data[selectedId]
    if (!cur) return
    setSaving(true)
    setDbError(null)
    try {
      await dbSave(selectedId, cur)
      setDirty(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch (e) {
      setDbError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── データ操作 ────────────────────────────────────
  const markDirty = () => setDirty(true)

  const updateRole = (val) => {
    setData(prev => ({ ...prev, [selectedId]: { ...(prev[selectedId] || {}), role: val } }))
    markDirty()
  }
  const updateStance = (stances) => {
    setData(prev => ({ ...prev, [selectedId]: { ...(prev[selectedId] || {}), stance: stances } }))
    markDirty()
  }

  const mutData   = (fn) => {
    setData(prev => {
      const cur  = prev[selectedId] || { phases: [] }
      const next = JSON.parse(JSON.stringify(cur))
      fn(next.phases)
      return { ...prev, [selectedId]: next }
    })
    markDirty()
  }

  const onUpdatePhase  = (pi, f, v)    => mutData(ps => { ps[pi][f] = v })
  const onDeletePhase  = (pi)          => {
    const name = data[selectedId]?.phases[pi]?.badge || ''
    if (!confirm(`「${name}」を削除しますか？`)) return
    mutData(ps => ps.splice(pi, 1))
  }
  const onAddPhase     = ()            => mutData(ps => ps.push(NEW_PHASE()))
  const onAddStep      = (pi)          => mutData(ps => ps[pi].steps.push(NEW_STEP()))
  const onDeleteStep   = (pi, si)      => {
    const name = data[selectedId]?.phases[pi]?.steps[si]?.title || ''
    if (!confirm(`「${name}」を削除しますか？`)) return
    mutData(ps => ps[pi].steps.splice(si, 1))
  }
  const onUpdateStep   = (pi, si, f, v) => mutData(ps => { ps[pi].steps[si][f] = v })
  const onReorderStep  = (pi, fromIdx, toIdx) => mutData(ps => {
    const steps = ps[pi].steps
    const [moved] = steps.splice(fromIdx, 1)
    steps.splice(toIdx, 0, moved)
  })

  const cur        = selectedId ? (data[selectedId] || null) : null
  const totalSteps = cur ? cur.phases.reduce((s, p) => s + p.steps.length, 0) : 0

  // チーム切り替え前に確認
  const handleSelect = (id) => {
    if (dirty && !confirm('未保存の変更があります。破棄して切り替えますか？')) return
    setSelectedId(id)
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 600, background: T.bg, color: T.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif' }}>

      {/* サイドバー */}
      <Sidebar levels={levels} selected={selectedId} onSelect={handleSelect} query={query} onQuery={setQuery} T={T} />

      {/* メインパネル */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>

        {/* 未選択 */}
        {!selLevel && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: SPACING.md, color: T.textFaint }}>
            <div style={{ display: 'flex' }}><Icon name="note" size={48} /></div>
            <div style={{ fontSize: TYPO.body.fontSize + 2, color: T.textMuted }}>左のチームを選んでください</div>
            <div style={{ fontSize: TYPO.subhead.fontSize }}>チームごとにフェーズ別の業務マニュアルを管理できます</div>
          </div>
        )}

        {/* ローディング */}
        {selectedId && loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: T.accent, fontSize: TYPO.headline.fontSize }}>読み込み中...</div>
        )}

        {/* DBエラー */}
        {dbError && (
          <div style={{ margin: '24px 28px', padding: '14px 18px', background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderRadius: RADIUS.md, color: T.errorText, fontSize: TYPO.body.fontSize }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, marginBottom: SPACING.sm - 2 }}><Icon name="alert" size={14} /> データベースエラー</div>
            <div style={{ fontSize: TYPO.subhead.fontSize, fontFamily: 'monospace', marginBottom: SPACING.sm + 2 }}>{dbError}</div>
            <div style={{ fontSize: TYPO.subhead.fontSize, color: T.textMuted, lineHeight: 1.7 }}>
              <b>対処法：</b>Supabase SQL Editor で <code>supabase_manual_setup.sql</code> を実行してテーブルを作成してください。<br />
              テーブル作成後、ページをリロードして再度お試しください。
            </div>
            <button onClick={() => loadData(selectedId)} style={{ marginTop: SPACING.sm + 2, padding: '6px 14px', borderRadius: RADIUS.xs + 1, background: T.accentSolid, border: 'none', color: '#fff', fontSize: TYPO.subhead.fontSize, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>再読み込み</button>
          </div>
        )}

        {/* メインコンテンツ */}
        {selLevel && !loading && !dbError && cur && (
          <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>

            {/* ページヘッダー */}
            <div style={{ marginBottom: SPACING.xl }}>
              <div style={{ fontSize: TYPO.footnote.fontSize, color: T.textFaint, marginBottom: SPACING.sm - 2, display: 'flex', alignItems: 'center', gap: SPACING.sm - 2 }}>
                <span>{selItem?.dept?.name}</span>
                <span style={{ opacity: 0.4, display: 'inline-flex' }}><Icon name="chevronR" size={11} /></span>
                <span style={{ color: T.textMuted }}>{selLevel.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: TYPO.title1.fontSize, fontWeight: 700, color: T.text, margin: 0 }}>{selLevel.icon} {selLevel.name}</h1>
                <span style={{ fontSize: TYPO.footnote.fontSize, fontWeight: 700, padding: '3px 10px', borderRadius: RADIUS.pill, background: `${deptColor}18`, color: deptColor, border: `1px solid ${deptColor}40` }}>
                  {cur.phases.length}フェーズ
                </span>
                <span style={{ fontSize: TYPO.footnote.fontSize, padding: '3px 10px', borderRadius: RADIUS.pill, background: T.bgCard, color: T.textMuted, border: `1px solid ${T.border}` }}>
                  {totalSteps}ステップ
                </span>

                {/* 操作ボタン */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: SPACING.sm, alignItems: 'center' }}>
                  {isAdmin && (
                    <button onClick={() => setEditMode(p => !p)}
                      style={{ padding: '7px 16px', borderRadius: RADIUS.sm, cursor: 'pointer', fontFamily: 'inherit', fontSize: TYPO.subhead.fontSize, fontWeight: 700, background: editMode ? T.editRing : T.bgCard, border: `1px solid ${editMode ? T.editRing : T.borderMid}`, color: editMode ? '#fff' : T.textSub, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: SPACING.sm - 2 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: editMode ? '#fff' : T.textFaint }} />
                      {editMode ? '編集中...' : <><Icon name="pencil" size={12} /> 編集モード</>}
                    </button>
                  )}
                  {dirty && (
                    <>
                      <button onClick={saveData} disabled={saving}
                        style={{ ...btnPrimary({ T, size: 'md', color: savedFlash ? T.green : T.accentSolid }), display: 'inline-flex', alignItems: 'center', gap: SPACING.xs, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                        {saving ? '保存中...' : savedFlash ? <><Icon name="check" size={13} /> 保存しました</> : '保存する'}
                      </button>
                      <button onClick={() => { if (confirm('変更を破棄しますか？')) loadData(selectedId) }}
                        style={{ ...btnSecondary({ T, size: 'md' }), color: T.textMuted, borderColor: T.borderMid }}>
                        元に戻す
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 編集ヒント */}
            {editMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, fontSize: TYPO.footnote.fontSize, color: T.editRing, background: T.accentBg, border: `1px solid ${T.accent}40`, borderRadius: RADIUS.sm, padding: '8px 14px', marginBottom: SPACING.xl, textAlign: 'center' }}>
                <Icon name="pencil" size={12} /> 編集モード中 — テキストをクリックして直接編集できます。保存するまで変更はDBに反映されません。
              </div>
            )}

            {/* 役割・スタンス */}
            <RoleBlock
              role={cur.role || ''}
              deptColor={deptColor}
              editMode={editMode}
              onUpdate={updateRole}
              T={T}
            />
            <StanceBlock
              stance={cur.stance || []}
              deptColor={deptColor}
              editMode={editMode}
              onUpdate={updateStance}
              T={T}
            />

            {/* 概念フロー図 */}
            {cur.phases.length > 0 && <ConceptFlow phases={cur.phases} deptColor={deptColor} T={T} />}

            {/* フェーズ一覧 */}
            {cur.phases.map((phase, pi) => (
              <PhaseBlock key={pi} phase={phase} pi={pi} deptColor={deptColor} editMode={editMode}
                onUpdate={onUpdatePhase} onDelete={onDeletePhase}
                onAddStep={onAddStep} onUpdateStep={onUpdateStep} onDeleteStep={onDeleteStep}
                onReorderStep={onReorderStep} T={T} />
            ))}

            {/* フェーズ追加 */}
            {editMode && (
              <button onClick={onAddPhase}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, width: '100%', padding: '10px', marginBottom: 36, background: 'none', border: `1.5px dashed ${T.borderDash}`, borderRadius: RADIUS.md, cursor: 'pointer', color: T.textMuted, fontSize: TYPO.subhead.fontSize, fontFamily: 'inherit', transition: '0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.editRing; e.currentTarget.style.color = T.editRing }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderDash; e.currentTarget.style.color = T.textMuted }}>
                <Icon name="plus" size={13} /> フェーズを追加
              </button>
            )}

            {/* フェーズ0件 */}
            {cur.phases.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', border: `1px dashed ${T.borderDash}`, borderRadius: RADIUS.lg, color: T.textFaint }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SPACING.md }}><Icon name="note" size={36} /></div>
                <div style={{ fontSize: TYPO.headline.fontSize, color: T.textMuted, marginBottom: SPACING.sm - 2 }}>業務フローがまだ登録されていません</div>
                {isAdmin && <div style={{ fontSize: TYPO.subhead.fontSize }}>「編集モード」をオンにして「＋ フェーズを追加」から始めましょう</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 保存フラッシュ */}
      {savedFlash && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs, position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: T.green, color: '#fff', borderRadius: RADIUS.sm, padding: '9px 20px', fontSize: TYPO.body.fontSize, fontWeight: 700, boxShadow: SHADOWS.lg, zIndex: 500, pointerEvents: 'none' }}>
          <Icon name="check" size={14} /> Supabaseに保存しました
        </div>
      )}
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
    </div>
  )
}
