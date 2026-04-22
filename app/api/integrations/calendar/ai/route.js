// カレンダー操作の AI アシスタント (Claude tool use)
// POST /api/integrations/calendar/ai
// Body: {
//   owner,                    // ログイン中のユーザー名 (操作実行者)
//   message,                  // ユーザー指示 (自然言語)
//   context: {
//     members: [{name, email}],  // 招待候補
//     today_iso,
//     timezone,
//   },
//   history: [{role, content}]  // 過去のターン (任意)
// }
// Response: {
//   text,                     // AI の最終返答
//   actions: [{tool, input, result}]   // 実行されたツール履歴
// }
//
// Tools:
//   list_events(members[], start_iso, end_iso)  - 複数メンバーの予定一覧
//   find_free_slots(members[], start_iso, end_iso, duration_min) - 空き時間検索
//   create_event(summary, start_iso, end_iso, attendee_names[], description?, add_meet?) - 予定作成+招待
//   update_event(event_id, updates)
//   delete_event(event_id)

export const dynamic = 'force-dynamic'

import { getIntegration, callGoogleApiWithRetry, json } from '../../_shared'

const MODEL = 'claude-sonnet-4-5'
const MAX_STEPS = 6

const TOOLS = [
  {
    name: 'list_events',
    description: '指定メンバーの指定期間のカレンダー予定を取得する。まず自分や関係者の空き状況を確認するのに使う。',
    input_schema: {
      type: 'object',
      properties: {
        members: { type: 'array', items: { type: 'string' }, description: 'メンバー名の配列 (日本語氏名)' },
        start_iso: { type: 'string', description: '開始日時 ISO 8601 (JST, 例: 2026-04-22T09:00:00+09:00)' },
        end_iso:   { type: 'string', description: '終了日時 ISO 8601' },
      },
      required: ['members', 'start_iso', 'end_iso'],
    },
  },
  {
    name: 'find_free_slots',
    description: '指定メンバー全員が空いている時間枠を検索する。日程調整で使う。営業時間は 9:00-22:00 JST デフォルト。',
    input_schema: {
      type: 'object',
      properties: {
        members: { type: 'array', items: { type: 'string' } },
        start_iso: { type: 'string' },
        end_iso:   { type: 'string' },
        duration_min: { type: 'number', description: '必要な連続空き時間 (分)' },
        working_hours: { type: 'object', properties: { from: { type: 'number' }, to: { type: 'number' } }, description: '営業時間帯 (例: from:9, to:22) JST。省略時 9-22。' },
      },
      required: ['members', 'start_iso', 'end_iso', 'duration_min'],
    },
  },
  {
    name: 'create_event',
    description: '自分のカレンダーに予定を作成し、指定メンバーを招待する。Google Meet リンクも任意で付与。繰り返し予定も RRULE 配列で指定可能。',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        start_iso: { type: 'string' },
        end_iso:   { type: 'string' },
        attendee_names: { type: 'array', items: { type: 'string' }, description: '招待するメンバー名' },
        description: { type: 'string' },
        add_meet: { type: 'boolean', description: 'Google Meet リンクを自動発行' },
        recurrence: { type: 'array', items: { type: 'string' }, description: "RRULE 配列。例: 毎週金曜 10回は ['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10']、毎月最終木曜は ['RRULE:FREQ=MONTHLY;BYDAY=-1TH']" },
      },
      required: ['summary', 'start_iso', 'end_iso'],
    },
  },
  {
    name: 'update_event',
    description: '既存の予定を更新する (時刻変更や招待追加)。event_id は list_events で取得。',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        summary: { type: 'string' },
        start_iso: { type: 'string' },
        end_iso: { type: 'string' },
        attendee_names: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
        recurrence: { type: 'array', items: { type: 'string' }, description: 'RRULE 配列で繰り返しルールを変更' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_event',
    description: '自分が作成した予定を削除する。',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
      },
      required: ['event_id'],
    },
  },
]

function resolveEmails(names, members) {
  return (names || []).map(n => {
    const m = (members || []).find(x => x.name === n)
    return m?.email || null
  }).filter(Boolean)
}

async function getEventsForMember(name, startIso, endIso) {
  const res = await getIntegration(name, 'google')
  if (res.error || !res.integration) return { name, events: [], error: res.error || '未連携' }
  if (res.expired) return { name, events: [], error: 'トークン期限切れ' }
  const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  apiUrl.searchParams.set('timeMin', startIso)
  apiUrl.searchParams.set('timeMax', endIso)
  apiUrl.searchParams.set('singleEvents', 'true')
  apiUrl.searchParams.set('orderBy', 'startTime')
  apiUrl.searchParams.set('maxResults', '100')
  const { response: r } = await callGoogleApiWithRetry(res.integration, async (token) => {
    return fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${token}` } })
  })
  if (!r.ok) return { name, events: [], error: `Calendar API ${r.status}` }
  const data = await r.json()
  return {
    name,
    events: (data.items || []).map(ev => ({
      id: ev.id,
      title: ev.summary || '(無題)',
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      allDay: !!ev.start?.date,
    })),
  }
}

// 空き時間を計算: 指定期間内で、全メンバーの予定が重ならない連続 duration_min 分以上の枠
function computeFreeSlots(memberEvents, startIso, endIso, durationMin, workingHours) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const durMs = durationMin * 60 * 1000

  // 全イベントをマージした busy 区間
  const busy = []
  for (const m of memberEvents) {
    for (const ev of m.events || []) {
      if (!ev.start || !ev.end || ev.allDay) continue
      const s = new Date(ev.start).getTime()
      const e = new Date(ev.end).getTime()
      if (isNaN(s) || isNaN(e)) continue
      busy.push([Math.max(s, start), Math.min(e, end)])
    }
  }
  busy.sort((a, b) => a[0] - b[0])
  // マージ
  const merged = []
  for (const [s, e] of busy) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e)
    } else {
      merged.push([s, e])
    }
  }
  // 空き区間 = 補集合
  const free = []
  let cursor = start
  for (const [s, e] of merged) {
    if (s > cursor) free.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < end) free.push([cursor, end])

  // 各空き区間を JST 営業時間で日割り & duration_min 以上を抽出
  const fromH = workingHours?.from ?? 9
  const toH = workingHours?.to ?? 22
  const slots = []
  for (const [s, e] of free) {
    // 日をまたぐ空きを営業時間ごとに細切れにする
    let t = new Date(s)
    while (t.getTime() < e) {
      const jst = new Date(t.getTime() + 9 * 3600 * 1000)
      const y = jst.getUTCFullYear(), mo = jst.getUTCMonth(), d = jst.getUTCDate()
      // その日の営業時間開始/終了 (UTC)
      const dayStart = Date.UTC(y, mo, d, fromH - 9, 0, 0)
      const dayEnd   = Date.UTC(y, mo, d, toH   - 9, 0, 0)
      const slotStart = Math.max(t.getTime(), dayStart)
      const slotEnd   = Math.min(e, dayEnd)
      if (slotEnd - slotStart >= durMs) {
        slots.push({
          start_iso: new Date(slotStart).toISOString(),
          end_iso:   new Date(slotEnd).toISOString(),
          duration_min: Math.floor((slotEnd - slotStart) / 60000),
        })
      }
      // 翌日の 0:00 JST (UTC +9h) へ進める
      t = new Date(Date.UTC(y, mo, d + 1, 0 - 9, 0, 0))
    }
  }
  return slots.slice(0, 20)  // 最大 20 枠
}

async function executeTool(name, input, ctx) {
  try {
    if (name === 'list_events') {
      const results = await Promise.all((input.members || []).map(n =>
        getEventsForMember(n, input.start_iso, input.end_iso)
      ))
      return { ok: true, results }
    }
    if (name === 'find_free_slots') {
      const memberEvents = await Promise.all((input.members || []).map(n =>
        getEventsForMember(n, input.start_iso, input.end_iso)
      ))
      const slots = computeFreeSlots(memberEvents, input.start_iso, input.end_iso, input.duration_min, input.working_hours)
      return { ok: true, slots, memberStatuses: memberEvents.map(m => ({ name: m.name, error: m.error, eventCount: m.events.length })) }
    }
    // mutate 系 (create/update/delete) は即実行せず「提案」を返す。
    // UI 側で確認ダイアログを出し、ユーザー承認後に直接 /api/integrations/calendar/event を叩く。
    // 招待メールが自動で飛ぶため誤発火防止を最優先。
    if (name === 'create_event') {
      const emails = resolveEmails(input.attendee_names, ctx.members)
      const unresolved = (input.attendee_names || []).filter(n =>
        !(ctx.members || []).find(x => x.name === n)
      )
      // 件名に [仮] プレフィックスを自動付与 (すでに付いていなければ)
      const summary = /^\s*\[仮\]/.test(input.summary || '') ? input.summary : `[仮] ${input.summary || ''}`.trim()
      return {
        ok: true,
        proposal: 'create',
        plan: {
          summary,
          description: input.description || '',
          start_iso: input.start_iso,
          end_iso: input.end_iso,
          attendee_names: input.attendee_names || [],
          attendee_emails: emails,
          unresolved_names: unresolved,
          add_meet: !!input.add_meet,
          recurrence: input.recurrence || [],
        },
      }
    }
    if (name === 'update_event') {
      const emails = input.attendee_names ? resolveEmails(input.attendee_names, ctx.members) : undefined
      return {
        ok: true,
        proposal: 'update',
        plan: {
          event_id: input.event_id,
          summary: input.summary,
          description: input.description,
          start_iso: input.start_iso,
          end_iso: input.end_iso,
          attendee_names: input.attendee_names,
          attendee_emails: emails,
          recurrence: input.recurrence,
        },
      }
    }
    if (name === 'delete_event') {
      return { ok: true, proposal: 'delete', plan: { event_id: input.event_id } }
    }
    return { ok: false, error: `不明なツール: ${name}` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const { owner, message, context = {}, history = [] } = body || {}
  if (!owner || !message) return json({ error: 'owner / message が必要です' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY が未設定です' }, { status: 500 })

  const origin = new URL(request.url).origin
  const ctx = {
    owner,
    origin,
    members: context.members || [],
  }

  const today = context.today_iso || new Date().toISOString()
  const tz = context.timezone || 'Asia/Tokyo'
  const membersStr = (context.members || [])
    .map(m => `- ${m.name}${m.email ? ` <${m.email}>` : ''}`)
    .join('\n')

  const systemPrompt = `あなたは OKR Dashboard のカレンダー管理アシスタントです。ユーザーの指示に基づき、ツールを使ってカレンダー予定の確認・作成・更新・削除を行います。

## 現在の状況
- 今日 (JST): ${today}
- タイムゾーン: ${tz}
- 操作実行者: ${owner}
- 招待候補メンバー:
${membersStr || '(なし)'}

## 行動ルール
1. 仮押さえは件名の先頭に「[仮]」を付ける (create_event ツール側で自動付与されるが、AI も意識すること)
2. 空き時間を探す時は必ず find_free_slots を使う (勘で答えない)
3. **重要**: create_event / update_event / delete_event は「提案」として返り、実行はユーザー承認後 UI 側で行われる。したがって AI の最終返答では「作成しました」ではなく「以下の内容で作成します。よろしければ『承認』を押してください」のように表現すること
4. 招待者は必ず attendee_names でメンバー名を渡す (メールアドレス解決は裏で行う)
5. Google Meet が必要そうな会議 (チーム打合せ等) は add_meet: true
6. 時刻は JST (+09:00) の ISO 8601 で指定
7. 繰り返しは recurrence に RRULE 配列で指定 (例: 毎週金曜10回は ['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10'])
8. 未連携メンバーが含まれる場合は「◯◯さんは未連携のためカレンダー閲覧不可」と明言しつつ、招待には含める (Gmail アドレスが分かれば招待メールは届く)
9. 最終返答は日本語で簡潔に。実行結果や提案を短くまとめる

最初のユーザー指示を受け、必要なら複数ツール呼び出しを連続で行ってください。`

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  const actions = []
  let finalText = ''

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      }),
    })
    if (!res.ok) {
      const raw = await res.text()
      return json({ error: `Anthropic API ${res.status}: ${raw.slice(0, 300)}`, actions }, { status: 500 })
    }
    const data = await res.json()

    // assistant message を履歴に追加
    messages.push({ role: 'assistant', content: data.content })

    const toolUses = (data.content || []).filter(b => b.type === 'tool_use')
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()

    if (data.stop_reason === 'end_turn' || toolUses.length === 0) {
      finalText = textBlocks
      break
    }

    // ツール実行
    const toolResults = []
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input, ctx)
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

  return json({ text: finalText || '(応答なし)', actions })
}
