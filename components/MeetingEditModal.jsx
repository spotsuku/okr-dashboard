'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
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
  // target_filter (= ファシリ画面の挙動を決める設定) を編集できるようにする。
  // 既存の固定 MEETINGS と互換にするため、各フィールドを個別 state で管理し、
  // 保存時に target_filter JSONB として組み立てる。
  const tf = meeting?.target_filter || {}
  const [scope, setScope]       = useState(tf.scope || 'all-levels')     // specific-team | teams-of | all-teams | all-departments | all-levels
  const [teamName, setTeamName] = useState(tf.teamName || '')            // for specific-team
  const [parentLevelName, setParentLevelName] = useState(tf.parentLevelName || '') // for teams-of
  const [customLevelNames, setCustomLevelNames] = useState(Array.isArray(tf.levelNames) ? tf.levelNames : []) // for scope='custom' (組織図から複数選択)
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

  // 組織図ツリー (scope='custom' のチェックボックス用)。
  // 部署をグループ見出しにし、その配下チームをぶら下げる。名前でユニーク化。
  const deptNameById = new Map(departments.map(d => [Number(d.id), d.name]))
  const orgTree = (() => {
    const groups = new Map() // deptName -> Set(teamName)
    departments.forEach(d => { if (!groups.has(d.name)) groups.set(d.name, new Set()) })
    teams.forEach(t => {
      const deptName = deptNameById.get(Number(t.parent_id)) || 'その他'
      if (!groups.has(deptName)) groups.set(deptName, new Set())
      groups.get(deptName).add(t.name)
    })
    return Array.from(groups.entries()).map(([dept, teamSet]) => ({ dept, teams: Array.from(teamSet) }))
  })()
  const toggleCustom = (name) => setCustomLevelNames(prev =>
    prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
  )

  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState(null)

  const handleSave = async () => {
    if (!title.trim()) { setErr('タイトルは必須です'); return }
    if (!key.trim()) { setErr('key は必須です (URL/識別子として使用)'); return }
    if (scope === 'specific-team' && !teamName) { setErr('対象チームを選択してください'); return }
    if (scope === 'teams-of' && !parentLevelName) { setErr('対象部署を選択してください'); return }
    if (scope === 'custom' && customLevelNames.length === 0) { setErr('対象のチーム/部署を1つ以上選択してください'); return }
    setSaving(true)
    setErr(null)

    // target_filter を組み立てる。scope が空なら全社既定。
    // 会議のステップは flow から自動生成されるため、flow は必ず含める。
    const target_filter = scope ? {
      scope,
      ...(scope === 'specific-team' && teamName ? { teamName, levelName: teamName } : {}),
      ...(scope === 'teams-of' && parentLevelName ? { parentLevelName, levelName: parentLevelName } : {}),
      ...(scope === 'custom' ? { levelNames: customLevelNames } : {}),
      flow,
      viewMode,
      ...(withDiscussion ? { withDiscussion: true } : {}),
      ...(requiresProgram ? { requiresProgram: true } : {}),
    } : { flow, viewMode }

    const payload = {
      organization_id: orgId,
      key: key.trim(),
      title: title.trim(),
      icon,
      color,
      // modules は旧ファシリUIでは未使用 (ステップは flow から生成)。
      // 既存値を保持しつつ新規は空配列 (DB NOT NULL 対策)。
      modules: meeting?.modules || [],
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
    // 週次MTG画面など、会議リストを使う他の画面に再取得を促す
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('org-meetings-updated'))
    }
    onSaved && onSaved(result.data)
    onClose && onClose()
  }

  const inputSt = { ...inputStyle({ T }), ...TYPO.body, background: T.bg }
  const labelSt = { ...TYPO.footnote, color: T.textMuted, fontWeight: 700, marginBottom: SPACING.xs, display: 'block' }
  const sectionSt = { marginBottom: SPACING.lg - 2 }

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
              <option value="custom">組織図から選択（複数チーム/部署）</option>
              <option value="specific-team">特定チームのみ (例: 広報 / セールス)</option>
              <option value="teams-of">部署配下の全チーム (例: パートナー事業部 → CS + セールス)</option>
              <option value="all-teams">全チーム合同 (= マネージャー定例)</option>
              <option value="all-departments">全部署合同 (= 役員会議)</option>
              <option value="all-levels">全社・全階層 (部署/チーム横断・プログラム別定例)</option>
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

            {scope === 'custom' && (
              <div style={{ marginTop: SPACING.xs + 1 }}>
                <label style={{ ...labelSt, marginTop: SPACING.xs }}>
                  対象にするチーム / 部署 <span style={{ color: T.danger }}>*</span>
                  <span style={{ color: T.textMuted, fontWeight: 500 }}>（{customLevelNames.length} 件選択中）</span>
                </label>
                <div style={{
                  maxHeight: 220, overflow: 'auto',
                  border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
                  padding: SPACING.sm, background: T.bg,
                }}>
                  {orgTree.length === 0 && (
                    <div style={{ ...TYPO.footnote, color: T.textMuted }}>組織のチーム/部署が読み込めませんでした。</div>
                  )}
                  {orgTree.map(({ dept, teams: teamNames }) => (
                    <div key={dept} style={{ marginBottom: SPACING.xs + 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 1, cursor: 'pointer', ...TYPO.subhead, fontWeight: 700, color: T.text }}>
                        <input type="checkbox" checked={customLevelNames.includes(dept)} onChange={() => toggleCustom(dept)} />
                        {dept} <span style={{ ...TYPO.caption, fontWeight: 500, color: T.textMuted, letterSpacing: 'normal' }}>(部署)</span>
                      </label>
                      {teamNames.map(tn => (
                        <label key={tn} style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 1, cursor: 'pointer', ...TYPO.subhead, color: T.textSub, paddingLeft: SPACING.lg, marginTop: 2 }}>
                          <input type="checkbox" checked={customLevelNames.includes(tn)} onChange={() => toggleCustom(tn)} />
                          {tn}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ ...TYPO.caption, fontWeight: 500, letterSpacing: 'normal', color: T.textMuted, marginTop: SPACING.xs }}>
                  チェックしたチーム/部署の KR/KA だけがこの会議のデフォルト対象になります。
                </div>
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

          {/* 会議の進行ステップ (flow から自動生成・プレビュー) */}
          <div style={sectionSt}>
            <label style={labelSt}>会議の進行ステップ <span style={{ color: T.textMuted, fontWeight: 500 }}>(フォーカスから自動生成)</span></label>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: SPACING.xs, alignItems: 'center',
              padding: SPACING.sm, background: T.bgCard, borderRadius: RADIUS.sm, border: `1px solid ${T.border}`,
            }}>
              {stepPreview(flow, withDiscussion).map((label, i, arr) => (
                <span key={label + i} style={{ display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
                  <span style={{
                    ...TYPO.caption, fontWeight: 700, letterSpacing: 'normal', color: T.textSub,
                    padding: `2px ${SPACING.xs + 2}px`, borderRadius: RADIUS.pill, background: T.sectionBg || T.bg, border: `1px solid ${T.border}`,
                  }}>{label}</span>
                  {i < arr.length - 1 && <Icon name="chevronR" size={11} style={{ color: T.textMuted }} />}
                </span>
              ))}
            </div>
            <div style={{ ...TYPO.caption, fontWeight: 500, letterSpacing: 'normal', color: T.textMuted, marginTop: SPACING.xs }}>
              ステップは「会議のフォーカス」と「オプション」に応じて自動で決まります。
            </div>
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

// 会議の進行ステップを flow / withDiscussion から導出 (WeeklyMTGFacilitation.stepsForFlow と一致)
function stepPreview(flow, withDiscussion) {
  if (withDiscussion) {
    return ['KR順送り', 'チームサマリー', '共有事項', '横断連携・確認事項', 'ネクストアクション', '終了']
  }
  if (flow === 'sales') {
    return ['セールス進捗', 'KA確認', '共有事項', '確認事項', 'ネクストアクション', '終了']
  }
  if (flow === 'ka') {
    return ['KA順送り', '共有事項', '確認事項', 'ネクストアクション', '終了']
  }
  // kr (既定)
  return ['KR順送り', '共有事項', '確認事項', 'ネクストアクション', '終了']
}
