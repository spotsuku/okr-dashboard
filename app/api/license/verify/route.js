// POST /api/license/verify
// 組織の現在の license_key を myAI に問い合わせ直して DB を更新する。
// 「再検証」ボタン用 + サーバー側からの強制リフレッシュ用。
//
//   body: { organization_id, requester_email }
//   権限: 組織所属者 (owner/admin/member)
//
//   200: { ok: true, status: { active, reason, ... } }
//   400: { error: 'パラメータ不足' }
//   403: { error: '権限がありません' }
//   404: { error: 'ライセンス未登録' }

export const dynamic = 'force-dynamic'

import { adminClient, jsonResponse, checkOrgRole } from '../../../../lib/license/serverAuth'
import { verifyMyAILicense } from '../../../../lib/license/verifyMyAI'

export async function POST(request) {
  let payload
  try { payload = await request.json() }
  catch { return jsonResponse({ error: 'JSON parse error' }, { status: 400 }) }

  const { organization_id, requester_email } = payload || {}
  if (!organization_id || !requester_email) {
    return jsonResponse({ error: '必須パラメータ不足' }, { status: 400 })
  }

  const sb = adminClient()
  const auth = await checkOrgRole(sb, organization_id, requester_email)
  if (!auth.ok) {
    return jsonResponse({ error: '権限がありません' }, { status: 403 })
  }

  const { data: existing, error: selErr } = await sb
    .from('organization_licenses')
    .select('license_key')
    .eq('organization_id', organization_id)
    .maybeSingle()
  if (selErr) return jsonResponse({ error: selErr.message }, { status: 500 })
  if (!existing?.license_key) {
    return jsonResponse({ error: 'ライセンス未登録' }, { status: 404 })
  }

  const verifyResult = await verifyMyAILicense(existing.license_key)
  const now = new Date().toISOString()

  // verify_failed (= 上流障害) のときは active を維持してキャッシュ続投。
  // それ以外 (active=true / not_found / canceled / expired / wrong_product) は反映。
  const isUpstreamFailure =
    !verifyResult.active && (verifyResult.reason === 'verify_failed' || verifyResult.reason === 'verify_timeout')

  const updates = {
    last_verified_at: now,
  }
  if (!isUpstreamFailure) {
    updates.active = !!verifyResult.active
    updates.last_reason = verifyResult.active ? null : (verifyResult.reason || 'not_found')
    if (verifyResult.active) {
      updates.product_id = verifyResult.product_id || null
      updates.buyer_external_id = verifyResult.buyer_external_id || null
      updates.billing_type = verifyResult.billing_type || null
      updates.expires_at = verifyResult.expires_at || null
    }
  }

  const { data: updated, error: updErr } = await sb
    .from('organization_licenses')
    .update(updates)
    .eq('organization_id', organization_id)
    .select('active, last_reason, product_id, billing_type, expires_at, last_verified_at')
    .maybeSingle()
  if (updErr) return jsonResponse({ error: updErr.message }, { status: 500 })

  return jsonResponse({
    ok: true,
    upstream_failed: isUpstreamFailure,
    status: {
      active: !!updated?.active,
      reason: updated?.last_reason || null,
      has_key: true,
      grandfathered: false,
      product_id: updated?.product_id || null,
      billing_type: updated?.billing_type || null,
      expires_at: updated?.expires_at || null,
      last_verified_at: updated?.last_verified_at || now,
    },
  })
}
