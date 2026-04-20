// 連携APIルート共通ヘルパー
import { createClient } from '@supabase/supabase-js'

export function getAdminClient() {
    return createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } , global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) }}
        )
}

// Googleアクセストークンをリフレッシュトークンで更新する
async function refreshGoogleToken(refreshToken, owner, service) {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret || !refreshToken) return null

  try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                          client_id: clientId,
                          client_secret: clientSecret,
                          refresh_token: refreshToken,
                          grant_type: 'refresh_token',
                }),
                cache: 'no-store',
        })
        if (!res.ok) return null
        const data = await res.json()
        if (!data.access_token) return null

      // 新しいトークンをDBに保存
      const expiresAt = data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000).toISOString()
              : null
        const admin = getAdminClient()
        await admin
          .from('user_integrations')
          .update({
                    access_token: data.access_token,
                    expires_at: expiresAt,
                    updated_at: new Date().toISOString(),
          })
          .eq('owner', owner)
          .eq('service', service)

      return data.access_token
  } catch (e) {
        return null
  }
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

  // トークンが期限切れの場合、リフレッシュを試みる
    if (!data.expires_at || new Date(data.expires_at) < new Date()) {
        if (data.refresh_token) {
                const newToken = await refreshGoogleToken(data.refresh_token, owner, service)
                if (newToken) {
                          return { integration: { ...data, access_token: newToken }, expired: false }
                }
        }
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
