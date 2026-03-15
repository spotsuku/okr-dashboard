export async function POST(request) {
  const { csvText, departments, mode } = await request.json()

  // ─── OKR解析プロンプト ────────────────────────────────────────────────────
  const okrSystemPrompt = `あなたはOKRデータのCSV解析AIです。
与えられたCSVテキストを解析し、以下のJSONフォーマットで返してください。
出力フォーマット（JSONのみ、前後に説明文やバッククォートは不要）:
{
  "rows": [
    {
      "title": "目標タイトル",
      "owner": "担当者名",
      "department": "部署名（下記リストから最も近いものを選ぶ）",
      "period": "q1|q2|q3|q4|annual",
      "krs": [
        { "title": "KRタイトル", "target": 数値, "current": 数値, "unit": "単位" }
      ],
      "fixes": ["補正内容の説明（日本語）"]
    }
  ],
  "summary": {
    "total": 件数,
    "fixed": 補正した件数,
    "warnings": 警告件数
  }
}
利用可能な部署名リスト: ${departments.join(', ')}
補正ルール:
- 列名が異なっても意味から推測してマッピングする
- 部署名はリストの中から最も近いものに補正する
- 期間は q1/q2/q3/q4/annual に統一する（「第1四半期」「Q1」「1Q」→「q1」など）
- 全角数字は半角に変換する
- 担当者名のスペースを整える
- 補正した内容はfixesに日本語で記録する
- データに問題があればwarningsをカウントする`

  // ─── KA解析プロンプト（複雑なシート形式対応） ────────────────────────────
  const kaSystemPrompt = `あなたはKA（Key Action）データのCSV解析AIです。
複雑なスプレッドシート形式のCSVからKAデータを抽出してください。

【重要】このCSVは会議用の複雑なシートです。以下のルールで解析してください：

1. 「部門KA（Key Action）」列または類似の列からKAを抽出する
2. 1つのセルに複数のKA（KA1:〜、KA2:〜 の形式）が含まれる場合は、それぞれを個別の行として展開する
3. KAの担当者は「部門KR責任者」「担当者」「報告担当」などの列から取得する
4. 所属部署は「部署」列または行の文脈から判断する
5. ステータスはGood/More/評価などの列から推測する（記載がなければ normal）
6. 週の日付は今週の月曜日（2026-03-16）をデフォルトとする

出力フォーマット（JSONのみ、前後に説明文やバッククォートは不要）:
{
  "rows": [
    {
      "kaTitle": "KAタイトル（KA1:などのプレフィックスは除去）",
      "owner": "担当者名",
      "department": "部署名（下記リストから最も近いものを選ぶ）",
      "status": "normal|focus|good|more",
      "weekStart": "YYYY-MM-DD形式の月曜日",
      "fixes": ["補正・抽出内容の説明（日本語）"]
    }
  ],
  "summary": {
    "total": 件数,
    "fixed": 補正した件数,
    "warnings": 警告件数
  }
}

利用可能な部署名リスト: ${departments.join(', ')}

補正・抽出ルール:
- 「KA1:」「KA2:」「KA1：」などのプレフィックスを除去してタイトルを抽出する
- 例：「KA1：CSジャーニーの可視化」→ kaTitle: "CSジャーニーの可視化"
- 部署名はリストの中から最も近いものに補正する
- ステータスの推測:
  評価列に「Good」が多い・良い評価 → good
  評価列に「More」が多い・課題が多い → more
  「注力」「フォーカス」→ focus
  記載なし・不明 → normal
- 担当者名は姓のみの場合もある（そのまま使用）
- 空白・ヘッダー・URLのみ・説明文のみの行はスキップ
- KAタイトルが空または見出し行はスキップ
- 補正・抽出内容はfixesに日本語で記録する
- 部署不明・担当者不明はwarningsをカウント
- 必ず全てのKAを漏れなく抽出すること`

  const systemPrompt = mode === 'ka' ? kaSystemPrompt : okrSystemPrompt

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下のCSVを解析して、全てのKAを抽出してください:\n\n${csvText}`
      }],
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    return Response.json({ error: data.error?.message || 'AI解析エラーが発生しました' }, { status: 500 })
  }

  try {
    const text = data.content[0].text
    // JSON部分だけを正規表現で抽出（前後の説明文・バッククォートを除去）
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSONが見つかりません')
    const parsed = JSON.parse(jsonMatch[0].trim())
    return Response.json(parsed)
  } catch (e) {
    console.error('Parse error:', e)
    return Response.json({ error: 'AIの応答をパースできませんでした: ' + e.message }, { status: 500 })
  }
}
