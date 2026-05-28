// 組織内 利用分析サマリー (owner / admin のみ)
// GET /api/analytics/summary?org=<organization_id>&days=30
//   Authorization: Bearer <supabase access token> 必須
//   要求者が当該組織の owner / admin であることを検証してから集計を返す。

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { getBearerUser } from '../../../../lib/apiGuard'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}
function json(b, init) {
  return new Response(JSON.stringify(b), { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
}

// 要求者 (email) が org の owner / admin か
async function isOrgAdmin(sb, orgId, email) {
  const { data } = await sb.from('organization_members')
    .select('role, members!inner(email)')
    .eq('organization_id', orgId)
    .eq('members.email', email)
    .maybeSingle()
  return !!(data && (data.role === 'owner' || data.role === 'admin'))
}

export async function GET(request) {
  const user = await getBearerUser(request)
  if (!user?.email) return json({ error: '認証が必要です' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const orgId = Number(searchParams.get('org'))
  let days = Number(searchParams.get('days')) || 30
  if (!Number.isFinite(days) || days < 1) days = 30
  if (days > 365) days = 365
  if (!orgId || !Number.isFinite(orgId)) return json({ error: 'org が不正です' }, { status: 400 })

  const sb = admin()
  if (!(await isOrgAdmin(sb, orgId, user.email))) {
    return json({ error: '権限がありません (組織の管理者のみ)' }, { status: 403 })
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const sinceISO = since.toISOString()

  // 組織のメンバー名簿 (email → name) と総数
  const { data: memberRows } = await sb.from('organization_members')
    .select('members!inner(name, email)')
    .eq('organization_id', orgId)
  const nameByEmail = {}
  for (const r of memberRows || []) {
    const m = r.members
    if (m?.email) nameByEmail[m.email] = m.name || m.email
  }
  const memberCount = (memberRows || []).length

  // イベント取得 (feature 列は未マイグレ環境でも落ちないよう例外で吸収)
  let events = []
  let evErr = null
  let hasFeatureCol = true
  {
    const r = await sb.from('analytics_events')
      .select('user_email, event_type, page, feature, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(50000)
    if (r.error && /feature|column .* does not exist/i.test(r.error.message || '')) {
      hasFeatureCol = false
      const r2 = await sb.from('analytics_events')
        .select('user_email, event_type, page, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false })
        .limit(50000)
      events = r2.data || []
      evErr = r2.error
    } else {
      events = r.data || []
      evErr = r.error
    }
  }

  // テーブル未作成 (マイグレーション未適用) を検知してフロントに知らせる
  if (evErr) {
    if (/relation .*analytics_events.* does not exist|does not exist/i.test(evErr.message || '')) {
      return json({ ok: true, ready: false, range: { days, since: sinceISO } })
    }
    return json({ error: evErr.message }, { status: 500 })
  }

  const rows = events || []
  const fmtDay = (d) => new Date(d).toISOString().slice(0, 10)

  // ユーザー別集計
  const byUser = {}        // email → { events, pageViews, logins, lastActive, pages:{page:count} }
  const byPage = {}        // page → { count, users:Set }              ← 機能 (画面) 別
  const bySubFeature = {}  // 'page::feature' → { page, feature, count, users:Set } ← サブ機能別
  const byDay = {}         // yyyy-mm-dd → { events, users:Set }
  const activeUserSet = new Set()
  let totalEvents = 0
  let loginCount = 0
  let featureCount = 0

  for (const e of rows) {
    const email = e.user_email || '(unknown)'
    totalEvents++
    activeUserSet.add(email)

    const u = byUser[email] || (byUser[email] = { events: 0, pageViews: 0, logins: 0, lastActive: null, pages: {} })
    u.events++
    if (!u.lastActive || e.created_at > u.lastActive) u.lastActive = e.created_at
    if (e.event_type === 'login') { u.logins++; loginCount++ }
    if (e.event_type === 'page_view') {
      u.pageViews++
      const p = e.page || '(none)'
      u.pages[p] = (u.pages[p] || 0) + 1
      const f = byPage[p] || (byPage[p] = { count: 0, users: new Set() })
      f.count++; f.users.add(email)
    }
    if (e.event_type === 'feature' && e.feature) {
      featureCount++
      const key = `${e.page || ''}::${e.feature}`
      const sf = bySubFeature[key] || (bySubFeature[key] = { page: e.page || null, feature: e.feature, count: 0, users: new Set() })
      sf.count++; sf.users.add(email)
    }

    const day = fmtDay(e.created_at)
    const d = byDay[day] || (byDay[day] = { events: 0, users: new Set() })
    d.events++; d.users.add(email)
  }

  const users = Object.entries(byUser).map(([email, u]) => {
    const topPage = Object.entries(u.pages).sort((a, b) => b[1] - a[1])[0]
    return {
      email,
      name: nameByEmail[email] || email,
      events: u.events,
      pageViews: u.pageViews,
      logins: u.logins,
      lastActive: u.lastActive,
      topPage: topPage ? topPage[0] : null,
    }
  }).sort((a, b) => b.events - a.events)

  const features = Object.entries(byPage).map(([page, f]) => ({
    page,
    count: f.count,
    users: f.users.size,
  })).sort((a, b) => b.count - a.count)

  const subFeatures = Object.values(bySubFeature).map((sf) => ({
    page: sf.page,
    feature: sf.feature,
    count: sf.count,
    users: sf.users.size,
  })).sort((a, b) => b.count - a.count)

  // 直近 days 日ぶんの日次トレンド (イベントが無い日も 0 で埋める)
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const day = fmtDay(Date.now() - i * 24 * 60 * 60 * 1000)
    const d = byDay[day]
    daily.push({ date: day, events: d ? d.events : 0, activeUsers: d ? d.users.size : 0 })
  }

  // 一度も使っていないメンバー (名簿にいるが期間内イベント無し)
  const inactiveMembers = Object.entries(nameByEmail)
    .filter(([email]) => !activeUserSet.has(email))
    .map(([email, name]) => ({ email, name }))

  return json({
    ok: true,
    ready: true,
    hasFeatureCol,
    range: { days, since: sinceISO },
    totals: {
      activeUsers: activeUserSet.size,
      memberCount,
      totalEvents,
      logins: loginCount,
      featureEvents: featureCount,
    },
    users,
    features,        // 画面 (page) 別
    subFeatures,     // サブ機能 (page+feature) 別
    daily,
    inactiveMembers,
  })
}
