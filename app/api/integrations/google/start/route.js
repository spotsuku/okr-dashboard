// Google OAuth 開始 (Gmail + Calendar 同時取得)
// GET /api/integrations/google/start?owner=<name>&return_to=<path>&login_hint=<email>

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
  const organizationId = url.searchParams.get('organization_id') || url.searchParams.get('org')
  const returnTo = url.searchParams.get('return_to') || '/'
  const loginHint = url.searchParams.get('login_hint') || ''
  const debug = url.searchParams.get('debug') === '1'

  if (!owner && !debug) return new Response('owner is required', { status: 400 })
  if (!organizationId && !debug) return new Response('organization_id is required (組織ごとに連携が必要です)', { status: 400 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return new Response('GOOGLE_CLIENT_ID が未設定です', { status: 500 })

  const redirectUri = `${getOrigin(request)}/api/integrations/google/callback`
  // state は base64url で短く保つ。returnTo は path+search のみ抽出し prefix の重複や
  // 制御文字を排除 (Workspace SSO で長すぎる state が 400 になるケースを回避)。
  let safeReturnTo = '/'
  try {
    const ru = returnTo.startsWith('http')
      ? new URL(returnTo)
      : new URL(returnTo, getOrigin(request))
    safeReturnTo = ru.pathname + ru.search
    if (safeReturnTo.length > 200) safeReturnTo = safeReturnTo.slice(0, 200)
  } catch {
    safeReturnTo = '/'
  }
  const state = Buffer.from(
    JSON.stringify({ owner: owner || 'debug', organizationId: organizationId || null, returnTo: safeReturnTo }),
    'utf-8'
  ).toString('base64url')

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('access_type', 'offline')
  // select_account + consent で「アカウント選択画面」を必ず出す + refresh_token も毎回取得。
  // consent 単独だと既ログインアカウントが暗黙採用され、Workspace 管理アカウントの切替時に
  // accounts.google.com 側で 400 を出すケースがあったため select_account を追加。
  authUrl.searchParams.set('prompt', 'select_account consent')
  authUrl.searchParams.set('include_granted_scopes', 'true')
  authUrl.searchParams.set('state', state)
  // login_hint が指定されていれば付与 (例: 連携解除→再連携時に元のアカウントを既定にする)。
  // ※ アカウント切替が目的の場合は呼び出し側で渡さない。
  if (loginHint) authUrl.searchParams.set('login_hint', loginHint)

  if (debug) {
    return new Response(JSON.stringify({
      client_id: clientId,
      redirect_uri: redirectUri,
      scopes: SCOPES.split(' '),
      auth_url: authUrl.toString(),
      state_length: state.length,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  return Response.redirect(authUrl.toString(), 302)
}
