// Drive ファイル本文の再取得 (admin のみ)
// POST /api/coo/knowledge/<id>/refresh?owner=<name>
//
// 該当エントリが drive_file の場合、Drive API で text export → cached_text に保存

export const dynamic = 'force-dynamic'

import { getAdminClient, getIntegration, callGoogleApiWithRetry, json } from '../../../../integrations/_shared'

const MAX_CHARS = 30000

function exportMimeFor(mimeType) {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':      return 'text/plain'
    case 'application/vnd.google-apps.spreadsheet':   return 'text/csv'
    case 'application/vnd.google-apps.presentation':  return 'text/plain'
    default: return null
  }
}

async function isAdmin(supabase, ownerName) {
  if (!ownerName) return false
  const { data } = await supabase
    .from('members')
    .select('is_admin')
    .eq('name', ownerName)
    .limit(1)
  return !!(data && data[0] && data[0].is_admin)
}

export async function POST(request, { params }) {
  try {
    const supabase = getAdminClient()
    const url = new URL(request.url)
    const owner = url.searchParams.get('owner')
    if (!(await isAdmin(supabase, owner))) {
      return json({ error: 'admin 権限が必要です' }, { status: 403 })
    }
    // 対象エントリ取得
    const { data: row, error: e1 } = await supabase
      .from('coo_knowledge').select('*').eq('id', params.id).limit(1)
    if (e1) return json({ error: e1.message }, { status: 500 })
    if (!row || !row[0]) return json({ error: 'エントリが見つかりません' }, { status: 404 })
    const entry = row[0]
    if (entry.kind !== 'drive_file' || !entry.drive_file_id) {
      return json({ error: 'drive_file タイプではありません' }, { status: 400 })
    }
    // owner の Google 連携トークンを使って Drive 取得
    const igRes = await getIntegration(owner, 'google')
    if (igRes.error || !igRes.integration) {
      return json({ error: igRes.error || 'Google 未連携' }, { status: 400 })
    }
    if (igRes.expired) {
      return json({ error: 'Google トークン期限切れ', needsReauth: true }, { status: 401 })
    }
    const integration = igRes.integration
    const fileId = entry.drive_file_id

    // メタデータで mimeType 取得
    const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`)
    metaUrl.searchParams.set('supportsAllDrives', 'true')
    metaUrl.searchParams.set('fields', 'id,name,mimeType')
    const { response: mr } = await callGoogleApiWithRetry(integration, async (token) => {
      return fetch(metaUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
    })
    if (!mr.ok) {
      const body = await mr.text()
      const err = `Drive メタ取得失敗: ${mr.status} ${body.slice(0, 200)}`
      await supabase.from('coo_knowledge').update({
        drive_cache_error: err, drive_cached_at: new Date().toISOString(),
      }).eq('id', params.id)
      return json({ error: err }, { status: mr.status })
    }
    const meta = await mr.json()
    const exportMime = exportMimeFor(meta.mimeType)
    if (!exportMime) {
      const err = `${meta.name} はテキスト変換に非対応 (${meta.mimeType})`
      await supabase.from('coo_knowledge').update({
        drive_cached_text: null, drive_cache_error: err,
        drive_cached_at: new Date().toISOString(),
      }).eq('id', params.id)
      return json({ error: err }, { status: 400 })
    }

    // export
    const exportUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`)
    exportUrl.searchParams.set('mimeType', exportMime)
    exportUrl.searchParams.set('supportsAllDrives', 'true')
    const { response: er } = await callGoogleApiWithRetry(integration, async (token) => {
      return fetch(exportUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
    })
    if (!er.ok) {
      const body = await er.text()
      const err = `Drive 本文取得失敗: ${er.status} ${body.slice(0, 200)}`
      await supabase.from('coo_knowledge').update({
        drive_cache_error: err, drive_cached_at: new Date().toISOString(),
      }).eq('id', params.id)
      return json({ error: err }, { status: er.status })
    }
    let text = await er.text()
    const fullLen = text.length
    if (fullLen > MAX_CHARS) text = text.slice(0, MAX_CHARS) + `\n\n... (全${fullLen}文字中 ${MAX_CHARS}文字)`

    const { data: updated, error: e2 } = await supabase
      .from('coo_knowledge')
      .update({
        drive_cached_text: text,
        drive_cache_error: null,
        drive_cached_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()
    if (e2) return json({ error: e2.message }, { status: 500 })

    return json({ item: updated, fileName: meta.name, fullLen })
  } catch (e) {
    return json({ error: e.message }, { status: 500 })
  }
}
