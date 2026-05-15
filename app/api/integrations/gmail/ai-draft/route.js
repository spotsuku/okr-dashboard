// Gmail: AI で返信草稿を生成
// POST /api/integrations/gmail/ai-draft
// Body: { owner, subject, from, snippet, body? }
// Response: { draft: string } | { error: string }

export const dynamic = 'force-dynamic'

import { json } from '../../_shared'
import { callClaude, AICallError } from '../../../../../lib/aiCall'

export async function POST(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'リクエストBodyのJSONが不正です' }, { status: 400 })
  }

  const { owner, subject, from, snippet, body } = payload || {}
  if (!subject && !snippet && !body) {
    return json({ error: '件名・本文・スニペットのいずれかが必要です' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY が未設定です' }, { status: 500 })
  }

  // From ヘッダから宛先の名前部分を抽出（"名前" <mail@...> 形式にも対応）
  function extractName(fromStr) {
    if (!fromStr) return ''
    const m = fromStr.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)
    if (m) return m[1].trim()
    // 名前だけ or アドレスだけのケース
    const atIdx = fromStr.indexOf('@')
    if (atIdx > 0) return fromStr.slice(0, atIdx).trim()
    return fromStr.trim()
  }
  const recipientName = extractName(from || '') || '（差出人不明）'

  // 本文候補（body があれば優先、なければ snippet）
  const sourceBody = (body && body.trim()) || (snippet || '').trim() || '(本文なし)'

  const systemPrompt = `あなたは日本語ビジネスメールの返信草稿を作成するアシスタントです。
以下のルールに従って、丁寧で簡潔な返信文を作成してください:

【構成】
- 冒頭: 「○○様」で始める（差出人の名前を使う。苗字のみでも可）
- 本文: お礼・受領確認 + 内容への応答 or 次のアクション提示
- 結び: 「よろしくお願いいたします。」などで締める

【トーン】
- 丁寧かつ簡潔。敬語を適切に使用
- 200〜400文字程度に収める
- 絵文字は使わない
- 返信内容に確信が持てない部分は「〜について確認のうえご連絡いたします」のように保留で書く

【出力フォーマット】
- 返信本文のみを出力する（件名や署名、前置きの説明は不要）
- Markdown や記号装飾は不要、プレーンテキストで
- 改行は自然な段落区切りで入れる`

  const userPrompt = `以下のメールに対する返信草稿を作成してください。

---
差出人: ${from || '(不明)'}
宛名（推定）: ${recipientName}様
件名: ${subject || '(件名なし)'}
本文/スニペット:
${sourceBody}
---

${owner ? `（返信者は「${owner}」さんです。署名は付けないでください。）` : ''}

上記の構成・トーンに従って返信本文のみを日本語で出力してください。`

  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const draft = (data?.content?.[0]?.text || '').trim()
    if (!draft) {
      return json({ error: 'AIが返信文を生成できませんでした' }, { status: 500 })
    }
    return json({ draft })
  } catch (e) {
    if (e instanceof AICallError) {
      return json({ error: e.userMessage }, { status: e.retryable ? 503 : 500 })
    }
    return json({ error: `生成失敗: ${e.message || e}` }, { status: 500 })
  }
}
