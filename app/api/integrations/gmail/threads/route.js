// Gmail: To/Cc に自分が含まれる重要メールを取得
// GET /api/integrations/gmail/threads?owner=<name>&limit=5&category=<important|notification|all>
//
// category:
//   important    - To または Cc に自分 + 通知系でない (デフォルト)
//   notification - 通知・キャンペーン系
//   all          - 全て (分類フラグ付き)

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

// ヘッダから値取得
function getHeader(headers, name) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// 通知/キャンペーン判定
function isNotificationMail(headers, from) {
  const listUnsubscribe = getHeader(headers, 'list-unsubscribe')
  const precedence = getHeader(headers, 'precedence').toLowerCase()
  if (listUnsubscribe) return true
  if (precedence === 'bulk' || precedence === 'list' || precedence === 'junk') return true
  if (/noreply|no-reply|no_reply|notification|notifications|mailer|newsletter|info@|support@|donotreply/i.test(from)) return true
  return false
}

// カテゴリ分類
function classify(message, myEmail) {
  const headers = message.payload?.headers || []
  const from = getHeader(headers, 'from')
  const to = getHeader(headers, 'to').toLowerCase()
  const cc = getHeader(headers, 'cc').toLowerCase()
  const me = (myEmail || '').toLowerCase()

  if (isNotificationMail(headers, from)) return 'notification'
  if (me && to.includes(me)) return 'to_me'          // 返信必要
  if (me && cc.includes(me)) return 'cc_me'          // 確認必要
  return 'other'                                     // Bcc想定 or その他
}

// From ヘッダから名前部分を抽出 ("名前" <mail@...>  or  mail@...)
function extractFromName(from) {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)
  if (m) return m[1].trim()
  return from.trim()
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 5))
  const category = url.searchParams.get('category') || 'important'

  const result = await getIntegration(owner, 'google')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
    needsReauth: true,
  }, { status: 401 })

  const integration = result.integration
  const myEmail = integration.metadata?.email || ''

  // 候補数を多めに取って分類後 filter (通知系も混ざるため)
  const fetchCount = Math.min(50, limit * 4)
  // in:inbox かつ 自分宛 or Cc (category==notification 時は広く)
  const query = category === 'notification'
    ? 'in:inbox -category:primary newer_than:7d'
    : `in:inbox newer_than:7d`
  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${fetchCount}`

  try {
    // 1. メッセージ ID リスト取得
    const { response: listRes, integration: integ1 } = await callGoogleApiWithRetry(integration, async (token) => {
      return fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } })
    })
    if (listRes.status === 401) {
      return json({
        error: 'Gmail のアクセストークンが無効です。連携解除→再連携してください',
        needsReauth: true,
      }, { status: 401 })
    }
    if (!listRes.ok) {
      const body = await listRes.text()
      return json({ error: `Gmail API ${listRes.status}: ${body.slice(0, 200)}` }, { status: listRes.status })
    }
    const listData = await listRes.json()
    const messageIds = (listData.messages || []).slice(0, fetchCount).map(m => m.id)

    if (messageIds.length === 0) return json({ items: [], myEmail })

    // 2. 各メッセージのメタデータを並列取得
    const items = await Promise.all(messageIds.map(async id => {
      const mUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence`
      const { response: mRes } = await callGoogleApiWithRetry(integ1, async (token) => {
        return fetch(mUrl, { headers: { Authorization: `Bearer ${token}` } })
      })
      if (!mRes.ok) return null
      const m = await mRes.json()
      const headers = m.payload?.headers || []
      const category_ = classify(m, myEmail)
      const from = getHeader(headers, 'from')
      return {
        id,
        threadId: m.threadId,
        from: extractFromName(from) || '(不明)',
        fromRaw: from,
        subject: getHeader(headers, 'subject') || '(件名なし)',
        snippet: m.snippet || '',
        date: getHeader(headers, 'date'),
        messageIdHeader: getHeader(headers, 'message-id'),
        category: category_,
        labelIds: m.labelIds || [],
      }
    }))

    const filtered = items.filter(Boolean)

    // カテゴリフィルタリング
    let result_ = filtered
    if (category === 'important') {
      // To/Cc に自分 + 通知以外
      result_ = filtered.filter(it => it.category === 'to_me' || it.category === 'cc_me')
    } else if (category === 'notification') {
      result_ = filtered.filter(it => it.category === 'notification')
    }
    // category==='all' なら全て返す

    return json({
      items: result_.slice(0, limit),
      myEmail,
      allItems: category === 'all' ? filtered : undefined,
    })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
