import { Client } from '@notionhq/client'

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

function initNotion() {
  const apiKey = process.env.NOTION_API_KEY
  const dbId = process.env.NOTION_MORNING_MEETING_DB_ID
  if (!apiKey) throw { status: 500, message: 'NOTION_API_KEY is not configured' }
  if (!dbId) throw { status: 500, message: 'NOTION_MORNING_MEETING_DB_ID is not configured' }
  return { notion: new Client({ auth: apiKey }), dbId }
}

async function getDataSourceId(notion, dbId) {
  const db = await notion.databases.retrieve({ database_id: dbId })
  const dsId = db?.data_sources?.[0]?.id
  if (!dsId) throw { status: 500, message: 'DBから data_source を取得できませんでした' }
  return { dataSourceId: dsId, db }
}

// GET: ページ一覧を返す（?pageId=xxx の場合はそのページのアクションアイテムを返す）
export async function GET(req) {
  try {
    const { notion, dbId } = initNotion()
    const { searchParams } = new URL(req.url)
    const pageId = searchParams.get('pageId')

    const { dataSourceId } = await getDataSourceId(notion, dbId)

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

      return Response.json({ pageTitle, meetingDate, pageUrl, actionItems })
    }

    // ─── ページ一覧を返す（最新20件） ───
    // Date プロパティでソートを試みる（見つからなければ created_time）
    let sorts = [{ timestamp: 'created_time', direction: 'descending' }]

    // DB の最初のページから Date プロパティ名を探す
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

    return Response.json({ pages })
  } catch (err) {
    console.error('notion-morning-meeting error:', err)
    if (err.status && err.message) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    if (err.code === 'object_not_found') {
      return Response.json({ error: 'Notion DB が見つかりません。Integration が DB に接続されているか確認してください。' }, { status: 404 })
    }
    if (err.code === 'unauthorized') {
      return Response.json({ error: 'Notion API の認証に失敗しました。' }, { status: 401 })
    }
    return Response.json({ error: err.message || 'Notion APIエラー' }, { status: 500 })
  }
}
