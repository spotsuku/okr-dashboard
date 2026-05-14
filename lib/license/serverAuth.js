// ─────────────────────────────────────────────────────────────────────────────
// /api/license/* で共通利用する Supabase 管理クライアント生成 + 権限チェック
//
// 既存パターン (/api/org/role 等) に揃え、service-role キーで RLS をバイパス。
// requester_email を受け取り、organization_members から所属とロールを引く。
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export function jsonResponse(body, init) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

// 組織所属を判定。requireManage=true なら owner/admin のみ true。
export async function checkOrgRole(sb, organizationId, requesterEmail, { requireManage = false } = {}) {
  if (!organizationId || !requesterEmail) return { ok: false, role: null }
  const { data, error } = await sb
    .from('organization_members')
    .select('role, members!inner(email)')
    .eq('organization_id', organizationId)
    .eq('members.email', requesterEmail)
    .maybeSingle()
  if (error || !data) return { ok: false, role: null }
  const manage = data.role === 'owner' || data.role === 'admin'
  if (requireManage && !manage) return { ok: false, role: data.role }
  return { ok: true, role: data.role, canManage: manage }
}
