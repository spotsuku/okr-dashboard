// ぺろっぺ (MyCOO) AI チャット
// POST /api/integrations/coo/ai
// Body: {
//   owner,             // 対話相手 (ログインユーザー)
//   message,
//   history: [{role, content}],
//   mode: 'coach' | 'speed'  // デフォ: 'coach'
// }
// Response: { text, actions, context_used }

export const dynamic = 'force-dynamic'

import { getAdminClient, getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

const MODEL = 'claude-sonnet-4-5'
const MAX_STEPS = 6
const DRIVE_CACHE_HOURS = 1   // この時間以内なら cached_text を再利用
const KNOWLEDGE_CHAR_BUDGET = 8000  // 全知識を合計でこの上限まで圧縮

const TOOLS = [
  {
    name: 'get_member_workload',
    description: '指定メンバーの今の作業負荷 (未完了タスク数 / 期限超過数 / 直近活動)。「○○さん忙しい?」等に使う。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'メンバーの日本語氏名' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_member_okr',
    description: '指定メンバーの今期 OKR と KR ごとの今週レビュー状況を取得する。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_recent_kpts',
    description: '指定メンバーの直近の KPT (振り返り) を取得する。最大4週間分。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        weeks: { type: 'number', description: '何週間分か (デフォ: 2)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_team_status',
    description: '全社サマリ (本日の達成率、各メンバーの稼働状況、停滞タスク総数)',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_drive',
    description: 'ネオ福岡共有ドライブ内のファイルを検索する。資料の場所を探す時に使う。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
]

// ─── 知識ベース読み込み (text + drive_file キャッシュ) ───────────────────────
async function loadKnowledge(supabase) {
  const { data } = await supabase
    .from('coo_knowledge')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: false })
    .order('id', { ascending: true })
  const items = data || []

  // 文字数バジェット内に収める
  const blocks = []
  let remaining = KNOWLEDGE_CHAR_BUDGET
  for (const e of items) {
    let body = ''
    if (e.kind === 'text') {
      body = e.content || ''
    } else if (e.kind === 'drive_file') {
      // キャッシュが新しければ使う、古いまたはエラーなら note のみ
      if (e.drive_cached_text) {
        body = `(Drive: ${e.title})\n${e.drive_cached_text}`
      } else if (e.drive_cache_error) {
        body = `(Drive取得エラー: ${e.drive_cache_error})`
      } else {
        body = `(Drive ファイル: ${e.drive_file_id} 未取得)`
      }
    }
    if (!body) continue
    const block = `### ${e.title}\n${body}`
    if (block.length > remaining) {
      blocks.push(block.slice(0, remaining) + '\n...(切り詰め)')
      break
    }
    blocks.push(block)
    remaining -= block.length
  }
  return blocks.join('\n\n')
}

// ─── ユーザーの「いま」のコンテキスト取得 ───────────────────────────────
async function loadUserContext(supabase, owner) {
  const today = new Date().toISOString().slice(0, 10)
  const monday = (() => {
    const j = new Date(Date.now() + 9 * 3600 * 1000)
    const day = j.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const m = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + diff))
    return m.toISOString().slice(0, 10)
  })()

  // 並行取得
  const [memberRes, krsRes, krReviewsRes, tasksRes, kptsRes, workLogRes] = await Promise.all([
    supabase.from('members').select('name, role, is_admin').eq('name', owner).limit(1),
    supabase.from('key_results').select('id, title, owner').eq('owner', owner),
    supabase.from('kr_weekly_reviews').select('*').eq('week_start', monday),
    supabase.from('ka_tasks').select('id, title, due_date, done, status').eq('assignee', owner).neq('status', 'done').order('due_date'),
    supabase.from('coaching_logs').select('content, created_at').eq('owner', owner).eq('log_type', 'kpt').order('created_at', { ascending: false }).limit(3),
    supabase.from('coaching_logs').select('content').eq('owner', owner).eq('log_type', 'work_log').gte('created_at', new Date(Date.now() - 18 * 3600 * 1000).toISOString()).order('created_at', { ascending: false }).limit(1),
  ])

  const member = memberRes.data?.[0]
  const krs = krsRes.data || []
  const krReviewsMap = Object.fromEntries((krReviewsRes.data || []).map(r => [r.kr_id, r]))
  const tasks = (tasksRes.data || [])
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today)
  const todayTasks = tasks.filter(t => t.due_date === today)

  const kpts = (kptsRes.data || []).map(r => {
    let c
    try { c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content } catch { c = {} }
    return { date: r.created_at?.slice(0, 10), keep: c.keep, problem: c.problem, try: c.try }
  })

  let workLogStatus = '未始業'
  if (workLogRes.data?.[0]) {
    let c
    try { c = typeof workLogRes.data[0].content === 'string' ? JSON.parse(workLogRes.data[0].content) : workLogRes.data[0].content } catch { c = {} }
    if (c.end_at) workLogStatus = `本日終業済み (${c.start_at?.slice(11, 16)} 〜 ${c.end_at?.slice(11, 16)})`
    else if (c.start_at) workLogStatus = `稼働中 (${c.start_at?.slice(11, 16)} 〜)`
  }

  // テキスト化
  const lines = []
  lines.push(`### ${owner} さんのプロフィール`)
  lines.push(`- 役職: ${member?.role || '(未登録)'}`)
  lines.push(`- 本日のステータス: ${workLogStatus}`)

  if (krs.length > 0) {
    lines.push(`\n### ${owner} さんの今期 OKR / KR と今週レビュー`)
    for (const kr of krs) {
      const r = krReviewsMap[kr.id]
      const filled = r ? !!((r.good||'').trim() || (r.more||'').trim() || (r.focus||'').trim() || (r.focus_output||'').trim()) : false
      lines.push(`- ${kr.title}${filled ? ' (今週レビュー記入済)' : ' (⚠ 今週レビュー未記入)'}`)
    }
  } else {
    lines.push(`\n### OKR\n(未登録)`)
  }

  lines.push(`\n### ${owner} さんのタスク`)
  lines.push(`- 未完了 ${tasks.length}件 (うち期限超過 ${overdueTasks.length}件 / 本日期限 ${todayTasks.length}件)`)
  if (overdueTasks.length > 0) {
    lines.push(`- 停滞中:`)
    for (const t of overdueTasks.slice(0, 5)) lines.push(`  - ${t.title} (期限 ${t.due_date})`)
  }

  if (kpts.length > 0) {
    lines.push(`\n### 直近の KPT`)
    for (const k of kpts) {
      const parts = []
      if (k.keep) parts.push(`Keep:${k.keep.slice(0,80)}`)
      if (k.problem) parts.push(`Problem:${k.problem.slice(0,80)}`)
      if (k.try) parts.push(`Try:${k.try.slice(0,80)}`)
      if (parts.length > 0) lines.push(`- ${k.date}: ${parts.join(' / ')}`)
    }
  }

  return { text: lines.join('\n'), member }
}

// ─── ツール実行 ───────────────────────────────────────────────────
async function execTool(supabase, owner, name, input) {
  try {
    if (name === 'get_member_workload') {
      const target = input.name
      const { data } = await supabase.from('ka_tasks')
        .select('id, title, due_date, done, status')
        .eq('assignee', target).neq('status', 'done')
        .order('due_date')
      const tasks = data || []
      const today = new Date().toISOString().slice(0, 10)
      const overdue = tasks.filter(t => t.due_date && t.due_date < today)
      // 直近の workLog
      const { data: wl } = await supabase.from('coaching_logs')
        .select('content, created_at')
        .eq('owner', target).eq('log_type', 'work_log')
        .order('created_at', { ascending: false }).limit(1)
      let workStatus = '未始業'
      if (wl?.[0]) {
        let c
        try { c = typeof wl[0].content === 'string' ? JSON.parse(wl[0].content) : wl[0].content } catch { c = {} }
        if (c.end_at) workStatus = `終業済み (${wl[0].created_at?.slice(0,10)})`
        else if (c.start_at) workStatus = `稼働中 (始業 ${c.start_at?.slice(11,16)})`
      }
      return {
        ok: true, member: target,
        active_tasks: tasks.length,
        overdue_tasks: overdue.length,
        recent_work_status: workStatus,
        sample_overdue_titles: overdue.slice(0, 5).map(t => t.title),
      }
    }
    if (name === 'get_member_okr') {
      const target = input.name
      const monday = (() => {
        const j = new Date(Date.now() + 9 * 3600 * 1000)
        const day = j.getUTCDay()
        const diff = day === 0 ? -6 : 1 - day
        const m = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + diff))
        return m.toISOString().slice(0, 10)
      })()
      const { data: krs } = await supabase.from('key_results')
        .select('id, title, owner').eq('owner', target)
      const { data: reviews } = await supabase.from('kr_weekly_reviews')
        .select('*').eq('week_start', monday)
      const reviewsMap = Object.fromEntries((reviews || []).map(r => [r.kr_id, r]))
      return {
        ok: true, member: target,
        krs: (krs || []).map(kr => {
          const r = reviewsMap[kr.id]
          return {
            title: kr.title,
            this_week_review: r ? {
              good: r.good || '', more: r.more || '',
              focus: r.focus || '', focus_output: r.focus_output || '',
            } : null,
          }
        }),
      }
    }
    if (name === 'get_recent_kpts') {
      const target = input.name
      const weeks = input.weeks || 2
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString()
      const { data } = await supabase.from('coaching_logs')
        .select('content, created_at')
        .eq('owner', target).eq('log_type', 'kpt')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20)
      const items = (data || []).map(r => {
        let c
        try { c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content } catch { c = {} }
        return { date: r.created_at?.slice(0, 10), keep: c.keep, problem: c.problem, try: c.try }
      })
      return { ok: true, member: target, items }
    }
    if (name === 'get_team_status') {
      const today = new Date().toISOString().slice(0, 10)
      const { data: tasks } = await supabase.from('ka_tasks')
        .select('id, assignee, due_date, done, status')
        .eq('due_date', today)
      const arr = tasks || []
      const done = arr.filter(t => t.done || t.status === 'done').length
      const byMember = {}
      for (const t of arr) {
        if (!t.assignee) continue
        if (!byMember[t.assignee]) byMember[t.assignee] = { done: 0, total: 0 }
        byMember[t.assignee].total++
        if (t.done || t.status === 'done') byMember[t.assignee].done++
      }
      return {
        ok: true, today,
        total_tasks: arr.length, done_tasks: done,
        completion_pct: arr.length > 0 ? Math.round((done / arr.length) * 100) : 0,
        by_member: byMember,
      }
    }
    if (name === 'search_drive') {
      const driveId = process.env.NEO_FUKUOKA_DRIVE_ID
      if (!driveId) return { ok: false, error: 'NEO_FUKUOKA_DRIVE_ID 未設定' }
      const igRes = await getIntegration(owner, 'google')
      if (igRes.error || !igRes.integration) return { ok: false, error: igRes.error || 'Google 未連携' }
      if (igRes.expired) return { ok: false, error: 'Google トークン期限切れ' }
      const integration = igRes.integration
      const escaped = (input.query || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const q = `(name contains '${escaped}' or fullText contains '${escaped}') and trashed = false`
      const url = new URL('https://www.googleapis.com/drive/v3/files')
      url.searchParams.set('q', q)
      url.searchParams.set('corpora', 'drive')
      url.searchParams.set('driveId', driveId)
      url.searchParams.set('includeItemsFromAllDrives', 'true')
      url.searchParams.set('supportsAllDrives', 'true')
      url.searchParams.set('orderBy', 'modifiedTime desc')
      url.searchParams.set('pageSize', '8')
      url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))')
      const { response: r } = await callGoogleApiWithRetry(integration, async (token) => {
        return fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      })
      if (!r.ok) return { ok: false, error: `Drive API ${r.status}` }
      const data = await r.json()
      return {
        ok: true, files: (data.files || []).map(f => ({
          id: f.id, name: f.name, mimeType: f.mimeType,
          modifiedTime: f.modifiedTime, webViewLink: f.webViewLink,
          owner: f.owners?.[0]?.displayName || '',
        })),
      }
    }
    return { ok: false, error: `unknown tool: ${name}` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function POST(request) {
  try { return await handle(request) } catch (e) {
    return json({ error: `coo/ai 内部エラー: ${e?.message || e}` }, { status: 500 })
  }
}

async function handle(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, message, history = [], mode = 'coach' } = body || {}
  if (!owner || !message) return json({ error: 'owner / message が必要です' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY が未設定です' }, { status: 500 })

  const supabase = getAdminClient()

  // 知識ベース + ユーザーコンテキストを並行取得
  const [knowledgeText, userCtx] = await Promise.all([
    loadKnowledge(supabase),
    loadUserContext(supabase, owner),
  ])

  // 全メンバーの簡易リスト (AI が他人を呼び出す時の参照)
  const { data: allMembers } = await supabase.from('members')
    .select('name, role').order('sort_order', { ascending: true })
  const memberList = (allMembers || []).map(m => `- ${m.name}${m.role ? ` (${m.role})` : ''}`).join('\n')

  const isSelfChat = owner === '三木智弘'  // 三木CEO本人かどうか

  const today = new Date().toISOString()

  const coachInstruction = mode === 'speed'
    ? `今は ⚡ スピードモード です。問いを返さず、直接的な助言や情報を簡潔に提供してください。それでも一般論ではなく必ず NEO 文脈に接続してください。`
    : `今は 🎯 コーチモード です。即答せず、まず 2〜3 個の問いで状況を深掘りしてください (GROW モデル: Goal/Reality/Options/Will)。本人が「今すぐ答え欲しい」「時間ない」と言えばスピードモードに切替えて短く答えてください。`

  const systemPrompt = `あなたは「ぺろっぺ」🐸 — NEO福岡の代表・三木智弘 CEO の右腕として振る舞う AI コーチです。

## 自己認識
- 三木 CEO の経営哲学・思考パターンを学習し、その代行者としてメンバーをコーチングします
- 今話しているのは ${owner} さん${isSelfChat ? '（三木CEO本人）' : ''}
- ${isSelfChat
    ? '本人との対話なので、外在化された自問自答のパートナーとして率直に振る舞ってください'
    : '三木 CEO の思考を代行する立場で接してください。「三木CEOならこう考える」という視点を大切に'}

## 行動原則
1. 即答せず深掘り (コーチモード時)
2. 一般論を禁止 — 必ずNEOの文脈 (具体的なOKR/メンバー名/案件) に接続する
3. 答えを"与える"より、本人の中にある答えを"引き出す"問いを優先
4. 必要なら tool use で正確なデータを取得してから回答する (推測しない)
5. 簡潔に、フラットな口調で。ですます調。絵文字は最小限
6. 「あなた」と呼ばずに「${owner}さん」と呼ぶ
7. ${coachInstruction}

## 現在の状況
- 日時: ${today}
- 対話相手: ${owner} さん

## NEO福岡について (組織知)
${knowledgeText || '(まだ組織知が登録されていません)'}

## ${owner} さんの「いま」
${userCtx.text}

## メンバー一覧 (tool 呼び出し用)
${memberList}

ツールは最大 ${MAX_STEPS} ステップ連続実行できます。`

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  const actions = []
  let finalText = ''

  async function callAnthropic(reqBody, maxRetries = 4) {
    let lastStatus = 0, lastRaw = ''
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      })
      if (r.ok) return { ok: true, data: await r.json() }
      lastStatus = r.status; lastRaw = await r.text()
      if ([429, 500, 502, 503, 504, 529].includes(r.status) && attempt < maxRetries - 1) {
        await new Promise(res => setTimeout(res, Math.min(8000, 1000 * Math.pow(2, attempt))))
        continue
      }
      break
    }
    return { ok: false, status: lastStatus, raw: lastRaw }
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await callAnthropic({
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
      const result = await execTool(supabase, owner, tu.name, tu.input)
      actions.push({ tool: tu.name, input: tu.input, result })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result).slice(0, 8000),
        is_error: !result.ok,
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return json({
    text: finalText || '(応答なし)',
    actions,
    mode,
    knowledge_chars: knowledgeText.length,
  })
}
