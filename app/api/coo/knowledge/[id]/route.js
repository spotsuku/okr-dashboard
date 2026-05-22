// 組織知 個別操作 (admin のみ)
// PATCH  /api/coo/knowledge/<id>?owner=<name>           更新
// DELETE /api/coo/knowledge/<id>?owner=<name>           削除
// POST   /api/coo/knowledge/<id>/refresh?owner=<name>   Drive 再取得 (drive_file のみ)

export const dynamic = 'force-dynamic'

import { getAdminClient, getIntegration, callGoogleApiWithRetry, json } from '../../../integrations/_shared'

async function isAdmin(supabase, ownerName, orgId) {
  if (!ownerName || !orgId) return false
  const { data } = await supabase
    .from('members')
    .select('is_admin')
    .eq('name', ownerName)
    .eq('organization_id', orgId)
    .limit(1)
  return !!(data && data[0] && data[0].is_admin)
}

export async function PATCH(request, { params }) {
  try {
    const supabase = getAdminClient()
    const url = new URL(request.url)
    const owner = url.searchParams.get('owner')
    const orgId = url.searchParams.get('organization_id')
    if (!orgId) return json({ error: 'organization_id が必要です' }, { status: 400 })
    if (!(await isAdmin(supabase, owner, orgId))) {
      return json({ error: 'admin 権限が必要です' }, { status: 403 })
    }
    const body = await request.json()
    const updates = {}
    for (const k of ['title', 'content', 'drive_file_id', 'priority', 'enabled', 'kind']) {
      if (body[k] !== undefined) updates[k] = body[k]
    }
    updates.updated_at = new Date().toISOString()
    updates.updated_by = owner || null
    // kind 変更時の整合: drive_file_id をクリア
    if (updates.kind === 'text') updates.drive_file_id = null
    if (updates.kind === 'drive_file') updates.content = null

    // 他組織の行を id 指定で書き換えられないよう organization_id でも絞る
    const { data, error } = await supabase
      .from('coo_knowledge')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()
    if (error) return json({ error: error.message }, { status: 500 })
    return json({ item: data })
  } catch (e) {
    return json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = getAdminClient()
    const url = new URL(request.url)
    const owner = url.searchParams.get('owner')
    const orgId = url.searchParams.get('organization_id')
    if (!orgId) return json({ error: 'organization_id が必要です' }, { status: 400 })
    if (!(await isAdmin(supabase, owner, orgId))) {
      return json({ error: 'admin 権限が必要です' }, { status: 403 })
    }
    const { error } = await supabase
      .from('coo_knowledge')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', orgId)
    if (error) return json({ error: error.message }, { status: 500 })
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, { status: 500 })
  }
}
