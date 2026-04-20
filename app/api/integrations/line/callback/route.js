// LINE Login OAuth コールバック

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

function redirectWithSuccess(request, returnTo, service) {
  const url = new URL(returnTo || '/', getOrigin(request))
  url.searchParams.set('integ_result', 'ok')
  url.searchParams.set('integ_service', service)
  return Response.redirect(url.toString(), 302)
}

export async function GET(request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const lineError = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  let state
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'))
  } catch {
    return redirectWithError(request, '/', 'state の検証に失敗しました')
  }
  const { owner, returnTo } = state || {}

  if (lineError) {
    return redirectWithError(request, returnTo, `LINE認可エラー: ${lineError} ${errorDesc || ''}`)
  }
  if (!code) {
    return redirectWithError(request, returnTo, 'LINE から code が返りませんでした')
  }
  if (!owner) {
    return redirectWithError(request, returnTo, 'owner が特定できません')
  }

  const channelId = process.env.LINE_CHANNEL_ID
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  if (!channelId || !channelSecret) {
    return redirectWithError(request, returnTo, 'LINE OAuth の環境変数が未設定です')
  }

  const redirectUri = `${getOrigin(request)}/api/integrations/line/callback`

  // code をアクセストークンと交換
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: channelId,
    client_secret: channelSecret,
  })

  let tokenData
  try {
    const r = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    tokenData = await r.json()
  } catch (e) {
    return redirectWithError(request, returnTo, `LINEトークン取得失敗: ${e.message}`)
  }

  if (!tokenData.access_token) {
    return redirectWithError(request, returnTo, `LINE: ${tokenData.error || tokenData.error_description || 'token exchange failed'}`)
  }

  // プロフィール取得
  let profile = {}
  try {
    const pr = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    profile = await pr.json()
  } catch {
    // 失敗してもトークンは保存する
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null

  try {
    const admin = getAdminClient()
    const { error } = await admin.from('user_integrations').upsert({
      owner,
      service: 'line',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      scope: tokenData.scope || null,
      metadata: {
        display_name: profile.displayName || null,
        line_user_id: profile.userId || null,
        picture_url: profile.pictureUrl || null,
      },
    }, { onConflict: 'owner,service' })
    if (error) {
      return redirectWithError(request, returnTo, `DB保存エラー: ${error.message}`)
    }
  } catch (e) {
    return redirectWithError(request, returnTo, `DB保存例外: ${e.message}`)
  }

  return redirectWithSuccess(request, returnTo, 'LINE')
}
