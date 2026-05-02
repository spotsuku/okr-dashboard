// 組織メンバーのロール変更 / 削除 (owner / admin のみ)
// PATCH /api/org/role { organization_id, member_id, role, requester_email }
// DELETE /api/org/role { organization_id, member_id, requester_email }

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}
function json(b, init) {
  return new Response(JSON.stringify(b), { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
}

async function checkAuth(sb, orgId, requesterEmail) {
  const { data } = await sb.from('organization_members')
    .select('role, members!inner(email)')
    .eq('organization_id', orgId)
    .eq('members.email', requesterEmail)
    .maybeSingle()
  return data && (data.role === 'owner' || data.role === 'admin')
}

export async function PATCH(request) {
  const { organization_id, member_id, role, requester_email } = await request.json()
  if (!organization_id || !member_id || !role || !requester_email) {
    return json({ error: '必須パラメータ不足' }, { status: 400 })
  }
  if (!['owner', 'admin', 'member'].includes(role)) {
    return json({ error: '不正な role' }, { status: 400 })
  }
  const sb = admin()
  if (!(await checkAuth(sb, organization_id, requester_email))) {
    return json({ error: '権限がありません' }, { status: 403 })
  }
  const { error } = await sb.from('organization_members')
    .update({ role }).eq('organization_id', organization_id).eq('member_id', member_id)
  if (error) return json({ error: error.message }, { status: 500 })
  return json({ ok: true })
}

export async function DELETE(request) {
  const { organization_id, member_id, requester_email } = await request.json()
  if (!organization_id || !member_id || !requester_email) {
    return json({ error: '必須パラメータ不足' }, { status: 400 })
  }
  const sb = admin()
  if (!(await checkAuth(sb, organization_id, requester_email))) {
    return json({ error: '権限がありません' }, { status: 403 })
  }
  const { error } = await sb.from('organization_members')
    .delete().eq('organization_id', organization_id).eq('member_id', member_id)
  if (error) return json({ error: error.message }, { status: 500 })
  return json({ ok: true })
}
