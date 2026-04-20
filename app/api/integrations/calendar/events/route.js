// 今日のGoogleカレンダー予定を取得
// GET /api/integrations/calendar/events?owner=<name>
import { getIntegration, json } from '../../_shared'

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const result = await getIntegration(owner, 'google_calendar')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({ error: 'トークン期限切れ。再連携してください' }, { status: 401 })

  const token = result.integration.access_token
  // 今日のJST範囲をUTCで算出
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const yyyy = jst.getUTCFullYear(), mm = jst.getUTCMonth(), dd = jst.getUTCDate()
  const jstMidnight = new Date(Date.UTC(yyyy, mm, dd, -9, 0, 0)).toISOString() // JST 00:00
  const jstNextMidnight = new Date(Date.UTC(yyyy, mm, dd + 1, -9, 0, 0)).toISOString()

  const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  apiUrl.searchParams.set('timeMin', jstMidnight)
  apiUrl.searchParams.set('timeMax', jstNextMidnight)
  apiUrl.searchParams.set('singleEvents', 'true')
  apiUrl.searchParams.set('orderBy', 'startTime')
  apiUrl.searchParams.set('maxResults', '20')

  try {
    const r = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      const body = await r.text()
      return json({ error: `Calendar API error ${r.status}: ${body.slice(0, 200)}` }, { status: r.status })
    }
    const data = await r.json()
    const items = (data.items || []).map(ev => {
      const start = ev.start?.dateTime || ev.start?.date
      const time = start ? (start.length > 10 ? formatTime(start) : '終日') : ''
      return {
        title: ev.summary || '(無題)',
        time,
        start,
        hangoutLink: ev.hangoutLink || null,
      }
    })
    return json({ items })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}

function formatTime(isoDateTime) {
  const d = new Date(isoDateTime)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${String(jst.getUTCHours()).padStart(2,'0')}:${String(jst.getUTCMinutes()).padStart(2,'0')}`
}
