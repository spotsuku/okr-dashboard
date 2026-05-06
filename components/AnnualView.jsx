'use client'
import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { buildQuarterMap } from '../lib/objectiveMatching'
import { COMMON_TOKENS } from '../lib/themeTokens'
import KASection from './KASection'

// KASection に渡すテーマオブジェクト (AnnualView の THEMES を元に必要 key だけ抽出)
function makeKATheme(t) {
  return {
    accent:       t.btnEditColor || '#6B96C7',
    accentSolid:  t.addBtnBg     || '#6B96C7',
    text:         t.text,
    textSub:      t.textSub,
    textMuted:    t.textMuted,
    textFaint:    t.textFaint,
    textFaintest: t.textFaintest,
    bgCard:       t.bgCard,
    bgCard2:      t.bgKr,
    border:       t.border,
    borderMid:    t.borderDash,
    badgeBg:      t.btnEditColor || '#6B96C7',
    badgeBorder:  t.btnEditBorder || 'rgba(107,150,199,0.25)',
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
    btnEditBg: 'rgba(124,163,209,0.18)', btnEditBorder: 'rgba(124,163,209,0.32)', btnEditColor: '#7CA3D1',
    btnDelBg: 'rgba(237,156,160,0.16)', btnDelBorder: 'rgba(237,156,160,0.30)', btnDelColor: '#ED9CA0',
    tabActiveBg: 'rgba(255,255,255,0.05)',
    badgePeriodBg: 'rgba(255,255,255,0.06)',
    addBtnBg: '#7CA3D1',
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
    btnEditBg: 'rgba(107,150,199,0.12)', btnEditBorder: 'rgba(107,150,199,0.30)', btnEditColor: '#6B96C7',
    btnDelBg: 'rgba(232,155,155,0.12)', btnDelBorder: 'rgba(232,155,155,0.30)', btnDelColor: '#E89B9B',
    tabActiveBg: '#F2F2F7',
    badgePeriodBg: '#F2F2F7',
    addBtnBg: '#6B96C7',
    refBg: 'rgba(52,199,89,0.08)', refBorder: 'rgba(52,199,89,0.30)',
  },
}

let _theme = THEMES.dark
const T = () => _theme

// ─── helpers ────────────────────────────────────────────────────────────────
// 配色ポリシー: ミニマル (1色 + 未達赤の2色)
//   - 通常 (奇跡 / 変革 / 好調 / 順調 / 最低限): チャコール無彩色 (T.text)
//   - 未達のみ: 淡い赤 (T.danger)
// 進捗バー / バッジ / 数値テキストはこのポリシーに従う
const RATINGS = [
  { min: 120, label: '奇跡' },
  { min: 110, label: '変革' },
  { min: 100, label: '好調' },
  { min:  90, label: '順調' },
  { min:  80, label: '最低限' },
  { min:   0, label: '未達' },
]
const getRating = p => p == null ? null : (RATINGS.find(r => Math.min(p, 150) >= r.min) || RATINGS[RATINGS.length - 1])
// 未達 → 赤、それ以外 → チャコール (theme.text)
const tColor = (r) => {
  if (!r) return T().textFaint
  return r.label === '未達' ? T().danger : T().text
}

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
const AVATAR_COLORS = ['#4d9fff','#00d68f','#E89B9B','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
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

// レイヤー識別色は廃止 → 階層は文字バッジ (経営/事業部/チーム) のみで表現
const LAYER_COLORS = { 0: '#1a1a1a', 1: '#3a3a3c', 2: '#8e8e93' }
const Q_KEYS = ['q1', 'q2', 'q3', 'q4']
const Q_LABELS = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }
// Q期ごとの統一カラー (パステル質感)。進捗評価ではなく Q 期そのものの識別色
const Q_COLORS = {
  q1: '#94C4A8',  // pastel mint (春)
  q2: '#A5BDD4',  // pastel sky (夏)
  q3: '#D6B894',  // pastel sand (秋)
  q4: '#B8A5D1',  // pastel lavender (冬)
}

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

  // silent=true で呼ばれた場合は loading 状態を切り替えない (KR 保存後の裏再取得用)。
  // 全画面「読み込み中…」に切り替わると DOM が一旦空になり、スクロール位置が
  // 先頭に戻ってしまうため、保存系のフローからは silent で呼ぶ。
  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true)

    const annualKey = toPeriodKey('annual', fiscalYear)
    const { data: annObjs } = await supabase
      .from('objectives')
      .select('id,level_id,period,title,owner,parent_objective_id')
      .eq('period', annualKey)
      .order('level_id,id')
      .range(0, 49999)

    if (!annObjs?.length) { setAnnualObjs([]); setQuarterMap({}); setLoading(false); return }

    const annIds = annObjs.map(o => o.id)
    // 新カラム (parent_kr_id / aggregation_type / sort_order) を含めて SELECT。
    // SQL 未実行 (列なし) の環境でも壊れないよう、エラー時は段階的にフォールバックする。
    const annSelectFull   = 'id,objective_id,title,target,current,unit,lower_is_better,owner,parent_kr_id,aggregation_type,sort_order'
    const annSelectMid    = 'id,objective_id,title,target,current,unit,lower_is_better,owner,parent_kr_id,aggregation_type'
    const annSelectMin    = 'id,objective_id,title,target,current,unit,lower_is_better,owner'
    // Step 1: 全カラム + sort_order で order
    let annKRsRes = await supabase
      .from('key_results').select(annSelectFull).in('objective_id', annIds)
      .order('sort_order', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
      .range(0, 49999)
    // Step 2: sort_order が無ければ全カラムから sort_order を抜いて order なしで取得
    if (annKRsRes.error && /sort_order/i.test(annKRsRes.error.message || '')) {
      console.warn('[AnnualView] sort_order 列が無い環境のため抜いて再取得 (key_results に ALTER TABLE 推奨)')
      annKRsRes = await supabase
        .from('key_results').select(annSelectMid).in('objective_id', annIds).range(0, 49999)
    }
    // Step 3: parent_kr_id / aggregation_type も無ければ最小 SELECT
    if (annKRsRes.error && /parent_kr_id|aggregation_type|column/i.test(annKRsRes.error.message || '')) {
      console.warn('[AnnualView] parent_kr_id / aggregation_type 列が無い環境のため最小 SELECT で再取得 (SQL 未実行)')
      annKRsRes = await supabase
        .from('key_results').select(annSelectMin).in('objective_id', annIds).range(0, 49999)
    }
    if (annKRsRes.error) {
      console.error('[AnnualView] key_results 取得失敗:', annKRsRes.error)
    }
    const annKRs = annKRsRes.data || []
    // クライアント側で sort_order → id でソート (列が無い環境でも動作)
    annKRs.sort((a, b) => {
      const sa = a.sort_order ?? Number.MAX_SAFE_INTEGER
      const sb = b.sort_order ?? Number.MAX_SAFE_INTEGER
      if (sa !== sb) return sa - sb
      return (a.id || 0) - (b.id || 0)
    })

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
    // 同上: SQL 未実行環境向けの段階的フォールバック
    let qKRsRes = await supabase
      .from('key_results').select(annSelectFull).in('objective_id', qIds).range(0, 49999)
    if (qKRsRes.error && /sort_order/i.test(qKRsRes.error.message || '')) {
      qKRsRes = await supabase
        .from('key_results').select(annSelectMid).in('objective_id', qIds).range(0, 49999)
    }
    if (qKRsRes.error && /parent_kr_id|aggregation_type|column/i.test(qKRsRes.error.message || '')) {
      qKRsRes = await supabase
        .from('key_results').select(annSelectMin).in('objective_id', qIds).range(0, 49999)
    }
    if (qKRsRes.error) {
      console.error('[AnnualView] Q期 key_results 取得失敗:', qKRsRes.error)
    }
    const qKRs = qKRsRes.data || []
    // 通期 KR と同様にクライアント側で sort_order → id でソート (sort_order 列が
    // 無い環境でも動作)。これがないと並び替え後の順序が UI に反映されない。
    qKRs.sort((a, b) => {
      const sa = a.sort_order ?? Number.MAX_SAFE_INTEGER
      const sb = b.sort_order ?? Number.MAX_SAFE_INTEGER
      if (sa !== sb) return sa - sb
      return (a.id || 0) - (b.id || 0)
    })

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
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* コンパクト見出し: 縦幅を抑えて OKR 本体に画面を譲る */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 6px', marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: T().text, margin: 0, letterSpacing: '-0.01em' }}>📊 年間ブレイクダウン</h1>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textSub }}>
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
            background: T().bgCard,
            border: `1px solid ${T().border}`,
            borderRadius: 18, overflow: 'hidden',
            position: 'relative',
            boxShadow: isOpen
              ? '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)'
              : '0 1px 2px rgba(0,0,0,0.03)',
            transition: 'all 0.25s ease',
          }}>

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
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textSub, fontWeight: 700 }}>{levelIcon} {levelName}</span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textMuted, fontWeight: 700 }}>通期</span>
                  {r && (() => { const rc = tColor(r); return <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: `${rc}1a`, color: rc, fontWeight: 800 }}>{r.label}</span> })()}
                  {/* 区切り */}
                  <span style={{ width: 1, height: 14, background: T().border, margin: '0 2px' }} />
                  {Q_KEYS.map(qKey => {
                    const qObjs = qData[qKey]
                    const qProg = qObjs.length ? Math.round(qObjs.reduce((s, o) => s + calcObjProgress(o.key_results), 0) / qObjs.length) : null
                    const qr = qProg != null ? getRating(qProg) : null
                    const qc = qr ? tColor(qr) : T().textFaintest
                    return (
                      <span key={qKey} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 700,
                        background: qr ? `${qc}12` : 'rgba(0,0,0,0.04)',
                        color: qc,
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
                <div style={{ fontSize: 28, fontWeight: 900, color: tColor(r), letterSpacing: '-0.02em', lineHeight: 1 }}>{ann.key_results.length ? `${prog}%` : '−'}</div>
                {ann.owner && (
                  <div style={{ fontSize: 10, color: T().textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Avatar name={ann.owner} avatarUrl={members.find(m=>m.name===ann.owner)?.avatar_url} size={16} />
                    <span style={{ fontWeight: 600 }}>{ann.owner}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                  {onEdit && <button onClick={e => { e.stopPropagation(); onEdit(ann) }} style={{ background: T().btnEditBg, border: 'none', color: T().btnEditColor, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>編集</button>}
                  {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(ann.id) }} style={{ background: T().btnDelBg, border: 'none', color: T().btnDelColor, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>削除</button>}
                  <div style={{ fontSize: 16, color: isOpen ? T().text : T().textFaint, transition: 'transform 0.25s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</div>
                </div>
              </div>
            </div>

            {/* 展開: マトリクス表示 (通期KR 行 × Q1〜Q4 列, 左列固定 + 右側横スクロール) */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T().border}`, background: T().bgExpanded, padding: '14px 16px' }}>
                <MatrixView
                  T={T} ann={ann} qData={qData} members={members}
                  onEdit={onEdit} onDelete={onDelete} handleAddQ={handleAddQ}
                  onDataChanged={() => loadAll(true)}
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

// ─── 担当者セレクタ (アイコン + 氏名表示 + メンバー一覧から選択) ─
function OwnerSelect({ value, onChange, members, T, disabled }) {
  const m = (members || []).find(x => x.name === value)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 6px',
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.bgCard,
      opacity: disabled ? 0.5 : 1,
    }}>
      {m ? <Avatar name={m.name} avatarUrl={m.avatar_url} size={16} />
         : <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }} />}
      <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}
        style={{
          flex: 1, minWidth: 0, fontSize: 11, padding: '2px 0',
          border: 'none', background: 'transparent', color: T.text,
          fontFamily: 'inherit', outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          appearance: 'none', WebkitAppearance: 'none',
        }}>
        <option value="">担当者なし</option>
        {(members || []).map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
      </select>
      <span style={{ fontSize: 9, color: T.textFaint, flexShrink: 0 }}>▾</span>
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

  // 通期 KR のドラッグ&ドロップ並び替え
  // 状態: 何を掴んで / どこにドロップしようとしているか / 上下どちらに挿入か
  const [draggedAnnKrId, setDraggedAnnKrId] = useState(null)
  const [dragOverAnnKrId, setDragOverAnnKrId] = useState(null)
  const [dragOverPos, setDragOverPos] = useState(null)  // 'before' | 'after'
  // Q 期 KR を同一セル内で並び替えるためのオーバーレイ状態
  const [dragOverQKrId, setDragOverQKrId] = useState(null)
  const [dragOverQKrPos, setDragOverQKrPos] = useState(null)  // 'before' | 'after'

  function onAnnRowDragStart(e, annKrId) {
    e.dataTransfer.setData('application/ann-row-id', String(annKrId))
    e.dataTransfer.effectAllowed = 'move'
    setDraggedAnnKrId(annKrId)
  }
  function onAnnRowDragEnd() {
    setDraggedAnnKrId(null)
    setDragOverAnnKrId(null)
    setDragOverPos(null)
  }
  function onAnnRowDragOver(e, annKrId) {
    if (draggedAnnKrId == null || draggedAnnKrId === annKrId) return
    const types = e.dataTransfer?.types
    if (!types || !Array.from(types).includes('application/ann-row-id')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
    if (annKrId !== dragOverAnnKrId || pos !== dragOverPos) {
      setDragOverAnnKrId(annKrId); setDragOverPos(pos)
    }
  }
  function onAnnRowDragLeave(annKrId) {
    if (dragOverAnnKrId === annKrId) {
      setDragOverAnnKrId(null); setDragOverPos(null)
    }
  }
  async function onAnnRowDrop(e, targetId) {
    const draggedIdStr = e.dataTransfer?.getData('application/ann-row-id')
    if (!draggedIdStr) return
    e.preventDefault()
    const draggedId = Number(draggedIdStr)
    const pos = dragOverPos
    onAnnRowDragEnd()
    if (draggedId === Number(targetId)) return
    // 新しい並び順を計算
    const list = [...annualKRs]
    const fromIdx = list.findIndex(k => Number(k.id) === draggedId)
    if (fromIdx < 0) return
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex(k => Number(k.id) === Number(targetId))
    if (insertIdx < 0) return
    if (pos === 'after') insertIdx++
    list.splice(insertIdx, 0, moved)
    // 0..N で sort_order を再割り当て (差分のみ更新)
    const updates = list.map((k, i) => {
      if (k.sort_order === i) return null
      return supabase.from('key_results').update({ sort_order: i }).eq('id', k.id)
    }).filter(Boolean)
    const results = await Promise.all(updates)
    const errored = results.find(r => r?.error)
    if (errored) {
      if (/sort_order/i.test(errored.error.message || '')) {
        alert('並び替えには key_results.sort_order 列が必要です。\n以下を Supabase で実行してください:\n\nALTER TABLE key_results ADD COLUMN sort_order INT DEFAULT 0;')
      } else {
        alert('並び替え失敗: ' + (errored.error.message || ''))
      }
      return
    }
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

  // Q 期 KR カード上にドラッグした時の並び替え検知 (同一セル内の siblings 限定)
  function onQKrDragOver(e, targetId) {
    const types = e.dataTransfer?.types
    if (!types || !Array.from(types).includes('application/kr-id')) return
    e.preventDefault()
    e.stopPropagation()  // 親 cell の dragOver を抑止 (セル全体の枠線が出ないように)
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
    if (targetId !== dragOverQKrId || pos !== dragOverQKrPos) {
      setDragOverQKrId(targetId); setDragOverQKrPos(pos)
    }
  }
  function onQKrDragLeave(targetId) {
    if (dragOverQKrId === targetId) {
      setDragOverQKrId(null); setDragOverQKrPos(null)
    }
  }
  // siblings 配列 (同じ parent + 同じ Q) を渡し、その中で sort_order を再採番
  async function onQKrDrop(e, targetQkr, siblings) {
    const draggedIdStr = e.dataTransfer?.getData('application/kr-id')
    if (!draggedIdStr) return
    e.preventDefault()
    e.stopPropagation()
    const draggedId = Number(draggedIdStr)
    const pos = dragOverQKrPos
    setDragOverQKrId(null); setDragOverQKrPos(null)
    if (draggedId === Number(targetQkr.id)) return

    // dragged が同一セルの sibling かどうかで分岐
    const fromIdx = (siblings || []).findIndex(k => Number(k.id) === draggedId)
    if (fromIdx < 0) {
      // 別セルから来た → 親と Q 期を targetQkr に揃える (= parent_kr_id 変更 + objective_id 変更)
      const targetParent = targetQkr.parent_kr_id ?? null
      await supabase.from('key_results').update({
        parent_kr_id: targetParent,
        objective_id: targetQkr.objective_id,
      }).eq('id', draggedId)
      if (onDataChanged) await onDataChanged()
      return
    }
    // 同一セル内の並び替え
    const list = [...siblings]
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex(k => Number(k.id) === Number(targetQkr.id))
    if (pos === 'after') insertIdx++
    list.splice(insertIdx, 0, moved)
    const updates = list.map((k, i) => {
      if (k.sort_order === i) return null
      return supabase.from('key_results').update({ sort_order: i }).eq('id', k.id)
    }).filter(Boolean)
    const results = await Promise.all(updates)
    const errored = results.find(r => r?.error)
    if (errored) {
      if (/sort_order/i.test(errored.error.message || '')) {
        alert('並び替えには key_results.sort_order 列が必要です。\n以下を Supabase で実行してください:\n\nALTER TABLE key_results ADD COLUMN sort_order INT DEFAULT 0;')
      } else {
        alert('並び替え失敗: ' + (errored.error.message || ''))
      }
      return
    }
    if (onDataChanged) await onDataChanged()
  }

  // CSS スティッキ用の色: 横スクロール時に右側の Q セルが透けないよう
  // 必ず不透明色 (bgCard = #FFFFFF / #1C1C1E) を使う。
  const stickyBg = T().bgCard
  // KR セル: 視認性を最優先 (KRはこのページで一番重要な情報)
  // 透けた灰背景ではなく、白カード + 影 + Q カラーの左アクセントで「カード感」を出す
  const cellBg = T().bgCard

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
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textSub }}>
              通期 KR {annualKRs.length}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textMuted }}>
              紐付け済 Q期 KR {mappedTotal}
            </span>
            {unmappedTotal > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: `${T().danger}14`, color: T().danger }}>
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
          // accent は Q 期そのものの識別色を常に使う (進捗による変色は廃止 — 統一感を優先)
          const accent = Q_COLORS[qKey]
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
                <span style={{ fontSize: 12, fontWeight: 800, color: T().text }}>{Q_LABELS[qKey]}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: qr ? tColor(qr) : T().textFaint }}>{qProg != null ? `${qProg}%` : (qObjs.length ? '計画中' : '未設定')}</span>
              </div>
              {qObjs.length > 0 ? qObjs.map(qObj => (
                <div key={qObj.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: T().text, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={qObj.title}>{qObj.title}</span>
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
        {annualKRs.map((annKr, krIdx) => {
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
              {/* 左列: 通期 KR (sticky) — クリックで編集 / ドラッグで並び替え */}
              <div style={{
                position: 'sticky', left: 0, zIndex: 2, background: stickyBg,
                padding: 10, borderBottom: `1px solid ${T().border}`, borderRight: `1px solid ${T().border}`,
                display: 'flex', flexDirection: 'column', gap: 4,
                cursor: isEditingAnn ? 'default' : 'pointer',
                opacity: draggedAnnKrId === annKr.id ? 0.4 : 1,
                // ドロップ位置のラインインジケータ (上 or 下に色付きバー)
                boxShadow: dragOverAnnKrId === annKr.id
                  ? (dragOverPos === 'before'
                      ? `inset 0 3px 0 0 ${T().addBtnBg}`
                      : `inset 0 -3px 0 0 ${T().addBtnBg}`)
                  : 'none',
                transition: 'opacity 0.1s',
              }}
                onClick={() => { if (!isEditingAnn) startEditKr(annKr) }}
                onDragOver={e => onAnnRowDragOver(e, annKr.id)}
                onDragLeave={() => onAnnRowDragLeave(annKr.id)}
                onDrop={e => onAnnRowDrop(e, annKr.id)}>
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
                    <OwnerSelect value={editForm.owner} onChange={v => setEditForm(p => ({ ...p, owner: v }))}
                      members={members} T={T()} disabled={editSaving} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => deleteKr(annKr)} disabled={editSaving}
                        style={{ fontSize: 10, padding: '4px 6px', borderRadius: 4, border: `1px solid rgba(232,155,155,0.30)`, background: 'transparent', color: '#E89B9B', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                  {/* ドラッグハンドル: ここをつかんで上下にドロップで並び替え */}
                  <span
                    draggable
                    onDragStart={e => { e.stopPropagation(); onAnnRowDragStart(e, annKr.id) }}
                    onDragEnd={onAnnRowDragEnd}
                    onClick={e => e.stopPropagation()}
                    title="ドラッグで並び替え"
                    style={{ fontSize: 11, color: T().textFaint, flexShrink: 0, cursor: 'grab', userSelect: 'none', padding: '0 2px' }}>⋮⋮</span>
                  {(() => { const krc = tColor(kr_r); return <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: `${krc}14`, color: krc, fontWeight: 700, flexShrink: 0 }}>{kr_r.label}</span> })()}
                  {aggLabel && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: 'rgba(0,0,0,0.05)', color: T().textMuted, fontWeight: 700, flexShrink: 0 }}>{aggLabel}</span>}
                  <span style={{ fontSize: 13, fontWeight: 800, color: T().text, flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, letterSpacing: '-0.01em' }} title={annKr.title}>{annKr.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(kp, 100)}%`, background: tColor(kr_r), borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 11, color: tColor(kr_r), fontWeight: 700, whiteSpace: 'nowrap' }}>{kp}%</span>
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
                          <OwnerSelect value={addForm.owner} onChange={v => setAddForm(p => ({ ...p, owner: v }))}
                            members={members} T={T()} disabled={addSaving} />
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
                      const qkrc = tColor(qkr_r)
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
                            <OwnerSelect value={editForm.owner} onChange={v => setEditForm(p => ({ ...p, owner: v }))}
                              members={members} T={T()} disabled={editSaving} />
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => deleteKr(qkr)} disabled={editSaving}
                                style={{ fontSize: 10, padding: '4px 6px', borderRadius: 4, border: `1px solid ${T().btnDelBorder || 'rgba(232,155,155,0.30)'}`, background: 'transparent', color: '#E89B9B', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                      const isDragOverThisQKr = Number(dragOverQKrId) === Number(qkr.id)
                      return (
                        <div key={qkr.id}
                          draggable
                          onDragStart={e => onKRDragStart(e, qkr.id)}
                          onDragOver={e => onQKrDragOver(e, qkr.id)}
                          onDragLeave={() => onQKrDragLeave(qkr.id)}
                          onDrop={e => onQKrDrop(e, qkr, cells)}
                          title="クリックで編集 / ドラッグで上下に並び替え (他の行へドロップで紐付け変更)"
                          onClick={() => startEditKr(qkr)}
                          style={{
                            background: cellBg,
                            borderRadius: 10,
                            padding: '8px 10px',
                            cursor: 'pointer',
                            border: `1px solid ${qkrc}20`,
                            boxShadow: isDragOverThisQKr
                              ? (dragOverQKrPos === 'before'
                                  ? `inset 0 3px 0 0 ${T().addBtnBg}, 0 1px 2px rgba(0,0,0,0.04)`
                                  : `inset 0 -3px 0 0 ${T().addBtnBg}, 0 1px 2px rgba(0,0,0,0.04)`)
                              : `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px ${qkrc}14`,
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                            <span style={{ fontSize: 11, color: T().textFaint, flexShrink: 0, cursor: 'grab' }}
                              onMouseDown={e => e.stopPropagation()}>⋮⋮</span>
                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: `${qkrc}22`, color: qkrc, fontWeight: 800, flexShrink: 0 }}>{qkr_r.label}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T().text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }} title={qkr.title}>{qkr.title}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 4, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(qkp, 100)}%`, background: qkrc, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 10, color: qkrc, fontWeight: 800, whiteSpace: 'nowrap' }}>{qkr.current?.toLocaleString()}/{qkr.target?.toLocaleString()}{qkr.unit}</span>
                          </div>
                          {qkr.owner && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, color: T().textMuted }}>
                              <Avatar name={qkr.owner} avatarUrl={members.find(m => m.name === qkr.owner)?.avatar_url} size={14} />
                              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qkr.owner}</span>
                            </div>
                          )}
                          <div style={{ marginTop: 3 }} onClick={e => e.stopPropagation()}>
                            <KASection krId={qkr.id} objectiveId={qkr._qObjId} levelId={qkr._qObjLevelId} theme={makeKATheme(T())} />
                          </div>
                        </div>
                      )
                    })}
                    {/* 既存 KR の有無に関わらず「追加ボタン / インラインフォーム」を表示 */}
                    {cells.length > 0 && (
                      addingCell && Number(addingCell.annKrId) === Number(annKr.id) && addingCell.qKey === qKey ? (
                        // 追加フォーム (既存 KR の下にインライン展開)
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: cellBg, borderRadius: 6, padding: 6, border: `1px solid ${T().addBtnBg}`, marginTop: 4 }}>
                          <input autoFocus value={addForm.title}
                            onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))}
                            placeholder="KR タイトル" disabled={addSaving}
                            style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input value={addForm.target}
                              onChange={e => setAddForm(p => ({ ...p, target: e.target.value }))}
                              placeholder="目標値" type="number" disabled={addSaving}
                              style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                            <input value={addForm.unit}
                              onChange={e => setAddForm(p => ({ ...p, unit: e.target.value }))}
                              placeholder="単位" disabled={addSaving}
                              style={{ width: 50, fontSize: 11, padding: '4px 6px', border: `1px solid ${T().border}`, borderRadius: 4, fontFamily: 'inherit', color: T().text, background: T().bgCard, outline: 'none' }} />
                          </div>
                          <OwnerSelect value={addForm.owner} onChange={v => setAddForm(p => ({ ...p, owner: v }))}
                            members={members} T={T()} disabled={addSaving} />
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
                        // 既存 KR の下に小さい追加ボタン
                        <button
                          onClick={() => startAddInCell(annKr, qKey)}
                          title={`${Q_LABELS[qKey]} にもう1つ KR を追加`}
                          style={{
                            fontSize: 10, fontWeight: 700,
                            color: T().addBtnBg,
                            textAlign: 'center', padding: '6px',
                            border: `1px dashed ${T().addBtnBg}80`,
                            borderRadius: 6,
                            background: 'transparent', cursor: 'pointer',
                            fontFamily: 'inherit', width: '100%',
                            marginTop: 4,
                            transition: 'background 0.15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${T().addBtnBg}10` }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{ fontSize: 12 }}>＋</span>
                          <span>もう1つ追加</span>
                        </button>
                      )
                    )}
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
                    const qkrc = tColor(qkr_r)
                    // 旧データ (通期 KR が無い) ときは KASection 含めてフル表示。
                    // 既に通期 KR がある (新運用) の場合はコンパクトに「未紐付け」表示。
                    return noAnnualMode ? (
                      <div key={qkr.id}
                        draggable
                        onDragStart={e => onKRDragStart(e, qkr.id)}
                        title="ドラッグして通期 KR の行に紐付け"
                        style={{
                          background: cellBg,
                          borderRadius: 10,
                          padding: '8px 10px',
                          cursor: 'grab',
                          border: `1px solid ${qkrc}20`,
                          boxShadow: `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px ${qkrc}14`,
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: T().textFaint, flexShrink: 0, cursor: 'grab' }}>⋮⋮</span>
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: `${qkrc}22`, color: qkrc, fontWeight: 800, flexShrink: 0 }}>{qkr_r.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T().text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }} title={qkr.title}>{qkr.title}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 4, background: T().progressBg, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(qkp, 100)}%`, background: qkrc, borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 10, color: qkrc, fontWeight: 800, whiteSpace: 'nowrap' }}>{qkr.current?.toLocaleString()}/{qkr.target?.toLocaleString()}{qkr.unit}</span>
                        </div>
                        {qkr.owner && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, color: T().textMuted }}>
                            <Avatar name={qkr.owner} avatarUrl={members.find(m => m.name === qkr.owner)?.avatar_url} size={14} />
                            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qkr.owner}</span>
                          </div>
                        )}
                        <div style={{ marginTop: 4 }}>
                          <KASection krId={qkr.id} objectiveId={qkr._qObjId} levelId={qkr._qObjLevelId} theme={makeKATheme(T())} />
                        </div>
                      </div>
                    ) : (
                      <div key={qkr.id}
                        draggable
                        onDragStart={e => onKRDragStart(e, qkr.id)}
                        title="ドラッグして通期 KR の行に紐付け"
                        style={{
                          background: cellBg,
                          borderRadius: 10,
                          padding: '7px 9px',
                          border: `1px dashed ${T().textFaint}40`,
                          cursor: 'grab',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 11, color: T().textFaint, flexShrink: 0, cursor: 'grab' }}>⋮⋮</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T().text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={qkr.title}>{qkr.title}</span>
                          <span style={{ fontSize: 10, color: qkrc, fontWeight: 800, whiteSpace: 'nowrap' }}>{qkr.current?.toLocaleString()}/{qkr.target?.toLocaleString()}{qkr.unit}</span>
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
