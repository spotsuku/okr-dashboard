'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_TOKENS } from '../lib/themeTokens'
import { LargeTitle, BgGlow, SegmentedControl } from './iosUI'

// ─── テーマ ──────────────────────────────────────────────────────────────────
// テーマは lib/themeTokens.js で一元管理。固有フィールドだけ上書き
const DARK_T  = { ...COMMON_TOKENS.dark,  headerBg: 'rgba(0,0,0,0.85)' }
const LIGHT_T = { ...COMMON_TOKENS.light, headerBg: 'rgba(242,242,247,0.85)' }
const W_THEMES = { dark: DARK_T, light: LIGHT_T }

// ─── ユーティリティ ──────────────────────────────────────────────────────────
const RATINGS = [
  { min: 120, score: 5, label: '奇跡',   color: '#ff9f43' },
  { min: 110, score: 4, label: '変革',   color: '#a855f7' },
  { min: 100, score: 3, label: '好調',   color: '#00d68f' },
  { min:  90, score: 2, label: '順調',   color: '#4d9fff' },
  { min:  80, score: 1, label: '最低限', color: '#ffd166' },
  { min:   0, score: 0, label: '未達',   color: '#ff6b6b' },
]
const getRating = pct => RATINGS.find(r => Math.min(pct, 200) >= r.min) || RATINGS[RATINGS.length - 1]

function calcKRProgress(kr) {
  if (!kr.target || kr.target === 0) return 0
  const raw = kr.lower_is_better
    ? Math.max(0, ((kr.target * 2 - kr.current) / kr.target) * 100)
    : (kr.current / kr.target) * 100
  return Math.min(Math.round(raw), 150)
}
function calcObjProgress(krs) {
  if (!krs?.length) return 0
  return Math.round(krs.reduce((s, kr) => s + calcKRProgress(kr), 0) / krs.length)
}

function getDepth(levelId, levels) {
  let d = 0, cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) { d++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
  return d
}

function getSubtreeIds(rootId, levels) {
  const ids = [rootId]
  levels.filter(l => Number(l.parent_id) === Number(rootId)).forEach(c => ids.push(...getSubtreeIds(c.id, levels)))
  return ids
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f', 3: '#ffd166' }
const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }

const toPeriodKey = (period, year) => year === '2026' ? period : `${year}_${period}`

const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function getPeriodLabel(periodKey) {
  if (!periodKey) return ''
  const base = periodKey.includes('_') ? periodKey.split('_').pop() : periodKey
  return { annual:'通期', q1:'Q1', q2:'Q2', q3:'Q3', q4:'Q4' }[base] || periodKey
}

// ─── UI コンポーネント ──────────────────────────────────────────────────────
function Ring({ value, color, size = 46 }) {
  const s = size > 60 ? 5 : 3.5, r = (size - s * 2) / 2, c = 2 * Math.PI * r
  const offset = c - (Math.min(value, 100) / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={s} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={s}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size > 60 ? size * 0.22 : 11, fontWeight: 800, color }}>{value}%</span>
      </div>
    </div>
  )
}

function Stars({ score, size = 13 }) {
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: size, opacity: i <= score ? 1 : 0.18 }}>★</span>)}
    </div>
  )
}

function Bar({ value, color, max = 150 }) {
  const pct = Math.min((value / max) * 100, 100)
  const marker = (100 / max) * 100
  return (
    <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: `${marker}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)', zIndex: 2 }} />
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)', boxShadow: `0 0 6px ${color}80` }} />
    </div>
  )
}

// ─── メインコンポーネント ────────────────────────────────────────────────────
export default function CompanySummaryPage({ levels, members, themeKey = 'dark', fiscalYear = '2026' }) {
  const wT = () => W_THEMES[themeKey]

  const getCurrentQ = () => { const m = new Date().getMonth(); return m >= 3 && m <= 5 ? 'q1' : m >= 6 && m <= 8 ? 'q2' : m >= 9 && m <= 11 ? 'q3' : 'q4' }
  const [activePeriod, setActivePeriod] = useState(getCurrentQ())
  const [loading, setLoading] = useState(true)
  const [allObjectives, setAllObjectives] = useState([])
  const [rankings, setRankings] = useState(null)  // { promiseKeeper, taskMaster, reflection, goalAchiever }

  const periodTabs = [
    { key: 'q1', label: 'Q1' },
    { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' },
    { key: 'q4', label: 'Q4' },
    { key: 'all', label: '通期' },
  ]

  // ─── データ取得 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const levelIds = levels.map(l => l.id)
      if (!levelIds.length) { setAllObjectives([]); setLoading(false); return }

      let query = supabase.from('objectives')
        .select('id,level_id,period,title,owner')
        .in('level_id', levelIds)
        .order('id')
        .range(0, 49999)

      if (activePeriod === 'all') {
        const allPeriodKeys = ['annual','q1','q2','q3','q4'].map(p => toPeriodKey(p, fiscalYear))
        query = query.in('period', allPeriodKeys)
      } else {
        query = query.eq('period', toPeriodKey(activePeriod, fiscalYear))
      }

      const { data: objs } = await query
      if (!objs || !objs.length) { setAllObjectives([]); setLoading(false); return }

      const objIds = objs.map(o => o.id)
      // Supabase .in() にはURLレングス制限があるのでチャンク分割
      const chunkSize = 500
      let allKrs = []
      for (let i = 0; i < objIds.length; i += chunkSize) {
        const chunk = objIds.slice(i, i + chunkSize)
        const { data: krs } = await supabase.from('key_results')
          .select('*')
          .in('objective_id', chunk)
          .range(0, 49999)
        if (krs) allKrs = allKrs.concat(krs)
      }

      const krMap = {}
      allKrs.forEach(kr => {
        if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []
        krMap[kr.objective_id].push(kr)
      })

      setAllObjectives(objs.map(o => ({ ...o, key_results: krMap[o.id] || [] })))

      // ─── ランキング集計 ───────────────────────────────────────
      // 過去30日 + 直近4週の範囲で集計
      try {
        const today = new Date()
        const todayStr = today.toISOString().slice(0, 10)
        const days30Ago = new Date(today.getTime() - 30 * 86400000).toISOString()
        const weeks4Ago = new Date(today.getTime() - 28 * 86400000).toISOString().slice(0, 10)
        const memberNames = (members || []).filter(m => !m.is_admin || true).map(m => m.name)
        const validMembers = new Set(memberNames)
        // ゲスト等を除外
        const excludeNames = new Set(['👀 ゲスト'])

        const [ktAllRes, ktDoneRes, weeklyRes, krReviewRes] = await Promise.all([
          // 過去30日に作成された期限付きタスク全部
          supabase.from('ka_tasks')
            .select('assignee, due_date, done, status, created_at')
            .gte('created_at', days30Ago)
            .not('due_date', 'is', null)
            .range(0, 49999),
          // 過去30日内の完了タスク (created_at が30日以内 → 完了したもの)
          supabase.from('ka_tasks')
            .select('assignee')
            .gte('created_at', days30Ago)
            .eq('done', true)
            .range(0, 49999),
          // 直近4週の weekly_reports
          supabase.from('weekly_reports')
            .select('owner, week_start, good, more, focus_output')
            .gte('week_start', weeks4Ago)
            .range(0, 49999),
          // 直近4週の kr_weekly_reviews
          supabase.from('kr_weekly_reviews')
            .select('week_start, good, more, focus, focus_output, kr_id')
            .gte('week_start', weeks4Ago)
            .range(0, 49999),
        ])

        // 1. 有言実行王: 期限付きタスクのうち「期限切れ未完了」でない率
        const promiseStats = {}
        for (const t of ktAllRes.data || []) {
          if (!t.assignee || excludeNames.has(t.assignee)) continue
          if (!validMembers.has(t.assignee)) continue
          const ps = promiseStats[t.assignee] = promiseStats[t.assignee] || { total: 0, overdue: 0 }
          ps.total++
          const overdue = !t.done && t.due_date && t.due_date < todayStr
          if (overdue) ps.overdue++
        }
        const promiseKeeper = Object.entries(promiseStats)
          .filter(([_, s]) => s.total >= 3)  // ノイズ除去 (3件以上)
          .map(([name, s]) => ({ name, score: 1 - s.overdue / s.total, total: s.total, overdue: s.overdue }))
          .sort((a, b) => b.score - a.score || b.total - a.total)
          .slice(0, 3)

        // 2. タスク完了王: 過去30日の完了数
        const doneCount = {}
        for (const t of ktDoneRes.data || []) {
          if (!t.assignee || excludeNames.has(t.assignee)) continue
          if (!validMembers.has(t.assignee)) continue
          doneCount[t.assignee] = (doneCount[t.assignee] || 0) + 1
        }
        const taskMaster = Object.entries(doneCount)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)

        // 3. 振り返り王: 直近4週の good/more/focus_output 記入の網羅性 + 文字数
        // weekly_reports は owner ベース、kr_weekly_reviews は kr_id 経由なので KR.owner を引く
        const reflStats = {}  // { name: { weeks: Set, fullWeeks: Set, totalChars } }
        const ensureRefl = (name) => reflStats[name] = reflStats[name] || { weeks: new Set(), fullWeeks: new Set(), totalChars: 0 }

        for (const r of weeklyRes.data || []) {
          if (!r.owner || excludeNames.has(r.owner) || !validMembers.has(r.owner)) continue
          const ps = ensureRefl(r.owner)
          ps.weeks.add(r.week_start)
          const g = (r.good || '').trim()
          const m = (r.more || '').trim()
          const f = (r.focus_output || '').trim()
          if (g && m && f) ps.fullWeeks.add(r.week_start)
          ps.totalChars += g.length + m.length + f.length
        }
        // KR レビュー (KR.owner と紐付け)
        const krOwnerMap = {}
        allKrs.forEach(kr => { krOwnerMap[kr.id] = kr.owner })
        for (const r of krReviewRes.data || []) {
          const owner = krOwnerMap[r.kr_id]
          if (!owner || excludeNames.has(owner) || !validMembers.has(owner)) continue
          const ps = ensureRefl(owner)
          ps.weeks.add(r.week_start)
          const g = (r.good || '').trim()
          const m = (r.more || '').trim()
          const f = (r.focus_output || '').trim() || (r.focus || '').trim()
          if (g && m && f) ps.fullWeeks.add(r.week_start)
          ps.totalChars += g.length + m.length + f.length
        }
        const reflection = Object.entries(reflStats)
          .map(([name, s]) => ({
            name,
            score: s.fullWeeks.size * 100 + Math.floor(s.totalChars / 10),
            fullWeeks: s.fullWeeks.size,
            totalChars: s.totalChars,
          }))
          .filter(r => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)

        // 4. 目標達成王: 担当KRの平均達成率 (今期間 activePeriod)
        const krProgressByOwner = {}
        for (const o of objs) {
          for (const kr of (krMap[o.id] || [])) {
            const owner = kr.owner
            if (!owner || excludeNames.has(owner) || !validMembers.has(owner)) continue
            const arr = krProgressByOwner[owner] = krProgressByOwner[owner] || []
            const target = Number(kr.target) || 0
            const current = Number(kr.current) || 0
            // KRが「逆指標」(下げる目標) は判別できないのでcap=150のまま素直計算
            const pct = target ? Math.min(150, (current / target) * 100) : 0
            arr.push(pct)
          }
        }
        const goalAchiever = Object.entries(krProgressByOwner)
          .filter(([_, arr]) => arr.length >= 1)
          .map(([name, arr]) => ({
            name,
            avg: arr.reduce((a, b) => a + b, 0) / arr.length,
            count: arr.length,
          }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 3)

        setRankings({ promiseKeeper, taskMaster, reflection, goalAchiever })
      } catch (e) {
        console.warn('rankings calc error:', e)
        setRankings(null)
      }

      setLoading(false)
    }
    load()
  }, [levels, activePeriod, fiscalYear])

  // ─── 算出データ ─────────────────────────────────────────────────────────
  const globalStats = useMemo(() => {
    const progs = allObjectives.map(o => calcObjProgress(o.key_results))
    const avg = progs.length ? Math.round(progs.reduce((s, p) => s + p, 0) / progs.length) : 0
    const totalKRs = allObjectives.reduce((s, o) => s + (o.key_results?.length || 0), 0)
    return { avg, rating: getRating(avg), totalObjectives: allObjectives.length, totalKRs }
  }, [allObjectives])

  const departmentStats = useMemo(() => {
    // depth 0（経営）と depth 1（事業部）レベルを取得
    const deptLevels = levels.filter(l => getDepth(l.id, levels) <= 1)
    // 親→子の順にソート
    const sorted = deptLevels.sort((a, b) => {
      const da = getDepth(a.id, levels), db = getDepth(b.id, levels)
      if (da !== db) return da - db
      return a.id - b.id
    })
    return sorted.map(level => {
      const depth = getDepth(level.id, levels)
      const subtreeIds = getSubtreeIds(level.id, levels)
      const objs = allObjectives.filter(o => subtreeIds.includes(o.level_id))
      const progs = objs.map(o => calcObjProgress(o.key_results))
      const avg = progs.length ? Math.round(progs.reduce((s, p) => s + p, 0) / progs.length) : 0
      return {
        level, depth,
        objectiveCount: objs.length,
        krCount: objs.reduce((s, o) => s + (o.key_results?.length || 0), 0),
        avgProgress: avg,
        rating: getRating(avg),
      }
    })
  }, [allObjectives, levels])

  const ratingDistribution = useMemo(() => {
    const dist = RATINGS.map(r => ({ ...r, count: 0 }))
    allObjectives.forEach(o => {
      const pct = calcObjProgress(o.key_results)
      const r = getRating(pct)
      const entry = dist.find(d => d.label === r.label)
      if (entry) entry.count++
    })
    return dist
  }, [allObjectives])

  // 部署別Objective一覧
  const objectivesByDept = useMemo(() => {
    const result = []
    const rootLevels = levels.filter(l => !l.parent_id)
    const buildTree = (parentId) => {
      const children = levels.filter(l => Number(l.parent_id) === Number(parentId))
      children.sort((a, b) => a.id - b.id)
      children.forEach(child => {
        const objs = allObjectives.filter(o => Number(o.level_id) === Number(child.id))
        if (objs.length) result.push({ level: child, depth: getDepth(child.id, levels), objectives: objs })
        buildTree(child.id)
      })
    }
    rootLevels.forEach(root => {
      const objs = allObjectives.filter(o => Number(o.level_id) === Number(root.id))
      if (objs.length) result.push({ level: root, depth: 0, objectives: objs })
      buildTree(root.id)
    })
    return result
  }, [allObjectives, levels])

  const maxDist = Math.max(1, ...ratingDistribution.map(d => d.count))

  if (loading) return <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
      <BgGlow T={wT()} color="#AF52DE" />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <LargeTitle T={wT()}
        title="📊 全社サマリー"
        subtitle={`${fiscalYear}年度 ・ 期間別 OKR 進捗の全社集計`}
        right={<SegmentedControl T={wT()} value={activePeriod} onChange={setActivePeriod} items={periodTabs} />}
      />

      {/* ─── 全社サマリーヘッダー ─── */}
      <div style={{
        background: wT().bgCard, border: `1px solid ${wT().border}`, borderRadius: 14,
        padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <Ring value={globalStats.avg} color={globalStats.rating.color} size={90} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: wT().text, marginBottom: 4 }}>全社 OKR サマリー</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: `${globalStats.rating.color}18`, color: globalStats.rating.color }}>{globalStats.rating.label}</span>
            <Stars score={globalStats.rating.score} size={12} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Stat label="Objective" value={globalStats.totalObjectives} unit="件" color="#4d9fff" />
            <Stat label="Key Result" value={globalStats.totalKRs} unit="件" color="#00d68f" />
            <Stat label="全社平均" value={`${globalStats.avg}%`} color={globalStats.rating.color} />
          </div>
        </div>
      </div>

      {allObjectives.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: wT().textMuted, fontSize: 13 }}>
          この期間にOKRデータがありません
        </div>
      )}

      {/* 月間ランキングは全社ダッシュボード (週間) に移動 */}

      {allObjectives.length > 0 && (
        <>
          {/* ─── 部署別達成状況 ─── */}
          <SectionHeader title="部署別 OKR 達成状況" icon="📊" themeKey={themeKey} />
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 10, marginBottom: 24,
          }}>
            {departmentStats.map(dept => {
              const layerColor = LAYER_COLORS[dept.depth] || '#a0a8be'
              const layerLabel = LAYER_LABELS[dept.depth] || ''
              return (
                <div key={dept.level.id} style={{
                  background: wT().bgCard, border: `1px solid ${wT().border}`,
                  borderLeft: `3px solid ${layerColor}`,
                  borderRadius: 10, padding: '14px 16px',
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Ring value={dept.avgProgress} color={dept.rating.color} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: wT().text }}>{dept.level.icon} {dept.level.name}</span>
                        {layerLabel && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${layerColor}18`, color: layerColor }}>{layerLabel}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: dept.rating.color }}>{dept.rating.label}</span>
                        <Stars score={dept.rating.score} size={9} />
                      </div>
                    </div>
                  </div>
                  <Bar value={dept.avgProgress} color={dept.rating.color} />
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: wT().textMuted }}>目標 <b style={{ color: wT().textSub }}>{dept.objectiveCount}</b>件</span>
                    <span style={{ fontSize: 10, color: wT().textMuted }}>KR <b style={{ color: wT().textSub }}>{dept.krCount}</b>件</span>
                    <span style={{ fontSize: 10, color: wT().textMuted, marginLeft: 'auto' }}>{dept.avgProgress}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ─── 評価分布 ─── */}
          <SectionHeader title="評価分布" icon="📈" themeKey={themeKey} />
          <div style={{
            background: wT().bgCard, border: `1px solid ${wT().border}`, borderRadius: 12,
            padding: '16px 20px', marginBottom: 24,
          }}>
            {ratingDistribution.map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.color, width: 56, textAlign: 'right', flexShrink: 0 }}>{r.label}</span>
                <div style={{ flex: 1, height: 18, background: wT().borderLight, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    width: r.count > 0 ? `${Math.max((r.count / maxDist) * 100, 3)}%` : '0%',
                    background: `${r.color}60`,
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: wT().textSub, width: 36, flexShrink: 0 }}>{r.count}件</span>
              </div>
            ))}
          </div>

          {/* ─── 目標一覧（部署別） ─── */}
          <SectionHeader title="目標一覧" icon="📋" themeKey={themeKey} />
          <div style={{
            background: wT().bgCard, border: `1px solid ${wT().border}`, borderRadius: 12,
            overflow: 'hidden', marginBottom: 24,
          }}>
            {objectivesByDept.map((group, gi) => (
              <div key={group.level.id}>
                {/* 部署ヘッダー */}
                <div style={{
                  padding: '8px 16px', background: wT().bgCard2,
                  borderBottom: `1px solid ${wT().border}`,
                  borderTop: gi > 0 ? `1px solid ${wT().border}` : 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ fontSize: 11, color: LAYER_COLORS[group.depth] || '#a0a8be' }}>{group.level.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: wT().textSub }}>{group.level.name}</span>
                  <span style={{ fontSize: 10, color: wT().textMuted }}>{group.objectives.length}件</span>
                </div>
                {/* Objective 行 */}
                {group.objectives.map(obj => {
                  const pct = calcObjProgress(obj.key_results)
                  const rating = getRating(pct)
                  const krCount = obj.key_results?.length || 0
                  return (
                    <div key={obj.id} style={{
                      padding: '8px 16px', borderBottom: `1px solid ${wT().borderLight}`,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <Ring value={pct} color={rating.color} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: wT().text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obj.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: rating.color }}>{rating.label}</span>
                          <Stars score={rating.score} size={8} />
                          <span style={{ fontSize: 10, color: wT().textMuted }}>KR {krCount}件</span>
                          {obj.period && <span style={{ fontSize: 9, color: wT().textFaint, padding: '1px 5px', borderRadius: 99, border: `1px solid ${wT().borderLight}` }}>{getPeriodLabel(obj.period)}</span>}
                        </div>
                      </div>
                      {obj.owner && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: `${avatarColor(obj.owner)}30`, border: `1.5px solid ${avatarColor(obj.owner)}60`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 700, color: avatarColor(obj.owner),
                          }}>{obj.owner.replace(/\s+/g, '').slice(0, 2)}</div>
                          <span style={{ fontSize: 10, color: wT().textMuted }}>{obj.owner}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  )
}

// ─── 補助コンポーネント ──────────────────────────────────────────────────────
function SectionHeader({ title, icon, themeKey }) {
  const wT = () => W_THEMES[themeKey]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: wT().text }}>{title}</span>
    </div>
  )
}

// 🏆 ランキングカード (Top3 表示)
function RankingCard({ T, title, emoji, subtitle, entries }) {
  const medals = ['🥇', '🥈', '🥉']
  const medalBg = ['#FFD60018', '#C7C7CC18', '#FF950018']
  const medalColor = ['#FFD60a', '#C7C7CC', '#FF9500']
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{title}</span>
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{subtitle}</div>
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: 12, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
          データ不足
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 8,
              background: medalBg[i],
              border: `1px solid ${medalColor[i]}30`,
            }}>
              <span style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{medals[i]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name}
                </div>
                {e.sub && (
                  <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>{e.sub}</div>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: medalColor[i], whiteSpace: 'nowrap' }}>
                {e.main}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, unit, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#606880', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}{unit && <span style={{ fontSize: 10, fontWeight: 600, color: '#a0a8be' }}>{unit}</span>}</div>
    </div>
  )
}
