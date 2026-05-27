// Google 連携解除
// POST /api/integrations/google/disconnect   Body: { owner }
// DB から行を削除し、Google 側でも token revoke を試みる

import { getAdminClient, json } from '../../_shared'

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const owner = body?.owner
  const organizationId = body?.organization_id || body?.org
  if (!owner) return json({ error: 'owner が必要です' }, { status: 400 })
  if (!organizationId) return json({ error: 'organization_id が必要です (組織ごとに連携が必要です)' }, { status: 400 })

  const admin = getAdminClient()

  // DB から取得 (revoke 用に access_token 取得)。組織スコープで絞る。
  // .maybeSingle() は 1 行存在しても null を返すことがあるため使わない
  let { data: rows, error: selErr } = await admin
    .from('user_integrations')
    .select('access_token,refresh_token')
    .eq('owner', owner).eq('service', 'google').eq('organization_id', organizationId)
    .limit(1)
  // マイグレーション未適用環境フォールバック
  if (selErr && /organization_id|column/i.test(selErr.message || '')) {
    ;({ data: rows } = await admin
      .from('user_integrations')
      .select('access_token,refresh_token')
      .eq('owner', owner).eq('service', 'google')
      .limit(1))
  }
  const row = rows?.[0] || null

  // Google 側で revoke (best-effort、失敗しても DB 削除は進める)
  if (row?.refresh_token || row?.access_token) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: row.refresh_token || row.access_token }),
      })
    } catch { /* noop */ }
  }

  // DB 削除 (組織スコープ)
  let { error } = await admin
    .from('user_integrations')
    .delete()
    .eq('owner', owner).eq('service', 'google').eq('organization_id', organizationId)
  if (error && /organization_id|column/i.test(error.message || '')) {
    ;({ error } = await admin
      .from('user_integrations')
      .delete()
      .eq('owner', owner).eq('service', 'google'))
  }
  if (error) return json({ error: `DB削除エラー: ${error.message}` }, { status: 500 })

  return json({ ok: true })
}
