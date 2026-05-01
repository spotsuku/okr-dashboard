// チーム週次サマリーを KR/KA レビューから AI で生成
// POST /api/ai/team-summary
// body: { level_id, week_start }
// response: { good, more, focus, sources: { krCount, kaCount } }

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(request) {
  try {
    const { level_id, week_start } = await request.json()
    if (!level_id || !week_start) {
      return Response.json({ error: 'level_id と week_start が必要です' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // 1) level の情報取得
    const { data: level } = await supabase.from('levels')
      .select('id, name, parent_id').eq('id', level_id).maybeSingle()
    const teamName = level?.name || `level#${level_id}`

    // 2) このチームに属する objectives → KR ids
    const { data: objs } = await supabase.from('objectives')
      .select('id, title, period').eq('level_id', level_id)
    const objIds = (objs || []).map(o => o.id)
    let krs = []
    let krReviews = []
    if (objIds.length > 0) {
      const krsRes = await supabase.from('key_results')
        .select('id, title, target, current, unit, owner, objective_id').in('objective_id', objIds)
      krs = krsRes.data || []
      const krIds = krs.map(k => k.id)
      if (krIds.length > 0) {
        const revRes = await supabase.from('kr_weekly_reviews')
          .select('kr_id, weather, good, more, focus').in('kr_id', krIds).eq('week_start', week_start)
        krReviews = revRes.data || []
      }
    }
    const reviewByKr = new Map(krReviews.map(r => [Number(r.kr_id), r]))

    // 3) このチームの KA (weekly_reports) 当週分
    let kas = []
    if (objIds.length > 0) {
      const kasRes = await supabase.from('weekly_reports')
        .select('id, ka_title, kr_title, owner, status, good, more, focus_output')
        .in('objective_id', objIds).eq('week_start', week_start)
      kas = kasRes.data || []
    }

    // 4) AI に渡す素材を組み立て
    const krLines = krs.map(k => {
      const r = reviewByKr.get(Number(k.id))
      const target = Number(k.target ?? 0)
      const current = Number(k.current ?? 0)
      const progress = target > 0 ? Math.round((current / target) * 100) : null
      const lines = []
      lines.push(`【KR】${k.title}${k.owner ? ` (担当: ${k.owner})` : ''}${progress != null ? ` [${current}/${target}${k.unit || ''} = ${progress}%]` : ''}`)
      if (r?.good)  lines.push(`  ✅good: ${r.good.trim()}`)
      if (r?.more)  lines.push(`  🔺more: ${r.more.trim()}`)
      if (r?.focus) lines.push(`  🎯focus: ${r.focus.trim()}`)
      return lines.join('\n')
    }).filter(s => s.includes('good:') || s.includes('more:') || s.includes('focus:'))

    const kaLines = kas.map(k => {
      const lines = []
      lines.push(`【KA】${k.ka_title || '(無題)'}${k.owner ? ` (担当: ${k.owner})` : ''}${k.status ? ` [${k.status}]` : ''}${k.kr_title ? ` ※KR: ${k.kr_title}` : ''}`)
      if (k.good)         lines.push(`  ✅good: ${k.good.trim()}`)
      if (k.more)         lines.push(`  🔺more: ${k.more.trim()}`)
      if (k.focus_output) lines.push(`  🎯focus: ${k.focus_output.trim()}`)
      return lines.join('\n')
    }).filter(s => s.includes('good:') || s.includes('more:') || s.includes('focus:'))

    const krCount = krLines.length
    const kaCount = kaLines.length

    if (krCount + kaCount === 0) {
      return Response.json({
        good: '',
        more: '',
        focus: '',
        sources: { krCount: 0, kaCount: 0 },
        message: '今週のKR/KAレビューが未記入のため、サマリー材料がありません。',
      })
    }

    // 5) Claude にサマリー生成依頼
    const systemPrompt = `あなたはNEO福岡の週次振り返り支援AIです。
チーム「${teamName}」の今週のKR/KA週次レビュー (各メンバーが書いた good/more/focus) を集約し、
**チーム全体としての** Good / More / Focus の3項目で要約してください。

ルール:
- 各項目は箇条書きで2〜4個程度。1個あたり40〜80文字。
- 重複や類似は統合して1つに。
- 個別のKR/KA名は基本含めない (チーム視点で抽象化)。ただし重要な数字は残す。
- focus は「来週このチームで注力すること」として書く。
- 出力は **JSON のみ** で、形式: {"good": "...", "more": "...", "focus": "..."}
- 各値は改行区切りの箇条書き文字列 ("- " で始める)。
- 材料が少ない項目は空文字 "" にする。`

    const userPrompt = `チーム名: ${teamName}
週: ${week_start} 開始

【KR レビュー】(${krCount}件)
${krLines.length > 0 ? krLines.join('\n\n') : '(なし)'}

【KA レビュー】(${kaCount}件)
${kaLines.length > 0 ? kaLines.join('\n\n') : '(なし)'}

上記を集約して、チーム全体の Good / More / Focus を JSON で返してください。`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!r.ok) {
      const text = await r.text()
      return Response.json({ error: `AI 呼び出しエラー ${r.status}: ${text.slice(0, 200)}` }, { status: 500 })
    }
    const data = await r.json()
    const text = (data?.content?.[0]?.text || '').trim()

    // JSON 抽出 (```json ブロック対応)
    let jsonStr = text
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (m) jsonStr = m[1].trim()
    let parsed
    try { parsed = JSON.parse(jsonStr) }
    catch {
      // 失敗時は本文をそのまま good に入れて返す
      return Response.json({ good: text, more: '', focus: '', sources: { krCount, kaCount }, parseError: true })
    }

    return Response.json({
      good:  String(parsed.good || '').trim(),
      more:  String(parsed.more || '').trim(),
      focus: String(parsed.focus || '').trim(),
      sources: { krCount, kaCount },
    })
  } catch (e) {
    console.error('team-summary AI error:', e)
    return Response.json({ error: e.message || String(e) }, { status: 500 })
  }
}
