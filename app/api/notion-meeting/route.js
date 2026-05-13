import { Client } from '@notionhq/client'
import { createClient } from '@supabase/supabase-js'
import { getMeeting } from '../../../lib/meetings'
import { resolveNotionConfig } from '../../../lib/notionForOrg'

// Notionは eventual consistency があるため毎回最新を取得 (Next.jsのキャッシュ無効化)
export const dynamic = 'force-dynamic'
export const revalidate = 0

function getAdmin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

function extractRichText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return ''
  return richTextArray.map(t => t.plain_text).join('')
}

function getPageTitle(page) {
  const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title')
  if (titleProp && titleProp.title && titleProp.title.length > 0) {
    return titleProp.title.map(t => t.plain_text).join('')
  }
  return ''
}

function getPageDate(page) {
  for (const prop of Object.values(page.properties || {})) {
    if (prop.type === 'date' && prop.date && prop.date.start) {
      return prop.date.start
    }
  }
  if (page.created_time) {
    const jst = new Date(new Date(page.created_time).getTime() + 9 * 3600 * 1000)
    return jst.toISOString().split('T')[0]
  }
  return null
}

function getDatePropertyName(page) {
  for (const [name, prop] of Object.entries(page.properties || {})) {
    if (prop.type === 'date') return name
  }
  return null
}

function extractTodosFromBlocks(blocks) {
  const todos = []
  let inActionItems = false
  for (const block of blocks) {
    if (block.type === 'heading_2' || block.type === 'heading_3') {
      const text = extractRichText(block[block.type]?.rich_text)
      inActionItems = text.includes('アクションアイテム') || text.includes('Action Item') || text.includes('ネクストアクション') || text.includes('TODO') || text.includes('タスク')
      continue
    }
    if (block.type === 'to_do') {
      const text = extractRichText(block.to_do?.rich_text).trim()
      if (text) {
        todos.push({ text, checked: block.to_do?.checked || false, fromActionSection: inActionItems })
      }
    }
    if (block.children && block.children.length > 0) {
      todos.push(...extractTodosFromBlocks(block.children))
    }
  }
  return todos
}

async function getAllBlocks(notion, blockId, depth = 0) {
  if (depth > 5) return []
  const blocks = []
  let cursor = undefined
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId, start_cursor: cursor, page_size: 100,
    })
    blocks.push(...response.results)
    cursor = response.has_more ? response.next_cursor : undefined
  } while (cursor)
  for (const block of blocks) {
    if (block.has_children) {
      block.children = await getAllBlocks(notion, block.id, depth + 1)
    }
  }
  return blocks
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const meetingKey = searchParams.get('meetingKey') || 'morning'
    const pageId = searchParams.get('pageId')
    const orgId = searchParams.get('organization_id') || null

    const meeting = getMeeting(meetingKey)
    if (!meeting) return Response.json({ error: `Unknown meetingKey: ${meetingKey}` }, { status: 400 })

    // 組織別の Notion 設定を解決 (org の notion_api_key/notion_db_ids 優先、無ければ env var fallback)
    const { apiKey, dbId } = await resolveNotionConfig(orgId, meetingKey, getAdmin())
    if (!apiKey) return Response.json({ error: 'Notion API キーが設定されていません (組織設定 or 環境変数を確認してください)' }, { status: 500 })
    if (!dbId) return Response.json({ error: `${meeting.title} の Notion DB が設定されていません (組織設定で連携 DB を指定してください)` }, { status: 500 })

    const notion = new Client({ auth: apiKey })

    // v5 SDK: databases.retrieve → dataSources.query
    const db = await notion.databases.retrieve({ database_id: dbId })
    const dataSourceId = db?.data_sources?.[0]?.id
    if (!dataSourceId) {
      return Response.json({ error: 'DBから data_source を取得できませんでした' }, { status: 500 })
    }

    // ─── 特定ページのアクションアイテムを取得 ───
    if (pageId) {
      const page = await notion.pages.retrieve({ page_id: pageId })
      const pageTitle = getPageTitle(page)
      const meetingDate = getPageDate(page)
      const pageUrl = page.url

      const blocks = await getAllBlocks(notion, pageId)
      const allTodos = extractTodosFromBlocks(blocks)
      const fromSection = allTodos.filter(t => t.fromActionSection)
      const actionItems = (fromSection.length > 0 ? fromSection : allTodos)
        .filter(t => !t.checked)
        .map(({ text }) => ({ text }))

      return Response.json(
        { pageTitle, meetingDate, pageUrl, actionItems },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    // ─── ページ一覧（最新20件） ───
    // Date プロパティでソート、なければ created_time
    let sorts = [{ timestamp: 'created_time', direction: 'descending' }]
    const probe = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 1,
    })
    if (probe.results?.length) {
      const datePropName = getDatePropertyName(probe.results[0])
      if (datePropName) {
        sorts = [{ property: datePropName, direction: 'descending' }]
      }
    }

    const dbQuery = await notion.dataSources.query({
      data_source_id: dataSourceId,
      sorts,
      page_size: 20,
    })

    const pages = (dbQuery.results || []).map(page => ({
      id: page.id,
      title: getPageTitle(page),
      date: getPageDate(page),
      url: page.url,
    }))

    return Response.json(
      { pages },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (err) {
    console.error('notion-meeting error:', err)
    if (err.code === 'object_not_found') {
      return Response.json({ error: 'Notion DB が見つかりません。Integration が DB に接続されているか確認してください。' }, { status: 404 })
    }
    if (err.code === 'unauthorized') {
      return Response.json({ error: 'Notion API の認証に失敗しました。' }, { status: 401 })
    }
    return Response.json({ error: err.message || 'Notion APIエラー' }, { status: 500 })
  }
}
