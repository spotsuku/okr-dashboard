// Google OAuth 開始 (Gmail + Calendar 同時取得)
// GET /api/integrations/google/start?owner=<name>&return_to=<path>

const SCOPES = [
  'openid',
  'email',
  'profile',
  // calendar.events: 予定の閲覧+作成+更新+削除 (primary カレンダー操作に十分)
  // calendar.readonly は互換性のため残す (旧ユーザーが readonly のみで連携済みのため)
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  // drive.readonly: ネオ福岡 共有ドライブの検索・本文取得に必要
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

function getOrigin(request) {
  return new URL(request.url).origin
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const returnTo = url.searchParams.get('return_to') || '/'
  const debug = url.searchParams.get('debug') === '1'

  if (!owner && !debug) return new Response('owner is required', { status: 400 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return new Response('GOOGLE_CLIENT_ID が未設定です', { status: 500 })

  const redirectUri = `${getOrigin(request)}/api/integrations/google/callback`
  const state = Buffer.from(
    JSON.stringify({ owner: owner || 'debug', returnTo }),
    'utf-8'
  ).toString('base64url')

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')       // refresh_token を毎回受け取る
  authUrl.searchParams.set('include_granted_scopes', 'true')
  authUrl.searchParams.set('state', state)

  if (debug) {
    return new Response(JSON.stringify({
      client_id: clientId,
      redirect_uri: redirectUri,
      scopes: SCOPES.split(' '),
      auth_url: authUrl.toString(),
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  return Response.redirect(authUrl.toString(), 302)
}
