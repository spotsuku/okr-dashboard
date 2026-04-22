// 連携 API 共通ヘルパー
import { createClient } from '@supabase/supabase-js'

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Next.js は fetch を内部キャッシュする (Data Cache)。
      // 連携前の dashboard 初回ロードで空配列が返ったレスポンスが固定キャッシュされ、
      // 連携完了後も「DB内に行がありません」が返り続ける現象が確認されたため、
      // Supabase 経由の fetch はすべて cache:'no-store' を強制する。
      global: {
        fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  )
}

// Google アクセストークンをリフレッシュトークンで更新する
// 成功すると fresh なトークン情報を返し、DB も更新する
export async function refreshGoogleToken(integration) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / SECRET が未設定です')
  }
  if (!integration.refresh_token) {
    throw new Error('refresh_token が保存されていません。再連携してください')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(`Google refresh failed: ${data.error || data.error_description || res.status}`)
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null

  // 新しいトークンを DB に反映 (scope が返れば更新)
  // ※ .single() は 1 行存在しても null を返すケースが確認されたので使わない
  const admin = getAdminClient()
  const { data: updatedRows, error } = await admin
    .from('user_integrations')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt,
      scope: data.scope || integration.scope,
      refresh_token: data.refresh_token || integration.refresh_token,
      updated_at: new Date().toISOString(),
    })
    .eq('owner', integration.owner)
    .eq('service', integration.service)
    .select()
  if (error) throw new Error(`トークン更新DBエラー: ${error.message}`)
  const updated = updatedRows && updatedRows[0]
  if (!updated) throw new Error('トークン更新後の行が取得できません (owner/service 不一致?)')
  return updated
}

// owner + service の連携を取得。期限切れなら自動リフレッシュ
export async function getIntegration(owner, service = 'google') {
  if (!owner) return { error: 'owner が指定されていません' }

  // 環境変数チェック (未設定なら即座に原因特定できるようにする)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { error: '環境変数 NEXT_PUBLIC_SUPABASE_URL が未設定です (Vercel Preview env?)' }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: '環境変数 SUPABASE_SERVICE_ROLE_KEY が未設定です (Vercel Preview env?)' }
  }

  // ※ .maybeSingle() は 1 行存在しても null を返すケースがあるため配列取得して自前で絞る
  const admin = getAdminClient()
  const { data: rows, error } = await admin
    .from('user_integrations')
    .select('*')
    .eq('owner', owner)
    .eq('service', service)
    .limit(1)
  if (error) {
    console.error('[getIntegration] supabase error', { owner, service, error })
    const detail = [error.message, error.code && `code=${error.code}`, error.hint && `hint=${error.hint}`]
      .filter(Boolean).join(' | ')
    return { error: `DB読込エラー: ${detail}` }
  }
  const data = rows && rows[0]
  if (!data) {
    // ヒント: 同じ owner または同じ service の行を一部だけ返す
    let hintStr = ''
    try {
      const { data: hints } = await admin
        .from('user_integrations')
        .select('owner, service')
        .limit(10)
      if (hints && hints.length > 0) {
        hintStr = ` (DB内の行: ${hints.map(h => `${h.owner}/${h.service}`).join(', ')})`
      } else {
        hintStr = ' (DB内に行がありません)'
      }
    } catch { /* noop */ }
    // 接続先 Supabase URL を併記して、想定 DB と異なる接続をしていないか即確認できるようにする
    const dbHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0]
    return { error: `未連携: owner="${owner}" service="${service}"${hintStr} [db=${dbHost}]` }
  }

  // 期限切れ or 60秒以内に切れる → 自動リフレッシュ
  const needsRefresh = data.expires_at
    && new Date(data.expires_at).getTime() < Date.now() + 60_000
  if (needsRefresh && data.refresh_token) {
    try {
      const refreshed = await refreshGoogleToken(data)
      return { integration: refreshed, expired: false, refreshed: true }
    } catch (e) {
      return { integration: data, expired: true, refreshError: e.message }
    }
  }
  if (needsRefresh) {
    return { integration: data, expired: true }
  }
  return { integration: data, expired: false }
}

// Google API 呼び出し時の 401 自動リトライ (refresh → 再試行)
export async function callGoogleApiWithRetry(integration, build) {
  let current = integration
  let r = await build(current.access_token)
  if (r.status !== 401) return { response: r, integration: current }
  if (!current.refresh_token) return { response: r, integration: current }
  try {
    current = await refreshGoogleToken(current)
  } catch {
    return { response: r, integration: current }
  }
  const r2 = await build(current.access_token)
  return { response: r2, integration: current }
}

export function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
