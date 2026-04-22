// Google 連携解除
// POST /api/integrations/google/disconnect   Body: { owner }
// DB から行を削除し、Google 側でも token revoke を試みる

import { getAdminClient, json } from '../../_shared'

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const owner = body?.owner
  if (!owner) return json({ error: 'owner が必要です' }, { status: 400 })

  const admin = getAdminClient()

  // DB から取得 (revoke 用に access_token 取得)
  // .maybeSingle() は 1 行存在しても null を返すことがあるため使わない
  const { data: rows } = await admin
    .from('user_integrations')
    .select('access_token,refresh_token')
    .eq('owner', owner).eq('service', 'google')
    .limit(1)
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

  // DB 削除
  const { error } = await admin
    .from('user_integrations')
    .delete()
    .eq('owner', owner).eq('service', 'google')
  if (error) return json({ error: `DB削除エラー: ${error.message}` }, { status: 500 })

  return json({ ok: true })
}
