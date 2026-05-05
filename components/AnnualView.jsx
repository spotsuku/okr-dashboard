'use client'
import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { buildQuarterMap } from '../lib/objectiveMatching'
import { COMMON_TOKENS } from '../lib/themeTokens'
import KASection from './KASection'

// KASection に渡すテーマオブジェクト (AnnualView の THEMES を元に必要 key だけ抽出)
function makeKATheme(t) {
  return {
    accent:       t.btnEditColor || '#4d9fff',
    accentSolid:  t.addBtnBg     || '#4d9fff',
    text:         t.text,
    textSub:      t.textSub,
    textMuted:    t.textMuted,
    textFaint:    t.textFaint,
    textFaintest: t.textFaintest,
    bgCard:       t.bgCard,
    bgCard2:      t.bgKr,
    border:       t.border,
    borderMid:    t.borderDash,
    badgeBg:      t.btnEditColor || '#4d9fff',
    badgeBorder:  t.btnEditBorder || 'rgba(77,159,255,0.25)',
  }
}

// ─── themes ────────────────────────────────────────────────────────────────
// テーマは lib/themeTokens.js で一元管理。固有フィールドだけ上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    bgExpanded: 'rgba(0,0,0,0.2)',
    bgInner: 'rgba(255,255,255,0.03)', bgKr: 'rgba(255,255,255,0.03)',
    bgKrOuter: 'rgba(255,255,255,0.02)',
    borderDash: 'rgba(255,255,255,0.08)',
    borderKr: 'rgba(255,255,255,0.06)',
    progressBg: 'rgba(255,255,255,0.06)',
    btnEditBg: 'rgba(10,132,255,0.16)', btnEditBorder: 'rgba(10,132,255,0.30)', btnEditColor: '#0A84FF',
    btnDelBg: 'rgba(255,69,58,0.16)', btnDelBorder: 'rgba(255,69,58,0.30)', btnDelColor: '#FF453A',
    tabActiveBg: 'rgba(255,255,255,0.05)',
    badgePeriodBg: 'rgba(255,255,255,0.06)',
    addBtnBg: '#0A84FF',
    refBg: 'rgba(48,209,88,0.16)', refBorder: 'rgba(48,209,88,0.30)',
  },
  light: {
    ...COMMON_TOKENS.light,
    bgExpanded: 'rgba(0,0,0,0.03)',
    bgInner: 'rgba(0,0,0,0.02)', bgKr: 'rgba(0,0,0,0.03)',
    bgKrOuter: 'rgba(0,0,0,0.02)',
    borderDash: 'rgba(0,0,0,0.10)',
    borderKr: 'rgba(0,0,0,0.06)',
    progressBg: 'rgba(0,0,0,0.06)',
    btnEditBg: 'rgba(0,122,255,0.10)', btnEditBorder: 'rgba(0,122,255,0.30)', btnEditColor: '#007AFF',
    btnDelBg: 'rgba(255,59,48,0.10)', btnDelBorder: 'rgba(255,59,48,0.30)', btnDelColor: '#FF3B30',
    tabActiveBg: '#F2F2F7',
    badgePeriodBg: '#F2F2F7',
    addBtnBg: '#007AFF',
    refBg: 'rgba(52,199,89,0.08)', refBorder: 'rgba(52,199,89,0.30)',
  },
}

let _theme = THEMES.dark
const T = () => _theme

// ─── helpers ────────────────────────────────────────────────────────────────
const RATINGS = [
  { min: 120, label: '奇跡',   color: '#ff9f43' },
  { min: 110, label: '変革',   color: '#a855f7' },
  { min: 100, label: '好調',   color: '#00d68f' },
  { min:  90, label: '順調',   color: '#4d9fff' },
  { min:  80, label: '最低限', color: '#ffd166' },
  { min:   0, label: '未達',   color: '#ff6b6b' },
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
  let cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) { depth++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
  return depth
}

// ─── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function Avatar({ name, avatarUrl, size = 20 }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:`1.5px solid ${avatarColor(name)}60` }} />
  }
  if (!name) return null
  const c = avatarColor(name)
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`${c}25`, border:`1.5px solid ${c}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.36, fontWeight:700, color:c, flexShrink:0 }}>
      {name.slice(0,2)}
    </div>
  )
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
const Q_KEYS = ['q1', 'q2', 'q3', 'q4']
const Q_LABELS = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }
const Q_COLORS = { q1: '#1d4ed8', q2: '#0a8f5a', q3: '#c2410c', q4: '#7e22ce' }

// 通期 KR の current を子 (parent_kr_id でリンクされた Q 期 KR) から集計
//   manual:     親の current をそのまま使う (集計しない)
//   cumulative: 子の current 合計
//   average:    子の current 平均 (件数 0 なら親の current のまま)
//   latest:     最新 Q (Q4→Q3→Q2→Q1) で値ある子の current
function aggregateAnnualKR(annKr, childrenByQ) {
  const type = annKr.aggregation_type || 'manual'
  if (type === 'manual') return Number(annKr.current ?? 0)
  const flatChildren = ['q1','q2','q3','q4'].flatMap(q => childrenByQ[q] || [])
  if (flatChildren.length === 0) return Number(annKr.current ?? 0)
  if (type === 'cumulative') {
    return flatChildren.reduce((s, c) => s + (Number(c.current) || 0), 0)
  }
  if (type === 'average') {
    return flatChildren.reduce((s, c) => s + (Number(c.current) || 0), 0) / flatChildren.length
  }
  if (type === 'latest') {
    for (const q of ['q4','q3','q2','q1']) {
      const arr = childrenByQ[q] || []
      if (arr.length > 0) return Number(arr[arr.length - 1].current) || 0
    }
  }
  return Number(annKr.current ?? 0)
}

function toPeriodKey(period, fiscalYear) {
  return fiscalYear === '2026' ? period : `${fiscalYear}_${period}`
}

// サイドバーで選択中のlevelIdの子孫を全て取得
function getDescendantIds(levelId, levels) {
  const ids = [Number(levelId)]
  let frontier = [Number(levelId)]
  while (frontier.length) {
    const next = levels.filter(l => frontier.includes(Number(l.parent_id))).map(l => Number(l.id))
    ids.push(...next)
    frontier = next
  }
  return ids
}

// ─── AnnualView ─────────────────────────────────────────────────────────────
export default function AnnualView({ levels, onAddObjective, onEdit, onDelete, refreshKey, fiscalYear = '2026', themeKey = 'dark', activeLevelId, members = [] }) {
  _theme = THEMES[themeKey] || THEMES.dark

  const [annualObjs, setAnnualObjs] = useState([])
  const [quarterMap, setQuarterMap] = useState({})
  const [expanded,   setExpanded]   = useState({})
  const [loading,    setLoading]    = useState(true)

  useEffect(() => { loadAll() }, [refreshKey, fiscalYear]) // eslint-disable-line

  const loadAll = async () => {
    setLoading(true)

    const annualKey = toPeriodKey('annual', fiscalYear)
    const { data: annObjs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .eq('period', annualKey)
      .order('level_id,id')
      .range(0, 49999)

    if (!annObjs?.length) { setAnnualObjs([]); setQuarterMap({}); setLoading(false); return }

    const annIds = annObjs.map(o => o.id)
    // 新カラム (parent_kr_id / aggregation_type) を含めて SELECT。
    // SQL 未実行 (列なし) の環境でも壊れないよう、エラー時は従来カラムだけで再取得する。
    const annSelectFull = 'id,objective_id,title,target,current,unit,lower_is_better,owner,parent_kr_id,aggregation_type'
    const annSelectLegacy = 'id,objective_id,title,target,current,unit,lower_is_better,owner'
    let annKRsRes = await supabase
      .from('key_results').select(annSelectFull).in('objective_id', annIds).range(0, 49999)
    if (annKRsRes.error && /parent_kr_id|aggregation_type|column/i.test(annKRsRes.error.message || '')) {
      console.warn('[AnnualView] parent_kr_id / aggregation_type 列が無い環境のため legacy SELECT で再取得 (SQL 未実行)')
      annKRsRes = await supabase
        .from('key_results').select(annSelectLegacy).in('objective_id', annIds).range(0, 49999)
    }
    const annKRs = annKRsRes.data

    const annKRMap = {}
    ;(annKRs || []).forEach(kr => {
      if (!annKRMap[kr.objective_id]) annKRMap[kr.objective_id] = []
      annKRMap[kr.objective_id].push(kr)
    })
    const fullAnnObjs = annObjs.map(o => ({ ...o, key_results: annKRMap[o.id] || [] }))
    setAnnualObjs(fullAnnObjs)

    const qKeys = Q_KEYS.map(q => toPeriodKey(q, fiscalYear))
    // 年度プレフィックスの有無両方で検索（データ不整合対応）
    const allQKeys = [...new Set([...qKeys, ...Q_KEYS, ...Q_KEYS.map(q => `${fiscalYear}_${q}`)])]
    const { data: qObjs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .in('period', allQKeys)
      .order('id')
      .range(0, 49999)

    if (!qObjs?.length) { setQuarterMap({}); setLoading(false); return }

    const qIds = qObjs.map(o => o.id)
    // 同上: SQL 未実行環境向けのフォールバック
    let qKRsRes = await supabase
      .from('key_results').select(annSelectFull).in('objective_id', qIds).range(0, 49999)
    if (qKRsRes.error && /parent_kr_id|aggregation_type|column/i.test(qKRsRes.error.message || '')) {
      qKRsRes = await supabase
        .from('key_results').select(annSelectLegacy).in('objective_id', qIds).range(0, 49999)
    }
    const qKRs = qKRsRes.data

    const qKRMap = {}
    ;(qKRs || []).forEach(kr => {
      if (!qKRMap[kr.objective_id]) qKRMap[kr.objective_id] = []
      qKRMap[kr.objective_id].push(kr)
    })
    const fullQObjs = qObjs.map(o => ({ ...o, key_results: qKRMap[o.id] || [] }))

    const qMap = buildQuarterMap(fullAnnObjs, fullQObjs, (qObjId, annualObjId) => {
      // 自動修復: parent_objective_id が未設定のQ期OKRを自動的にDBに書き込む
      supabase.from('objectives').update({ parent_objective_id: annualObjId }).eq('id', qObjId).then(() => {})
    })

    setQuarterMap(qMap)
    setLoading(false)
  }

  const toggleExpand = (id) => {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  const handleAddQ = (annualObjId, qKey, levelId) => {
    onAddObjective({ parentObjectiveId: annualObjId, period: qKey, level_id: levelId })
  }

  // 組織フィルタリング（選択したレベルのOKRのみ表示、子孫は含めない）
  const filteredObjs = activeLevelId
    ? annualObjs.filter(o => Number(o.level_id) === Number(activeLevelId))
    : annualObjs

  if (loading) return <div style={{ padding: 40, color: T().addBtnBg, fontSize: 14 }}>読み込み中...</div>
  if (!levels?.length) return <div style={{ padding: 40, color: T().addBtnBg, fontSize: 14 }}>読み込み中...</div>

  if (!filteredObjs.length) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: T().textFaint, border: `1px dashed ${T().borderDash}`, borderRadius: 14, maxWidth: 600, margin: '40px auto' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 15, marginBottom: 6, color: T().text }}>{activeLevelId ? 'この組織の' : ''}{fiscalYear}年度の通期OKRがありません</div>
      <div style={{ fontSize: 13 }}>まず「通期」の目標を追加してください</div>
    </div>
  )

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: 1400, margin: '0 auto', position: 'relative' }}>
      <div aria-hidden style={{
        position: 'absolute', top: -150, left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 400,
        background: `radial-gradient(ellipse, ${T().addBtnBg}18 0%, transparent 60%)`,
        pointerEvents: 'none', filter: 'blur(40px)', zIndex: 0,
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* コンパクト見出し: 縦幅を抑えて OKR 本体に画面を譲る */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 6px', marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: T().text, margin: 0, letterSpacing: '-0.01em' }}>📊 年間ブレイクダウン</h1>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${T().addBtnBg}15`, color: T().addBtnBg }}>
          {fiscalYear}年度
        </span>
        <span style={{ fontSize: 11, color: T().textMuted, marginLeft: 'auto' }}>通期 OKR をクリックして四半期へ展開</span>
      </div>

      {filteredObjs.map(ann => {
        const prog = calcObjProgress(ann.key_results)
        const r = getRating(prog)
        const depth = getAbsoluteDepth(ann.level_id, levels)
        const lColor = LAYER_COLORS[depth] || '#a0a8be'
        const lLabel = { 0: '経営', 1: '事業部', 2: 'チーム' }[depth] || ''
        const levelName = levels.find(l => Number(l.id) === Number(ann.level_id))?.name || ''
        const levelIcon = levels.find(l => Number(l.id) === Number(ann.level_id))?.icon || ''
        const isOpen = expanded[ann.id]
        const qData = quarterMap[ann.id] || { q1: [], q2: [], q3: [], q4: [] }

        return (
          <div key={ann.id} style={{
            marginBottom: 18,
            background: `linear-gradient(180deg, ${T().bgCard} 0%, ${lColor}05 100%)`,
            border: `1px solid ${isOpen ? lColor + '40' : lColor + '15'}`,
            borderRadius: 18, overflow: 'hidden',
            position: 'relative',
            boxShadow: isOpen
              ? `0 1px 2px rgba(0,0,0,0.05), 0 8px 24px ${lColor}26, 0 16px 40px rgba(0,0,0,0.04)`
              : '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
            transition: 'all 0.25s ease',
          }}>
            {/* 上端に薄い色グラデ帯 (左の太線の代わり) */}
            <div aria-hidden style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, ${lColor} 0%, ${lColor}80 100%)`,
            }} />
            {/* 右上に放射状グロウ */}
            <div aria-hidden style={{
              position: 'absolute', top: -40, right: -40, width: 200, height: 200,
              background: `radial-gradient(circle, ${lColor}10 0%, transparent 65%)`,
              pointerEvents: 'none',
            }} />

            {/* 通期ヘッダー: 縦幅圧縮版 (バッジ行に Q% を統合 / 担当を右上に移動) */}
            <div onClick={() => toggleExpand(ann.id)} style={{
              padding: '12px 18px', cursor: 'pointer',
              display: 'flex', alignItems: 'flex-start', gap: 14,
              position: isOpen ? 'sticky' : 'relative',
              top: isOpen ? 0 : 'auto',
              zIndex: 5,
              background: T().bgCard,
              borderBottom: isOpen ? `1px solid ${T().border}` : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* 1行目: ステータスバッジ + Q% バッジ群 (まとめて1行) */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: `${lColor}1f`, color: lColor, fontWeight: 700 }}>{levelIcon} {levelName}</span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textMuted, fontWeight: 700 }}>通期</span>
                  {r && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: `${r.color}1f`, color: r.color, fontWeight: 800 }}>{r.label}</span>}
                  {/* 区切り */}
                  <span style={{ width: 1, height: 14, background: T().border, margin: '0 2px' }} />
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length) : null
                    const qr = qProg != null ? getRating(qProg) : null
                    return (
                      <span key={qKey} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 700,
                        background: qr ? `${qr.color}15` : 'rgba(0,0,0,0.04)',
                        color: qr ? qr.color : T().textFaintest,
                      }}>
                        {Q_LABELS[qKey]} {qProg != null ? `${qProg}%` : '−'}
                      </span>
                    )
                  })}
                </div>
                {/* 2行目: タイトル */}
                <div style={{ fontSize: 16, fontWeight: 800, color: T().text, lineHeight: 1.45, letterSpacing: '-0.01em' }}>{ann.title}</div>
              </div>
              {/* 右側: 達成率 + 担当 + アクション (縦に圧縮) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: r?.color || T().textFaint, letterSpacing: '-0.02em', lineHeight: 1 }}>{ann.key_results.length ? `${prog}%` : '−'}</div>
                {ann.owner && (
                  <div style={{ fontSize: 10, color: T().textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Avatar name={ann.owner} avatarUrl={members.find(m=>m.name===ann.owner)?.avatar_url} size={16} />
                    <span style={{ fontWeight: 600 }}>{ann.owner}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                  {onEdit && <button onClick={e => { e.stopPropagation(); onEdit(ann) }} style={{ background: T().btnEditBg, border: 'none', color: T().btnEditColor, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                  {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(ann.id) }} style={{ background: T().btnDelBg, border: 'none', color: T().btnDelColor, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                  <div style={{ fontSize: 16, color: isOpen ? lColor : T().textFaint, transition: 'transform 0.25s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</div>
                </div>
              </div>
            </div>

            {/* 展開: マトリクス表示 (通期KR 行 × Q1〜Q4 列, 左列固定 + 右側横スクロール) */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T().border}`, background: T().bgExpanded, padding: '14px 16px' }}>
                <MatrixView
                  T={T} ann={ann} qData={qData} members={members}
                  onEdit={onEdit} onDelete={onDelete} handleAddQ={handleAddQ}
                  onDataChanged={loadAll}
                />
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}

// ─── マトリクスビュー (通期 KR 行 × Q1〜Q4 列, 左列固定 + 横スクロール) ──
function MatrixView({ T, ann, qData, members, onEdit, onDelete, handleAddQ, onDataChanged }) {
  // 各 Q 列の Q-period KRs を「parent_kr_id ごと」「未紐付け」に分類
  const qKRsByParent = {}  // { [annKrId]: { q1: [...], q2: [...], q3: [...], q4: [...] } }
  const qKRsUnmapped = { q1: [], q2: [], q3: [], q4: [] }
  Q_KEYS.forEach(qKey => {
    ;(qData[qKey] || []).forEach(qObj => {
      ;(qObj.key_results || []).forEach(qkr => {
        const cell = { ...qkr, _qObjId: qObj.id, _qObjTitle: qObj.title, _qObjLevelId: qObj.level_id }
        const parentId = qkr.parent_kr_id
        if (parentId) {
          if (!qKRsByParent[parentId]) qKRsByParent[parentId] = { q1: [], q2: [], q3: [], q4: [] }
          qKRsByParent[parentId][qKey].push(cell)
        } else {
          qKRsUnmapped[qKey].push(cell)
        }
      })
    })
  })

  // Q 期 Objective を列ヘッダ用に集約 (1 つの Q に複数の Objective がある場合は配列に)
  const qObjectives = {
    q1: qData.q1 || [], q2: qData.q2 || [], q3: qData.q3 || [], q4: qData.q4 || [],
  }

  const annualKRs = ann.key_results || []
  const hasUnmapped = Object.values(qKRsUnmapped).some(arr => arr.length > 0)
  // 通期 KR が 0 件 = 旧データ (Q期のみで運用) の場合は「未紐付け」フレームを外し、
  // Q期 KR をそのままメイン内容として列ごとに表示する。
  const noAnnualMode = annualKRs.length === 0 && hasUnmapped

  const [showAutoLink, setShowAutoLink] = useState(false)
  const [dragOverCell, setDragOverCell] = useState(null)  // 'parent_<id>_<qKey>' | 'unmapped_<qKey>'
  const [busy, setBusy] = useState(false)
  // 空セルから直接 KR を追加するための状態
  const [addingCell, setAddingCell] = useState(null)  // { annKrId, qKey } | null
  const [addForm, setAddForm] = useState({ title: '', target: '', unit: '', owner: '' })
  const [addSaving, setAddSaving] = useState(false)

  // KR セル内編集 (既存 KR を直接インライン編集)
  const [editingKrId, setEditingKrId] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', target: '', current: '', unit: '', owner: '' })
  const [editSaving, setEditSaving] = useState(false)

  function startEditKr(qkr) {
    setAddingCell(null)
    setEditingKrId(qkr.id)
    setEditForm({
      title: qkr.title || '',
      target: qkr.target ?? '',
      current: qkr.current ?? '',
      unit: qkr.unit || '',
      owner: qkr.owner || '',
    })
  }
  function cancelEditKr() {
    setEditingKrId(null)
    setEditForm({ title: '', target: '', current: '', unit: '', owner: '' })
  }
  async function commitEditKr() {
    if (!editingKrId || editSaving) return
    const title = (editForm.title || '').trim()
    if (!title) { alert('KR タイトルを入力してください'); return }
    const targetNum = Number(editForm.target)
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      alert('目標値 (target) を正の数値で入力してください')
      return
    }
    const currentNum = editForm.current === '' ? 0 : Number(editForm.current)
    if (!Number.isFinite(currentNum)) {
      alert('現在値 (current) を数値で入力してください')
      return
    }
    setEditSaving(true)
    try {
      const payload = {
        title,
        target: targetNum,
        current: currentNum,
        unit: editForm.unit || '',
        owner: editForm.owner || null,
      }
      const { error } = await supabase.from('key_results').update(payload).eq('id', editingKrId)
      if (error) throw new Error(error.message)
      cancelEditKr()
      if (onDataChanged) await onDataChanged()
    } catch (err) {
      alert('更新失敗: ' + (err.message || ''))
    } finally {
      setEditSaving(false)
    }
  }
  async function deleteKr(qkr) {
    if (!window.confirm(`「${qkr.title}」を削除しますか？\n紐づく KA / 週次レビューも消えます (CASCADE)`)) return
    const { error } = await supabase.from('key_results').delete().eq('id', qkr.id)
    if (error) { alert('削除失敗: ' + error.message); return }
    if (onDataChanged) await onDataChanged()
  }

  // 空セルでクリック → 追加モード起動 (該当の通期 KR からデフォルト値継承)
  function startAddInCell(annKr, qKey) {
    setAddingCell({ annKrId: annKr.id, qKey })
    setAddForm({
      title: '',
      target: '',
      unit: annKr.unit || '',
      owner: annKr.owner || '',
    })
  }
  function cancelAddInCell() {
    setAddingCell(null)
    setAddForm({ title: '', target: '', unit: '', owner: '' })
  }

  // Q 期 Objective を確保 (なければ新規作成) し、KR を 1 件 insert する
  async function commitAddInCell() {
    if (!addingCell || addSaving) return
    const title = (addForm.title || '').trim()
    if (!title) { alert('KR タイトルを入力してください'); return }
    const targetNum = Number(addForm.target)
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      alert('目標値 (target) を正の数値で入力してください')
      return
    }
    setAddSaving(true)
    try {
      const qKey = addingCell.qKey
      const periodKey = qKey  // toPeriodKey() は呼び出し元と同じ規約 (annKey 'q1'..'q4')
      // 既存の Q 期 Objective を選ぶ (parent_objective_id = ann.id) — 1 件目を流用
      let qObj = (qData[qKey] || []).find(o => Number(o.parent_objective_id) === Number(ann.id))
      if (!qObj) {
        // 既存が無ければ新規作成 (タイトルは通期 OBJ から派生)
        const newTitle = `${qKey.toUpperCase()}: ${ann.title}`.slice(0, 200)
        const { data: ins, error: e1 } = await supabase
          .from('objectives')
          .insert({
            level_id: ann.level_id,
            parent_objective_id: ann.id,
            period: periodKey,
            title: newTitle,
            owner: addForm.owner || ann.owner || null,
          })
          .select()
          .single()
        if (e1) throw new Error('Q期Objective作成失敗: ' + e1.message)
        qObj = ins
      }
      // KR insert
      const krPayload = {
        objective_id: qObj.id,
        title,
        target: targetNum,
        current: 0,
        unit: addForm.unit || '',
        owner: addForm.owner || ann.owner || null,
        parent_kr_id: addingCell.annKrId,
      }
      // lower_is_better 列が無い古い環境向けにフォールバック (insert 失敗 → 列を抜いて再挑戦)
      let { error: e2 } = await supabase.from('key_results').insert(krPayload)
      if (e2 && /lower_is_better|parent_kr_id/.test(e2.message || '')) {
        // 列削減して再挑戦 (parent_kr_id だけは保持したいが、無いなら最小化)
        const minimal = { ...krPayload }
        if (/parent_kr_id/.test(e2.message || '')) delete minimal.parent_kr_id
        if (/lower_is_better/.test(e2.message || '')) delete minimal.lower_is_better
        const r2 = await supabase.from('key_results').insert(minimal)
        e2 = r2.error
      }
      if (e2) throw new Error('KR作成失敗: ' + e2.message)
      cancelAddInCell()
      if (onDataChanged) await onDataChanged()
    } catch (err) {
      alert(err.message || '保存に失敗しました')
    } finally {
      setAddSaving(false)
    }
  }

  // parent_kr_id を変更 (DnD / 自動紐付けから呼ばれる)
  async function setParent(qkrId, parentId) {
    setBusy(true)
    const { error } = await supabase.from('key_results').update({ parent_kr_id: parentId || null }).eq('id', qkrId)
    setBusy(false)
    if (error) {
      alert('紐付けに失敗しました: ' + (error.message || ''))
      return
    }
    if (onDataChanged) await onDataChanged()
  }

  // DnD: KR ドラッグ開始時に id を持たせる
  function onKRDragStart(e, qkrId) {
    e.dataTransfer.setData('application/kr-id', String(qkrId))
    e.dataTransfer.effectAllowed = 'move'
  }
  // DnD: ドロップ受け側
  function onCellDragOver(e, cellKey) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCell !== cellKey) setDragOverCell(cellKey)
  }
  function onCellDragLeave(cellKey) {
    if (dragOverCell === cellKey) setDragOverCell(null)
  }
  function onCellDrop(e, parentId) {
    e.preventDefault()
    setDragOverCell(null)
    const qkrId = Number(e.dataTransfer.getData('application/kr-id'))
    if (qkrId) setParent(qkrId, parentId)
  }

  // CSS スティッキ用の色: 横スクロール時に右側の Q セルが透けないよう
  // 必ず不透明色 (bgCard = #FFFFFF / #1C1C1E) を使う。
  const stickyBg = T().bgCard
  const cellBg = T().bgKr || T().bgInner

  return (
    <div>
      {/* 操作バー: 自動紐付け + 集計バッジ + 操作ヒント (1行に圧縮) */}
      {(hasUnmapped || annualKRs.length > 0) && (() => {
        const unmappedTotal = Object.values(qKRsUnmapped).reduce((s, arr) => s + arr.length, 0)
        const mappedTotal = Object.values(qKRsByParent).reduce((s, q) => s + Object.values(q).reduce((s2, arr) => s2 + arr.length, 0), 0)
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            {hasUnmapped && annualKRs.length > 0 && (
              <button onClick={() => setShowAutoLink(true)} disabled={busy}
                style={{ background: T().addBtnBg, border: 'none', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                🔗 自動紐付け候補
              </button>
            )}
            {/* 集計バッジ群 (空白を活用) */}
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: `${T().addBtnBg}14`, color: T().addBtnBg }}>
              通期 KR {annualKRs.length}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textMuted }}>
              紐付け済 Q期 KR {mappedTotal}
            </span>
            {unmappedTotal > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,159,67,0.15)', color: '#ff9f43' }}>
                未紐付け {unmappedTotal}
              </span>
            )}
            <span style={{ fontSize: 10, color: T().textFaint, marginLeft: 'auto' }}>
              💡 ⋮⋮ をドラッグして紐付け / 空セルをクリックで KR 追加
            </span>
          </div>
        )
      })()}
      {showAutoLink && (
        <AutoLinkDialog
          T={T}
          annualKRs={annualKRs}
          unmapped={qKRsUnmapped}
          onCancel={() => setShowAutoLink(false)}
          onApply={async (selections) => {
            setBusy(true)
            for (const { qkrId, parentId } of selections) {
              await supabase.from('key_results').update({ parent_kr_id: parentId }).eq('id', qkrId)
            }
            setBusy(false)
            setShowAutoLink(false)
            if (onDataChanged) await onDataChanged()
          }}
        />
      )}
      {/* 両軸 scroll コンテナ: 横方向 → Q3/Q4、縦方向 → KR 多数 をマトリクス内でスクロール。
          これにより sticky 左列 (通期 KR) と sticky 上行 (Q 期 Objective) が
          コンテナ内で正しく機能する。max-height は画面高に応じて調整。 */}
      <div style={{
        overflow: 'auto',
        maxHeight: 'calc(100vh - 280px)',
        borderRadius: 10, border: `1px solid ${T().border}`,
      }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 240px) repeat(4, 380px)',
        minWidth: 'max-content',
      }}>
        {/* ─── ヘッダ行: 通期 KR | Q1 OKR | Q2 OKR | Q3 OKR | Q4 OKR ─────
            マトリクス内縦スクロール時に Q 期 Objective を上部固定 */}
        <div style={{
          position: 'sticky', left: 0, top: 0, zIndex: 5,
          background: stickyBg,
          padding: 10, borderBottom: `1px solid ${T().border}`, borderRight: `1px solid ${T().border}`,
          fontSize: 11, color: T().textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
        }}>
          {annualKRs.length > 0 ? '通期 KR' : '— (通期 KR 未定義)'}
        </div>
        {Q_KEYS.map(qKey => {
          const qObjs = qObjectives[qKey]
          const qProg = qObjs.length ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length) : null
          const qr = qProg != null ? getRating(qProg) : null
          const accent = qr?.color || Q_COLORS[qKey]
          return (
            <div key={qKey} style={{
              position: 'sticky', top: 0, zIndex: 4,
              padding: '6px 10px',
              borderBottom: `1px solid ${T().border}`,
              borderRight: qKey !== 'q4' ? `1px solid ${T().border}` : 'none',
              // 不透明背景 + 細い下アクセント (派手な上下太線は廃止)
              background: stickyBg,
              boxShadow: `inset 0 -2px 0 ${accent}`,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{Q_LABELS[qKey]}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{qProg != null ? `${qProg}%` : (qObjs.length ? '計画中' : '未設定')}</span>
              </div>
              {qObjs.length > 0 ? qObjs.map(qObj => (
                <div key={qObj.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <span style={{ flex: 1, fontSize: 11, color: T().textSub, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={qObj.title}>{qObj.title}</span>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {onEdit && <button onClick={() => onEdit(qObj)} style={{ background: T().btnEditBg, border: 'none', color: T().btnEditColor, borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                    {onDelete && <button onClick={() => onDelete(qObj.id)} style={{ background: T().btnDelBg, border: 'none', color: T().btnDelColor, borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                  </div>
                </div>
              )) : (
                <button onClick={() => handleAddQ(ann.id, qKey, ann.level_id)} style={{ background: 'transparent', border: `1px dashed ${T().borderDash}`, color: T().textFaint, borderRadius: 6, padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ＋ {Q_LABELS[qKey]} OKR を作成
                </button>
              )}
            </div>
          )
        })}

        {/* ─── 通期 KR の各行 ───────────────────────────────── */}
        {annualKRs.map(annKr => {
          const childrenByQ = qKRsByParent[annKr.id] || { q1: [], q2: [], q3: [], q4: [] }
          // 集計タイプに応じて current を算出
          const aggregatedCurrent = aggregateAnnualKR(annKr, childrenByQ)
          const target = Number(annKr.target) || 0
          const kp = target > 0
            ? Math.round((annKr.lower_is_better ? Math.max(0, ((target * 2 - aggregatedCurrent) / target) * 100) : (aggregatedCurrent / target) * 100))
            : 0
          const kr_r = getRating(kp)
          const aggLabel = { manual: '', cumulative: '累積', average: '平均', latest: '最新' }[annKr.aggregation_type || 'manual']

          const isEditingAnn = Number(editingKrId) === Number(annKr.id)
          return (
            <Fragment key={annKr.id}>
              {/* 左列: 通期 KR (sticky) — クリックで編集 */}
              <div style={{
                position: 'sticky', left: 0, zIndex: 2, background: stickyBg,
                padding: 10, borderBottom: `1px solid ${T().border}`, borderRight: `1px solid ${T().border}`,
                display: 'flex', flexDirection: 'column', gap: 4,
                cursor: isEditingAnn ? 'default' : 'pointer',
              }}
                onClick={() => { if (!isEditingAnn) startEditKr(annKr) }}>
                {isEditingAnn ? (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4, border: `1px solid ${T().addBtnBg}`, borderRadius: 6 }}>
                    <input autoFocus value={editForm.title}
                      onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="通期 KR タイトル" disabled={editSaving}
                      style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input value={editForm.current}
                        onChange={e => setEditForm(p => ({ ...p, current: e.target.value }))}
                        placeholder="現在" type="number" disabled={editSaving || annKr.aggregation_type !== 'manual'}
                        title={annKr.aggregation_type !== 'manual' ? '集計タイプが手動以外なので子から自動計算されます' : ''}
                        style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none', opacity: annKr.aggregation_type !== 'manual' ? 0.5 : 1 }} />
                      <span style={{ alignSelf: 'center', fontSize: 11, color: T().textMuted }}>/</span>
                      <input value={editForm.target}
                        onChange={e => setEditForm(p => ({ ...p, target: e.target.value }))}
                        placeholder="目標" type="number" disabled={editSaving}
                        style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                      <input value={editForm.unit}
                        onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}
                        placeholder="単位" disabled={editSaving}
                        style={{ width: 44, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                    </div>
                    <input value={editForm.owner}
                      onChange={e => setEditForm(p => ({ ...p, owner: e.target.value }))}
                      placeholder="担当者 (任意)" disabled={editSaving}
                      style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => deleteKr(annKr)} disabled={editSaving}
                        style={{ fontSize: 10, padding: '4px 6px', borderRadius: 4, border: `1px solid #ff6b6b40`, background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontFamily: 'inherit' }}>
                        削除
                      </button>
                      <div style={{ flex: 1 }} />
                      <button onClick={cancelEditKr} disabled={editSaving}
                        style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: `1px solid ${T().border}`, background: 'transparent', color: T().textSub, cursor: 'pointer', fontFamily: 'inherit' }}>
                        キャンセル
                      </button>
                      <button onClick={commitEditKr} disabled={editSaving}
                        style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 4, border: 'none', background: T().addBtnBg, color: '#fff', cursor: editSaving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                        {editSaving ? '保存中…' : '✓ 保存'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: `${kr_r.color}18`, color: kr_r.color, fontWeight: 700, flexShrink: 0 }}>{kr_r.label}</span>
                  {aggLabel && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textMuted, fontWeight: 700, flexShrink: 0 }}>{aggLabel}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: T().text, flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }} title={annKr.title}>{annKr.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: kr_r.color, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 11, color: kr_r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{kp}%</span>
                </div>
                <div style={{ fontSize: 10, color: T().textMuted, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {annKr.owner && <Avatar name={annKr.owner} avatarUrl={members.find(m=>m.name===annKr.owner)?.avatar_url} size={14} />}
                  <span style={{ flex: 1 }}>{aggregatedCurrent.toLocaleString()} / {target.toLocaleString()} {annKr.unit || ''}</span>
                </div>
                <div style={{ marginTop: 2 }} onClick={e => e.stopPropagation()}>
                  <KASection krId={annKr.id} objectiveId={ann.id} levelId={ann.level_id} theme={makeKATheme(T())} />
                </div>
                  </>
                )}
              </div>
              {/* Q1〜Q4 セル */}
              {Q_KEYS.map(qKey => {
                const cells = childrenByQ[qKey] || []
                const cellKey = `parent_${annKr.id}_${qKey}`
                const isDragOver = dragOverCell === cellKey
                return (
                  <div key={qKey}
                    onDragOver={e => onCellDragOver(e, cellKey)}
                    onDragLeave={() => onCellDragLeave(cellKey)}
                    onDrop={e => onCellDrop(e, annKr.id)}
                    style={{
                      padding: 8, borderBottom: `1px solid ${T().border}`,
                      borderRight: qKey !== 'q4' ? `1px solid ${T().border}` : 'none',
                      display: 'flex', flexDirection: 'column', gap: 5,
                      background: isDragOver ? `${T().addBtnBg}1a` : 'transparent',
                      outline: isDragOver ? `2px dashed ${T().addBtnBg}` : 'none',
                      outlineOffset: -2,
                      transition: 'background 0.1s',
                  }}>
                    {cells.length === 0 ? (
                      addingCell && Number(addingCell.annKrId) === Number(annKr.id) && addingCell.qKey === qKey ? (
                        // 空セル → 追加フォーム (インライン)
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: cellBg, borderRadius: 6, padding: 6, border: `1px solid ${T().addBtnBg}` }}>
                          <input
                            autoFocus
                            value={addForm.title}
                            onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))}
                            placeholder="KR タイトル"
                            disabled={addSaving}
                            style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              value={addForm.target}
                              onChange={e => setAddForm(p => ({ ...p, target: e.target.value }))}
                              placeholder="目標値"
                              type="number"
                              disabled={addSaving}
                              style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                            <input
                              value={addForm.unit}
                              onChange={e => setAddForm(p => ({ ...p, unit: e.target.value }))}
                              placeholder="単位"
                              disabled={addSaving}
                              style={{ width: 50, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                          </div>
                          <input
                            value={addForm.owner}
                            onChange={e => setAddForm(p => ({ ...p, owner: e.target.value }))}
                            placeholder="担当者 (任意)"
                            disabled={addSaving}
                            style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={cancelAddInCell} disabled={addSaving}
                              style={{ flex: 1, fontSize: 10, padding: '4px 6px', borderRadius: 4, border: `1px solid ${T().border}`, background: 'transparent', color: T().textSub, cursor: 'pointer', fontFamily: 'inherit' }}>
                              ✕ キャンセル
                            </button>
                            <button onClick={commitAddInCell} disabled={addSaving}
                              style={{ flex: 1, fontSize: 10, fontWeight: 700, padding: '4px 6px', borderRadius: 4, border: 'none', background: T().addBtnBg, color: '#fff', cursor: addSaving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                              {addSaving ? '保存中…' : '✓ 追加'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        // 通常の空セル: クリックで追加モード
                        <button
                          onClick={() => startAddInCell(annKr, qKey)}
                          title={`${Q_LABELS[qKey]} の KR を追加 (この通期 KR に紐付け)`}
                          style={{
                            fontSize: 11, fontWeight: 700,
                            color: T().addBtnBg,
                            textAlign: 'center', padding: '14px 6px',
                            border: `1px dashed ${T().addBtnBg}`,
                            borderRadius: 6,
                            background: isDragOver ? `${T().addBtnBg}26` : `${T().addBtnBg}0d`,
                            cursor: 'pointer',
                            fontFamily: 'inherit', width: '100%',
                            transition: 'background 0.15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${T().addBtnBg}1a` }}
                          onMouseLeave={e => { e.currentTarget.style.background = isDragOver ? `${T().addBtnBg}26` : `${T().addBtnBg}0d` }}
                        >
                          {isDragOver ? '↓ ここに紐付け' : (
                            <>
                              <span style={{ fontSize: 13 }}>＋</span>
                              <span>{Q_LABELS[qKey]} KR を追加</span>
                            </>
                          )}
                        </button>
                      )
                    ) : cells.map(qkr => {
                      const qkp = qkr.target > 0
                        ? Math.round((qkr.lower_is_better ? Math.max(0, ((qkr.target * 2 - qkr.current) / qkr.target) * 100) : (qkr.current / qkr.target) * 100))
                        : 0
                      const qkr_r = getRating(qkp)
                      const isEditing = Number(editingKrId) === Number(qkr.id)
                      if (isEditing) {
                        return (
                          <div key={qkr.id} style={{ background: cellBg, borderRadius: 6, padding: 6, border: `1px solid ${T().addBtnBg}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input autoFocus value={editForm.title}
                              onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                              placeholder="KR タイトル" disabled={editSaving}
                              style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input value={editForm.current}
                                onChange={e => setEditForm(p => ({ ...p, current: e.target.value }))}
                                placeholder="現在" type="number" disabled={editSaving}
                                style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                              <span style={{ alignSelf: 'center', fontSize: 11, color: T().textMuted }}>/</span>
                              <input value={editForm.target}
                                onChange={e => setEditForm(p => ({ ...p, target: e.target.value }))}
                                placeholder="目標" type="number" disabled={editSaving}
                                style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                              <input value={editForm.unit}
                                onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}
                                placeholder="単位" disabled={editSaving}
                                style={{ width: 44, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                            </div>
                            <input value={editForm.owner}
                              onChange={e => setEditForm(p => ({ ...p, owner: e.target.value }))}
                              placeholder="担当者 (任意)" disabled={editSaving}
                              style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => deleteKr(qkr)} disabled={editSaving}
                                style={{ fontSize: 10, padding: '4px 6px', borderRadius: 4, border: `1px solid ${T().btnDelBorder || '#ff6b6b40'}`, background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontFamily: 'inherit' }}>
                                削除
                              </button>
                              <div style={{ flex: 1 }} />
                              <button onClick={cancelEditKr} disabled={editSaving}
                                style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: `1px solid ${T().border}`, background: 'transparent', color: T().textSub, cursor: 'pointer', fontFamily: 'inherit' }}>
                                キャンセル
                              </button>
                              <button onClick={commitEditKr} disabled={editSaving}
                                style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 4, border: 'none', background: T().addBtnBg, color: '#fff', cursor: editSaving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                                {editSaving ? '保存中…' : '✓ 保存'}
                              </button>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={qkr.id}
                          draggable
                          onDragStart={e => onKRDragStart(e, qkr.id)}
                          title="クリックで編集 / ドラッグで他の通期 KR の行に移動"
                          onClick={() => startEditKr(qkr)}
                          style={{ background: cellBg, borderRadius: 6, padding: '5px 7px', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: T().textFaint, flexShrink: 0, cursor: 'grab' }}
                              onMouseDown={e => e.stopPropagation()}>⋮⋮</span>
                            <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 99, background: `${qkr_r.color}18`, color: qkr_r.color, fontWeight: 700, flexShrink: 0 }}>{qkr_r.label}</span>
                            <span style={{ fontSize: 10, color: T().textSub, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={qkr.title}>{qkr.title}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ flex: 1, height: 3, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(qkp, 100)}%`, background: qkr_r.color, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 9, color: qkr_r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{qkr.current?.toLocaleString()}/{qkr.target?.toLocaleString()}{qkr.unit}</span>
                          </div>
                          <div style={{ marginTop: 3 }} onClick={e => e.stopPropagation()}>
                            <KASection krId={qkr.id} objectiveId={qkr._qObjId} levelId={qkr._qObjLevelId} theme={makeKATheme(T())} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </Fragment>
          )
        })}

        {/* ─── 未紐付け Q 期 KR (parent_kr_id が NULL のもの) ─────── */}
        {hasUnmapped && (
          <Fragment>
            <div style={{
              position: 'sticky', left: 0, zIndex: 2, background: stickyBg,
              padding: 10, borderRight: `1px solid ${T().border}`,
              fontSize: 10, color: T().textMuted, fontWeight: 700, fontStyle: 'italic',
            }}>
              {noAnnualMode ? (
                <Fragment>
                  Q期 KR
                  <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, color: T().textFaint }}>
                    通期 KR を追加すると行で並びます
                  </div>
                </Fragment>
              ) : (
                <Fragment>
                  ⚠️ 未紐付け Q 期 KR
                  <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2, color: T().textFaint }}>
                    編集して通期 KR に紐付けてください
                  </div>
                </Fragment>
              )}
            </div>
            {Q_KEYS.map(qKey => {
              const cells = qKRsUnmapped[qKey] || []
              const cellKey = `unmapped_${qKey}`
              const isDragOver = dragOverCell === cellKey
              return (
                <div key={qKey}
                  onDragOver={e => onCellDragOver(e, cellKey)}
                  onDragLeave={() => onCellDragLeave(cellKey)}
                  onDrop={e => onCellDrop(e, null)}
                  style={{
                    padding: 8,
                    borderRight: qKey !== 'q4' ? `1px solid ${T().border}` : 'none',
                    display: 'flex', flexDirection: 'column', gap: 5,
                    background: isDragOver ? `${T().textFaint}1a` : 'transparent',
                    outline: isDragOver ? `2px dashed ${T().textFaint}` : 'none',
                    outlineOffset: -2,
                    transition: 'background 0.1s',
                }}>
                  {cells.length === 0 ? (
                    <div style={{ fontSize: 10, color: T().textFaintest, textAlign: 'center', padding: '8px 4px', fontStyle: 'italic' }}>{isDragOver ? '↓ 紐付けを外す' : '—'}</div>
                  ) : cells.map(qkr => {
                    const qkp = qkr.target > 0
                      ? Math.round((qkr.lower_is_better ? Math.max(0, ((qkr.target * 2 - qkr.current) / qkr.target) * 100) : (qkr.current / qkr.target) * 100))
                      : 0
                    const qkr_r = getRating(qkp)
                    // 旧データ (通期 KR が無い) ときは KASection 含めてフル表示。
                    // 既に通期 KR がある (新運用) の場合はコンパクトに「未紐付け」表示。
                    return noAnnualMode ? (
                      <div key={qkr.id}
                        draggable
                        onDragStart={e => onKRDragStart(e, qkr.id)}
                        title="ドラッグして通期 KR の行に紐付け"
                        style={{ background: cellBg, borderRadius: 6, padding: '5px 7px', cursor: 'grab' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: T().textFaint, flexShrink: 0, cursor: 'grab' }}>⋮⋮</span>
                          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 99, background: `${qkr_r.color}18`, color: qkr_r.color, fontWeight: 700, flexShrink: 0 }}>{qkr_r.label}</span>
                          <span style={{ fontSize: 10, color: T().textSub, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={qkr.title}>{qkr.title}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ flex: 1, height: 3, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(qkp, 100)}%`, background: qkr_r.color, borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 9, color: qkr_r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{qkr.current?.toLocaleString()}/{qkr.target?.toLocaleString()}{qkr.unit}</span>
                        </div>
                        <div style={{ marginTop: 3 }}>
                          <KASection krId={qkr.id} objectiveId={qkr._qObjId} levelId={qkr._qObjLevelId} theme={makeKATheme(T())} />
                        </div>
                      </div>
                    ) : (
                      <div key={qkr.id}
                        draggable
                        onDragStart={e => onKRDragStart(e, qkr.id)}
                        title="ドラッグして通期 KR の行に紐付け"
                        style={{ background: cellBg, borderRadius: 6, padding: '5px 7px', borderLeft: `2px solid ${T().textFaint}`, cursor: 'grab' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, color: T().textFaint, flexShrink: 0, cursor: 'grab' }}>⋮⋮</span>
                          <span style={{ fontSize: 10, color: T().textSub, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={qkr.title}>{qkr.title}</span>
                          <span style={{ fontSize: 9, color: qkr_r.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{qkr.current?.toLocaleString()}/{qkr.target?.toLocaleString()}{qkr.unit}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </Fragment>
        )}
      </div>
      </div>
    </div>
  )
}

// ─── 自動紐付けダイアログ ───────────────────────────────
// 未紐付け Q 期 KR と通期 KR をタイトル類似度 (bigram Sørensen-Dice) で
// マッチングして提案。ユーザーが選択を確認・調整 → 一括 update。
function bigramSet(s) {
  const out = new Set()
  const t = (s || '').toLowerCase().replace(/\s+/g, '')
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}
function titleSimilarity(a, b) {
  const ba = bigramSet(a), bb = bigramSet(b)
  if (ba.size === 0 || bb.size === 0) return 0
  let common = 0
  for (const t of ba) if (bb.has(t)) common++
  return (2 * common) / (ba.size + bb.size)
}

function AutoLinkDialog({ T, annualKRs, unmapped, onCancel, onApply }) {
  // 未紐付け Q 期 KR を flat list 化
  const flatUnmapped = []
  Q_KEYS.forEach(qKey => {
    ;(unmapped[qKey] || []).forEach(qkr => flatUnmapped.push({ ...qkr, _qKey: qKey }))
  })

  // 各 unmapped KR に対して候補スコアを計算 (上位 3 件)
  const initialChoices = {}
  flatUnmapped.forEach(qkr => {
    const scored = annualKRs.map(annKr => ({
      annKr, score: titleSimilarity(qkr.title, annKr.title),
    })).sort((a, b) => b.score - a.score)
    const top = scored[0]
    // スコア 0.4 以上を初期選択 (それ未満は手動で選んでもらう)
    initialChoices[qkr.id] = top && top.score >= 0.4 ? top.annKr.id : ''
  })
  const [choices, setChoices] = useState(initialChoices)
  const [busy, setBusy] = useState(false)

  const selectedCount = Object.values(choices).filter(v => v).length

  const handleApply = async () => {
    setBusy(true)
    const selections = Object.entries(choices)
      .filter(([_, parentId]) => !!parentId)
      .map(([qkrId, parentId]) => ({ qkrId: Number(qkrId), parentId: Number(parentId) }))
    await onApply(selections)
    setBusy(false)
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
  const dialogStyle = {
    background: T().bgCard, borderRadius: 14, maxWidth: 800, width: '100%',
    maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
  }

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {/* ヘッダ */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T().border}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T().text, marginBottom: 4 }}>🔗 通期 KR への自動紐付け候補</div>
          <div style={{ fontSize: 11, color: T().textMuted }}>
            タイトルの類似度から候補を提案。選択を確認・修正して「適用」してください。
          </div>
        </div>
        {/* リスト */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {flatUnmapped.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: T().textMuted, fontSize: 13 }}>未紐付けの Q 期 KR はありません</div>
          ) : flatUnmapped.map(qkr => {
            const scored = annualKRs.map(annKr => ({
              annKr, score: titleSimilarity(qkr.title, annKr.title),
            })).sort((a, b) => b.score - a.score)
            const choice = choices[qkr.id] || ''
            const topScore = scored[0]?.score || 0
            return (
              <div key={qkr.id} style={{
                marginBottom: 10, padding: '10px 12px',
                background: choice ? `${T().addBtnBg}0a` : T().bgKr,
                border: `1px solid ${choice ? T().addBtnBg + '40' : T().border}`,
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: `${Q_COLORS[qkr._qKey]}18`, color: Q_COLORS[qkr._qKey], fontWeight: 700 }}>{Q_LABELS[qkr._qKey]}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T().text, flex: 1 }}>{qkr.title}</span>
                  <span style={{ fontSize: 10, color: T().textMuted }}>{qkr.current?.toLocaleString()}/{qkr.target?.toLocaleString()}{qkr.unit}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: T().textMuted, flexShrink: 0 }}>↗ 紐付け先 通期 KR:</span>
                  <select value={choice} onChange={e => setChoices(p => ({ ...p, [qkr.id]: e.target.value }))}
                    style={{ flex: 1, background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, color: T().text, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                    <option value="">(紐付けない)</option>
                    {scored.map(({ annKr, score }) => (
                      <option key={annKr.id} value={annKr.id}>
                        {Math.round(score * 100)}% — {annKr.title}
                      </option>
                    ))}
                  </select>
                  {topScore < 0.3 && !choice && (
                    <span style={{ fontSize: 10, color: T().textFaint, fontStyle: 'italic' }}>類似 KR なし</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {/* フッタ */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${T().border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: T().textMuted }}>{selectedCount} / {flatUnmapped.length} 件選択中</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} disabled={busy}
              style={{ background: 'transparent', border: `1px solid ${T().border}`, color: T().textSub, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              キャンセル
            </button>
            <button onClick={handleApply} disabled={busy || selectedCount === 0}
              style={{ background: T().addBtnBg, border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: busy || selectedCount === 0 ? 'wait' : 'pointer', opacity: selectedCount === 0 ? 0.5 : 1, fontFamily: 'inherit' }}>
              {busy ? '⟳ 適用中…' : `選択した ${selectedCount} 件を一括紐付け`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
