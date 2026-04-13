'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'

// JST基準のYYYY-MM-DDを返す
function toDateStr(d) {
  if (typeof d === 'string') return d
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}
// JST基準で「入力日時を含む週の月曜日」の Date(UTC midnight) を返す
function getMonday(d) {
  const dt = typeof d === 'string' ? new Date(d) : (d || new Date())
  const jst = new Date(dt.getTime() + 9 * 3600 * 1000)
  const jstDay = jst.getUTCDay()
  const diff = jstDay === 0 ? -6 : 1 - jstDay
  return new Date(Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + diff
  ))
}
function formatDate(ds) {
  if (!ds) return ''
  const d = new Date(ds + 'T00:00:00')
  return `${d.getMonth()+1}/${d.getDate()}`
}
function getCurrentQ() { const m = new Date().getMonth(); return m>=3&&m<=5?'q1':m>=6&&m<=8?'q2':m>=9&&m<=11?'q3':'q4' }
function toPeriodKey(p, yr) { return yr === '2026' ? p : `${yr}_${p}` }
function rawPeriod(p) { return (p || '').replace(/^\d{4}_/, '') }
const Q_MONTHS = { q1:[4,5,6], q2:[7,8,9], q3:[10,11,12], q4:[1,2,3] }
function isMonthInRange(month, start, end) {
  return start <= end ? month >= start && month <= end : month >= start || month <= end
}

const THEMES = {
  dark: {
    bg:'#0F1117', bgCard:'#1A1D27', border:'rgba(255,255,255,0.10)', borderMid:'rgba(255,255,255,0.16)',
    text:'#E8ECF0', textSub:'#B0BAC8', textMuted:'#7a8599', textFaint:'#4A5468',
    accent:'#4d9fff', accentBg:'rgba(77,159,255,0.12)', sectionBg:'rgba(255,255,255,0.03)',
    doneBg:'rgba(0,214,143,0.06)', doneBorder:'rgba(0,214,143,0.15)',
    overdueBg:'rgba(255,107,107,0.06)', overdueBorder:'rgba(255,107,107,0.2)',
    chatBg:'#0e1420', chatBorder:'rgba(255,255,255,0.08)',
  },
  light: {
    bg:'#EEF2F5', bgCard:'#FFFFFF', border:'#E2E8F0', borderMid:'#CBD5E0',
    text:'#2D3748', textSub:'#4A5568', textMuted:'#718096', textFaint:'#A0AEC0',
    accent:'#3B82C4', accentBg:'rgba(59,130,196,0.1)', sectionBg:'#F8FAFC',
    doneBg:'rgba(0,214,143,0.06)', doneBorder:'rgba(0,214,143,0.2)',
    overdueBg:'rgba(255,107,107,0.06)', overdueBorder:'rgba(255,107,107,0.2)',
    chatBg:'#F7F9FB', chatBorder:'#E2E8F0',
  },
}

const SUGGESTIONS = [
  '今週やるべきことを教えて',
  'OKR達成率を上げるアドバイス',
  '最近の頑張りを褒めて',
  'タスクの優先順位を整理して',
]

const TASK_STATUS_CONFIG = {
  not_started: { label: '未着手', color: '#7a8599', bg: 'rgba(122,133,153,0.12)', border: 'rgba(122,133,153,0.35)', icon: '○' },
  in_progress: { label: '進行中', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)', border: 'rgba(77,159,255,0.35)', icon: '◐' },
  done:        { label: '完了',   color: '#00d68f', bg: 'rgba(0,214,143,0.12)', border: 'rgba(0,214,143,0.35)', icon: '●' },
}
const TASK_STATUS_ORDER = ['not_started', 'in_progress', 'done']

export default function MyCoachPage({ user, members, levels, themeKey = 'dark', fiscalYear = '2026' }) {
  const T = THEMES[themeKey] || THEMES.dark
  const { isMobile, isTablet, isMobileOrTablet } = useResponsive()
  const [showChat, setShowChat] = useState(false)
  const myName = members?.find(m => m.email === user?.email)?.name || user?.email || ''

  // Data state
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [allKAs, setAllKAs] = useState([])
  const [tasks, setTasks] = useState([])
  const [doneTasksByWeek, setDoneTasksByWeek] = useState({})
  const [doneKACount, setDoneKACount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [kaMap, setKaMap] = useState({})
  const [objMap, setObjMap] = useState({})
  const [milestones, setMilestones] = useState([])
  const [myJd, setMyJd] = useState(null)
  const [orgTasks, setOrgTasks] = useState([])
  const [premises, setPremises] = useState([])
  const [showPremises, setShowPremises] = useState(false)
  const [premiseEdit, setPremiseEdit] = useState('')
  const [proposedTasks, setProposedTasks] = useState([])
  const [proposingTasks, setProposingTasks] = useState(false)
  const [kaTab, setKaTab] = useState('all')

  // AI Chat state
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `こんにちは！${myName || ''}さんのOKRコーチです。\n\n目標達成に向けて、一緒に頑張りましょう！タスクの整理、OKRアドバイス、今週の計画など何でもご相談ください。` }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [weeklyCoaching, setWeeklyCoaching] = useState(null)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const bottomRef = useRef(null)
  const coachingGenerated = useRef(false)

  const today = toDateStr(new Date())
  const thisMonday = toDateStr(getMonday(new Date()))
  const thisSunday = toDateStr(new Date(getMonday(new Date()).getTime() + 6 * 86400000))

  // Load data
  const loadData = useCallback(async () => {
    if (!myName) return
    setLoading(true)

    const fourWeeksAgo = toDateStr(new Date(Date.now() - 28 * 86400000))
    const validPeriods = ['q1','q2','q3','q4','annual'].map(p => toPeriodKey(p, fiscalYear))

    const [objRes, taskRes, doneRes, kaRes, doneKARes, msRes, jdRes, orgTaskRes, premRes, logRes] = await Promise.all([
      supabase.from('objectives').select('*').eq('owner', myName).in('period', validPeriods),
      supabase.from('ka_tasks').select('*').eq('assignee', myName).eq('done', false).order('due_date').order('id'),
      supabase.from('ka_tasks').select('id,created_at,done').eq('assignee', myName).eq('done', true).gte('created_at', fourWeeksAgo),
      supabase.from('weekly_reports').select('*').eq('owner', myName),
      supabase.from('weekly_reports').select('id').eq('owner', myName).eq('status', 'done'),
      supabase.from('milestones').select('*').eq('fiscal_year', parseInt(fiscalYear)),
      supabase.from('org_member_jd').select('*').eq('member_id', myName).order('version_idx', { ascending: false }).limit(1),
      supabase.from('org_tasks').select('*').eq('owner', myName).eq('is_archived', false),
      supabase.from('ai_premises').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('coaching_logs').select('*').eq('owner', myName).eq('week_start', thisMonday).eq('log_type', 'action_plan').order('created_at', { ascending: false }).limit(1),
    ])

    const objs = objRes.data || []
    setObjectives(objs)
    setDoneKACount((doneKARes.data || []).length)

    // KRs
    const objIds = objs.map(o => o.id)
    if (objIds.length > 0) {
      const { data: krs } = await supabase.from('key_results').select('*').in('objective_id', objIds)
      setKeyResults(krs || [])
    }

    // KA重複排除（週コピー対応: 最新週のもの1つだけ残す）
    const rawKAs = kaRes.data || []
    const kaByKey = {}
    for (const ka of rawKAs) {
      const key = `${ka.kr_id}_${ka.ka_title}_${ka.owner}_${ka.objective_id}`
      if (!kaByKey[key] || (ka.week_start || '') > (kaByKey[key].week_start || '')) kaByKey[key] = ka
    }
    setAllKAs(Object.values(kaByKey))

    // 親KA情報 + Objective情報（Slack通知でOKRタイトルを参照するため）
    const reportIds = [...new Set((taskRes.data || []).map(t => t.report_id).filter(Boolean))]
    let kaMapLocal = {}
    if (reportIds.length > 0) {
      const { data: kas } = await supabase.from('weekly_reports').select('id,ka_title,objective_id,week_start,kr_id').in('id', reportIds)
      ;(kas || []).forEach(k => { kaMapLocal[k.id] = k })
      setKaMap(kaMapLocal)
      const parentObjIds = [...new Set((kas || []).map(k => k.objective_id).filter(Boolean))]
      if (parentObjIds.length > 0) {
        const { data: parentObjs } = await supabase.from('objectives').select('id,title').in('id', parentObjIds)
        const om = {}; (parentObjs || []).forEach(o => { om[o.id] = o }); setObjMap(om)
      }
    }

    // タスク重複排除: createWeek が翌週作成時に ka_tasks を複製するので、
    // 同じ (親KA + title + assignee) のタスクが複数存在する。
    // dedup 条件: parent_ka (kr_id + ka_title) + title + assignee
    // 同一キー内では親 weekly_reports の week_start が新しい方を採用する。
    const rawTasks = taskRes.data || []
    const taskByKey = {}
    for (const t of rawTasks) {
      const parent = kaMapLocal[t.report_id] || {}
      const key = `${parent.kr_id ?? ''}__${parent.ka_title ?? ''}__${(t.title || '').trim()}__${t.assignee || ''}`
      const cur = taskByKey[key]
      if (!cur) { taskByKey[key] = t; continue }
      const curParent = kaMapLocal[cur.report_id] || {}
      const curWs = curParent.week_start || ''
      const newWs = parent.week_start || ''
      if (newWs > curWs) taskByKey[key] = t
    }
    setTasks(Object.values(taskByKey))

    // 週ごとの完了タスク数
    const byWeek = {}
    for (const t of (doneRes.data || [])) {
      const w = toDateStr(getMonday(new Date(t.created_at)))
      byWeek[w] = (byWeek[w] || 0) + 1
    }
    setDoneTasksByWeek(byWeek)

    // 追加データ
    setMilestones(msRes.data || [])
    setMyJd((jdRes.data || [])[0] || null)
    setOrgTasks(orgTaskRes.data || [])
    setPremises(premRes.data || [])

    // 保存済みコーチングログがあればそれを表示
    const savedLog = (logRes.data || [])[0]
    if (savedLog) setWeeklyCoaching(savedLog.content)

    setLoading(false)
  }, [myName, thisMonday, fiscalYear])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // KAステータス分類
  const focusKAs = allKAs.filter(ka => ka.status === 'focus')
  const moreKAs = allKAs.filter(ka => ka.status === 'more')
  const goodKAs = allKAs.filter(ka => ka.status === 'good')

  // AI context
  const buildContext = () => {
    const currentQ = getCurrentQ()
    const currentQKey = toPeriodKey(currentQ, fiscalYear)
    const currentQMonths = Q_MONTHS[currentQ]
    const levelMap = {}; (levels||[]).forEach(l => { levelMap[l.id] = l.name })
    const qMilestones = milestones.filter(ms =>
      currentQMonths.some(m => isMonthInRange(m, ms.start_month, ms.end_month))
    )
    return {
      user: myName,
      fiscalYear, currentQuarter: currentQ.toUpperCase(),
      today: toDateStr(new Date()),
      isMonthEnd: new Date().getDate() >= 25,
      currentQObjectives: objectives.filter(o => o.period === currentQKey).map(o => ({ title: o.title })),
      annualObjectives: objectives.filter(o => rawPeriod(o.period) === 'annual').map(o => ({ title: o.title })),
      keyResults: keyResults.map(kr => ({
        title: kr.title, current: kr.current, target: kr.target, unit: kr.unit,
        pct: kr.target ? Math.round((kr.current / kr.target) * 100) : 0,
      })),
      focusKAs: focusKAs.map(ka => ({ title: ka.ka_title, good: ka.good, more: ka.more })),
      moreKAs: moreKAs.map(ka => ({ title: ka.ka_title, more: ka.more })),
      goodKAs: goodKAs.map(ka => ({ title: ka.ka_title, good: ka.good })),
      totalKACount: allKAs.length,
      incompleteTasks: tasks.slice(0, 20).map(t => ({ title: t.title, due: t.due_date })),
      stats: { doneKAs: doneKACount, totalIncompleteTasks: tasks.length },
      milestones: qMilestones.map(ms => ({
        title: ms.title, org: levelMap[ms.org_id] || '',
        months: `${ms.start_month}月〜${ms.end_month}月`,
        dueDate: ms.due_date, status: ms.status,
      })),
      jobDescription: myJd ? { role: myJd.role, roleDesc: myJd.role_desc, responsibility: myJd.responsibility, tasks: myJd.tasks } : null,
      orgTasks: orgTasks.slice(0, 20).map(t => ({ dept: t.dept, team: t.team, task: t.task })),
      premises: premises.map(p => p.content),
    }
  }

  // Send to AI
  const sendToAI = async (text) => {
    const userText = text || chatInput.trim()
    if (!userText || chatLoading) return
    setChatInput('')
    const newMsgs = [...messages, { role: 'user', content: userText }]
    setMessages(newMsgs)
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })), context: buildContext() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `エラー: ${e.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // Weekly coaching generate (with save)
  const generateWeeklyCoaching = useCallback(async () => {
    if (loading || (tasks.length === 0 && allKAs.length === 0 && keyResults.length === 0)) return
    setCoachingLoading(true)
    const prompt = `${myName}さんの今週の優先アクションを提案してください。

【今週Focus中のKA（${focusKAs.length}件）】
${focusKAs.map(ka => `- ${ka.ka_title}${ka.more ? ` ※改善点: ${ka.more}` : ''}`).join('\n') || 'なし'}

【More評価のKA（見直し候補, ${moreKAs.length}件）】
${moreKAs.map(ka => `- ${ka.ka_title}: ${ka.more}`).join('\n') || 'なし'}

【未完了タスク（${tasks.length}件）】
${tasks.slice(0, 10).map(t => `- ${t.title}${t.due_date ? ' (期限:'+formatDate(t.due_date)+')' : ''}`).join('\n') || 'なし'}

【KR進捗】
${keyResults.map(kr => `- ${kr.title}: ${kr.target ? Math.round((kr.current/kr.target)*100) : 0}%`).join('\n') || 'なし'}

Focus中のKAに基づいて、今週の具体的な行動を3-5つ提案してください。
More評価のKAがあれば打ち手の見直しも提案してください。簡潔にお願いします。`

    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: buildContext() }),
      })
      const data = await res.json()
      const content = data.error ? `エラー: ${data.error}` : data.content
      setWeeklyCoaching(content)
      // DBに保存
      if (!data.error) {
        await supabase.from('coaching_logs').insert({ owner: myName, week_start: thisMonday, content, log_type: 'action_plan' })
      }
    } catch (e) {
      setWeeklyCoaching(`エラー: ${e.message}`)
    } finally {
      setCoachingLoading(false)
    }
  }, [loading, myName, tasks, allKAs, keyResults, focusKAs, moreKAs]) // eslint-disable-line

  // 保存済みログがなければ自動生成
  useEffect(() => {
    if (!loading && !coachingGenerated.current && myName && !weeklyCoaching) {
      coachingGenerated.current = true
      generateWeeklyCoaching()
    }
  }, [loading, myName, weeklyCoaching]) // eslint-disable-line

  // KAステータス変更
  const changeKAStatus = async (ka, newStatus) => {
    const { error } = await supabase.from('weekly_reports').update({ status: newStatus }).eq('id', ka.id)
    if (!error) setAllKAs(prev => prev.map(k => k.id === ka.id ? { ...k, status: newStatus } : k))
  }

  // AIタスク提案
  const proposeTasksFromAI = async () => {
    setProposingTasks(true)
    const prompt = `${myName}さんのKAとKR進捗を踏まえて、今週取り組むべき具体的なタスクを5つ提案してください。

【Focus KA】
${focusKAs.map(ka => `- ${ka.ka_title}`).join('\n') || 'なし'}

【More KA（見直し候補）】
${moreKAs.map(ka => `- ${ka.ka_title}`).join('\n') || 'なし'}

【KR進捗】
${keyResults.map(kr => `- ${kr.title}: ${kr.target ? Math.round((kr.current/kr.target)*100) : 0}%`).join('\n') || 'なし'}

【現在の未完了タスク】
${tasks.slice(0, 5).map(t => `- ${t.title}`).join('\n') || 'なし'}

以下のJSON形式で回答してください（説明文不要、JSONのみ）:
[{"title":"タスク名","due_days":7,"ka_index":0}]
- title: 具体的なタスク名
- due_days: 期限（今日から何日後か）
- ka_index: 関連するFocus KAのインデックス（0始まり、なければnull）`

    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: buildContext() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // JSONを抽出
      const jsonMatch = data.content.match(/\[[\s\S]*?\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        setProposedTasks(parsed.map((t, i) => ({ ...t, id: i, accepted: false })))
      }
    } catch (e) {
      console.error('AI task proposal error:', e)
    } finally {
      setProposingTasks(false)
    }
  }

  // タスク採用
  const acceptTask = async (task) => {
    const dueDate = task.due_days ? toDateStr(new Date(Date.now() + task.due_days * 86400000)) : null
    const relatedKA = task.ka_index != null ? focusKAs[task.ka_index] : null
    const { error } = await supabase.from('ka_tasks').insert({
      title: task.title, assignee: myName, due_date: dueDate,
      report_id: relatedKA?.id || null, done: false,
    })
    if (!error) {
      setProposedTasks(prev => prev.map(t => t.id === task.id ? { ...t, accepted: true } : t))
      // タスクリストを更新
      const { data: newTasks } = await supabase.from('ka_tasks').select('*').eq('assignee', myName).eq('done', false).order('due_date').order('id')
      if (newTasks) setTasks(newTasks)
    }
  }

  // タスク操作
  const reloadTasks = async () => {
    const { data } = await supabase.from('ka_tasks').select('*').eq('assignee', myName).eq('done', false).order('due_date').order('id')
    if (data) setTasks(data)
  }
  const changeTaskStatus = async (task, newStatus) => {
    const newDone = newStatus === 'done'
    const { error } = await supabase.from('ka_tasks').update({ done: newDone }).eq('id', task.id)
    if (error) { alert('更新に失敗しました: ' + error.message); return }
    // statusカラムが存在する場合のみ更新（エラーは無視）
    await supabase.from('ka_tasks').update({ status: newStatus }).eq('id', task.id).then(() => {}).catch(() => {})
    // ローカル状態を即座に更新（doneのタスクはリストから消す）
    setTasks(prev => newDone
      ? prev.filter(t => t.id !== task.id)
      : prev.map(t => t.id === task.id ? { ...t, status: newStatus, done: false } : t)
    )
    // 完了時はSlack通知
    if (newDone) {
      const ka = kaMap[task.report_id]
      const obj = ka ? objMap[ka.objective_id] : null
      fetch('/api/slack-task-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          taskTitle: task.title,
          kaTitle: ka?.ka_title,
          objectiveTitle: obj?.title,
          completedBy: task.assignee || myName,
        }),
      }).catch(() => {})
    }
  }
  const deleteTask = async (taskId) => {
    await supabase.from('ka_tasks').delete().eq('id', taskId)
    reloadTasks()
  }
  const updateTaskField = async (taskId, field, value) => {
    await supabase.from('ka_tasks').update({ [field]: value || null }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value || null } : t))
  }

  // Task groups
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today)
  const thisWeekTasks = tasks.filter(t => t.due_date && t.due_date >= today && t.due_date <= thisSunday)
  const otherTasks = tasks.filter(t => !t.due_date || t.due_date > thisSunday)

  // Bar chart data (last 4 weeks)
  const weeks4 = []
  for (let i = 3; i >= 0; i--) {
    const d = new Date(getMonday(new Date()).getTime() - i * 7 * 86400000)
    weeks4.push(toDateStr(d))
  }
  const maxDone = Math.max(1, ...weeks4.map(w => doneTasksByWeek[w] || 0))

  const sectionStyle = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
  const sH = (icon, text, extra) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{text}</span>
      {extra}
    </div>
  )

  if (loading) return <div style={{ padding: 40, color: T.accent, fontSize: 14, background: T.bg, height: '100%' }}>読み込み中...</div>

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif', height: '100%', position: 'relative' }}>
      {/* Left: Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 固定ヘッダー */}
        <div style={{ padding: isMobile ? '10px 12px 8px' : '14px 20px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 700 }}>マイページ</div>
            {!isMobile && <div style={{ fontSize: 11, color: T.textMuted }}>{myName} さんのOKRコーチング</div>}
          </div>
          {/* サマリーバッジ */}
          <div style={{ display: 'flex', gap: isMobile ? 6 : 10, alignItems: 'center', flexShrink: 0 }}>
            {isMobileOrTablet && (
              <button onClick={() => setShowChat(p => !p)} title="AIチャット"
                style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid rgba(77,159,255,0.3)`, background: showChat ? 'rgba(77,159,255,0.15)' : 'transparent', color: '#4d9fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                🤖
              </button>
            )}
            <button onClick={() => setShowPremises(true)} title="AI前提設定"
              style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              ⚙
            </button>
            <div style={{ textAlign: 'center', padding: isMobile ? '3px 8px' : '4px 14px', borderRadius: 8, background: T.sectionBg, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.accent }}>{tasks.length}</div>
              <div style={{ fontSize: 9, color: T.textMuted }}>未完了</div>
            </div>
            {overdueTasks.length > 0 && (
              <div style={{ textAlign: 'center', padding: isMobile ? '3px 8px' : '4px 14px', borderRadius: 8, background: T.overdueBg, border: `1px solid ${T.overdueBorder}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ff6b6b' }}>{overdueTasks.length}</div>
                <div style={{ fontSize: 9, color: '#ff6b6b' }}>期限超過</div>
              </div>
            )}
            <div style={{ textAlign: 'center', padding: isMobile ? '3px 8px' : '4px 14px', borderRadius: 8, background: T.doneBg, border: `1px solid ${T.doneBorder}` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#00d68f' }}>{Object.values(doneTasksByWeek).reduce((a, b) => a + b, 0)}</div>
              <div style={{ fontSize: 9, color: T.textMuted }}>完了(4週)</div>
            </div>
          </div>
        </div>

        {/* スクロール可能コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '10px' : '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 12 }}>

            {/* 左上: 今週のアクションプラン */}
            <div style={{ ...sectionStyle, borderColor: 'rgba(168,85,247,0.3)', background: themeKey === 'dark' ? 'rgba(168,85,247,0.04)' : 'rgba(168,85,247,0.03)', maxHeight: isMobile ? 'none' : 260 }}>
              {sH('🎯', '今週のアクションプラン',
                <button onClick={() => { coachingGenerated.current = false; generateWeeklyCoaching() }} disabled={coachingLoading}
                  style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(168,85,247,0.3)', background: 'transparent', color: '#a855f7', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                  {coachingLoading ? '生成中...' : '更新'}
                </button>
              )}
              <div style={{ flex: 1, overflowY: 'auto', fontSize: 12, lineHeight: 1.65, color: T.textSub }}>
                {coachingLoading ? (
                  <div style={{ color: T.textMuted, padding: '16px 0', textAlign: 'center' }}>AIが今週のプランを生成中...</div>
                ) : weeklyCoaching ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{weeklyCoaching}</div>
                ) : (
                  <div style={{ color: T.textFaint, padding: '10px 0' }}>データを読み込んでいます...</div>
                )}
              </div>
            </div>

            {/* 右上: KA一覧（タブ切替 + ステータス選択） */}
            <div style={{ ...sectionStyle, maxHeight: isMobile ? 'none' : 260 }}>
              {sH('📌', `KA一覧（${allKAs.length}件）`)}
              {/* タブ */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                {[
                  ['all', '全体', allKAs.length, T.textMuted],
                  ['focus', 'Focus', focusKAs.length, '#4d9fff'],
                  ['good', 'Good', goodKAs.length, '#00d68f'],
                  ['more', 'More', moreKAs.length, '#ff6b6b'],
                  ['normal', '未着手', allKAs.filter(k => !k.status || k.status === 'normal').length, T.textFaint],
                  ['done', '完了', allKAs.filter(k => k.status === 'done').length, '#7a8599'],
                ].map(([key, lbl, cnt, col]) => (
                  <button key={key} onClick={() => setKaTab(key)} style={{
                    fontSize: 9, padding: '3px 8px', borderRadius: 4, fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer',
                    background: kaTab === key ? `${col}18` : 'transparent',
                    border: `1px solid ${kaTab === key ? col : T.border}`,
                    color: kaTab === key ? col : T.textFaint,
                  }}>{lbl}{cnt > 0 ? ` ${cnt}` : ''}</button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {(() => {
                  const filtered = kaTab === 'all' ? allKAs : allKAs.filter(ka => (ka.status || 'normal') === kaTab)
                  if (filtered.length === 0) return <div style={{ fontSize: 12, color: T.textFaint, textAlign: 'center', padding: '10px 0' }}>{kaTab === 'all' ? 'KAなし' : '該当KAなし'}</div>
                  return filtered.map(ka => {
                    const st = ka.status || 'normal'
                    const stColors = { focus: { bg: 'rgba(77,159,255,0.1)', border: 'rgba(77,159,255,0.3)', text: '#4d9fff' }, good: { bg: T.doneBg, border: T.doneBorder, text: '#00d68f' }, more: { bg: T.overdueBg, border: T.overdueBorder, text: '#ff6b6b' }, done: { bg: T.sectionBg, border: T.border, text: '#7a8599' }, normal: { bg: T.sectionBg, border: T.border, text: T.textMuted } }
                    const c = stColors[st] || stColors.normal
                    return (
                      <div key={ka.id} style={{ padding: '5px 8px', borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, marginBottom: 3, opacity: st === 'done' ? 0.6 : 1 }}>
                        <div style={{ fontSize: 11, color: st === 'done' ? T.textFaint : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: st === 'done' ? 'line-through' : 'none' }}>{ka.ka_title}</div>
                        <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                          {[['focus','Focus','#4d9fff'],['good','Good','#00d68f'],['more','More','#ff6b6b'],['normal','--',T.textFaint]].map(([key,lbl,col]) => (
                            <button key={key} onClick={() => changeKAStatus(ka, key)} style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 4, fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer',
                              background: st === key ? `${col}20` : 'transparent',
                              border: `1px solid ${st === key ? col : T.border}`,
                              color: st === key ? col : T.textFaint,
                            }}>{lbl}</button>
                          ))}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>

            {/* 左中: マイOKR */}
            <div style={{ ...sectionStyle, maxHeight: isMobile ? 'none' : 260 }}>
              {sH('📊', 'マイOKR')}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {objectives.length === 0 && <div style={{ fontSize: 12, color: T.textFaint }}>担当Objectiveなし</div>}
                {objectives.map(obj => {
                  const krs = keyResults.filter(kr => kr.objective_id === obj.id)
                  return (
                    <div key={obj.id} style={{ marginBottom: 10, padding: 10, borderRadius: 7, background: T.sectionBg, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 6, lineHeight: 1.3 }}>{obj.title}</div>
                      {krs.map(kr => {
                        const pct = kr.target ? Math.round((kr.current / kr.target) * 100) : 0
                        return (
                          <div key={kr.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                              <span style={{ color: T.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{kr.title}</span>
                              <span style={{ fontWeight: 700, color: pct >= 70 ? '#00d68f' : pct >= 40 ? '#ffd166' : '#ff6b6b', flexShrink: 0 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: T.border }}>
                              <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, pct)}%`, background: pct >= 70 ? '#00d68f' : pct >= 40 ? '#ffd166' : '#ff6b6b' }} />
                            </div>
                          </div>
                        )
                      })}
                      <button onClick={() => {
                        const krInfo = krs.map(kr => `${kr.title}: ${kr.target ? Math.round((kr.current/kr.target)*100) : 0}% (${kr.current}${kr.unit}/${kr.target}${kr.unit})`).join('\n')
                        sendToAI(`以下のOKRについて具体的なアドバイスをください。\n\nObjective: ${obj.title}\n${krInfo}\n\n達成率を上げるための具体的なアクションを提案してください。`)
                      }} style={{ marginTop: 6, fontSize: 10, padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.06)', color: '#a855f7', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        🤖 AIアドバイス
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 右中: タスク + AIタスク提案 */}
            <div style={{ ...sectionStyle, maxHeight: isMobile ? 'none' : 260 }}>
              {sH('📋', `タスク（${tasks.length}件）`,
                <button onClick={proposeTasksFromAI} disabled={proposingTasks}
                  style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(77,159,255,0.3)', background: 'rgba(77,159,255,0.06)', color: '#4d9fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                  {proposingTasks ? '検討中...' : '🤖 AIでタスク検討'}
                </button>
              )}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* AI提案タスク */}
                {proposedTasks.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#a855f7', marginBottom: 3 }}>AI提案</div>
                    {proposedTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 5, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', marginBottom: 2, fontSize: 11 }}>
                        <span style={{ color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        {t.accepted ? (
                          <span style={{ fontSize: 9, color: '#00d68f', fontWeight: 700, flexShrink: 0 }}>登録済</span>
                        ) : (
                          <button onClick={() => acceptTask(t)} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(0,214,143,0.4)', background: T.doneBg, color: '#00d68f', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, flexShrink: 0 }}>採用</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setProposedTasks([])} style={{ fontSize: 9, color: T.textFaint, background: 'none', border: 'none', cursor: 'pointer', marginTop: 2, fontFamily: 'inherit' }}>提案を閉じる</button>
                  </div>
                )}
                {(() => {
                  const taskRow = (t, bgStyle) => {
                    const status = t.status || 'not_started'
                    const cfg = TASK_STATUS_CONFIG[status] || TASK_STATUS_CONFIG.not_started
                    const nextStatus = TASK_STATUS_ORDER[(TASK_STATUS_ORDER.indexOf(status) + 1) % TASK_STATUS_ORDER.length]
                    return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 5, ...bgStyle, marginBottom: 2 }}>
                      <button onClick={() => changeTaskStatus(t, nextStatus)} title={`クリックで「${TASK_STATUS_CONFIG[nextStatus].label}」に変更`}
                        style={{ padding: '1px 6px', borderRadius: 4, border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.color, fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                        {cfg.icon} {cfg.label}
                      </button>
                      <input value={t.title} onChange={e => setTasks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                        onBlur={e => updateTaskField(t.id, 'title', e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: T.text, fontSize: 11, outline: 'none', fontFamily: 'inherit', padding: '1px 2px', minWidth: 0 }} />
                      <input type="date" value={t.due_date || ''} onChange={e => updateTaskField(t.id, 'due_date', e.target.value)}
                        style={{ width: 85, background: 'transparent', border: 'none', color: t.due_date && t.due_date < today ? '#ff6b6b' : T.textMuted, fontSize: 9, outline: 'none', fontFamily: 'inherit', flexShrink: 0 }} />
                      <button onClick={() => deleteTask(t.id)} title="削除" style={{ width: 16, height: 16, borderRadius: 3, border: 'none', background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.6 }}>✕</button>
                    </div>
                    )
                  }
                  return (
                    <>
                      {overdueTasks.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#ff6b6b', marginBottom: 3 }}>期限超過 ({overdueTasks.length})</div>
                          {overdueTasks.map(t => taskRow(t, { background: T.overdueBg, border: `1px solid ${T.overdueBorder}` }))}
                        </div>
                      )}
                      {thisWeekTasks.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#ffd166', marginBottom: 3 }}>今週 ({thisWeekTasks.length})</div>
                          {thisWeekTasks.map(t => taskRow(t, { background: T.sectionBg, border: `1px solid ${T.border}` }))}
                        </div>
                      )}
                      {otherTasks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, marginBottom: 3 }}>その他 ({otherTasks.length})</div>
                          {otherTasks.map(t => taskRow(t, { background: T.sectionBg, border: `1px solid ${T.border}` }))}
                        </div>
                      )}
                      {tasks.length === 0 && proposedTasks.length === 0 && <div style={{ fontSize: 12, color: T.textFaint, textAlign: 'center', padding: '10px 0' }}>未完了タスクなし</div>}
                    </>
                  )
                })()}
              </div>
            </div>

            {/* 下段: 過去の努力（横幅いっぱい） */}
            <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {sH('🏆', '過去の努力')}
                <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', marginBottom: 8 }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#00d68f' }}>{Object.values(doneTasksByWeek).reduce((a, b) => a + b, 0)}</span>
                    <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 4 }}>完了タスク(4週)</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: T.accent }}>{doneKACount}</span>
                    <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 4 }}>完了KA</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#a855f7' }}>{focusKAs.length}</span>
                    <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 4 }}>Focus KA</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 40 }}>
                {weeks4.map(w => {
                  const count = doneTasksByWeek[w] || 0
                  const h = Math.max(3, (count / maxDone) * 36)
                  return (
                    <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted }}>{count}</div>
                      <div style={{ width: '100%', height: h, borderRadius: 3, background: 'linear-gradient(180deg, #4d9fff, #a855f7)', opacity: w === thisMonday ? 1 : 0.5 }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {weeks4.map(w => (
                  <div key={w} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: T.textFaint }}>{formatDate(w)}~</div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Right: AI Chat */}
      <div style={{
        width: isMobile ? '100%' : isTablet ? 340 : 380,
        flexShrink: 0, display: isMobileOrTablet && !showChat ? 'none' : 'flex', flexDirection: 'column',
        background: T.chatBg, borderLeft: isMobileOrTablet ? 'none' : `1px solid ${T.chatBorder}`, overflow: 'hidden', height: '100%',
        ...(isMobileOrTablet ? { position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 100, boxShadow: '-4px 0 20px rgba(0,0,0,0.3)' } : {}),
      }}>
        {/* Chat Header */}
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.chatBorder}`, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(77,159,255,0.04)', flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #4d9fff, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🤖</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>OKR AIコーチ</div>
            <div style={{ fontSize: 9, color: '#4d9fff' }}>パーソナルコーチング</div>
          </div>
          {isMobileOrTablet && <button onClick={() => setShowChat(false)} style={{ marginLeft: 'auto', background: 'transparent', border: `1px solid ${T.chatBorder}`, color: T.textMuted, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10, display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 6, alignItems: 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #4d9fff, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🤖</div>
              )}
              <div style={{
                maxWidth: '84%',
                background: m.role === 'user' ? '#4d9fff' : themeKey === 'dark' ? 'rgba(255,255,255,0.05)' : T.sectionBg,
                border: m.role === 'user' ? 'none' : `1px solid ${T.chatBorder}`,
                borderRadius: m.role === 'user' ? '11px 11px 3px 11px' : '11px 11px 11px 3px',
                padding: '8px 11px', fontSize: 11.5, lineHeight: 1.6,
                color: m.role === 'user' ? '#fff' : T.textSub, whiteSpace: 'pre-wrap',
              }}>{m.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, #4d9fff, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🤖</div>
              <div style={{ background: themeKey === 'dark' ? 'rgba(255,255,255,0.05)' : T.sectionBg, border: `1px solid ${T.chatBorder}`, borderRadius: '11px 11px 11px 3px', padding: '9px 13px', display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (<div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#4d9fff', animation: 'coachBounce 1.2s infinite', animationDelay: `${i*0.2}s` }} />))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div style={{ padding: '0 12px 6px' }}>
            <div style={{ fontSize: 9, color: T.textFaint, marginBottom: 4, letterSpacing: '0.1em' }}>おすすめ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => sendToAI(s)} style={{
                  background: 'rgba(77,159,255,0.06)', border: '1px solid rgba(77,159,255,0.2)',
                  borderRadius: 6, padding: '6px 9px', color: '#8ab4ff',
                  fontSize: 10.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${T.chatBorder}`, display: 'flex', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAI() } }}
            placeholder="何でも聞いてください..." rows={2}
            style={{ flex: 1, background: themeKey === 'dark' ? 'rgba(255,255,255,0.05)' : T.sectionBg, border: `1px solid ${T.chatBorder}`, borderRadius: 7, padding: '7px 9px', color: T.text, fontSize: 11.5, outline: 'none', fontFamily: 'inherit', resize: 'none', lineHeight: 1.4 }}
          />
          <button onClick={() => sendToAI()} disabled={!chatInput.trim() || chatLoading} style={{
            width: 32, height: 32, borderRadius: 7, border: 'none',
            background: chatInput.trim() && !chatLoading ? 'linear-gradient(135deg, #4d9fff, #a855f7)' : themeKey === 'dark' ? 'rgba(255,255,255,0.08)' : T.border,
            color: '#fff', cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>↑</button>
        </div>
        <style>{`@keyframes coachBounce { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-5px) } }`}</style>
      </div>

      {/* AI前提設定モーダル */}
      {showPremises && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPremises(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, width: 500, maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 }}>AI前提設定</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12 }}>AIコーチが守るべきルール・前提知識を設定できます</div>
            {premises.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, fontSize: 12, color: T.textSub, padding: '6px 10px', background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 6, lineHeight: 1.5 }}>{p.content}</div>
                <button onClick={async () => {
                  await supabase.from('ai_premises').delete().eq('id', p.id)
                  setPremises(prev => prev.filter(x => x.id !== p.id))
                }} style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${T.overdueBorder}`, background: T.overdueBg, color: '#ff6b6b', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', flexShrink: 0 }}>削除</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <textarea value={premiseEdit} onChange={e => setPremiseEdit(e.target.value)} placeholder="新しい前提を入力..." rows={2}
                style={{ flex: 1, background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 10px', color: T.text, fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none' }}
              />
              <button onClick={async () => {
                if (!premiseEdit.trim()) return
                const { data } = await supabase.from('ai_premises').insert({ content: premiseEdit.trim(), sort_order: premises.length, created_by: myName }).select()
                if (data?.[0]) setPremises(prev => [...prev, data[0]])
                setPremiseEdit('')
              }} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: T.accent, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0, alignSelf: 'flex-end' }}>追加</button>
            </div>
            <button onClick={() => setShowPremises(false)} style={{ marginTop: 14, padding: '6px 16px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', width: '100%' }}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
