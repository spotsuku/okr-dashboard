import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getMonday(date) {
  // JST基準で月曜日を計算（Vercel Cron は UTC で実行されるため、
  // JST月曜早朝の通知時にUTCでは日曜になり、前週を返してしまう問題を防ぐ）
  const ts = date instanceof Date ? date.getTime() : new Date(date).getTime()
  const jst = new Date(ts + 9 * 3600 * 1000)
  const day = jst.getUTCDay()
  jst.setUTCDate(jst.getUTCDate() - day + (day === 0 ? -6 : 1))
  return jst
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function todayJST() {
  // 日本時間の「今日」を YYYY-MM-DD で返す
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0]
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
    { data: levels },
    { data: objectives },
    { data: keyResults },
    { data: weeklyReports },
    { data: kaTasks },
  ] = await Promise.all([
    supabase.from('members').select('*').order('name'),
    supabase.from('levels').select('*').order('id'),
    supabase.from('objectives').select('id,title,owner,period,level_id').order('id'),
    supabase.from('key_results').select('id,title,target,current,unit,lower_is_better,objective_id,owner').order('id'),
    supabase.from('weekly_reports').select('*').eq('week_start', weekStart).neq('status', 'done').order('id'),
    supabase.from('ka_tasks').select('*').order('id'),
  ])
  return {
    members: members || [],
    levels: levels || [],
    objectives: objectives || [],
    keyResults: keyResults || [],
    weeklyReports: weeklyReports || [],
    kaTasks: kaTasks || [],
  }
}

// 部署サブツリーのID一覧を取得
function getSubtreeIds(levelId, levels) {
  const ids = [Number(levelId)]
  levels.filter(l => Number(l.parent_id) === Number(levelId)).forEach(c => ids.push(...getSubtreeIds(c.id, levels)))
  return ids
}

function groupByOwner(data, levelId) {
  const { members, levels, objectives, keyResults, weeklyReports, kaTasks } = data
  const ownerMap = {}

  // 部署フィルタ: levelIdが指定されていればサブツリーのIDでフィルタ
  const visibleLevelIds = levelId ? getSubtreeIds(levelId, levels) : null

  // KAのreport_idでタスクをグループ化
  const tasksByReport = {}
  for (const t of kaTasks) {
    if (!tasksByReport[t.report_id]) tasksByReport[t.report_id] = []
    tasksByReport[t.report_id].push(t)
  }

  // 部署でフィルタしたKA
  const filteredKAs = visibleLevelIds
    ? weeklyReports.filter(r => visibleLevelIds.includes(Number(r.level_id)))
    : weeklyReports

  // ★ 該当週のKAに紐づくObjective/KRのみに限定
  const kaObjIds = new Set(filteredKAs.map(r => r.objective_id).filter(Boolean))
  const kaKrIds = new Set(filteredKAs.map(r => r.kr_id).filter(Boolean))

  // KAに紐づくObjectiveのみ
  const filteredObjs = (visibleLevelIds
    ? objectives.filter(o => visibleLevelIds.includes(Number(o.level_id)))
    : objectives
  ).filter(o => kaObjIds.has(o.id))
  const filteredObjIds = new Set(filteredObjs.map(o => o.id))

  // KAに紐づくKRのみ
  const filteredKRs = keyResults.filter(kr => kaKrIds.has(kr.id) || filteredObjIds.has(kr.objective_id))

  // KRをobjective_idでグループ化
  const krsByObj = {}
  for (const kr of filteredKRs) {
    if (!krsByObj[kr.objective_id]) krsByObj[kr.objective_id] = []
    krsByObj[kr.objective_id].push(kr)
  }

  // メンバーごとにデータ集約
  for (const m of members) {
    const name = m.name
    const myObjs = filteredObjs.filter(o => o.owner === name)
    const myKRs = filteredKRs.filter(kr => kr.owner === name)
    const myKAs = filteredKAs.filter(r => r.owner === name)

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
function buildPreMeetingMessage(ownerMap, weekStart, levelName) {
  const friday = new Date(weekStart)
  friday.setDate(friday.getDate() + 4)
  const scope = levelName ? ` [${levelName}]` : ''
  const header = `⏰ *会議前リマインド${scope}（${formatDate(weekStart)}〜${formatDate(toDateStr(friday))}）*\nGood/Moreの記入をお願いします！`

  let text = header + '\n'
  const today = todayJST()

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

    // 未完了タスク・期限切れリマインド
    const allTasks = data.kas.flatMap(ka => ka.tasks)
    const incompleteTasks = allTasks.filter(t => !t.done)
    const overdueTasks = incompleteTasks.filter(t => t.due_date && t.due_date < today)
    if (overdueTasks.length > 0) {
      text += `  🔴 期限超過タスク: ${overdueTasks.length}件\n`
      for (const t of overdueTasks) {
        text += `    ⚠️ ${t.title || '(未入力)'}（期限: ${formatDate(t.due_date)}）\n`
      }
    }
    if (incompleteTasks.length > 0 && overdueTasks.length === 0) {
      text += `  📌 未完了タスク: ${incompleteTasks.length}件\n`
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://okr-dashboard-taupe.vercel.app'
  text += `\n→ 記入はこちら: ${appUrl}/weekly`

  return { text }
}

// ─── 会議後タスク通知（tasks） ──────────────────────────────────────────────────
function buildTasksMessage(ownerMap, weekStart, levelName) {
  const friday = new Date(weekStart)
  friday.setDate(friday.getDate() + 4)
  const scope = levelName ? ` [${levelName}]` : ''
  const header = `📋 *今週のタスク一覧${scope}（${formatDate(weekStart)}〜${formatDate(toDateStr(friday))}）*`

  let text = header + '\n'
  const today = todayJST()

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
          const isOverdue = t.due_date && t.due_date < today
          let taskLine = `  ${isOverdue ? '⚠️' : '☐'} ${t.title || '(未入力)'}`
          const details = []
          if (t.assignee) details.push(`担当: ${t.assignee}`)
          if (t.due_date) details.push(`期限: ${formatDate(t.due_date)}${isOverdue ? ' 超過!' : ''}`)
          if (details.length > 0) taskLine += `（${details.join(', ')}）`
          text += taskLine + '\n'
        }
      }

      const doneTasks = ka.tasks.filter(t => t.done)
      if (doneTasks.length > 0) {
        text += `  ✅ 完了済み: ${doneTasks.length}件\n`
      }
    }
  }

  return { text }
}

// ─── 金曜振り返りアナウンス（friday-review） ──────────────────────────────────
function buildFridayReviewMessage(ownerMap, weekStart, levelName) {
  const friday = new Date(weekStart)
  friday.setDate(friday.getDate() + 4)
  const scope = levelName ? ` [${levelName}]` : ''
  const nextMonday = new Date(weekStart)
  nextMonday.setDate(nextMonday.getDate() + 7)

  let text = `<!channel>\n`
  text += `📝 *今週の振り返り＆翌週の記入をお願いします${scope}*\n`
  text += `（${formatDate(weekStart)}〜${formatDate(toDateStr(friday))}）\n\n`
  text += `今週もお疲れ様でした！以下の記入をお願いします：\n`
  text += `✅ 各KAの *Good*（うまくいったこと）と *More*（改善点）を記入\n`
  text += `✅ タスクの完了チェック\n`
  text += `✅ 翌週（${formatDate(toDateStr(nextMonday))}〜）の *Focus KA* を選択\n\n`

  const today = todayJST()
  let hasContent = false

  for (const [name, data] of Object.entries(ownerMap)) {
    if (data.kas.length === 0) continue
    hasContent = true
    text += `━━━━━━━━━━━━━━━━\n`
    text += `🎯 *${name}*\n`

    // KA一覧（ステータス付き）
    for (const ka of data.kas) {
      const statusLabel = STATUS_LABELS[ka.status]
      const statusIcon = ka.status === 'focus' ? '🔵' : ka.status === 'good' ? '🟢' : ka.status === 'more' ? '🔴' : '⚪'
      const goodMore = (ka.good || ka.more) ? ' ✅' : ' ⚠️未記入'
      text += `  ${statusIcon} ${ka.ka_title}${statusLabel ? ` [${statusLabel}]` : ''}${goodMore}\n`
    }

    // 未完了タスク
    const allTasks = data.kas.flatMap(ka => ka.tasks)
    const incomplete = allTasks.filter(t => !t.done)
    const overdue = incomplete.filter(t => t.due_date && t.due_date < today)
    if (overdue.length > 0) {
      text += `  🔴 期限超過: ${overdue.length}件\n`
    }
    if (incomplete.length > 0) {
      text += `  📌 未完了タスク: ${incomplete.length}件\n`
    }
  }

  if (!hasContent) {
    text += `（該当するKAがありません）\n`
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://okr-dashboard-taupe.vercel.app'
  text += `\n→ 記入はこちら: ${appUrl}/?page=weekly`

  return { text }
}

// ─── 月曜アナウンス（monday-announce） ─────────────────────────────────────────
function buildMondayAnnounceMessage(ownerMap, weekStart, levelName) {
  const friday = new Date(weekStart)
  friday.setDate(friday.getDate() + 4)
  const scope = levelName ? ` [${levelName}]` : ''

  let text = `<!channel>\n`
  text += `🚀 *今週のKA・タスク確認${scope}*\n`
  text += `（${formatDate(weekStart)}〜${formatDate(toDateStr(friday))}）\n\n`
  text += `おはようございます！今週もよろしくお願いします。\n`
  text += `📌 Focus KAの確認と、タスクの期限を確認してください。\n\n`

  const today = todayJST()
  let hasContent = false

  for (const [name, data] of Object.entries(ownerMap)) {
    if (data.kas.length === 0) continue
    hasContent = true
    text += `━━━━━━━━━━━━━━━━\n`
    text += `🎯 *${name}*\n`

    // Focus KA
    const focusKAs = data.kas.filter(ka => ka.status === 'focus')
    if (focusKAs.length > 0) {
      text += `  🔵 *Focus KA:*\n`
      for (const ka of focusKAs) {
        text += `    • ${ka.ka_title}\n`
      }
    }

    // その他のKA（compact）
    const otherKAs = data.kas.filter(ka => ka.status !== 'focus')
    if (otherKAs.length > 0) {
      text += `  📋 その他KA: ${otherKAs.length}件\n`
    }

    // 今週のタスク
    const allTasks = data.kas.flatMap(ka => ka.tasks)
    const incomplete = allTasks.filter(t => !t.done)
    const thisWeekTasks = incomplete.filter(t => t.due_date && t.due_date >= weekStart && t.due_date <= toDateStr(friday))
    const overdue = incomplete.filter(t => t.due_date && t.due_date < today)

    if (overdue.length > 0) {
      text += `  🔴 *期限超過タスク:*\n`
      for (const t of overdue.slice(0, 3)) {
        text += `    ⚠️ ${t.title || '(未入力)'}（期限: ${formatDate(t.due_date)}）\n`
      }
      if (overdue.length > 3) text += `    ...他${overdue.length - 3}件\n`
    }

    if (thisWeekTasks.length > 0) {
      text += `  📅 *今週のタスク:*\n`
      for (const t of thisWeekTasks.slice(0, 5)) {
        text += `    ☐ ${t.title || '(未入力)'}（期限: ${formatDate(t.due_date)}）\n`
      }
      if (thisWeekTasks.length > 5) text += `    ...他${thisWeekTasks.length - 5}件\n`
    }

    const noDueTasks = incomplete.filter(t => !t.due_date)
    if (noDueTasks.length > 0) {
      text += `  📌 期限未設定タスク: ${noDueTasks.length}件\n`
    }
  }

  if (!hasContent) {
    text += `（該当するKAがありません）\n`
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://okr-dashboard-taupe.vercel.app'
  text += `\n→ 確認はこちら: ${appUrl}/?page=mycoach`

  return { text }
}

async function sendToSlack(payload, webhookUrl) {
  if (!webhookUrl) {
    throw new Error('Webhook URL が設定されていません')
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

// 部署のWebhook URLを取得（自身→親を辿って最初に見つかったものを使う、なければデフォルト）
function resolveWebhookUrl(levelId, levels) {
  const defaultUrl = process.env.SLACK_WEBHOOK_URL
  if (!levelId) return defaultUrl
  let cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur) {
    if (cur.slack_webhook_url) return cur.slack_webhook_url
    cur = cur.parent_id ? levels.find(l => Number(l.id) === Number(cur.parent_id)) : null
  }
  return defaultUrl
}

// トップレベル部署ごとにメンバーを振り分け（部署別送信用）
function groupMembersByTopLevel(ownerMap, members, levels) {
  const groups = {} // { levelId: { levelName, webhookUrl, ownerMap } }
  for (const [name, data] of Object.entries(ownerMap)) {
    const member = data.member
    const levelId = member.level_id
    if (!levelId) continue
    // このメンバーの所属部署から最も上位のWebhook設定済み部署を特定
    const webhookUrl = resolveWebhookUrl(levelId, levels)
    // グループキーはWebhook URL（同じURLに送るメンバーをまとめる）
    const key = webhookUrl || '__default__'
    if (!groups[key]) {
      const levelObj = levels.find(l => Number(l.id) === Number(levelId))
      groups[key] = { webhookUrl, ownerMap: {} }
    }
    groups[key].ownerMap[name] = data
  }
  return groups
}

function getBuildFn(type) {
  switch (type) {
    case 'tasks': return buildTasksMessage
    case 'friday-review': return buildFridayReviewMessage
    case 'monday-announce': return buildMondayAnnounceMessage
    default: return buildPreMeetingMessage
  }
}

async function handleReminder(request) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type') || 'pre-meeting'
  const weekParam = url.searchParams.get('week')
  const levelId = url.searchParams.get('levelId')
  const preview = url.searchParams.get('preview') === 'true'
  const perDept = url.searchParams.get('perDept') === 'true' // 部署別送信モード

  const weekStart = weekParam || toDateStr(getMonday(new Date()))

  const supabase = getAdminClient()
  const data = await fetchData(supabase, weekStart)
  const ownerMap = groupByOwner(data, levelId ? Number(levelId) : null)

  // 部署名を取得（ヘッダー表示用）
  const levelName = levelId ? (data.levels.find(l => Number(l.id) === Number(levelId))?.name || '') : ''

  if (Object.keys(ownerMap).length === 0) {
    return Response.json({ success: true, preview: preview, text: '', message: '通知対象のメンバーがいません', memberCount: 0 })
  }

  // 部署別送信モード: 部署ごとのWebhook URLに分割送信
  if (perDept && !preview) {
    const groups = groupMembersByTopLevel(ownerMap, data.members, data.levels)
    const results = []
    for (const [key, group] of Object.entries(groups)) {
      if (!group.webhookUrl) continue
      const buildFn = getBuildFn(type)
      const payload = buildFn(group.ownerMap, weekStart, '')
      await sendToSlack(payload, group.webhookUrl)
      results.push({ memberCount: Object.keys(group.ownerMap).length })
    }
    // Webhook未設定のメンバーはデフォルトに送信
    const defaultGroup = Object.entries(groups).find(([k]) => k === '__default__')
    if (defaultGroup) {
      const defaultUrl = process.env.SLACK_WEBHOOK_URL
      if (defaultUrl) {
        const buildFn = getBuildFn(type)
        const payload = buildFn(defaultGroup[1].ownerMap, weekStart, '')
        await sendToSlack(payload, defaultUrl)
      }
    }
    return Response.json({
      success: true,
      type,
      weekStart,
      perDept: true,
      channelCount: results.length + (defaultGroup && process.env.SLACK_WEBHOOK_URL ? 1 : 0),
      memberCount: Object.keys(ownerMap).length,
    })
  }

  const payload = getBuildFn(type)(ownerMap, weekStart, levelName)

  // プレビューモード: 送信せずメッセージだけ返す
  if (preview) {
    // 部署別Webhook設定があるか確認
    const hasPerDeptWebhooks = data.levels.some(l => l.slack_webhook_url)
    return Response.json({
      success: true,
      preview: true,
      text: payload.text,
      type,
      weekStart,
      levelId: levelId || null,
      levelName: levelName || '全部署',
      memberCount: Object.keys(ownerMap).length,
      hasPerDeptWebhooks,
    })
  }

  const webhookUrl = levelId ? resolveWebhookUrl(Number(levelId), data.levels) : process.env.SLACK_WEBHOOK_URL
  await sendToSlack(payload, webhookUrl)

  return Response.json({
    success: true,
    type,
    weekStart,
    levelId: levelId || null,
    levelName: levelName || '全部署',
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
