// Slack OAuth コールバックエンドポイント
// Slack から code + state を受け取り、トークン交換 → user_integrations に保存

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
  const slackError = url.searchParams.get('error')

  // state を復号
  let state
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'))
  } catch {
    return redirectWithError(request, '/', 'state の検証に失敗しました')
  }
  const { owner, returnTo } = state || {}

  if (slackError) {
    return redirectWithError(request, returnTo, `Slack認可エラー: ${slackError}`)
  }
  if (!code) {
    return redirectWithError(request, returnTo, 'Slack から code が返りませんでした')
  }
  if (!owner) {
    return redirectWithError(request, returnTo, 'owner が特定できません')
  }

  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return redirectWithError(request, returnTo, 'Slack OAuth の環境変数が未設定です')
  }

  // code をアクセストークンと交換
  const redirectUri = `${getOrigin(request)}/api/integrations/slack/callback`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  })

  let tokenData
  try {
    const r = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    tokenData = await r.json()
  } catch (e) {
    return redirectWithError(request, returnTo, `Slackトークン取得失敗: ${e.message}`)
  }

  if (!tokenData.ok) {
    return redirectWithError(request, returnTo, `Slack: ${tokenData.error || 'token exchange failed'}`)
  }

  // user_scope を要求しているので authed_user.access_token を使う
  const userToken = tokenData.authed_user?.access_token
  const userScope = tokenData.authed_user?.scope
  const slackUserId = tokenData.authed_user?.id
  const teamName = tokenData.team?.name
  const teamId = tokenData.team?.id

  if (!userToken) {
    return redirectWithError(request, returnTo, 'Slack user_token が取得できませんでした')
  }

  // DBに保存
  try {
    const admin = getAdminClient()
    const { error } = await admin.from('user_integrations').upsert({
      owner,
      service: 'slack',
      access_token: userToken,
      refresh_token: null,
      expires_at: null,
      scope: userScope || null,
      metadata: {
        team_name: teamName || null,
        team_id: teamId || null,
        slack_user_id: slackUserId || null,
      },
    }, { onConflict: 'owner,service' })
    if (error) {
      return redirectWithError(request, returnTo, `DB保存エラー: ${error.message}`)
    }
  } catch (e) {
    return redirectWithError(request, returnTo, `DB保存例外: ${e.message}`)
  }

  return redirectWithSuccess(request, returnTo, 'Slack')
}
