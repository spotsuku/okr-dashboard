export async function POST(request) {
  try {
    const { messages, context } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages is required' }, { status: 400 })
    }

    // OKRコーチとしてのシステムプロンプト
    const contextStr = context ? JSON.stringify(context, null, 0) : '(データなし)'
    const systemPrompt = `あなたは「OKR AIコーチ」です。ユーザーのOKR目標達成を支援する専門コーチとして、以下の役割を果たしてください。

【役割】
- OKRの進捗に対する具体的・実行可能なアドバイスを提供する
- 今週やるべきことを明確にし、優先順位を提案する
- ユーザーの努力を認め、モチベーションを高める
- 課題や障壁に対する解決策を一緒に考える
- KR達成に向けた戦略的なアドバイスを提供する

【回答ルール】
- 必ず日本語で回答する
- 簡潔かつ具体的に回答する（箇条書きを活用）
- 抽象的なアドバイスではなく、明日からできる具体的なアクションを提案する
- ユーザーの頑張りを認め、ポジティブなフィードバックを含める
- データに基づいた分析を行う

【ユーザーのOKRデータ】
${contextStr}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return Response.json({ error: data.error?.message || 'AI APIエラーが発生しました' }, { status: 500 })
    }

    const content = data.content?.[0]?.text || 'レスポンスを取得できませんでした'
    return Response.json({ content })
  } catch (e) {
    console.error('AI chat error:', e)
    return Response.json({ error: 'エラーが発生しました: ' + e.message }, { status: 500 })
  }
}
