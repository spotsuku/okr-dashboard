export async function POST(request) {
  const { csvText, departments } = await request.json()

  const systemPrompt = `あなたはOKRデータのCSV解析AIです。
与えられたCSVテキストを解析し、以下のJSONフォーマットのみで返してください。
前後に説明文、バッククォート、コードブロック記号は一切含めないでください。
必ず有効なJSONのみを返してください。

出力フォーマット:
{"rows":[{"title":"目標タイトル","owner":"担当者名","department":"部署名","period":"q1|q2|q3|q4|annual","krs":[{"title":"KRタイトル","target":数値,"current":数値,"unit":"単位"}],"fixes":["補正内容"]}],"summary":{"total":件数,"fixed":補正数,"warnings":警告数}}

利用可能な部署名リスト: ${(departments || []).join(', ')}

補正ルール:
- 列名が異なっても意味から推測してマッピングする
- 部署名はリストの中から最も近いものに補正する
- 期間は q1/q2/q3/q4/annual に統一する（「第1四半期」「Q1」「1Q」→「q1」、「通期」「年間」→「annual」）
- 全角数字は半角に変換する
- target/currentが文字列の場合は数値に変換する（「2.4億円」→240000000など）
- 補正した内容はfixesに日本語で記録する
- OKRとして意味のある行のみ抽出する（ヘッダー行・メモ行・空行は無視）`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `以下のCSVを解析してください:\n\n${csvText}` }],
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    return Response.json({ error: data.error?.message || 'AI解析エラーが発生しました' }, { status: 500 })
  }

  try {
    const text = data.content[0].text

    // バッククォート・コードブロック除去
    let clean = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    // JSON部分だけ抽出（{から始まる部分を探す）
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      clean = clean.slice(start, end + 1)
    }

    const parsed = JSON.parse(clean)
    return Response.json(parsed)
  } catch (e) {
    console.error('Parse error:', e, 'Raw response:', data.content?.[0]?.text?.slice(0, 500))
    return Response.json({ error: 'AIの応答をパースできませんでした。CSVの形式を確認してください。' }, { status: 500 })
  }
}
