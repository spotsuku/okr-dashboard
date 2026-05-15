// Anthropic Messages API をリトライ付きで呼び出す共通ラッパー
//
// 背景:
//   サーバー過負荷 (HTTP 529 overloaded_error) や一時的なゲートウェイ系
//   エラーで AI 生成系の機能が止まる UX 問題。
//   1 回目で失敗したリクエストの大半は数秒待てば成功するので、サーバー側で
//   自動リトライ + ユーザー向けメッセージ整形を行う。
//
// 使い方:
//   import { callClaude, AICallError } from '@/lib/aiCall'
//   try {
//     const data = await callClaude({ model, system, messages, max_tokens })
//     // data.content[0].text を利用
//   } catch (e) {
//     // e.userMessage で日本語ユーザー向けメッセージ
//     // e.status / e.retryable で詳細
//   }

// 一時的なエラー (= リトライで解消が期待できる) のステータスコード
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 524, 529])

// リトライ回数 + 待機時間 (ms)
const BACKOFF_MS = [1000, 3000, 8000]   // 初回失敗後 1s, 次 3s, 次 8s
const MAX_ATTEMPTS = BACKOFF_MS.length + 1  // 計 4 回 (初回 + リトライ 3 回)

const DEFAULT_USER_MESSAGE_RETRYABLE =
  'AI が一時的に混雑しています。少し待ってから再度お試しください。'
const DEFAULT_USER_MESSAGE_OTHER =
  'AI 呼び出しに失敗しました。時間をおいて再度お試しください。'

export class AICallError extends Error {
  constructor({ status, body, userMessage, retryable }) {
    super(userMessage)
    this.name = 'AICallError'
    this.status = status
    this.body = body
    this.userMessage = userMessage
    this.retryable = retryable
  }
}

// fetch wrapper. 必要なら test で差し替えできるように export しておく。
export async function callClaude({
  model = 'claude-sonnet-4-5',
  system,
  messages,
  max_tokens = 1500,
  signal,
} = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AICallError({
      status: 0,
      body: 'ANTHROPIC_API_KEY missing',
      userMessage: 'AI の設定が未完了です (環境変数 ANTHROPIC_API_KEY)',
      retryable: false,
    })
  }

  let lastStatus = 0
  let lastBody = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let r
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens, system, messages }),
        signal,
      })
    } catch (netErr) {
      // ネットワーク断・タイムアウト等 (TypeError 等)
      lastStatus = 0
      lastBody = String(netErr?.message || netErr)
      if (attempt === MAX_ATTEMPTS - 1) break
      await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt] || 8000))
      continue
    }

    if (r.ok) return await r.json()

    lastStatus = r.status
    lastBody = (await r.text()).slice(0, 500)

    if (!RETRYABLE_STATUSES.has(r.status) || attempt === MAX_ATTEMPTS - 1) break
    await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt] || 8000))
  }

  const retryable = RETRYABLE_STATUSES.has(lastStatus) || lastStatus === 0
  throw new AICallError({
    status: lastStatus,
    body: lastBody,
    userMessage: retryable ? DEFAULT_USER_MESSAGE_RETRYABLE : DEFAULT_USER_MESSAGE_OTHER,
    retryable,
  })
}

// API ルート側でエラーを Response.json に変換するヘルパ
export function aiErrorResponse(e) {
  if (e instanceof AICallError) {
    return Response.json(
      {
        error: e.userMessage,
        retryable: e.retryable,
        status: e.status,
      },
      { status: e.retryable ? 503 : 500 }
    )
  }
  return Response.json(
    { error: e?.message || 'AI 呼び出しエラー' },
    { status: 500 }
  )
}
