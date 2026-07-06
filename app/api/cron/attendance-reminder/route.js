// 始業/終業の押し忘れ防止 Slack リマインド (Vercel Cron)
// GET /api/cron/attendance-reminder?type=start|end
//   - start: 平日 8:30 JST に「始業を押してください」
//   - end:   平日 17:30 JST に「終業を押してください」
// 祝日・土日 (isJpNonBusinessDay) はスキップ。
// 投稿先: 勤怠(終業報告/日報)と同じチャンネル = organizations.slack_webhook_daily_report。
//         未設定なら共有 webhook (slack_webhook_confirmations) → env SLACK_WEBHOOK_URL の順。

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { isJpNonBusinessDay } from '../../../../lib/jpHolidays'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function todayJST() {
  const j = new Date(Date.now() + 9 * 3600 * 1000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

async function post(url, text) {
  try {
    // link_names: 1 で @user / <!channel> 等のメンション解決を有効化 (通知が飛ぶように)
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, link_names: 1 }),
    })
    return true
  } catch (e) {
    console.warn('attendance-reminder webhook failed:', e?.message)
    return false
  }
}

export async function GET(req) {
  // Vercel Cron 認証 (CRON_SECRET 設定時)
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const type = new URL(req.url).searchParams.get('type') === 'end' ? 'end' : 'start'

  // 平日のみ (土日祝はスキップ)
  const dateStr = todayJST()
  if (isJpNonBusinessDay(dateStr)) {
    return Response.json({ ok: true, skipped: 'non-business-day', date: dateStr, type })
  }

  const url = process.env.NEXT_PUBLIC_APP_URL || 'https://aiworkspace.jp'
  // <!channel> でチャンネル全員に通知 (Slack incoming webhook が link_names を解釈)
  const text = type === 'end'
    ? `<!channel>\n🌆 お疲れさまです！\n退社前に AI WorkSpace で『終業』を押して、今日の振り返り（1時間ごとの作業・KPT）を記録しましょう。\n👉 ${url}`
    : `<!channel>\n🌅 おはようございます！\n出社したら AI WorkSpace で『始業』を押してください。\n👉 ${url}`

  const supabase = admin()
  let notified = 0
  // 勤怠(日報)と同じチャンネルへ。日報webhook優先、無ければ共有webhookにフォールバック。
  // slack_webhook_daily_report 列が未作成の環境でもエラーにしない。
  let orgs = []
  let res = await supabase.from('organizations').select('id, slack_webhook_daily_report, slack_webhook_confirmations')
  if (res.error && /column .* does not exist|schema cache/i.test(res.error.message || '')) {
    res = await supabase.from('organizations').select('id, slack_webhook_confirmations')
  }
  if (!res.error) orgs = res.data || []
  for (const o of orgs) {
    const target = o?.slack_webhook_daily_report || o?.slack_webhook_confirmations
    if (target) { if (await post(target, text)) notified++ }
  }
  // フォールバック: env のグローバル webhook
  if (notified === 0 && process.env.SLACK_WEBHOOK_URL) {
    if (await post(process.env.SLACK_WEBHOOK_URL, text)) notified++
  }

  return Response.json({ ok: true, type, date: dateStr, notified })
}
