import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

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

export async function POST(request) {
  try {
    const body = await request.json()
    const { taskId, taskTitle, kaTitle, objectiveTitle, completedBy } = body

    if (!taskId) {
      return Response.json({ error: 'taskId is required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // タスクの親KAからlevel_idを取得してwebhook URLを解決
    let webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (taskId) {
      const { data: task } = await supabase.from('ka_tasks').select('report_id').eq('id', taskId).single()
      if (task?.report_id) {
        const { data: ka } = await supabase.from('weekly_reports').select('level_id').eq('id', task.report_id).single()
        if (ka?.level_id) {
          const { data: levels } = await supabase.from('levels').select('id,parent_id,slack_webhook_url')
          webhookUrl = resolveWebhookUrl(ka.level_id, levels || [])
        }
      }
    }

    if (!webhookUrl) {
      return Response.json({ success: true, skipped: true, reason: 'No webhook URL configured' })
    }

    const text = [
      `✅ *タスク完了*`,
      `タスク: ${taskTitle || '(未入力)'}`,
      kaTitle ? `KA: ${kaTitle}` : null,
      objectiveTitle ? `OKR: ${objectiveTitle}` : null,
      `完了者: ${completedBy || '不明'}`,
    ].filter(Boolean).join('\n')

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Slack webhook failed: ${res.status} ${errBody}`)
    }

    return Response.json({ success: true })
  } catch (e) {
    console.error('Slack task-done error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
