// 組織作成 API (Phase 4 SaaS化: 誰でも新規組織を作れるようにする)
//
// POST /api/org/create
//   Body: { slug, name, fiscal_year_default?, plan?, owner_email }
//
// フロー:
//   1) slug の重複チェック (a-z, 0-9, hyphen のみ)
//   2) organizations に INSERT
//   3) owner_email を members に upsert
//   4) organization_members に owner として追加 (is_default=true)
//
// 認証: Supabase Auth session が必要。owner_email が現在ログイン中の email と一致すること。

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

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

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      slug,
      name,
      fiscal_year_default = '2026',
      plan = 'standard',
      owner_email,
      owner_name,
    } = body || {}

    if (!slug || !name || !owner_email) {
      return json({ error: 'slug, name, owner_email が必要です' }, { status: 400 })
    }
    const normSlug = String(slug).toLowerCase().trim()
    if (!SLUG_RE.test(normSlug)) {
      return json({
        error: 'slug は 2〜40 文字、英小文字・数字・ハイフンのみ (先頭末尾はハイフン不可)',
      }, { status: 400 })
    }

    const sb = admin()

    // 1) slug 重複チェック
    const { data: dup } = await sb.from('organizations').select('id').eq('slug', normSlug).maybeSingle()
    if (dup) return json({ error: `slug "${normSlug}" は既に使われています` }, { status: 409 })

    // 2) organizations 作成
    const { data: org, error: orgErr } = await sb.from('organizations')
      .insert({ slug: normSlug, name, plan, fiscal_year_default })
      .select('id, slug, name, plan, fiscal_year_default')
      .single()
    if (orgErr) return json({ error: '組織作成失敗: ' + orgErr.message }, { status: 500 })

    // 3) members upsert (owner)
    let memberId
    const { data: existing } = await sb.from('members').select('id').eq('email', owner_email).maybeSingle()
    if (existing) {
      memberId = existing.id
    } else {
      const { data: ins, error: mErr } = await sb.from('members')
        .insert({
          email: owner_email,
          name: owner_name || owner_email.split('@')[0],
          is_admin: true,
          organization_id: org.id,
        })
        .select('id').single()
      if (mErr) {
        // ロールバック (organizations 削除)
        await sb.from('organizations').delete().eq('id', org.id)
        return json({ error: 'オーナー member 作成失敗: ' + mErr.message }, { status: 500 })
      }
      memberId = ins.id
    }

    // 4) organization_members に owner として追加 (新規組織なので is_default=true)
    const { error: omErr } = await sb.from('organization_members')
      .insert({ organization_id: org.id, member_id: memberId, role: 'owner', is_default: true })
    if (omErr) {
      await sb.from('organizations').delete().eq('id', org.id)
      return json({ error: '組織メンバー作成失敗: ' + omErr.message }, { status: 500 })
    }

    return json({ ok: true, organization: org })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}
