// 連携APIルート共通ヘルパー
import { createClient } from '@supabase/supabase-js'

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── Token Refresh ─────────────────────────────────────
// Google (Gmail/Calendar) のアクセストークンをリフレッシュ
async function refreshGoogleToken(integration) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / SECRET が未設定です (Vercel環境変数)')
  }
  if (!integration.refresh_token) {
    throw new Error('refresh_token が保存されていません。再連携してください')
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await r.json()
  if (!r.ok || !data.access_token) {
    throw new Error(`Google refresh failed: ${data.error || data.error_description || r.status}`)
  }
  return {
    access_token: data.access_token,
    // Google は通常 refresh_token を再発行しない、既存を保持
    refresh_token: data.refresh_token || integration.refresh_token,
    expires_at: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  }
}

// LINE のアクセストークンをリフレッシュ
async function refreshLineToken(integration) {
  const clientId = process.env.LINE_CHANNEL_ID
  const clientSecret = process.env.LINE_CHANNEL_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('LINE_CHANNEL_ID / SECRET が未設定です (Vercel環境変数)')
  }
  if (!integration.refresh_token) {
    throw new Error('refresh_token が保存されていません。再連携してください')
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const r = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await r.json()
  if (!r.ok || !data.access_token) {
    throw new Error(`LINE refresh failed: ${data.error || data.error_description || r.status}`)
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || integration.refresh_token,
    expires_at: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  }
}

// サービス別リフレッシュ + DB 更新
async function refreshIntegration(integration) {
  let fresh
  switch (integration.service) {
    case 'google_gmail':
    case 'google_calendar':
      fresh = await refreshGoogleToken(integration)
      break
    case 'line':
      fresh = await refreshLineToken(integration)
      break
    case 'slack':
      // Slack の user_token は既定で無期限。refresh_token も要求してないので非対応
      throw new Error('Slack トークンはリフレッシュ非対応')
    default:
      throw new Error(`${integration.service} はリフレッシュ非対応`)
  }
  const admin = getAdminClient()
  const { data: updated, error } = await admin
    .from('user_integrations')
    .update(fresh)
    .eq('owner', integration.owner)
    .eq('service', integration.service)
    .select()
    .single()
  if (error) throw new Error(`トークン更新DBエラー: ${error.message}`)
  return updated
}

// ─── Integration 取得 (期限切れ時は自動リフレッシュ) ──────
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

  // 期限切れ or 60秒以内に切れる → 自動リフレッシュを試行
  const needsRefresh = data.expires_at
    && new Date(data.expires_at).getTime() < Date.now() + 60_000
  if (needsRefresh && data.refresh_token) {
    // Google 系で env vars 未設定なら refresh せず、直接「再連携してください」を返す
    const isGoogle = service === 'google_gmail' || service === 'google_calendar'
    const hasGoogleEnv = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
    if (isGoogle && !hasGoogleEnv) {
      return { integration: data, expired: true, refreshError: 'トークンの有効期限が切れました。再連携してください。' }
    }
    try {
      const refreshed = await refreshIntegration(data)
      return { integration: refreshed, expired: false, refreshed: true }
    } catch (e) {
      return { integration: data, expired: true, refreshError: e.message }
    }
  }
  if (needsRefresh) {
    // refresh_token がない場合は期限切れ扱い
    return { integration: data, expired: true }
  }
  return { integration: data, expired: false }
}

export { refreshIntegration }

export function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
