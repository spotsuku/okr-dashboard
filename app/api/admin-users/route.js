import { createClient } from '@supabase/supabase-js'

// Service Roleキーを使ってAdmin APIにアクセス
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── GET: ユーザー一覧取得 ────────────────────────────────────────────────────
// クエリパラメータ:
//   ?org_slug=demo / ?org_id=123 → そのorgのmembers.emailと一致するAuth usersのみ
//   なし → 全Auth users
export async function GET(request) {
  try {
    const admin = getAdminClient()
    const url = new URL(request.url)
    const orgSlug = url.searchParams.get('org_slug')
    const orgId   = url.searchParams.get('org_id')

    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) return Response.json({ error: error.message }, { status: 500 })

    let users = data.users
    if (orgSlug || orgId) {
      let q = admin.from('members').select('email, organization_id, organizations!inner(id, slug)')
      if (orgSlug) q = q.eq('organizations.slug', orgSlug)
      else         q = q.eq('organizations.id', Number(orgId))
      const { data: memberRows } = await q
      const allowedEmails = new Set((memberRows || [])
        .map(r => (r.email || '').toLowerCase())
        .filter(Boolean))
      users = users.filter(u => allowedEmails.has((u.email || '').toLowerCase()))
    }
    return Response.json({ users })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST: ユーザー操作（削除・ロール変更） ───────────────────────────────────
export async function POST(request) {
  try {
    const { action, userId, role, email } = await request.json()
    const admin = getAdminClient()

    if (action === 'createUser') {
      if (!email) return Response.json({ error: 'メールアドレスが必要です' }, { status: 400 })
      const password = crypto.randomUUID()
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true, user: data.user })
    }

    if (action === 'delete') {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true })
    }

    if (action === 'updateRole') {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { role }
      })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true })
    }

    return Response.json({ error: '不明なアクション' }, { status: 400 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
