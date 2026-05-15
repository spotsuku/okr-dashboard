// app/api/ai-feedback/route.js
import { callClaude, AICallError } from '../../../lib/aiCall'

export async function POST(req) {
  try {
    const { prompt } = await req.json()

    const data = await callClaude({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const feedback = data.content?.[0]?.text || 'フィードバックを取得できませんでした'
    return Response.json({ feedback })
  } catch (error) {
    if (error instanceof AICallError) {
      return Response.json({ feedback: error.userMessage }, { status: error.retryable ? 503 : 500 })
    }
    return Response.json({ feedback: 'エラーが発生しました: ' + error.message }, { status: 500 })
  }
}
