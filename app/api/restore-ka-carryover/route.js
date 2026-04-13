import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export const dynamic = 'force-dynamic'

// 正しい月曜日を計算（JST基準）
function getMondayStr(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  const day = d.getUTCDay() // JST基準
  // UTC day でも JST の day と一致する（+09:00 で作ったため）
  // 実際はローカルを使う方が楽: const jstDay = (d.getDay() + ... )
  // ここでは簡単に Date の getDay() を使う
  const d2 = new Date(dateStr + 'T12:00:00') // 昼を使うことでDST/tz ブレ回避
  const wd = d2.getDay()
  const diff = wd === 0 ? -6 : 1 - wd
  d2.setDate(d2.getDate() + diff)
  const y = d2.getFullYear()
  const m = String(d2.getMonth() + 1).padStart(2, '0')
  const dd = String(d2.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function dayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return ['日','月','火','水','木','金','土'][d.getDay()]
}

function isBlank(v) { return v == null || String(v).trim() === '' }

function nonEmpty(...vals) {
  for (const v of vals) { if (!isBlank(v)) return v }
  return null
}

// GET: 診断モード（デフォルト）
// GET ?apply=true: 修正実行
//
// 修正内容:
//   1. week_start が月曜日でない行を検出
//   2. 同じ (kr_id, ka_title, owner) の月曜日行が同週にあれば、
//      good/more/focus_output/status などを非空優先でマージして月曜日行に集約
//      非月曜日行は削除
//   3. 同じKAの月曜日行がなければ、その行の week_start を月曜日にUPDATE
export async function GET(req) {
  const supabase = getClient()
  const url = new URL(req.url)
  const apply = url.searchParams.get('apply') === 'true'

  const { data: allReports, error } = await supabase
    .from('weekly_reports')
    .select('id,week_start,kr_id,ka_title,owner,good,more,focus_output,status,sort_order,level_id,objective_id,kr_title')
    .order('week_start', { ascending: true })
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = allReports?.length || 0

  // 非月曜日行の検出
  const misplaced = []
  const weekStartCounts = {}
  for (const r of allReports || []) {
    const wd = dayOfWeek(r.week_start)
    weekStartCounts[`${r.week_start} (${wd})`] = (weekStartCounts[`${r.week_start} (${wd})`] || 0) + 1
    if (wd !== '月') misplaced.push(r)
  }

  // 修正プランを構築
  const mergePlan = []  // { monId, fromId, fields }  → 月曜行にmerge, from行は削除
  const movePlan = []   // { id, oldWeek, newWeek }    → 行のweek_startを月曜に更新

  // 月曜行を索引化 (week + kr_id + ka_title + owner)
  const mondayIndex = {}
  for (const r of allReports || []) {
    if (dayOfWeek(r.week_start) !== '月') continue
    const key = `${r.week_start}_${r.kr_id ?? ''}_${r.ka_title ?? ''}_${r.owner ?? ''}`
    mondayIndex[key] = r
  }

  for (const m of misplaced) {
    const mondayWeek = getMondayStr(m.week_start)
    const key = `${mondayWeek}_${m.kr_id ?? ''}_${m.ka_title ?? ''}_${m.owner ?? ''}`
    const monRow = mondayIndex[key]
    if (monRow) {
      // マージ: 非空フィールドを優先
      const fields = {}
      const g = nonEmpty(monRow.good, m.good)
      const mo = nonEmpty(monRow.more, m.more)
      const f = nonEmpty(monRow.focus_output, m.focus_output)
      if (g !== monRow.good) fields.good = g || ''
      if (mo !== monRow.more) fields.more = mo || ''
      if (f !== monRow.focus_output) fields.focus_output = f || ''
      // statusは非月曜行を優先（ユーザーが設定していた可能性）
      if (m.status && m.status !== 'normal' && m.status !== monRow.status) {
        fields.status = m.status
      }
      mergePlan.push({
        monId: monRow.id,
        fromId: m.id,
        fromWeek: m.week_start,
        toWeek: monRow.week_start,
        ka_title: m.ka_title,
        owner: m.owner,
        fields,
      })
    } else {
      // 移動: 非月曜行の week_start を月曜日に更新
      movePlan.push({
        id: m.id,
        oldWeek: m.week_start,
        newWeek: mondayWeek,
        ka_title: m.ka_title,
        owner: m.owner,
      })
    }
  }

  if (!apply) {
    // 診断モード
    return NextResponse.json({
      mode: 'diagnose',
      total_rows: total,
      week_start_distribution: weekStartCounts,
      misplaced_count: misplaced.length,
      will_merge: mergePlan.length,
      will_move: movePlan.length,
      merge_sample: mergePlan.slice(0, 10),
      move_sample: movePlan.slice(0, 10),
      hint: '問題なければ ?apply=true を付けて実行してください',
    })
  }

  // 実行モード
  let mergeOk = 0, mergeNg = 0
  for (const p of mergePlan) {
    if (Object.keys(p.fields).length > 0) {
      const { error: eUpd } = await supabase.from('weekly_reports').update(p.fields).eq('id', p.monId)
      if (eUpd) { mergeNg++; console.error('merge update error:', p.monId, eUpd); continue }
    }
    // 非月曜行を削除（ka_tasksはON DELETE CASCADEで消える）
    const { error: eDel } = await supabase.from('weekly_reports').delete().eq('id', p.fromId)
    if (eDel) { mergeNg++; console.error('merge delete error:', p.fromId, eDel) } else mergeOk++
  }

  let moveOk = 0, moveNg = 0
  for (const p of movePlan) {
    const { error: e } = await supabase.from('weekly_reports').update({ week_start: p.newWeek }).eq('id', p.id)
    if (e) { moveNg++; console.error('move error:', p.id, e) } else moveOk++
  }

  return NextResponse.json({
    mode: 'apply',
    merged: mergeOk, merge_failed: mergeNg,
    moved: moveOk, move_failed: moveNg,
    total_fixed: mergeOk + moveOk,
  })
}
