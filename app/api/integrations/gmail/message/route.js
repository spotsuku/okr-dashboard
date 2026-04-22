// Gmail メール本文 (全文) を取得
// GET /api/integrations/gmail/message?owner=<name>&id=<messageId>
//
// text/plain があればそれを、なければ text/html を plain text に変換して返す

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

function decodeBase64Url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf-8')
}

// MIME ツリーを再帰走査して text/plain と text/html を集める
function extractBody(payload) {
  let text = ''
  let html = ''
  function walk(part) {
    if (!part) return
    const mime = part.mimeType
    if (mime === 'text/plain' && part.body?.data) {
      text += decodeBase64Url(part.body.data)
    } else if (mime === 'text/html' && part.body?.data) {
      html += decodeBase64Url(part.body.data)
    } else if (Array.isArray(part.parts)) {
      part.parts.forEach(walk)
    }
  }
  walk(payload)
  return { text, html }
}

// html → plain text の簡易変換 (text/plain がない時のフォールバック)
function htmlToText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n・')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const id = url.searchParams.get('id')
  if (!id) return json({ error: 'id が必要です' }, { status: 400 })

  const result = await getIntegration(owner, 'google')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
    needsReauth: true,
  }, { status: 401 })

  try {
    const apiUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
    const { response: r } = await callGoogleApiWithRetry(result.integration, async (token) => {
      return fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } })
    })
    if (r.status === 401) {
      return json({ error: 'Gmail のアクセストークンが無効です', needsReauth: true }, { status: 401 })
    }
    if (!r.ok) {
      const body = await r.text()
      return json({ error: `Gmail API ${r.status}: ${body.slice(0, 200)}` }, { status: r.status })
    }
    const m = await r.json()
    const { text, html } = extractBody(m.payload)
    const body = text.trim() || (html ? htmlToText(html) : '')
    return json({
      id: m.id,
      threadId: m.threadId,
      text: body,
      snippet: m.snippet || '',
    })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
