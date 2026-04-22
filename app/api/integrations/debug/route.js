// 連携機能の診断エンドポイント
// GET /api/integrations/debug?owner=<name>
//
// 以下を返す:
//   - 環境変数の設定有無 (値はマスク)
//   - user_integrations テーブルの件数
//   - owner 指定時: その owner の行 (トークンはマスク)

export const dynamic = 'force-dynamic'

import { getAdminClient, json } from '../_shared'

function mask(val) {
  if (!val) return null
  const s = String(val)
  if (s.length <= 8) return '***'
  return `${s.slice(0, 4)}...${s.slice(-4)} (len=${s.length})`
}

export async function GET(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    GOOGLE_CLIENT_ID: mask(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: mask(process.env.GOOGLE_CLIENT_SECRET),
    ANTHROPIC_API_KEY: mask(process.env.ANTHROPIC_API_KEY),
  }

  const result = { env, db: null, ownerQuery: null }

  try {
    const admin = getAdminClient()

    // 全行の概要 (トークン除外)
    const { data: allRows, error: allErr, count } = await admin
      .from('user_integrations')
      .select('id, owner, service, scope, expires_at, metadata, connected_at, updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .limit(20)

    result.db = allErr
      ? { error: allErr.message, code: allErr.code, details: allErr.details, hint: allErr.hint }
      : { count, rows: (allRows || []).map(r => ({
          id: r.id,
          owner: r.owner,
          ownerHex: Buffer.from(r.owner || '', 'utf-8').toString('hex'), // 不可視文字検出用
          service: r.service,
          scope: r.scope,
          expires_at: r.expires_at,
          metadata: r.metadata,
          connected_at: r.connected_at,
          updated_at: r.updated_at,
        })) }

    // owner 指定時: その行を明示的に引く
    if (owner) {
      const { data: row, error: rowErr } = await admin
        .from('user_integrations')
        .select('*')
        .eq('owner', owner)
        .eq('service', 'google')
        .maybeSingle()
      result.ownerQuery = {
        input: owner,
        inputHex: Buffer.from(owner, 'utf-8').toString('hex'),
        inputLength: owner.length,
        found: !!row,
        error: rowErr ? { message: rowErr.message, code: rowErr.code, details: rowErr.details } : null,
        row: row ? {
          owner: row.owner,
          service: row.service,
          scope: row.scope,
          expires_at: row.expires_at,
          metadata: row.metadata,
          hasAccessToken: !!row.access_token,
          hasRefreshToken: !!row.refresh_token,
          accessTokenMasked: mask(row.access_token),
          connected_at: row.connected_at,
        } : null,
      }
    }
  } catch (e) {
    result.exception = e.message
  }

  return json(result)
}
