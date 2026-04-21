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

async function probeTokenInfo(token) {
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
    const j = await r.json().catch(() => ({}))
    return {
      ok: r.ok,
      status: r.status,
      scope: j.scope,
      expires_in: j.expires_in,
      email: j.email,
      aud: j.aud,          // token を発行した client_id
      azp: j.azp,          // authorized party (client_id)
      error: j.error,
      error_description: j.error_description,
    }
  } catch (e) {
    return { ok: false, exception: e.message }
  }
}

async function probeGmailProfile(token) {
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = await r.json().catch(() => ({}))
    return {
      ok: r.ok,
      status: r.status,
      emailAddress: j.emailAddress,
      error: j.error?.message,
      errorStatus: j.error?.status,
    }
  } catch (e) {
    return { ok: false, exception: e.message }
  }
}

// 診断専用: refresh_token を使って /token を直接叩き、結果を細かく返す
async function probeRefresh(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return { ok: false, reason: 'GOOGLE_CLIENT_ID/SECRET 未設定' }
  if (!refreshToken) return { ok: false, reason: 'refresh_token が DB にない' }
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const j = await r.json().catch(() => ({}))
    // 返された新 access_token のマスク + 有効性サマリのみ返す
    return {
      ok: r.ok && !!j.access_token,
      status: r.status,
      access_token_masked: mask(j.access_token),
      scope: j.scope,
      expires_in: j.expires_in,
      has_new_refresh_token: !!j.refresh_token,
      error: j.error,
      error_description: j.error_description,
    }
  } catch (e) {
    return { ok: false, exception: e.message }
  }
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
    env: {
      has_google_client_id: !!(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID),
      has_google_client_secret: !!(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    },
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
  }

  diag.live = await probeTokenInfo(integ.access_token)
  diag.gmailProbe = await probeGmailProfile(integ.access_token)
  diag.refreshProbe = await probeRefresh(integ.refresh_token)

  // refresh で新たに得た access_token が実際に Google から見て有効か？
  // ここで refreshProbe.ok かつ live.status=400 などのとき、token 発行→即 tokeninfo で 400
  // になるなら環境変数の client_id と refresh_token 発行元 client が不整合な可能性が高い。
  diag.hint = (() => {
    if (diag.live?.ok) return 'stored access_token は Google 側で有効です'
    if (diag.refreshProbe?.ok && !diag.live?.ok) {
      return 'refresh は成功するが tokeninfo が拒否。GOOGLE_CLIENT_ID/SECRET が refresh_token の発行元 client と一致していない可能性 → 「連携解除 → 再連携」を実施してください'
    }
    if (!diag.refreshProbe?.ok) {
      return `refresh が失敗 (${diag.refreshProbe?.error || diag.refreshProbe?.reason || diag.refreshProbe?.exception || '不明'})。「連携解除 → 再連携」を実施してください`
    }
    return 'トークンが無効。再連携してください'
  })()

  return json(diag)
}
