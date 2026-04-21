// Google OAuth を独自フローで開始 (Supabase Auth を経由しない)
// GET /api/integrations/google/start?owner=<name>&service=<google_gmail|google_calendar>&return_to=<path>

function getOrigin(request) {
  return new URL(request.url).origin
}

const SCOPE_MAP = {
  // gmail.compose は「返信下書きの作成」に必要 (readonly だけでは drafts.create 不可)
  google_gmail: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose openid email profile',
  google_calendar: 'https://www.googleapis.com/auth/calendar.readonly openid email profile',
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const service = url.searchParams.get('service')
  const returnTo = url.searchParams.get('return_to') || '/'
  const debug = url.searchParams.get('debug') === '1'

  if (!owner && !debug) return new Response('owner is required', { status: 400 })
  if (!service || !SCOPE_MAP[service]) {
    return new Response(`service must be one of: ${Object.keys(SCOPE_MAP).join(', ')}`, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) {
    return new Response('GOOGLE_CLIENT_ID が未設定です', { status: 500 })
  }

  const redirectUri = `${getOrigin(request)}/api/integrations/google/callback`
  const state = Buffer.from(JSON.stringify({ owner: owner || 'debug', service, returnTo }), 'utf-8').toString('base64url')

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPE_MAP[service])
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')  // refresh_token を毎回返させる + 明示的に同意を取る
  authUrl.searchParams.set('state', state)
  // include_granted_scopes を付けると別サービス(例: Calendar)の既存スコープが混ざり、
  // Gmail の consent 画面で gmail.readonly を外した場合に token が不整合な状態になる。
  // サービスごとに独立したトークンを得るため、ここでは付けない。

  // ?debug=1 で JSON を返し、実際のリクエスト内容を可視化 (Cloud Console の設定照合用)
  if (debug) {
    const scopeList = SCOPE_MAP[service].split(' ')
    const clientIdProject = clientId.split('-')[0]  // プロジェクト番号部分
    // Supabase 接続情報の確認 (キーは表示しない、URL のプロジェクトIDと service_role の ref を返す)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseProjectId = supabaseUrl.replace('https://', '').split('.')[0]
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    let serviceKeyRef = null
    let serviceKeyRole = null
    try {
      const payload = serviceKey.split('.')[1]
      if (payload) {
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
        serviceKeyRef = decoded.ref
        serviceKeyRole = decoded.role
      }
    } catch { /* noop */ }
    const supabaseMatches = supabaseProjectId && serviceKeyRef && supabaseProjectId === serviceKeyRef
    return new Response(JSON.stringify({
      service,
      client_id: clientId,
      client_id_project_number: clientIdProject,
      redirect_uri: redirectUri,
      requested_scopes: scopeList,
      has_gmail_compose: scopeList.includes('https://www.googleapis.com/auth/gmail.compose'),
      access_type: 'offline',
      prompt: 'consent',
      auth_url: authUrl.toString(),
      supabase: {
        url_project_id: supabaseProjectId,
        service_role_ref: serviceKeyRef,
        service_role_role: serviceKeyRole,
        url_and_key_match: supabaseMatches,
        note: supabaseMatches
          ? '✓ URL と SERVICE_ROLE_KEY のプロジェクトIDが一致'
          : '✗ URL と SERVICE_ROLE_KEY のプロジェクトIDが不一致。これが "未連携" エラーの原因',
      },
      hints: [
        '1. client_id_project_number が Google Cloud Console の「認証情報」にある OAuth クライアントと一致するか確認',
        '2. そのプロジェクトの「OAuth同意画面」→「スコープ」に .../auth/gmail.compose が保存されているか確認',
        '3. auth_url をシークレットウィンドウで直接開き、同意画面に「メールの下書きの作成・管理」が表示されるか確認',
      ],
    }, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  return Response.redirect(authUrl.toString(), 302)
}
