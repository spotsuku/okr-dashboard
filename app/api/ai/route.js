export async function POST(request) {
  const { messages, context } = await request.json()

  const systemPrompt = `あなたはOKR（目標と主要成果）の専門コーチです。
ユーザーの組織のOKRを支援します。

現在のOKRデータ:
${context ? JSON.stringify(context, null, 2) : 'データなし'}

以下の役割を担います:
- OKRの案を提案する
- 入力されたOKRへのフィードバック
- 目標達成のアドバイス
- OKRのベストプラクティスの共有

回答は日本語で、具体的かつ実践的にしてください。
OKRの提案をする場合は、目標(Objective)と主要成果(Key Results)を明確に分けて提示してください。`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    }),
  })

  const data = await response.json()
  
  if (!response.ok) {
    return Response.json({ error: data.error?.message || 'AIエラーが発生しました' }, { status: 500 })
  }

  return Response.json({ content: data.content[0].text })
}
