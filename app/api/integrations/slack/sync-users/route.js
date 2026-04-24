// Slack ユーザー一覧を取得して members.slack_user_id を email マッチで一括同期
// POST /api/integrations/slack/sync-users
//
// 前提: 環境変数 SLACK_BOT_TOKEN (xoxb-...) が設定済み
//       Bot Token Scopes: users:read, users:read.email が付与済み
//
// レスポンス: { ok: true, updated, unmatched, total }
//   updated:   email マッチで slack_user_id を更新したメンバー数
//   unmatched: Slack 側に見つからなかった members の名前配列
//   total:     Slack 側のアクティブユーザー総数

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

// Slack users.list をページング込みで全件取得
async function fetchAllSlackUsers(token) {
  const all = []
  let cursor = ''
  for (let i = 0; i < 20; i++) { // 最大 20 ページ (= 10k ユーザー)
    const url = new URL('https://slack.com/api/users.list')
    url.searchParams.set('limit', '500')
    if (cursor) url.searchParams.set('cursor', cursor)
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await r.json()
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`)
    for (const m of (data.members || [])) {
      if (m.deleted || m.is_bot) continue
      all.push(m)
    }
    cursor = data.response_metadata?.next_cursor || ''
    if (!cursor) break
  }
  return all
}

export async function POST() {
  try {
    const token = process.env.SLACK_BOT_TOKEN
    if (!token) return json({ error: 'SLACK_BOT_TOKEN が未設定です' }, { status: 500 })

    const supabase = admin()

    // 1. アプリ側のメンバー一覧
    const { data: members, error: memErr } = await supabase.from('members').select('id, name, email, slack_user_id')
    if (memErr) return json({ error: memErr.message }, { status: 500 })

    // 2. Slack 側のユーザー一覧
    const slackUsers = await fetchAllSlackUsers(token)
    // email → slack id のマップ (小文字で比較)
    const byEmail = new Map()
    for (const u of slackUsers) {
      const email = (u.profile?.email || '').toLowerCase()
      if (email) byEmail.set(email, u.id)
    }

    // 3. email でマッチングして更新
    let updated = 0
    const unmatched = []
    for (const m of (members || [])) {
      const email = (m.email || '').toLowerCase()
      if (!email) { unmatched.push(m.name); continue }
      const sid = byEmail.get(email)
      if (!sid) { unmatched.push(m.name); continue }
      if (m.slack_user_id === sid) continue // 既に同期済み
      const { error: upErr } = await supabase.from('members')
        .update({ slack_user_id: sid }).eq('id', m.id)
      if (!upErr) updated++
    }

    return json({
      ok: true,
      updated,
      unmatched,
      total: slackUsers.length,
      membersTotal: (members || []).length,
    })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}
