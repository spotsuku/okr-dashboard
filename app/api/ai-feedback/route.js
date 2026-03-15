// app/api/ai-feedback/route.js
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req) {
  try {
    const { prompt } = await req.json()
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const feedback = message.content[0]?.text || ''
    return Response.json({ feedback })
  } catch (error) {
    return Response.json({ feedback: 'AIフィードバックの取得に失敗しました: ' + error.message }, { status: 500 })
  }
}
