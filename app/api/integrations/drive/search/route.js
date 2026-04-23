// ネオ福岡 共有ドライブ 全文検索
// GET /api/integrations/drive/search?owner=<name>&q=<query>&mime=<mime>
//
// Drive API の fullText contains でタイトル/本文を検索。mime で絞り込み可。

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

function getDriveId() {
  return process.env.NEO_FUKUOKA_DRIVE_ID || ''
}

// Drive API の q 文字列でエスケープが必要な文字
function escapeQuery(q) {
  return q.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export async function GET(request) {
  try { return await handleGet(request) } catch (e) {
    return json({ error: `drive/search 内部エラー: ${e?.message || e}` }, { status: 500 })
  }
}

async function handleGet(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  const query = (url.searchParams.get('q') || '').trim()
  const mime = url.searchParams.get('mime')  // 任意

  if (!owner) return json({ error: 'owner が必要です' }, { status: 400 })
  if (!query) return json({ items: [] })

  const driveId = getDriveId()
  if (!driveId) return json({ error: 'NEO_FUKUOKA_DRIVE_ID 環境変数が未設定です' }, { status: 500 })

  const res = await getIntegration(owner, 'google')
  if (res.error || !res.integration) return json({ error: res.error || '未連携' }, { status: 400 })
  if (res.expired) return json({ error: 'トークン期限切れ', needsReauth: true }, { status: 401 })
  const integration = res.integration

  const escaped = escapeQuery(query)
  // name もしくは fullText にマッチ + 非ゴミ箱
  const qParts = [
    `(name contains '${escaped}' or fullText contains '${escaped}')`,
    'trashed = false',
  ]
  if (mime) qParts.push(`mimeType = '${escapeQuery(mime)}'`)
  const q = qParts.join(' and ')

  const searchUrl = new URL('https://www.googleapis.com/drive/v3/files')
  searchUrl.searchParams.set('q', q)
  searchUrl.searchParams.set('corpora', 'drive')
  searchUrl.searchParams.set('driveId', driveId)
  searchUrl.searchParams.set('includeItemsFromAllDrives', 'true')
  searchUrl.searchParams.set('supportsAllDrives', 'true')
  searchUrl.searchParams.set('orderBy', 'modifiedTime desc')
  searchUrl.searchParams.set('pageSize', '30')
  searchUrl.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink,owners(displayName,emailAddress),parents)')

  try {
    const { response: r } = await callGoogleApiWithRetry(integration, async (token) => {
      return fetch(searchUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
    })
    if (r.status === 401) return json({ error: 'トークン無効', needsReauth: true }, { status: 401 })
    if (r.status === 403) return json({
      error: 'Drive 読み取り権限なし。再認証してください', needsScope: true, needsReauth: true,
    }, { status: 403 })
    if (!r.ok) {
      const body = await r.text()
      return json({ error: `Drive API ${r.status}: ${body.slice(0, 200)}` }, { status: r.status })
    }
    const data = await r.json()
    const items = (data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      iconLink: f.iconLink,
      owner: f.owners?.[0]?.displayName || '',
      ownerEmail: f.owners?.[0]?.emailAddress || '',
    }))
    return json({ query, items })
  } catch (e) {
    return json({ error: `検索失敗: ${e.message}` }, { status: 500 })
  }
}
