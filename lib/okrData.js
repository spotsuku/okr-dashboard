// ════════════════════════════════════════════════════════════════════════════
// OKR データアクセス層 (唯一の正)
// ════════════════════════════════════════════════════════════════════════════
// objectives / key_results / weekly_reports(=KA) / ka_tasks は全ビュー共通の
// 単一データソース。テーブル名・カラム・年度/アーカイブ絞り込みをここに集約し、
// 各ビューの load() はこの関数群を組み合わせて呼ぶ (取得ロジックの重複を排除)。
import { supabase } from './supabase'

export const OBJ_COLS = 'id,title,level_id,period,owner,parent_objective_id,archived_at'
const RANGE = [0, 49999]

// 通期 period 判定 (2026年度は接頭辞なし、他年度は "YYYY_xxx")
export function isPeriodInFiscalYear(period, fiscalYear) {
  if (!period) return false
  if (fiscalYear === '2026') return !period.includes('_')
  return period.startsWith(`${fiscalYear}_`)
}
export function filterObjectivesByFY(objs, fiscalYear) {
  return (objs || []).filter(o => isPeriodInFiscalYear(o.period, fiscalYear))
}

// ── owner 軸 (個人ビュー) ───────────────────────────────────────────────
export async function fetchObjectivesByOwner(owner) {
  const { data } = await supabase.from('objectives')
    .select(OBJ_COLS).eq('owner', owner).is('archived_at', null).order('period').range(...RANGE)
  return data || []
}
export async function fetchKeyResultsByOwner(owner) {
  const { data } = await supabase.from('key_results').select('*').eq('owner', owner).range(...RANGE)
  return data || []
}
export async function fetchKaTasksByAssignee(assignee, { incompleteOnly = true } = {}) {
  let q = supabase.from('ka_tasks').select('*').eq('assignee', assignee)
  if (incompleteOnly) q = q.eq('done', false)
  const { data } = await q.range(...RANGE)
  return data || []
}

// ── weekly_reports (= KA) ───────────────────────────────────────────────
//   owner で絞り、任意で週(week_start)と done 除外を適用。
export async function fetchWeeklyReportsByOwner(owner, { weeks = null, excludeDone = true } = {}) {
  let q = supabase.from('weekly_reports').select('*').eq('owner', owner)
  if (excludeDone) q = q.neq('status', 'done')
  if (weeks && weeks.length) q = q.in('week_start', weeks)
  const { data } = await q.range(...RANGE)
  return data || []
}

// ── objective_id 群で取得 (兼任Obj/横断取得用) ──────────────────────────
export async function fetchObjectivesByIds(ids) {
  if (!ids || !ids.length) return []
  const { data } = await supabase.from('objectives').select(OBJ_COLS).in('id', ids).is('archived_at', null).range(...RANGE)
  return data || []
}
export async function fetchKeyResultsByObjectiveIds(ids) {
  if (!ids || !ids.length) return []
  const { data } = await supabase.from('key_results').select('*').in('objective_id', ids).range(...RANGE)
  return data || []
}
export async function fetchWeeklyReportsByObjectiveIds(ids, { excludeDone = true } = {}) {
  if (!ids || !ids.length) return []
  let q = supabase.from('weekly_reports').select('*').in('objective_id', ids)
  if (excludeDone) q = q.neq('status', 'done')
  const { data } = await q.range(...RANGE)
  return data || []
}
