// 開発者専用: ユーザー完全削除 API
//
// POST /api/admin/purge-user
//   Body: { email: string }
//
// 認証:
//   Authorization: Bearer <supabase access token>
//   呼び出し元が SUPER_ADMIN_EMAILS に含まれる必要がある (lib/superAdmin)
//
// 削除対象 (上位から):
//   1. organizations (owner_email = email) → cascade で配下の OKR / KR / KA / タスク / 確認事項 / 振り返り 等
//   2. organization_members (email = email) → 残った組織からこのユーザーのリンクを削除
//   3. members (email = email) → 残った組織からこのユーザーの member プロファイルを削除
//   4. coaching_logs / coaching_chats / coaching_profiles (owner = name) → メンバー名から逆引きして削除
//   5. analytics_events (user_email = email)
//   6. custom_links (user_email = email) … 個人リンクのみ
//   7. auth.users (admin.deleteUser で確実に削除)
//
// 共有データで保持されるもの (意図的):
//   - 削除ユーザーが書いた 共有リンク (custom_links で user_email IS NULL)
//   - 削除ユーザーが作成した 他人の OKR / KR 等 (他のメンバー所有)

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
  return new Response(JSON.stringify(b), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

export async function POST(request) {
  // 1. 認証 + super admin 検証
  const caller = await getBearerUser(request)
  if (!caller) return json({ error: '認証が必要です' }, { status: 401 })
  if (!isSuperAdmin(caller.email)) return json({ error: 'super admin 権限が必要です' }, { status: 403 })

  // 2. 入力
  let body
  try { body = await request.json() } catch { return json({ error: 'JSON parse error' }, { status: 400 }) }
  const email = (body?.email || '').trim().toLowerCase()
  if (!email) return json({ error: 'email が必要です' }, { status: 400 })

  const sb = admin()
  const report = { email, deleted: {}, errors: [] }

  // ── メンバー名を取得 (coaching_logs 等は owner=name で紐づくため逆引きする) ──
  const { data: memberRows } = await sb.from('members').select('id, name, organization_id').eq('email', email)
  const memberNames = Array.from(new Set((memberRows || []).map(m => m.name).filter(Boolean)))
  report.member_names = memberNames

  // ── 1. organizations (owner_email = email) を削除 → cascade で配下データも消える ──
  {
    const { data: orgs } = await sb.from('organizations').select('id, slug, name').eq('owner_email', email)
    report.owned_orgs = orgs || []
    if ((orgs || []).length > 0) {
      const { error, count } = await sb.from('organizations').delete({ count: 'exact' }).eq('owner_email', email)
      if (error) report.errors.push({ step: 'organizations', message: error.message })
      report.deleted.organizations = count || 0
    } else {
      report.deleted.organizations = 0
    }
  }

  // ── 2. organization_members (email = email) ──
  {
    const { error, count } = await sb.from('organization_members').delete({ count: 'exact' }).eq('email', email)
    if (error) report.errors.push({ step: 'organization_members', message: error.message })
    report.deleted.organization_members = count || 0
  }

  // ── 3. members (email = email) ──
  {
    const { error, count } = await sb.from('members').delete({ count: 'exact' }).eq('email', email)
    if (error) report.errors.push({ step: 'members', message: error.message })
    report.deleted.members = count || 0
  }

  // ── 4. coaching_logs / coaching_chats / coaching_profiles (owner = name) ──
  if (memberNames.length > 0) {
    for (const tbl of ['coaching_logs', 'coaching_chats', 'coaching_profiles']) {
      const { error, count } = await sb.from(tbl).delete({ count: 'exact' }).in('owner', memberNames)
      if (error && !/relation .* does not exist/i.test(error.message || '')) {
        report.errors.push({ step: tbl, message: error.message })
      }
      report.deleted[tbl] = count || 0
    }
  }

  // ── 5. analytics_events (user_email = email) ──
  {
    const { error, count } = await sb.from('analytics_events').delete({ count: 'exact' }).eq('user_email', email)
    if (error && !/relation .* does not exist/i.test(error.message || '')) {
      report.errors.push({ step: 'analytics_events', message: error.message })
    }
    report.deleted.analytics_events = count || 0
  }

  // ── 6. custom_links (user_email = email) — 個人リンクのみ。共有 (NULL) は保持 ──
  {
    const { error, count } = await sb.from('custom_links').delete({ count: 'exact' }).eq('user_email', email)
    if (error && !/relation .* does not exist/i.test(error.message || '')) {
      report.errors.push({ step: 'custom_links', message: error.message })
    }
    report.deleted.custom_links = count || 0
  }

  // ── 7. auth.users (Supabase Authentication) ──
  // listUsers でメール一致のユーザー id を見つけて deleteUser
  try {
    let foundIds = []
    let page = 1
    // 最大 10 ページ (約 1000 件) まで検索
    for (; page <= 10; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 100 })
      if (error) { report.errors.push({ step: 'auth.listUsers', message: error.message }); break }
      const matches = (data.users || []).filter(u => (u.email || '').toLowerCase() === email)
      foundIds.push(...matches.map(u => u.id))
      if (!data.users || data.users.length < 100) break
    }
    report.auth_user_ids = foundIds
    for (const id of foundIds) {
      const { error } = await sb.auth.admin.deleteUser(id)
      if (error) report.errors.push({ step: `auth.deleteUser:${id}`, message: error.message })
    }
    report.deleted.auth_users = foundIds.length
  } catch (e) {
    report.errors.push({ step: 'auth.deleteUser', message: e.message || String(e) })
  }

  return json({ ok: report.errors.length === 0, report })
}
