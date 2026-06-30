// 1時間ごとの作業記録 (work_log.content.hourly) を期間集計し、
// AI が作業カテゴリ別の時間配分を分析する。
// POST /api/ai/time-analysis
//   Body: { owner, organization_id, start, end, label }
//   start/end: ISO 文字列 (created_at で絞る半開区間 [start, end))。start 省略時は全期間。
// response: { categories: [{name, hours, ratio}], total_hours, insight, entries }

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { callClaude, aiErrorResponse, AICallError } from '../../../../lib/aiCall'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

function parseContent(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}) } catch { return {} } }
function toJSTDate(iso) {
  const j = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

export async function POST(request) {
  try {
    const { owner, organization_id, start, end, label } = await request.json().catch(() => ({}))
    if (!owner) return Response.json({ error: 'owner が必要です' }, { status: 400 })

    const supabase = getAdminClient()

    let q = supabase.from('coaching_logs')
      .select('content, created_at')
      .eq('owner', owner)
      .eq('log_type', 'work_log')
      .order('created_at', { ascending: true })
      .range(0, 9999)
    if (organization_id) q = q.eq('organization_id', organization_id)
    if (start) q = q.gte('created_at', start)
    if (end) q = q.lt('created_at', end)
    const { data, error } = await q
    if (error) return Response.json({ error: 'データ取得エラー: ' + error.message }, { status: 500 })

    // hourly エントリを平坦化 ({date, slot, text})
    const entries = []
    for (const row of (data || [])) {
      const c = parseContent(row.content)
      const date = toJSTDate(row.created_at)
      if (Array.isArray(c.hourly)) {
        for (const h of c.hourly) {
          const text = (h?.text || '').trim()
          if (text) entries.push({ date, slot: h.slot || '', text })
        }
      }
    }

    if (entries.length === 0) {
      return Response.json({
        categories: [], total_hours: 0, insight: '',
        message: 'この期間に「1時間ごとの作業記録」がありません。終業時に記入すると分析できます。',
      })
    }

    // AI へ: 各エントリ (=1時間) をカテゴリに分類 (数値集計はサーバ側で行う)
    const systemPrompt = `あなたは業務時間の振り返り分析AIです。
各エントリは「1時間分の作業記録」です。各エントリを 1 つの作業カテゴリに分類してください。

カテゴリは次を優先的に使い、当てはまらない場合のみ簡潔な新カテゴリ名を作ってください:
資料作成 / 会議 / 外部商談 / 企画 / 事務・連絡 / 学習・情報収集 / 移動 / その他

ルール:
- 必ず入力エントリと同じ件数・同じ順序で、各エントリのカテゴリ名だけを配列で返す。
- カテゴリ名は短い日本語の名詞。表記ゆれを作らない (同じ意味は同じ名前に統一)。
- 出力は JSON のみ。形式: {"assignments": ["資料作成", "会議", ...], "insight": "..."}
- insight は 150〜300字。何に時間を使ったか / 偏り / 来期に向けた示唆を、事実に基づいて簡潔に。
- 素材に無い事実や数字を創作しない。`

    const list = entries.map((e, i) => `${i + 1}. [${e.date} ${e.slot}] ${e.text}`).join('\n')
    const userPrompt = `期間: ${label || `${start || ''}〜${end || ''}`}
エントリ数: ${entries.length} (各1時間)

【作業記録】
${list}

上記を分類し、JSON で返してください。`

    const aiData = await callClaude({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = (aiData?.content?.[0]?.text || '').trim()
    let jsonStr = text
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (m) jsonStr = m[1].trim()
    let parsed
    try { parsed = JSON.parse(jsonStr) } catch {
      return Response.json({ error: 'AI応答の解析に失敗しました', raw: text.slice(0, 300) }, { status: 502 })
    }

    // サーバ側で集計 (数値のズレ防止)。assignments がエントリ数と一致しない場合は安全に丸める。
    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : []
    const counts = {}
    entries.forEach((_, i) => {
      const cat = (assignments[i] || 'その他').toString().trim() || 'その他'
      counts[cat] = (counts[cat] || 0) + 1
    })
    const total = entries.length
    const categories = Object.entries(counts)
      .map(([name, hours]) => ({ name, hours, ratio: Math.round((hours / total) * 100) }))
      .sort((a, b) => b.hours - a.hours)

    return Response.json({
      categories,
      total_hours: total,
      insight: String(parsed.insight || '').trim(),
      entries: total,
    })
  } catch (e) {
    if (e instanceof AICallError) return aiErrorResponse(e)
    console.error('time-analysis AI error:', e)
    return Response.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
