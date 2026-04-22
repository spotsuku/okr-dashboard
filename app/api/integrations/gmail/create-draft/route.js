// Gmail: 下書きを作成して Gmail で開けるようにする
// POST /api/integrations/gmail/create-draft
// Body: { owner, threadId, messageIdHeader, to, subject, body }
// Response: { draftId, threadId, openUrl } | { error, needsScope?, status? }

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

// UTF-8 文字列を RFC 4648 §5 の base64url (パディングなし) に変換
function toBase64Url(str) {
  const b64 = Buffer.from(str, 'utf-8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 件名に Re: が付いていなければ付ける
function ensureReSubject(subject) {
  const s = (subject || '').trim()
  if (!s) return 'Re: (件名なし)'
  if (/^re:/i.test(s)) return s
  return `Re: ${s}`
}

// RFC 2047 MIME encoded-word で件名をエンコード (UTF-8 / base64)
function encodeSubjectMime(subject) {
  // ASCII のみなら生のまま
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject
  const b64 = Buffer.from(subject, 'utf-8').toString('base64')
  return `=?UTF-8?B?${b64}?=`
}

export async function POST(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'リクエストBodyのJSONが不正です' }, { status: 400 })
  }

  const { owner, threadId, messageIdHeader, to, subject, body } = payload || {}
  if (!owner) return json({ error: 'owner が未指定です' }, { status: 400 })
  if (!to) return json({ error: '宛先 (to) が未指定です' }, { status: 400 })
  if (!body) return json({ error: '本文 (body) が未指定です' }, { status: 400 })

  const result = await getIntegration(owner, 'google')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) {
    return json({
      error: result.refreshError
        ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
        : 'トークン期限切れ。再連携してください',
      needsReauth: true,
    }, { status: 401 })
  }

  const integration = result.integration

  // gmail.compose スコープがなければ 403
  const scopeStr = integration.scope || ''
  if (!scopeStr.includes('https://www.googleapis.com/auth/gmail.compose')) {
    return json({
      error: 'gmail.compose スコープが不足しています。連携タブから再連携して「下書きの管理とメール送信」を許可してください',
      needsScope: 'gmail.compose',
    }, { status: 403 })
  }

  // MIME メッセージ組み立て (UTF-8 / quoted 本文はシンプルに 8bit で)
  const fromEmail = integration.metadata?.email || ''
  const finalSubject = ensureReSubject(subject)
  const encodedSubject = encodeSubjectMime(finalSubject)

  const headers = []
  if (fromEmail) headers.push(`From: ${fromEmail}`)
  headers.push(`To: ${to}`)
  headers.push(`Subject: ${encodedSubject}`)
  if (messageIdHeader) {
    headers.push(`In-Reply-To: ${messageIdHeader}`)
    headers.push(`References: ${messageIdHeader}`)
  }
  headers.push('MIME-Version: 1.0')
  headers.push('Content-Type: text/plain; charset=UTF-8')
  headers.push('Content-Transfer-Encoding: 8bit')

  const raw = headers.join('\r\n') + '\r\n\r\n' + body
  const encodedRaw = toBase64Url(raw)

  const apiUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'

  try {
    const { response: r } = await callGoogleApiWithRetry(integration, async (token) => {
      return fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            raw: encodedRaw,
            ...(threadId ? { threadId } : {}),
          },
        }),
      })
    })

    if (r.status === 401) {
      return json({
        error: 'Gmail のアクセストークンが無効です。再連携してください',
        needsReauth: true,
      }, { status: 401 })
    }
    if (r.status === 403) {
      const t = await r.text().catch(() => '')
      return json({
        error: `下書き作成が拒否されました: ${t.slice(0, 200)}`,
        needsScope: 'gmail.compose',
        status: 403,
      }, { status: 403 })
    }
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return json({
        error: `Gmail API ${r.status}: ${t.slice(0, 200)}`,
        status: r.status,
      }, { status: r.status })
    }

    const data = await r.json()
    const resolvedThreadId = data?.message?.threadId || threadId || ''
    const openUrl = resolvedThreadId
      ? `https://mail.google.com/mail/u/0/#inbox/${resolvedThreadId}`
      : 'https://mail.google.com/mail/u/0/#drafts'

    return json({
      draftId: data?.id || null,
      threadId: resolvedThreadId,
      openUrl,
    })
  } catch (e) {
    return json({ error: `下書き作成失敗: ${e.message || e}` }, { status: 500 })
  }
}
