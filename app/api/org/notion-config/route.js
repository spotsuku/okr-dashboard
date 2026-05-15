// 組織の Notion 連携設定を取得・更新する API
// owner / admin のみアクセス可。
//
// GET /api/org/notion-config?organization_id=X&requester_email=Y
//   200: {
//     api_key_configured: boolean,  // 設定されているか (実際の値は返さない)
//     db_ids: { [meetingKey]: dbId }
//   }
//
// PATCH /api/org/notion-config
//   Body: {
//     organization_id, requester_email,
//     notion_api_key?: string | null,  // 省略: 変更しない、'': クリア、文字列: 設定
//     notion_db_ids?:  { [meetingKey]: string }  // 渡されたキーのみマージ更新
//   }
//   200: { ok: true }

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
  return new Response(JSON.stringify(b), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

// 許可された meetingKey (lib/meetings.js の MEETINGS と整合)
// sales は kickoff-partner と DB 共有なので個別設定不要
const ALLOWED_KEYS = new Set([
  'morning',
  'kickoff-partner', 'kickoff-youth', 'kickoff-community',
  'manager', 'director', 'planning', 'board',
  'program-regular',
])

async function assertCanManage(sb, orgId, requesterEmail) {
  if (!orgId || !requesterEmail) return { ok: false, status: 400, error: 'organization_id / requester_email が必要です' }
  const { data, error } = await sb.from('organization_members')
    .select('role, members!inner(email)')
    .eq('organization_id', orgId)
    .eq('members.email', requesterEmail)
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 403, error: '組織のメンバーではありません' }
  if (data.role !== 'owner' && data.role !== 'admin') {
    return { ok: false, status: 403, error: 'owner/admin のみ操作可能です' }
  }
  return { ok: true }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('organization_id')
    const requesterEmail = searchParams.get('requester_email')

    const sb = admin()
    const check = await assertCanManage(sb, orgId, requesterEmail)
    if (!check.ok) return json({ error: check.error }, { status: check.status })

    const { data, error } = await sb.from('organizations')
      .select('notion_api_key, notion_db_ids')
      .eq('id', orgId)
      .maybeSingle()
    if (error) return json({ error: error.message }, { status: 500 })

    return json({
      api_key_configured: !!data?.notion_api_key,
      db_ids: data?.notion_db_ids && typeof data.notion_db_ids === 'object' ? data.notion_db_ids : {},
    })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { organization_id: orgId, requester_email: requesterEmail, notion_api_key, notion_db_ids } = body || {}

    const sb = admin()
    const check = await assertCanManage(sb, orgId, requesterEmail)
    if (!check.ok) return json({ error: check.error }, { status: check.status })

    const updates = {}

    // API キー: undefined ならスキップ、'' ならクリア (NULL)、文字列なら設定
    if (notion_api_key !== undefined) {
      const trimmed = typeof notion_api_key === 'string' ? notion_api_key.trim() : ''
      updates.notion_api_key = trimmed === '' ? null : trimmed
    }

    // DB ID: 既存にマージ (渡されたキーだけ上書き、空文字なら削除)
    if (notion_db_ids && typeof notion_db_ids === 'object') {
      const { data: cur } = await sb.from('organizations')
        .select('notion_db_ids').eq('id', orgId).maybeSingle()
      const merged = { ...(cur?.notion_db_ids || {}) }
      for (const [k, v] of Object.entries(notion_db_ids)) {
        if (!ALLOWED_KEYS.has(k)) continue
        const trimmed = typeof v === 'string' ? v.trim() : ''
        if (trimmed === '') {
          delete merged[k]
        } else {
          merged[k] = trimmed
        }
      }
      updates.notion_db_ids = merged
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: '更新項目がありません' }, { status: 400 })
    }

    const { error: upErr } = await sb.from('organizations').update(updates).eq('id', orgId)
    if (upErr) return json({ error: '更新失敗: ' + upErr.message }, { status: 500 })

    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}
