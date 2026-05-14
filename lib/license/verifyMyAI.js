// ─────────────────────────────────────────────────────────────────────────────
// myAI license verify API のサーバー側ラッパ
//
//   POST https://my-ai.community/api/v1/license/verify
//     body: { license_key }
//     200 active   : { active: true, product_id, buyer_external_id, expires_at, billing_type }
//     200 inactive : { active: false, reason: "not_found" | "canceled" | "expired" }
//
// 環境変数 (Vercel):
//   MYAI_VERIFY_URL          : 既定 https://my-ai.community/api/v1/license/verify
//   MYAI_EXPECTED_PRODUCT_ID : 設定されていると product_id 不一致を inactive 扱い
//
// 失敗パターン (タイムアウト / 5xx) は reason='verify_failed' を返し、
// 呼び出し元 (API ルート) はキャッシュされた最後の状態を維持する責任を持つ。
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_URL = 'https://my-ai.community/api/v1/license/verify'
const TIMEOUT_MS = 5000

export async function verifyMyAILicense(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { active: false, reason: 'not_found' }
  }
  const url = process.env.MYAI_VERIFY_URL || DEFAULT_URL
  const expectedProductId = process.env.MYAI_EXPECTED_PRODUCT_ID || null

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey }),
      signal: ctl.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)

    if (!res.ok) {
      return { active: false, reason: 'verify_failed', http_status: res.status }
    }
    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      return { active: false, reason: 'verify_failed' }
    }
    if (!data.active) {
      const reason = typeof data.reason === 'string' ? data.reason : 'not_found'
      return { active: false, reason }
    }

    // product_id 固定モード: 他 SaaS のキーを弾く
    if (expectedProductId && data.product_id && data.product_id !== expectedProductId) {
      return { active: false, reason: 'wrong_product' }
    }

    return {
      active: true,
      product_id: data.product_id || null,
      buyer_external_id: data.buyer_external_id || null,
      billing_type: data.billing_type || null,
      expires_at: data.expires_at || null,
    }
  } catch (e) {
    clearTimeout(timer)
    const aborted = e?.name === 'AbortError'
    return {
      active: false,
      reason: aborted ? 'verify_timeout' : 'verify_failed',
      error: e?.message || String(e),
    }
  }
}
