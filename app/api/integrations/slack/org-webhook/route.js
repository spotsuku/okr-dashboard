// 組織別 Slack Webhook の CRUD (admin のみ)
// GET  /api/integrations/slack/org-webhook?organization_id=X&kind=confirmations|daily_report
// POST /api/integrations/slack/org-webhook  Body: { organization_id, url, owner, email, kind }
//
// kind により保存先カラムを切り替える (既定: confirmations = 従来挙動):
//   - confirmations → organizations.slack_webhook_confirmations
//   - daily_report  → organizations.slack_webhook_daily_report
//
// クライアントから直接 supabase で organizations を UPDATE すると、
// RLS により無言で何も更新されないことがあるため、SERVICE_ROLE で実行する
// サーバー API を経由させる。

export const dynamic = 'force-dynamic'

import { getAdminClient } from '../../_shared'

// kind → (カラム名, マイグレーションSQLファイル名)
const KIND_COLUMNS = {
  confirmations: { col: 'slack_webhook_confirmations', sql: 'supabase_add_org_slack_settings.sql' },
  daily_report:  { col: 'slack_webhook_daily_report',  sql: 'supabase_add_daily_report_webhook.sql' },
}

function resolveKind(kind) {
  return KIND_COLUMNS[kind] || KIND_COLUMNS.confirmations
}

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
    const { col, sql } = resolveKind(u.searchParams.get('kind'))
    const { data, error } = await supabase
      .from('organizations')
      .select(col)
      .eq('id', organization_id)
      .maybeSingle()
    if (error) {
      const msg = error.message || ''
      if (/column .* does not exist|schema cache/i.test(msg)) {
        return json({
          error: `organizations.${col} カラムが未作成です。Supabase で ${sql} を実行してください。`,
          migrationMissing: true,
        }, { status: 500 })
      }
      return json({ error: msg }, { status: 500 })
    }
    return json({ url: data?.[col] || '' })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({}))
    const { organization_id, url, owner, email, kind } = body || {}
    if (!organization_id) return json({ error: 'organization_id が必要です' }, { status: 400 })
    if (!(await isAdmin(supabase, owner, email))) {
      return json({ error: 'admin 権限が必要です' }, { status: 403 })
    }
    const { col, sql } = resolveKind(kind)
    const value = (url || '').trim()
    if (value && !/^https:\/\/hooks\.slack\.com\/services\//.test(value)) {
      return json({ error: 'Slack Incoming Webhook の URL ではありません' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('organizations')
      .update({ [col]: value || null })
      .eq('id', organization_id)
      .select(`id, ${col}`)
    if (error) {
      const msg = error.message || ''
      if (/column .* does not exist|schema cache/i.test(msg)) {
        return json({
          error: `organizations.${col} カラムが未作成です。Supabase で ${sql} を実行してください。`,
          migrationMissing: true,
        }, { status: 500 })
      }
      return json({ error: msg }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return json({ error: '対象組織が見つかりません (organization_id を確認してください)' }, { status: 404 })
    }
    return json({ ok: true, url: data[0][col] || '' })
  } catch (e) {
    return json({ error: e?.message || String(e) }, { status: 500 })
  }
}
