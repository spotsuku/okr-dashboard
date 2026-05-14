// GET /api/license/status?organization_id=...&requester_email=...
// 組織の現在のライセンス状態を返す。クライアントの LicenseProvider が叩く。
//
//   - grandfathered=true の組織は即 active 同然 (myAI verify を呼ばない)
//   - キー未登録 → has_key=false, active=false, reason='not_set'
//   - 登録済み + last_verified_at が 60 秒以内 → DB キャッシュをそのまま返す
//   - 登録済み + 古い  → myAI verify を呼び直して DB を更新してから返す
//
//   200: {
//     active, grandfathered, has_key, reason,
//     product_id, billing_type, expires_at, last_verified_at
//   }
//   400: { error: 'パラメータ不足' }
//   403: { error: '権限がありません' }

export const dynamic = 'force-dynamic'

import { adminClient, jsonResponse, checkOrgRole } from '../../../../lib/license/serverAuth'
import { verifyMyAILicense } from '../../../../lib/license/verifyMyAI'

const CACHE_TTL_SEC = 60

export async function GET(request) {
  const url = new URL(request.url)
  const organization_id = url.searchParams.get('organization_id')
  const requester_email = url.searchParams.get('requester_email')

  if (!organization_id || !requester_email) {
    return jsonResponse({ error: '必須パラメータ不足' }, { status: 400 })
  }

  const sb = adminClient()
  const auth = await checkOrgRole(sb, organization_id, requester_email)
  if (!auth.ok) {
    return jsonResponse({ error: '権限がありません' }, { status: 403 })
  }

  // 組織の grandfathered フラグを取得
  const { data: org, error: orgErr } = await sb
    .from('organizations')
    .select('id, license_grandfathered')
    .eq('id', organization_id)
    .maybeSingle()
  if (orgErr) return jsonResponse({ error: orgErr.message }, { status: 500 })
  if (!org) return jsonResponse({ error: '組織が見つかりません' }, { status: 404 })

  if (org.license_grandfathered) {
    return jsonResponse({
      active: true,
      grandfathered: true,
      has_key: false,
      reason: null,
      product_id: null,
      billing_type: null,
      expires_at: null,
      last_verified_at: null,
    })
  }

  // ライセンス行を取得
  const { data: lic, error: licErr } = await sb
    .from('organization_licenses')
    .select('license_key, product_id, buyer_external_id, billing_type, expires_at, active, last_reason, last_verified_at')
    .eq('organization_id', organization_id)
    .maybeSingle()
  if (licErr) return jsonResponse({ error: licErr.message }, { status: 500 })

  if (!lic) {
    return jsonResponse({
      active: false,
      grandfathered: false,
      has_key: false,
      reason: 'not_set',
      product_id: null,
      billing_type: null,
      expires_at: null,
      last_verified_at: null,
    })
  }

  // キャッシュ判定
  const lastTs = lic.last_verified_at ? new Date(lic.last_verified_at).getTime() : 0
  const ageSec = (Date.now() - lastTs) / 1000
  const fresh = lastTs > 0 && ageSec < CACHE_TTL_SEC

  if (fresh) {
    return jsonResponse({
      active: !!lic.active,
      grandfathered: false,
      has_key: true,
      reason: lic.active ? null : (lic.last_reason || 'not_found'),
      product_id: lic.product_id || null,
      billing_type: lic.billing_type || null,
      expires_at: lic.expires_at || null,
      last_verified_at: lic.last_verified_at,
    })
  }

  // 期限切れ: myAI へ再検証
  const v = await verifyMyAILicense(lic.license_key)
  const now = new Date().toISOString()
  const upstreamFailed = !v.active && (v.reason === 'verify_failed' || v.reason === 'verify_timeout')

  const updates = { last_verified_at: now }
  if (!upstreamFailed) {
    updates.active = !!v.active
    updates.last_reason = v.active ? null : (v.reason || 'not_found')
    if (v.active) {
      updates.product_id = v.product_id || null
      updates.buyer_external_id = v.buyer_external_id || null
      updates.billing_type = v.billing_type || null
      updates.expires_at = v.expires_at || null
    }
  }
  await sb.from('organization_licenses').update(updates).eq('organization_id', organization_id)

  const active = upstreamFailed ? !!lic.active : !!v.active
  const reason = upstreamFailed
    ? (lic.active ? null : (lic.last_reason || 'not_found'))
    : (v.active ? null : (v.reason || 'not_found'))

  return jsonResponse({
    active,
    grandfathered: false,
    has_key: true,
    reason,
    product_id: (v.product_id ?? lic.product_id) || null,
    billing_type: (v.billing_type ?? lic.billing_type) || null,
    expires_at: (v.expires_at ?? lic.expires_at) || null,
    last_verified_at: now,
  })
}
