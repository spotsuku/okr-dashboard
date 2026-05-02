// 複数メンバーのカレンダーイベントを一括取得
// GET /api/integrations/calendar/multi-events?members=name1,name2,...&start=<ISO>&end=<ISO>
//
// 各メンバーの user_integrations の token を使って Calendar API を呼び出す。
// 未連携のメンバーは connected:false で返す。

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'
import { isDemoMode, demoResponse } from '../../../../../lib/demoMocks'

export async function GET(request) {
  if (isDemoMode()) return Response.json(demoResponse('calendar/multi-events'))
  const url = new URL(request.url)
  const membersParam = url.searchParams.get('members') || ''
  const startIso = url.searchParams.get('start')
  const endIso = url.searchParams.get('end')

  if (!startIso || !endIso) {
    return json({ error: 'start / end パラメータが必要です' }, { status: 400 })
  }
  const names = membersParam.split(',').map(s => s.trim()).filter(Boolean)
  if (names.length === 0) return json({ members: [] })

  const results = await Promise.all(names.map(async name => {
    const res = await getIntegration(name, 'google')
    if (res.error || !res.integration) {
      return { name, connected: false, events: [], error: res.error || '未連携' }
    }
    if (res.expired) {
      return { name, connected: true, expired: true, events: [], error: 'トークン期限切れ' }
    }
    const integ = res.integration
    const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    apiUrl.searchParams.set('timeMin', startIso)
    apiUrl.searchParams.set('timeMax', endIso)
    apiUrl.searchParams.set('singleEvents', 'true')
    apiUrl.searchParams.set('orderBy', 'startTime')
    apiUrl.searchParams.set('maxResults', '100')

    try {
      const { response: r } = await callGoogleApiWithRetry(integ, async (token) => {
        return fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
      })
      if (!r.ok) {
        const body = await r.text()
        return { name, connected: true, events: [], error: `Calendar API ${r.status}: ${body.slice(0, 150)}` }
      }
      const data = await r.json()
      const events = (data.items || []).map(ev => ({
        id: ev.id,
        title: ev.summary || '(無題)',
        start: ev.start?.dateTime || ev.start?.date,
        end: ev.end?.dateTime || ev.end?.date,
        allDay: !!ev.start?.date,
        hangoutLink: ev.hangoutLink || null,
        htmlLink: ev.htmlLink,
        attendees: (ev.attendees || []).map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
        organizer: ev.organizer?.email,
        status: ev.status,
      }))
      return { name, connected: true, email: integ.metadata?.email || '', events }
    } catch (e) {
      return { name, connected: true, events: [], error: `取得失敗: ${e.message}` }
    }
  }))

  return json({ members: results })
}
