// Gmail の返信下書きを作成
// POST /api/integrations/gmail/create-draft
// Body: { owner, threadId, messageId, to, subject, messageIdHeader, body }
// Response: { draftId, threadId, openUrl }
//
// 下書きは threadId 指定で「元スレッドへの返信」として作成される。
// In-Reply-To / References ヘッダを付けて、Gmail 上でも「返信」として扱われる。

import { getIntegration, json } from '../../_shared'

// RFC 2822 メッセージを base64url に
function buildRawMessage({ to, subject, inReplyTo, body }) {
  const replySubject = /^re:/i.test(subject || '') ? subject : `Re: ${subject || ''}`
  const headers = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(replySubject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ]
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`)
    headers.push(`References: ${inReplyTo}`)
  }
  const rfc = headers.join('\r\n') + '\r\n\r\n' + (body || '')
  // Gmail API は base64url (RFC 4648 §5)
  return Buffer.from(rfc, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(request) {
  let payload
  try { payload = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, threadId, to, subject, messageIdHeader, body } = payload || {}
  if (!owner) return json({ error: 'owner が必要です' }, { status: 400 })
  if (!to) return json({ error: '送信先(to) が必要です' }, { status: 400 })

  const result = await getIntegration(owner, 'google_gmail')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
  }, { status: 401 })

  // gmail.compose スコープを持っているか確認
  const scope = result.integration.scope || ''
  if (!/gmail\.compose/.test(scope)) {
    return json({
      error: 'Gmail 連携のスコープに gmail.compose が含まれていません。再連携してください。',
    }, { status: 403 })
  }

  const token = result.integration.access_token
  const raw = buildRawMessage({ to, subject, inReplyTo: messageIdHeader, body })

  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: threadId ? { raw, threadId } : { raw },
      }),
    })
    const data = await r.json()
    if (!r.ok) {
      return json({
        error: `下書き作成失敗 ${r.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`,
      }, { status: r.status })
    }
    // 返却: 下書きID / 作成先スレッドID / Gmail を開くための URL
    const draftId = data.id
    const resolvedThreadId = data.message?.threadId || threadId
    const openUrl = resolvedThreadId
      ? `https://mail.google.com/mail/u/0/#inbox/${resolvedThreadId}`
      : 'https://mail.google.com/mail/u/0/#drafts'
    return json({ draftId, threadId: resolvedThreadId, openUrl })
  } catch (e) {
    return json({ error: `下書き作成例外: ${e.message}` }, { status: 500 })
  }
}
