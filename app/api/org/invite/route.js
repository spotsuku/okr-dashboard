// 組織への招待 (owner / admin のみ)
// POST /api/org/invite { organization_id, email, role, name }
//
// 既に Supabase Auth に登録されているメールでも、未登録でも対応:
//   - members テーブルに行を作成 (なければ)
//   - organization_members に追加
//
// 招待メール送信は別途 Supabase の招待メール機能 or 手動で URL 送付

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '../../../../lib/sendInviteEmail'

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

export async function POST(request) {
  try {
    const { organization_id, email, role = 'member', name, inviter_email } = await request.json()
    if (!organization_id || !email || !inviter_email) {
      return json({ error: 'organization_id, email, inviter_email が必要です' }, { status: 400 })
    }
    if (!['owner', 'admin', 'member'].includes(role)) {
      return json({ error: '不正な role' }, { status: 400 })
    }
    const sb = admin()

    // 招待者が owner/admin ロールか確認
    const { data: inv } = await sb.from('organization_members')
      .select('role, members!inner(email)')
      .eq('organization_id', organization_id)
      .eq('members.email', inviter_email)
      .maybeSingle()
    if (!inv || (inv.role !== 'owner' && inv.role !== 'admin')) {
      return json({ error: '招待権限がありません (owner/admin のみ)' }, { status: 403 })
    }

    // 1) members 行を upsert (email で一意)
    const { data: existing } = await sb.from('members').select('id').eq('email', email).maybeSingle()
    let memberId = existing?.id
    if (!memberId) {
      const { data: ins, error: insErr } = await sb.from('members')
        .insert({ email, name: name || email.split('@')[0], is_admin: role !== 'member', organization_id })
        .select('id').single()
      if (insErr) return json({ error: '招待メンバー作成失敗: ' + insErr.message }, { status: 500 })
      memberId = ins.id
    }

    // 2) organization_members に追加 (重複は無視)
    const { error: omErr } = await sb.from('organization_members')
      .insert({ organization_id, member_id: memberId, role, invited_by: inviter_email })
    if (omErr && !omErr.message.includes('duplicate')) {
      return json({ error: '組織メンバー追加失敗: ' + omErr.message }, { status: 500 })
    }

    // 3) 招待メールを Resend で送信 (env 未設定なら skip)
    //    組織の name / slug を取得して、サインインURL付きメールを送る
    const { data: org } = await sb.from('organizations')
      .select('name, slug').eq('id', organization_id).maybeSingle()

    const mail = await sendInviteEmail({
      toEmail: email,
      toName: name || null,
      organizationName: org?.name || null,
      organizationSlug: org?.slug || null,
      inviterEmail: inviter_email,
      role,
    })

    return json({ ok: true, member_id: memberId, email: mail })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}
