// GET /api/auth/google-client-id
// LoginPage が Google Identity Services (GSI) を初期化するために使う Client ID を返す。
// Client ID は OAuth 仕様上「公開情報」なので環境変数からそのまま返してよい (Client Secret は返さない)。
export const dynamic = 'force-dynamic'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return new Response(JSON.stringify({ error: 'GOOGLE_CLIENT_ID が未設定です' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ client_id: clientId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
