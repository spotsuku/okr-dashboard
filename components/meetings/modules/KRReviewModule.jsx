'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { TYPO, RADIUS, SPACING } from '../../../lib/themeTokens'

// KR 確認モジュール (簡易実装)
// 対象 KR の進捗 (current/target) 更新 + 週次 KPT (Good/More/Focus) 記入。
// target_filter (= scope/parentLevelName/teamName) に従って対象 KR を絞り込む。
// kr_weekly_reviews テーブルに週次 KPT を保存。
export default function KRReviewModule({ meeting, config, weekStart, T, members = [], levels = [] }) {
  const [krs, setKrs]               = useState([])
  const [reviews, setReviews]       = useState({})  // { kr_id: { good, more, focus, weather } }
  const [loading, setLoading]       = useState(true)
  const [err, setErr]               = useState(null)

  // 対象 KR + 週次レビューを取得
  useEffect(() => {
    if (!weekStart) return
    let alive = true
    setLoading(true)

    Promise.all([
      supabase.from('key_results')
        .select('id, title, target, current, unit, owner, objective_id, lower_is_better, archived_at')
        .is('archived_at', null)
        .order('id'),
      supabase.from('kr_weekly_reviews')
        .select('kr_id, good, more, focus, weather')
        .eq('week_start', weekStart),
      supabase.from('objectives')
        .select('id, title, level_id, period, archived_at')
        .is('archived_at', null),
    ]).then(([krsRes, reviewsRes, objsRes]) => {
      if (!alive) return
      if (krsRes.error) setErr(krsRes.error.message)
      const krsData = krsRes.data || []
      const reviewsData = reviewsRes.data || []
      const objsMap = new Map((objsRes.data || []).map(o => [o.id, o]))

      const merged = krsData.map(kr => ({
        ...kr,
        _obj: objsMap.get(kr.objective_id),
      }))
      setKrs(merged)
      const reviewsMap = {}
      reviewsData.forEach(r => { reviewsMap[r.kr_id] = r })
      setReviews(reviewsMap)
      setLoading(false)
    })

    return () => { alive = false }
  }, [weekStart])

  // target_filter に従って絞り込み
  const filtered = useMemo(() => {
    const filter = meeting?.target_filter
    if (!filter || !filter.scope) return krs

    const findLevelByName = (name) => levels.find(l => l.name === name)
    const childLevelIds = (parentId) => levels.filter(l => Number(l.parent_id) === Number(parentId)).map(l => Number(l.id))

    if (filter.scope === 'teams-of' && filter.parentLevelName) {
      const parent = findLevelByName(filter.parentLevelName)
      if (!parent) return krs
      const teamIds = childLevelIds(parent.id)
      return krs.filter(kr => kr._obj && teamIds.includes(Number(kr._obj.level_id)))
    }
    if (filter.scope === 'specific-team' && filter.teamName) {
      const team = findLevelByName(filter.teamName)
      if (!team) return krs
      return krs.filter(kr => kr._obj && Number(kr._obj.level_id) === Number(team.id))
    }
    return krs
  }, [krs, meeting, levels])

  // 進捗更新
  const updateProgress = async (id, current) => {
    const { error } = await supabase.from('key_results').update({ current: Number(current) || 0 }).eq('id', id)
    if (error) { alert('進捗更新失敗: ' + error.message); return }
    setKrs(prev => prev.map(k => k.id === id ? { ...k, current: Number(current) || 0 } : k))
  }

  // 週次 KPT 更新 (upsert)
  const updateReview = async (krId, field, value) => {
    const next = { ...(reviews[krId] || {}), kr_id: krId, week_start: weekStart, [field]: value }
    const { error } = await supabase.from('kr_weekly_reviews')
      .upsert(next, { onConflict: 'kr_id,week_start' })
    if (error) { alert('レビュー保存失敗: ' + error.message); return }
    setReviews(prev => ({ ...prev, [krId]: next }))
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: SPACING.lg, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <span style={{ fontSize: 22 }}>🎯</span>
        <span style={{ ...TYPO.title2, color: T?.text }}>KR 確認</span>
        <span style={{ ...TYPO.caption, color: T?.textMuted }}>({filtered.length}件)</span>
      </div>
      <div style={{ ...TYPO.caption, color: T?.textMuted, marginBottom: SPACING.md }}>
        週: {weekStart || '(未指定)'} ・ scope: {meeting?.target_filter?.scope || 'all'}
      </div>

      {loading && <div style={{ ...TYPO.caption, color: T?.textMuted }}>読み込み中…</div>}
      {err && <div style={{ ...TYPO.caption, color: T?.danger }}>エラー: {err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
        {filtered.map(kr => {
          const r = reviews[kr.id] || {}
          const target = Number(kr.target ?? 0)
          const current = Number(kr.current ?? 0)
          const progress = target > 0 ? Math.round((current / target) * 100) : null
          return (
            <div key={kr.id} style={{
              padding: SPACING.md,
              background: T?.bgCard,
              borderRadius: RADIUS.md,
              display: 'flex',
              flexDirection: 'column',
              gap: SPACING.xs,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 200, ...TYPO.subhead, color: T?.text, fontWeight: 700 }}>
                  {kr.title}
                </span>
                <span style={{ ...TYPO.caption, color: T?.textMuted }}>👤 {kr.owner || '未定'}</span>
              </div>
              {kr._obj?.title && (
                <div style={{ ...TYPO.caption, color: T?.textMuted }}>
                  Obj: {kr._obj.title}
                </div>
              )}
              {/* 進捗入力 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <input
                  type="number"
                  defaultValue={current}
                  onBlur={e => updateProgress(kr.id, e.target.value)}
                  style={{ width: 100, padding: '4px 8px', borderRadius: RADIUS.sm, border: `1px solid ${T?.border}`, background: T?.bg, color: T?.text, fontSize: 12, fontFamily: 'inherit' }}
                />
                <span style={{ ...TYPO.caption, color: T?.textMuted }}>/ {target} {kr.unit || ''}</span>
                {progress != null && (
                  <span style={{
                    ...TYPO.caption, fontWeight: 700,
                    color: progress >= 100 ? '#34C759' : progress >= 60 ? '#FFB700' : '#FF3B30',
                  }}>{progress}%</span>
                )}
              </div>
              {/* 週次 KPT */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 4, marginTop: 4 }}>
                <textarea
                  defaultValue={r.good || ''}
                  onBlur={e => updateReview(kr.id, 'good', e.target.value)}
                  placeholder="✅ good (今週うまくいったこと)"
                  rows={2}
                  style={{ padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${T?.border}`, background: T?.bg, color: T?.text, fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
                />
                <textarea
                  defaultValue={r.more || ''}
                  onBlur={e => updateReview(kr.id, 'more', e.target.value)}
                  placeholder="🔺 more (改善点)"
                  rows={2}
                  style={{ padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${T?.border}`, background: T?.bg, color: T?.text, fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
                />
                <textarea
                  defaultValue={r.focus || ''}
                  onBlur={e => updateReview(kr.id, 'focus', e.target.value)}
                  placeholder="🎯 focus (来週注力)"
                  rows={2}
                  style={{ padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${T?.border}`, background: T?.bg, color: T?.text, fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
            </div>
          )
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ ...TYPO.caption, color: T?.textFaint, textAlign: 'center', padding: SPACING.lg }}>
            対象 KR がありません。
          </div>
        )}
      </div>
    </div>
  )
}
