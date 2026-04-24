// メンバー間「確認事項」の Slack 通知 API (方式A: Bot Token 版)
// POST /api/integrations/confirmations/notify  Body: { confirmation_id }
//
// 必須環境変数:
//   SLACK_BOT_TOKEN         : xoxb-... (Slack App の Bot Token)
//   SLACK_DEFAULT_CHANNEL_ID: C0123456... (通知先の既定チャンネル ID)
//
// 通知動作:
//   1. 宛先メンバーの slack_user_id があれば <@USERID> で実メンション
//   2. chat.postMessage で SLACK_DEFAULT_CHANNEL_ID に投稿
//   3. 環境変数未設定・エラー時は silent skip (UI の realtime で補える)
//
// 旧 Webhook 方式の slack_webhook_url (levels テーブル) は使用しない

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

    const token = process.env.SLACK_BOT_TOKEN
    const channel = process.env.SLACK_DEFAULT_CHANNEL_ID
    if (!token || !channel) {
      // 環境変数未設定なら silent skip
      return json({ ok: true, notified: false, reason: 'SLACK_BOT_TOKEN or SLACK_DEFAULT_CHANNEL_ID not set' })
    }

    const supabase = admin()

    // 1. 確認事項を取得
    const { data: conf } = await supabase.from('member_confirmations')
      .select('*').eq('id', confirmation_id).maybeSingle()
    if (!conf) return json({ error: 'confirmation not found' }, { status: 404 })

    // 2. 宛先メンバーの slack_user_id を取得
    const { data: toMember } = await supabase.from('members')
      .select('id, name, slack_user_id').eq('name', conf.to_name).maybeSingle()
    const mention = toMember?.slack_user_id
      ? `<@${toMember.slack_user_id}>`
      : `@${conf.to_name}` // slack_user_id 未設定なら文字列 (通知は飛ばないが投稿はする)

    // 3. 送信者の slack_user_id (任意: 本文中に @from で表示)
    const { data: fromMember } = await supabase.from('members')
      .select('slack_user_id').eq('name', conf.from_name).maybeSingle()
    const fromMention = fromMember?.slack_user_id
      ? `<@${fromMember.slack_user_id}>`
      : conf.from_name

    const text = [
      `${mention} 📬 確認事項`,
      ``,
      `from: ${fromMention}`,
      ``,
      conf.content,
      ``,
      `→ マイページ → 📬確認タブで返信できます`,
    ].join('\n')

    // 4. chat.postMessage で投稿
    const r = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        text,
        // mrkdwn/blocks を使わず text だけで簡潔に (<@USERID> はそのまま解釈される)
        unfurl_links: false, unfurl_media: false,
      }),
    })
    const rj = await r.json()
    if (!rj.ok) {
      console.warn('Slack chat.postMessage failed:', rj.error)
      return json({ ok: true, notified: false, error: rj.error })
    }

    return json({ ok: true, notified: true, ts: rj.ts, channel: rj.channel })
  } catch (e) {
    console.error('notify error:', e)
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}
