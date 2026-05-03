'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_TOKENS } from '../lib/themeTokens'

// JST 月曜
function getMondayJSTStr(d = new Date()) {
  const j = new Date(d.getTime() + 9 * 3600 * 1000)
  const day = j.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + diff))
  return m.toISOString().slice(0, 10)
}
function todayJSTStr() {
  const j = new Date(Date.now() + 9 * 3600 * 1000)
  return j.toISOString().slice(0, 10)
}
function fmtMonthDay(ds) {
  if (!ds) return ''
  const d = new Date(ds + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const THEMES = {
  dark:  COMMON_TOKENS.dark,
  light: COMMON_TOKENS.light,
}

export default function CompanyDashboardSummary({
  T: parentT, themeKey = 'dark', levels = [], members = [], fiscalYear = '2026',
  myName, isAdmin,
}) {
  const T = parentT || THEMES[themeKey] || THEMES.dark

  const [loading, setLoading] = useState(true)
  const today = useMemo(() => todayJSTStr(), [])
  const monday = useMemo(() => getMondayJSTStr(), [])

  // Stage B 用データ
  const [overdueCount, setOverdueCount] = useState(0)         // 全社・期限切れ未完了タスク数
  const [unfilledKRCount, setUnfilledKRCount] = useState(0)   // 今週レビュー未記入 KR 数
  const [unresolvedConfirmCount, setUnresolvedConfirmCount] = useState(0)
  const [todayTaskStats, setTodayTaskStats] = useState({ total: 0, done: 0, inProgress: 0, overdue: 0 })
  const [workingMembers, setWorkingMembers] = useState({ active: 0, finished: 0, notStarted: 0 })

  // Stage C 用データ
  const [milestones, setMilestones] = useState([])
  const [krPinch, setKrPinch] = useState([])

  // Stage A 用データ: チーム単位の今週サマリー
  const [teamSummaries, setTeamSummaries] = useState([])      // [{level, summary}]

  // 一括取得
  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        // ─── 並行クエリ ───────────────────────────────────────
        const [
          allTasks, krs, weeklyReviews, openConfirms,
          msRes, workLogsRes, teamSummaryRes,
        ] = await Promise.all([
          // 全社の未完了 + 全タスク (今日の状況計算用)
          supabase.from('ka_tasks')
            .select('id, assignee, due_date, done, status, created_at')
            .order('due_date', { ascending: true, nullsFirst: false })
            .range(0, 9999),
          // 今期 KR (達成率と未記入計算用)
          supabase.from('key_results')
            .select('id, title, owner, current, target, unit, objective_id'),
          // 今週の KR レビュー
          supabase.from('kr_weekly_reviews')
            .select('kr_id, good, more, focus, focus_output')
            .eq('week_start', monday),
          // 未対応の確認依頼
          supabase.from('member_confirmations')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open'),
          // マイルストーン (今年度)
          supabase.from('milestones')
            .select('*')
            .eq('fiscal_year', parseInt(fiscalYear))
            .order('due_date', { ascending: true, nullsFirst: false })
            .range(0, 999),
          // 直近24時間の work_log (稼働状況)
          supabase.from('coaching_logs')
            .select('owner, content, created_at')
            .eq('log_type', 'work_log')
            .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .range(0, 999),
          // 今週の team_weekly_summary
          supabase.from('team_weekly_summary')
            .select('level_id, good, more, focus, updated_at, updated_by')
            .eq('week_start', monday)
            .range(0, 999),
        ])
        if (!alive) return

        const tasks = allTasks.data || []
        // 期限切れ未完了
        const overdueTasks = tasks.filter(t => !t.done && t.due_date && t.due_date < today)
        setOverdueCount(overdueTasks.length)

        // 今日タスク統計
        const todayTasks = tasks.filter(t => t.due_date === today)
        const todayDone = todayTasks.filter(t => t.done || t.status === 'done').length
        const todayInProg = todayTasks.filter(t => !t.done && t.status === 'in_progress').length
        setTodayTaskStats({
          total: todayTasks.length,
          done: todayDone,
          inProgress: todayInProg,
          overdue: overdueTasks.length,
        })

        // 今週 KR 未記入数 (KR の owner = メンバー、レビューが空)
        const reviewMap = {}
        ;(weeklyReviews.data || []).forEach(r => {
          reviewMap[r.kr_id] = !!((r.good||'').trim() || (r.more||'').trim() || (r.focus||'').trim() || (r.focus_output||'').trim())
        })
        const krList = krs.data || []
        const unfilled = krList.filter(kr => kr.owner && !reviewMap[kr.id]).length
        setUnfilledKRCount(unfilled)

        setUnresolvedConfirmCount(openConfirms.count || 0)

        // メンバー稼働状況: 直近24h の work_log を1メンバー最新1件にまとめ
        const lastByMember = new Map()
        for (const r of workLogsRes.data || []) {
          if (!lastByMember.has(r.owner)) lastByMember.set(r.owner, r)
        }
        let active = 0, finished = 0
        for (const [name, row] of lastByMember.entries()) {
          let c
          try { c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content } catch { c = {} }
          if (c?.end_at) finished++
          else if (c?.start_at) active++
        }
        const totalNonGuest = (members || []).filter(m => m.name !== '👀 ゲスト').length
        setWorkingMembers({
          active, finished,
          notStarted: Math.max(0, totalNonGuest - active - finished),
        })

        // マイルストーン: 今日以降を期限近順で5件 (期限なしは末尾)
        const ms = (msRes.data || []).filter(m => m.status !== 'done')
        const futureFirst = ms.sort((a, b) => {
          const ad = a.due_date || '9999-12-31'
          const bd = b.due_date || '9999-12-31'
          return ad.localeCompare(bd)
        })
        setMilestones(futureFirst.slice(0, 5))

        // KR ピンチ: 今期 KR を達成率昇順、レビューで more が記入済 (停滞シグナル) を優先
        const moreMap = {}
        ;(weeklyReviews.data || []).forEach(r => { if ((r.more || '').trim()) moreMap[r.kr_id] = r.more })
        const pinch = krList
          .filter(kr => kr.target)
          .map(kr => {
            const pct = (Number(kr.current) || 0) / Number(kr.target) * 100
            return {
              ...kr,
              pct: Math.min(150, pct),
              hasMore: !!moreMap[kr.id],
              moreText: moreMap[kr.id] || '',
            }
          })
          .filter(kr => kr.pct < 70 || kr.hasMore)
          .sort((a, b) => {
            // hasMore 優先 + pct 低い順
            if (a.hasMore !== b.hasMore) return a.hasMore ? -1 : 1
            return a.pct - b.pct
          })
          .slice(0, 5)
        setKrPinch(pinch)

        // チームサマリー: 各レベル (チーム階層) を取得
        // ルート (parent_id NULL) と事業部 (parent がルート) を除く
        const rootIds = new Set((levels || []).filter(l => !l.parent_id).map(l => Number(l.id)))
        const teamLevels = (levels || []).filter(l => {
          if (!l.parent_id) return false
          if (rootIds.has(Number(l.parent_id))) return false
          return true
        })
        const sumMap = {}
        ;(teamSummaryRes.data || []).forEach(r => { sumMap[r.level_id] = r })
        const allTeamSummaries = teamLevels.map(level => ({
          level,
          summary: sumMap[level.id] || null,
        }))
        setTeamSummaries(allTeamSummaries)
      } catch (e) {
        console.warn('CompanyDashboardSummary load error:', e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [today, monday, fiscalYear, levels, members])

  if (loading) {
    return (
      <div style={{ flex: 1, padding: 30, color: T.textMuted, fontSize: 13, textAlign: 'center', overflowY: 'auto' }}>
        全社サマリーを読み込み中...
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px', background: T.bg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ヘッダ */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>
            📊 全社ダッシュボード
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
            {fiscalYear}年度 ・ {today} 時点
          </div>
        </div>

        {/* 上段: アラート + 今日の状況 (横並び) */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14, marginBottom: 18,
        }}>
          <AlertCard T={T}
            overdueCount={overdueCount}
            unfilledKRCount={unfilledKRCount}
            unresolvedConfirmCount={unresolvedConfirmCount} />
          <TodayCard T={T}
            todayTaskStats={todayTaskStats}
            workingMembers={workingMembers} />
        </div>

        {/* 中段: チームサマリー */}
        <SectionTitle T={T} icon="📊" title="今週のチームサマリー" sub={`${teamSummaries.filter(t => t.summary).length} / ${teamSummaries.length} チーム提出済み`} />
        <TeamSummariesGrid T={T} teamSummaries={teamSummaries} members={members} />

        {/* 下段: マイルストーン + KRピンチ (横並び) */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 14, marginTop: 22,
        }}>
          <MilestonesCard T={T} milestones={milestones} />
          <KrPinchCard T={T} pinch={krPinch} />
        </div>
      </div>
    </div>
  )
}

// ─── サブコンポーネント ─────────────────────────────────────

function SectionTitle({ T, icon, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, marginTop: 4 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>{title}</span>
      {sub && <span style={{ fontSize: 11, color: T.textMuted }}>{sub}</span>}
    </div>
  )
}

function MetricRow({ T, color, icon, label, value, unit }) {
  const isAlert = value > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 8,
      background: isAlert ? `${color}10` : T.sectionBg,
      border: `1px solid ${isAlert ? color + '40' : T.border}`,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 12, color: T.text }}>{label}</span>
      <span style={{
        fontSize: 18, fontWeight: 800,
        color: isAlert ? color : T.textMuted,
      }}>
        {value}<span style={{ fontSize: 10, marginLeft: 2, fontWeight: 600 }}>{unit}</span>
      </span>
    </div>
  )
}

function AlertCard({ T, overdueCount, unfilledKRCount, unresolvedConfirmCount }) {
  const total = overdueCount + unfilledKRCount + unresolvedConfirmCount
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${total > 0 ? T.danger : T.success}`,
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🚨</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>今すぐ目を向けるべきこと</span>
        <div style={{ flex: 1 }} />
        {total === 0 && (
          <span style={{ fontSize: 10, color: T.success, fontWeight: 700 }}>✓ クリア</span>
        )}
      </div>
      <MetricRow T={T} color={T.danger} icon="⏰" label="期限切れ未完了タスク" value={overdueCount} unit="件" />
      <MetricRow T={T} color={T.warn}   icon="📝" label="今週レビュー未記入 KR" value={unfilledKRCount} unit="件" />
      <MetricRow T={T} color={T.accent} icon="🤝" label="未対応の確認依頼" value={unresolvedConfirmCount} unit="件" />
    </div>
  )
}

function TodayCard({ T, todayTaskStats, workingMembers }) {
  const pct = todayTaskStats.total > 0
    ? Math.round(todayTaskStats.done / todayTaskStats.total * 100)
    : 0
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${T.accent}`,
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 18 }}>📅</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>今日の全社状況</span>
      </div>

      {/* 今日のタスク進捗 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: T.textMuted }}>今日期限のタスク</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 22, fontWeight: 800, color: T.accent }}>{pct}%</span>
          <span style={{ fontSize: 10, color: T.textMuted }}>{todayTaskStats.done}/{todayTaskStats.total}</span>
        </div>
        <div style={{
          height: 6, background: T.sectionBg, borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%', background: T.accent,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: T.textMuted }}>
          <span>進行中 {todayTaskStats.inProgress}件</span>
          <span style={{ color: T.danger }}>停滞 {todayTaskStats.overdue}件</span>
        </div>
      </div>

      {/* メンバー稼働状況 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6, paddingTop: 8, borderTop: `1px solid ${T.border}`,
      }}>
        <MiniStat T={T} label="稼働中" value={workingMembers.active} color={T.success} />
        <MiniStat T={T} label="終業済" value={workingMembers.finished} color={T.textSub} />
        <MiniStat T={T} label="未始業" value={workingMembers.notStarted} color={T.textMuted} />
      </div>
    </div>
  )
}

function MiniStat({ T, label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || T.text }}>{value}</div>
      <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function TeamSummariesGrid({ T, teamSummaries, members }) {
  if (teamSummaries.length === 0) {
    return (
      <div style={{
        padding: 20, fontSize: 12, color: T.textMuted,
        background: T.bgCard, borderRadius: 12, textAlign: 'center',
      }}>
        チーム階層が登録されていません
      </div>
    )
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 10,
    }}>
      {teamSummaries.map(({ level, summary }) => (
        <div key={level.id} style={{
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderLeft: `3px solid ${summary ? T.success : T.border}`,
          borderRadius: 10, padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: summary ? 100 : 60,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{level.icon || '🏷'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {level.name}
            </span>
            {summary
              ? <span style={{ fontSize: 9, color: T.success, fontWeight: 700 }}>✓ 提出済</span>
              : <span style={{ fontSize: 9, color: T.textMuted }}>未提出</span>
            }
          </div>
          {summary && (
            <>
              {summary.good && (
                <div style={{ fontSize: 10, color: T.textSub, lineHeight: 1.5 }}>
                  <span style={{ color: T.success, fontWeight: 700 }}>Good: </span>
                  {summary.good.slice(0, 80)}{summary.good.length > 80 ? '…' : ''}
                </div>
              )}
              {summary.more && (
                <div style={{ fontSize: 10, color: T.textSub, lineHeight: 1.5 }}>
                  <span style={{ color: T.warn, fontWeight: 700 }}>More: </span>
                  {summary.more.slice(0, 80)}{summary.more.length > 80 ? '…' : ''}
                </div>
              )}
              {summary.focus && (
                <div style={{ fontSize: 10, color: T.textSub, lineHeight: 1.5 }}>
                  <span style={{ color: T.accent, fontWeight: 700 }}>Focus: </span>
                  {summary.focus.slice(0, 80)}{summary.focus.length > 80 ? '…' : ''}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function MilestonesCard({ T, milestones }) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${T.warn}`,
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🎯</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>マイルストーン (期限近順)</span>
      </div>
      {milestones.length === 0 ? (
        <div style={{ padding: 12, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
          進行中のマイルストーンはありません
        </div>
      ) : milestones.map(ms => {
        const today = todayJSTStr()
        const days = ms.due_date
          ? Math.round((new Date(ms.due_date) - new Date(today)) / 86400000)
          : null
        const overdue = days !== null && days < 0
        const urgent = days !== null && days >= 0 && days <= 7
        return (
          <div key={ms.id} style={{
            padding: '8px 10px', borderRadius: 8,
            background: T.sectionBg,
            border: `1px solid ${overdue ? T.danger + '50' : urgent ? T.warn + '50' : T.border}`,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {ms.focus_level === 'focus' && <span style={{ fontSize: 11 }}>⭐</span>}
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ms.title}
              </span>
              {ms.due_date && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: overdue ? T.danger : urgent ? T.warn : T.textMuted,
                }}>
                  {fmtMonthDay(ms.due_date)} {overdue ? `(${Math.abs(days)}日超過)` : days === 0 ? '(今日)' : `(あと${days}日)`}
                </span>
              )}
            </div>
            {ms.owner && (
              <div style={{ fontSize: 10, color: T.textMuted }}>担当: {ms.owner}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function KrPinchCard({ T, pinch }) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${T.danger}`,
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 18 }}>📉</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>KR ピンチ (低達成 or 課題ありTOP5)</span>
      </div>
      {pinch.length === 0 ? (
        <div style={{ padding: 12, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
          ピンチの KR はありません ✨
        </div>
      ) : pinch.map(kr => {
        const pctColor = kr.pct < 50 ? T.danger : kr.pct < 80 ? T.warn : T.success
        return (
          <div key={kr.id} style={{
            padding: '8px 10px', borderRadius: 8,
            background: T.sectionBg, border: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {kr.title}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: pctColor }}>
                {Math.round(kr.pct)}%
              </span>
            </div>
            <div style={{
              height: 4, background: T.border, borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(100, kr.pct)}%`, height: '100%', background: pctColor,
              }} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: T.textMuted }}>
              <span>担当: {kr.owner}</span>
              <span>・ {kr.current}/{kr.target} {kr.unit}</span>
              {kr.hasMore && (
                <span style={{
                  marginLeft: 'auto', padding: '1px 6px', borderRadius: 4,
                  background: T.warn + '20', color: T.warn, fontWeight: 700, fontSize: 9,
                }}>課題あり</span>
              )}
            </div>
            {kr.hasMore && kr.moreText && (
              <div style={{ fontSize: 10, color: T.textSub, lineHeight: 1.4, fontStyle: 'italic' }}>
                "{kr.moreText.slice(0, 100)}{kr.moreText.length > 100 ? '…' : ''}"
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
