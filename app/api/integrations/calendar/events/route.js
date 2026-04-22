// Google カレンダー: 直近 N 時間の予定を取得
// GET /api/integrations/calendar/events?owner=<name>&hours=8

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const hours = Math.max(1, Math.min(24, Number(url.searchParams.get('hours')) || 8))
  const result = await getIntegration(owner, 'google')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
    needsReauth: true,
  }, { status: 401 })

  const now = new Date()
  const windowEnd = new Date(now.getTime() + hours * 3600 * 1000)
  const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  apiUrl.searchParams.set('timeMin', now.toISOString())
  apiUrl.searchParams.set('timeMax', windowEnd.toISOString())
  apiUrl.searchParams.set('singleEvents', 'true')
  apiUrl.searchParams.set('orderBy', 'startTime')
  apiUrl.searchParams.set('maxResults', '20')

  try {
    const { response: r } = await callGoogleApiWithRetry(result.integration, async (token) => {
      return fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
    })
    if (r.status === 401) {
      return json({
        error: 'Calendar のアクセストークンが無効です。連携解除→再連携してください',
        needsReauth: true,
      }, { status: 401 })
    }
    if (!r.ok) {
      const body = await r.text()
      return json({ error: `Calendar API ${r.status}: ${body.slice(0, 200)}` }, { status: r.status })
    }
    const data = await r.json()
    const items = (data.items || []).map(ev => {
      const start = ev.start?.dateTime || ev.start?.date
      const end = ev.end?.dateTime || ev.end?.date
      const allDay = start && start.length <= 10
      return {
        id: ev.id,
        title: ev.summary || '(無題)',
        time: start ? (allDay ? '終日' : formatTime(start)) : '',
        start,
        end,
        allDay,
        hangoutLink: ev.hangoutLink || null,
        attendees: (ev.attendees || []).length,
        htmlLink: ev.htmlLink,
      }
    })
    return json({ items })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
