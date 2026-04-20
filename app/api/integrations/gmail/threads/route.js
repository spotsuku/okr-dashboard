// Gmailで「3日以上前に受信して未返信」のスレッドを取得
// GET /api/integrations/gmail/threads?owner=<name>
import { getIntegration, json } from '../../_shared'

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const result = await getIntegration(owner, 'google_gmail')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({ error: 'トークン期限切れ。再連携してください' }, { status: 401 })

  const token = result.integration.access_token

  // Gmail search query: 受信箱 & 3日以上前 & 未返信 & 自分宛
  const query = encodeURIComponent('in:inbox -from:me older_than:3d')

  try {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok) {
      const body = await listRes.text()
      return json({ error: `Gmail API ${listRes.status}: ${body.slice(0, 200)}` }, { status: listRes.status })
    }
    const listData = await listRes.json()
    const messageIds = (listData.messages || []).slice(0, 5).map(m => m.id)

    // 各メッセージのヘッダ取得 (並列)
    const items = await Promise.all(messageIds.map(async id => {
      const mRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!mRes.ok) return null
      const m = await mRes.json()
      const headers = m.payload?.headers || []
      const getH = (name) => headers.find(h => h.name === name)?.value || ''
      const from = getH('From').replace(/<.*>/, '').replace(/"/g, '').trim() || '(不明)'
      return {
        id,
        from,
        subject: getH('Subject') || '(件名なし)',
        snippet: m.snippet || '',
      }
    }))

    return json({ items: items.filter(Boolean) })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
