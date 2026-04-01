/**
 * 通期Objective → 四半期Objective のマッピングを構築する。
 * 両ビュー（AnnualView, WeeklyMTGPage）で同じロジックを共有するための共通関数。
 *
 * @param {Array} annualObjs  - 通期Objectiveの配列 (.id, .level_id を持つ)
 * @param {Array} quarterObjs - 四半期Objectiveの配列 (.period, .parent_objective_id, .level_id を持つ)
 * @returns {Object} { [annualObjId]: { q1: [...], q2: [...], q3: [...], q4: [] } }
 */
export function buildQuarterMap(annualObjs, quarterObjs) {
  const qMap = {}
  annualObjs.forEach(ann => { qMap[ann.id] = { q1: [], q2: [], q3: [], q4: [] } })

  quarterObjs.forEach(qObj => {
    const baseQ = qObj.period.includes('_') ? qObj.period.split('_').pop() : qObj.period
    if (qObj.parent_objective_id && qMap[qObj.parent_objective_id]) {
      qMap[qObj.parent_objective_id][baseQ]?.push(qObj)
    } else {
      const match = annualObjs.find(a => Number(a.level_id) === Number(qObj.level_id))
      if (match && qMap[match.id]?.[baseQ]) {
        qMap[match.id][baseQ].push(qObj)
      }
    }
  })

  return qMap
}
