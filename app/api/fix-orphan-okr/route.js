import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export const dynamic = 'force-dynamic'

// GET: 孤立したQ期OKR（parent_objective_idがNULL）の一覧を返す
// POST: 孤立Q期OKRをlevel_idで通期OKRに自動紐付け
export async function GET() {
  const supabase = getClient()
  // Q期OKRでparent_objective_idがないものを取得
  const { data: orphans, error } = await supabase
    .from('objectives')
    .select('id, title, owner, period, level_id, parent_objective_id')
    .in('period', ['q1','q2','q3','q4','2025_q1','2025_q2','2025_q3','2025_q4','2026_q1','2026_q2','2026_q3','2026_q4'])
    .is('parent_objective_id', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 通期OKR一覧も取得
  const { data: annuals } = await supabase
    .from('objectives')
    .select('id, title, owner, period, level_id')
    .like('period', '%annual%')

  return NextResponse.json({ orphans: orphans || [], annuals: annuals || [] })
}

export async function POST(req) {
  const supabase = getClient()
  const { fixes } = await req.json()
  // fixes: [{ id: orphanId, parent_objective_id: annualId }, ...]

  if (!fixes?.length) {
    // 自動修復: level_idで通期OKRに紐付け（同level_idの通期OKRが1つの場合のみ）
    const { data: orphans } = await supabase
      .from('objectives')
      .select('id, title, period, level_id')
      .in('period', ['q1','q2','q3','q4','2025_q1','2025_q2','2025_q3','2025_q4','2026_q1','2026_q2','2026_q3','2026_q4'])
      .is('parent_objective_id', null)

    const { data: annuals } = await supabase
      .from('objectives')
      .select('id, title, period, level_id')
      .like('period', '%annual%')

    if (!orphans?.length) return NextResponse.json({ message: '孤立Q期OKRなし', fixed: 0 })

    const annualByLevel = {}
    for (const a of annuals || []) {
      if (!annualByLevel[a.level_id]) annualByLevel[a.level_id] = []
      annualByLevel[a.level_id].push(a)
    }

    const results = []
    for (const o of orphans) {
      const candidates = annualByLevel[o.level_id] || []
      if (candidates.length === 1) {
        const { error } = await supabase
          .from('objectives')
          .update({ parent_objective_id: candidates[0].id })
          .eq('id', o.id)
        results.push({ id: o.id, title: o.title, linked_to: candidates[0].title, error: error?.message })
      } else {
        results.push({ id: o.id, title: o.title, skipped: true, reason: candidates.length === 0 ? '通期OKRなし' : `通期OKR ${candidates.length}件 - 手動選択が必要` })
      }
    }
    return NextResponse.json({ results, fixed: results.filter(r => !r.skipped && !r.error).length })
  }

  // 手動修復: 指定された紐付けを適用
  const results = []
  for (const fix of fixes) {
    const { error } = await supabase
      .from('objectives')
      .update({ parent_objective_id: fix.parent_objective_id })
      .eq('id', fix.id)
    results.push({ id: fix.id, parent_objective_id: fix.parent_objective_id, error: error?.message })
  }
  return NextResponse.json({ results, fixed: results.filter(r => !r.error).length })
}
