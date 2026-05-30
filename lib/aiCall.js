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

// 5xx 系の汎用バックオフ (短め)。429 は別ロジック (retry-after / 12s 単位) で扱う。
const SERVER_ERROR_BACKOFF_MS = [1000, 3000, 8000]
const MAX_ATTEMPTS = SERVER_ERROR_BACKOFF_MS.length + 1  // 計 4 回

const DEFAULT_USER_MESSAGE_OTHER =
  'AI 呼び出しに失敗しました。時間をおいて再度お試しください。'
const DEFAULT_USER_MESSAGE_OVERLOADED =
  'AI が一時的に混雑しています。少し待ってから再度お試しください。'

export class AICallError extends Error {
  constructor({ status, body, userMessage, retryable, retryAfter }) {
    super(userMessage)
    this.name = 'AICallError'
    this.status = status
    this.body = body
    this.userMessage = userMessage
    this.retryable = retryable
    this.retryAfter = retryAfter || 0
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
  let lastRetryAfter = 0
  let serverErrorAttempt = 0  // 5xx 系の試行回数 (バックオフ配列の index に使う)
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
      await new Promise((res) => setTimeout(res, SERVER_ERROR_BACKOFF_MS[serverErrorAttempt++] || 8000))
      continue
    }

    if (r.ok) return await r.json()

    lastStatus = r.status
    lastBody = (await r.text()).slice(0, 500)
    const retryAfterHeader = Number(r.headers.get('retry-after') || 0)
    if (retryAfterHeader) lastRetryAfter = retryAfterHeader

    if (!RETRYABLE_STATUSES.has(r.status) || attempt === MAX_ATTEMPTS - 1) break

    // 429 は分単位のレート制限なので長めに待つ (retry-after 尊重)
    // それ以外の 5xx は短めの指数バックオフ
    const delayMs = r.status === 429
      ? (retryAfterHeader ? Math.min(60_000, retryAfterHeader * 1000) : (12_000 + (attempt * 12_000)))
      : (SERVER_ERROR_BACKOFF_MS[serverErrorAttempt++] || 8000)
    await new Promise((res) => setTimeout(res, delayMs))
  }

  // ユーザー向けメッセージは status に応じて分岐 (フレンドリー化)
  let userMessage = DEFAULT_USER_MESSAGE_OTHER
  if (lastStatus === 429) {
    const waitSec = lastRetryAfter || 60
    userMessage = `AI の利用上限に達しました (1分あたりの入力トークン制限)。約 ${waitSec} 秒後に再試行してください。会話履歴をクリアすると上限に達しにくくなります。`
  } else if (lastStatus === 529) {
    userMessage = 'Anthropic API が一時的に過負荷状態です (529)。数分後に再試行してください。'
  } else if (RETRYABLE_STATUSES.has(lastStatus) || lastStatus === 0) {
    userMessage = DEFAULT_USER_MESSAGE_OVERLOADED
  }

  const retryable = RETRYABLE_STATUSES.has(lastStatus) || lastStatus === 0
  throw new AICallError({
    status: lastStatus,
    body: lastBody,
    userMessage,
    retryable,
    retryAfter: lastRetryAfter,
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
        retryAfter: e.retryAfter,
      },
      { status: e.retryable ? 503 : 500 }
    )
  }
  return Response.json(
    { error: e?.message || 'AI 呼び出しエラー' },
    { status: 500 }
  )
}
