import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function calcStars(current, target, lowerIsBetter) {
  if (!target || target === 0) return 0
  const pct = lowerIsBetter
    ? (target - current) / target * 100 + 100
    : (current / target) * 100
  if (pct >= 100) return 5
  if (pct >= 80) return 4
  if (pct >= 60) return 3
  if (pct >= 40) return 2
  if (pct >= 20) return 1
  return 0
}

const STAR_STR = ['☆☆☆☆☆', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★']
const STATUS_LABELS = { normal: '', focus: '注力', good: 'Good', more: 'More', done: '完了' }

async function fetchData(supabase, weekStart) {
  const [
    { data: members },
    { data: objectives },
    { data: keyResults },
    { data: weeklyReports },
    { data: kaTasks },
  ] = await Promise.all([
    supabase.from('members').select('*').order('name'),
    supabase.from('objectives').select('id,title,owner,period,level_id').order('id'),
    supabase.from('key_results').select('id,title,target,current,unit,lower_is_better,objective_id,owner').order('id'),
    supabase.from('weekly_reports').select('*').eq('week_start', weekStart).neq('status', 'done').order('id'),
    supabase.from('ka_tasks').select('*').order('id'),
  ])
  return {
    members: members || [],
    objectives: objectives || [],
    keyResults: keyResults || [],
    weeklyReports: weeklyReports || [],
    kaTasks: kaTasks || [],
  }
}

function groupByOwner(data) {
  const { members, objectives, keyResults, weeklyReports, kaTasks } = data
  const ownerMap = {}

  // KAのreport_idでタスクをグループ化
  const tasksByReport = {}
  for (const t of kaTasks) {
    if (!tasksByReport[t.report_id]) tasksByReport[t.report_id] = []
    tasksByReport[t.report_id].push(t)
  }

  // KRをobjective_idでグループ化
  const krsByObj = {}
  for (const kr of keyResults) {
    if (!krsByObj[kr.objective_id]) krsByObj[kr.objective_id] = []
    krsByObj[kr.objective_id].push(kr)
  }

  // メンバーごとにデータ集約
  for (const m of members) {
    const name = m.name
    const myObjs = objectives.filter(o => o.owner === name)
    const myKRs = keyResults.filter(kr => kr.owner === name)
    const myKAs = weeklyReports.filter(r => r.owner === name)

    // 担当しているもの（Obj/KR/KA いずれか）がなければスキップ
    if (myObjs.length === 0 && myKRs.length === 0 && myKAs.length === 0) continue

    ownerMap[name] = {
      member: m,
      objectives: myObjs.map(o => ({
        ...o,
        keyResults: (krsByObj[o.id] || []).map(kr => ({
          ...kr,
          pct: kr.target ? Math.round((kr.current / kr.target) * 100) : 0,
          stars: calcStars(kr.current, kr.target, kr.lower_is_better),
        })),
      })),
      ownedKRs: myKRs.map(kr => ({
        ...kr,
        pct: kr.target ? Math.round((kr.current / kr.target) * 100) : 0,
        stars: calcStars(kr.current, kr.target, kr.lower_is_better),
      })),
      kas: myKAs.map(r => ({
        ...r,
        tasks: tasksByReport[r.id] || [],
      })),
    }
  }

  return ownerMap
}

// ─── 会議前リマインド（pre-meeting） ───────────────────────────────────────────
function buildPreMeetingMessage(ownerMap, weekStart) {
  const friday = new Date(weekStart)
  friday.setDate(friday.getDate() + 4)
  const header = `⏰ *会議前リマインド（${formatDate(weekStart)}〜${formatDate(toDateStr(friday))}）*\nGood/Moreの記入をお願いします！`

  let text = header + '\n'

  for (const [name, data] of Object.entries(ownerMap)) {
    text += '\n━━━━━━━━━━━━━━━━\n'
    text += `🎯 *${name}*\n`

    // KR達成状況
    const allKRs = [
      ...data.objectives.flatMap(o => o.keyResults),
      ...data.ownedKRs.filter(kr => !data.objectives.some(o => o.keyResults.some(okr => okr.id === kr.id))),
    ]
    for (const kr of allKRs) {
      text += `  📊 KR: ${kr.title} ${kr.current}${kr.unit}/${kr.target}${kr.unit} (${kr.pct}%) ${STAR_STR[kr.stars]}\n`
    }

    // KA状況
    if (data.kas.length > 0) {
      const hasGoodMore = data.kas.some(r => r.good || r.more)
      text += `  📋 KA: ${data.kas.length}件`
      text += hasGoodMore ? ' ✅記入済み\n' : '（Good/More未記入⚠️）\n'
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://okr-dashboard-taupe.vercel.app'
  text += `\n→ 記入はこちら: ${appUrl}/weekly`

  return { text }
}

// ─── 会議後タスク通知（tasks） ──────────────────────────────────────────────────
function buildTasksMessage(ownerMap, weekStart) {
  const friday = new Date(weekStart)
  friday.setDate(friday.getDate() + 4)
  const header = `📋 *今週のタスク一覧（${formatDate(weekStart)}〜${formatDate(toDateStr(friday))}）*`

  let text = header + '\n'

  for (const [name, data] of Object.entries(ownerMap)) {
    if (data.kas.length === 0) continue

    text += '\n━━━━━━━━━━━━━━━━\n'
    text += `🎯 *${name}*\n`

    for (const ka of data.kas) {
      const statusLabel = STATUS_LABELS[ka.status]
      text += `【KA】${ka.ka_title}${statusLabel ? ` [${statusLabel}]` : ''}\n`

      const incompleteTasks = ka.tasks.filter(t => !t.done)
      if (incompleteTasks.length > 0) {
        for (const t of incompleteTasks) {
          let taskLine = `  ☐ ${t.title || '(未入力)'}`
          const details = []
          if (t.assignee) details.push(`担当: ${t.assignee}`)
          if (t.due_date) details.push(`期限: ${formatDate(t.due_date)}`)
          if (details.length > 0) taskLine += `（${details.join(', ')}）`
          text += taskLine + '\n'
        }
      }
    }
  }

  return { text }
}

async function sendToSlack(payload) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL が設定されていません')
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Slack webhook failed: ${res.status} ${body}`)
  }
}

async function handleReminder(request) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type') || 'pre-meeting'
  const weekParam = url.searchParams.get('week')

  const weekStart = weekParam || toDateStr(getMonday(new Date()))

  const supabase = getAdminClient()
  const data = await fetchData(supabase, weekStart)
  const ownerMap = groupByOwner(data)

  if (Object.keys(ownerMap).length === 0) {
    return Response.json({ success: true, message: '通知対象のメンバーがいません' })
  }

  let payload
  if (type === 'tasks') {
    payload = buildTasksMessage(ownerMap, weekStart)
  } else {
    payload = buildPreMeetingMessage(ownerMap, weekStart)
  }

  await sendToSlack(payload)

  return Response.json({
    success: true,
    type,
    weekStart,
    memberCount: Object.keys(ownerMap).length,
  })
}

// ─── GET: Vercel Cron ────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    // Vercel Cron認証
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return await handleReminder(request)
  } catch (e) {
    console.error('Slack reminder error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST: 手動トリガー（UIボタンから呼ばれる） ─────────────────────────────
export async function POST(request) {
  try {
    return await handleReminder(request)
  } catch (e) {
    console.error('Slack reminder error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
