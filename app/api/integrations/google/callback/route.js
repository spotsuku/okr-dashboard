// Google OAuth コールバック
// Google から code + state を受け取り、トークン交換 → user_integrations に保存

import { getAdminClient } from '../../_shared'

function getOrigin(request) {
  return new URL(request.url).origin
}

function redirectWithError(request, returnTo, message) {
  const url = new URL(returnTo || '/', getOrigin(request))
  url.searchParams.set('integ_error', encodeURIComponent(message))
  return Response.redirect(url.toString(), 302)
}

function redirectWithSuccess(request, returnTo) {
  const url = new URL(returnTo || '/', getOrigin(request))
  url.searchParams.set('integ_result', 'ok')
  url.searchParams.set('integ_service', 'Google')
  return Response.redirect(url.toString(), 302)
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
  const { owner, returnTo } = state || {}

  if (googleError) return redirectWithError(request, returnTo, `Google認可エラー: ${googleError}`)
  if (!code) return redirectWithError(request, returnTo, 'Google から code が返りませんでした')
  if (!owner) return redirectWithError(request, returnTo, 'state に owner が含まれていません')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return redirectWithError(request, returnTo, 'GOOGLE_CLIENT_ID / SECRET が未設定です')
  }

  const redirectUri = `${getOrigin(request)}/api/integrations/google/callback`

  // Step 1: code → access_token / refresh_token
  let tokenData
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
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
    return redirectWithError(request, returnTo, 'Google: access_token が返りませんでした')
  }

  // Step 2: ユーザー情報 (メタデータ用)
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

  // Step 3: DB 保存 (service='google' 1行で Gmail + Calendar まとめ管理)
  try {
    const admin = getAdminClient()
    // 既存 refresh_token を保険として保持 (Google が新 refresh_token を返さないケース対応)
    let existingRefresh = null
    try {
      // .maybeSingle() は 1 行存在しても null を返すことがあるため使わない
      const { data: existingRows } = await admin
        .from('user_integrations')
        .select('refresh_token')
        .eq('owner', owner).eq('service', 'google')
        .limit(1)
      existingRefresh = existingRows?.[0]?.refresh_token || null
    } catch { /* noop */ }

    const { error } = await admin.from('user_integrations').upsert({
      owner,
      service: 'google',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || existingRefresh,
      expires_at: expiresAt,
      scope: tokenData.scope || null,
      metadata: { email },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner,service' })
    if (error) return redirectWithError(request, returnTo, `DB保存エラー: ${error.message}`)
  } catch (e) {
    return redirectWithError(request, returnTo, `DB保存例外: ${e.message}`)
  }

  return redirectWithSuccess(request, returnTo)
}
