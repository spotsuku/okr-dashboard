'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_TOKENS, RADIUS, SPACING, TYPO, SHADOWS } from '../lib/themeTokens'
import {
  cardStyle, pillStyle, btnPrimary, accentRingStyle,
  largeTitle, pageSubtitle, progressBarStyle, progressFillStyle,
  kpiNumber, inputStyle,
} from '../lib/iosStyles'

// ─── 日付ユーティリティ ──────────────────────────────────────
function getMondayJSTStr(d = new Date()) {
  const j = new Date(d.getTime() + 9 * 3600 * 1000)
  const day = j.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + diff))
  return m.toISOString().slice(0, 10)
}
function todayJSTStr() {
  const j = new Date(Date.now() + 9 * 3600 * 1000)
  return j.toISOString().slice(0, 10)
}
function fmtMonthDay(ds) {
  if (!ds) return ''
  const s = String(ds).slice(0, 10)
  const d = new Date(s + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}
// due_date / 日付列を 'YYYY-MM-DD' 文字列に正規化 (Supabase が稀に Date 型を返す対策)
function dateStr(v) {
  if (!v) return ''
  return String(v).slice(0, 10)
}
// KR が逆指標 (低いほど良い) か判定。タイトル末尾の表現で推定
function isInvertedKR(title) {
  if (!title) return false
  const t = String(title)
  return /以下|以内|削減|短縮|抑え|減らす|低減/.test(t)
}
// KR の達成率を 0〜150% で計算 (逆指標対応)
function calcKRPct(kr) {
  const target = Number(kr.target) || 0
  const current = Number(kr.current) || 0
  if (!target) return 0
  if (isInvertedKR(kr.title)) {
    // 逆指標: current ≤ target で 100%以上、current が大きいほど低い
    if (current <= 0) return 150  // 完全達成 (例: 不良 0)
    return Math.max(0, Math.min(150, (target / current) * 100))
  }
  return Math.min(150, (current / target) * 100)
}

const THEMES = { dark: COMMON_TOKENS.dark, light: COMMON_TOKENS.light }

export default function CompanyDashboardSummary({
  T: parentT, themeKey = 'dark', levels = [], members = [], fiscalYear = '2026',
  myName, isAdmin,
}) {
  const T = parentT || THEMES[themeKey] || THEMES.dark

  const [loading, setLoading] = useState(true)
  const today = useMemo(() => todayJSTStr(), [])
  const monday = useMemo(() => getMondayJSTStr(), [])
  const viewingMember = useMemo(() => (members || []).find(m => m.name === myName) || null, [members, myName])

  const [overdueCount, setOverdueCount] = useState(0)
  const [unfilledKRCount, setUnfilledKRCount] = useState(0)
  const [unresolvedConfirmCount, setUnresolvedConfirmCount] = useState(0)
  const [todayTaskStats, setTodayTaskStats] = useState({ total: 0, done: 0, inProgress: 0, overdue: 0 })
  const [queryErrors, setQueryErrors] = useState([])
  const [workingMembers, setWorkingMembers] = useState({ active: 0, finished: 0, notStarted: 0 })
  const [milestones, setMilestones] = useState([])
  const [krPinch, setKrPinch] = useState([])
  const [submittedTeamCount, setSubmittedTeamCount] = useState({ total: 0, submitted: 0 })
  const [rankings, setRankings] = useState(null)
  const [teamSummaryTableMissing, setTeamSummaryTableMissing] = useState(false)

  // 先週月曜〜日曜 の範囲を計算 (ランキング集計用)
  const lastWeekRange = useMemo(() => {
    const thisMon = new Date(monday + 'T00:00:00.000Z')
    const lastMon = new Date(thisMon.getTime() - 7 * 86400000)
    const lastSunEnd = new Date(thisMon.getTime() - 1)  // 先週日曜23:59:59.999 (今週月曜の1ms前)
    return {
      mondayStr: lastMon.toISOString().slice(0, 10),       // YYYY-MM-DD
      mondayIso: lastMon.toISOString(),                     // 開始ISO
      sundayEndIso: lastSunEnd.toISOString(),               // 終了ISO
      label: `${lastMon.getUTCMonth() + 1}/${lastMon.getUTCDate()}〜${new Date(thisMon.getTime() - 86400000).getUTCMonth() + 1}/${new Date(thisMon.getTime() - 86400000).getUTCDate()}`,
    }
  }, [monday])

  // 一括取得 (各クエリは個別に成否を判定。1つ失敗しても他は処理する)
  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      // ランキング用: 先週月〜日
      // ka_tasks には created_at が無い旧 schema もあるため、ka_tasks の週次フィルタは
      // due_date を使う (= 「先週が期限のタスク」を集計対象)。意味的にも
      // 「先週中の期限内完了率 (有言実行王)」「先週分のタスク完了数」として妥当。
      const lwStart = lastWeekRange.mondayIso
      const lwEnd = lastWeekRange.sundayEndIso
      const lwStartDate = lastWeekRange.mondayStr  // YYYY-MM-DD (due_date 比較用)
      const lwEndDate = (() => {
        const d = new Date(lwStartDate + 'T00:00:00Z')
        d.setUTCDate(d.getUTCDate() + 6)
        return d.toISOString().slice(0, 10)
      })()
      // kr_weekly_reviews.focus_output が無い旧 schema 対策で、select には focus のみを含める。
      // (focus_output が必要な箇所は focus で代替する)
      // ka_tasks は全件 SELECT すると行数膨張で 400 を踏みやすいため、用途別に範囲を絞る:
      //   - overdueTasks: 未完了 (done=false) のみ → 期限切れ判定に使用
      //   - todayTasks:   due_date=today のみ      → 今日のタスク表示に使用
      const queries = [
        ['overdueTasks', supabase.from('ka_tasks').select('id, due_date, done, status').eq('done', false).lt('due_date', today).range(0, 999)],
        ['todayTasks',   supabase.from('ka_tasks').select('id, due_date, done, status').eq('due_date', today).range(0, 999)],
        ['krs',          supabase.from('key_results').select('id, title, owner, current, target, unit, objective_id').range(0, 999)],
        ['weeklyRevs',   supabase.from('kr_weekly_reviews').select('kr_id, good, more, focus').eq('week_start', monday).range(0, 999)],
        ['openConfirms', supabase.from('member_confirmations').select('id', { count: 'exact', head: true }).eq('status', 'open')],
        ['msRes',        supabase.from('milestones').select('*').eq('fiscal_year', parseInt(fiscalYear)).range(0, 999)],
        ['workLogs',     supabase.from('coaching_logs').select('owner, content, created_at').eq('log_type', 'work_log').gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).range(0, 999)],
        ['teamSums',     supabase.from('team_weekly_summary').select('level_id, good, more, focus').eq('week_start', monday).range(0, 999)],
        // 振り返り王: 先週月〜日 の KPT ログ (coaching_logs.created_at は存在する)
        ['kptLogs',      supabase.from('coaching_logs').select('owner, content, created_at').eq('log_type', 'kpt').gte('created_at', lwStart).lte('created_at', lwEnd).range(0, 999)],
        // タスク完了王: 先週月〜日 に done=true になったタスク (completed_at で判定)
        // ※ supabase_dashboard_schema_fix.sql を実行して completed_at 列が存在する前提
        ['lwDone',       supabase.from('ka_tasks').select('assignee, completed_at').gte('completed_at', lwStart).lte('completed_at', lwEnd).eq('done', true).range(0, 999)],
        // 有言実行王: 先週月〜日 が due_date のタスク (期限内完了率を集計)
        ['lwWithDue',    supabase.from('ka_tasks').select('assignee, due_date, done, status').gte('due_date', lwStartDate).lte('due_date', lwEndDate).range(0, 999)],
        // 実践王: 先週の OKR 記入 (weekly_reports = KAレビュー / kr_weekly_reviews = KRレビュー)
        ['lwReports',    supabase.from('weekly_reports').select('owner, good, more, focus_output').eq('week_start', lastWeekRange.mondayStr).range(0, 999)],
        ['lwKrRevs',     supabase.from('kr_weekly_reviews').select('kr_id, good, more, focus').eq('week_start', lastWeekRange.mondayStr).range(0, 999)],
        // KR 前進王: 今週月曜・先週月曜の KR スナップショットを比較して「前進した KR の件数」を出す
        ['krSnapsThis',  supabase.from('kr_progress_snapshots').select('kr_id, current_value').eq('week_start', monday).range(0, 999)],
        ['krSnapsLast',  supabase.from('kr_progress_snapshots').select('kr_id, current_value').eq('week_start', lastWeekRange.mondayStr).range(0, 999)],
      ]
      const settled = await Promise.allSettled(queries.map(([_, p]) => p))
      if (!alive) return

      // 結果をキー名でマップ化 (失敗時は空)
      // エラーは object ではなく文字列にして console に出すと折りたたまれず読める。
      // teamSums の PGRST205 (table missing) は既知 (SQL 未実行) なのでバナーに出さず、
      // 該当セクション内で inline 表示するためのフラグだけ立てる。
      const r = {}
      const errs = []
      let tsTableMissing = false
      settled.forEach((s, i) => {
        const key = queries[i][0]
        if (s.status !== 'fulfilled') {
          const msg = s.reason?.message || String(s.reason)
          console.warn(`[CompanyDashboardSummary] ${key} クエリ失敗: ${msg}`)
          r[key] = { data: [], count: 0, error: s.reason }
          errs.push({ key, message: msg })
          return
        }
        if (s.value?.error) {
          const e = s.value.error
          const msg = `${e.message || ''} | code=${e.code || ''} | details=${e.details || ''} | hint=${e.hint || ''}`
          console.warn(`[CompanyDashboardSummary] ${key} エラー: ${msg}`)
          r[key] = { data: [], count: 0, error: e }
          if (key === 'teamSums' && e.code === 'PGRST205') {
            tsTableMissing = true  // バナーには出さず inline で説明
          } else {
            errs.push({ key, message: e.message || msg, code: e.code })
          }
          return
        }
        r[key] = s.value
      })
      setQueryErrors(errs)
      setTeamSummaryTableMissing(tsTableMissing)

      // タスク統計 (overdueTasks / todayTasks の2クエリから集計)
      // overdueTasks は done=false で due_date < today だけ取得済 (status='done' のみ JS で除外)
      const overdueTasks = (r.overdueTasks?.data || []).filter(t => t.status !== 'done')
      setOverdueCount(overdueTasks.length)
      const todayTasks = r.todayTasks?.data || []
      setTodayTaskStats({
        total: todayTasks.length,
        done: todayTasks.filter(t => t.done || t.status === 'done').length,
        inProgress: todayTasks.filter(t => !t.done && t.status === 'in_progress').length,
        overdue: overdueTasks.length,
      })

      // KR レビュー (focus_output は select に含めていないので参照しない)
      const reviewMap = {}
      ;(r.weeklyRevs?.data || []).forEach(rv => {
        reviewMap[rv.kr_id] = !!((rv.good||'').trim() || (rv.more||'').trim() || (rv.focus||'').trim())
      })
      const krList = r.krs?.data || []
      setUnfilledKRCount(krList.filter(kr => kr.owner && !reviewMap[kr.id]).length)
      setUnresolvedConfirmCount(r.openConfirms?.count || 0)

      // 稼働状況
      const lastByMember = new Map()
      for (const row of r.workLogs?.data || []) if (!lastByMember.has(row.owner)) lastByMember.set(row.owner, row)
      let active = 0, finished = 0
      for (const [, row] of lastByMember.entries()) {
        let c
        try { c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content } catch { c = {} }
        if (c?.end_at) finished++
        else if (c?.start_at) active++
      }
      const totalNonGuest = (members || []).filter(m => m.name !== '👀 ゲスト').length
      setWorkingMembers({ active, finished, notStarted: Math.max(0, totalNonGuest - active - finished) })

      // マイルストーン
      const ms = (r.msRes?.data || []).filter(m => m.status !== 'done')
      ms.sort((a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31'))
      setMilestones(ms.slice(0, 5))

      // KR ピンチ (逆指標対応)
      const moreMap = {}
      ;(r.weeklyRevs?.data || []).forEach(rv => { if ((rv.more || '').trim()) moreMap[rv.kr_id] = rv.more })
      const pinch = krList.filter(kr => kr.target).map(kr => ({
        ...kr, pct: calcKRPct(kr), inverted: isInvertedKR(kr.title),
        hasMore: !!moreMap[kr.id], moreText: moreMap[kr.id] || '',
      })).filter(kr => kr.pct < 70 || kr.hasMore)
      .sort((a, b) => (a.hasMore !== b.hasMore) ? (a.hasMore ? -1 : 1) : a.pct - b.pct)
      .slice(0, 5)
      setKrPinch(pinch)

      // チームサマリー件数
      const rootIds = new Set((levels || []).filter(l => !l.parent_id).map(l => Number(l.id)))
      const teamLvlSet = new Set((levels || []).filter(l => l.parent_id && !rootIds.has(Number(l.parent_id))).map(l => Number(l.id)))
      const submittedTeams = new Set(
        (r.teamSums?.data || [])
          .filter(rv => (rv.good || '').trim() || (rv.more || '').trim() || (rv.focus || '').trim())
          .map(rv => Number(rv.level_id)).filter(id => teamLvlSet.has(id))
      )
      setSubmittedTeamCount({ total: teamLvlSet.size, submitted: submittedTeams.size })

      // ランキング (週次)
      try {
        const todayStr = today
        const validMembers = new Set((members || []).map(m => m.name))
        const excludeNames = new Set(['👀 ゲスト'])

        // 1. 有言実行王: 先週作成の期限付きタスクのうち、期限内に終わらなかった率
        // (今日時点で done=false かつ due_date < today なら期限破り)
        const promiseStats = {}
        for (const t of r.lwWithDue?.data || []) {
          if (!t.assignee || excludeNames.has(t.assignee) || !validMembers.has(t.assignee)) continue
          const ps = promiseStats[t.assignee] = promiseStats[t.assignee] || { total: 0, overdue: 0 }
          ps.total++
          const d = dateStr(t.due_date)
          if (!t.done && t.status !== 'done' && d && d < todayStr) ps.overdue++
        }
        const promiseKeeper = Object.entries(promiseStats)
          .filter(([_, s]) => s.total >= 2)
          .map(([name, s]) => ({ name, score: 1 - s.overdue / s.total, total: s.total, overdue: s.overdue }))
          .sort((a, b) => b.score - a.score || b.total - a.total).slice(0, 3)

        // 2. タスク完了王: 過去7日
        const doneCount = {}
        for (const t of r.lwDone?.data || []) {
          if (!t.assignee || excludeNames.has(t.assignee) || !validMembers.has(t.assignee)) continue
          doneCount[t.assignee] = (doneCount[t.assignee] || 0) + 1
        }
        const taskMaster = Object.entries(doneCount)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count).slice(0, 3)

        // 3. 振り返り王: KPT (Keep/Problem/Try) の総文字数
        // (振り返りタブと同じ coaching_logs.log_type='kpt' のデータを使用)
        const reflStats = {}
        for (const row of r.kptLogs?.data || []) {
          if (!row.owner || excludeNames.has(row.owner) || !validMembers.has(row.owner)) continue
          let c
          try { c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content } catch { c = {} }
          const k = (c?.keep || '').trim()
          const p = (c?.problem || '').trim()
          const tr = (c?.try || '').trim()
          if (!k && !p && !tr) continue  // 空 KPT は除外
          const ps = reflStats[row.owner] = reflStats[row.owner] || { entries: 0, fullEntries: 0, totalChars: 0 }
          ps.entries++
          if (k && p && tr) ps.fullEntries++
          ps.totalChars += k.length + p.length + tr.length
        }
        const reflection = Object.entries(reflStats)
          .map(([name, s]) => ({ name, totalChars: s.totalChars, fullEntries: s.fullEntries, entries: s.entries }))
          .filter(rf => rf.totalChars >= 30)  // 30字以上で参加資格
          .sort((a, b) => b.totalChars - a.totalChars || b.fullEntries - a.fullEntries)
          .slice(0, 3)

        // 4. 実践王: 先週の OKR 記入 (weekly_reports KA + kr_weekly_reviews KR の good/more/focus 網羅性 + 文字数)
        const practiceStats = {}
        const ensurePr = (name) => practiceStats[name] = practiceStats[name] || { entries: 0, fullEntries: 0, totalChars: 0 }
        // KA レビュー (weekly_reports): owner = メンバー名
        for (const row of r.lwReports?.data || []) {
          if (!row.owner || excludeNames.has(row.owner) || !validMembers.has(row.owner)) continue
          const g = (row.good || '').trim(), m = (row.more || '').trim(), f = (row.focus_output || '').trim()
          if (!g && !m && !f) continue
          const ps = ensurePr(row.owner)
          ps.entries++
          if (g && m && f) ps.fullEntries++
          ps.totalChars += g.length + m.length + f.length
        }
        // KR レビュー (kr_weekly_reviews): kr_id → KR.owner で名前解決
        // focus_output は select に含めていないので focus のみで集計
        const krOwnerMap = {}
        krList.forEach(kr => { krOwnerMap[kr.id] = kr.owner })
        for (const row of r.lwKrRevs?.data || []) {
          const owner = krOwnerMap[row.kr_id]
          if (!owner || excludeNames.has(owner) || !validMembers.has(owner)) continue
          const g = (row.good || '').trim(), m = (row.more || '').trim(), f = (row.focus || '').trim()
          if (!g && !m && !f) continue
          const ps = ensurePr(owner)
          ps.entries++
          if (g && m && f) ps.fullEntries++
          ps.totalChars += g.length + m.length + f.length
        }
        const practiceMaster = Object.entries(practiceStats)
          .map(([name, s]) => ({ name, totalChars: s.totalChars, fullEntries: s.fullEntries, entries: s.entries }))
          .filter(p => p.totalChars >= 30)
          .sort((a, b) => b.totalChars - a.totalChars || b.fullEntries - a.fullEntries)
          .slice(0, 3)

        // 5. KR 前進王: 先週月曜→今週月曜で current が前進した KR の件数 (絶対数)
        //    KR 難易度差の影響を排除し、「実際に動かした KR の数」で表彰する。
        //    逆指標 (低いほど良い) は値が下がっていれば前進扱い。
        //    各 KR のスナップショットが両週分そろっていない場合は判定不能なので除外。
        const thisSnap = {}
        ;(r.krSnapsThis?.data || []).forEach(s => { thisSnap[s.kr_id] = Number(s.current_value) })
        const lastSnap = {}
        ;(r.krSnapsLast?.data || []).forEach(s => { lastSnap[s.kr_id] = Number(s.current_value) })
        const advancedByOwner = {}
        for (const kr of krList) {
          const owner = kr.owner
          if (!owner || excludeNames.has(owner) || !validMembers.has(owner)) continue
          const tv = thisSnap[kr.id]
          const lv = lastSnap[kr.id]
          if (tv === undefined || lv === undefined) continue  // 履歴未蓄積
          const advanced = isInvertedKR(kr.title) ? (lv - tv > 0) : (tv - lv > 0)
          const st = advancedByOwner[owner] = advancedByOwner[owner] || { advanced: 0, total: 0 }
          st.total++
          if (advanced) st.advanced++
        }
        const goalAchiever = Object.entries(advancedByOwner)
          .filter(([_, s]) => s.advanced > 0)  // 1 件でも前進した人だけ表示
          .map(([name, s]) => ({ name, advanced: s.advanced, total: s.total }))
          .sort((a, b) => b.advanced - a.advanced || a.total - b.total)
          .slice(0, 3)

        setRankings({ promiseKeeper, taskMaster, reflection, practiceMaster, goalAchiever })
      } catch (e) {
        console.warn('rankings calc error:', e)
        setRankings(null)
      }

      // デバッグ用: クエリ別の取得件数を console に
      console.info('[全社ダッシュボード] 取得件数:', {
        '期限切れ未完了': (r.overdueTasks?.data || []).length,
        '今日のタスク': (r.todayTasks?.data || []).length,
        '先週完了タスク': (r.lwDone?.data || []).length,
        '先週期限付きタスク': (r.lwWithDue?.data || []).length,
        '先週KPT': (r.kptLogs?.data || []).length,
        KR: krList.length,
        今週KRレビュー: (r.weeklyRevs?.data || []).length,
        今週チームサマリー: (r.teamSums?.data || []).length,
        マイルストーン: (r.msRes?.data || []).length,
        先週範囲: lastWeekRange.label,
      })

      setLoading(false)
    })()
    return () => { alive = false }
  }, [today, monday, fiscalYear, levels, members])

  if (loading) {
    return (
      <div style={{ flex: 1, padding: SPACING['3xl'], color: T.textMuted, fontSize: TYPO.body.fontSize, textAlign: 'center', overflowY: 'auto', fontFamily: 'inherit' }}>
        全社サマリーを読み込み中...
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${SPACING.xl}px ${SPACING['2xl']}px ${SPACING['3xl']}px`, background: T.bg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* タイトル */}
        <div style={{ marginBottom: SPACING.xl, display: 'flex', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' }}>
          <div style={accentRingStyle({ color: T.accent, size: 44 })}>
            <span style={{ fontSize: 22 }}>📊</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={largeTitle({ T })}>全社ダッシュボード</h1>
            <div style={pageSubtitle({ T })}>{fiscalYear}年度 ・ {today} 時点</div>
          </div>
        </div>

        {/* 管理者用: クエリ失敗を画面に表示 (本番DBスキーマと差異がある場合の診断用) */}
        {isAdmin && queryErrors.length > 0 && (
          <div style={{
            marginBottom: SPACING.lg, padding: SPACING.md,
            borderRadius: RADIUS.md, background: `${T.danger}10`,
            border: `1px solid ${T.danger}40`,
          }}>
            <div style={{ ...TYPO.headline, color: T.danger, marginBottom: SPACING.xs }}>
              ⚠️ {queryErrors.length} 件のクエリが失敗しました (admin にのみ表示)
            </div>
            <div style={{ ...TYPO.caption, color: T.textSub, fontFamily: 'ui-monospace, monospace' }}>
              {queryErrors.map((e, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  <strong>{e.key}</strong>: {e.message}{e.code ? ` (${e.code})` : ''}
                </div>
              ))}
            </div>
            <div style={{ marginTop: SPACING.sm, ...TYPO.caption, color: T.textSub }}>
              欠落カラム/テーブルが原因の場合: <code>supabase_dashboard_schema_fix.sql</code> を Supabase SQL Editor で実行してください。
            </div>
          </div>
        )}

        {/* 上段: アラート + 今日 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: SPACING.md, marginBottom: SPACING.lg,
        }}>
          <AlertCard T={T} overdueCount={overdueCount} unfilledKRCount={unfilledKRCount} unresolvedConfirmCount={unresolvedConfirmCount} />
          <TodayCard T={T} todayTaskStats={todayTaskStats} workingMembers={workingMembers} />
        </div>

        {/* 週間ランキング (4列) — 先週月曜〜日曜の確定ランキング */}
        {rankings && (
          <>
            <SectionTitle T={T} icon="🏆" iconColor="#FF9500" title="週間ランキング" sub={`先週 (${lastWeekRange.label}) の Top 3`} />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: SPACING.md, marginBottom: SPACING.xl,
            }}>
              <RankingCard T={T} title="有言実行王" emoji="🎯" accent="#34C759" subtitle="期限内完了率"
                entries={rankings.promiseKeeper.map(r => ({
                  name: r.name, main: `${Math.round(r.score * 100)}%`, sub: `${r.overdue}/${r.total}件遅延`,
                }))} />
              <RankingCard T={T} title="タスク完了王" emoji="✅" accent="#007AFF" subtitle="先週の完了数"
                entries={rankings.taskMaster.map(r => ({ name: r.name, main: `${r.count}件`, sub: '' }))} />
              <RankingCard T={T} title="振り返り王" emoji="📝" accent="#AF52DE" subtitle="KPT 総文字数"
                entries={rankings.reflection.map(r => ({
                  name: r.name,
                  main: `${r.totalChars}字`,
                  sub: `${r.entries}日記入`,
                }))} />
              <RankingCard T={T} title="実践王" emoji="🔥" accent="#FF3B30" subtitle="OKR 記入 (KR+KA)"
                entries={rankings.practiceMaster.map(r => ({
                  name: r.name,
                  main: `${r.totalChars}字`,
                  sub: `網羅 ${r.fullEntries}/${r.entries}件`,
                }))} />
              <RankingCard T={T} title="KR 前進王" emoji="🚀" accent="#FF9500" subtitle="先週比 前進KR数"
                entries={rankings.goalAchiever.map(r => ({ name: r.name, main: `${r.advanced}件`, sub: `担当 ${r.total}件中` }))} />
            </div>
          </>
        )}

        {/* チームサマリー */}
        <SectionTitle T={T} icon="📊" iconColor="#34C759" title="今週のチームサマリー"
          sub={`${submittedTeamCount.submitted}/${submittedTeamCount.total} チーム提出済 ・ マネージャー定例/ディレクター確認会議に反映`} />
        <TeamSummarySingleView T={T} levels={levels} members={members}
          weekStart={monday} myName={myName} viewingMember={viewingMember} isAdmin={isAdmin}
          tableMissing={teamSummaryTableMissing} />

        {/* 下段: マイルストーン + KR ピンチ */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: SPACING.md, marginTop: SPACING.xl,
        }}>
          <MilestonesCard T={T} milestones={milestones} />
          <KrPinchCard T={T} pinch={krPinch} />
        </div>
      </div>
    </div>
  )
}

// ─── サブコンポーネント ─────────────────────────────────────

function SectionTitle({ T, icon, iconColor = '#007AFF', title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.sm + 4, marginTop: SPACING.xs, flexWrap: 'wrap' }}>
      <div style={accentRingStyle({ color: iconColor, size: 28 })}>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <span style={{ ...TYPO.title3, color: T.text }}>{title}</span>
      {sub && <span style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 600 }}>{sub}</span>}
    </div>
  )
}

// ─── アラート ────────────────────────────────────────────────
function AlertCard({ T, overdueCount, unfilledKRCount, unresolvedConfirmCount }) {
  const total = overdueCount + unfilledKRCount + unresolvedConfirmCount
  const accent = total > 0 ? T.danger : T.success
  return (
    <div style={cardStyle({ T, accent, padding: SPACING.lg })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <div style={accentRingStyle({ color: accent, size: 32 })}>
          <span style={{ fontSize: 16 }}>{total > 0 ? '🚨' : '✓'}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...TYPO.headline, color: T.text }}>今すぐ目を向けるべきこと</div>
          <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 600 }}>
            {total === 0 ? 'すべてクリアです' : `合計 ${total} 件のアラート`}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
        <MetricRow T={T} color={T.danger} icon="⏰" label="期限切れ未完了タスク" value={overdueCount} unit="件" />
        <MetricRow T={T} color={T.warn}   icon="📝" label="今週レビュー未記入 KR" value={unfilledKRCount} unit="件" />
        <MetricRow T={T} color={T.accent} icon="🤝" label="未対応の確認依頼" value={unresolvedConfirmCount} unit="件" />
      </div>
    </div>
  )
}

function MetricRow({ T, color, icon, label, value, unit }) {
  const isAlert = value > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
      padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
      borderRadius: RADIUS.md,
      background: isAlert ? `${color}10` : T.sectionBg,
      border: `1px solid ${isAlert ? color + '30' : T.borderLight}`,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1, ...TYPO.body, color: T.text }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ ...kpiNumber({ color: isAlert ? color : T.textMuted, size: 20 }) }}>{value}</span>
        <span style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700 }}>{unit}</span>
      </span>
    </div>
  )
}

// ─── 今日の状況 ─────────────────────────────────────────────
function TodayCard({ T, todayTaskStats, workingMembers }) {
  const pct = todayTaskStats.total > 0 ? Math.round(todayTaskStats.done / todayTaskStats.total * 100) : 0
  return (
    <div style={cardStyle({ T, accent: T.accent, padding: SPACING.lg })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <div style={accentRingStyle({ color: T.accent, size: 32 })}>
          <span style={{ fontSize: 16 }}>📅</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...TYPO.headline, color: T.text }}>今日の全社状況</div>
          <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 600 }}>稼働率とメンバー状況</div>
        </div>
      </div>

      <div style={{
        background: T.sectionBg, border: `1px solid ${T.borderLight}`,
        borderRadius: RADIUS.md, padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
        marginBottom: SPACING.sm + 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACING.xs, marginBottom: SPACING.xs + 2 }}>
          <span style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700 }}>今日期限のタスク</span>
          <div style={{ flex: 1 }} />
          <span style={kpiNumber({ color: T.accent, size: 24 })}>{pct}%</span>
          <span style={{ ...TYPO.caption, color: T.textMuted }}>{todayTaskStats.done}/{todayTaskStats.total}</span>
        </div>
        <div style={progressBarStyle({ T, height: 6 })}>
          <div style={progressFillStyle({ color: T.accent, value: pct })} />
        </div>
        <div style={{ display: 'flex', gap: SPACING.md, marginTop: SPACING.xs + 2, ...TYPO.footnote, color: T.textMuted }}>
          <span>進行中 {todayTaskStats.inProgress}件</span>
          <span style={{ color: T.danger, fontWeight: 700 }}>停滞 {todayTaskStats.overdue}件</span>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: SPACING.xs + 2,
      }}>
        <MiniStat T={T} label="稼働中" value={workingMembers.active} color={T.success} />
        <MiniStat T={T} label="終業済" value={workingMembers.finished} color={T.textSub} />
        <MiniStat T={T} label="未始業" value={workingMembers.notStarted} color={T.textMuted} />
      </div>
    </div>
  )
}
function MiniStat({ T, label, value, color }) {
  return (
    <div style={{
      textAlign: 'center', padding: `${SPACING.sm}px ${SPACING.xs}px`,
      background: T.sectionBg, borderRadius: RADIUS.md, border: `1px solid ${T.borderLight}`,
    }}>
      <div style={kpiNumber({ color: color || T.text, size: 22 })}>{value}</div>
      <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ─── ランキングカード ────────────────────────────────────────
function RankingCard({ T, title, emoji, accent = '#007AFF', subtitle, entries }) {
  const medals = ['🥇', '🥈', '🥉']
  const medalColor = ['#FFD60a', '#A1A1AA', '#CD7F32']
  return (
    <div style={cardStyle({ T, accent, padding: SPACING.md })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, marginBottom: SPACING.sm }}>
        <div style={accentRingStyle({ color: accent, size: 26 })}>
          <span style={{ fontSize: 13 }}>{emoji}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TYPO.callout, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: SPACING.sm, ...TYPO.footnote, color: T.textMuted, textAlign: 'center' }}>データ不足</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
          {entries.map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: SPACING.xs + 2,
              padding: `${SPACING.xs + 2}px ${SPACING.sm}px`,
              borderRadius: RADIUS.sm,
              background: i === 0 ? `${medalColor[0]}1a` : T.sectionBg,
              border: `1px solid ${i === 0 ? medalColor[0] + '40' : T.borderLight}`,
            }}>
              <span style={{ fontSize: 16, width: 18, textAlign: 'center', flexShrink: 0 }}>{medals[i]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYPO.subhead, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                {e.sub && <div style={{ ...TYPO.caption, color: T.textMuted }}>{e.sub}</div>}
              </div>
              <span style={kpiNumber({ color: accent, size: 16 })}>{e.main}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── チームサマリー (1チーム拡大表示 + プルダウン + 3カラム編集) ──
function TeamSummarySingleView({ T, levels, members, weekStart, myName, viewingMember, isAdmin, tableMissing = false }) {
  // テーブル未作成 (PGRST205) のときは編集 UI を出さず案内だけ表示する
  if (tableMissing) {
    return (
      <div style={cardStyle({ T, accent: T.warn, padding: SPACING.lg })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs }}>
          <span style={{ fontSize: 18 }}>🛠</span>
          <span style={{ ...TYPO.headline, color: T.text }}>チームサマリー機能はまだ有効化されていません</span>
        </div>
        <div style={{ ...TYPO.body, color: T.textSub, lineHeight: 1.6 }}>
          <code style={{ background: T.sectionBg, padding: '1px 6px', borderRadius: 4 }}>team_weekly_summary</code> テーブルが Supabase 上に存在しません。
        </div>
        <div style={{ ...TYPO.footnote, color: T.textMuted, marginTop: SPACING.xs }}>
          管理者: Supabase SQL Editor で <code>supabase_dashboard_schema_fix.sql</code> を実行してください。
        </div>
      </div>
    )
  }

  const monday = weekStart

  const rootIds = useMemo(() => new Set((levels || []).filter(l => !l.parent_id).map(l => Number(l.id))), [levels])
  const departments = useMemo(() => (levels || []).filter(l => rootIds.has(Number(l.parent_id))), [levels, rootIds])
  const teamsByDept = useMemo(() => {
    const m = {}
    ;(levels || []).forEach(l => {
      if (!l.parent_id || rootIds.has(Number(l.parent_id))) return
      const deptId = Number(l.parent_id)
      if (!m[deptId]) m[deptId] = []
      m[deptId].push(l)
    })
    return m
  }, [levels, rootIds])

  const initialTeam = useMemo(() => {
    const allTeamLevels = Object.values(teamsByDept).flat()
    if (allTeamLevels.length === 0) return null
    const mgrTeam = allTeamLevels.find(l => Number(l.manager_id) === Number(viewingMember?.id))
    if (mgrTeam) return mgrTeam
    const memberLvls = Array.isArray(viewingMember?.sub_level_ids) ? viewingMember.sub_level_ids
      : viewingMember?.level_id ? [viewingMember.level_id] : []
    const myTeam = allTeamLevels.find(l => memberLvls.includes(Number(l.id)))
    if (myTeam) return myTeam
    return allTeamLevels[0]
  }, [teamsByDept, viewingMember])

  const [selectedDeptId, setSelectedDeptId] = useState(null)
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  useEffect(() => {
    if (initialTeam && !selectedTeamId) {
      setSelectedDeptId(Number(initialTeam.parent_id))
      setSelectedTeamId(Number(initialTeam.id))
    }
  }, [initialTeam, selectedTeamId])

  const teamsInSelectedDept = useMemo(() => teamsByDept[selectedDeptId] || [], [teamsByDept, selectedDeptId])
  const selectedTeam = useMemo(() => (levels || []).find(l => Number(l.id) === Number(selectedTeamId)), [levels, selectedTeamId])
  const isManagerOfActive = !!selectedTeam && Number(selectedTeam.manager_id) === Number(viewingMember?.id)
  const canEdit = !!viewingMember && (isManagerOfActive || isAdmin)
  const managerName = useMemo(() => {
    if (!selectedTeam?.manager_id) return null
    const mgr = (members || []).find(mm => Number(mm.id) === Number(selectedTeam.manager_id))
    return mgr?.name || null
  }, [selectedTeam, members])

  const [good, setGood] = useState('')
  const [more, setMore] = useState('')
  const [focus, setFocus] = useState('')
  const [rowId, setRowId] = useState(null)
  const [rowLoading, setRowLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const focusedRef = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    if (!selectedTeamId || !monday) return
    let alive = true
    setRowLoading(true); setRowId(null); setGood(''); setMore(''); setFocus('')
    supabase.from('team_weekly_summary').select('*')
      .eq('level_id', selectedTeamId).eq('week_start', monday).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) {
          setRowId(data.id)
          setGood(data.good || ''); setMore(data.more || ''); setFocus(data.focus || '')
        }
        setRowLoading(false)
      })
    return () => { alive = false }
  }, [selectedTeamId, monday])

  useEffect(() => {
    if (!selectedTeamId || !monday) return
    const ch = supabase.channel(`tws_dash_${selectedTeamId}_${monday}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'team_weekly_summary', filter: `level_id=eq.${selectedTeamId}` },
        payload => {
          const row = payload.new || payload.old
          if (!row || row.week_start !== monday) return
          if (payload.eventType === 'DELETE') { setRowId(null); return }
          setRowId(row.id)
          if (focusedRef.current !== 'good')  setGood(row.good || '')
          if (focusedRef.current !== 'more')  setMore(row.more || '')
          if (focusedRef.current !== 'focus') setFocus(row.focus || '')
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedTeamId, monday])

  const save = useCallback(async (g, m, f) => {
    if (!selectedTeamId || !canEdit) return
    setSaving(true)
    const payload = { level_id: selectedTeamId, week_start: monday, good: g, more: m, focus: f, updated_by: myName, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('team_weekly_summary')
      .upsert(payload, { onConflict: 'level_id,week_start' }).select().single()
    setSaving(false)
    if (error) { console.error('team summary save error:', error); return }
    if (data) { setRowId(data.id); setSaved(true); setTimeout(() => setSaved(false), 1200) }
  }, [selectedTeamId, monday, myName, canEdit])

  const scheduleSave = (g, m, f) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(g, m, f), 800)
  }

  const generateAI = async () => {
    if (!selectedTeamId || !monday || aiBusy) return
    if ((good || more || focus).trim().length > 0) {
      if (!window.confirm('現在の内容を AI 生成結果で上書きします。よろしいですか？')) return
    }
    setAiBusy(true); setAiError('')
    try {
      const res = await fetch('/api/ai/team-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level_id: selectedTeamId, week_start: monday }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      if (j.message) { setAiError(j.message); return }
      setGood(j.good || ''); setMore(j.more || ''); setFocus(j.focus || '')
      save(j.good || '', j.more || '', j.focus || '')
    } catch (e) {
      setAiError(e.message || 'AI生成に失敗しました')
    } finally {
      setAiBusy(false)
    }
  }

  if (departments.length === 0) {
    return (
      <div style={cardStyle({ T, padding: SPACING.lg })}>
        <div style={{ ...TYPO.body, color: T.textMuted, textAlign: 'center' }}>部署/チーム階層が未登録です</div>
      </div>
    )
  }

  // 外側コンテナはダッシュボード他カードと同じ cardStyle に統一 (T.success accent)。
  // 過去の独自グラデは CLAUDE.md デザインルールに反していたため撤去。
  const containerStyle = cardStyle({ T, accent: T.success, padding: SPACING.lg })

  const selectSt = {
    ...inputStyle({ T }),
    padding: '6px 10px', fontSize: TYPO.subhead.fontSize,
    cursor: 'pointer',
    width: 'auto', minWidth: 140,
  }

  const cellAccent = {
    good:  T.success,
    more:  T.warn,
    focus: T.accent,
  }
  // 内側 3 カラムも cardStyle に揃える。accent 色は cardStyle が背景に薄くグラデで反映する。
  // 視認性のためタイトル文字色だけ accent で強調。
  const cellStyleFn = (key) => ({
    ...cardStyle({ T, accent: cellAccent[key], padding: SPACING.md }),
    display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2,
    minHeight: 220,
  })
  const taStyle = {
    ...inputStyle({ T }),
    flex: 1, padding: SPACING.sm,
    fontSize: TYPO.body.fontSize, lineHeight: 1.6,
    resize: 'none', minHeight: 160,
  }

  return (
    <div style={containerStyle}>
      {/* セレクタ行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, flexWrap: 'wrap', marginBottom: SPACING.md }}>
        <span style={{ ...TYPO.footnote, color: T.textSub, fontWeight: 700 }}>部署</span>
        <select value={selectedDeptId || ''} onChange={(e) => {
          const did = Number(e.target.value)
          setSelectedDeptId(did)
          const teams = teamsByDept[did] || []
          if (teams.length > 0) setSelectedTeamId(Number(teams[0].id))
        }} style={selectSt}>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.icon || ''} {d.name}</option>
          ))}
        </select>
        <span style={{ ...TYPO.footnote, color: T.textSub, fontWeight: 700 }}>チーム</span>
        <select value={selectedTeamId || ''} onChange={(e) => setSelectedTeamId(Number(e.target.value))} style={selectSt}>
          {teamsInSelectedDept.length === 0 && <option value="">(チームなし)</option>}
          {teamsInSelectedDept.map(t => (
            <option key={t.id} value={t.id}>{t.icon || ''} {t.name}</option>
          ))}
        </select>
        {managerName && (
          <span style={pillStyle({ color: T.textSub, size: 'sm' })}>📌 責任者: {managerName}</span>
        )}
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button onClick={generateAI} disabled={aiBusy || rowLoading || !selectedTeamId}
            title="チーム内のKR/KA週次レビューを集約してAIで自動生成"
            style={{ ...btnPrimary({ T, size: 'sm', color: T.success }), cursor: aiBusy || rowLoading ? 'wait' : 'pointer', opacity: aiBusy ? 0.7 : 1 }}>
            {aiBusy ? '⟳ 生成中…' : '🤖 AIで生成'}
          </button>
        )}
        <span style={{ ...TYPO.footnote, color: T.textMuted }}>
          {saving && <span>⟳ 保存中…</span>}
          {saved && !saving && <span style={{ color: T.success, fontWeight: 800 }}>✓ 保存済</span>}
        </span>
      </div>

      {aiError && (
        <div style={{
          marginBottom: SPACING.sm + 2, padding: `${SPACING.xs + 2}px ${SPACING.md}px`,
          borderRadius: RADIUS.md, background: `${T.danger}15`, color: T.danger,
          ...TYPO.footnote, fontWeight: 700,
        }}>⚠️ {aiError}</div>
      )}

      {!canEdit && (
        <div style={{
          marginBottom: SPACING.sm + 2, padding: `${SPACING.xs + 2}px ${SPACING.md}px`,
          borderRadius: RADIUS.md, background: T.sectionBg, color: T.textMuted,
          ...TYPO.caption, fontWeight: 600, fontStyle: 'italic',
        }}>
          閲覧モード ({managerName ? `編集は ${managerName} さん (チーム責任者) または管理者のみ` : 'チーム責任者または管理者のみ編集可能'})
        </div>
      )}

      {/* 3カラム */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: SPACING.sm + 2 }}>
        <div style={cellStyleFn('good')}>
          <div style={{ ...TYPO.callout, color: T.success }}>✅ Good — チーム全体の良かったこと</div>
          <textarea value={good} disabled={!canEdit || rowLoading}
            onChange={e => { setGood(e.target.value); scheduleSave(e.target.value, more, focus) }}
            onFocus={() => focusedRef.current = 'good'} onBlur={() => focusedRef.current = null}
            placeholder="例: 評議会クロージング3社決定 / 新メンバー受け入れがスムーズだった"
            style={taStyle} />
        </div>
        <div style={cellStyleFn('more')}>
          <div style={{ ...TYPO.callout, color: T.warn }}>⚠️ More — チーム全体の課題・改善点</div>
          <textarea value={more} disabled={!canEdit || rowLoading}
            onChange={e => { setMore(e.target.value); scheduleSave(good, e.target.value, focus) }}
            onFocus={() => focusedRef.current = 'more'} onBlur={() => focusedRef.current = null}
            placeholder="例: 商談化率が伸び悩み / オンボーディングの遅延"
            style={taStyle} />
        </div>
        <div style={cellStyleFn('focus')}>
          <div style={{ ...TYPO.callout, color: T.accent }}>🎯 Focus — 来週のチーム注力</div>
          <textarea value={focus} disabled={!canEdit || rowLoading}
            onChange={e => { setFocus(e.target.value); scheduleSave(good, more, e.target.value) }}
            onFocus={() => focusedRef.current = 'focus'} onBlur={() => focusedRef.current = null}
            placeholder="例: 火曜の評議会で残2社クロージング / 木曜にKPI再設計"
            style={taStyle} />
        </div>
      </div>
    </div>
  )
}

// ─── マイルストーン ──────────────────────────────────────────
function MilestonesCard({ T, milestones }) {
  return (
    <div style={cardStyle({ T, accent: T.warn, padding: SPACING.lg })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <div style={accentRingStyle({ color: T.warn, size: 32 })}>
          <span style={{ fontSize: 16 }}>🎯</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...TYPO.headline, color: T.text }}>マイルストーン</div>
          <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 600 }}>期限近順 ・ 上位5件</div>
        </div>
      </div>
      {milestones.length === 0 ? (
        <div style={{ padding: SPACING.md, ...TYPO.body, color: T.textMuted, textAlign: 'center' }}>進行中のマイルストーンはありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
          {milestones.map(ms => {
            const days = ms.due_date ? Math.round((new Date(ms.due_date) - new Date(todayJSTStr())) / 86400000) : null
            const overdue = days !== null && days < 0
            const urgent = days !== null && days >= 0 && days <= 7
            const acc = overdue ? T.danger : urgent ? T.warn : T.textMuted
            return (
              <div key={ms.id} style={{
                padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
                borderRadius: RADIUS.md, background: T.sectionBg,
                border: `1px solid ${acc}30`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
                  {ms.focus_level === 'focus' && <span style={{ fontSize: 13 }}>⭐</span>}
                  <span style={{ ...TYPO.subhead, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ms.title}</span>
                  {ms.due_date && (
                    <span style={pillStyle({ color: acc, size: 'sm', solid: false })}>
                      {fmtMonthDay(ms.due_date)} {overdue ? `${Math.abs(days)}日超過` : days === 0 ? '今日' : `あと${days}日`}
                    </span>
                  )}
                </div>
                {ms.owner && <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: 4 }}>担当: {ms.owner}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── KR ピンチ ───────────────────────────────────────────────
function KrPinchCard({ T, pinch }) {
  return (
    <div style={cardStyle({ T, accent: T.danger, padding: SPACING.lg })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <div style={accentRingStyle({ color: T.danger, size: 32 })}>
          <span style={{ fontSize: 16 }}>📉</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...TYPO.headline, color: T.text }}>KR ピンチ</div>
          <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 600 }}>低達成 or 課題ありの TOP 5</div>
        </div>
      </div>
      {pinch.length === 0 ? (
        <div style={{ padding: SPACING.md, ...TYPO.body, color: T.textMuted, textAlign: 'center' }}>ピンチの KR はありません ✨</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
          {pinch.map(kr => {
            const pctColor = kr.pct < 50 ? T.danger : kr.pct < 80 ? T.warn : T.success
            return (
              <div key={kr.id} style={{
                padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
                borderRadius: RADIUS.md, background: T.sectionBg,
                border: `1px solid ${T.borderLight}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
                  <span style={{ ...TYPO.subhead, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kr.title}</span>
                  <span style={kpiNumber({ color: pctColor, size: 16 })}>{Math.round(kr.pct)}%</span>
                </div>
                <div style={{ marginTop: 4, ...progressBarStyle({ T, height: 4 }) }}>
                  <div style={progressFillStyle({ color: pctColor, value: kr.pct })} />
                </div>
                <div style={{ display: 'flex', gap: SPACING.xs + 2, alignItems: 'center', ...TYPO.caption, color: T.textMuted, marginTop: 4 }}>
                  <span>担当: {kr.owner}</span>
                  <span>・ {kr.current}/{kr.target} {kr.unit}</span>
                  {kr.hasMore && <span style={{ marginLeft: 'auto', ...pillStyle({ color: T.warn, size: 'sm' }) }}>課題あり</span>}
                </div>
                {kr.hasMore && kr.moreText && (
                  <div style={{ ...TYPO.caption, color: T.textSub, lineHeight: 1.4, fontStyle: 'italic', marginTop: 4 }}>
                    "{kr.moreText.slice(0, 100)}{kr.moreText.length > 100 ? '…' : ''}"
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
