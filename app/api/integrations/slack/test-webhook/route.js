// 任意の Slack Incoming Webhook URL にテスト投稿する API
// POST /api/integrations/slack/test-webhook  Body: { url, text? }
// ブラウザから直接 hooks.slack.com を叩くと CORS で弾かれるため、
// サーバー経由で送る用のプロキシエンドポイント。

export const dynamic = 'force-dynamic'

function json(body, init) {
  return new Response(JSON.stringify(body), {
    ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

export async function POST(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'リクエストBodyのJSONが不正です' }, { status: 400 })
  }
  const { url, text } = payload || {}
  if (!url || typeof url !== 'string') {
    return json({ error: 'url is required' }, { status: 400 })
  }
  if (!/^https:\/\/hooks\.slack\.com\/services\//.test(url)) {
    return json({ error: 'Slack Incoming Webhook の URL ではありません' }, { status: 400 })
  }
  const messageText = (typeof text === 'string' && text.trim())
    ? text
    : '✅ テスト通知: 共有・確認事項チャンネルへのSlack通知が正常に動作しています'
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: messageText }),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return json({ error: `Slack returned HTTP ${r.status}: ${t.slice(0, 200)}` }, { status: 502 })
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}
