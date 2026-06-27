// 終業時の「本日の活動報告」(1時間ごとの作業記録 + KPT) を Slack に投稿する
// POST /api/integrations/slack/daily-report
//   Body: { owner, organization_id, date, worked, hourly: [{slot, text}], keep, problem, try }
//
// 投稿先 (上から順に試行し、成功したら終了 — confirmations/notify と同じ方針):
//  1. 組織の共有 webhook (organizations.slack_webhook_confirmations / UI登録)
//  2. env SLACK_WEBHOOK_URL_CONFIRMATIONS
//  3. 投稿者の所属 level webhook (levels.slack_webhook_url)
//  4. グローバル env SLACK_WEBHOOK_URL
//  5. いずれも無ければ何もせず 200 (アプリ側には保存済みのため致命的ではない)

export const dynamic = 'force-dynamic'

import { getAdminClient, json } from '../../_shared'
import { isDemoMode, demoResponse } from '../../../../../lib/demoMocks'

async function postWebhook(url, text) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return true
  } catch (e) {
    console.warn('daily-report Slack webhook failed:', e?.message)
    return false
  }
}

export async function POST(request) {
  if (isDemoMode()) return Response.json(demoResponse('slack/daily-report'))
  try {
    const body = await request.json().catch(() => ({}))
    const { owner, organization_id, date, worked, hourly, keep, problem, try: tryNote } = body || {}
    if (!owner) return json({ error: 'owner required' }, { status: 400 })

    const supabase = getAdminClient()

    // 投稿者情報 (slack_user_id があれば実メンションで push 通知を発火)
    let member = null
    if (organization_id) {
      const { data } = await supabase.from('members')
        .select('slack_user_id, level_id').eq('name', owner).eq('organization_id', organization_id).maybeSingle()
      member = data
    }
    const who = member?.slack_user_id ? `<@${member.slack_user_id}>` : owner

    // 本文組み立て
    const lines = [`📋 *本日の活動報告* — ${who}${date ? ` (${date})` : ''}${worked ? ` · 稼働 ${worked}` : ''}`]
    const rows = (hourly || []).filter(h => h && (h.text || '').trim())
    if (rows.length > 0) {
      lines.push('', '*🕒 時間ごとの作業*')
      for (const h of rows) lines.push(`• ${h.slot}　${h.text.trim()}`)
    }
    const kpt = []
    if ((keep || '').trim())    kpt.push(`✅ *Keep:* ${keep.trim()}`)
    if ((problem || '').trim()) kpt.push(`🔺 *Problem:* ${problem.trim()}`)
    if ((tryNote || '').trim()) kpt.push(`🎯 *Try:* ${tryNote.trim()}`)
    if (kpt.length > 0) lines.push('', '*振り返り (KPT)*', ...kpt)
    const text = lines.join('\n')

    let notified = false

    // 1. 組織の共有 webhook
    if (organization_id) {
      const { data: org } = await supabase.from('organizations')
        .select('slack_webhook_confirmations').eq('id', organization_id).maybeSingle()
      if (org?.slack_webhook_confirmations) notified = await postWebhook(org.slack_webhook_confirmations, text)
    }
    // 2. env 共有 webhook
    if (!notified && process.env.SLACK_WEBHOOK_URL_CONFIRMATIONS) {
      notified = await postWebhook(process.env.SLACK_WEBHOOK_URL_CONFIRMATIONS, text)
    }
    // 3. 投稿者の所属 level webhook
    if (!notified && member?.level_id) {
      const { data: lvl } = await supabase.from('levels')
        .select('slack_webhook_url').eq('id', member.level_id).maybeSingle()
      if (lvl?.slack_webhook_url) notified = await postWebhook(lvl.slack_webhook_url, text)
    }
    // 4. グローバル env webhook
    if (!notified && process.env.SLACK_WEBHOOK_URL) {
      notified = await postWebhook(process.env.SLACK_WEBHOOK_URL, text)
    }

    return json({ ok: true, notified })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}
