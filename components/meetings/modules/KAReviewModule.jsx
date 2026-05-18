'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { TYPO, RADIUS, SPACING } from '../../../lib/themeTokens'

// KA 確認モジュール (簡易実装)
// 今週フォーカス KA の一覧 + ステータス更新 (focus / good / more / done) + KPT 記入。
// target_filter (= scope/parentLevelName/teamName) に従って対象 KA を絞り込む。
//
// 現状は最小実装: KA リスト + ステータス更新ドロップダウン。
// Phase 5c で WeeklyMTGFacilitation の KA 順送りステップを完全に抽出予定。
export default function KAReviewModule({ meeting, config, weekStart, T, members = [], levels = [] }) {
  const [kas, setKas]       = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]       = useState(null)

  // 対象 KA を取得
  useEffect(() => {
    if (!weekStart) return
    let alive = true
    setLoading(true)
    supabase.from('weekly_reports')
      .select('id, ka_title, kr_title, owner, status, good, more, focus_output, objective_id, kr_id, level_id, ka_key')
      .eq('week_start', weekStart)
      .order('level_id', { ascending: true })
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setErr(error.message)
        setKas(data || [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [weekStart])

  // target_filter に従って絞り込み
  const filtered = useMemo(() => {
    const filter = meeting?.target_filter
    if (!filter || !filter.scope) return kas

    const findLevelByName = (name) => levels.find(l => l.name === name)
    const childLevelIds = (parentId) => levels.filter(l => Number(l.parent_id) === Number(parentId)).map(l => Number(l.id))

    if (filter.scope === 'teams-of' && filter.parentLevelName) {
      const parent = findLevelByName(filter.parentLevelName)
      if (!parent) return kas
      const teamIds = childLevelIds(parent.id)
      return kas.filter(ka => teamIds.includes(Number(ka.level_id)))
    }
    if (filter.scope === 'specific-team' && filter.teamName) {
      const team = findLevelByName(filter.teamName)
      if (!team) return kas
      return kas.filter(ka => Number(ka.level_id) === Number(team.id))
    }
    return kas
  }, [kas, meeting, levels])

  // ステータス更新
  const updateStatus = async (id, status) => {
    const { error } = await supabase.from('weekly_reports').update({ status }).eq('id', id)
    if (error) { alert('ステータス更新失敗: ' + error.message); return }
    setKas(prev => prev.map(k => k.id === id ? { ...k, status } : k))
  }

  // KPT 記入
  const updateKPT = async (id, field, value) => {
    const { error } = await supabase.from('weekly_reports').update({ [field]: value }).eq('id', id)
    if (error) { alert('保存失敗: ' + error.message); return }
    setKas(prev => prev.map(k => k.id === id ? { ...k, [field]: value } : k))
  }

  const statusColor = (s) => ({
    focus: '#FFB700', good: '#34C759', more: '#FF3B30', done: T?.textFaint, normal: T?.textSub,
  })[s] || T?.textSub

  const statusLabel = (s) => ({
    focus: '🎯 focus', good: '✅ good', more: '🔺 more', done: '✓ done', normal: '— normal',
  })[s] || '— normal'

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: SPACING.lg, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <span style={{ fontSize: 22 }}>📋</span>
        <span style={{ ...TYPO.title2, color: T?.text }}>KA 確認</span>
        <span style={{ ...TYPO.caption, color: T?.textMuted }}>({filtered.length}件)</span>
      </div>
      <div style={{ ...TYPO.caption, color: T?.textMuted, marginBottom: SPACING.md }}>
        週: {weekStart || '(未指定)'} ・ scope: {meeting?.target_filter?.scope || 'all'}
        {meeting?.target_filter?.parentLevelName ? ` / ${meeting.target_filter.parentLevelName}` : ''}
        {meeting?.target_filter?.teamName ? ` / ${meeting.target_filter.teamName}` : ''}
      </div>

      {loading && <div style={{ ...TYPO.caption, color: T?.textMuted }}>読み込み中…</div>}
      {err && <div style={{ ...TYPO.caption, color: T?.danger }}>エラー: {err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
        {filtered.map(ka => (
          <div key={ka.id} style={{
            padding: SPACING.md,
            background: T?.bgCard,
            borderRadius: RADIUS.md,
            borderLeft: `3px solid ${statusColor(ka.status)}`,
            display: 'flex',
            flexDirection: 'column',
            gap: SPACING.xs,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200, ...TYPO.subhead, color: T?.text, fontWeight: 700 }}>
                {ka.ka_title || '(無題)'}
              </span>
              <span style={{ ...TYPO.caption, color: T?.textMuted }}>👤 {ka.owner || '未定'}</span>
              <select
                value={ka.status || 'normal'}
                onChange={e => updateStatus(ka.id, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: RADIUS.sm,
                  border: `1px solid ${T?.border}`,
                  background: T?.bg, color: statusColor(ka.status),
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                <option value="normal">— normal</option>
                <option value="focus">🎯 focus</option>
                <option value="good">✅ good</option>
                <option value="more">🔺 more</option>
                <option value="done">✓ done</option>
              </select>
            </div>
            {ka.kr_title && (
              <div style={{ ...TYPO.caption, color: T?.textMuted }}>
                KR: {ka.kr_title}
              </div>
            )}
            {/* KPT 簡易入力 (good/more/focus_output) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 4, marginTop: 4 }}>
              <textarea
                value={ka.good || ''}
                onChange={e => setKas(prev => prev.map(k => k.id === ka.id ? { ...k, good: e.target.value } : k))}
                onBlur={e => updateKPT(ka.id, 'good', e.target.value)}
                placeholder="✅ good"
                rows={2}
                style={{ padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${T?.border}`, background: T?.bg, color: T?.text, fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
              />
              <textarea
                value={ka.more || ''}
                onChange={e => setKas(prev => prev.map(k => k.id === ka.id ? { ...k, more: e.target.value } : k))}
                onBlur={e => updateKPT(ka.id, 'more', e.target.value)}
                placeholder="🔺 more"
                rows={2}
                style={{ padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${T?.border}`, background: T?.bg, color: T?.text, fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
              />
              <textarea
                value={ka.focus_output || ''}
                onChange={e => setKas(prev => prev.map(k => k.id === ka.id ? { ...k, focus_output: e.target.value } : k))}
                onBlur={e => updateKPT(ka.id, 'focus_output', e.target.value)}
                placeholder="🎯 focus"
                rows={2}
                style={{ padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${T?.border}`, background: T?.bg, color: T?.text, fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ ...TYPO.caption, color: T?.textFaint, textAlign: 'center', padding: SPACING.lg }}>
            対象 KA がありません。weekly_reports に今週のデータが登録されているか確認してください。
          </div>
        )}
      </div>
    </div>
  )
}
