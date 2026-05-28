// 組織横断 利用分析 (運営=スーパー管理者のみ)
// GET /api/analytics/super?days=30          … 集計を返す
// GET /api/analytics/super?mode=access       … 自分が運営かだけ返す (メニュー表示判定用)
//   Authorization: Bearer <supabase access token> 必須
//   許可は環境変数 SUPER_ADMIN_EMAILS (lib/superAdmin) で判定する。

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { getBearerUser } from '../../../../lib/apiGuard'
import { isSuperAdmin } from '../../../../lib/superAdmin'

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

export async function GET(request) {
  const user = await getBearerUser(request)
  if (!user?.email) return json({ error: '認証が必要です' }, { status: 401 })

  const allowed = isSuperAdmin(user.email)
  const { searchParams } = new URL(request.url)

  // メニュー表示判定用: 許可/不許可を 200 で返す (一覧は晒さない)
  if (searchParams.get('mode') === 'access') {
    return json({ ok: true, isSuperAdmin: allowed })
  }

  if (!allowed) return json({ error: '権限がありません (運営のみ)' }, { status: 403 })

  let days = Number(searchParams.get('days')) || 30
  if (!Number.isFinite(days) || days < 1) days = 30
  if (days > 365) days = 365

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const sinceISO = since.toISOString()
  const sb = admin()

  // 組織一覧
  const { data: orgs } = await sb.from('organizations')
    .select('id, slug, name, plan, created_at, admin_first_login_at')
  const orgMap = {}
  for (const o of orgs || []) orgMap[o.id] = o

  // 組織別メンバー数
  const { data: memberRows } = await sb.from('organization_members')
    .select('organization_id')
  const memberCountByOrg = {}
  for (const r of memberRows || []) {
    memberCountByOrg[r.organization_id] = (memberCountByOrg[r.organization_id] || 0) + 1
  }

  // 期間内イベント (全組織)
  const { data: events, error: evErr } = await sb.from('analytics_events')
    .select('organization_id, user_email, event_type, created_at')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
    .limit(100000)

  if (evErr) {
    if (/does not exist/i.test(evErr.message || '')) {
      return json({ ok: true, ready: false, range: { days, since: sinceISO } })
    }
    return json({ error: evErr.message }, { status: 500 })
  }

  const rows = events || []
  const byOrg = {}   // org_id → { events, logins, users:Set, lastActive }
  const globalUsers = new Set()
  let totalEvents = 0

  for (const e of rows) {
    const oid = e.organization_id
    if (oid == null) continue
    totalEvents++
    if (e.user_email) globalUsers.add(`${oid}::${e.user_email}`)
    const b = byOrg[oid] || (byOrg[oid] = { events: 0, logins: 0, users: new Set(), lastActive: null })
    b.events++
    if (e.event_type === 'login') b.logins++
    if (e.user_email) b.users.add(e.user_email)
    if (!b.lastActive || e.created_at > b.lastActive) b.lastActive = e.created_at
  }

  // 全組織を行にする (期間内イベントが無い組織も memberCount/プラン等は出す)
  const organizations = (orgs || []).map((o) => {
    const b = byOrg[o.id]
    return {
      id: o.id,
      slug: o.slug,
      name: o.name,
      plan: o.plan,
      createdAt: o.created_at,
      adminFirstLoginAt: o.admin_first_login_at,
      memberCount: memberCountByOrg[o.id] || 0,
      activeUsers: b ? b.users.size : 0,
      events: b ? b.events : 0,
      logins: b ? b.logins : 0,
      lastActive: b ? b.lastActive : null,
    }
  }).sort((a, b) => b.events - a.events)

  const activeOrgCount = organizations.filter((o) => o.events > 0).length

  return json({
    ok: true,
    ready: true,
    range: { days, since: sinceISO },
    totals: {
      orgCount: organizations.length,
      activeOrgCount,
      activeUsers: globalUsers.size,
      totalEvents,
    },
    organizations,
  })
}
