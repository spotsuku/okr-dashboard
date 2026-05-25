// ════════════════════════════════════════════════════════════════════════════
// API ガード (サーバー側) — 認証必須化 + レート制限
// ════════════════════════════════════════════════════════════════════════════
// 無料公開SaaSで AI/外部API エンドポイントの乱用(コスト)を防ぐ。
// クライアントは Authorization: Bearer <supabase access token> を送る (lib/authedFetch)。
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

// Authorization: Bearer <token> を検証し、ログインユーザーを返す (未認証は null)
export async function getBearerUser(request) {
  try {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token || !URL || !ANON) return null
    const sb = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch { return null }
}

// DB ベースのレート制限。bucket=識別子(例 `ai:<userId>`)。
// 失敗時は可用性優先で素通り(true)。SERVICE 未設定の開発環境も素通り。
export async function checkRateLimit(bucket, { limit = 30, windowSec = 60 } = {}) {
  try {
    if (!SERVICE || !URL) return { allowed: true }
    const sb = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const since = new Date(Date.now() - windowSec * 1000).toISOString()
    const { count } = await sb.from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', bucket).gte('created_at', since)
    if ((count || 0) >= limit) return { allowed: false, count }
    await sb.from('api_rate_limits').insert({ bucket, created_at: new Date().toISOString() })
    return { allowed: true, count: (count || 0) + 1 }
  } catch {
    return { allowed: true }
  }
}

// AI/コスト系ルート用ガード: 認証必須 + レート制限。
// 返り値 .error が Response なら呼び出し側は即 return すること。
export async function guardAi(request, { limit = 30, windowSec = 60 } = {}) {
  const user = await getBearerUser(request)
  if (!user) return { error: Response.json({ error: '認証が必要です (ログインしてください)' }, { status: 401 }) }
  const rl = await checkRateLimit(`ai:${user.id}`, { limit, windowSec })
  if (!rl.allowed) return { error: Response.json({ error: 'リクエストが多すぎます。少し待ってから再試行してください。' }, { status: 429 }) }
  return { user }
}
