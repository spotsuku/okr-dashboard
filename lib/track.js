'use client'
// ────────────────────────────────────────────────────────────────
// 利用分析イベントの記録 (analytics_events への書き込み)
//
// 「どのユーザーが・どれくらい・どの機能を使っているか」を可視化するため、
// 画面遷移 (page_view) やログイン (login) をクライアントから直接 insert する。
// RLS により insert のみ許可・select は service role (API) のみ。
//
// 使い方:
//   import { setTrackContext, track } from '../lib/track'
//   setTrackContext({ organizationId, userEmail })   // org/user 確定時に一度
//   track('page_view', 'okr')                         // 画面遷移時など
//
// 計測は fire-and-forget。失敗してもアプリ動作には一切影響させない。
// ────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

let _ctx = { organizationId: null, userEmail: null }

export function setTrackContext({ organizationId, userEmail }) {
  _ctx = {
    organizationId: organizationId ?? null,
    userEmail: userEmail ?? null,
  }
}

export function track(eventType, page = null, metadata = {}) {
  try {
    if (typeof window === 'undefined') return
    if (!eventType) return
    // org / user が未確定なら記録しない (匿名イベントは集計の邪魔になるため)
    if (!_ctx.organizationId || !_ctx.userEmail) return
    const row = {
      organization_id: _ctx.organizationId,
      user_email: _ctx.userEmail,
      event_type: eventType,
      page: page || null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    }
    supabase.from('analytics_events').insert(row).then(() => {}, () => {})
  } catch {
    // 計測失敗は握りつぶす
  }
}

// ログインはセッション中 1 回だけ記録する (リロード/再マウントで重複させない)
export function trackLoginOnce() {
  try {
    if (typeof window === 'undefined') return
    if (!_ctx.organizationId || !_ctx.userEmail) return
    const key = `okr_tracked_login_${_ctx.organizationId}_${_ctx.userEmail}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    track('login', null, {})
  } catch {}
}
