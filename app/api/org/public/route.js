// 組織の公開情報 (slug/name のみ) を取得する API
// 未ログインユーザーがログイン画面で組織名を表示するために使う。
//
// GET /api/org/public?slug=xxx
//   200: { organization: { slug, name } }
//   404: { error: 'not_found' }
//
// 機密情報 (notion_api_key, plan 等) は返さない。

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = (searchParams.get('slug') || '').trim()
    if (!slug) return json({ error: 'slug required' }, { status: 400 })

    const sb = admin()
    const { data, error } = await sb.from('organizations')
      .select('slug, name')
      .eq('slug', slug)
      .maybeSingle()
    if (error) return json({ error: error.message }, { status: 500 })
    if (!data) return json({ error: 'not_found' }, { status: 404 })
    return json({ organization: data })
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 })
  }
}
