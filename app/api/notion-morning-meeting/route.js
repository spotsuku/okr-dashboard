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
    return page.created_time.split('T')[0]
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
        todos.push({
          text,
          checked: block.to_do?.checked || false,
          fromActionSection: inActionItems,
        })
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

export async function GET() {
  try {
    const apiKey = process.env.NOTION_API_KEY
    const dbId = process.env.NOTION_MORNING_MEETING_DB_ID
    if (!apiKey) return Response.json({ error: 'NOTION_API_KEY is not configured' }, { status: 500 })
    if (!dbId)   return Response.json({ error: 'NOTION_MORNING_MEETING_DB_ID is not configured' }, { status: 500 })

    const notion = new Client({ auth: apiKey })

    // v5 SDK ではデータベースを「data source」経由でクエリする
    // 1) まずDBを取得して data_sources 配列を得る
    const db = await notion.databases.retrieve({ database_id: dbId })
    const dataSourceId = db?.data_sources?.[0]?.id
    if (!dataSourceId) {
      return Response.json({ error: 'DBから data_source を取得できませんでした' }, { status: 500 })
    }

    // 2) data source をクエリして最新の朝会ページを取得
    const dbQuery = await notion.dataSources.query({
      data_source_id: dataSourceId,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 1,
    })
    if (!dbQuery.results?.length) {
      return Response.json({ error: '朝会DBにページが見つかりません' }, { status: 404 })
    }
    const page = dbQuery.results[0]
    const pageTitle = getPageTitle(page)
    const meetingDate = getPageDate(page)
    const pageUrl = page.url

    // ブロックからto_doを抽出
    const blocks = await getAllBlocks(notion, page.id)
    const allTodos = extractTodosFromBlocks(blocks)

    // 「アクションアイテム」セクションを優先、なければすべてのto_do
    const fromSection = allTodos.filter(t => t.fromActionSection)
    const actionItems = (fromSection.length > 0 ? fromSection : allTodos)
      .filter(t => !t.checked) // 未完了のみ
      .map(({ text }) => ({ text }))

    return Response.json({ pageTitle, meetingDate, pageUrl, actionItems })
  } catch (err) {
    console.error('notion-morning-meeting error:', err)
    if (err.code === 'object_not_found') {
      return Response.json({
        error: 'Notion DB が見つかりません。NOTION_MORNING_MEETING_DB_ID を確認し、Integration が DB に接続されているか確認してください。',
      }, { status: 404 })
    }
    if (err.code === 'unauthorized') {
      return Response.json({
        error: 'Notion API の認証に失敗しました。NOTION_API_KEY を確認してください。',
      }, { status: 401 })
    }
    return Response.json({ error: err.message || 'Notion APIエラー' }, { status: 500 })
  }
}
