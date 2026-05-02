// Gmail: To/Cc に自分が含まれる重要メールを取得
// GET /api/integrations/gmail/threads?owner=<name>&limit=5&category=<important|notification|invite|all>
//
// category:
//   important    - To または Cc に自分 + 通知/招待でない (デフォルト)
//   notification - 通知・キャンペーン系
//   invite       - カレンダー招待 (Google Calendar からの招待/更新/辞退/キャンセル)
//   all          - 全て (分類フラグ付き)

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'
import { isDemoMode, demoResponse } from '../../../../../lib/demoMocks'

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

// カレンダー招待判定 (件名/from から推定)
// 例: "招待: 会議", "招待 - 更新: MTG", "更新: 〇〇招待", "辞退: ...", "Invitation: ...",
//     "Updated invitation: ...", "Canceled event: ...", "Declined: ..."
function isCalendarInvite(headers, subject, from) {
  if (!subject) return false
  const s = subject.trim()
  // 日本語パターン
  if (/^招待/.test(s)) return true                   // "招待:", "招待 -", "招待 更新:"
  if (/^更新.*招待/.test(s)) return true              // "更新: ...招待"
  if (/^更新された招待/.test(s)) return true
  if (/^(辞退|キャンセル|取り消し)\s*[:：]/.test(s)) return true
  // 英語パターン
  if (/^(Invitation|Updated invitation|Canceled event|Declined|Accepted|Tentative)\s*[:：]/i.test(s)) return true
  // Google Calendar 通知系 from (補助判定)
  if (/calendar-notification@google\.com/i.test(from)) return true
  return false
}

// カテゴリ分類
function classify(message, myEmail) {
  const headers = message.payload?.headers || []
  const from = getHeader(headers, 'from')
  const subject = getHeader(headers, 'subject')
  const to = getHeader(headers, 'to').toLowerCase()
  const cc = getHeader(headers, 'cc').toLowerCase()
  const me = (myEmail || '').toLowerCase()

  if (isCalendarInvite(headers, subject, from)) return 'invite'
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
  if (isDemoMode()) return Response.json(demoResponse('gmail/threads'))
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

    // Gmail API の「Too many concurrent requests」(429) を避けるため、
    // 並列度を制限しつつ 429/503 時は指数バックオフで再試行する
    async function fetchWithBackoff(url, token, maxRetries = 3) {
      let attempt = 0
      let delay = 400
      while (true) {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (r.status !== 429 && r.status !== 503) return r
        if (attempt >= maxRetries) return r
        await new Promise(res => setTimeout(res, delay + Math.random() * 200))
        delay *= 2
        attempt++
      }
    }
    async function runBatched(items, concurrency, fn) {
      const results = new Array(items.length)
      let idx = 0
      const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
          const i = idx++
          if (i >= items.length) return
          results[i] = await fn(items[i], i)
        }
      })
      await Promise.all(workers)
      return results
    }

    // 2. メッセージメタデータ取得 (並列度 5 で制限)
    const items = await runBatched(messageIds, 5, async id => {
      const mUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence`
      const { response: mRes } = await callGoogleApiWithRetry(integ1, async (token) => {
        return fetchWithBackoff(mUrl, token)
      })
      if (!mRes.ok) return null
      const m = await mRes.json()
      const headers = m.payload?.headers || []
      const category_ = classify(m, myEmail)
      const from = getHeader(headers, 'from')
      return {
        id,
        threadId: m.threadId,
        internalDate: Number(m.internalDate || 0),
        from: extractFromName(from) || '(不明)',
        fromRaw: from,
        subject: getHeader(headers, 'subject') || '(件名なし)',
        snippet: m.snippet || '',
        date: getHeader(headers, 'date'),
        messageIdHeader: getHeader(headers, 'message-id'),
        category: category_,
        labelIds: m.labelIds || [],
        replied: false,
        repliedAt: null,
      }
    })

    const filtered = items.filter(Boolean)

    // 2b. 返信済み判定
    //   最適化1: Gmail 検索で「自分が送信 かつ newer_than:7d」のメッセージ群 (SENT 限定) を
    //            1 クエリで取得し、threadId → 自分発の latest internalDate のマップを作る。
    //   これで thread.get を叩く必要がなくなり、API 呼び出しが大幅に減って 429 を回避できる。
    if (myEmail) {
      const sentQuery = encodeURIComponent(`in:sent newer_than:30d`)
      const sentListUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${sentQuery}&maxResults=200`
      const { response: sentListRes } = await callGoogleApiWithRetry(integ1, async (token) => {
        return fetchWithBackoff(sentListUrl, token)
      })
      if (sentListRes.ok) {
        const sentListData = await sentListRes.json().catch(() => ({}))
        // Gmail の messages.list は threadId 込みで返すので metadata 取得不要で threadId を知れる
        const sentIds = (sentListData.messages || []).map(m => ({ id: m.id, threadId: m.threadId }))
        // 対象スレッドに属する sent メッセージだけに絞り、internalDate を取る (並列度 5)
        const targetThreadIds = new Set(filtered.map(it => it.threadId))
        const relevantSent = sentIds.filter(s => targetThreadIds.has(s.threadId))
        // internalDate 取得用に minimal format で fetch (sent は自分発が自明なので From 不要)
        const sentInfo = await runBatched(relevantSent, 5, async s => {
          const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${s.id}?format=minimal`
          const { response: r } = await callGoogleApiWithRetry(integ1, async (token) => {
            return fetchWithBackoff(url, token)
          })
          if (!r.ok) return null
          const m = await r.json().catch(() => null)
          if (!m) return null
          return { threadId: s.threadId, internalDate: Number(m.internalDate || 0) }
        })
        // threadId → 最新の自分発 internalDate
        const latestSentByThread = new Map()
        for (const s of sentInfo) {
          if (!s) continue
          const prev = latestSentByThread.get(s.threadId) || 0
          if (s.internalDate > prev) latestSentByThread.set(s.threadId, s.internalDate)
        }
        filtered.forEach(it => {
          const sentAt = latestSentByThread.get(it.threadId)
          if (sentAt && sentAt > it.internalDate) {
            it.replied = true
            it.repliedAt = new Date(sentAt).toISOString()
          }
        })
      }
    }

    // カテゴリフィルタリング
    let result_ = filtered
    if (category === 'important') {
      // To/Cc に自分 + 通知/招待以外 (classify で invite/notification は既に除外済みだが明示)
      result_ = filtered.filter(it => it.category === 'to_me' || it.category === 'cc_me')
    } else if (category === 'notification') {
      result_ = filtered.filter(it => it.category === 'notification')
    } else if (category === 'invite') {
      result_ = filtered.filter(it => it.category === 'invite')
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
