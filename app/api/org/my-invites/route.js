// ログイン中ユーザーの「参加可能な招待」を扱う。
//
// 招待とは: 管理者がその email を組織の名簿 (members) に追加済みだが、
// まだ organization_members (= 認証アカウントと組織のリンク) が無い状態。
// この場合ユーザーがログインしても無所属画面になるため、本人が自分で
// 「参加」してリンクを作れるようにする。
//
//   GET  /api/org/my-invites           → 参加可能な組織一覧 (name/slug)
//   POST /api/org/my-invites { organization_id } → 参加 (organization_members 作成) → { slug }
//
// email は必ず検証済みセッション (Bearer token) から取得する。クライアントの
// 申告値は使わない (他人の email でのなりすまし参加を防ぐ)。
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
  return new Response(JSON.stringify(b), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

// email が members に居るが organization_members 未リンクの組織を返す
async function eligibleInvites(sb, email) {
  const { data: memRows } = await sb.from('members')
    .select('id, organization_id, is_admin').eq('email', email)
  if (!memRows || memRows.length === 0) return []

  const memberIds = memRows.map(m => m.id)
  const { data: links } = await sb.from('organization_members')
    .select('member_id').in('member_id', memberIds)
  const linked = new Set((links || []).map(l => l.member_id))

  const pending = memRows.filter(m => !linked.has(m.id) && m.organization_id)
  if (pending.length === 0) return []

  const orgIds = [...new Set(pending.map(m => m.organization_id))]
  const { data: orgs } = await sb.from('organizations')
    .select('id, slug, name').in('id', orgIds)
  const orgById = Object.fromEntries((orgs || []).map(o => [o.id, o]))

  // 1 org につき 1 件に集約 (同一orgで複数members行がある異常系の保険)
  const seen = new Set()
  const out = []
  for (const m of pending) {
    const org = orgById[m.organization_id]
    if (!org || seen.has(org.id)) continue
    seen.add(org.id)
    out.push({
      organization_id: org.id,
      member_id: m.id,
      is_admin: !!m.is_admin,
      name: org.name,
      slug: org.slug,
    })
  }
  return out
}

export async function GET(request) {
  const user = await getBearerUser(request)
  if (!user?.email) return json({ error: '認証が必要です' }, { status: 401 })
  try {
    const sb = admin()
    const invites = await eligibleInvites(sb, user.email)
    return json({ invites })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}

export async function POST(request) {
  const user = await getBearerUser(request)
  if (!user?.email) return json({ error: '認証が必要です' }, { status: 401 })
  try {
    const { organization_id } = await request.json()
    if (!organization_id) return json({ error: 'organization_id が必要です' }, { status: 400 })

    const sb = admin()
    // 検証: この email がその組織の名簿に居て未リンクであること
    const invites = await eligibleInvites(sb, user.email)
    const target = invites.find(i => Number(i.organization_id) === Number(organization_id))
    if (!target) return json({ error: 'この組織への参加権限がありません' }, { status: 403 })

    const role = target.is_admin ? 'admin' : 'member'
    const { error: omErr } = await sb.from('organization_members')
      .insert({ organization_id: target.organization_id, member_id: target.member_id, role, invited_by: user.email })
    if (omErr && !omErr.message.includes('duplicate')) {
      return json({ error: '参加に失敗しました: ' + omErr.message }, { status: 500 })
    }
    return json({ ok: true, slug: target.slug })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}
