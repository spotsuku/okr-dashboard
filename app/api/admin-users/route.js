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
export async function GET() {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ users: data.users })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST: ユーザー操作（削除・ロール変更） ───────────────────────────────────
export async function POST(request) {
  try {
    const { action, userId, role } = await request.json()
    const admin = getAdminClient()

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
