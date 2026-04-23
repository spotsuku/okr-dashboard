// ドライブファイルの本文取得 (Google native のみ text export)
// GET /api/integrations/drive/file/<file_id>?owner=<name>
//
// 対応:
//   - application/vnd.google-apps.document    → text/plain
//   - application/vnd.google-apps.spreadsheet → text/csv (1シート目のみ)
//   - application/vnd.google-apps.presentation → text/plain
//   - その他 (PDF/Office等) → メタデータのみ返す (text: null)
//
// 最大 30,000 文字で truncate (AI のトークン節約)

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../../_shared'

const MAX_CHARS = 30000

function exportMimeFor(mimeType) {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':      return 'text/plain'
    case 'application/vnd.google-apps.spreadsheet':   return 'text/csv'
    case 'application/vnd.google-apps.presentation':  return 'text/plain'
    default: return null
  }
}

export async function GET(request, ctx) {
  try { return await handleGet(request, ctx) } catch (e) {
    return json({ error: `drive/file 内部エラー: ${e?.message || e}` }, { status: 500 })
  }
}

async function handleGet(request, { params }) {
  const fileId = params.id
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  if (!owner) return json({ error: 'owner が必要です' }, { status: 400 })
  if (!fileId) return json({ error: 'file_id が必要です' }, { status: 400 })

  const res = await getIntegration(owner, 'google')
  if (res.error || !res.integration) return json({ error: res.error || '未連携' }, { status: 400 })
  if (res.expired) return json({ error: 'トークン期限切れ', needsReauth: true }, { status: 401 })
  const integration = res.integration

  // メタデータ取得
  const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`)
  metaUrl.searchParams.set('supportsAllDrives', 'true')
  metaUrl.searchParams.set('fields', 'id,name,mimeType,modifiedTime,webViewLink,owners(displayName)')

  const { response: mr } = await callGoogleApiWithRetry(integration, async (token) => {
    return fetch(metaUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
  })
  if (!mr.ok) {
    const body = await mr.text()
    return json({ error: `メタ取得失敗: ${mr.status} ${body.slice(0, 200)}` }, { status: mr.status })
  }
  const meta = await mr.json()

  const exportMime = exportMimeFor(meta.mimeType)
  if (!exportMime) {
    // 本文取得非対応
    return json({
      id: meta.id, name: meta.name, mimeType: meta.mimeType,
      modifiedTime: meta.modifiedTime, webViewLink: meta.webViewLink,
      owner: meta.owners?.[0]?.displayName || '',
      text: null, truncated: false,
      note: 'このファイル形式は本文取得に対応していません (Google Docs/Sheets/Slides のみ)',
    })
  }

  // export で text を取得
  const exportUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`)
  exportUrl.searchParams.set('mimeType', exportMime)
  exportUrl.searchParams.set('supportsAllDrives', 'true')

  const { response: er } = await callGoogleApiWithRetry(integration, async (token) => {
    return fetch(exportUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
  })
  if (!er.ok) {
    const body = await er.text()
    return json({ error: `本文取得失敗: ${er.status} ${body.slice(0, 200)}` }, { status: er.status })
  }
  let text = await er.text()
  const fullLen = text.length
  const truncated = fullLen > MAX_CHARS
  if (truncated) text = text.slice(0, MAX_CHARS) + `\n\n... (全${fullLen}文字中 ${MAX_CHARS}文字で切り詰め)`

  return json({
    id: meta.id, name: meta.name, mimeType: meta.mimeType,
    modifiedTime: meta.modifiedTime, webViewLink: meta.webViewLink,
    owner: meta.owners?.[0]?.displayName || '',
    text, truncated, fullLen,
  })
}
