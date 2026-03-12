'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── helpers ────────────────────────────────────────────────────────────────
const RATINGS = [
  { min: 150, label: '奇跡',    color: '#ff9f43' },
  { min: 120, label: '変革',    color: '#a855f7' },
  { min: 100, label: '順調以上', color: '#00d68f' },
  { min:  80, label: '順調',    color: '#4d9fff' },
  { min:  60, label: '最低限',  color: '#ffd166' },
  { min:   0, label: '未達',    color: '#ff6b6b' },
]
const getRating = p => p == null ? null : (RATINGS.find(r => Math.min(p, 150) >= r.min) || RATINGS[RATINGS.length - 1])

function calcObjProgress(krs) {
  if (!krs?.length) return 0
  const valid = krs.filter(k => k.target > 0)
  if (!valid.length) return 0
  return Math.round(valid.reduce((s, k) => {
    const raw = k.lower_is_better
      ? Math.max(0, ((k.target * 2 - k.current) / k.target) * 100)
      : (k.current / k.target) * 100
    return s + Math.min(raw, 150)
  }, 0) / valid.length)
}

function getAbsoluteDepth(levelId, levels) {
  let depth = 0
  let cur = levels.find(l => l.id === levelId)
  while (cur && cur.parent_id) { depth++; cur = levels.find(l => l.id === cur.parent_id) }
  return depth
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
const Q_KEYS = ['q1', 'q2', 'q3', 'q4']
const Q_LABELS = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }

// ─── AnnualView ─────────────────────────────────────────────────────────────
export default function AnnualView({ levels, onAddObjective, onEdit, onDelete, refreshKey }) {
  const [annualObjs, setAnnualObjs]   = useState([])
  const [quarterMap, setQuarterMap]   = useState({})
  const [expanded, setExpanded]       = useState({})
  const [activeQ, setActiveQ]         = useState({})
  const [loading, setLoading]         = useState(true)

  useEffect(() => { loadAll() }, [refreshKey]) // eslint-disable-line

  const loadAll = async () => {
    setLoading(true)

    // 1. 通期OKRを全レベル分取得
    const { data: annObjs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .eq('period', 'annual')
      .order('level_id,id')

    if (!annObjs?.length) { setLoading(false); return }

    // 2. 通期OKRのKRを取得
    const annIds = annObjs.map(o => o.id)
    const { data: annKRs } = await supabase
      .from('key_results')
      .select('id,objective_id,title,target,current,unit,lower_is_better')
      .in('objective_id', annIds)

    const annKRMap = {}
    ;(annKRs || []).forEach(kr => {
      if (!annKRMap[kr.objective_id]) annKRMap[kr.objective_id] = []
      annKRMap[kr.objective_id].push(kr)
    })
    const fullAnnObjs = annObjs.map(o => ({ ...o, key_results: annKRMap[o.id] || [] }))
    setAnnualObjs(fullAnnObjs)

    // 3. 四半期OKR（parent_objective_idが設定されているもの）を取得
    const { data: qObjs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .in('period', Q_KEYS)
      .order('id')

    if (!qObjs?.length) { setLoading(false); return }

    // 4. 四半期OKRのKRを取得
    const qIds = qObjs.map(o => o.id)
    const { data: qKRs } = await supabase
      .from('key_results')
      .select('id,objective_id,title,target,current,unit,lower_is_better')
      .in('objective_id', qIds)

    const qKRMap = {}
    ;(qKRs || []).forEach(kr => {
      if (!qKRMap[kr.objective_id]) qKRMap[kr.objective_id] = []
      qKRMap[kr.objective_id].push(kr)
    })
    const fullQObjs = qObjs.map(o => ({ ...o, key_results: qKRMap[o.id] || [] }))

    // 5. annualObjId ごとに四半期OKRをグループ化
    // parent_objective_idが設定されていないものは同一level_idで紐づける
    const qMap = {}
    fullAnnObjs.forEach(ann => { qMap[ann.id] = { q1: [], q2: [], q3: [], q4: [] } })

    fullQObjs.forEach(qObj => {
      if (qObj.parent_objective_id && qMap[qObj.parent_objective_id]) {
        // 明示的に紐づいている場合
        qMap[qObj.parent_objective_id][qObj.period]?.push(qObj)
      } else {
        // 同一level_idの通期OKRに自動紐づけ（parent未設定の場合）
        const matchingAnn = fullAnnObjs.find(a => a.level_id === qObj.level_id)
        if (matchingAnn) {
          qMap[matchingAnn.id][qObj.period]?.push(qObj)
        }
      }
    })

    setQuarterMap(qMap)
    setLoading(false)
  }

  const toggleExpand = (id) => {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
    if (!activeQ[id]) setActiveQ(p => ({ ...p, [id]: 'q1' }))
  }

  const handleAddQ = (annualObjId, qKey, levelId) => {
    // 親の通期OKR情報を渡して追加モーダルを開く
    onAddObjective({ parentObjectiveId: annualObjId, period: qKey, level_id: levelId })
  }

  if (loading) return (
    <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>
  )

  if (!levels?.length) return (
    <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>
  )

  if (!annualObjs.length) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#404660', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 14, maxWidth: 600, margin: '40px auto' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 15, marginBottom: 6 }}>通期OKRがありません</div>
      <div style={{ fontSize: 13 }}>まず「通期」の目標を追加してください</div>
    </div>
  )

  return (
    <div style={{ padding: '24px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>年間ブレイクダウン</div>
        <div style={{ fontSize: 13, color: '#606880' }}>
          通期OKRをクリックして四半期への展開を確認・管理できます
        </div>
      </div>

      {annualObjs.map(ann => {
        const prog = calcObjProgress(ann.key_results)
        const r = getRating(prog)
        const depth = getAbsoluteDepth(ann.level_id, levels)
        const lColor = LAYER_COLORS[depth] || '#a0a8be'
        const lLabel = { 0: '経営', 1: '事業部', 2: 'チーム' }[depth] || ''
        const levelName = levels.find(l => l.id === ann.level_id)?.name || ''
        const levelIcon = levels.find(l => l.id === ann.level_id)?.icon || ''
        const isOpen = expanded[ann.id]
        const curQ = activeQ[ann.id] || 'q1'
        const qData = quarterMap[ann.id] || { q1: [], q2: [], q3: [], q4: [] }

        return (
          <div key={ann.id} style={{
            marginBottom: 16,
            background: '#111828',
            border: `1px solid ${isOpen ? lColor + '40' : lColor + '18'}`,
            borderRadius: 16,
            overflow: 'hidden',
            transition: 'border-color 0.2s',
          }}>
            {/* ── 通期ヘッダー（クリックで展開） ── */}
            <div onClick={() => toggleExpand(ann.id)} style={{
              padding: '18px 20px', cursor: 'pointer',
              borderLeft: `4px solid ${lColor}`,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* バッジ行 */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${lColor}15`, color: lColor, fontWeight: 600 }}>
                    {levelIcon} {levelName}
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: '#606880' }}>通期</span>
                  {r && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${r.color}18`, color: r.color, fontWeight: 700 }}>{r.label}</span>}
                </div>
                {/* タイトル */}
                <div style={{ fontSize: 14, fontWeight: 700, color: '#dde0ec', lineHeight: 1.4, marginBottom: 10 }}>
                  {ann.title}
                </div>
                {/* 四半期ミニバッジ */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length
                      ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length)
                      : null
                    const qr = qProg != null ? getRating(qProg) : null
                    return (
                      <div key={qKey} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6, fontWeight: 600,
                        background: qr ? `${qr.color}15` : 'rgba(255,255,255,0.04)',
                        color: qr ? qr.color : '#303650',
                        border: `1px solid ${qr ? qr.color + '30' : 'rgba(255,255,255,0.07)'}`,
                      }}>
                        {Q_LABELS[qKey]} {qProg != null ? `${qProg}%` : '未設定'}
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* 右側：達成率 + 開閉矢印 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: r?.color || '#404660' }}>
                  {ann.key_results.length ? `${prog}%` : '−'}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {onEdit && (
                    <button onClick={e => { e.stopPropagation(); onEdit(ann) }} style={{
                      background: 'rgba(77,159,255,0.12)', border: '1px solid rgba(77,159,255,0.25)',
                      color: '#4d9fff', borderRadius: 6, padding: '3px 8px', fontSize: 11,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>編集</button>
                  )}
                  {onDelete && (
                    <button onClick={e => { e.stopPropagation(); onDelete(ann.id) }} style={{
                      background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)',
                      color: '#ff6b6b', borderRadius: 6, padding: '3px 8px', fontSize: 11,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>削除</button>
                  )}
                  <div style={{
                    fontSize: 16, color: isOpen ? '#4d9fff' : '#404660',
                    transition: 'transform 0.2s',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>▾</div>
                </div>
              </div>
            </div>

            {/* ── 展開：四半期ドリルダウン ── */}
            {isOpen && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                {/* 四半期タブ */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length
                      ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length)
                      : null
                    const qr = qProg != null ? getRating(qProg) : null
                    const isActive = curQ === qKey
                    return (
                      <button key={qKey} onClick={() => setActiveQ(p => ({ ...p, [ann.id]: qKey }))} style={{
                        flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer',
                        background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                        borderBottom: isActive ? `2px solid ${qr?.color || '#4d9fff'}` : '2px solid transparent',
                        color: isActive ? (qr?.color || '#4d9fff') : qObjs.length ? '#606880' : '#303650',
                        fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s',
                      }}>
                        {Q_LABELS[qKey]}
                        <div style={{ fontSize: 10, marginTop: 2, fontWeight: 400 }}>
                          {qProg != null ? `${qProg}%` : qObjs.length ? '計画中' : '未設定'}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* 選択中四半期の内容 */}
                <div style={{ padding: '18px 20px' }}>
                  {qData[curQ]?.length > 0 ? (
                    <div>
                      {qData[curQ].map(qObj => {
                        const qProg = calcObjProgress(qObj.key_results)
                        const qr = getRating(qProg)
                        return (
                          <div key={qObj.id} style={{ marginBottom: 14 }}>
                            {/* 四半期OKRカード */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${qr.color}25`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${qr.color}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${qr.color}18`, color: qr.color, fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>{qr.label}</span>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#dde0ec', lineHeight: 1.4 }}>{qObj.title}</div>
                                  {qObj.owner && <div style={{ fontSize: 11, color: '#505878', marginTop: 4 }}>担当：{qObj.owner}</div>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                                  <div style={{ fontSize: 24, fontWeight: 800, color: qr.color }}>{qProg}%</div>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    {onEdit && (
                                      <button onClick={() => onEdit(qObj)} style={{
                                        background: 'rgba(77,159,255,0.12)', border: '1px solid rgba(77,159,255,0.25)',
                                        color: '#4d9fff', borderRadius: 6, padding: '3px 8px', fontSize: 11,
                                        cursor: 'pointer', fontFamily: 'inherit',
                                      }}>編集</button>
                                    )}
                                    {onDelete && (
                                      <button onClick={() => onDelete(qObj.id)} style={{
                                        background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)',
                                        color: '#ff6b6b', borderRadius: 6, padding: '3px 8px', fontSize: 11,
                                        cursor: 'pointer', fontFamily: 'inherit',
                                      }}>削除</button>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                                <div style={{ height: '100%', width: `${Math.min(qProg, 100)}%`, background: qr.color, borderRadius: 99, boxShadow: `0 0 6px ${qr.color}60` }} />
                              </div>
                              {/* 四半期KR一覧 */}
                              {qObj.key_results.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ fontSize: 10, color: '#404660', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>この四半期のKR</div>
                                  {qObj.key_results.map((kr, i) => {
                                    const kp = kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0
                                    const kr_r = getRating(kp)
                                    return (
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '7px 10px' }}>
                                        <span style={{ fontSize: 11, color: '#c0c4d8', flex: 1, minWidth: 0 }}>{kr.title}</span>
                                        <div style={{ width: 80, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                                          <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                                        </div>
                                        <span style={{ fontSize: 11, color: kr_r.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                          {kr.current?.toLocaleString()}{kr.unit} / {kr.target?.toLocaleString()}{kr.unit}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* 通期KR進捗セクション */}
                      {ann.key_results.length > 0 && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: 11, color: '#404660', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>通期KRへの貢献（累計）</div>
                          {ann.key_results.map((kr, i) => {
                            const kp = kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0
                            const kr_r = getRating(kp)
                            return (
                              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 12, color: '#a0a8be', flex: 1 }}>{kr.title}</span>
                                <div style={{ width: 100, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                                  <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 12, color: kr_r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  {kr.current?.toLocaleString()}{kr.unit} / {kr.target?.toLocaleString()}{kr.unit}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 未設定の四半期 */
                    <div style={{ textAlign: 'center', padding: '28px 20px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, color: '#404660' }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>＋</div>
                      <div style={{ fontSize: 13, marginBottom: 4 }}>{Q_LABELS[curQ]}のOKRを追加</div>
                      <div style={{ fontSize: 11, color: '#303650', marginBottom: 16 }}>
                        この通期OKRに紐づいた四半期目標を設定します
                      </div>
                      <button onClick={() => handleAddQ(ann.id, curQ, ann.level_id)} style={{
                        background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 8,
                        padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        ＋ {Q_LABELS[curQ]} OKRを追加
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
