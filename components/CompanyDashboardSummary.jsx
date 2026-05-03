'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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

  // viewingMember: current user (for edit permission of team summary)
  const viewingMember = useMemo(() => (members || []).find(m => m.name === myName) || null, [members, myName])

  // データ
  const [overdueCount, setOverdueCount] = useState(0)
  const [unfilledKRCount, setUnfilledKRCount] = useState(0)
  const [unresolvedConfirmCount, setUnresolvedConfirmCount] = useState(0)
  const [todayTaskStats, setTodayTaskStats] = useState({ total: 0, done: 0, inProgress: 0, overdue: 0 })
  const [workingMembers, setWorkingMembers] = useState({ active: 0, finished: 0, notStarted: 0 })
  const [milestones, setMilestones] = useState([])
  const [krPinch, setKrPinch] = useState([])
  const [submittedTeamCount, setSubmittedTeamCount] = useState({ total: 0, submitted: 0 })

  // ランキング (週次)
  const [rankings, setRankings] = useState(null)

  // 一括取得
  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const days7Ago = new Date(Date.now() - 7 * 86400000).toISOString()
        const [
          allTasks, krs, weeklyReviews, openConfirms, msRes, workLogsRes,
          teamSummaryRes, weeklyReportsRes, ka7Done, ka7AllWithDue,
        ] = await Promise.all([
          // 全社の全タスク (今日の状況計算用)
          supabase.from('ka_tasks')
            .select('id, assignee, due_date, done, status, created_at')
            .order('due_date', { ascending: true, nullsFirst: false })
            .range(0, 9999),
          // 今期 KR
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
          supabase.from('milestones')
            .select('*')
            .eq('fiscal_year', parseInt(fiscalYear))
            .order('due_date', { ascending: true, nullsFirst: false })
            .range(0, 999),
          supabase.from('coaching_logs')
            .select('owner, content, created_at')
            .eq('log_type', 'work_log')
            .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .range(0, 999),
          supabase.from('team_weekly_summary')
            .select('level_id, good, more, focus, updated_at, updated_by')
            .eq('week_start', monday)
            .range(0, 999),
          // ランキング: 今週の weekly_reports (good/more/focus_output 文字数集計)
          supabase.from('weekly_reports')
            .select('owner, good, more, focus_output')
            .eq('week_start', monday)
            .range(0, 9999),
          // ランキング: 過去7日の完了タスク
          supabase.from('ka_tasks')
            .select('assignee')
            .gte('created_at', days7Ago)
            .eq('done', true)
            .range(0, 9999),
          // ランキング: 過去7日の期限付きタスク
          supabase.from('ka_tasks')
            .select('assignee, due_date, done, status')
            .gte('created_at', days7Ago)
            .not('due_date', 'is', null)
            .range(0, 9999),
        ])
        if (!alive) return

        // ── 共通: タスク集計 ──
        const tasks = allTasks.data || []
        const overdueTasks = tasks.filter(t => !t.done && t.due_date && t.due_date < today)
        setOverdueCount(overdueTasks.length)

        const todayTasks = tasks.filter(t => t.due_date === today)
        setTodayTaskStats({
          total: todayTasks.length,
          done: todayTasks.filter(t => t.done || t.status === 'done').length,
          inProgress: todayTasks.filter(t => !t.done && t.status === 'in_progress').length,
          overdue: overdueTasks.length,
        })

        // ── KR レビュー ──
        const reviewMap = {}
        ;(weeklyReviews.data || []).forEach(r => {
          reviewMap[r.kr_id] = !!((r.good||'').trim() || (r.more||'').trim() || (r.focus||'').trim() || (r.focus_output||'').trim())
        })
        const krList = krs.data || []
        setUnfilledKRCount(krList.filter(kr => kr.owner && !reviewMap[kr.id]).length)
        setUnresolvedConfirmCount(openConfirms.count || 0)

        // ── 稼働状況 ──
        const lastByMember = new Map()
        for (const r of workLogsRes.data || []) {
          if (!lastByMember.has(r.owner)) lastByMember.set(r.owner, r)
        }
        let active = 0, finished = 0
        for (const [, row] of lastByMember.entries()) {
          let c
          try { c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content } catch { c = {} }
          if (c?.end_at) finished++
          else if (c?.start_at) active++
        }
        const totalNonGuest = (members || []).filter(m => m.name !== '👀 ゲスト').length
        setWorkingMembers({ active, finished, notStarted: Math.max(0, totalNonGuest - active - finished) })

        // ── マイルストーン ──
        const ms = (msRes.data || []).filter(m => m.status !== 'done')
        ms.sort((a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31'))
        setMilestones(ms.slice(0, 5))

        // ── KR ピンチ ──
        const moreMap = {}
        ;(weeklyReviews.data || []).forEach(r => { if ((r.more || '').trim()) moreMap[r.kr_id] = r.more })
        const pinch = krList
          .filter(kr => kr.target)
          .map(kr => ({
            ...kr,
            pct: Math.min(150, (Number(kr.current) || 0) / Number(kr.target) * 100),
            hasMore: !!moreMap[kr.id],
            moreText: moreMap[kr.id] || '',
          }))
          .filter(kr => kr.pct < 70 || kr.hasMore)
          .sort((a, b) => (a.hasMore !== b.hasMore) ? (a.hasMore ? -1 : 1) : a.pct - b.pct)
          .slice(0, 5)
        setKrPinch(pinch)

        // ── チームサマリー件数 ──
        const rootIds = new Set((levels || []).filter(l => !l.parent_id).map(l => Number(l.id)))
        const teamLvlSet = new Set((levels || []).filter(l => {
          if (!l.parent_id) return false
          if (rootIds.has(Number(l.parent_id))) return false
          return true
        }).map(l => Number(l.id)))
        const submittedTeams = new Set(
          (teamSummaryRes.data || [])
            .filter(r => (r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim())
            .map(r => Number(r.level_id))
            .filter(id => teamLvlSet.has(id))
        )
        setSubmittedTeamCount({ total: teamLvlSet.size, submitted: submittedTeams.size })

        // ── ランキング (今週基準) ──
        try {
          const todayStr = today
          const validMembers = new Set((members || []).map(m => m.name))
          const excludeNames = new Set(['👀 ゲスト'])

          // 1. 有言実行王: 過去7日の期限付きタスクのうち期限切れ未完了でない率
          const promiseStats = {}
          for (const t of ka7AllWithDue.data || []) {
            if (!t.assignee || excludeNames.has(t.assignee) || !validMembers.has(t.assignee)) continue
            const ps = promiseStats[t.assignee] = promiseStats[t.assignee] || { total: 0, overdue: 0 }
            ps.total++
            if (!t.done && t.due_date && t.due_date < todayStr) ps.overdue++
          }
          const promiseKeeper = Object.entries(promiseStats)
            .filter(([_, s]) => s.total >= 2)  // 1週間なので閾値を下げる
            .map(([name, s]) => ({ name, score: 1 - s.overdue / s.total, total: s.total, overdue: s.overdue }))
            .sort((a, b) => b.score - a.score || b.total - a.total)
            .slice(0, 3)

          // 2. タスク完了王: 過去7日
          const doneCount = {}
          for (const t of ka7Done.data || []) {
            if (!t.assignee || excludeNames.has(t.assignee) || !validMembers.has(t.assignee)) continue
            doneCount[t.assignee] = (doneCount[t.assignee] || 0) + 1
          }
          const taskMaster = Object.entries(doneCount)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)

          // 3. 振り返り王: 今週の weekly_reports + kr_weekly_reviews (good/more/focus_output)
          const reflStats = {}
          const ensureRefl = (name) => reflStats[name] = reflStats[name] || { entries: 0, fullEntries: 0, totalChars: 0 }

          for (const r of weeklyReportsRes.data || []) {
            if (!r.owner || excludeNames.has(r.owner) || !validMembers.has(r.owner)) continue
            const ps = ensureRefl(r.owner)
            const g = (r.good || '').trim()
            const m = (r.more || '').trim()
            const f = (r.focus_output || '').trim()
            ps.entries++
            if (g && m && f) ps.fullEntries++
            ps.totalChars += g.length + m.length + f.length
          }
          // KR レビュー (KR.owner と紐付け)
          const krOwnerMap = {}
          krList.forEach(kr => { krOwnerMap[kr.id] = kr.owner })
          for (const r of weeklyReviews.data || []) {
            const owner = krOwnerMap[r.kr_id]
            if (!owner || excludeNames.has(owner) || !validMembers.has(owner)) continue
            const ps = ensureRefl(owner)
            const g = (r.good || '').trim()
            const m = (r.more || '').trim()
            const f = (r.focus_output || '').trim() || (r.focus || '').trim()
            ps.entries++
            if (g && m && f) ps.fullEntries++
            ps.totalChars += g.length + m.length + f.length
          }
          const reflection = Object.entries(reflStats)
            .map(([name, s]) => ({
              name,
              score: s.fullEntries * 100 + Math.floor(s.totalChars / 10),
              fullEntries: s.fullEntries,
              totalChars: s.totalChars,
            }))
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)

          // 4. 目標達成王: 担当 KR の平均達成率
          const krProgressByOwner = {}
          for (const kr of krList) {
            const owner = kr.owner
            if (!owner || excludeNames.has(owner) || !validMembers.has(owner)) continue
            const arr = krProgressByOwner[owner] = krProgressByOwner[owner] || []
            const target = Number(kr.target) || 0
            const current = Number(kr.current) || 0
            const pct = target ? Math.min(150, (current / target) * 100) : 0
            arr.push(pct)
          }
          const goalAchiever = Object.entries(krProgressByOwner)
            .filter(([_, arr]) => arr.length >= 1)
            .map(([name, arr]) => ({
              name,
              avg: arr.reduce((a, b) => a + b, 0) / arr.length,
              count: arr.length,
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 3)

          setRankings({ promiseKeeper, taskMaster, reflection, goalAchiever })
        } catch (e) {
          console.warn('rankings calc error:', e)
          setRankings(null)
        }

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
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>
            📊 全社ダッシュボード
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
            {fiscalYear}年度 ・ {today} 時点
          </div>
        </div>

        {/* 上段: アラート + 今日 */}
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

        {/* 週間ランキング (4列) */}
        {rankings && (
          <>
            <SectionTitle T={T} icon="🏆" title="週間ランキング" sub="今週の Top 3" />
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10, marginBottom: 22,
            }}>
              <RankingCard T={T} title="有言実行王" emoji="🎯" subtitle="期限内完了率"
                entries={rankings.promiseKeeper.map(r => ({
                  name: r.name, main: `${Math.round(r.score * 100)}%`, sub: `${r.overdue}/${r.total}件遅延`,
                }))} />
              <RankingCard T={T} title="タスク完了王" emoji="✅" subtitle="今週の完了数"
                entries={rankings.taskMaster.map(r => ({
                  name: r.name, main: `${r.count}件`, sub: '',
                }))} />
              <RankingCard T={T} title="振り返り王" emoji="📝" subtitle="good/more/focus 記入"
                entries={rankings.reflection.map(r => ({
                  name: r.name, main: `${r.fullEntries}件`, sub: `${r.totalChars}字`,
                }))} />
              <RankingCard T={T} title="目標達成王" emoji="🎖" subtitle="担当 KR 平均"
                entries={rankings.goalAchiever.map(r => ({
                  name: r.name, main: `${Math.round(r.avg)}%`, sub: `KR ${r.count}件`,
                }))} />
            </div>
          </>
        )}

        {/* チームサマリー (1チーム拡大表示 + プルダウン) */}
        <SectionTitle T={T} icon="📊" title="今週のチームサマリー"
          sub={`${submittedTeamCount.submitted}/${submittedTeamCount.total} チーム提出済み (マネージャー定例・ディレクター確認会議に反映)`} />
        <TeamSummarySingleView T={T} levels={levels} members={members}
          weekStart={monday} myName={myName} viewingMember={viewingMember} isAdmin={isAdmin} />

        {/* 下段: マイルストーン + KR ピンチ */}
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, marginTop: 4, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>{title}</span>
      {sub && <span style={{ fontSize: 11, color: T.textMuted }}>{sub}</span>}
    </div>
  )
}

// ─── ランキングカード ─────────────────────────────────
function RankingCard({ T, title, emoji, subtitle, entries }) {
  const medals = ['🥇', '🥈', '🥉']
  const medalBg = ['#FFD60018', '#C7C7CC18', '#FF950018']
  const medalColor = ['#FFD60a', '#C7C7CC', '#FF9500']
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 15 }}>{emoji}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </div>
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>{subtitle}</div>
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: 8, fontSize: 10, color: T.textMuted, textAlign: 'center' }}>
          データ不足
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {entries.map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', borderRadius: 6,
              background: medalBg[i],
              border: `1px solid ${medalColor[i]}30`,
            }}>
              <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{medals[i]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name}
                </div>
                {e.sub && (
                  <div style={{ fontSize: 8, color: T.textMuted }}>{e.sub}</div>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: medalColor[i], whiteSpace: 'nowrap' }}>
                {e.main}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── アラート / 今日 ─────────────────────────────────
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
      <span style={{ fontSize: 18, fontWeight: 800, color: isAlert ? color : T.textMuted }}>
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
        {total === 0 && <span style={{ fontSize: 10, color: T.success, fontWeight: 700 }}>✓ クリア</span>}
      </div>
      <MetricRow T={T} color={T.danger} icon="⏰" label="期限切れ未完了タスク" value={overdueCount} unit="件" />
      <MetricRow T={T} color={T.warn}   icon="📝" label="今週レビュー未記入 KR" value={unfilledKRCount} unit="件" />
      <MetricRow T={T} color={T.accent} icon="🤝" label="未対応の確認依頼" value={unresolvedConfirmCount} unit="件" />
    </div>
  )
}
function TodayCard({ T, todayTaskStats, workingMembers }) {
  const pct = todayTaskStats.total > 0 ? Math.round(todayTaskStats.done / todayTaskStats.total * 100) : 0
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
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: T.textMuted }}>今日期限のタスク</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 22, fontWeight: 800, color: T.accent }}>{pct}%</span>
          <span style={{ fontSize: 10, color: T.textMuted }}>{todayTaskStats.done}/{todayTaskStats.total}</span>
        </div>
        <div style={{ height: 6, background: T.sectionBg, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: T.accent, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: T.textMuted }}>
          <span>進行中 {todayTaskStats.inProgress}件</span>
          <span style={{ color: T.danger }}>停滞 {todayTaskStats.overdue}件</span>
        </div>
      </div>
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

// ─── チームサマリー: 部署/チーム選択 + 3カラム編集 + AI生成 ─────────
function TeamSummarySingleView({ T, levels, members, weekStart, myName, viewingMember, isAdmin }) {
  const monday = weekStart

  // 階層構築
  const rootIds = useMemo(() => new Set((levels || []).filter(l => !l.parent_id).map(l => Number(l.id))), [levels])
  const departments = useMemo(() => (levels || []).filter(l => rootIds.has(Number(l.parent_id))), [levels, rootIds])
  const teamsByDept = useMemo(() => {
    const m = {}
    ;(levels || []).forEach(l => {
      if (!l.parent_id) return
      if (rootIds.has(Number(l.parent_id))) return  // 事業部レイヤー除外
      const deptId = Number(l.parent_id)
      if (!m[deptId]) m[deptId] = []
      m[deptId].push(l)
    })
    return m
  }, [levels, rootIds])

  // 初期: 自分が責任者 OR 所属のチームがあればそれを選ぶ、なければ最初のチーム
  const initialTeam = useMemo(() => {
    const allTeamLevels = Object.values(teamsByDept).flat()
    if (allTeamLevels.length === 0) return null
    // 1. 自分が責任者
    const mgrTeam = allTeamLevels.find(l => Number(l.manager_id) === Number(viewingMember?.id))
    if (mgrTeam) return mgrTeam
    // 2. 自分が所属
    const memberLvls = Array.isArray(viewingMember?.sub_level_ids) ? viewingMember.sub_level_ids
      : viewingMember?.level_id ? [viewingMember.level_id] : []
    const myTeam = allTeamLevels.find(l => memberLvls.includes(Number(l.id)))
    if (myTeam) return myTeam
    // 3. 先頭
    return allTeamLevels[0]
  }, [teamsByDept, viewingMember])

  const [selectedDeptId, setSelectedDeptId] = useState(null)
  const [selectedTeamId, setSelectedTeamId] = useState(null)

  useEffect(() => {
    if (initialTeam && !selectedTeamId) {
      setSelectedDeptId(Number(initialTeam.parent_id))
      setSelectedTeamId(Number(initialTeam.id))
    }
  }, [initialTeam, selectedTeamId])

  const teamsInSelectedDept = useMemo(() => teamsByDept[selectedDeptId] || [], [teamsByDept, selectedDeptId])
  const selectedTeam = useMemo(() => (levels || []).find(l => Number(l.id) === Number(selectedTeamId)), [levels, selectedTeamId])

  // 編集権限
  const isManagerOfActive = !!selectedTeam && Number(selectedTeam.manager_id) === Number(viewingMember?.id)
  const canEdit = !!viewingMember && (isManagerOfActive || isAdmin)
  const managerName = useMemo(() => {
    if (!selectedTeam?.manager_id) return null
    const mgr = (members || []).find(mm => Number(mm.id) === Number(selectedTeam.manager_id))
    return mgr?.name || null
  }, [selectedTeam, members])

  // データ
  const [good, setGood] = useState('')
  const [more, setMore] = useState('')
  const [focus, setFocus] = useState('')
  const [rowId, setRowId] = useState(null)
  const [rowLoading, setRowLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const focusedRef = useRef(null)
  const saveTimer = useRef(null)

  // 選択チーム変更時にロード
  useEffect(() => {
    if (!selectedTeamId || !monday) return
    let alive = true
    setRowLoading(true); setRowId(null); setGood(''); setMore(''); setFocus('')
    supabase.from('team_weekly_summary').select('*')
      .eq('level_id', selectedTeamId).eq('week_start', monday).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) {
          setRowId(data.id)
          setGood(data.good || ''); setMore(data.more || ''); setFocus(data.focus || '')
        }
        setRowLoading(false)
      })
    return () => { alive = false }
  }, [selectedTeamId, monday])

  // Realtime 購読
  useEffect(() => {
    if (!selectedTeamId || !monday) return
    const ch = supabase.channel(`tws_dash_${selectedTeamId}_${monday}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'team_weekly_summary', filter: `level_id=eq.${selectedTeamId}` },
        payload => {
          const row = payload.new || payload.old
          if (!row || row.week_start !== monday) return
          if (payload.eventType === 'DELETE') { setRowId(null); return }
          setRowId(row.id)
          if (focusedRef.current !== 'good')  setGood(row.good || '')
          if (focusedRef.current !== 'more')  setMore(row.more || '')
          if (focusedRef.current !== 'focus') setFocus(row.focus || '')
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedTeamId, monday])

  const save = useCallback(async (g, m, f) => {
    if (!selectedTeamId || !canEdit) return
    setSaving(true)
    const payload = {
      level_id: selectedTeamId, week_start: monday,
      good: g, more: m, focus: f,
      updated_by: myName, updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('team_weekly_summary')
      .upsert(payload, { onConflict: 'level_id,week_start' }).select().single()
    setSaving(false)
    if (error) { console.error('team summary save error:', error); return }
    if (data) { setRowId(data.id); setSaved(true); setTimeout(() => setSaved(false), 1200) }
  }, [selectedTeamId, monday, myName, canEdit])

  const scheduleSave = (g, m, f) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(g, m, f), 800)
  }

  const generateAI = async () => {
    if (!selectedTeamId || !monday || aiBusy) return
    if ((good || more || focus).trim().length > 0) {
      if (!window.confirm('現在の内容を AI 生成結果で上書きします。よろしいですか？')) return
    }
    setAiBusy(true); setAiError('')
    try {
      const res = await fetch('/api/ai/team-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level_id: selectedTeamId, week_start: monday }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      if (j.message) { setAiError(j.message); return }
      setGood(j.good || ''); setMore(j.more || ''); setFocus(j.focus || '')
      save(j.good || '', j.more || '', j.focus || '')
    } catch (e) {
      setAiError(e.message || 'AI生成に失敗しました')
    } finally {
      setAiBusy(false)
    }
  }

  if (departments.length === 0) {
    return (
      <div style={{ padding: 20, fontSize: 12, color: T.textMuted, background: T.bgCard, borderRadius: 12, textAlign: 'center' }}>
        部署/チーム階層が未登録です
      </div>
    )
  }

  const selectStyle = {
    padding: '6px 10px', fontSize: 12, fontFamily: 'inherit',
    background: T.bgCard, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6,
    outline: 'none', cursor: 'pointer',
  }
  const cellStyle = (color) => ({
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderTop: `3px solid ${color}`,
    borderRadius: 10, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 6, minHeight: 200,
  })
  const inputBase = {
    width: '100%', boxSizing: 'border-box', flex: 1,
    padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
    background: T.sectionBg, color: T.text,
    border: `1px solid ${T.border}`, borderRadius: 6,
    outline: 'none', resize: 'none', lineHeight: 1.6, minHeight: 140,
  }

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: '14px 16px',
    }}>
      {/* セレクタ行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textSub }}>部署</span>
        <select value={selectedDeptId || ''} onChange={(e) => {
          const did = Number(e.target.value)
          setSelectedDeptId(did)
          const teams = teamsByDept[did] || []
          if (teams.length > 0) setSelectedTeamId(Number(teams[0].id))
        }} style={selectStyle}>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.icon || ''} {d.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textSub }}>チーム</span>
        <select value={selectedTeamId || ''} onChange={(e) => setSelectedTeamId(Number(e.target.value))} style={selectStyle}>
          {teamsInSelectedDept.length === 0 && <option value="">(チームなし)</option>}
          {teamsInSelectedDept.map(t => (
            <option key={t.id} value={t.id}>{t.icon || ''} {t.name}</option>
          ))}
        </select>
        {managerName && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: T.sectionBg, color: T.textSub,
          }}>📌 責任者: {managerName}</span>
        )}
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button onClick={generateAI} disabled={aiBusy || rowLoading || !selectedTeamId}
            title="チーム内のKR/KA週次レビューを集約してAIで自動生成"
            style={{
              padding: '5px 12px', borderRadius: 7,
              background: aiBusy ? T.border : '#34c759', color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 800, fontFamily: 'inherit',
              cursor: aiBusy || rowLoading ? 'wait' : 'pointer',
            }}>
            {aiBusy ? '⟳ 生成中…' : '🤖 AIで生成'}
          </button>
        )}
        <span style={{ fontSize: 10 }}>
          {saving && <span style={{ color: T.textMuted }}>⟳ 保存中…</span>}
          {saved && !saving && <span style={{ color: T.success, fontWeight: 800 }}>✓ 保存済</span>}
        </span>
      </div>

      {aiError && (
        <div style={{
          marginBottom: 10, padding: '6px 10px', borderRadius: 6,
          background: `${T.danger}15`, color: T.danger,
          fontSize: 11, fontWeight: 700,
        }}>⚠️ {aiError}</div>
      )}

      {!canEdit && (
        <div style={{
          marginBottom: 10, padding: '6px 10px', borderRadius: 6,
          background: T.sectionBg, color: T.textMuted,
          fontSize: 10, fontStyle: 'italic',
        }}>
          閲覧モード ({managerName ? `編集は ${managerName} さん (チーム責任者) または管理者のみ` : 'チーム責任者または管理者のみ編集可能'})
        </div>
      )}

      {/* 3カラム */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <div style={cellStyle(T.success)}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.success }}>✅ Good — チーム全体の良かったこと</div>
          <textarea value={good} disabled={!canEdit || rowLoading}
            onChange={e => { setGood(e.target.value); scheduleSave(e.target.value, more, focus) }}
            onFocus={() => focusedRef.current = 'good'} onBlur={() => focusedRef.current = null}
            placeholder="例: 評議会クロージング3社決定 / 新メンバー受け入れがスムーズだった"
            style={inputBase} />
        </div>
        <div style={cellStyle(T.warn)}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.warn }}>⚠️ More — チーム全体の課題・改善点</div>
          <textarea value={more} disabled={!canEdit || rowLoading}
            onChange={e => { setMore(e.target.value); scheduleSave(good, e.target.value, focus) }}
            onFocus={() => focusedRef.current = 'more'} onBlur={() => focusedRef.current = null}
            placeholder="例: 商談化率が伸び悩み / オンボーディングの遅延"
            style={inputBase} />
        </div>
        <div style={cellStyle(T.accent)}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.accent }}>🎯 Focus — 来週のチーム注力</div>
          <textarea value={focus} disabled={!canEdit || rowLoading}
            onChange={e => { setFocus(e.target.value); scheduleSave(good, more, e.target.value) }}
            onFocus={() => focusedRef.current = 'focus'} onBlur={() => focusedRef.current = null}
            placeholder="例: 火曜の評議会で残2社クロージング / 木曜にKPI再設計"
            style={inputBase} />
        </div>
      </div>
    </div>
  )
}

// ─── マイルストーン / KR ピンチ ─────────────────────────────────
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
        <div style={{ padding: 12, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>進行中のマイルストーンはありません</div>
      ) : milestones.map(ms => {
        const days = ms.due_date ? Math.round((new Date(ms.due_date) - new Date(todayJSTStr())) / 86400000) : null
        const overdue = days !== null && days < 0
        const urgent = days !== null && days >= 0 && days <= 7
        return (
          <div key={ms.id} style={{
            padding: '8px 10px', borderRadius: 8,
            background: T.sectionBg,
            border: `1px solid ${overdue ? T.danger + '50' : urgent ? T.warn + '50' : T.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {ms.focus_level === 'focus' && <span style={{ fontSize: 11 }}>⭐</span>}
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ms.title}</span>
              {ms.due_date && (
                <span style={{ fontSize: 10, fontWeight: 700, color: overdue ? T.danger : urgent ? T.warn : T.textMuted }}>
                  {fmtMonthDay(ms.due_date)} {overdue ? `(${Math.abs(days)}日超過)` : days === 0 ? '(今日)' : `(あと${days}日)`}
                </span>
              )}
            </div>
            {ms.owner && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>担当: {ms.owner}</div>}
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
        <div style={{ padding: 12, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>ピンチの KR はありません ✨</div>
      ) : pinch.map(kr => {
        const pctColor = kr.pct < 50 ? T.danger : kr.pct < 80 ? T.warn : T.success
        return (
          <div key={kr.id} style={{ padding: '8px 10px', borderRadius: 8, background: T.sectionBg, border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kr.title}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: pctColor }}>{Math.round(kr.pct)}%</span>
            </div>
            <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
              <div style={{ width: `${Math.min(100, kr.pct)}%`, height: '100%', background: pctColor }} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: T.textMuted, marginTop: 4 }}>
              <span>担当: {kr.owner}</span>
              <span>・ {kr.current}/{kr.target} {kr.unit}</span>
              {kr.hasMore && (
                <span style={{ marginLeft: 'auto', padding: '1px 6px', borderRadius: 4, background: T.warn + '20', color: T.warn, fontWeight: 700, fontSize: 9 }}>課題あり</span>
              )}
            </div>
            {kr.hasMore && kr.moreText && (
              <div style={{ fontSize: 10, color: T.textSub, lineHeight: 1.4, fontStyle: 'italic', marginTop: 4 }}>
                "{kr.moreText.slice(0, 100)}{kr.moreText.length > 100 ? '…' : ''}"
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
