import { createClient } from '@supabase/supabase-js'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// JST基準で「今週の月曜日」のYYYY-MM-DD
function thisMondayJST() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const day = jst.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + diff
  ))
  return mon.toISOString().split('T')[0]
}

// JST基準で「次の月曜日」のYYYY-MM-DD
function nextMondayJST() {
  const today = thisMondayJST()
  const [y, m, d] = today.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 7))
  return next.toISOString().split('T')[0]
}

async function handleCreate(targetWeek) {
  const supabase = getClient()
  const targetMon = targetWeek || nextMondayJST()

  // 既存週で targetMon より前の最新週を取得（コピー元）
  const { data: existing, error: errExist } = await supabase
    .from('weekly_reports')
    .select('week_start')
    .lt('week_start', targetMon)
    .order('week_start', { ascending: false })
    .limit(1)
  if (errExist) return Response.json({ error: errExist.message }, { status: 500 })

  const srcWeek = existing?.[0]?.week_start
  if (!srcWeek) {
    return Response.json({ ok: true, created: 0, week: targetMon, reason: 'no source week' })
  }

  // コピー元の未完了KA一覧
  const { data: srcKAs, error: errSrc } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('week_start', srcWeek)
    .neq('status', 'done')
  if (errSrc) return Response.json({ error: errSrc.message }, { status: 500 })
  if (!srcKAs?.length) {
    return Response.json({ ok: true, created: 0, week: targetMon, source: srcWeek })
  }

  // 既に targetMon に存在するKAキー
  const { data: existingTarget } = await supabase
    .from('weekly_reports')
    .select('kr_id,ka_title,owner')
    .eq('week_start', targetMon)
  const existingKeys = new Set(
    (existingTarget || []).map(r => `${r.kr_id ?? ''}_${r.ka_title ?? ''}_${r.owner ?? ''}`)
  )

  const toCopy = srcKAs.filter(r =>
    !existingKeys.has(`${r.kr_id ?? ''}_${r.ka_title ?? ''}_${r.owner ?? ''}`)
  )
  if (toCopy.length === 0) {
    return Response.json({ ok: true, created: 0, week: targetMon, source: srcWeek, reason: 'all already exist' })
  }

  const copies = toCopy.map(r => ({
    week_start: targetMon,
    level_id: r.level_id,
    objective_id: r.objective_id,
    kr_id: r.kr_id,
    kr_title: r.kr_title,
    ka_title: r.ka_title,
    owner: r.owner,
    status: 'normal',
    // good/more/focus_outputはコピーしない（週次の振り返り項目のため）
  }))

  const { data: newReports, error: errIns } = await supabase
    .from('weekly_reports')
    .insert(copies)
    .select()
  if (errIns) return Response.json({ error: errIns.message }, { status: 500 })

  // コピー元KAに紐づく未完了タスクを新report_idにコピー
  let taskCopiesCount = 0
  if (newReports?.length) {
    const srcIds = toCopy.map(r => r.id)
    const { data: srcTasks } = await supabase
      .from('ka_tasks')
      .select('*')
      .in('report_id', srcIds)
      .eq('done', false)
    if (srcTasks?.length) {
      const idMap = {}
      toCopy.forEach((src, i) => { if (newReports[i]) idMap[src.id] = newReports[i].id })
      const taskCopies = srcTasks
        .map(t => ({
          report_id: idMap[t.report_id],
          title: t.title,
          assignee: t.assignee,
          due_date: null,
          done: false,
        }))
        .filter(t => t.report_id)
      if (taskCopies.length) {
        const { error: errTask } = await supabase.from('ka_tasks').insert(taskCopies)
        if (!errTask) taskCopiesCount = taskCopies.length
      }
    }
  }

  return Response.json({
    ok: true,
    created: copies.length,
    tasksCreated: taskCopiesCount,
    week: targetMon,
    source: srcWeek,
  })
}

// GET: Vercel Cron 用エンドポイント（金曜08:00 JST = 木曜23:00 UTC）
export async function GET(req) {
  try {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return await handleCreate()
  } catch (e) {
    console.error('create-next-week error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST: 手動トリガー（UI/curlから）
//   body: { targetWeek?: "YYYY-MM-DD" } - 省略時は次の月曜日
export async function POST(req) {
  try {
    let targetWeek = null
    try {
      const body = await req.json()
      targetWeek = body?.targetWeek || null
    } catch {}
    return await handleCreate(targetWeek)
  } catch (e) {
    console.error('create-next-week error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
