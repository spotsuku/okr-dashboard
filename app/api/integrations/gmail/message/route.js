// Gmail メール単体の全文取得 (AI には通さない、軽量)
// GET /api/integrations/gmail/message?owner=<name>&messageId=<id>

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

function decodeBase64Url(s) {
  if (!s) return ''
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  try { return Buffer.from(b64, 'base64').toString('utf-8') } catch { return '' }
}

function extractPlainText(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.parts && payload.parts.length) {
    for (const p of payload.parts) {
      const txt = extractPlainText(p)
      if (txt) return txt
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data)
    return html.replace(/<style[\s\S]*?<\/style>/gi, '')
               .replace(/<script[\s\S]*?<\/script>/gi, '')
               .replace(/<[^>]+>/g, '')
               .replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/\n{3,}/g, '\n\n')
  }
  return ''
}

function parseAddress(raw) {
  if (!raw) return { name: '', email: '' }
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/)
  if (m) return { name: (m[1] || '').trim(), email: m[2].trim() }
  return { name: '', email: raw.trim() }
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const messageId = url.searchParams.get('messageId')
  if (!owner || !messageId) {
    return json({ error: 'owner と messageId が必要です' }, { status: 400 })
  }

  const result = await getIntegration(owner, 'google_gmail')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
  }, { status: 401 })

  try {
    const { response: r } = await callGoogleApiWithRetry(result.integration, (token) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
    )
    if (!r.ok) {
      const text = await r.text()
      const hint = r.status === 401 ? '。再連携してください。' : ''
      return json({ error: `Gmail API ${r.status}: ${text.slice(0, 200)}${hint}` }, { status: r.status })
    }
    const msg = await r.json()
    const headers = msg.payload?.headers || []
    const getH = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
    const fromRaw = getH('From')
    const from = parseAddress(fromRaw)
    const body = extractPlainText(msg.payload) || msg.snippet || ''

    return json({
      id: messageId,
      threadId: msg.threadId,
      from: from.name || from.email || fromRaw,
      fromEmail: from.email,
      to: getH('To'),
      cc: getH('Cc'),
      subject: getH('Subject'),
      date: getH('Date'),
      messageIdHeader: getH('Message-ID'),
      body,
      snippet: msg.snippet || '',
    })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
