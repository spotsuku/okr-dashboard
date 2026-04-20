// Slackで未読のあるチャンネル/DMを取得
// GET /api/integrations/slack/unread?owner=<name>
import { getIntegration, json } from '../../_shared'

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const result = await getIntegration(owner, 'slack')
  if (result.error) return json({ error: result.error }, { status: 400 })

  const token = result.integration.access_token

  try {
    // 自分が参加してる会話を全取得 (チャンネル+DM+グループDM)
    const listRes = await fetch(
      'https://slack.com/api/users.conversations?types=public_channel,private_channel,im,mpim&limit=50',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const listData = await listRes.json()
    if (!listData.ok) {
      return json({ error: `Slack: ${listData.error}` }, { status: 400 })
    }

    // 各会話で未読を確認 (最大15件まで処理)
    const convs = (listData.channels || []).slice(0, 15)
    const items = []
    for (const c of convs) {
      try {
        const infoRes = await fetch(
          `https://slack.com/api/conversations.info?channel=${c.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const info = await infoRes.json()
        if (info.ok && info.channel?.unread_count_display > 0) {
          items.push({
            channel: info.channel.name || info.channel.user || '(DM)',
            channelId: c.id,
            text: `${info.channel.unread_count_display}件の未読`,
            unread: info.channel.unread_count_display,
          })
        }
      } catch { /* skip this conversation on error */ }
    }

    // 未読件数降順
    items.sort((a, b) => (b.unread || 0) - (a.unread || 0))
    return json({ items: items.slice(0, 8) })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
