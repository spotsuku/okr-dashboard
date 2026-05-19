// POST /api/ai/update-profile
//
// MyCOO (AIコーチ) の Phase 2 機能。
// 直近の対話履歴を Claude に渡し、ユーザーの傾向を要約してもらって
// coaching_profiles テーブルに保存する。
//
// Body: { owner, recent_messages: [{role, content}, ...], existing_summary? }
//   - owner            : メンバー名 (PK)
//   - recent_messages  : 直近 N 件の会話 (典型 10-20 件)
//   - existing_summary : 既存プロファイル要約 (= 累積更新用)
//
// 動作:
//   1. Claude に「対話履歴 + 既存プロファイル → 更新後のプロファイル」を生成依頼
//   2. coaching_profiles に upsert (is_user_edited=true ならスキップ)

export const dynamic = 'force-dynamic'

import { callClaude, AICallError } from '../../../../lib/aiCall'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

function json(body, init) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

export async function POST(request) {
  try {
    const { owner, recent_messages } = await request.json()
    if (!owner || !Array.isArray(recent_messages) || recent_messages.length === 0) {
      return json({ error: 'owner と recent_messages が必要です' }, { status: 400 })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY 未設定' }, { status: 503 })
    }

    const sb = admin()

    // 既存プロファイルを取得 (ユーザー手動編集中ならスキップ)
    const { data: existing } = await sb.from('coaching_profiles')
      .select('profile_summary, is_user_edited, updated_count').eq('owner', owner).maybeSingle()
    if (existing?.is_user_edited) {
      return json({ ok: true, skipped: 'user_edited' })
    }

    // Claude へ要約依頼
    const dialog = recent_messages
      .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`)
      .join('\n\n')
      .slice(0, 12000)  // トークン上限を考慮して頭打ち

    const existingBlock = existing?.profile_summary
      ? `\n【現在のプロファイル (更新前)】\n${existing.profile_summary}\n`
      : ''

    const systemPrompt = `あなたはコーチングプロファイラーです。ユーザーと AI コーチの対話履歴から、このユーザーの傾向 (思考スタイル / 関心事 / 弱点 / 強み / 好む伝え方 など) を箇条書き 6-10 個で簡潔に要約してください。

ガイドライン:
- 「数字志向 / 物語志向」「論理派 / 感情派」「短期思考 / 長期思考」など特性軸も使う
- 既存プロファイルがある場合はそれを下敷きに、新しい情報で上書き・追記する
- 「〜のようだ」「〜と推測される」と断定を避ける表現を使う
- 出力は箇条書きのみ、前置きや結びは不要
- 日本語、Markdown 形式 (- で始まる箇条書き)`

    const userPrompt = `${existingBlock}
【直近の対話履歴】
${dialog}

上記の対話から、このユーザーのコーチング・プロファイルを更新してください。`

    const data = await callClaude({
      model: process.env.AI_MODEL || 'claude-sonnet-4-5',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const summary = (data.content?.[0]?.text || '').trim()
    if (!summary) return json({ error: '要約が空でした' }, { status: 500 })

    // upsert
    const nowIso = new Date().toISOString()
    const { error: upErr } = await sb.from('coaching_profiles')
      .upsert({
        owner,
        profile_summary: summary,
        last_updated_at: nowIso,
        updated_count: (existing?.updated_count || 0) + 1,
        is_user_edited: false,
      }, { onConflict: 'owner' })
    if (upErr) return json({ error: 'プロファイル保存失敗: ' + upErr.message }, { status: 500 })

    return json({ ok: true, profile_summary: summary })
  } catch (e) {
    if (e instanceof AICallError) {
      return json({ error: e.userMessage }, { status: e.retryable ? 503 : 500 })
    }
    console.error('update-profile error:', e)
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}
