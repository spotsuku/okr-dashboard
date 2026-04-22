// Google カレンダーイベントの作成/更新/削除
// POST   /api/integrations/calendar/event        { owner, summary, description, start_iso, end_iso, attendee_emails[], add_meet }
// PATCH  /api/integrations/calendar/event        { owner, event_id, updates: {summary?, description?, start_iso?, end_iso?, attendee_emails?} }
// DELETE /api/integrations/calendar/event        { owner, event_id }
//
// sendUpdates=all で招待メールを自動送信。owner のトークンで primary カレンダーを操作。

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

async function resolveIntegration(owner) {
  const res = await getIntegration(owner, 'google')
  if (res.error || !res.integration) {
    return { error: res.error || '未連携', status: 400 }
  }
  if (res.expired) {
    return { error: res.refreshError || 'トークン期限切れ', status: 401, needsReauth: true }
  }
  return { integration: res.integration }
}

function buildEventPayload({ summary, description, start_iso, end_iso, attendee_emails, add_meet }) {
  const payload = {}
  if (summary !== undefined) payload.summary = summary
  if (description !== undefined) payload.description = description
  if (start_iso) payload.start = { dateTime: start_iso, timeZone: 'Asia/Tokyo' }
  if (end_iso) payload.end = { dateTime: end_iso, timeZone: 'Asia/Tokyo' }
  if (attendee_emails !== undefined) {
    payload.attendees = (attendee_emails || []).map(email => ({ email }))
  }
  if (add_meet) {
    payload.conferenceData = {
      createRequest: {
        requestId: `mt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }
  return payload
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, summary, description, start_iso, end_iso, attendee_emails, add_meet } = body || {}
  if (!owner || !summary || !start_iso || !end_iso) {
    return json({ error: 'owner / summary / start_iso / end_iso が必要です' }, { status: 400 })
  }
  const resolved = await resolveIntegration(owner)
  if (resolved.error) return json({ error: resolved.error, needsReauth: resolved.needsReauth }, { status: resolved.status })

  const payload = buildEventPayload({ summary, description, start_iso, end_iso, attendee_emails, add_meet })
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('sendUpdates', 'all')
  if (add_meet) url.searchParams.set('conferenceDataVersion', '1')

  const { response: r } = await callGoogleApiWithRetry(resolved.integration, async (token) => {
    return fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })
  const raw = await r.text()
  if (!r.ok) return json({ error: `Calendar API ${r.status}: ${raw.slice(0, 200)}` }, { status: r.status })
  return json(JSON.parse(raw))
}

export async function PATCH(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, event_id, updates } = body || {}
  if (!owner || !event_id) return json({ error: 'owner / event_id が必要です' }, { status: 400 })
  const resolved = await resolveIntegration(owner)
  if (resolved.error) return json({ error: resolved.error, needsReauth: resolved.needsReauth }, { status: resolved.status })

  const payload = buildEventPayload(updates || {})
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event_id)}`)
  url.searchParams.set('sendUpdates', 'all')

  const { response: r } = await callGoogleApiWithRetry(resolved.integration, async (token) => {
    return fetch(url.toString(), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })
  const raw = await r.text()
  if (!r.ok) return json({ error: `Calendar API ${r.status}: ${raw.slice(0, 200)}` }, { status: r.status })
  return json(JSON.parse(raw))
}

export async function DELETE(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, event_id } = body || {}
  if (!owner || !event_id) return json({ error: 'owner / event_id が必要です' }, { status: 400 })
  const resolved = await resolveIntegration(owner)
  if (resolved.error) return json({ error: resolved.error, needsReauth: resolved.needsReauth }, { status: resolved.status })

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event_id)}`)
  url.searchParams.set('sendUpdates', 'all')

  const { response: r } = await callGoogleApiWithRetry(resolved.integration, async (token) => {
    return fetch(url.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  })
  if (!r.ok && r.status !== 204) {
    const raw = await r.text()
    return json({ error: `Calendar API ${r.status}: ${raw.slice(0, 200)}` }, { status: r.status })
  }
  return json({ ok: true })
}
