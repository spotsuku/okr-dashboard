// Google OAuth で取得したトークンをサーバーサイドで保存
// クライアントサイドの upsert だと RLS 設定によって失敗することがあるため
// service role 経由で確実に保存する
//
// POST /api/integrations/google/save-token
// Body: { service: 'google_gmail' | 'google_calendar', accessToken, refreshToken, expiresAt, email }
// 認証: Authorization: Bearer <jwt>

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// JWT から user 情報を取得
async function getAuthUser(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const admin = getAdminClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return Response.json({ error: 'JSON parse error' }, { status: 400 }) }
  const { service, accessToken, refreshToken, expiresAt, email } = body || {}

  if (!service || !['google_gmail', 'google_calendar'].includes(service)) {
    return Response.json({ error: 'service is invalid' }, { status: 400 })
  }
  if (!accessToken) {
    return Response.json({ error: 'accessToken is required' }, { status: 400 })
  }

  // 認証ユーザーを特定
  const user = await getAuthUser(request)
  if (!user) {
    return Response.json({ error: '認証が必要です' }, { status: 401 })
  }

  // members から owner 名を逆引き
  const admin = getAdminClient()
  const { data: member } = await admin
    .from('members').select('name').eq('email', user.email).maybeSingle()
  if (!member?.name) {
    return Response.json({
      error: `あなたのメールアドレス (${user.email}) が members テーブルに登録されていません。組織ページで登録してください。`,
    }, { status: 400 })
  }

  const { error } = await admin.from('user_integrations').upsert({
    owner: member.name,
    service,
    access_token: accessToken,
    refresh_token: refreshToken || null,
    expires_at: expiresAt || null,
    metadata: { email: email || user.email },
  }, { onConflict: 'owner,service' })

  if (error) {
    return Response.json({ error: `保存エラー: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true, owner: member.name, service })
}
