// Gmail の返信下書きを作成
// POST /api/integrations/gmail/create-draft
// Body: { owner, threadId, messageId, to, subject, messageIdHeader, body }
// Response: { draftId, threadId, openUrl }
//
// 下書きは threadId 指定で「元スレッドへの返信」として作成される。
// In-Reply-To / References ヘッダを付けて、Gmail 上でも「返信」として扱われる。

import { getIntegration, refreshIntegration, json } from '../../_shared'

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

async function fetchTokenInfo(token) {
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
    const j = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, scope: j.scope || '', error: j.error || j.error_description || '' }
  } catch (e) {
    return { ok: false, status: 0, scope: '', error: e.message }
  }
}

async function callGmailDrafts(token, threadId, raw) {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: threadId ? { raw, threadId } : { raw } }),
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
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

  let integration = result.integration
  let token = integration.access_token

  // Step 1: tokeninfo で実トークンの有効性とスコープを確認
  let info = await fetchTokenInfo(token)

  // トークン自体が無効 → refresh_token で再発行を試行
  if (!info.ok && integration.refresh_token) {
    try {
      integration = await refreshIntegration(integration)
      token = integration.access_token
      info = await fetchTokenInfo(token)
    } catch (e) {
      return json({
        error: `保存されたアクセストークンが無効 (${info.error || info.status}) + 自動リフレッシュ失敗: ${e.message}。再連携してください。`,
      }, { status: 401 })
    }
  }

  if (!info.ok) {
    return json({
      error: `アクセストークンが Google に拒否されました (${info.error || info.status})。再連携してください。`,
    }, { status: 401 })
  }

  // Step 2: gmail.compose スコープ確認 (実トークンベース)
  // gmail.modify / mail.google.com/ (フル) でも drafts.create 可
  const liveScope = info.scope || ''
  const canCreateDraft = /gmail\.compose|gmail\.modify|mail\.google\.com\//.test(liveScope)
  if (!canCreateDraft) {
    const hasReadOnly = /gmail\.readonly/.test(liveScope)
    const hint = hasReadOnly
      ? 'gmail.readonly は付与されていますが gmail.compose がありません。Google Cloud Console の「OAuth 同意画面」→「スコープ」で .../auth/gmail.compose を追加してから、Gmail を連携解除 → 再連携してください。'
      : 'Gmail 連携のスコープが不十分です。再連携してください。'
    return json({
      error: `下書き作成に必要な権限(gmail.compose)が不足しています。${hint} (現在のトークンスコープ: ${liveScope || '(空)'})`,
      needsScope: 'gmail.compose',
      currentScope: liveScope,
    }, { status: 403 })
  }

  // Step 3: 下書き作成 (401 時は refresh して一度だけ再試行)
  const raw = buildRawMessage({ to, subject, inReplyTo: messageIdHeader, body })
  let apiResult = await callGmailDrafts(token, threadId, raw)

  if (!apiResult.ok && apiResult.status === 401 && integration.refresh_token) {
    try {
      integration = await refreshIntegration(integration)
      token = integration.access_token
      apiResult = await callGmailDrafts(token, threadId, raw)
    } catch (e) {
      return json({
        error: `Gmail API が 401 を返し、リフレッシュにも失敗: ${e.message}。再連携してください。`,
      }, { status: 401 })
    }
  }

  if (!apiResult.ok) {
    const apiMsg = apiResult.data.error?.message || JSON.stringify(apiResult.data).slice(0, 200)
    const hint = apiResult.status === 403 ? ` (実トークンのスコープ: ${liveScope})` : ''
    return json({
      error: `下書き作成失敗 ${apiResult.status}: ${apiMsg}${hint}。再連携してください。`,
    }, { status: apiResult.status })
  }

  const data = apiResult.data
  const draftId = data.id
  const resolvedThreadId = data.message?.threadId || threadId
  const openUrl = resolvedThreadId
    ? `https://mail.google.com/mail/u/0/#inbox/${resolvedThreadId}`
    : 'https://mail.google.com/mail/u/0/#drafts'
  return json({ draftId, threadId: resolvedThreadId, openUrl })
}
