// app/api/ai-feedback/route.js
export async function POST(req) {
  try {
    const { prompt } = await req.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return Response.json({ feedback: 'AIエラー: ' + (data.error?.message || '不明なエラー') }, { status: 500 })
    }

    const feedback = data.content?.[0]?.text || 'フィードバックを取得できませんでした'
    return Response.json({ feedback })
  } catch (error) {
    return Response.json({ feedback: 'エラーが発生しました: ' + error.message }, { status: 500 })
  }
}
