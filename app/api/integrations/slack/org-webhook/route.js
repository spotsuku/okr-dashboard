// 共有・確認事項 専用 Slack Webhook の組織別設定 CRUD (admin のみ)
// GET  /api/integrations/slack/org-webhook?organization_id=X
// POST /api/integrations/slack/org-webhook  Body: { organization_id, url, owner }
//
// クライアントから直接 supabase で organizations を UPDATE すると、
// RLS により無言で何も更新されないことがあるため、SERVICE_ROLE で実行する
// サーバー API を経由させる。

export const dynamic = 'force-dynamic'

import { getAdminClient } from '../../_shared'

function json(body, init) {
  return new Response(JSON.stringify(body), {
    ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

async function isAdmin(supabase, ownerName, email) {
  if (ownerName) {
    const { data } = await supabase.from('members')
      .select('is_admin').eq('name', ownerName).limit(1)
    if (data && data[0]?.is_admin) return true
  }
  if (email) {
    const { data } = await supabase.from('members')
      .select('is_admin').eq('email', email).limit(1)
    if (data && data[0]?.is_admin) return true
  }
  return false
}

export async function GET(request) {
  try {
    const supabase = getAdminClient()
    const u = new URL(request.url)
    const organization_id = u.searchParams.get('organization_id')
    if (!organization_id) return json({ error: 'organization_id が必要です' }, { status: 400 })
    const { data, error } = await supabase
      .from('organizations')
      .select('slack_webhook_confirmations')
      .eq('id', organization_id)
      .maybeSingle()
    if (error) {
      const msg = error.message || ''
      if (/column .* does not exist|schema cache/i.test(msg)) {
        return json({
          error: 'organizations.slack_webhook_confirmations カラムが未作成です。Supabase で supabase_add_org_slack_settings.sql を実行してください。',
          migrationMissing: true,
        }, { status: 500 })
      }
      return json({ error: msg }, { status: 500 })
    }
    return json({ url: data?.slack_webhook_confirmations || '' })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({}))
    const { organization_id, url, owner, email } = body || {}
    if (!organization_id) return json({ error: 'organization_id が必要です' }, { status: 400 })
    if (!(await isAdmin(supabase, owner, email))) {
      return json({ error: 'admin 権限が必要です' }, { status: 403 })
    }
    const value = (url || '').trim()
    if (value && !/^https:\/\/hooks\.slack\.com\/services\//.test(value)) {
      return json({ error: 'Slack Incoming Webhook の URL ではありません' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('organizations')
      .update({ slack_webhook_confirmations: value || null })
      .eq('id', organization_id)
      .select('id, slack_webhook_confirmations')
    if (error) {
      const msg = error.message || ''
      if (/column .* does not exist|schema cache/i.test(msg)) {
        return json({
          error: 'organizations.slack_webhook_confirmations カラムが未作成です。Supabase で supabase_add_org_slack_settings.sql を実行してください。',
          migrationMissing: true,
        }, { status: 500 })
      }
      return json({ error: msg }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return json({ error: '対象組織が見つかりません (organization_id を確認してください)' }, { status: 404 })
    }
    return json({ ok: true, url: data[0].slack_webhook_confirmations || '' })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}
