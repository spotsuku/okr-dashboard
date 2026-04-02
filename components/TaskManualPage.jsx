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

// ─────────────────────────────────────────────────
// テーマ
// ─────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '#0F1117', bgCard: '#1A1D27', bgCard2: '#12151F',
    bgInput: 'rgba(255,255,255,0.07)', bgHover: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.10)', borderMid: 'rgba(255,255,255,0.18)',
    borderDash: 'rgba(255,255,255,0.13)',
    text: '#E8ECF0', textSub: '#B0BAC8', textMuted: '#7a8599',
    textFaint: '#4A5468', textFaintest: '#2E3347',
    accent: '#5DCAA5', accentSolid: '#2F7A78',
    warn: '#F0997B', warnBg: 'rgba(240,153,123,0.15)',
    green: '#3D7A6A', greenBg: 'rgba(61,122,106,0.14)', greenBorder: 'rgba(61,122,106,0.35)',
    link: '#5B9AEF', linkBg: 'rgba(91,154,239,0.12)', linkBorder: 'rgba(91,154,239,0.32)',
    navActiveBg: 'rgba(47,122,120,0.18)', navBorder: '#2F7A78', navText: '#5DCAA5',
    badgeBg: 'rgba(47,122,120,0.22)', badgeBorder: 'rgba(47,122,120,0.45)',
    editRing: '#3B82F6',
    errorBg: 'rgba(240,153,123,0.12)', errorBorder: 'rgba(240,153,123,0.35)', errorText: '#F0997B',
  },
  light: {
    bg: '#EEF2F5', bgCard: '#FFFFFF', bgCard2: '#F4F7FA',
    bgInput: '#F0F3F6', bgHover: '#EBF0F5',
    border: '#DDE4EA', borderMid: '#B8C8D4', borderDash: '#C8D4DE',
    text: '#2D3748', textSub: '#4A5568', textMuted: '#8090A4',
    textFaint: '#A8B8C8', textFaintest: '#C8D4DE',
    accent: '#5A8A7A', accentSolid: '#5A8A7A',
    warn: '#E8875A', warnBg: 'rgba(232,135,90,0.10)',
    green: '#3D6B5E', greenBg: 'rgba(61,107,94,0.10)', greenBorder: 'rgba(61,107,94,0.30)',
    link: '#2563EB', linkBg: '#EFF6FF', linkBorder: '#BFDBFE',
    navActiveBg: '#EEF7F3', navBorder: '#5A8A7A', navText: '#3D6B5E',
    badgeBg: 'rgba(90,138,122,0.12)', badgeBorder: 'rgba(90,138,122,0.30)',
    editRing: '#3B82F6',
    errorBg: '#FFF1EE', errorBorder: '#FECACA', errorText: '#DC4A2A',
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
    phases: phases.map(p => ({
      _dbId: p.id,
      badge: p.badge, badgeClass: p.badge_class, title: p.title,
      steps: stepMap[p.id] || [],
    })),
  }
}

async function dbSave(levelId, data) {
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
        borderRadius: 6, padding: '3px 10px', fontSize: 11,
        color: T.link, textDecoration: 'none', fontWeight: 500,
        maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
      <span style={{ fontSize: 10 }}>🔗</span>{url.label || url.href}
    </a>
  )
}

function UrlEditRow({ url, onChangeLabel, onChangeHref, onDelete, T }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: T.linkBg, border: `1px solid ${T.linkBorder}`,
      borderRadius: 7, padding: '5px 9px', marginTop: 4,
    }}>
      <input type="text" value={url.label} placeholder="表示名" onChange={e => onChangeLabel(e.target.value)}
        style={{ width: 88, flexShrink: 0, background: 'transparent', border: 'none', borderBottom: `1px dashed ${T.borderMid}`, color: T.link, fontSize: 11, fontWeight: 600, outline: 'none', fontFamily: 'inherit', paddingBottom: 1 }} />
      <span style={{ color: T.textMuted, fontSize: 10, flexShrink: 0 }}>→</span>
      <input type="url" value={url.href} placeholder="https://..." onChange={e => onChangeHref(e.target.value)}
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', borderBottom: `1px dashed ${T.borderMid}`, color: T.textSub, fontSize: 11, outline: 'none', fontFamily: 'inherit', paddingBottom: 1 }} />
      <button onClick={onDelete}
        style={{ background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
        onMouseEnter={e => e.currentTarget.style.color = T.warn}
        onMouseLeave={e => e.currentTarget.style.color = T.textFaint}>✕</button>
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
    borderRadius: 5, padding: '5px 8px', color: T.text,
    fontSize: 12, outline: 'none', fontFamily: 'inherit', ...extra,
  })
  const dispSt = (extra = {}) => ({
    fontSize: 12, color: T.textSub, lineHeight: 1.65,
    background: T.bgCard2, borderRadius: 5, padding: '5px 9px', minHeight: 30,
    whiteSpace: 'pre-wrap', ...extra,
  })

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${open ? phaseColor + '45' : T.border}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden',
      boxShadow: open ? '0 4px 14px rgba(0,0,0,0.07)' : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* ヘッダー */}
      <div onClick={() => setOpen(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: phaseColor, color: '#fff', fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{si + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editMode
            ? <input value={step.title} onClick={e => e.stopPropagation()} onChange={e => onChange('title', e.target.value)} placeholder="ステップ名" style={inSt({ fontWeight: 600, fontSize: 13 })} />
            : <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{step.title || '（ステップ名未入力）'}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!open && (step.urls || []).filter(u => u.href).length > 0 && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: T.linkBg, color: T.link, fontWeight: 700, border: `1px solid ${T.linkBorder}` }}>
              🔗{(step.urls || []).filter(u => u.href).length}
            </span>
          )}
          {editMode && (
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ background: T.warnBg, border: `1px solid ${T.warn}40`, color: T.warn, borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>
              ✕ 削除
            </button>
          )}
          <span style={{ fontSize: 10, color: T.textFaint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
        </div>
      </div>

      {/* 詳細 */}
      {open && (
        <div style={{ padding: '0 16px 16px 54px', borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
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
                    : url.href ? <div key={ui} style={{ marginTop: 4 }}><UrlChip url={url} T={T} /></div> : null
                ))}
                {editMode && (
                  <button onClick={addUrl}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, background: 'none', border: `1px dashed ${T.borderMid}`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer', color: T.textMuted, fontSize: 11, fontFamily: 'inherit', transition: '0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.link; e.currentTarget.style.color = T.link }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.color = T.textMuted }}>
                    ＋ URLを追加
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 完了条件 */}
          <div style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 8, padding: '10px 13px', marginBottom: 9 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.green, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>✅ 完了条件</div>
            {editMode
              ? <textarea value={step.condition} onChange={e => onChange('condition', e.target.value)} placeholder="完了の定義を記入" rows={2}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }} />
              : <span style={{ fontSize: 12, color: T.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{step.condition || <span style={{ color: T.textFaint, fontStyle: 'italic' }}>未入力</span>}</span>}
          </div>

          {/* 注意点 */}
          {(step.caution || editMode) && (
            <div style={{ background: '#FFF8F0', border: '1px solid #E8C49A', borderRadius: 8, padding: '10px 13px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#B86B30', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>⚠️ 注意点</div>
              {editMode
                ? <textarea value={step.caution} onChange={e => onChange('caution', e.target.value)} placeholder="（任意）特記事項・落とし穴など" rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', color: '#57524A', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }} />
                : <span style={{ fontSize: 12, color: '#57524A', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{step.caution}</span>}
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
function PhaseBlock({ phase, pi, deptColor, editMode, onUpdate, onDelete, onAddStep, onUpdateStep, onDeleteStep, T }) {
  const isOnboard  = phase.badgeClass === 'onboard'
  const phaseColor = isOnboard ? T.green : deptColor
  const badgeSt    = isOnboard
    ? { background: T.greenBg, color: T.green, border: `1px solid ${T.greenBorder}` }
    : { background: `${deptColor}18`, color: deptColor, border: `1px solid ${deptColor}40` }

  const selSt = { background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 6, padding: '4px 8px', color: T.text, fontSize: 11, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }
  const inpSt = (fw) => ({ background: T.bgInput, border: `1px solid ${T.editRing}55`, borderRadius: 5, padding: '4px 8px', color: T.text, outline: 'none', fontFamily: 'inherit', fontSize: fw ? 15 : 11, fontWeight: fw ? 700 : 400 })

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {editMode ? (
          <>
            <select value={phase.badgeClass} onChange={e => onUpdate(pi, 'badgeClass', e.target.value)} style={selSt}>
              <option value="onboard">入会フェーズ（緑）</option>
              <option value="operate">運用フェーズ（アクセント）</option>
            </select>
            <input value={phase.badge} onChange={e => onUpdate(pi, 'badge', e.target.value)} placeholder="バッジ名" style={{ ...inpSt(false), width: 120 }} />
            <input value={phase.title} onChange={e => onUpdate(pi, 'title', e.target.value)} placeholder="フェーズのタイトル" style={{ ...inpSt(true), flex: 1, minWidth: 160 }} />
            <button onClick={() => onDelete(pi)} style={{ padding: '4px 12px', borderRadius: 5, background: T.warnBg, border: `1px solid ${T.warn}40`, color: T.warn, fontSize: 11, cursor: 'pointer', marginLeft: 'auto', whiteSpace: 'nowrap' }}>✕ フェーズ削除</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 13px', borderRadius: 20, ...badgeSt }}>{phase.badge}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{phase.title}</span>
          </>
        )}
      </div>
      {phase.steps.map((step, si) => (
        <StepCard key={si} step={step} si={si} phaseColor={phaseColor} editMode={editMode}
          onChange={(f, v) => onUpdateStep(pi, si, f, v)}
          onDelete={() => onDeleteStep(pi, si)} T={T} />
      ))}
      {editMode && (
        <button onClick={() => onAddStep(pi)}
          style={{ width: '100%', padding: '9px', marginTop: 4, background: 'none', border: `1.5px dashed ${T.borderDash}`, borderRadius: 9, cursor: 'pointer', color: T.textMuted, fontSize: 12, fontFamily: 'inherit', transition: '0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.editRing; e.currentTarget.style.color = T.editRing }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderDash; e.currentTarget.style.color = T.textMuted }}>
          ＋ ステップを追加
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
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 28, overflowX: 'auto' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.textMuted, marginBottom: 10 }}>全体の流れ（概念）</div>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content' }}>
        {steps.map((s, i) => {
          const c = s.cls === 'onboard' ? T.green : deptColor
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 96, padding: '4px 2px' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: c, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>{i + 1}</div>
                <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: T.textSub }}>{s.title || '…'}</span>
              </div>
              {i < steps.length - 1 && <span style={{ color: T.textFaint, fontSize: 16, padding: '0 2px', paddingBottom: 18 }}>→</span>}
            </div>
          )
        })}
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
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: T.textFaint, pointerEvents: 'none' }}>🔍</span>
          <input type="text" value={query} onChange={e => onQuery(e.target.value)} placeholder="チームを検索..."
            style={{ width: '100%', boxSizing: 'border-box', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 8px 6px 28px', color: T.text, fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {Object.values(grouped).map(({ dept, teams }) => {
          const dc = getDeptColor(dept.name)
          return (
            <div key={dept.id} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: dc, padding: '6px 8px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dc, flexShrink: 0 }} />{dept.name}
              </div>
              {teams.map(team => {
                const isAct = Number(selected) === Number(team.id)
                return (
                  <div key={team.id} onClick={() => onSelect(team.id)}
                    style={{ padding: '7px 8px 7px 16px', borderRadius: 7, cursor: 'pointer', marginBottom: 2, fontSize: 12, fontWeight: isAct ? 700 : 500, color: isAct ? T.navText : T.textSub, background: isAct ? T.navActiveBg : 'transparent', borderLeft: `2px solid ${isAct ? T.navBorder : 'transparent'}`, transition: 'all 0.15s' }}
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
          <div style={{ fontSize: 12, color: T.textFaint, fontStyle: 'italic', padding: '16px 8px', textAlign: 'center' }}>チームが見つかりません</div>
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
  const [data,        setData]        = useState({})   // levelId → {phases:[...]}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: T.textFaint }}>
            <div style={{ fontSize: 48 }}>📋</div>
            <div style={{ fontSize: 15, color: T.textMuted }}>左のチームを選んでください</div>
            <div style={{ fontSize: 12 }}>チームごとにフェーズ別の業務マニュアルを管理できます</div>
          </div>
        )}

        {/* ローディング */}
        {selectedId && loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: T.accent, fontSize: 14 }}>読み込み中...</div>
        )}

        {/* DBエラー */}
        {dbError && (
          <div style={{ margin: '24px 28px', padding: '14px 18px', background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderRadius: 10, color: T.errorText, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ データベースエラー</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', marginBottom: 10 }}>{dbError}</div>
            <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
              <b>対処法：</b>Supabase SQL Editor で <code>supabase_manual_setup.sql</code> を実行してテーブルを作成してください。<br />
              テーブル作成後、ページをリロードして再度お試しください。
            </div>
            <button onClick={() => loadData(selectedId)} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 7, background: T.accentSolid, border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>再読み込み</button>
          </div>
        )}

        {/* メインコンテンツ */}
        {selLevel && !loading && !dbError && cur && (
          <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>

            {/* ページヘッダー */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{selItem?.dept?.name}</span>
                <span style={{ opacity: 0.4 }}>›</span>
                <span style={{ color: T.textMuted }}>{selLevel.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>{selLevel.icon} {selLevel.name}</h1>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${deptColor}18`, color: deptColor, border: `1px solid ${deptColor}40` }}>
                  {cur.phases.length}フェーズ
                </span>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: T.bgCard, color: T.textMuted, border: `1px solid ${T.border}` }}>
                  {totalSteps}ステップ
                </span>

                {/* 操作ボタン */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isAdmin && (
                    <button onClick={() => setEditMode(p => !p)}
                      style={{ padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: editMode ? T.editRing : T.bgCard, border: `1px solid ${editMode ? T.editRing : T.borderMid}`, color: editMode ? '#fff' : T.textSub, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: editMode ? '#fff' : T.textFaint }} />
                      {editMode ? '編集中...' : '✎ 編集モード'}
                    </button>
                  )}
                  {dirty && (
                    <>
                      <button onClick={saveData} disabled={saving}
                        style={{ padding: '7px 18px', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: savedFlash ? T.green : T.accentSolid, border: 'none', color: '#fff', opacity: saving ? 0.6 : 1, transition: 'background 0.3s' }}>
                        {saving ? '保存中...' : savedFlash ? '✓ 保存しました' : '保存する'}
                      </button>
                      <button onClick={() => { if (confirm('変更を破棄しますか？')) loadData(selectedId) }}
                        style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, background: 'transparent', border: `1px solid ${T.borderMid}`, color: T.textMuted }}>
                        元に戻す
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 編集ヒント */}
            {editMode && (
              <div style={{ fontSize: 11, color: T.editRing, background: `rgba(59,130,246,0.08)`, border: `1px solid rgba(59,130,246,0.2)`, borderRadius: 8, padding: '8px 14px', marginBottom: 20, textAlign: 'center' }}>
                ✎ 編集モード中 — テキストをクリックして直接編集できます。保存するまで変更はDBに反映されません。
              </div>
            )}

            {/* 概念フロー図 */}
            {cur.phases.length > 0 && <ConceptFlow phases={cur.phases} deptColor={deptColor} T={T} />}

            {/* フェーズ一覧 */}
            {cur.phases.map((phase, pi) => (
              <PhaseBlock key={pi} phase={phase} pi={pi} deptColor={deptColor} editMode={editMode}
                onUpdate={onUpdatePhase} onDelete={onDeletePhase}
                onAddStep={onAddStep} onUpdateStep={onUpdateStep} onDeleteStep={onDeleteStep}
                T={T} />
            ))}

            {/* フェーズ追加 */}
            {editMode && (
              <button onClick={onAddPhase}
                style={{ width: '100%', padding: '10px', marginBottom: 36, background: 'none', border: `1.5px dashed ${T.borderDash}`, borderRadius: 10, cursor: 'pointer', color: T.textMuted, fontSize: 12, fontFamily: 'inherit', transition: '0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.editRing; e.currentTarget.style.color = T.editRing }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderDash; e.currentTarget.style.color = T.textMuted }}>
                ＋ フェーズを追加
              </button>
            )}

            {/* フェーズ0件 */}
            {cur.phases.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', border: `1px dashed ${T.borderDash}`, borderRadius: 12, color: T.textFaint }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 6 }}>業務フローがまだ登録されていません</div>
                {isAdmin && <div style={{ fontSize: 12 }}>「編集モード」をオンにして「＋ フェーズを追加」から始めましょう</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 保存フラッシュ */}
      {savedFlash && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: T.green, color: '#fff', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 500, pointerEvents: 'none' }}>
          ✓ Supabaseに保存しました
        </div>
      )}
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
    </div>
  )
}
