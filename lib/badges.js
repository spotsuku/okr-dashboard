import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────
// バッジ集計の共有ロジック。
// 個人ページ (MyPageShell) のバッジコレクションと、全社ダッシュボード
// (CompanyDashboardSummary) の「業務遂行王」ランキングで共通利用する。
//
// バッジは「月毎」に実績データから集計する (取得日時の永続化はしていない)。
// month = 'YYYY-MM' 指定時はその月、未指定時は当月 (JST)。
// ─────────────────────────────────────────────────────────────

// 全 7 バッジ。1人なら fetchBadgeStats、全メンバーなら fetchAllMembersBadgeRates。
export const BADGE_TOTAL = 7

// 'YYYY-MM' or null → { y, m(0-index), monthStart, monthEnd }
function resolveMonth(month) {
  let y, m
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    y = Number(month.slice(0, 4)); m = Number(month.slice(5, 7)) - 1
  } else {
    const jst = new Date(Date.now() + 9 * 3600 * 1000)
    y = jst.getUTCFullYear(); m = jst.getUTCMonth()
  }
  const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0]
  return { y, m, monthStart, monthEnd }
}

function weeksInMonthOf(monthStart, monthEnd) {
  return Math.ceil((new Date(monthEnd).getTime() - new Date(monthStart).getTime()) / (7 * 86400000)) + 1
}

// 当月から過去 count ヶ月の月候補 [{ value:'YYYY-MM', label:'YYYY年M月（今月）?' }]
export function badgeMonthOptions(count = 12) {
  const jst = new Date(Date.now() + 9 * 3600 * 1000)
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() - i, 1))
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${i === 0 ? '（今月）' : ''}`
    out.push({ value, label })
  }
  return out
}

// 1 メンバーのバッジ一覧 (バッジコレクション表示用)
export async function fetchBadgeStats(viewingName, month = null) {
  if (!viewingName) return []
  const { monthStart, monthEnd } = resolveMonth(month)

  const [tasksRes, krRes, krReviewsRes, kasRes, logsRes, chatsRes, googleRes] = await Promise.all([
    supabase.from('ka_tasks').select('id, done, due_date')
      .eq('assignee', viewingName)
      .gte('due_date', monthStart).lte('due_date', monthEnd),
    supabase.from('key_results').select('id').eq('owner', viewingName).is('archived_at', null).limit(200),
    supabase.from('kr_weekly_reviews').select('kr_id, good, more, focus, focus_output, week_start')
      .gte('week_start', monthStart).lte('week_start', monthEnd),
    supabase.from('weekly_reports').select('id, owner, good, more, focus_output, week_start')
      .eq('owner', viewingName).gte('week_start', monthStart).lte('week_start', monthEnd),
    supabase.from('coaching_logs').select('id, log_type, created_at')
      .eq('owner', viewingName).gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
    supabase.from('coaching_chats').select('id, role, created_at')
      .eq('owner', viewingName).eq('role', 'user').eq('kind', 'mycoach')
      .gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
    supabase.from('user_integrations').select('refresh_token').eq('owner', viewingName).eq('service', 'google').limit(1),
  ])

  const tasks = tasksRes.data || []
  const taskRate = tasks.length > 0 ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0
  const krIds = new Set((krRes.data || []).map(k => k.id))
  const monthlyKrReviews = (krReviewsRes.data || []).filter(r => krIds.has(r.kr_id) &&
    ((r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim() || (r.focus_output || '').trim()))
  const weeksInMonth = weeksInMonthOf(monthStart, monthEnd)
  const krExpected = Math.max(krIds.size * weeksInMonth, 1)
  const krRate = Math.round((monthlyKrReviews.length / krExpected) * 100)
  const kas = kasRes.data || []
  const kaWritten = kas.filter(k => (k.good || '').trim() || (k.more || '').trim() || (k.focus_output || '').trim())
  const kaRate = kas.length > 0 ? Math.round((kaWritten.length / kas.length) * 100) : 0
  const logs = logsRes.data || []
  const workDays = new Set(logs.filter(l => l.log_type === 'work_log')
    .map(l => l.created_at?.split('T')[0])).size
  const kptDays = new Set(logs.filter(l => l.log_type === 'kpt')
    .map(l => l.created_at?.split('T')[0])).size
  const mycooCount = (chatsRes.data || []).length
  const googleConnected = !!(googleRes.data?.[0]?.refresh_token)

  return [
    { key: 'tasks', label: 'タスク完了率', value: `${taskRate}%`, achieved: taskRate >= 80, progress: Math.min(100, taskRate), iconName: 'check', desc: '完了率 80% 以上', target: '80%' },
    { key: 'kr',    label: 'KR記入率',     value: `${krRate}%`, achieved: krRate >= 80, progress: Math.min(100, krRate), iconName: 'target', desc: 'KR の週次レビューが 80% 以上', target: '80%' },
    { key: 'ka',    label: 'KA記入率',     value: `${kaRate}%`, achieved: kaRate >= 80, progress: Math.min(100, kaRate), iconName: 'workspace', desc: 'KA の週次記入が 80% 以上', target: '80%' },
    { key: 'login', label: 'ログイン皆勤', value: `${workDays}日`, achieved: workDays >= 22, progress: Math.min(100, Math.round(workDays / 22 * 100)), iconName: 'morning', desc: '月 22 日以上ログイン', target: '22日' },
    { key: 'kpt',   label: '振り返り皆勤', value: `${kptDays}日`, achieved: kptDays >= 22, progress: Math.min(100, Math.round(kptDays / 22 * 100)), iconName: 'refresh', desc: '月 22 日以上の振り返り記入', target: '22日' },
    { key: 'mycoo', label: 'MyCOO 達人',   value: `${mycooCount}回`, achieved: mycooCount >= 5, progress: Math.min(100, Math.round(mycooCount / 5 * 100)), iconName: 'ai', desc: 'MyCOO に月 5 回以上相談', target: '5回' },
    { key: 'google',label: 'Google 連携',  value: googleConnected ? '完了' : '未連携', achieved: googleConnected, progress: googleConnected ? 100 : 0, iconName: 'link', desc: 'Google アカウントを連携済', target: '連携' },
  ]
}

// 複数メンバーのバッジ達成数を一括集計 (ランキング「業務遂行王」用)。
// fetchBadgeStats と同じ判定基準を、メンバー単位ではなく一括クエリで算出する
// (N+1 を避けるため)。返り値: [{ name, achieved, total, rate }] (未ソート)
export async function fetchAllMembersBadgeRates(memberNames, month = null) {
  const names = Array.from(new Set((memberNames || []).filter(Boolean)))
  if (names.length === 0) return []
  const { monthStart, monthEnd } = resolveMonth(month)
  const weeksInMonth = weeksInMonthOf(monthStart, monthEnd)

  const [tasksRes, krRes, krRevRes, kaRes, logsRes, chatsRes, googleRes] = await Promise.all([
    supabase.from('ka_tasks').select('assignee, done, due_date')
      .in('assignee', names).gte('due_date', monthStart).lte('due_date', monthEnd),
    supabase.from('key_results').select('id, owner').in('owner', names).is('archived_at', null),
    supabase.from('kr_weekly_reviews').select('kr_id, good, more, focus, focus_output, week_start')
      .gte('week_start', monthStart).lte('week_start', monthEnd),
    supabase.from('weekly_reports').select('owner, good, more, focus_output, week_start')
      .in('owner', names).gte('week_start', monthStart).lte('week_start', monthEnd),
    supabase.from('coaching_logs').select('owner, log_type, created_at')
      .in('owner', names).in('log_type', ['work_log', 'kpt'])
      .gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
    supabase.from('coaching_chats').select('owner')
      .in('owner', names).eq('role', 'user').eq('kind', 'mycoach')
      .gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
    supabase.from('user_integrations').select('owner, refresh_token').in('owner', names).eq('service', 'google'),
  ])

  // タスク完了率
  const taskAgg = {} // name -> { total, done }
  for (const t of tasksRes.data || []) {
    const a = taskAgg[t.assignee] = taskAgg[t.assignee] || { total: 0, done: 0 }
    a.total++; if (t.done) a.done++
  }
  // KR: owner ごとの KR 数 + 当月レビュー記入数
  const krOwnerById = new Map()
  const krCountByOwner = {}
  for (const k of krRes.data || []) {
    krOwnerById.set(k.id, k.owner)
    krCountByOwner[k.owner] = (krCountByOwner[k.owner] || 0) + 1
  }
  const krWrittenByOwner = {}
  for (const r of krRevRes.data || []) {
    const owner = krOwnerById.get(r.kr_id)
    if (!owner) continue
    if ((r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim() || (r.focus_output || '').trim()) {
      krWrittenByOwner[owner] = (krWrittenByOwner[owner] || 0) + 1
    }
  }
  // KA 記入率
  const kaAgg = {} // name -> { total, written }
  for (const k of kaRes.data || []) {
    const a = kaAgg[k.owner] = kaAgg[k.owner] || { total: 0, written: 0 }
    a.total++
    if ((k.good || '').trim() || (k.more || '').trim() || (k.focus_output || '').trim()) a.written++
  }
  // ログイン / 振り返り 皆勤 (ユニーク日数)
  const workDaysByOwner = {}, kptDaysByOwner = {}
  for (const l of logsRes.data || []) {
    const day = l.created_at?.split('T')[0]
    if (!day) continue
    const bucket = l.log_type === 'work_log' ? workDaysByOwner : l.log_type === 'kpt' ? kptDaysByOwner : null
    if (!bucket) continue
    ;(bucket[l.owner] = bucket[l.owner] || new Set()).add(day)
  }
  // MyCOO 相談回数
  const mycooByOwner = {}
  for (const c of chatsRes.data || []) mycooByOwner[c.owner] = (mycooByOwner[c.owner] || 0) + 1
  // Google 連携
  const googleByOwner = {}
  for (const g of googleRes.data || []) if (g.refresh_token) googleByOwner[g.owner] = true

  return names.map(name => {
    const tk = taskAgg[name] || { total: 0, done: 0 }
    const taskRate = tk.total > 0 ? Math.round((tk.done / tk.total) * 100) : 0
    const krExpected = Math.max((krCountByOwner[name] || 0) * weeksInMonth, 1)
    const krRate = Math.round(((krWrittenByOwner[name] || 0) / krExpected) * 100)
    const ka = kaAgg[name] || { total: 0, written: 0 }
    const kaRate = ka.total > 0 ? Math.round((ka.written / ka.total) * 100) : 0
    const workDays = (workDaysByOwner[name] || new Set()).size
    const kptDays = (kptDaysByOwner[name] || new Set()).size
    const mycoo = mycooByOwner[name] || 0
    const google = !!googleByOwner[name]
    const achieved = [
      taskRate >= 80, krRate >= 80, kaRate >= 80,
      workDays >= 22, kptDays >= 22, mycoo >= 5, google,
    ].filter(Boolean).length
    // 達成率 = 各バッジの進捗率(0-100, 上限100)の平均。fetchBadgeStats の progress と同基準。
    const progresses = [
      Math.min(100, taskRate),
      Math.min(100, krRate),
      Math.min(100, kaRate),
      Math.min(100, Math.round(workDays / 22 * 100)),
      Math.min(100, Math.round(kptDays / 22 * 100)),
      Math.min(100, Math.round(mycoo / 5 * 100)),
      google ? 100 : 0,
    ]
    const avgProgress = Math.round(progresses.reduce((s, p) => s + p, 0) / BADGE_TOTAL)
    return { name, achieved, total: BADGE_TOTAL, rate: avgProgress / 100, avgProgress }
  })
}
