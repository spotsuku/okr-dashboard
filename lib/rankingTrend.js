import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────
// 週間ランキングの「順位推移」用データ。
// 過去 N 週分のランキング (有言実行王 / タスク完了王 / 振り返り王 / 実践王) を
// 週バケットで集計し、週ごとの順位付き配列を返す。
// CompanyDashboardSummary の現週ランキングと同じ指標・しきい値で算出する。
// ─────────────────────────────────────────────────────────────

function getMondayJSTStr(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const day = jst.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + diff))
  return mon.toISOString().slice(0, 10)
}

// 直近の「完了済みの週」を最新として過去 n 週 (古い→新しい)
function lastNWeeks(n) {
  const thisMon = new Date(getMondayJSTStr() + 'T00:00:00.000Z')
  const out = []
  for (let i = n; i >= 1; i--) {
    const mon = new Date(thisMon.getTime() - i * 7 * 86400000)
    const sunEnd = new Date(thisMon.getTime() - (i - 1) * 7 * 86400000 - 1)
    out.push({
      mondayStr: mon.toISOString().slice(0, 10),
      mondayIso: mon.toISOString(),
      sundayEndIso: sunEnd.toISOString(),
      endStr: sunEnd.toISOString().slice(0, 10),
      label: `${mon.getUTCMonth() + 1}/${mon.getUTCDate()}`,
    })
  }
  return out
}

function weekIndexForTs(iso, weeks) {
  if (!iso) return -1
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return -1
  for (let i = 0; i < weeks.length; i++) {
    if (t >= Date.parse(weeks[i].mondayIso) && t <= Date.parse(weeks[i].sundayEndIso)) return i
  }
  return -1
}

function weekIndexForDate(dateStr, weeks) {
  if (!dateStr) return -1
  for (let i = 0; i < weeks.length; i++) {
    if (dateStr >= weeks[i].mondayStr && dateStr <= weeks[i].endStr) return i
  }
  return -1
}

const len = (s) => (s || '').trim().length

export async function fetchRankingTrend({ memberNames, weeks: weekCount = 6 } = {}) {
  const names = new Set((memberNames || []).filter(Boolean))
  const exclude = new Set(['👀 ゲスト'])
  const valid = (name) => name && !exclude.has(name) && names.has(name)
  const weeks = lastNWeeks(weekCount)
  if (weeks.length === 0) return null

  const spanStartIso = weeks[0].mondayIso
  const spanEndIso = weeks[weeks.length - 1].sundayEndIso
  const spanStartDate = weeks[0].mondayStr
  const spanEndDate = weeks[weeks.length - 1].endStr
  const weekStarts = weeks.map(w => w.mondayStr)
  const wsIndex = new Map(weekStarts.map((ws, i) => [ws, i]))

  const [doneRes, dueRes, kptRes, reportsRes, krRevRes, krRes] = await Promise.all([
    supabase.from('ka_tasks').select('assignee, completed_at')
      .gte('completed_at', spanStartIso).lte('completed_at', spanEndIso).eq('done', true).range(0, 9999),
    supabase.from('ka_tasks').select('assignee, due_date, done, status, completed_at')
      .gte('due_date', spanStartDate).lte('due_date', spanEndDate).range(0, 9999),
    supabase.from('coaching_logs').select('owner, content, created_at')
      .eq('log_type', 'kpt').gte('created_at', spanStartIso).lte('created_at', spanEndIso).range(0, 9999),
    supabase.from('weekly_reports').select('owner, good, more, focus_output, week_start')
      .in('week_start', weekStarts).range(0, 9999),
    supabase.from('kr_weekly_reviews').select('kr_id, good, more, focus, week_start')
      .in('week_start', weekStarts).range(0, 9999),
    supabase.from('key_results').select('id, owner').range(0, 9999),
  ])

  const mk = () => weeks.map(() => ({}))
  const taskAgg = mk()      // name -> count
  const promiseAgg = mk()   // name -> { total, overdue }
  const reflAgg = mk()      // name -> chars
  const practiceAgg = mk()  // name -> chars

  // タスク完了王: 週内に完了 (completed_at) した件数
  for (const t of doneRes.data || []) {
    if (!valid(t.assignee)) continue
    const wi = weekIndexForTs(t.completed_at, weeks)
    if (wi < 0) continue
    taskAgg[wi][t.assignee] = (taskAgg[wi][t.assignee] || 0) + 1
  }
  // 有言実行王: その週が期限のタスクの期限内完了率。
  // 期限内完了 = done かつ completed_at が due_date 当日終わり(JST)まで。
  for (const t of dueRes.data || []) {
    if (!valid(t.assignee)) continue
    const wi = weekIndexForDate(t.due_date, weeks)
    if (wi < 0) continue
    const ps = promiseAgg[wi][t.assignee] = promiseAgg[wi][t.assignee] || { total: 0, overdue: 0 }
    ps.total++
    const dueEnd = Date.parse(`${t.due_date}T14:59:59.999Z`) // due 当日 23:59:59 JST = UTC 14:59:59
    const isDone = t.done || t.status === 'done'
    const onTime = isDone && t.completed_at && Date.parse(t.completed_at) <= dueEnd
    if (!onTime) ps.overdue++
  }
  // 振り返り王: 週内 KPT の総文字数
  for (const row of kptRes.data || []) {
    if (!valid(row.owner)) continue
    const wi = weekIndexForTs(row.created_at, weeks)
    if (wi < 0) continue
    let c; try { c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content } catch { c = {} }
    reflAgg[wi][row.owner] = (reflAgg[wi][row.owner] || 0) + len(c?.keep) + len(c?.problem) + len(c?.try)
  }
  // 実践王: 週の OKR 記入 (weekly_reports KA + kr_weekly_reviews KR) の総文字数
  const krOwner = new Map((krRes.data || []).map(k => [k.id, k.owner]))
  for (const row of reportsRes.data || []) {
    if (!valid(row.owner)) continue
    const wi = wsIndex.get(row.week_start); if (wi == null) continue
    practiceAgg[wi][row.owner] = (practiceAgg[wi][row.owner] || 0) + len(row.good) + len(row.more) + len(row.focus_output)
  }
  for (const row of krRevRes.data || []) {
    const owner = krOwner.get(row.kr_id)
    if (!valid(owner)) continue
    const wi = wsIndex.get(row.week_start); if (wi == null) continue
    practiceAgg[wi][owner] = (practiceAgg[wi][owner] || 0) + len(row.good) + len(row.more) + len(row.focus)
  }

  // 週ごとに順位付き配列へ
  const rankTask = taskAgg.map(agg => Object.entries(agg)
    .map(([name, count]) => ({ name, score: count }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score))
  const rankPromise = promiseAgg.map(agg => Object.entries(agg)
    .map(([name, s]) => ({ name, score: 1 - s.overdue / s.total, total: s.total }))
    .filter(e => e.total >= 2)
    .sort((a, b) => b.score - a.score || b.total - a.total))
  const rankRefl = reflAgg.map(agg => Object.entries(agg)
    .map(([name, chars]) => ({ name, score: chars }))
    .filter(e => e.score >= 30)
    .sort((a, b) => b.score - a.score))
  const rankPractice = practiceAgg.map(agg => Object.entries(agg)
    .map(([name, chars]) => ({ name, score: chars }))
    .filter(e => e.score >= 30)
    .sort((a, b) => b.score - a.score))

  return {
    weeks: weeks.map(w => ({ label: w.label, mondayStr: w.mondayStr })),
    categories: { promise: rankPromise, task: rankTask, reflection: rankRefl, practice: rankPractice },
  }
}

// 週ごとの順位配列 + 追跡する名前 → 各名前の週次順位 (未ランクは null)
export function buildRankSeries(weeklyRanks, trackedNames) {
  return (trackedNames || []).map(name => ({
    name,
    ranks: (weeklyRanks || []).map(week => {
      const idx = week.findIndex(e => e.name === name)
      return idx >= 0 ? idx + 1 : null
    }),
  }))
}
