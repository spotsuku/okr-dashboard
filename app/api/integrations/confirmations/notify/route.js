// メンバー間「確認事項」の通知 API
// POST /api/integrations/confirmations/notify  Body: { confirmation_id }
//
// 通知順:
//  1. 宛先メンバー (members.email) 経由で user_integrations の slack token を取得できれば DM
//  2. 宛先メンバーの所属 level (members.level_id) の slack_webhook_url があれば channel 通知
//  3. どちらも無ければ何もせず 200 (UI 側で realtime 反映されるため致命的ではない)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

function json(body, init) {
  return new Response(JSON.stringify(body), {
    ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

export async function POST(request) {
  try {
    const { confirmation_id } = await request.json().catch(() => ({}))
    if (!confirmation_id) return json({ error: 'confirmation_id required' }, { status: 400 })

    const supabase = admin()

    // 1. 確認事項取得
    const { data: conf } = await supabase.from('member_confirmations')
      .select('*').eq('id', confirmation_id).maybeSingle()
    if (!conf) return json({ error: 'confirmation not found' }, { status: 404 })

    // 2. 宛先メンバー情報 (slack_user_id があれば実メンション <@USERID> を使う)
    const { data: toMember } = await supabase.from('members')
      .select('id, name, email, level_id, slack_user_id').eq('name', conf.to_name).maybeSingle()
    const toMention = toMember?.slack_user_id
      ? `<@${toMember.slack_user_id}>`           // 実メンション (push 通知発火)
      : `@${conf.to_name}`                        // フォールバック (文字列)

    // 送信者 (任意・本文中に表示)
    const { data: fromMember } = await supabase.from('members')
      .select('slack_user_id').eq('name', conf.from_name).maybeSingle()
    const fromMention = fromMember?.slack_user_id
      ? `<@${fromMember.slack_user_id}>`
      : conf.from_name

    const text = [
      `${toMention} 📬 確認事項が届いています`,
      `(from: ${fromMention})`,
      ``,
      conf.content,
      ``,
      `→ マイページ → 📬確認 タブで返信できます`,
    ].join('\n')

    // 3a. 部署 webhook に通知 (設定あれば優先)
    let notified = false
    if (toMember?.level_id) {
      const { data: lvl } = await supabase.from('levels')
        .select('slack_webhook_url').eq('id', toMember.level_id).maybeSingle()
      if (lvl?.slack_webhook_url) {
        try {
          await fetch(lvl.slack_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          })
          notified = true
        } catch (e) {
          console.warn('Slack webhook failed:', e?.message)
        }
      }
    }

    // 3b. グローバル webhook (通常はこちらで社内連携チャンネルに投稿)
    if (!notified && process.env.SLACK_WEBHOOK_URL) {
      try {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        notified = true
      } catch (e) {
        console.warn('Global Slack webhook failed:', e?.message)
      }
    }

    return json({ ok: true, notified })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}
