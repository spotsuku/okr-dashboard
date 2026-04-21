// Gmail で「要返信スレッド」を取得
// GET /api/integrations/gmail/threads?owner=<name>
//
// ロジック:
//   1. in:inbox -from:me older_than:3d でスレッド一覧を取得
//   2. 各スレッドの最新メッセージが自分発なら「返信済み」として除外
//   3. 最新の「相手からのメッセージ」を抽出し、To/Cc を判定
//      - to に自分が含まれる  → category: 'to'  (要対応)
//      - cc のみに自分        → category: 'cc'  (要確認)
//      - どちらも該当しない    → category: 'other'
//   4. to を優先、次に cc の順で並べて返す
import { getIntegration, json } from '../../_shared'

// "名前 <addr@example.com>" → { name, email }
function parseAddress(raw) {
  if (!raw) return { name: '', email: '' }
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/)
  if (m) return { name: (m[1] || '').trim(), email: m[2].trim().toLowerCase() }
  return { name: '', email: raw.trim().toLowerCase() }
}

function parseAddressList(raw) {
  if (!raw) return []
  // カンマで分割 (簡易: quoted 名前内のカンマは考慮しないが実用上OK)
  return raw.split(',').map(s => parseAddress(s)).filter(a => a.email)
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  // scope: 'reply_needed' (default, ダッシュボード) | 'all' (メールタブ)
  const scope = url.searchParams.get('scope') || 'reply_needed'
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10), 1), 50)

  const result = await getIntegration(owner, 'google_gmail')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
  }, { status: 401 })

  const token = result.integration.access_token
  const myEmail = (result.integration.metadata?.email || '').toLowerCase()

  // scope に応じた検索クエリ
  const rawQuery = scope === 'all'
    ? 'in:inbox -from:me'                  // 最近の受信一覧 (返信済みも含む)
    : 'in:inbox -from:me older_than:3d'    // 要返信候補 (3日以上前)
  const query = encodeURIComponent(rawQuery)

  // 取得数: 返信済みフィルタで半分くらい弾ける前提で多めに取得
  const fetchCount = Math.min(limit * 3, 50)

  try {
    // 1. スレッド一覧
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=${fetchCount}`
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!listRes.ok) {
      const body = await listRes.text()
      return json({ error: `Gmail API ${listRes.status}: ${body.slice(0, 200)}` }, { status: listRes.status })
    }
    const listData = await listRes.json()
    const threadIds = (listData.threads || []).map(t => t.id).slice(0, fetchCount)

    // 2. 各スレッド詳細を並列取得
    const metaHeaders = ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'Date',
                         'List-Unsubscribe', 'Precedence', 'Auto-Submitted', 'X-Auto-Response-Suppress']
    const headerQs = metaHeaders.map(h => `metadataHeaders=${encodeURIComponent(h)}`).join('&')

    const threads = await Promise.all(threadIds.map(async tid => {
      const tRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tid}?format=metadata&${headerQs}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!tRes.ok) return null
      return tRes.json()
    }))

    const items = []
    for (const t of threads) {
      if (!t || !Array.isArray(t.messages) || t.messages.length === 0) continue
      const messages = t.messages
      const last = messages[messages.length - 1]
      const lastHeaders = last.payload?.headers || []
      const getH = (msgHeaders, name) =>
        msgHeaders.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
      const lastFrom = parseAddress(getH(lastHeaders, 'From'))

      // scope=reply_needed の場合は、最新が自分発なら返信済みとみなし除外
      // scope=all の場合は返信済みも含めて表示 (ただしマーク付け)
      const replied = myEmail && lastFrom.email === myEmail
      if (scope !== 'all' && replied) continue

      // scope=all で最新が自分発の場合は、その一つ前の相手メッセージを採用
      let reply = last
      if (scope === 'all' && replied && messages.length >= 2) {
        for (let i = messages.length - 2; i >= 0; i--) {
          const fh = messages[i].payload?.headers || []
          const fromE = parseAddress(getH(fh, 'From')).email
          if (fromE !== myEmail) { reply = messages[i]; break }
        }
      }
      const rh = reply.payload?.headers || []
      const fromStr = getH(rh, 'From')
      const from = parseAddress(fromStr)
      const toList = parseAddressList(getH(rh, 'To'))
      const ccList = parseAddressList(getH(rh, 'Cc'))

      // To / Cc 判定
      let category = 'other'
      if (myEmail) {
        const inTo = toList.some(a => a.email === myEmail)
        const inCc = ccList.some(a => a.email === myEmail)
        if (inTo) category = 'to'
        else if (inCc) category = 'cc'
      }

      // ─── bulk (通知/キャンペーン) 判定 ───
      // 1. List-Unsubscribe 付き → ほぼ確実に一斉配信
      const listUnsub = getH(rh, 'List-Unsubscribe')
      // 2. Precedence: bulk/list/junk → 一括送信
      const precedence = (getH(rh, 'Precedence') || '').toLowerCase()
      // 3. Auto-Submitted: auto-generated/auto-replied → 自動生成
      const autoSub = (getH(rh, 'Auto-Submitted') || '').toLowerCase()
      // 4. From がシステムアドレス (noreply@ / notifications@ 等)
      const fromLocal = (from.email || '').split('@')[0] || ''
      const isNoReplyAddr = /^(no[-._]?reply|do[-._]?not[-._]?reply|notifications?|alerts?|mailer|postmaster|info|news|newsletter|support[-._]?noreply|bounce|auto|system|automated|notice|notify|marketing|campaign|promo)(@|$|[-._])/i.test(from.email || '')
        || /^(no[-._]?reply|do[-._]?not[-._]?reply|notifications?|alerts?|mailer|postmaster|newsletter|bounce|automated|notice|notify|marketing|campaign|promo)$/i.test(fromLocal)

      const isBulk = !!listUnsub
        || precedence === 'bulk' || precedence === 'list' || precedence === 'junk'
        || (autoSub && autoSub !== 'no')
        || isNoReplyAddr

      items.push({
        id: reply.id,                       // AI assist & draft 用のメッセージID
        threadId: t.id,                     // draft をスレッドに紐付けるため
        from: from.name || from.email || fromStr.replace(/<.*>/, '').trim() || '(不明)',
        fromEmail: from.email,              // 返信先として使う
        subject: getH(rh, 'Subject') || '(件名なし)',
        snippet: reply.snippet || '',
        messageIdHeader: getH(rh, 'Message-ID'),  // In-Reply-To 用
        date: getH(rh, 'Date'),
        category,
        replied,                            // scope=all のとき「返信済み」表示用
        bulk: isBulk,                       // 通知/メルマガ/一斉配信か
      })
    }

    // reply_needed: 人からのメール(非bulk) 優先 → to/cc → bulk最後
    // all: 日付降順 (Gmail 返却順をそのまま、bulk も含める)
    if (scope !== 'all') {
      const rank = (it) => {
        if (it.bulk) return 10                 // 通知は末尾
        if (it.category === 'to') return 0
        if (it.category === 'cc') return 1
        return 2
      }
      items.sort((a, b) => rank(a) - rank(b))
    }

    return json({ items: items.slice(0, limit) })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
