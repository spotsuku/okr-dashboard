'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { TYPO, RADIUS, SPACING } from '../../../lib/themeTokens'

// 個人報告モジュール (簡易実装)
// 朝会で各メンバーの「昨日の振り返り (KPT)」「今日のタスク」を順送りで確認するモジュール。
// 現状は最小実装: メンバー選択 + work_log の終業時 KPT + ka_tasks の今日のタスク表示。
// Phase 5c-2 で MorningMeetingPage の Step 1 のフル機能を抽出予定。
export default function IndividualReportModule({ meeting, config, weekStart, T, members = [], myName }) {
  const [selectedName, setSelectedName] = useState(myName || (members[0]?.name) || null)
  const [yesterdayKpt, setYesterdayKpt] = useState(null)
  const [todayTasks, setTodayTasks]     = useState([])
  const [loading, setLoading]           = useState(false)

  const yyyyMMdd = (d) => d.toISOString().slice(0, 10)

  useEffect(() => {
    if (!selectedName) return
    let alive = true
    setLoading(true)

    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    Promise.all([
      // 昨日の work_log (= 終業時の振り返り)
      supabase.from('work_log')
        .select('id, member_name, log_date, keep_text, problem_text, try_text, end_time')
        .eq('member_name', selectedName)
        .eq('log_date', yyyyMMdd(yesterday))
        .maybeSingle(),
      // 今日が期日 or 担当のタスク
      supabase.from('ka_tasks')
        .select('id, title, assignee, due_date, status, done')
        .eq('assignee', selectedName)
        .or(`due_date.eq.${yyyyMMdd(today)},due_date.is.null`)
        .order('done')
        .order('due_date'),
    ]).then(([kptRes, tasksRes]) => {
      if (!alive) return
      setYesterdayKpt(kptRes.data)
      setTodayTasks((tasksRes.data || []).filter(t => !t.done))
      setLoading(false)
    }).catch(() => {
      if (!alive) return
      setLoading(false)
    })

    return () => { alive = false }
  }, [selectedName])

  const card = {
    padding: SPACING.md,
    background: T?.bgCard,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: SPACING.lg, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <span style={{ fontSize: 22 }}>👤</span>
        <span style={{ ...TYPO.title2, color: T?.text }}>個人報告</span>
      </div>

      <div style={{ ...TYPO.caption, color: T?.textMuted, marginBottom: SPACING.md }}>
        メンバーを選択して「昨日の振り返り (KPT)」「今日のタスク」を確認できます。
      </div>

      {/* メンバー選択タブ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: SPACING.md, paddingBottom: SPACING.sm, borderBottom: `1px solid ${T?.border}` }}>
        {members.map(m => {
          const active = selectedName === m.name
          return (
            <button key={m.id} onClick={() => setSelectedName(m.name)} style={{
              padding: '6px 12px',
              borderRadius: RADIUS.sm,
              border: `1px solid ${active ? (meeting?.color || T?.accent) : T?.border}`,
              background: active ? `${meeting?.color || T?.accent}18` : T?.bgCard,
              color: active ? T?.text : T?.textSub,
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {m.name}{m.name === myName ? ' (自分)' : ''}
            </button>
          )
        })}
      </div>

      {loading && <div style={{ ...TYPO.caption, color: T?.textMuted, padding: SPACING.md }}>読み込み中…</div>}

      {!loading && selectedName && (
        <>
          {/* 昨日の振り返り */}
          <div style={card}>
            <div style={{ ...TYPO.headline, color: T?.text, marginBottom: SPACING.xs }}>
              💭 昨日の振り返り (KPT)
            </div>
            {yesterdayKpt ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs, ...TYPO.body, color: T?.text }}>
                {yesterdayKpt.keep_text && <div>✅ <strong>Keep:</strong> {yesterdayKpt.keep_text}</div>}
                {yesterdayKpt.problem_text && <div>⚠️ <strong>Problem:</strong> {yesterdayKpt.problem_text}</div>}
                {yesterdayKpt.try_text && <div>🎯 <strong>Try:</strong> {yesterdayKpt.try_text}</div>}
                {!yesterdayKpt.keep_text && !yesterdayKpt.problem_text && !yesterdayKpt.try_text && (
                  <div style={{ color: T?.textFaint }}>振り返りが未入力</div>
                )}
              </div>
            ) : (
              <div style={{ ...TYPO.caption, color: T?.textFaint }}>昨日の終業ログが見つかりません</div>
            )}
          </div>

          {/* 今日のタスク */}
          <div style={card}>
            <div style={{ ...TYPO.headline, color: T?.text, marginBottom: SPACING.xs }}>
              ⚡ 今日のタスク ({todayTasks.length}件)
            </div>
            {todayTasks.length === 0 ? (
              <div style={{ ...TYPO.caption, color: T?.textFaint }}>今日のタスクが未登録</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {todayTasks.map(t => (
                  <div key={t.id} style={{ ...TYPO.body, color: T?.text, padding: '4px 0', display: 'flex', gap: SPACING.sm }}>
                    <span>•</span>
                    <span style={{ flex: 1 }}>{t.title}</span>
                    {t.due_date && <span style={{ ...TYPO.caption, color: T?.textMuted }}>📅 {t.due_date}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
