// LINE Login OAuth 開始エンドポイント
// GET /api/integrations/line/start?owner=<name>&return_to=<path>

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner') || ''
  const returnTo = url.searchParams.get('return_to') || '/?page=mycoach'

  if (!owner) {
    return redirectToError(request, 'owner パラメータが必要です', returnTo)
  }

  const channelId = process.env.LINE_CHANNEL_ID
  if (!channelId) {
    return redirectToError(request, 'LINE_CHANNEL_ID が未設定です (Vercel 環境変数を確認)', returnTo)
  }

  const nonce = Math.random().toString(36).slice(2, 10)
  const statePayload = JSON.stringify({ owner, returnTo, nonce })
  const state = Buffer.from(statePayload).toString('base64url')

  const redirectUri = `${new URL(request.url).origin}/api/integrations/line/callback`

  // LINE Login v2.1
  // https://developers.line.biz/en/reference/line-login/
  const authUrl = new URL('https://access.line.me/oauth2/v2.1/authorize')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', channelId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'profile openid email')

  return Response.redirect(authUrl.toString(), 302)
}

function redirectToError(request, message, returnTo) {
  const origin = new URL(request.url).origin
  const url = new URL(returnTo, origin)
  url.searchParams.set('integ_error', encodeURIComponent(message))
  return Response.redirect(url.toString(), 302)
}
