// Google OAuth コールバック
// Google から code + state を受け取り、トークン交換 → user_integrations に保存

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getOrigin(request) {
  return new URL(request.url).origin
}

function redirectWithError(request, returnTo, message) {
  const url = new URL(returnTo || '/', getOrigin(request))
  url.searchParams.set('integ_error', encodeURIComponent(message))
  return Response.redirect(url.toString(), 302)
}

function redirectWithSuccess(request, returnTo, serviceTitle) {
  const url = new URL(returnTo || '/', getOrigin(request))
  url.searchParams.set('integ_result', 'ok')
  url.searchParams.set('integ_service', serviceTitle)
  return Response.redirect(url.toString(), 302)
}

const SERVICE_TITLE = {
  google_gmail: 'Gmail',
  google_calendar: 'Google Calendar',
}

export async function GET(request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const googleError = url.searchParams.get('error')

  let state
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'))
  } catch {
    return redirectWithError(request, '/', 'state の検証に失敗しました')
  }
  const { owner, service, returnTo } = state || {}

  if (googleError) {
    return redirectWithError(request, returnTo, `Google認可エラー: ${googleError}`)
  }
  if (!code) {
    return redirectWithError(request, returnTo, 'Google から code が返りませんでした')
  }
  if (!owner || !service) {
    return redirectWithError(request, returnTo, 'state に owner / service が含まれていません')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return redirectWithError(request, returnTo, 'GOOGLE_CLIENT_ID / SECRET が未設定です')
  }

  const redirectUri = `${getOrigin(request)}/api/integrations/google/callback`

  // code をアクセストークンと交換
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })

  let tokenData
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    tokenData = await r.json()
    if (!r.ok) {
      return redirectWithError(request, returnTo,
        `Googleトークン取得失敗 ${r.status}: ${tokenData.error || tokenData.error_description || 'unknown'}`)
    }
  } catch (e) {
    return redirectWithError(request, returnTo, `Googleトークン取得例外: ${e.message}`)
  }

  if (!tokenData.access_token) {
    return redirectWithError(request, returnTo, `Google: access_token が返りませんでした`)
  }

  // ユーザー情報取得 (メタデータ用)
  let email = ''
  try {
    const ur = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (ur.ok) {
      const u = await ur.json()
      email = u.email || ''
    }
  } catch { /* noop */ }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null

  try {
    const admin = getAdminClient()
    const { error } = await admin.from('user_integrations').upsert({
      owner,
      service,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      scope: tokenData.scope || null,
      metadata: { email },
    }, { onConflict: 'owner,service' })
    if (error) {
      return redirectWithError(request, returnTo, `DB保存エラー: ${error.message}`)
    }
  } catch (e) {
    return redirectWithError(request, returnTo, `DB保存例外: ${e.message}`)
  }

  return redirectWithSuccess(request, returnTo, SERVICE_TITLE[service] || service)
}
