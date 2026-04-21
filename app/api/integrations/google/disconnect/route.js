// Google 連携の確実な切断 (service_role で DB 行を削除)
// POST /api/integrations/google/disconnect
// Body: { owner, service }
// クライアント側 supabase から delete すると RLS や session 状態で詰まることがあるため、
// admin 経由で確実に消す用のサーバーエンドポイント。

import { getAdminClient, json } from '../../_shared'

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, service } = body || {}
  if (!owner) return json({ error: 'owner が必要です' }, { status: 400 })
  if (!service || !['google_gmail', 'google_calendar'].includes(service)) {
    return json({ error: 'service must be google_gmail or google_calendar' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { error, count } = await admin
    .from('user_integrations')
    .delete({ count: 'exact' })
    .eq('owner', owner)
    .eq('service', service)
  if (error) return json({ error: `削除エラー: ${error.message}` }, { status: 500 })

  return json({ ok: true, deleted: count ?? 0 })
}
