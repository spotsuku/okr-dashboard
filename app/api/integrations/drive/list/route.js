// ネオ福岡 共有ドライブのフォルダ内一覧
// GET /api/integrations/drive/list?owner=<name>&folder_id=<id>
//
// folder_id 省略時は共有ドライブのルート (NEO_FUKUOKA_DRIVE_ID) を返す。

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'
import { isDemoMode, demoResponse } from '../../../../../lib/demoMocks'

function getDriveId() {
  return process.env.NEO_FUKUOKA_DRIVE_ID || ''
}

export async function GET(request) {
  if (isDemoMode()) return Response.json(demoResponse('drive/list'))
  try {
    return await handleGet(request)
  } catch (e) {
    // 予期しない例外も JSON で返す (Next.js の 500 HTML を避けて診断しやすくする)
    return json({
      error: `drive/list 内部エラー: ${e?.message || e}`,
      stack: (e?.stack || '').split('\n').slice(0, 3).join(' | '),
    }, { status: 500 })
  }
}

async function handleGet(request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get('owner')
  if (!owner) return json({ error: 'owner が必要です' }, { status: 400 })

  const driveId = getDriveId()
  if (!driveId) return json({ error: 'NEO_FUKUOKA_DRIVE_ID 環境変数が未設定です' }, { status: 500 })

  const folderId = url.searchParams.get('folder_id') || driveId

  const res = await getIntegration(owner, 'google')
  if (res.error || !res.integration) return json({ error: res.error || '未連携' }, { status: 400 })
  if (res.expired) return json({ error: res.refreshError || 'トークン期限切れ。再連携してください', needsReauth: true }, { status: 401 })
  const integration = res.integration

  // フォルダ直下のファイル/サブフォルダ一覧
  const listUrl = new URL('https://www.googleapis.com/drive/v3/files')
  listUrl.searchParams.set('q', `'${folderId}' in parents and trashed=false`)
  listUrl.searchParams.set('corpora', 'drive')
  listUrl.searchParams.set('driveId', driveId)
  listUrl.searchParams.set('includeItemsFromAllDrives', 'true')
  listUrl.searchParams.set('supportsAllDrives', 'true')
  listUrl.searchParams.set('orderBy', 'folder,name')
  listUrl.searchParams.set('pageSize', '200')
  listUrl.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size,owners(displayName,emailAddress),parents)')

  try {
    const { response: r } = await callGoogleApiWithRetry(integration, async (token) => {
      return fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
    })
    if (r.status === 401) {
      return json({ error: 'トークン無効、再連携してください', needsReauth: true }, { status: 401 })
    }
    if (r.status === 403) {
      return json({
        error: 'Drive 読み取り権限がありません。連携タブで再認証してください',
        needsScope: true, needsReauth: true,
      }, { status: 403 })
    }
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
      size: f.size ? Number(f.size) : null,
      owner: f.owners?.[0]?.displayName || '',
      ownerEmail: f.owners?.[0]?.emailAddress || '',
    }))

    // 現在のフォルダ情報 & パンくず
    // ルートの場合は Drive 自体の情報を取得
    let folder = null
    let breadcrumb = []
    if (folderId === driveId) {
      // 共有ドライブのルート
      const driveUrl = new URL(`https://www.googleapis.com/drive/v3/drives/${driveId}`)
      driveUrl.searchParams.set('fields', 'id,name')
      try {
        const { response: dr } = await callGoogleApiWithRetry(integration, async (token) => {
          return fetch(driveUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
        })
        if (dr.ok) {
          const dd = await dr.json()
          folder = { id: dd.id, name: dd.name, isRoot: true }
          breadcrumb = [{ id: dd.id, name: dd.name }]
        }
      } catch { /* ignore */ }
    } else {
      // 通常フォルダ → 親階層を辿ってパンくず構築
      const fUrl = new URL(`https://www.googleapis.com/drive/v3/files/${folderId}`)
      fUrl.searchParams.set('supportsAllDrives', 'true')
      fUrl.searchParams.set('fields', 'id,name,parents')
      const { response: fr } = await callGoogleApiWithRetry(integration, async (token) => {
        return fetch(fUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
      })
      if (fr.ok) {
        const ff = await fr.json()
        folder = { id: ff.id, name: ff.name }
        // パンくず: ルートに向かって辿る (最大6階層)
        const crumbs = [{ id: ff.id, name: ff.name }]
        let currentParents = ff.parents || []
        for (let depth = 0; depth < 6 && currentParents.length > 0; depth++) {
          const pid = currentParents[0]
          if (pid === driveId) {
            crumbs.unshift({ id: driveId, name: 'ネオ福岡', isRoot: true })
            break
          }
          const pUrl = new URL(`https://www.googleapis.com/drive/v3/files/${pid}`)
          pUrl.searchParams.set('supportsAllDrives', 'true')
          pUrl.searchParams.set('fields', 'id,name,parents')
          const { response: pr } = await callGoogleApiWithRetry(integration, async (token) => {
            return fetch(pUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
          })
          if (!pr.ok) break
          const pp = await pr.json()
          crumbs.unshift({ id: pp.id, name: pp.name })
          currentParents = pp.parents || []
        }
        breadcrumb = crumbs
      }
    }

    return json({ folder, breadcrumb, items })
  } catch (e) {
    return json({ error: `取得失敗: ${e.message}` }, { status: 500 })
  }
}
