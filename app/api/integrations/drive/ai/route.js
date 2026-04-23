// Drive 検索・閲覧の AI アシスタント (Claude tool use)
// POST /api/integrations/drive/ai
// Body: {
//   owner,
//   message,
//   history: [{role, content}]
// }
// Response: { text, actions: [{tool, input, result}], suggested_files: [] }
//
// Tools (全て即実行、読み取りのみ):
//   search_files(query, mime?)  - ネオ福岡 共有ドライブ全文検索
//   read_file(file_id)          - Google Docs/Sheets/Slides の本文取得 + 要約材料

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

const MODEL = 'claude-sonnet-4-5'
const MAX_STEPS = 6
const MAX_READ_CHARS = 20000  // AI に渡す最大本文文字数 (tokens 節約)

function getDriveId() { return process.env.NEO_FUKUOKA_DRIVE_ID || '' }
function escapeQuery(q) { return q.replace(/\\/g, '\\\\').replace(/'/g, "\\'") }

const TOOLS = [
  {
    name: 'search_files',
    description: 'ネオ福岡 共有ドライブ内のファイルを全文検索する。タイトル/本文のどちらにヒットしても返す。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '検索キーワード (タイトル/本文にマッチ)' },
        mime: {
          type: 'string',
          description: 'MIME type で絞り込み (省略可)。例: application/vnd.google-apps.document (Docs), application/vnd.google-apps.spreadsheet (Sheets), application/vnd.google-apps.presentation (Slides), application/pdf',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description: 'Google Docs / Sheets / Slides の本文を取得する。PDF や Office 形式は本文取得不可 (メタデータのみ)。',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: 'search_files で得た id' },
      },
      required: ['file_id'],
    },
  },
]

async function doSearch(integration, driveId, query, mime) {
  const q = [
    `(name contains '${escapeQuery(query)}' or fullText contains '${escapeQuery(query)}')`,
    'trashed = false',
    mime ? `mimeType = '${escapeQuery(mime)}'` : null,
  ].filter(Boolean).join(' and ')
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('corpora', 'drive')
  url.searchParams.set('driveId', driveId)
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('pageSize', '15')
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))')
  const { response: r } = await callGoogleApiWithRetry(integration, async (token) => {
    return fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
  })
  if (!r.ok) return { ok: false, error: `Drive API ${r.status}` }
  const data = await r.json()
  return {
    ok: true,
    files: (data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      owner: f.owners?.[0]?.displayName || '',
    })),
  }
}

async function doRead(integration, fileId) {
  const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`)
  metaUrl.searchParams.set('supportsAllDrives', 'true')
  metaUrl.searchParams.set('fields', 'id,name,mimeType,modifiedTime,webViewLink,owners(displayName)')
  const { response: mr } = await callGoogleApiWithRetry(integration, async (token) => {
    return fetch(metaUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
  })
  if (!mr.ok) return { ok: false, error: `メタ取得失敗: ${mr.status}` }
  const meta = await mr.json()

  const exportMap = {
    'application/vnd.google-apps.document':     'text/plain',
    'application/vnd.google-apps.spreadsheet':  'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
  }
  const exportMime = exportMap[meta.mimeType]
  if (!exportMime) {
    return {
      ok: true,
      file: { id: meta.id, name: meta.name, mimeType: meta.mimeType, webViewLink: meta.webViewLink },
      text: null,
      note: 'この形式は本文取得に対応していません (Google Docs/Sheets/Slides のみ)',
    }
  }

  const exportUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`)
  exportUrl.searchParams.set('mimeType', exportMime)
  exportUrl.searchParams.set('supportsAllDrives', 'true')
  const { response: er } = await callGoogleApiWithRetry(integration, async (token) => {
    return fetch(exportUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
  })
  if (!er.ok) return { ok: false, error: `本文取得失敗: ${er.status}` }
  let text = await er.text()
  const fullLen = text.length
  const truncated = fullLen > MAX_READ_CHARS
  if (truncated) text = text.slice(0, MAX_READ_CHARS) + `\n... (全${fullLen}文字中 ${MAX_READ_CHARS}文字で切り詰め)`

  return {
    ok: true,
    file: { id: meta.id, name: meta.name, mimeType: meta.mimeType, webViewLink: meta.webViewLink, owner: meta.owners?.[0]?.displayName || '' },
    text, truncated, fullLen,
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, message, history = [] } = body || {}
  if (!owner || !message) return json({ error: 'owner / message が必要です' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY が未設定です' }, { status: 500 })

  const driveId = getDriveId()
  if (!driveId) return json({ error: 'NEO_FUKUOKA_DRIVE_ID が未設定です' }, { status: 500 })

  const res = await getIntegration(owner, 'google')
  if (res.error || !res.integration) return json({ error: res.error || '未連携' }, { status: 400 })
  if (res.expired) return json({ error: 'トークン期限切れ', needsReauth: true }, { status: 401 })
  const integration = res.integration

  const systemPrompt = `あなたはネオ福岡の共有ドライブを検索・参照する AI アシスタントです。ユーザーの質問に答えるため、必要に応じて search_files と read_file ツールを使ってください。

## 行動ルール
1. 「○○ どこだっけ?」「○○の資料」のような質問には、まず search_files で候補を探す
2. 候補が出たら、特に関連が強そうなものを数件 (1-3件) 絞って最終回答に含める
3. 「要約して」「内容を教えて」と言われたら read_file で本文を読んで要約する
4. 本文が truncated の場合は「本文が長いため一部のみ確認しました」と断る
5. 該当ファイルが見つからない場合は、代替キーワードでの再検索を提案する
6. ファイル情報を提示する時は必ず webViewLink (Drive URL) を含める
7. 最終回答は日本語で簡潔に、マークダウンなし (プレーンテキスト)

ツールは最大 ${MAX_STEPS} ステップまで連続実行できます。`

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  const actions = []
  const suggestedFiles = new Map()  // id → file (重複排除)
  let finalText = ''

  async function callAnthropicWithRetry(requestBody, maxRetries = 4) {
    let lastStatus = 0, lastRaw = ''
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
      if (r.ok) return { ok: true, data: await r.json() }
      lastStatus = r.status
      lastRaw = await r.text()
      if ([429, 500, 502, 503, 504, 529].includes(r.status) && attempt < maxRetries - 1) {
        const delayMs = Math.min(8000, 1000 * Math.pow(2, attempt))
        await new Promise(res => setTimeout(res, delayMs))
        continue
      }
      break
    }
    return { ok: false, status: lastStatus, raw: lastRaw }
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await callAnthropicWithRetry({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })
    if (!r.ok) {
      const friendly = r.status === 529
        ? 'Anthropic API が一時的に過負荷状態です (529)。数分後に再試行してください。'
        : `Anthropic API ${r.status}: ${r.raw.slice(0, 300)}`
      return json({ error: friendly, actions }, { status: 503 })
    }
    const data = r.data
    messages.push({ role: 'assistant', content: data.content })

    const toolUses = (data.content || []).filter(b => b.type === 'tool_use')
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()

    if (data.stop_reason === 'end_turn' || toolUses.length === 0) {
      finalText = textBlocks
      break
    }

    const toolResults = []
    for (const tu of toolUses) {
      let result
      if (tu.name === 'search_files') {
        result = await doSearch(integration, driveId, tu.input.query || '', tu.input.mime)
        // 候補ファイルを集積
        if (result.ok) for (const f of (result.files || [])) {
          if (!suggestedFiles.has(f.id)) suggestedFiles.set(f.id, f)
        }
      } else if (tu.name === 'read_file') {
        result = await doRead(integration, tu.input.file_id)
        if (result.ok && result.file) {
          if (!suggestedFiles.has(result.file.id)) {
            suggestedFiles.set(result.file.id, result.file)
          }
        }
      } else {
        result = { ok: false, error: `unknown tool: ${tu.name}` }
      }
      actions.push({ tool: tu.name, input: tu.input, result })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result).slice(0, 16000),
        is_error: !result.ok,
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return json({
    text: finalText || '(応答なし)',
    actions,
    suggested_files: Array.from(suggestedFiles.values()),
  })
}
