// 連携APIルート共通ヘルパー
import { createClient } from '@supabase/supabase-js'

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getIntegration(owner, service) {
  if (!owner) return { error: 'owner が指定されていません' }
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('user_integrations')
    .select('*')
    .eq('owner', owner)
    .eq('service', service)
    .maybeSingle()
  if (error) return { error: `DB読込エラー: ${error.message}` }
  if (!data) return { error: '未連携' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { integration: data, expired: true }
  }
  return { integration: data, expired: false }
}

export function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
