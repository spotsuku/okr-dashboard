// POST /api/license/save
// 組織にライセンスキーを登録 / 上書きする。保存時に myAI verify も同時実行し
// 結果を organization_licenses に upsert する (active 判定の初期化を兼ねる)。
//
//   body: { organization_id, license_key, requester_email }
//   権限: organization owner / admin のみ
//
//   200: { ok: true, status: { active, reason, ... } }
//   400: { error: 'パラメータ不足' }
//   403: { error: '権限がありません' }
//   500: { error: '<message>' }

export const dynamic = 'force-dynamic'

import { adminClient, jsonResponse, checkOrgRole } from '../../../../lib/license/serverAuth'
import { verifyMyAILicense } from '../../../../lib/license/verifyMyAI'

export async function POST(request) {
  let payload
  try { payload = await request.json() }
  catch { return jsonResponse({ error: 'JSON parse error' }, { status: 400 }) }

  const { organization_id, license_key, requester_email } = payload || {}
  if (!organization_id || !license_key || !requester_email) {
    return jsonResponse({ error: '必須パラメータ不足 (organization_id / license_key / requester_email)' }, { status: 400 })
  }
  const key = String(license_key).trim()
  if (!key) {
    return jsonResponse({ error: 'license_key が空です' }, { status: 400 })
  }

  const sb = adminClient()
  const auth = await checkOrgRole(sb, organization_id, requester_email, { requireManage: true })
  if (!auth.ok) {
    return jsonResponse({ error: '権限がありません (owner/admin のみ)' }, { status: 403 })
  }

  const verifyResult = await verifyMyAILicense(key)
  const now = new Date().toISOString()
  const row = {
    organization_id,
    license_key: key,
    product_id: verifyResult.product_id || null,
    buyer_external_id: verifyResult.buyer_external_id || null,
    billing_type: verifyResult.billing_type || null,
    expires_at: verifyResult.expires_at || null,
    active: !!verifyResult.active,
    last_reason: verifyResult.active ? null : (verifyResult.reason || 'not_found'),
    last_verified_at: now,
  }

  const { error } = await sb.from('organization_licenses')
    .upsert(row, { onConflict: 'organization_id' })
  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 })
  }

  return jsonResponse({
    ok: true,
    status: {
      active: row.active,
      reason: row.last_reason,
      has_key: true,
      grandfathered: false,
      product_id: row.product_id,
      billing_type: row.billing_type,
      expires_at: row.expires_at,
      last_verified_at: row.last_verified_at,
    },
  })
}
