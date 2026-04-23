// 組織知 (ぺろっぺ) の管理 API
// GET   /api/coo/knowledge                - 全件取得 (全認証ユーザー閲覧可)
// POST  /api/coo/knowledge                - 新規作成 (admin のみ)
//
// admin 判定: ?owner=<name> から members.is_admin を確認

export const dynamic = 'force-dynamic'

import { getAdminClient, json } from '../../integrations/_shared'

async function isAdmin(supabase, ownerName) {
  if (!ownerName) return false
  const { data } = await supabase
    .from('members')
    .select('is_admin')
    .eq('name', ownerName)
    .limit(1)
  return !!(data && data[0] && data[0].is_admin)
}

export async function GET(request) {
  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('coo_knowledge')
      .select('*')
      .order('priority', { ascending: false })
      .order('id', { ascending: true })
    if (error) return json({ error: error.message }, { status: 500 })
    return json({ items: data || [] })
  } catch (e) {
    return json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = getAdminClient()
    const url = new URL(request.url)
    const owner = url.searchParams.get('owner')
    if (!(await isAdmin(supabase, owner))) {
      return json({ error: 'admin 権限が必要です' }, { status: 403 })
    }
    const body = await request.json()
    const { kind, title, content, drive_file_id, priority = 0, enabled = true } = body || {}
    if (!kind || !title) return json({ error: 'kind / title が必要です' }, { status: 400 })
    if (kind === 'text' && !content) return json({ error: 'text の場合 content が必要' }, { status: 400 })
    if (kind === 'drive_file' && !drive_file_id) return json({ error: 'drive_file の場合 drive_file_id が必要' }, { status: 400 })

    const payload = {
      kind, title,
      content: kind === 'text' ? content : null,
      drive_file_id: kind === 'drive_file' ? drive_file_id : null,
      priority, enabled,
      updated_by: owner || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('coo_knowledge')
      .insert(payload)
      .select()
      .single()
    if (error) return json({ error: error.message }, { status: 500 })
    return json({ item: data })
  } catch (e) {
    return json({ error: e.message }, { status: 500 })
  }
}
