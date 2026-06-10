'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AVAILABLE_MODULES, MODULE_META } from '../lib/meetings/moduleRegistry'
import Icon, { DataIcon } from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { inputStyle, btnSecondary, btnBrand } from '../lib/iosStyles'

// ─────────────────────────────────────────────────────────────
// 会議の追加 / 編集モーダル (Phase 5e 本格)
//
// props:
//   T            - テーマ
//   orgId        - 組織 ID
//   meeting      - 既存会議 (= 編集モード) / null (= 新規追加)
//   onClose      - 閉じる時のコールバック
//   onSaved      - 保存成功時のコールバック (一覧再読み込みなど)
// ─────────────────────────────────────────────────────────────

const PRESET_ICONS = ['sun', 'rocket', 'leaf', 'building', 'coin', 'user', 'note', 'chart', 'tag', 'target', 'calendar', 'bolt']
const PRESET_COLORS = [
  '#ff9f43', '#4d9fff', '#ffd166', '#ff6b6b', '#FF9500', '#00d68f',
  '#a855f7', '#5856d6', '#6B96C7', '#34C759',
]
const DAYS_OF_WEEK = [
  { v: null, label: '指定なし' },
  { v: 1, label: '月曜' }, { v: 2, label: '火曜' }, { v: 3, label: '水曜' },
  { v: 4, label: '木曜' }, { v: 5, label: '金曜' }, { v: 6, label: '土曜' }, { v: 0, label: '日曜' },
]

export default function MeetingEditModal({ T, orgId, meeting, onClose, onSaved }) {
  const isNew = !meeting
  const [title, setTitle]       = useState(meeting?.title || '')
  const [key, setKey]           = useState(meeting?.key || '')
  const [icon, setIcon]         = useState(meeting?.icon || 'note')
  const [color, setColor]       = useState(meeting?.color || '#4d9fff')
  const [dayOfWeek, setDayOfWeek] = useState(meeting?.day_of_week ?? null)
  const [modules, setModules]   = useState(() => {
    const list = meeting?.modules || []
    return [...list].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  })
  // target_filter (= ファシリ画面の挙動を決める設定) を編集できるようにする。
  // 既存の固定 MEETINGS と互換にするため、各フィールドを個別 state で管理し、
  // 保存時に target_filter JSONB として組み立てる。
  const tf = meeting?.target_filter || {}
  const [scope, setScope]       = useState(tf.scope || '')               // '' | specific-team | teams-of | all-teams | all-departments | all-levels
  const [teamName, setTeamName] = useState(tf.teamName || '')            // for specific-team
  const [parentLevelName, setParentLevelName] = useState(tf.parentLevelName || '') // for teams-of
  const [flow, setFlow]         = useState(tf.flow || 'ka')              // 'ka' | 'kr' | 'sales'
  const [viewMode, setViewMode] = useState(tf.viewMode || 'ka')          // 'ka' | 'kr' | 'both'
  const [withDiscussion, setWithDiscussion] = useState(!!tf.withDiscussion)
  const [requiresProgram, setRequiresProgram] = useState(!!tf.requiresProgram)

  // 組織内の levels (部署 + チーム) を取得 — scope dropdown 用
  const [levels, setLevels] = useState([])
  useEffect(() => {
    if (!orgId) return
    let alive = true
    supabase.from('levels')
      .select('id, name, parent_id, fiscal_year')
      .eq('organization_id', orgId)
      .order('parent_id', { nullsFirst: true })
      .order('name')
      .then(({ data, error }) => {
        if (!alive) return
        if (!error) setLevels(data || [])
      })
    return () => { alive = false }
  }, [orgId])

  // 部署 (parent_id IS NULL の levels) / チーム (parent_id ありの levels)
  const departments = levels.filter(l => !l.parent_id)
  const teams       = levels.filter(l => l.parent_id)

  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState(null)
  // drag & drop 用 state
  const [dragIndex, setDragIndex]     = useState(null)
  const [dropHoverIdx, setDropHoverIdx] = useState(null)

  const handleAddModule = (type) => {
    if (modules.some(m => m.type === type)) {
      setErr(`「${MODULE_META[type]?.label}」は既に追加されています`)
      return
    }
    setModules(prev => [
      ...prev,
      { type, sort_order: prev.length + 1, config: {} },
    ])
    setErr(null)
  }

  const handleRemoveModule = (idx) => {
    setModules(prev => prev.filter((_, i) => i !== idx).map((m, i) => ({ ...m, sort_order: i + 1 })))
  }

  const handleMoveModule = (idx, direction) => {
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= modules.length) return
    setModules(prev => {
      const next = [...prev]
      const tmp = next[idx]
      next[idx] = next[newIdx]
      next[newIdx] = tmp
      return next.map((m, i) => ({ ...m, sort_order: i + 1 }))
    })
  }

  // drag & drop でモジュールを並び替え
  const handleDragStart = (idx) => (e) => {
    setDragIndex(idx)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 互換: dataTransfer に何か入れないと drag が起動しない場合あり
    try { e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const handleDragOver = (idx) => (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropHoverIdx !== idx) setDropHoverIdx(idx)
  }
  const handleDragLeave = () => setDropHoverIdx(null)
  const handleDrop = (idx) => (e) => {
    e.preventDefault()
    setDropHoverIdx(null)
    if (dragIndex === null || dragIndex === idx) { setDragIndex(null); return }
    setModules(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(idx, 0, moved)
      return next.map((m, i) => ({ ...m, sort_order: i + 1 }))
    })
    setDragIndex(null)
  }
  const handleDragEnd = () => { setDragIndex(null); setDropHoverIdx(null) }

  const handleSave = async () => {
    if (!title.trim()) { setErr('タイトルは必須です'); return }
    if (!key.trim()) { setErr('key は必須です (URL/識別子として使用)'); return }
    if (modules.length === 0) { setErr('モジュールを最低 1 つ追加してください'); return }
    setSaving(true)
    setErr(null)

    // target_filter を組み立てる。scope が空なら null で保存 (=「全社」「未指定」)。
    // 静的 MEETINGS で flow が必須項目だったため、ここでも flow は必ず含める。
    const target_filter = scope ? {
      scope,
      ...(scope === 'specific-team' && teamName ? { teamName, levelName: teamName } : {}),
      ...(scope === 'teams-of' && parentLevelName ? { parentLevelName, levelName: parentLevelName } : {}),
      flow,
      viewMode,
      ...(withDiscussion ? { withDiscussion: true } : {}),
      ...(requiresProgram ? { requiresProgram: true } : {}),
    } : null

    const payload = {
      organization_id: orgId,
      key: key.trim(),
      title: title.trim(),
      icon,
      color,
      modules,
      day_of_week: dayOfWeek,
      target_filter,
    }

    let result
    if (isNew) {
      result = await supabase.from('organization_meetings').insert(payload).select().single()
    } else {
      result = await supabase.from('organization_meetings')
        .update(payload).eq('id', meeting.id).select().single()
    }

    setSaving(false)
    if (result.error) {
      setErr('保存失敗: ' + result.error.message)
      return
    }
    onSaved && onSaved(result.data)
    onClose && onClose()
  }

  const inputSt = { ...inputStyle({ T }), ...TYPO.body, background: T.bg }
  const labelSt = { ...TYPO.footnote, color: T.textMuted, fontWeight: 700, marginBottom: SPACING.xs, display: 'block' }
  const sectionSt = { marginBottom: SPACING.lg - 2 }

  // モジュール候補 (まだ追加されていないもの)
  const availableToAdd = AVAILABLE_MODULES.filter(m => !modules.some(x => x.type === m.type))

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: SPACING.xl,
      }}
    >
      <div style={{
        width: '90vw', maxWidth: 700, maxHeight: '90vh',
        background: T.bg, borderRadius: RADIUS.lg, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: SHADOWS.xl,
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: `${SPACING.md}px ${SPACING.lg}px`,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
          background: T.bgCard,
        }}>
          <Icon name={isNew ? 'plus' : 'pencil'} size={18} style={{ color: T.text }} />
          <span style={{ flex: 1, ...TYPO.headline, fontWeight: 800, color: T.text }}>
            {isNew ? '会議を追加' : `会議を編集: ${meeting.title}`}
          </span>
          <button onClick={onClose} style={{
            ...btnSecondary({ T, size: 'sm' }),
          }}>キャンセル</button>
        </div>

        {/* 本体 */}
        <div style={{ flex: 1, overflow: 'auto', padding: SPACING.lg }}>
          {err && (
            <div style={{
              padding: SPACING.sm, marginBottom: SPACING.md,
              background: T.dangerBg, border: `1px solid ${T.danger}40`,
              borderRadius: RADIUS.sm, color: T.danger, ...TYPO.subhead,
            }}>{err}</div>
          )}

          {/* 基本情報 */}
          <div style={sectionSt}>
            <label style={labelSt}>タイトル <span style={{ color: T.danger }}>*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 週次定例" style={inputSt} />
          </div>

          <div style={sectionSt}>
            <label style={labelSt}>key (URL / 識別子) <span style={{ color: T.danger }}>*</span></label>
            <input
              value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
              placeholder="例: weekly-team" style={inputSt}
              disabled={!isNew}
            />
            {!isNew && <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted, marginTop: 2 }}>key は編集できません (進行履歴との互換性のため)</div>}
          </div>

          <div style={{ ...sectionSt, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm + 2 }}>
            <div>
              <label style={labelSt}>アイコン</label>
              <div style={{ display: 'flex', gap: SPACING.xs, flexWrap: 'wrap' }}>
                {PRESET_ICONS.map(i => (
                  <button key={i} onClick={() => setIcon(i)} style={{
                    width: 32, height: 32, borderRadius: RADIUS.sm,
                    border: `1px solid ${icon === i ? T.accent : T.border}`,
                    background: icon === i ? T.accentBg : T.bgCard,
                    color: icon === i ? T.accent : T.text,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Icon name={i} size={18} /></button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelSt}>色</label>
              <div style={{ display: 'flex', gap: SPACING.xs, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{
                    width: 28, height: 28, borderRadius: RADIUS.sm,
                    border: color === c ? `2px solid ${T.text}` : `1px solid ${T.border}`,
                    background: c, cursor: 'pointer',
                  }} />
                ))}
              </div>
            </div>
          </div>

          <div style={sectionSt}>
            <label style={labelSt}>曜日</label>
            <select value={dayOfWeek ?? ''} onChange={e => setDayOfWeek(e.target.value === '' ? null : Number(e.target.value))} style={{ ...inputSt, cursor: 'pointer' }}>
              {DAYS_OF_WEEK.map(d => (
                <option key={d.label} value={d.v ?? ''}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* ── 会議の対象範囲 (scope) ────────────────────────────── */}
          <div style={sectionSt}>
            <label style={labelSt}>会議の対象範囲 <span style={{ color: T.textMuted, fontWeight: 500 }}>(どの KR/KA を扱う会議か)</span></label>
            <select
              value={scope}
              onChange={e => {
                setScope(e.target.value)
                // scope を切り替えたら依存フィールドをリセット
                if (e.target.value !== 'specific-team') setTeamName('')
                if (e.target.value !== 'teams-of') setParentLevelName('')
              }}
              style={{ ...inputSt, cursor: 'pointer' }}
            >
              <option value="">— 未指定 (= 全社) —</option>
              <option value="specific-team">特定チームのみ (例: 広報 / セールス)</option>
              <option value="teams-of">部署配下の全チーム (例: パートナー事業部 → CS + セールス)</option>
              <option value="all-teams">全チーム合同 (= マネージャー定例)</option>
              <option value="all-departments">全部署合同 (= 役員会議)</option>
              <option value="all-levels">全階層横断 (= プログラム別定例)</option>
            </select>

            {scope === 'specific-team' && (
              <div style={{ marginTop: SPACING.xs + 1 }}>
                <label style={{ ...labelSt, marginTop: SPACING.xs }}>対象チーム <span style={{ color: T.danger }}>*</span></label>
                <select value={teamName} onChange={e => setTeamName(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                  <option value="">— チームを選択 —</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {scope === 'teams-of' && (
              <div style={{ marginTop: SPACING.xs + 1 }}>
                <label style={{ ...labelSt, marginTop: SPACING.xs }}>対象部署 <span style={{ color: T.danger }}>*</span></label>
                <select value={parentLevelName} onChange={e => setParentLevelName(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                  <option value="">— 部署を選択 —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── 会議のフォーカス (flow) ──────────────────────────── */}
          <div style={sectionSt}>
            <label style={labelSt}>会議のフォーカス</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: SPACING.xs }}>
              {[
                { v: 'ka', label: 'KA重点', desc: '今週の行動を順に確認' },
                { v: 'kr', label: 'KR重点', desc: 'KR進捗を順に確認' },
                { v: 'sales', label: '営業フォーカス', desc: '商談状況も確認' },
              ].map(opt => (
                <button key={opt.v} onClick={() => setFlow(opt.v)} style={{
                  padding: SPACING.sm, borderRadius: RADIUS.sm, cursor: 'pointer',
                  border: `1px solid ${flow === opt.v ? T.accent : T.border}`,
                  background: flow === opt.v ? T.accentBg : T.bgCard,
                  color: flow === opt.v ? T.accent : T.text,
                  textAlign: 'left', fontFamily: 'inherit',
                }}>
                  <div style={{ ...TYPO.subhead, fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ ...TYPO.caption, fontWeight: 500, color: T.textMuted, letterSpacing: 'normal' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── 表示モード (viewMode) ────────────────────────────── */}
          <div style={sectionSt}>
            <label style={labelSt}>表示モード (KR/KA の見せ方)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: SPACING.xs }}>
              {[
                { v: 'ka', label: 'KA中心' },
                { v: 'kr', label: 'KR中心' },
                { v: 'both', label: 'KR・KA両方' },
              ].map(opt => (
                <button key={opt.v} onClick={() => setViewMode(opt.v)} style={{
                  padding: SPACING.sm, borderRadius: RADIUS.sm, cursor: 'pointer',
                  border: `1px solid ${viewMode === opt.v ? T.accent : T.border}`,
                  background: viewMode === opt.v ? T.accentBg : T.bgCard,
                  color: viewMode === opt.v ? T.accent : T.text,
                  textAlign: 'center', fontFamily: 'inherit',
                  ...TYPO.subhead, fontWeight: 700,
                }}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* ── オプション ──────────────────────────────────────── */}
          <div style={sectionSt}>
            <label style={labelSt}>詳細オプション</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 1, cursor: 'pointer', ...TYPO.subhead, color: T.text }}>
                <input type="checkbox" checked={withDiscussion} onChange={e => setWithDiscussion(e.target.checked)} />
                チームサマリーセクションを挿入 <span style={{ color: T.textMuted, fontWeight: 500 }}>(マネージャー定例向け)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 1, cursor: 'pointer', ...TYPO.subhead, color: T.text }}>
                <input type="checkbox" checked={requiresProgram} onChange={e => setRequiresProgram(e.target.checked)} />
                開始前にプログラムタグ選択を必須にする <span style={{ color: T.textMuted, fontWeight: 500 }}>(プログラム別定例向け)</span>
              </label>
            </div>
          </div>

          {/* モジュール構成 */}
          <div style={sectionSt}>
            <label style={labelSt}>モジュール構成 (= 会議のステップ順序) <span style={{ color: T.danger }}>*</span></label>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2, marginBottom: SPACING.sm }}
              onDragLeave={handleDragLeave}
            >
              {modules.map((m, idx) => {
                const meta = MODULE_META[m.type] || { icon: '?', label: m.type, desc: '' }
                const isDragging  = dragIndex === idx
                const isDropHover = dropHoverIdx === idx && dragIndex !== idx
                return (
                  <div
                    key={`${m.type}-${idx}`}
                    draggable
                    onDragStart={handleDragStart(idx)}
                    onDragOver={handleDragOver(idx)}
                    onDrop={handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.sm,
                      padding: `${SPACING.sm}px ${SPACING.sm + 2}px`,
                      background: T.bgCard,
                      border: `1px solid ${isDropHover ? T.accent : T.border}`,
                      borderTop: isDropHover ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                      borderRadius: RADIUS.sm,
                      cursor: 'grab',
                      opacity: isDragging ? 0.4 : 1,
                      transition: 'border 0.1s, opacity 0.15s',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ color: T.textMuted, width: 14, cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="ドラッグして並び替え"><Icon name="more" size={14} /></span>
                    <span style={{ ...TYPO.footnote, color: T.textMuted, width: 18, textAlign: 'center' }}>{idx + 1}</span>
                    <span style={{ display: 'flex', alignItems: 'center', color: T.textSub }}><DataIcon value={meta.icon} size={18} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...TYPO.subhead, fontWeight: 700, color: T.text }}>{meta.label}</div>
                      <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted }}>{meta.desc}</div>
                    </div>
                    <button onClick={() => handleMoveModule(idx, -1)} disabled={idx === 0} title="上へ" style={iconBtnSt(T, idx === 0)}><Icon name="chevronU" size={13} /></button>
                    <button onClick={() => handleMoveModule(idx, 1)} disabled={idx === modules.length - 1} title="下へ" style={iconBtnSt(T, idx === modules.length - 1)}><Icon name="chevronD" size={13} /></button>
                    <button onClick={() => handleRemoveModule(idx)} title="削除" style={{ ...iconBtnSt(T, false), color: T.danger }}><Icon name="cross" size={13} /></button>
                  </div>
                )
              })}
              {modules.length === 0 && (
                <div style={{ padding: SPACING.md, textAlign: 'center', ...TYPO.footnote, color: T.textFaint, background: T.bgCard, borderRadius: RADIUS.sm }}>
                  下から追加してください
                </div>
              )}
            </div>

            {availableToAdd.length > 0 && (
              <>
                <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted, marginBottom: SPACING.xs }}>追加可能なモジュール:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs }}>
                  {availableToAdd.map(m => (
                    <button key={m.type} onClick={() => handleAddModule(m.type)} style={{
                      padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs,
                      border: `1px dashed ${T.border}`,
                      background: 'transparent', color: T.text,
                      ...TYPO.footnote, cursor: 'pointer', fontFamily: 'inherit',
                      display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                    }}>+ <DataIcon value={m.icon} size={14} /> {m.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* フッター */}
        <div style={{
          padding: `${SPACING.sm + 2}px ${SPACING.lg}px`,
          borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm,
          background: T.bgCard,
        }}>
          <button onClick={onClose} style={{
            ...btnSecondary({ T, size: 'md' }),
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{
            ...btnBrand({ size: 'md' }),
            ...(saving ? { background: T.border, color: '#fff', boxShadow: 'none', cursor: 'not-allowed' } : {}),
          }}>{saving ? '保存中…' : (isNew ? '作成' : '保存')}</button>
        </div>
      </div>
    </div>
  )
}

function iconBtnSt(T, disabled) {
  return {
    width: 26, height: 26, borderRadius: RADIUS.xs,
    border: `1px solid ${T.border}`,
    background: 'transparent',
    color: disabled ? T.textFaint : T.textSub,
    ...TYPO.subhead, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
