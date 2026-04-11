import { Client } from '@notionhq/client'

function extractPageId(url) {
  // Notion URLs:
  //   https://www.notion.so/workspace/Page-Title-abc123def456...
  //   https://www.notion.so/abc123def456...
  //   https://www.notion.so/workspace/abc123def456...?v=...
  const cleaned = url.split('?')[0].split('#')[0]
  const match = cleaned.match(/([a-f0-9]{32})$/)
  if (match) return match[1]
  // Try with dashes (UUID format)
  const uuidMatch = cleaned.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/)
  if (uuidMatch) return uuidMatch[1].replace(/-/g, '')
  return null
}

function getPageTitle(page) {
  const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title')
  if (titleProp && titleProp.title && titleProp.title.length > 0) {
    return titleProp.title.map(t => t.plain_text).join('')
  }
  return ''
}

function getPageDate(page) {
  // Try to extract date from page properties (e.g. Date property)
  for (const prop of Object.values(page.properties || {})) {
    if (prop.type === 'date' && prop.date && prop.date.start) {
      return prop.date.start
    }
  }
  // Fallback: use created_time
  if (page.created_time) {
    return page.created_time.split('T')[0]
  }
  return null
}

function extractRichText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return ''
  return richTextArray.map(t => t.plain_text).join('')
}

function extractTodosFromBlocks(blocks) {
  const todos = []
  let inActionItems = false

  for (const block of blocks) {
    // Check for heading that signals action items section
    if (block.type === 'heading_2' || block.type === 'heading_3') {
      const text = extractRichText(block[block.type]?.rich_text)
      inActionItems = text.includes('アクションアイテム') || text.includes('Action Item')
      continue
    }

    // Collect to_do blocks
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

    // Recurse into children
    if (block.children && block.children.length > 0) {
      todos.push(...extractTodosFromBlocks(block.children))
    }
  }

  return todos
}

async function getAllBlocks(notion, blockId, depth = 0) {
  if (depth > 5) return [] // prevent excessive recursion
  const blocks = []
  let cursor = undefined

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })
    blocks.push(...response.results)
    cursor = response.has_more ? response.next_cursor : undefined
  } while (cursor)

  // Recursively fetch children
  for (const block of blocks) {
    if (block.has_children) {
      block.children = await getAllBlocks(notion, block.id, depth + 1)
    }
  }

  return blocks
}

export async function POST(request) {
  try {
    const { notionUrl } = await request.json()

    if (!notionUrl) {
      return Response.json({ error: 'notionUrl is required' }, { status: 400 })
    }

    const apiKey = process.env.NOTION_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'NOTION_API_KEY is not configured' }, { status: 500 })
    }

    const pageId = extractPageId(notionUrl)
    if (!pageId) {
      return Response.json({ error: 'Invalid Notion URL. Could not extract page ID.' }, { status: 400 })
    }

    const notion = new Client({ auth: apiKey })

    // Fetch page metadata and blocks in parallel
    const [page, blocks] = await Promise.all([
      notion.pages.retrieve({ page_id: pageId }),
      getAllBlocks(notion, pageId),
    ])

    const pageTitle = getPageTitle(page)
    const meetingDate = getPageDate(page)

    // Extract to_do blocks
    const allTodos = extractTodosFromBlocks(blocks)

    // Prefer items from the "アクションアイテム" section
    const actionSectionTodos = allTodos.filter(t => t.fromActionSection)
    const actionItems = (actionSectionTodos.length > 0 ? actionSectionTodos : allTodos)
      .map(({ text, checked }) => ({ text, checked }))

    return Response.json({
      pageTitle,
      meetingDate,
      actionItems,
    })
  } catch (err) {
    console.error('Notion import error:', err)

    if (err.code === 'object_not_found') {
      return Response.json({
        error: 'ページが見つかりません。URLを確認するか、Notionインテグレーションがページに共有されているか確認してください。',
      }, { status: 404 })
    }
    if (err.code === 'unauthorized') {
      return Response.json({
        error: 'Notion APIの認証に失敗しました。NOTION_API_KEYを確認してください。',
      }, { status: 401 })
    }

    return Response.json({
      error: err.message || 'Notion APIエラーが発生しました',
    }, { status: 500 })
  }
}
