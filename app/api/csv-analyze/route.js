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

  // ─── KA解析プロンプト ────────────────────────────────────────────────────
  const kaSystemPrompt = `あなたはKA（Key Action）データのCSV解析AIです。
与えられたCSVテキストを解析し、以下のJSONフォーマットで返してください。
出力フォーマット（JSONのみ、前後に説明文やバッククォートは不要）:
{
  "rows": [
    {
      "kaTitle": "KAタイトル",
      "owner": "担当者名",
      "department": "部署名（下記リストから最も近いものを選ぶ）",
      "status": "normal|focus|good|more",
      "weekStart": "YYYY-MM-DD形式の月曜日",
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
  （例：「内容」「タスク」「アクション」→kaTitle、「担当」「責任者」→owner）
- 部署名はリストの中から最も近いものに補正する
- ステータスは以下に統一する:
  「未分類」「なし」「-」→ normal
  「注力」「フォーカス」「focus」「🎯」→ focus
  「good」「良い」「達成」「✅」→ good
  「more」「課題」「改善」「🔺」→ more
- 週の日付は必ず月曜日に補正する（例：2026-03-18(水)→2026-03-16(月)）
- 日付が未入力の場合は今週の月曜日を使用する
- 全角数字・全角英字は半角に変換する
- 担当者名のスペースを整える
- 補正した内容はfixesに日本語で記録する
- KAタイトルが空の行はスキップする
- データに問題があればwarningsをカウントする`

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
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return Response.json(parsed)
  } catch (e) {
    return Response.json({ error: 'AIの応答をパースできませんでした' }, { status: 500 })
  }
}
