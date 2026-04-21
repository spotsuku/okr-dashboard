// Gmail AI 要約 + 返信草稿生成
// POST /api/integrations/gmail/ai-assist
// Body: { owner, messageId }
// Response: { summary, draft, from, subject }

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

// base64url デコード
function decodeBase64Url(s) {
  if (!s) return ''
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Buffer.from(b64, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

// payload tree から text/plain を抽出
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
  // text/plain 無ければ text/html を最終手段 (タグ除去)
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data)
    return html.replace(/<style[\s\S]*?<\/style>/gi, '')
               .replace(/<script[\s\S]*?<\/script>/gi, '')
               .replace(/<[^>]+>/g, '')
               .replace(/&nbsp;/g, ' ')
               .replace(/\n{3,}/g, '\n\n')
  }
  return ''
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, messageId } = body || {}
  if (!owner || !messageId) return json({ error: 'owner と messageId が必要です' }, { status: 400 })

  const result = await getIntegration(owner, 'google_gmail')
  if (result.error) return json({ error: result.error }, { status: 400 })
  if (result.expired) return json({
    error: result.refreshError
      ? `自動リフレッシュに失敗: ${result.refreshError} 再連携してください`
      : 'トークン期限切れ。再連携してください',
  }, { status: 401 })

  // メール本文を取得 (401時は refresh して再試行)
  let msg
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
    msg = await r.json()
  } catch (e) {
    return json({ error: `メール取得失敗: ${e.message}` }, { status: 500 })
  }

  const headers = msg.payload?.headers || []
  const getH = (name) => headers.find(h => h.name === name)?.value || ''
  const from = getH('From')
  const subject = getH('Subject')
  const fullText = extractPlainText(msg.payload) || msg.snippet || ''
  // 長すぎると AI コストがかさむので6000文字で切る
  const mailText = fullText.slice(0, 6000)

  // Anthropic API に要約 + 返信草稿を依頼
  const anthKey = process.env.ANTHROPIC_API_KEY
  if (!anthKey) return json({ error: 'ANTHROPIC_API_KEY が未設定です' }, { status: 500 })

  const aiPrompt = `以下のメールを処理してください。

【差出人】 ${from}
【件名】 ${subject}
【本文】
${mailText}

以下の JSON 形式で厳密に出力してください (他の文字は出力しない):
{
  "summary": "3〜5文の日本語要約。用件と相手が求めていることを明確に。",
  "draft": "返信草稿 (日本語・丁寧・200〜300字程度)。相手への配慮と具体的な回答 or 次のアクションを含む。"
}`

  let aiData
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: aiPrompt }],
      }),
    })
    aiData = await r.json()
    if (!r.ok) {
      return json({ error: `AI API ${r.status}: ${aiData.error?.message || 'unknown'}` }, { status: 500 })
    }
  } catch (e) {
    return json({ error: `AI API 呼び出し失敗: ${e.message}` }, { status: 500 })
  }

  const rawText = aiData.content?.[0]?.text || ''
  // JSON 抽出 (Claude が余計な前置きを付ける場合のフォールバック)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  let parsed
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
  } catch {
    return json({
      from, subject,
      summary: rawText || '(要約を生成できませんでした)',
      draft: '',
    })
  }

  return json({
    from,
    subject,
    summary: parsed.summary || '',
    draft: parsed.draft || '',
  })
}
