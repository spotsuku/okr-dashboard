// Google OAuth を独自フローで開始 (Supabase Auth を経由しない)
// GET /api/integrations/google/start?owner=<name>&service=<google_gmail|google_calendar>&return_to=<path>

function getOrigin(request) {
  return new URL(request.url).origin
}

const SCOPE_MAP = {
  google_gmail: 'https://www.googleapis.com/auth/gmail.readonly openid email profile',
  google_calendar: 'https://www.googleapis.com/auth/calendar.readonly openid email profile',
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const service = url.searchParams.get('service')
  const returnTo = url.searchParams.get('return_to') || '/'

  if (!owner) return new Response('owner is required', { status: 400 })
  if (!service || !SCOPE_MAP[service]) {
    return new Response(`service must be one of: ${Object.keys(SCOPE_MAP).join(', ')}`, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) {
    return new Response('GOOGLE_CLIENT_ID が未設定です', { status: 500 })
  }

  const redirectUri = `${getOrigin(request)}/api/integrations/google/callback`
  const state = Buffer.from(JSON.stringify({ owner, service, returnTo }), 'utf-8').toString('base64url')

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPE_MAP[service])
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')  // refresh_token を毎回返させる
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('include_granted_scopes', 'true')

  return Response.redirect(authUrl.toString(), 302)
}
