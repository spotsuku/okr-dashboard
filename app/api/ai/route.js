export async function POST(request) {
  try {
    const { messages, context } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages is required' }, { status: 400 })
    }

    // OKRコーチとしてのシステムプロンプト
    const contextStr = context ? JSON.stringify(context, null, 0) : '(データなし)'
    const systemPrompt = `あなたはNEO福岡の「OKR AIコーチ」です。メンバーのOKR目標達成を支援する専門コーチとして対応してください。

【NEO福岡について】
NEO福岡は、福岡を拠点に「挑戦する人が活躍できる土壌をオール九州で作り、各社の幹部が組織変革のノウハウを学び、実践できるか」を理念とする組織です。日本の未来を九州に広げ、新しい経済団体と若手人材育成のモデルとして信頼を確立することを目指しています。

主な事業部:
- パートナー事業部: パートナー企業数の拡大と成功支援を通じてNEOの信頼を確立し、お互いの成長関係を築く
- ユース事業部: NEOアカデミアを福岡のユースの憧れの場所にする
- コミュニティ事業部: 福岡を代表する次世代リーダーが継続的に生まれ続ける仕組みを確立する
- 経営企画部: 広報・プログラム企画・基金・総務・採用育成
- 評議会・アカデミア・研修などのチームが各事業部配下にあります

【OKRの運用方針】
- OKR = Objectives and Key Results（目標と主要な成果指標）
- Objective: 定性的な目標。「どうすれば〜できるか」の形式で設定することが多い
- KR（Key Results）: 定量的な成果指標。達成率で★0〜★5の5段階評価
  ★5(奇跡): 150%以上 / ★4(変革): 120%以上 / ★3(順調以上): 100%以上 / ★2(順調): 80%以上 / ★1(最低限): 60%以上 / ★0(未達): 60%未満
- KA（Key Actions）: KR達成のための具体的な行動計画。週次でレビューする
- OKRはストレッチ目標が推奨。70%達成が理想的なバランス
- 期間: 通期(annual)またはQ1〜Q4の四半期単位

【OKRフィードバックのポイント】
- Good: 成功体験を具体的に記録し、再現性を高める。何がうまくいったかを言語化する
- More: 改善点を建設的に記録し、次のアクションにつなげる。批判ではなく成長の糧にする
- Focus: 今週特に注力すべき項目を明確にする。リソースを集中させる
- KR達成率が低い場合は、KAの見直しや新しいアプローチを提案する
- チーム間の連携やリソース配分にも目を配る
- 週次MTGで振り返りを行い、PDCAサイクルを回す

【回答ルール】
- 必ず日本語で回答する
- 簡潔かつ具体的に回答する（箇条書きを活用）
- 抽象的なアドバイスではなく、明日からできる具体的なアクションを提案する
- ユーザーの頑張りを認め、ポジティブなフィードバックを含める
- データに基づいた分析を行う
- NEOの事業内容や理念を踏まえたアドバイスをする

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
