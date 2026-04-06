/**
 * 通期Objective → 四半期Objective のマッピングを構築する。
 * 両ビュー（AnnualView, WeeklyMTGPage）で同じロジックを共有するための共通関数。
 *
 * @param {Array} annualObjs  - 通期Objectiveの配列 (.id, .level_id を持つ)
 * @param {Array} quarterObjs - 四半期Objectiveの配列 (.period, .parent_objective_id, .level_id を持つ)
 * @param {Function} [onAutoFix] - level_idフォールバックで紐付けた際のコールバック (qObjId, annualObjId) => void
 * @returns {Object} { [annualObjId]: { q1: [...], q2: [...], q3: [...], q4: [] } }
 */
export function buildQuarterMap(annualObjs, quarterObjs, onAutoFix) {
  const qMap = {}
  annualObjs.forEach(ann => { qMap[ann.id] = { q1: [], q2: [], q3: [], q4: [] } })

  // level_id → 通期OKR のマップ（フォールバック用）
  const annualByLevel = {}
  annualObjs.forEach(ann => {
    if (!annualByLevel[ann.level_id]) annualByLevel[ann.level_id] = []
    annualByLevel[ann.level_id].push(ann)
  })

  quarterObjs.forEach(qObj => {
    const baseQ = qObj.period.includes('_') ? qObj.period.split('_').pop() : qObj.period
    if (qObj.parent_objective_id && qMap[qObj.parent_objective_id]) {
      // parent_objective_id で直接マッチ（最優先）
      qMap[qObj.parent_objective_id][baseQ]?.push(qObj)
    } else {
      // フォールバック: 同level_idの通期OKRが1つだけの場合のみマッチ
      const candidates = annualByLevel[qObj.level_id] || []
      if (candidates.length === 1 && qMap[candidates[0].id]?.[baseQ]) {
        qMap[candidates[0].id][baseQ].push(qObj)
        // 自動修復コールバック（parent_objective_idをDBに書き込む）
        if (onAutoFix && !qObj.parent_objective_id) {
          onAutoFix(qObj.id, candidates[0].id)
        }
      }
    }
  })

  return qMap
}
