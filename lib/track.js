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
// feature 列がまだ DB に無い古い Supabase スキーマでは 1 回目で 400 を受けたら
// 以降 feature を含めずに insert することで余計な 400 をコンソールに残さない。
let _featureColMissing = false

export function setTrackContext({ organizationId, userEmail }) {
  _ctx = {
    organizationId: organizationId ?? null,
    userEmail: userEmail ?? null,
  }
}

// track(eventType, page, opts?)
//   opts: { feature?: string, metadata?: object }
// 後方互換: opts に旧来の metadata オブジェクトをそのまま渡しても受け取れる。
export function track(eventType, page = null, opts = {}) {
  try {
    if (typeof window === 'undefined') return
    if (!eventType) return
    if (!_ctx.organizationId || !_ctx.userEmail) return
    // opts は { feature, metadata } 形式が正。古い呼び出しが metadata を直接渡しても拾う。
    let feature = null
    let metadata = {}
    if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
      if ('feature' in opts || 'metadata' in opts) {
        feature = opts.feature || null
        metadata = (opts.metadata && typeof opts.metadata === 'object') ? opts.metadata : {}
      } else {
        metadata = opts
      }
    }
    const row = {
      organization_id: _ctx.organizationId,
      user_email: _ctx.userEmail,
      event_type: eventType,
      page: page || null,
      metadata: { ...metadata, ...(feature ? { feature } : {}) },
    }
    // feature 列が存在する環境では top-level にも入れる (集計 SQL の互換)
    if (!_featureColMissing) row.feature = feature || null
    supabase.from('analytics_events').insert(row).then(
      ({ error } = {}) => {
        if (!error) return
        // 「feature 列が無い」エラーを検出したらフラグを立てて再試行
        if (!_featureColMissing && /feature|column .* does not exist|PGRST204/i.test(error.message || '')) {
          _featureColMissing = true
          const { feature: _drop, ...rowNoFeature } = row
          supabase.from('analytics_events').insert(rowNoFeature).then(() => {}, () => {})
        }
      },
      () => {}
    )
  } catch {
    // 計測失敗は握りつぶす
  }
}

// サブ機能 (タブ切替・特定ボタン押下など) の計測
//   trackFeature('mycoach', 'tab_mail')
//   trackFeature('mycoo_orb', 'chat_send', { length: 42 })
export function trackFeature(page, feature, metadata = {}) {
  if (!feature) return
  track('feature', page, { feature, metadata })
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
