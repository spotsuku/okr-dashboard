// Gmail 連携トークンの診断用エンドポイント
// GET /api/integrations/gmail/diagnose?owner=<name>
// DB に保存されている Google トークンの状態と、Google 側の実トークン情報を返す
// 本番で個人情報が漏れないよう、アクセストークン等は先頭/末尾のみ

import { getIntegration, json } from '../../_shared'

function mask(token) {
  if (!token) return null
  if (token.length <= 20) return '***'
  return `${token.slice(0, 10)}...${token.slice(-6)} (len=${token.length})`
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  if (!owner) return json({ error: 'owner is required' }, { status: 400 })

  const result = await getIntegration(owner, 'google_gmail')
  if (result.error) return json({ error: result.error, stage: 'getIntegration' })

  const integ = result.integration
  const diag = {
    owner,
    service: integ.service,
    stored: {
      access_token: mask(integ.access_token),
      refresh_token: mask(integ.refresh_token),
      expires_at: integ.expires_at,
      scope: integ.scope,
      metadata: integ.metadata,
      connected_at: integ.connected_at,
    },
    getIntegration: {
      expired: result.expired,
      refreshError: result.refreshError,
      refreshed: result.refreshed,
    },
    live: null,
    gmailProbe: null,
  }

  // Google tokeninfo で実トークンのスコープ/有効期限を確認
  try {
    const tr = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(integ.access_token)}`)
    const tj = await tr.json().catch(() => ({}))
    diag.live = {
      ok: tr.ok,
      status: tr.status,
      scope: tj.scope,
      expires_in: tj.expires_in,
      email: tj.email,
      error: tj.error,
      error_description: tj.error_description,
    }
  } catch (e) {
    diag.live = { ok: false, exception: e.message }
  }

  // Gmail API を軽く叩いて実挙動を確認
  try {
    const gr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${integ.access_token}` },
    })
    const gj = await gr.json().catch(() => ({}))
    diag.gmailProbe = {
      ok: gr.ok,
      status: gr.status,
      emailAddress: gj.emailAddress,
      error: gj.error?.message,
      errorStatus: gj.error?.status,
    }
  } catch (e) {
    diag.gmailProbe = { ok: false, exception: e.message }
  }

  return json(diag)
}
