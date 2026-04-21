// 直近の Google カレンダー予定を取得 (現在時刻〜+8時間)
// GET /api/integrations/calendar/events?owner=<name>&hours=<8>
import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const hours = Math.max(1, Math.min(24, Number(url.searchParams.get('hours')) || 8))
  const result = await getIntegration(owner, 'google_calendar')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
    needsReauth: true,
  }, { status: 401 })

  // 現在時刻から hours 時間先まで
  const now = new Date()
  const windowEnd = new Date(now.getTime() + hours * 3600 * 1000)
  const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  apiUrl.searchParams.set('timeMin', now.toISOString())
  apiUrl.searchParams.set('timeMax', windowEnd.toISOString())
  apiUrl.searchParams.set('singleEvents', 'true')
  apiUrl.searchParams.set('orderBy', 'startTime')
  apiUrl.searchParams.set('maxResults', '20')

  try {
    // 401 時は refresh_token で再試行
    const { response: r } = await callGoogleApiWithRetry(result.integration, async (token) => {
      return fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
    })
    if (r.status === 401) {
      return json({
        error: 'Calendar のアクセストークンが無効です。Calendar を連携解除→再連携してください',
        needsReauth: true,
      }, { status: 401 })
    }
    if (!r.ok) {
      const body = await r.text()
      return json({ error: `Calendar API error ${r.status}: ${body.slice(0, 200)}` }, { status: r.status })
    }
    const data = await r.json()
    const nowMs = now.getTime()
    const items = (data.items || [])
      .map(ev => {
        const start = ev.start?.dateTime || ev.start?.date
        const end = ev.end?.dateTime || ev.end?.date
        const allDay = start && start.length <= 10
        const time = start ? (allDay ? '終日' : formatTime(start)) : ''
        return {
          title: ev.summary || '(無題)',
          time,
          start,
          end,
          allDay,
          hangoutLink: ev.hangoutLink || null,
          conflictsWith: [],
        }
      })
      // 時刻指定イベントのうち、既に終わったものは除外 (end <= 現在)
      .filter(ev => {
        if (ev.allDay) return true
        if (!ev.end) return true
        return new Date(ev.end).getTime() > nowMs
      })

    // 重複検出: 時刻指定のイベント同士で start < 他.end && end > 他.start なら重複
    const timed = items.filter(e => !e.allDay && e.start && e.end)
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const aStart = new Date(timed[i].start).getTime()
        const aEnd = new Date(timed[i].end).getTime()
        const bStart = new Date(timed[j].start).getTime()
        const bEnd = new Date(timed[j].end).getTime()
        if (aStart < bEnd && aEnd > bStart) {
          timed[i].conflictsWith.push(timed[j].title)
          timed[j].conflictsWith.push(timed[i].title)
        }
      }
    }

    return json({ items, windowHours: hours })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}

function formatTime(isoDateTime) {
  const d = new Date(isoDateTime)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${String(jst.getUTCHours()).padStart(2,'0')}:${String(jst.getUTCMinutes()).padStart(2,'0')}`
}
