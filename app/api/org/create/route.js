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

    // 3) この組織用の member 行を作成 (members は per-org 行。同一人物でも組織ごとに別行を持つ)
    let memberId
    const { data: existingInOrg } = await sb.from('members')
      .select('id').eq('email', owner_email).eq('organization_id', org.id).maybeSingle()
    if (existingInOrg) {
      memberId = existingInOrg.id
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
        // 旧グローバル一意制約 (members_email_lower_uniq) が残る環境向けフォールバック:
        // supabase_org_member_peruser.sql 適用後はこの分岐に入らない。
        const { data: anyExisting } = await sb.from('members').select('id').eq('email', owner_email).maybeSingle()
        if (anyExisting) {
          memberId = anyExisting.id
        } else {
          await sb.from('organizations').delete().eq('id', org.id)
          return json({ error: 'オーナー member 作成失敗: ' + mErr.message }, { status: 500 })
        }
      } else {
        memberId = ins.id
      }
    }

    // 4) organization_members に owner として追加 (新規組織なので is_default=true)
    const { error: omErr } = await sb.from('organization_members')
      .insert({ organization_id: org.id, member_id: memberId, role: 'owner', is_default: true })
    if (omErr) {
      await sb.from('organizations').delete().eq('id', org.id)
      return json({ error: '組織メンバー作成失敗: ' + omErr.message }, { status: 500 })
    }

    // 5) ルート組織 (経営レベル) を「全社」として自動作成
    //    これで新規組織でも組織図の最上位ノードが存在し、配下に事業部/チームを
    //    すぐ追加できる状態になる。失敗してもロールバックはしない (= 後から
    //    「組織を管理」画面で手動追加できるため致命的でない)
    const { error: lvlErr } = await sb.from('levels').insert({
      name: '全社',
      icon: 'building',
      parent_id: null,
      color: '#4d9fff',
      fiscal_year: fiscal_year_default,
      organization_id: org.id,
    })
    if (lvlErr) {
      console.warn('[org/create] default root level insert failed:', lvlErr.message)
    }

    return json({ ok: true, organization: org })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}
