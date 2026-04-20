// Slack OAuth 開始エンドポイント
// GET /api/integrations/slack/start?owner=<name>&return_to=<path>
// → Slack の OAuth 認可画面へリダイレクト

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner') || ''
  const returnTo = url.searchParams.get('return_to') || '/?page=mycoach'

  if (!owner) {
    return redirectToError(request, 'owner パラメータが必要です', returnTo)
  }

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) {
    return redirectToError(request, 'SLACK_CLIENT_ID が未設定です (Vercel 環境変数を確認)', returnTo)
  }

  // state に owner + returnTo + nonce を埋め込み (base64url)
  const nonce = Math.random().toString(36).slice(2, 10)
  const statePayload = JSON.stringify({ owner, returnTo, nonce })
  const state = Buffer.from(statePayload).toString('base64url')

  const redirectUri = `${getOrigin(request)}/api/integrations/slack/callback`

  // https://api.slack.com/authentication/oauth-v2
  // 必要なスコープ: channels:history, groups:history, im:history, mpim:history, users:read, reactions:read 等
  // MVP用は最小構成: channels:read, im:read, users:read
  const scopes = [
    'channels:read',
    'channels:history',
    'groups:read',
    'im:read',
    'im:history',
    'users:read',
    'users:read.email',
  ].join(',')

  const authUrl = new URL('https://slack.com/oauth/v2/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('user_scope', scopes) // user token で自分の未読を取得
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)

  return Response.redirect(authUrl.toString(), 302)
}

function getOrigin(request) {
  const url = new URL(request.url)
  return url.origin
}

function redirectToError(request, message, returnTo) {
  const url = new URL(returnTo, getOrigin(request))
  url.searchParams.set('integ_error', encodeURIComponent(message))
  return Response.redirect(url.toString(), 302)
}
