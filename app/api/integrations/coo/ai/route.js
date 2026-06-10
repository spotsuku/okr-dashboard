// ぺろっぺ (MyCOO) AI チャット
// POST /api/integrations/coo/ai
// Body: {
//   owner,             // 対話相手 (ログインユーザー)
//   message,
//   history: [{role, content}],
//   mode: 'coach' | 'speed'  // デフォ: 'coach'
// }
// Response: { text, actions, context_used }

export const dynamic = 'force-dynamic'
// マルチステップの tool-use ループ + Anthropic リトライで処理が長くなるため、
// Vercel のデフォルト関数タイムアウト (約10秒) では応答前に切られて
// クライアントに「Failed to fetch」が出る。実行時間の上限を明示的に延ばす。
export const runtime = 'nodejs'
export const maxDuration = 60

import { getAdminClient, getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

const MODEL = 'claude-sonnet-4-5'
const MAX_STEPS = 6
const DRIVE_CACHE_HOURS = 1   // この時間以内なら cached_text を再利用
const KNOWLEDGE_CHAR_BUDGET = 8000  // 全知識を合計でこの上限まで圧縮

const TOOLS = [
  {
    name: 'get_member_workload',
    description: '指定メンバーの今の作業負荷 (未完了タスク数 / 期限超過数 / 直近活動)。「○○さん忙しい?」等に使う。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'メンバーの日本語氏名' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_member_okr',
    description: '指定メンバーの今期 OKR と KR ごとの今週レビュー状況を取得する。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_recent_kpts',
    description: '指定メンバーの直近の KPT (振り返り) を取得する。最大4週間分。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        weeks: { type: 'number', description: '何週間分か (デフォ: 2)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_team_status',
    description: '全社サマリ (本日の達成率、各メンバーの稼働状況、停滞タスク総数)',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_drive',
    description: 'ネオ福岡共有ドライブ内のファイルを検索する。資料の場所を探す時に使う。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  // ─── カレンダー操作 (旧カレンダーAIから集約) ───
  {
    name: 'list_events',
    description: '指定メンバーの指定期間のカレンダー予定を取得する。空き状況の確認や日程調整の前提に使う。',
    input_schema: {
      type: 'object',
      properties: {
        members: { type: 'array', items: { type: 'string' }, description: 'メンバー名の配列 (日本語氏名)' },
        start_iso: { type: 'string', description: '開始日時 ISO 8601 (JST, 例: 2026-04-22T09:00:00+09:00)' },
        end_iso:   { type: 'string', description: '終了日時 ISO 8601' },
      },
      required: ['members', 'start_iso', 'end_iso'],
    },
  },
  {
    name: 'find_free_slots',
    description: '指定メンバー全員が空いている時間枠を検索する。日程調整で使う。営業時間は 9:00-22:00 JST デフォルト。',
    input_schema: {
      type: 'object',
      properties: {
        members: { type: 'array', items: { type: 'string' } },
        start_iso: { type: 'string' },
        end_iso:   { type: 'string' },
        duration_min: { type: 'number', description: '必要な連続空き時間 (分)' },
        working_hours: { type: 'object', properties: { from: { type: 'number' }, to: { type: 'number' } }, description: '営業時間帯 (例: from:9, to:18) JST。省略時 9-18 (営業時間)。ユーザーが「夜遅くでもOK」「24時間」等と明示した場合のみ広い範囲を指定する。' },
      },
      required: ['members', 'start_iso', 'end_iso', 'duration_min'],
    },
  },
  {
    name: 'create_event',
    description: '対話相手のカレンダーに予定を作成し、指定メンバーを招待する。Google Meet リンクも任意で付与。繰り返し予定も RRULE 配列で指定可能。実行はユーザー承認後に行われる。',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        start_iso: { type: 'string' },
        end_iso:   { type: 'string' },
        attendee_names: { type: 'array', items: { type: 'string' }, description: '招待するメンバー名' },
        description: { type: 'string' },
        add_meet: { type: 'boolean', description: 'Google Meet リンクを自動発行' },
        recurrence: { type: 'array', items: { type: 'string' }, description: "RRULE 配列。例: 毎週金曜 10回は ['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10']、毎月最終木曜は ['RRULE:FREQ=MONTHLY;BYDAY=-1TH']" },
      },
      required: ['summary', 'start_iso', 'end_iso'],
    },
  },
  {
    name: 'update_event',
    description: '既存の予定を更新する (時刻変更や招待追加)。event_id は list_events で取得。実行はユーザー承認後。',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        summary: { type: 'string' },
        start_iso: { type: 'string' },
        end_iso: { type: 'string' },
        attendee_names: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
        recurrence: { type: 'array', items: { type: 'string' }, description: 'RRULE 配列で繰り返しルールを変更' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_event',
    description: '対話相手が作成した予定を削除する。実行はユーザー承認後。',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
      },
      required: ['event_id'],
    },
  },
]

// ─── カレンダー操作ヘルパー (旧 calendar/ai から移植) ───
function resolveEmails(names, members) {
  return (names || []).map(n => {
    const m = (members || []).find(x => x.name === n)
    return m?.email || null
  }).filter(Boolean)
}

async function getEventsForMember(name, startIso, endIso, organizationId) {
  const res = await getIntegration(name, 'google', organizationId)
  if (res.error || !res.integration) return { name, events: [], error: res.error || '未連携' }
  if (res.expired) return { name, events: [], error: 'トークン期限切れ' }
  const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  apiUrl.searchParams.set('timeMin', startIso)
  apiUrl.searchParams.set('timeMax', endIso)
  apiUrl.searchParams.set('singleEvents', 'true')
  apiUrl.searchParams.set('orderBy', 'startTime')
  apiUrl.searchParams.set('maxResults', '100')
  const { response: r } = await callGoogleApiWithRetry(res.integration, async (token) => {
    return fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
  })
  if (!r.ok) return { name, events: [], error: `Calendar API ${r.status}` }
  const data = await r.json()
  return {
    name,
    events: (data.items || []).map(ev => ({
      id: ev.id,
      title: ev.summary || '(無題)',
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      allDay: !!ev.start?.date,
    })),
  }
}

// 空き時間を計算: 指定期間内で、全メンバーの予定が重ならない連続 duration_min 分以上の枠
function computeFreeSlots(memberEvents, startIso, endIso, durationMin, workingHours) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const durMs = durationMin * 60 * 1000
  const busy = []
  for (const m of memberEvents) {
    for (const ev of m.events || []) {
      if (!ev.start || !ev.end || ev.allDay) continue
      const s = new Date(ev.start).getTime()
      const e = new Date(ev.end).getTime()
      if (isNaN(s) || isNaN(e)) continue
      busy.push([Math.max(s, start), Math.min(e, end)])
    }
  }
  busy.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [s, e] of busy) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e)
    } else {
      merged.push([s, e])
    }
  }
  const free = []
  let cursor = start
  for (const [s, e] of merged) {
    if (s > cursor) free.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < end) free.push([cursor, end])
  const fromH = workingHours?.from ?? 9
  const toH = workingHours?.to ?? 18  // 9-18 = 営業時間。21:00-22:00 など深夜帯が選ばれないように。明示的に深夜OKと指定された場合のみ拡大
  const slots = []
  for (const [s, e] of free) {
    let t = new Date(s)
    while (t.getTime() < e) {
      const jst = new Date(t.getTime() + 9 * 3600 * 1000)
      const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate()
      const dayStart = Date.UTC(y, mo, d, fromH - 9, 0, 0)
      const dayEnd   = Date.UTC(y, mo, d, toH   - 9, 0, 0)
      const slotStart = Math.max(t.getTime(), dayStart)
      const slotEnd   = Math.min(e, dayEnd)
      if (slotEnd - slotStart >= durMs) {
        slots.push({
          start_iso: new Date(slotStart).toISOString(),
          end_iso:   new Date(slotEnd).toISOString(),
          duration_min: Math.floor((slotEnd - slotStart) / 60000),
        })
      }
      t = new Date(Date.UTC(y, mo, d + 1, 0 - 9, 0, 0))
    }
  }
  return slots.slice(0, 20)
}

// ─── 知識ベース読み込み (text + drive_file キャッシュ) ───────────────────────
async function loadKnowledge(supabase, orgId) {
  const { data } = await supabase
    .from('coo_knowledge')
    .select('*')
    .eq('enabled', true)
    .eq('organization_id', orgId)
    .order('priority', { ascending: false })
    .order('id', { ascending: true })
  const items = data || []

  // 文字数バジェット内に収める
  const blocks = []
  let remaining = KNOWLEDGE_CHAR_BUDGET
  for (const e of items) {
    let body = ''
    if (e.kind === 'text') {
      body = e.content || ''
    } else if (e.kind === 'drive_file') {
      // キャッシュが新しければ使う、古いまたはエラーなら note のみ
      if (e.drive_cached_text) {
        body = `(Drive: ${e.title})\n${e.drive_cached_text}`
      } else if (e.drive_cache_error) {
        body = `(Drive取得エラー: ${e.drive_cache_error})`
      } else {
        body = `(Drive ファイル: ${e.drive_file_id} 未取得)`
      }
    }
    if (!body) continue
    const block = `### ${e.title}\n${body}`
    if (block.length > remaining) {
      blocks.push(block.slice(0, remaining) + '\n...(切り詰め)')
      break
    }
    blocks.push(block)
    remaining -= block.length
  }
  return blocks.join('\n\n')
}

// ─── 今日の Google Calendar 予定を取得 (本日中の残予定) ───
async function fetchTodayCalendar(owner, orgId) {
  try {
    const igRes = await getIntegration(owner, 'google', orgId)
    if (igRes.error || !igRes.integration || igRes.expired) return []
    const integration = igRes.integration

    // 「今〜本日23:59 (JST)」の予定を取得
    const now = new Date()
    const jstOffset = 9 * 3600 * 1000
    const jstNow = new Date(now.getTime() + jstOffset)
    const endOfTodayJst = new Date(Date.UTC(
      jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(),
      23, 59, 59
    ))
    const endOfTodayUtc = new Date(endOfTodayJst.getTime() - jstOffset)

    const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    apiUrl.searchParams.set('timeMin', now.toISOString())
    apiUrl.searchParams.set('timeMax', endOfTodayUtc.toISOString())
    apiUrl.searchParams.set('singleEvents', 'true')
    apiUrl.searchParams.set('orderBy', 'startTime')
    apiUrl.searchParams.set('maxResults', '20')

    const { response: r } = await callGoogleApiWithRetry(integration, async (token) => {
      return fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
    })
    if (!r.ok) return []
    const data = await r.json()
    return (data.items || []).map(ev => {
      const startIso = ev.start?.dateTime || ev.start?.date
      const endIso = ev.end?.dateTime || ev.end?.date
      const allDay = startIso && startIso.length <= 10
      return {
        title: ev.summary || '(無題)',
        start: startIso, end: endIso, allDay,
        attendees: (ev.attendees || []).length,
      }
    })
  } catch {
    return []
  }
}

// HH:mm (JST) フォーマット
function fmtTime(iso) {
  if (!iso) return ''
  if (iso.length <= 10) return '終日'
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const h = String(jst.getUTCHours()).padStart(2, '0')
  const m = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// ─── ユーザーの「いま」のコンテキスト取得 ───────────────────────────────
async function loadUserContext(supabase, owner, orgId) {
  const today = new Date().toISOString().slice(0, 10)
  const monday = (() => {
    const j = new Date(Date.now() + 9 * 3600 * 1000)
    const day = j.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const m = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + diff))
    return m.toISOString().slice(0, 10)
  })()

  // 並行取得 (Google Calendar も含む)
  const [memberRes, krsRes, krReviewsRes, tasksRes, kptsRes, workLogRes, calendarEvents] = await Promise.all([
    supabase.from('members').select('name, role, is_admin').eq('name', owner).eq('organization_id', orgId).limit(1),
    supabase.from('key_results').select('id, title, owner').eq('owner', owner).eq('organization_id', orgId),
    supabase.from('kr_weekly_reviews').select('*').eq('week_start', monday).eq('organization_id', orgId),
    supabase.from('ka_tasks').select('id, title, due_date, done, status').eq('assignee', owner).eq('organization_id', orgId).neq('status', 'done').order('due_date'),
    supabase.from('coaching_logs').select('content, created_at').eq('owner', owner).eq('organization_id', orgId).eq('log_type', 'kpt').order('created_at', { ascending: false }).limit(3),
    supabase.from('coaching_logs').select('content').eq('owner', owner).eq('organization_id', orgId).eq('log_type', 'work_log').gte('created_at', new Date(Date.now() - 18 * 3600 * 1000).toISOString()).order('created_at', { ascending: false }).limit(1),
    fetchTodayCalendar(owner, orgId),
  ])

  const member = memberRes.data?.[0]
  const krs = krsRes.data || []
  const krReviewsMap = Object.fromEntries((krReviewsRes.data || []).map(r => [r.kr_id, r]))
  const tasks = (tasksRes.data || [])
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today)
  const todayTasks = tasks.filter(t => t.due_date === today)

  const kpts = (kptsRes.data || []).map(r => {
    let c
    try { c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content } catch { c = {} }
    return { date: r.created_at?.slice(0, 10), keep: c.keep, problem: c.problem, try: c.try }
  })

  // ISO 文字列を JST の HH:MM に変換 (UTC のまま表示すると 9h ズレるため)
  const toJstTime = (iso) => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      const jst = new Date(d.getTime() + 9 * 3600 * 1000)
      return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
    } catch { return '' }
  }
  let workLogStatus = '未始業'
  if (workLogRes.data?.[0]) {
    let c
    try { c = typeof workLogRes.data[0].content === 'string' ? JSON.parse(workLogRes.data[0].content) : workLogRes.data[0].content } catch { c = {} }
    if (c.end_at) workLogStatus = `本日終業済み (${toJstTime(c.start_at)} 〜 ${toJstTime(c.end_at)})`
    else if (c.start_at) workLogStatus = `稼働中 (${toJstTime(c.start_at)} 〜)`
  }

  // テキスト化
  const lines = []
  lines.push(`### ${owner} さんのプロフィール`)
  lines.push(`- 役職: ${member?.role || '(未登録)'}`)
  lines.push(`- 本日のステータス: ${workLogStatus}`)

  // 今日の予定 (Google Calendar)
  const events = calendarEvents || []
  if (events.length > 0) {
    lines.push(`\n### ${owner} さんの本日の残り予定 (Google Calendar)`)
    let busyMinutes = 0
    for (const ev of events) {
      const startStr = fmtTime(ev.start)
      const endStr = fmtTime(ev.end)
      const range = ev.allDay ? '終日' : `${startStr}〜${endStr}`
      const att = ev.attendees > 1 ? ` 参加者${ev.attendees}名` : ''
      lines.push(`- ${range}: ${ev.title}${att}`)
      // 拘束時間ざっくり計算 (allDay は除く)
      if (!ev.allDay && ev.start && ev.end) {
        try {
          const dur = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000
          if (dur > 0 && dur < 24 * 60) busyMinutes += dur
        } catch { /* noop */ }
      }
    }
    if (busyMinutes > 0) {
      lines.push(`- 拘束時間合計: 約 ${Math.round(busyMinutes)} 分 (≒${(busyMinutes / 60).toFixed(1)}時間)`)
    }
  } else {
    lines.push(`\n### ${owner} さんの本日の残り予定\n(Google Calendar 未連携 or 今後の予定なし)`)
  }

  if (krs.length > 0) {
    lines.push(`\n### ${owner} さんの今期 OKR / KR と今週レビュー`)
    for (const kr of krs) {
      const r = krReviewsMap[kr.id]
      const filled = r ? !!((r.good||'').trim() || (r.more||'').trim() || (r.focus||'').trim() || (r.focus_output||'').trim()) : false
      lines.push(`- ${kr.title}${filled ? ' (今週レビュー記入済)' : ' (⚠ 今週レビュー未記入)'}`)
    }
  } else {
    lines.push(`\n### OKR\n(未登録)`)
  }

  lines.push(`\n### ${owner} さんのタスク`)
  lines.push(`- 未完了 ${tasks.length}件 (うち期限超過 ${overdueTasks.length}件 / 本日期限 ${todayTasks.length}件)`)
  if (overdueTasks.length > 0) {
    lines.push(`- 停滞中:`)
    for (const t of overdueTasks.slice(0, 5)) lines.push(`  - ${t.title} (期限 ${t.due_date})`)
  }
  if (todayTasks.length > 0) {
    lines.push(`- 本日期限:`)
    for (const t of todayTasks.slice(0, 5)) lines.push(`  - ${t.title}`)
  }

  if (kpts.length > 0) {
    lines.push(`\n### 直近の KPT`)
    for (const k of kpts) {
      const parts = []
      if (k.keep) parts.push(`Keep:${k.keep.slice(0,80)}`)
      if (k.problem) parts.push(`Problem:${k.problem.slice(0,80)}`)
      if (k.try) parts.push(`Try:${k.try.slice(0,80)}`)
      if (parts.length > 0) lines.push(`- ${k.date}: ${parts.join(' / ')}`)
    }
  }

  return { text: lines.join('\n'), member }
}

// ─── ツール実行 ───────────────────────────────────────────────────
async function execTool(supabase, owner, name, input, ctx = {}) {
  try {
    if (name === 'get_member_workload') {
      const target = input.name
      const { data } = await supabase.from('ka_tasks')
        .select('id, title, due_date, done, status')
        .eq('assignee', target).eq('organization_id', ctx.orgId).neq('status', 'done')
        .order('due_date')
      const tasks = data || []
      const today = new Date().toISOString().slice(0, 10)
      const overdue = tasks.filter(t => t.due_date && t.due_date < today)
      // 直近の workLog
      const { data: wl } = await supabase.from('coaching_logs')
        .select('content, created_at')
        .eq('owner', target).eq('organization_id', ctx.orgId).eq('log_type', 'work_log')
        .order('created_at', { ascending: false }).limit(1)
      let workStatus = '未始業'
      if (wl?.[0]) {
        let c
        try { c = typeof wl[0].content === 'string' ? JSON.parse(wl[0].content) : wl[0].content } catch { c = {} }
        // 時刻は JST 表示 (start_at は ISO 文字列で保存されている)
        const toJst = (iso) => {
          if (!iso) return ''
          try {
            const d = new Date(iso)
            const jst = new Date(d.getTime() + 9 * 3600 * 1000)
            return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
          } catch { return '' }
        }
        if (c.end_at) workStatus = `終業済み (${wl[0].created_at?.slice(0,10)})`
        else if (c.start_at) workStatus = `稼働中 (始業 ${toJst(c.start_at)})`
      }
      return {
        ok: true, member: target,
        active_tasks: tasks.length,
        overdue_tasks: overdue.length,
        recent_work_status: workStatus,
        sample_overdue_titles: overdue.slice(0, 5).map(t => t.title),
      }
    }
    if (name === 'get_member_okr') {
      const target = input.name
      const monday = (() => {
        const j = new Date(Date.now() + 9 * 3600 * 1000)
        const day = j.getUTCDay()
        const diff = day === 0 ? -6 : 1 - day
        const m = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + diff))
        return m.toISOString().slice(0, 10)
      })()
      const { data: krs } = await supabase.from('key_results')
        .select('id, title, owner').eq('owner', target).eq('organization_id', ctx.orgId)
      const { data: reviews } = await supabase.from('kr_weekly_reviews')
        .select('*').eq('week_start', monday).eq('organization_id', ctx.orgId)
      const reviewsMap = Object.fromEntries((reviews || []).map(r => [r.kr_id, r]))
      return {
        ok: true, member: target,
        krs: (krs || []).map(kr => {
          const r = reviewsMap[kr.id]
          return {
            title: kr.title,
            this_week_review: r ? {
              good: r.good || '', more: r.more || '',
              focus: r.focus || '', focus_output: r.focus_output || '',
            } : null,
          }
        }),
      }
    }
    if (name === 'get_recent_kpts') {
      const target = input.name
      const weeks = input.weeks || 2
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString()
      const { data } = await supabase.from('coaching_logs')
        .select('content, created_at')
        .eq('owner', target).eq('organization_id', ctx.orgId).eq('log_type', 'kpt')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20)
      const items = (data || []).map(r => {
        let c
        try { c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content } catch { c = {} }
        return { date: r.created_at?.slice(0, 10), keep: c.keep, problem: c.problem, try: c.try }
      })
      return { ok: true, member: target, items }
    }
    if (name === 'get_team_status') {
      const today = new Date().toISOString().slice(0, 10)
      const { data: tasks } = await supabase.from('ka_tasks')
        .select('id, assignee, due_date, done, status')
        .eq('due_date', today).eq('organization_id', ctx.orgId)
      const arr = tasks || []
      const done = arr.filter(t => t.done || t.status === 'done').length
      const byMember = {}
      for (const t of arr) {
        if (!t.assignee) continue
        if (!byMember[t.assignee]) byMember[t.assignee] = { done: 0, total: 0 }
        byMember[t.assignee].total++
        if (t.done || t.status === 'done') byMember[t.assignee].done++
      }
      return {
        ok: true, today,
        total_tasks: arr.length, done_tasks: done,
        completion_pct: arr.length > 0 ? Math.round((done / arr.length) * 100) : 0,
        by_member: byMember,
      }
    }
    if (name === 'search_drive') {
      const driveId = process.env.NEO_FUKUOKA_DRIVE_ID
      if (!driveId) return { ok: false, error: 'NEO_FUKUOKA_DRIVE_ID 未設定' }
      const igRes = await getIntegration(owner, 'google', ctx.orgId)
      if (igRes.error || !igRes.integration) return { ok: false, error: igRes.error || 'Google 未連携' }
      if (igRes.expired) return { ok: false, error: 'Google トークン期限切れ' }
      const integration = igRes.integration
      const escaped = (input.query || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const q = `(name contains '${escaped}' or fullText contains '${escaped}') and trashed = false`
      const url = new URL('https://www.googleapis.com/drive/v3/files')
      url.searchParams.set('q', q)
      url.searchParams.set('corpora', 'drive')
      url.searchParams.set('driveId', driveId)
      url.searchParams.set('includeItemsFromAllDrives', 'true')
      url.searchParams.set('supportsAllDrives', 'true')
      url.searchParams.set('orderBy', 'modifiedTime desc')
      url.searchParams.set('pageSize', '8')
      url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))')
      const { response: r } = await callGoogleApiWithRetry(integration, async (token) => {
        return fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      })
      if (!r.ok) return { ok: false, error: `Drive API ${r.status}` }
      const data = await r.json()
      return {
        ok: true, files: (data.files || []).map(f => ({
          id: f.id, name: f.name, mimeType: f.mimeType,
          modifiedTime: f.modifiedTime, webViewLink: f.webViewLink,
          owner: f.owners?.[0]?.displayName || '',
        })),
      }
    }
    // ─── カレンダー操作 ───
    if (name === 'list_events') {
      const results = await Promise.all((input.members || []).map(n =>
        getEventsForMember(n, input.start_iso, input.end_iso, ctx.orgId)
      ))
      return { ok: true, results }
    }
    if (name === 'find_free_slots') {
      const memberEvents = await Promise.all((input.members || []).map(n =>
        getEventsForMember(n, input.start_iso, input.end_iso, ctx.orgId)
      ))
      const slots = computeFreeSlots(memberEvents, input.start_iso, input.end_iso, input.duration_min, input.working_hours)
      return { ok: true, slots, memberStatuses: memberEvents.map(m => ({ name: m.name, error: m.error, eventCount: m.events.length })) }
    }
    // mutate 系 (create/update/delete) は即実行せず「提案」を返す。
    // UI 側で確認ダイアログを出し、ユーザー承認後に /api/integrations/calendar/event を叩く。
    if (name === 'create_event') {
      const emails = resolveEmails(input.attendee_names, ctx.members)
      const unresolved = (input.attendee_names || []).filter(n =>
        !(ctx.members || []).find(x => x.name === n)
      )
      const summary = /^\s*\[仮\]/.test(input.summary || '') ? input.summary : `[仮] ${input.summary || ''}`.trim()
      return {
        ok: true,
        proposal: 'create',
        plan: {
          summary,
          description: input.description || '',
          start_iso: input.start_iso,
          end_iso: input.end_iso,
          attendee_names: input.attendee_names || [],
          attendee_emails: emails,
          unresolved_names: unresolved,
          add_meet: !!input.add_meet,
          recurrence: input.recurrence || [],
        },
      }
    }
    if (name === 'update_event') {
      const emails = input.attendee_names ? resolveEmails(input.attendee_names, ctx.members) : undefined
      return {
        ok: true,
        proposal: 'update',
        plan: {
          event_id: input.event_id,
          summary: input.summary,
          description: input.description,
          start_iso: input.start_iso,
          end_iso: input.end_iso,
          attendee_names: input.attendee_names,
          attendee_emails: emails,
          recurrence: input.recurrence,
        },
      }
    }
    if (name === 'delete_event') {
      return { ok: true, proposal: 'delete', plan: { event_id: input.event_id } }
    }
    return { ok: false, error: `unknown tool: ${name}` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function POST(request) {
  try { return await handle(request) } catch (e) {
    return json({ error: `coo/ai 内部エラー: ${e?.message || e}` }, { status: 500 })
  }
}

async function handle(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, message, history = [], mode = 'coach', organization_id } = body || {}
  if (!owner || !message) return json({ error: 'owner / message が必要です' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY が未設定です' }, { status: 500 })

  const supabase = getAdminClient()

  // service role は RLS をバイパスするため、組織スコープはアプリ側で必須。
  // organization_id はクライアントから受け取る。未指定なら owner の所属から解決 (フォールバック)。
  let orgId = organization_id
  if (!orgId) {
    const { data: om } = await supabase.from('members').select('organization_id').eq('name', owner).limit(1)
    orgId = om?.[0]?.organization_id
  }
  if (!orgId) return json({ error: 'organization_id を解決できませんでした' }, { status: 400 })

  // 知識ベース + ユーザーコンテキストを並行取得 (組織スコープ)
  const [knowledgeText, userCtx] = await Promise.all([
    loadKnowledge(supabase, orgId),
    loadUserContext(supabase, owner, orgId),
  ])

  // 全メンバーの簡易リスト (AI が他人を呼び出す時の参照 / カレンダー招待のメール解決) — 組織スコープ
  const { data: allMembers } = await supabase.from('members')
    .select('name, role, email').eq('organization_id', orgId).order('sort_order', { ascending: true })
  const memberList = (allMembers || []).map(m => `- ${m.name}${m.role ? ` (${m.role})` : ''}`).join('\n')
  const membersWithEmail = (allMembers || []).map(m => ({ name: m.name, email: m.email }))

  // 日付・曜日参照表 (JST、確定値) — LLM の曜日推論誤りを防ぐためカレンダー操作向けに注入
  const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']
  const refBase = new Date(Date.now() + 9 * 3600 * 1000)
  const dateRefLines = []
  for (let i = 0; i < 21; i++) {
    const dt = new Date(Date.UTC(refBase.getUTCFullYear(), refBase.getUTCMonth(), refBase.getUTCDate() + i))
    const y = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    const label = i === 0 ? ' ← 今日' : i === 1 ? ' ← 明日' : ''
    dateRefLines.push(`- ${y}-${mm}-${dd}(${DOW_JA[dt.getUTCDay()]})${label}`)
  }
  const dateRefStr = dateRefLines.join('\n')

  const isSelfChat = owner === '三木智弘'  // 三木CEO本人かどうか

  // 現在時刻を JST で AI に渡す (UTC のままだと 9 時間ズレた回答になる)
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
  const Y = nowJst.getUTCFullYear()
  const M = String(nowJst.getUTCMonth() + 1).padStart(2, '0')
  const D = String(nowJst.getUTCDate()).padStart(2, '0')
  const h = String(nowJst.getUTCHours()).padStart(2, '0')
  const min = String(nowJst.getUTCMinutes()).padStart(2, '0')
  const dayName = ['日', '月', '火', '水', '木', '金', '土'][nowJst.getUTCDay()]
  const todayJst = `${Y}-${M}-${D}(${dayName}) ${h}:${min} JST`

  // 今週 (月曜始まり〜日曜終わり) と今週末 (土・日) を JST 確定値で算出。
  // 「今週」「今週末」の境界を明示しないと LLM が週末の日付を誤って推論するため。
  const baseY = nowJst.getUTCFullYear(), baseMo = nowJst.getUTCMonth(), baseD = nowJst.getUTCDate()
  const dow = nowJst.getUTCDay() // 0=日..6=土
  const toMonday = dow === 0 ? -6 : 1 - dow
  const mkJ = (offset) => new Date(Date.UTC(baseY, baseMo, baseD + offset))
  const fmtJ = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}(${DOW_JA[dt.getUTCDay()]})`
  const weekMonday = mkJ(toMonday)
  const weekSat = mkJ(toMonday + 5)
  const weekSun = mkJ(toMonday + 6)
  const weekRangeStr = `${fmtJ(weekMonday)} 〜 ${fmtJ(weekSun)}`
  const weekendStr = `${fmtJ(weekSat)}〜${fmtJ(weekSun)}`

  const coachInstruction = mode === 'speed'
    ? `今は ⚡ スピードモード です。問いを返さず、直接的な助言や情報を簡潔に提供してください。それでも一般論ではなく必ず NEO 文脈に接続してください。`
    : `今は 🎯 コーチモード です。即答せず、まず 2〜3 個の問いで状況を深掘りしてください (GROW モデル: Goal/Reality/Options/Will)。本人が「今すぐ答え欲しい」「時間ない」と言えばスピードモードに切替えて短く答えてください。`

  const systemPrompt = `あなたは「ぺろっぺ」🐸 — NEO福岡の代表・三木智弘 CEO の右腕として振る舞う AI コーチです。

## 自己認識
- 三木 CEO の経営哲学・思考パターンを学習し、その代行者としてメンバーをコーチングします
- 今話しているのは ${owner} さん${isSelfChat ? '（三木CEO本人）' : ''}
- ${isSelfChat
    ? '本人との対話なので、外在化された自問自答のパートナーとして率直に振る舞ってください'
    : '三木 CEO の思考を代行する立場で接してください。「三木CEOならこう考える」という視点を大切に'}

## 行動原則
1. 即答せず深掘り (コーチモード時)
2. 一般論を禁止 — 必ずNEOの文脈 (具体的なOKR/メンバー名/案件) に接続する
3. 答えを"与える"より、本人の中にある答えを"引き出す"問いを優先
4. 必要なら tool use で正確なデータを取得してから回答する (推測しない)
5. 簡潔に、フラットな口調で。ですます調。絵文字は最小限
6. 「あなた」と呼ばずに「${owner}さん」と呼ぶ
7. ${coachInstruction}
8. **本日の予定 (Google Calendar) を必ず加味する** — 「本日の残り予定」セクションがあれば、それを前提に回答を組み立てる。例: 「14:00〜15:00 に経営会議があるので、その前の30分で〜できますか?」のように、空き時間と拘束時間を意識した提案・問いをする。会議の合間に物理的に入らない量のタスクを提案しない

## 現在の状況
- 日時: ${todayJst} (タイムゾーンは Asia/Tokyo)
  ※ ユーザーは日本にいます。回答時の時刻表現はすべて JST で行ってください
- 今週 (週は月曜始まり・日曜終わり): ${weekRangeStr}
- 今週末 (= 土曜・日曜): ${weekendStr}
- 平日 = 月〜金 / 週末 = 土・日
- 対話相手: ${owner} さん

**日付の絶対ルール (厳守)**: 「今日」「明日」「今週」「今週末」「来週」などを文章に書くときは、必ず上記の確定値と後述の「日付・曜日参照表」に一致させること。自分で曜日や週末の日付を計算・推論しないこと。例えば今日が月曜なら「今週末」は今日ではなく上記 ${weekendStr} を指す。締切や週のゴールを示すときも実際の日付・曜日が上記と矛盾しないか必ず確認すること。

## NEO福岡について (組織知)
${knowledgeText || '(まだ組織知が登録されていません)'}

## ${owner} さんの「いま」
${userCtx.text}

## メンバー一覧 (tool 呼び出し用)
${memberList}

## カレンダー操作 (list_events / find_free_slots / create_event / update_event / delete_event)
予定の確認・日程調整・作成/更新/削除も依頼に応じて行えます。
- 日付・曜日参照表 (JST、確定値・必ずこの表から曜日を引くこと。自分で計算しない):
${dateRefStr}
- **重要: 必ず「直近のユーザー発話 1 件」だけに対応する。** 履歴に過去の依頼が残っていても、それらは既に処理済み (またはユーザーが意図的に放棄) とみなし、再提案しない。例えば「来週2件押さえて」を以前依頼し、今回「明日1件押さえて」と言われたら、**今回は明日1件のみ提案する** (来週2件は混ぜない)。
- **【最重要】予定の作成・更新・削除依頼には必ず対応する tool を呼ぶこと。** ユーザーが「入れて」「作って」「押さえて」「予約して」「変更して」「動かして」「削除して」等と言った場合、テキストで「作成します」「変更します」と返すだけは絶対にダメ。必ず create_event / update_event / delete_event の **tool を実際に呼び出してから** 最終返答テキストを書く (tool 呼び出しが proposal を返し、UI が承認カードを表示する仕組み)。tool を呼ばずに最終返答だけ書くと、ユーザー側に承認カードが出ず提案が消える。
- 空き時間を探す時は必ず find_free_slots を使う (勘で答えない)。find_free_slots で候補を得たら、**そのまま続けて create_event を呼んで提案を成立させる** (find_free_slots だけで止めない)。
- find_free_slots の working_hours は **省略すれば 9-18 (営業時間)** が既定。深夜・早朝の選択は避ける。ユーザーが「夜遅くでも」「終日」等と明示した場合のみ広範囲を指定する
- 時刻は JST (+09:00) の ISO 8601 で指定する
- 招待者は attendee_names にメンバー名を渡す (メール解決は裏で行う)
- 繰り返しは recurrence に RRULE 配列で指定 (例: 毎週金曜10回は ['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10'])
- Google Meet が必要そうな会議は add_meet: true
- **重要**: create_event / update_event / delete_event は「提案」として返り、実際の実行はユーザーが確認ダイアログで承認した後に行われる。したがって最終返答では「作成しました」ではなく「以下の内容で作成します。よろしければ承認を押してください」のように表現する
- 仮押さえは件名の先頭に「[仮]」が自動付与される

ツールは最大 ${MAX_STEPS} ステップ連続実行できます。`

  // 履歴は直近 6 ターンに制限 (1分あたり 30,000 input token のレート制限対策)
  // 長い会話で過去全てを送ると毎リクエストが肥大化して 429 になりやすい
  const MAX_HISTORY_TURNS = 6
  const trimmedHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS) : []
  const messages = [
    ...trimmedHistory.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  const actions = []
  let finalText = ''

  // 関数全体の wall-clock budget (Vercel 60s 制限。実質 50s で打ち切り)。
  // これを超えそうな wait は実施せず、即座にエラーを返してクライアント側で再試行させる。
  const REQ_START = Date.now()
  const WALL_CLOCK_BUDGET_MS = 50_000
  const remainingMs = () => WALL_CLOCK_BUDGET_MS - (Date.now() - REQ_START)

  // リトライは時間予算 (maxDuration) を食い潰さない範囲に抑える。
  // 過負荷時 (529) はリトライで粘るより、友好的なエラーを早く返して
  // クライアント側の「Failed to fetch」(関数タイムアウト) を避ける方を優先する。
  // 429 (レート制限) は分単位の枠なので、retry-after ヘッダを尊重し最大2回まで再試行。
  async function callAnthropic(reqBody, maxRetries = 2) {
    let lastStatus = 0, lastRaw = '', lastRetryAfter = 0
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // 残り時間が無いなら即座に break (リトライしない)
      if (remainingMs() < 5_000) break
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      })
      if (r.ok) return { ok: true, data: await r.json() }
      lastStatus = r.status; lastRaw = await r.text()
      const retryAfterHeader = Number(r.headers.get('retry-after') || 0)
      if (retryAfterHeader) lastRetryAfter = retryAfterHeader
      if ([429, 500, 502, 503, 504, 529].includes(r.status) && attempt < maxRetries - 1) {
        // 429 でも残り時間内に収まる範囲しか待たない。超えるなら即 break。
        const want = r.status === 429
          ? (retryAfterHeader ? retryAfterHeader * 1000 : 12_000)
          : Math.min(2000, 800 * Math.pow(2, attempt))
        const budget = Math.max(0, remainingMs() - 8_000) // 次の呼び出し用に 8s 確保
        if (want > budget) break  // 待つと時間超過するので諦める
        const delayMs = want
        await new Promise(res => setTimeout(res, delayMs))
        continue
      }
      break
    }
    return { ok: false, status: lastStatus, raw: lastRaw, retryAfter: lastRetryAfter }
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    // 時間予算切れなら部分結果で打ち切り (タイムアウト前に応答返す)
    if (remainingMs() < 6_000) {
      finalText = finalText || '⏱️ AI 応答が時間内に収まりませんでした。質問を絞り込んで再度お試しください。'
      break
    }
    const r = await callAnthropic({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })
    if (!r.ok) {
      let friendly
      if (r.status === 429) {
        const waitSec = r.retryAfter || 60
        friendly = `AI の利用上限に達しました (1分あたりの入力トークン制限)。約 ${waitSec} 秒後に再試行してください。会話履歴をクリアすると上限に達しにくくなります。`
      } else if (r.status === 529) {
        friendly = 'Anthropic API が一時的に過負荷状態です (529)。数分後に再試行してください。'
      } else {
        friendly = `Anthropic API ${r.status}: ${r.raw.slice(0, 300)}`
      }
      return json({ error: friendly, actions }, { status: 503 })
    }
    const data = r.data
    messages.push({ role: 'assistant', content: data.content })
    const toolUses = (data.content || []).filter(b => b.type === 'tool_use')
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    if (data.stop_reason === 'end_turn' || toolUses.length === 0) {
      finalText = textBlocks
      break
    }
    const toolResults = []
    for (const tu of toolUses) {
      const result = await execTool(supabase, owner, tu.name, tu.input, { members: membersWithEmail, orgId })
      actions.push({ tool: tu.name, input: tu.input, result })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result).slice(0, 8000),
        is_error: !result.ok,
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return json({
    text: finalText || '(応答なし)',
    actions,
    mode,
    knowledge_chars: knowledgeText.length,
  })
}
