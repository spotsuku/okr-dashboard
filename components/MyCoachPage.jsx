'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { authedFetch } from '../lib/authedFetch'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS, BRAND_GRADIENT } from '../lib/themeTokens'
import { cardStyle, pillStyle, btnSecondary, btnGhost, btnBrand, inputStyle } from '../lib/iosStyles'
import { computeKAKey } from '../lib/kaKey'
import Icon from './Icon'

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

// テーマは lib/themeTokens.js で一元管理。固有フィールドだけ上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    doneBg:'rgba(48,209,88,0.10)', doneBorder:'rgba(48,209,88,0.20)',
    overdueBg:'rgba(255,69,58,0.10)', overdueBorder:'rgba(255,69,58,0.30)',
    chatBg:'#1C1C1E', chatBorder:'rgba(255,255,255,0.10)',
  },
  light: {
    ...COMMON_TOKENS.light,
    doneBg:'rgba(52,199,89,0.10)', doneBorder:'rgba(52,199,89,0.30)',
    overdueBg:'rgba(255,59,48,0.08)', overdueBorder:'rgba(255,59,48,0.30)',
    chatBg:'#FFFFFF', chatBorder:'rgba(0,0,0,0.06)',
  },
}

const SUGGESTIONS = [
  '今日何をすればいいですか？',
  '今週やるべきことを教えて',
  'OKR達成率を上げるアドバイス',
  '最近の頑張りを褒めて',
  'タスクの優先順位を整理して',
]

// iOS システムカラー (T を受けてトークン化)
const taskStatusConfig = (T) => ({
  not_started: { label: '未着手', color: T.textMuted, bg: T.sectionBg, border: T.border, dot: 'circle' },
  in_progress: { label: '進行中', color: T.info,      bg: T.infoBg,    border: T.border, dot: 'half' },
  done:        { label: '完了',   color: T.success,   bg: T.successBg, border: T.border, dot: 'filled' },
})
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
  const [todayEvents, setTodayEvents] = useState([])  // 今日のGoogle Calendar予定

  // AI Chat state
  const WELCOME_MSG = { role: 'assistant', content: `こんにちは！${myName || ''}さんのOKRコーチです。\n\n目標達成に向けて、一緒に頑張りましょう！タスクの整理、OKRアドバイス、今週の計画など何でもご相談ください。` }
  const [messages, setMessages] = useState([WELCOME_MSG])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false)
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
      supabase.from('objectives').select('*').eq('owner', myName).in('period', validPeriods).range(0, 49999),
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
      const { data: krs } = await supabase.from('key_results').select('*').in('objective_id', objIds).range(0, 49999)
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
    // ka_tasks は ka_key で週を跨いで一意化されるため、表示層 dedup は不要
    setTasks(taskRes.data || [])

    // 親KA情報 + Objective情報（Slack通知でOKRタイトルを参照するため）
    const reportIds = [...new Set((taskRes.data || []).map(t => t.report_id).filter(Boolean))]
    if (reportIds.length > 0) {
      const { data: kas } = await supabase.from('weekly_reports').select('id,ka_title,objective_id').in('id', reportIds)
      const km = {}; (kas || []).forEach(k => { km[k.id] = k })
      setKaMap(km)
      const parentObjIds = [...new Set((kas || []).map(k => k.objective_id).filter(Boolean))]
      if (parentObjIds.length > 0) {
        const { data: parentObjs } = await supabase.from('objectives').select('id,title').in('id', parentObjIds)
        const om = {}; (parentObjs || []).forEach(o => { om[o.id] = o }); setObjMap(om)
      }
    }

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

    // 今日のカレンダー予定を取得 (失敗・未連携時は無視。AI文脈に追加するためのもの)
    try {
      const r = await fetch(`/api/integrations/calendar/events?owner=${encodeURIComponent(myName)}&hours=14`)
      if (r.ok) {
        const data = await r.json()
        setTodayEvents(Array.isArray(data?.items) ? data.items : [])
      } else {
        setTodayEvents([])
      }
    } catch {
      setTodayEvents([])
    }
  }, [myName, thisMonday, fiscalYear])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // チャット履歴のロード (myName 確定後に1回だけ)
  // kind='mycoach' で他のチャット履歴 (COOタブ等) と分離
  useEffect(() => {
    if (!myName || chatHistoryLoaded) return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('coaching_chats')
        .select('role, content, created_at')
        .eq('owner', myName)
        .eq('kind', 'mycoach')
        .order('created_at', { ascending: true })
        .limit(200)
      if (!alive) return
      // テーブル未作成 (42P01) や kind カラム未作成 (42703) はサイレント無視
      if (error && error.code !== '42P01' && error.code !== '42703') {
        console.warn('chat history load error:', error)
      }
      if (data && data.length > 0) {
        setMessages([
          WELCOME_MSG,
          ...data.map(r => ({ role: r.role, content: r.content })),
        ])
      }
      setChatHistoryLoaded(true)
    })()
    return () => { alive = false }
  }, [myName, chatHistoryLoaded]) // eslint-disable-line

  // メッセージを履歴テーブルに保存 (kind='mycoach' で識別)
  const saveChatMessage = async (role, content) => {
    if (!myName || !content) return
    try {
      await supabase.from('coaching_chats').insert({ owner: myName, kind: 'mycoach', role, content })
    } catch (e) {
      // テーブル未作成や RLS 拒否はサイレントに無視 (機能は動作させる)
      console.warn('chat save error:', e)
    }
  }

  // 履歴クリア (kind='mycoach' のみ)
  const clearChatHistory = async () => {
    if (!window.confirm('AIチャットの履歴をすべて削除しますか？\n（過去の質問とAI回答が消えます）')) return
    try {
      await supabase.from('coaching_chats').delete()
        .eq('owner', myName).eq('kind', 'mycoach')
    } catch (e) {
      console.warn('chat clear error:', e)
    }
    setMessages([WELCOME_MSG])
  }

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
      // 今日のGoogle Calendar予定 (時刻/タイトル/参加者)
      todayCalendar: (todayEvents || []).map(ev => ({
        title: ev.title,
        startTime: ev.startTime || ev.start,  // route.js が startTime を返す or 元の start ISO
        endTime: ev.endTime || ev.end,
        allDay: !!ev.allDay,
        attendees: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
      })),
      // 期限切れ/今日/明日のタスクを別出ししてAIが優先付けしやすくする
      tasksByUrgency: {
        overdue: tasks.filter(t => t.due_date && t.due_date < today).map(t => ({ title: t.title, due: t.due_date })),
        dueToday: tasks.filter(t => t.due_date === today).map(t => ({ title: t.title })),
        dueThisWeek: tasks.filter(t => t.due_date && t.due_date > today && t.due_date <= thisSunday).map(t => ({ title: t.title, due: t.due_date })),
      },
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
    // ユーザー発言を履歴に保存 (await せず非同期で)
    saveChatMessage('user', userText)
    try {
      const res = await authedFetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })), context: buildContext(), owner: myName }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const fullMsgs = [...newMsgs, { role: 'assistant', content: data.content }]
      setMessages(fullMsgs)
      saveChatMessage('assistant', data.content)

      // Phase 2: 5 回のやり取りごとにプロファイルをバックグラウンド更新
      const userTurns = fullMsgs.filter(m => m.role === 'user').length
      if (myName && userTurns > 0 && userTurns % 5 === 0) {
        fetch('/api/ai/update-profile', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: myName,
            recent_messages: fullMsgs.slice(-20).map(m => ({ role: m.role, content: m.content })),
          }),
        }).catch(() => {})  // バックグラウンド更新失敗は無視
      }
    } catch (e) {
      const errMsg = `エラー: ${e.message}`
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }])
      // エラーメッセージは履歴に残さない (再質問を促す)
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
      const res = await authedFetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: buildContext(), owner: myName }),
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
      const res = await authedFetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: buildContext(), owner: myName }),
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
      report_id: relatedKA?.id || null, ka_key: computeKAKey(relatedKA), done: false,
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

  const sectionStyle = { ...cardStyle({ T, padding: SPACING.md + 2 }), borderRadius: RADIUS.md, display: 'flex', flexDirection: 'column' }
  const sH = (icon, text, extra) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, marginBottom: SPACING.sm, flexShrink: 0 }}>
      {typeof icon === 'string'
        ? <span style={{ ...TYPO.headline }}>{icon}</span>
        : <span style={{ display: 'inline-flex', alignItems: 'center', color: T.textSub }}>{icon}</span>}
      <span style={{ ...TYPO.subhead, fontWeight: 700, color: T.text }}>{text}</span>
      {extra}
    </div>
  )

  if (loading) return <div style={{ padding: SPACING['3xl'] + 8, color: T.accent, ...TYPO.headline, fontWeight: 500, background: T.bg, height: '100%' }}>読み込み中...</div>

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif', height: '100%', position: 'relative' }}>
      {/* Left: Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 固定ヘッダー */}
        <div style={{ padding: isMobile ? '10px 12px 8px' : '14px 20px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...(isMobile ? TYPO.title3 : TYPO.title2), color: T.text }}>マイページ</div>
            {!isMobile && <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted }}>{myName} さんのOKRコーチング</div>}
          </div>
          {/* サマリーバッジ */}
          <div style={{ display: 'flex', gap: isMobile ? SPACING.xs + 2 : SPACING.sm + 2, alignItems: 'center', flexShrink: 0 }}>
            {isMobileOrTablet && (
              <button onClick={() => setShowChat(p => !p)} title="AIチャット"
                style={{ ...btnSecondary({ T, size: 'sm' }), border: `1px solid ${T.accent}4d`, background: showChat ? T.accentBg : 'transparent', color: T.accent, display: 'inline-flex', alignItems: 'center' }}>
                <Icon name="ai" size={15} />
              </button>
            )}
            <button onClick={() => setShowPremises(true)} title="AI前提設定"
              style={{ ...btnSecondary({ T, size: 'sm' }), color: T.textMuted, display: 'inline-flex', alignItems: 'center' }}>
              <Icon name="settings" size={15} />
            </button>
            <div style={{ textAlign: 'center', padding: isMobile ? '3px 8px' : '4px 14px', borderRadius: RADIUS.sm, background: T.sectionBg, border: `1px solid ${T.border}` }}>
              <div style={{ ...TYPO.title3, fontWeight: 700, color: T.accent }}>{tasks.length}</div>
              <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 0, color: T.textMuted }}>未完了</div>
            </div>
            {overdueTasks.length > 0 && (
              <div style={{ textAlign: 'center', padding: isMobile ? '3px 8px' : '4px 14px', borderRadius: RADIUS.sm, background: T.overdueBg, border: `1px solid ${T.overdueBorder}` }}>
                <div style={{ ...TYPO.title3, fontWeight: 700, color: T.danger }}>{overdueTasks.length}</div>
                <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 0, color: T.danger }}>期限超過</div>
              </div>
            )}
            <div style={{ textAlign: 'center', padding: isMobile ? '3px 8px' : '4px 14px', borderRadius: RADIUS.sm, background: T.doneBg, border: `1px solid ${T.doneBorder}` }}>
              <div style={{ ...TYPO.title3, fontWeight: 700, color: T.success }}>{Object.values(doneTasksByWeek).reduce((a, b) => a + b, 0)}</div>
              <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 0, color: T.textMuted }}>完了(4週)</div>
            </div>
          </div>
        </div>

        {/* スクロール可能コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '10px' : '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? SPACING.sm + 2 : SPACING.md }}>

            {/* 左上: 今週のアクションプラン */}
            <div style={{ ...sectionStyle, borderColor: `${T.accent}4d`, background: T.accentBg, maxHeight: isMobile ? 'none' : 260 }}>
              {sH(<Icon name="target" size={14} />, '今週のアクションプラン',
                <button onClick={() => { coachingGenerated.current = false; generateWeeklyCoaching() }} disabled={coachingLoading}
                  style={{ ...btnGhost({ T, size: 'sm' }), marginLeft: 'auto', ...TYPO.caption, fontWeight: 600, letterSpacing: 0, padding: '3px 10px', background: 'transparent', color: T.accent }}>
                  {coachingLoading ? '生成中...' : '更新'}
                </button>
              )}
              <div style={{ flex: 1, overflowY: 'auto', ...TYPO.subhead, fontWeight: 500, lineHeight: 1.65, color: T.textSub }}>
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
              {sH(<Icon name="flag" size={14} />, `KA一覧（${allKAs.length}件）`)}
              {/* タブ */}
              <div style={{ display: 'flex', gap: 2, marginBottom: SPACING.xs + 2, flexShrink: 0, flexWrap: 'wrap' }}>
                {[
                  ['all', '全体', allKAs.length, T.textMuted],
                  ['focus', 'Focus', focusKAs.length, T.accent],
                  ['good', 'Good', goodKAs.length, T.success],
                  ['more', 'More', moreKAs.length, T.danger],
                  ['normal', '未着手', allKAs.filter(k => !k.status || k.status === 'normal').length, T.textFaint],
                  ['done', '完了', allKAs.filter(k => k.status === 'done').length, T.textMuted],
                ].map(([key, lbl, cnt, col]) => (
                  <button key={key} onClick={() => setKaTab(key)} style={{
                    ...TYPO.caption, letterSpacing: 0, padding: '3px 8px', borderRadius: RADIUS.xs, fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer',
                    background: kaTab === key ? `${col}18` : 'transparent',
                    border: `1px solid ${kaTab === key ? col : T.border}`,
                    color: kaTab === key ? col : T.textFaint,
                  }}>{lbl}{cnt > 0 ? ` ${cnt}` : ''}</button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {(() => {
                  const filtered = kaTab === 'all' ? allKAs : allKAs.filter(ka => (ka.status || 'normal') === kaTab)
                  if (filtered.length === 0) return <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textFaint, textAlign: 'center', padding: '10px 0' }}>{kaTab === 'all' ? 'KAなし' : '該当KAなし'}</div>
                  return filtered.map(ka => {
                    const st = ka.status || 'normal'
                    const stColors = { focus: { bg: T.accentBg, border: `${T.accent}4d`, text: T.accent }, good: { bg: T.doneBg, border: T.doneBorder, text: T.success }, more: { bg: T.overdueBg, border: T.overdueBorder, text: T.danger }, done: { bg: T.sectionBg, border: T.border, text: T.textMuted }, normal: { bg: T.sectionBg, border: T.border, text: T.textMuted } }
                    const c = stColors[st] || stColors.normal
                    return (
                      <div key={ka.id} style={{ padding: '5px 8px', borderRadius: RADIUS.xs, background: c.bg, border: `1px solid ${c.border}`, marginBottom: 3, opacity: st === 'done' ? 0.6 : 1 }}>
                        <div style={{ ...TYPO.footnote, fontWeight: 500, color: st === 'done' ? T.textFaint : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: st === 'done' ? 'line-through' : 'none' }}>{ka.ka_title}</div>
                        <div style={{ display: 'flex', gap: 3, marginTop: SPACING.xs }}>
                          {[['focus','Focus',T.accent],['good','Good',T.success],['more','More',T.danger],['normal','--',T.textFaint]].map(([key,lbl,col]) => (
                            <button key={key} onClick={() => changeKAStatus(ka, key)} style={{
                              ...TYPO.caption, letterSpacing: 0, padding: '2px 7px', borderRadius: RADIUS.xs, fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer',
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
              {sH(<Icon name="target" size={14} />, 'マイOKR')}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {objectives.length === 0 && <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textFaint }}>担当Objectiveなし</div>}
                {objectives.map(obj => {
                  const krs = keyResults.filter(kr => kr.objective_id === obj.id)
                  return (
                    <div key={obj.id} style={{ marginBottom: SPACING.sm + 2, padding: SPACING.sm + 2, borderRadius: RADIUS.xs, background: T.sectionBg, border: `1px solid ${T.border}` }}>
                      <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.text, marginBottom: SPACING.xs + 2, lineHeight: 1.3 }}>{obj.title}</div>
                      {krs.map(kr => {
                        const pct = kr.target ? Math.round((kr.current / kr.target) * 100) : 0
                        const pctColor = pct >= 70 ? T.success : pct >= 40 ? T.warn : T.danger
                        return (
                          <div key={kr.id} style={{ marginBottom: SPACING.xs + 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', ...TYPO.caption, fontWeight: 600, letterSpacing: 0, marginBottom: 2 }}>
                              <span style={{ color: T.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: SPACING.sm }}>{kr.title}</span>
                              <span style={{ fontWeight: 700, color: pctColor, flexShrink: 0 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: T.border }}>
                              <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, pct)}%`, background: pctColor }} />
                            </div>
                          </div>
                        )
                      })}
                      <button onClick={() => {
                        const krInfo = krs.map(kr => `${kr.title}: ${kr.target ? Math.round((kr.current/kr.target)*100) : 0}% (${kr.current}${kr.unit}/${kr.target}${kr.unit})`).join('\n')
                        sendToAI(`以下のOKRについて具体的なアドバイスをください。\n\nObjective: ${obj.title}\n${krInfo}\n\n達成率を上げるための具体的なアクションを提案してください。`)
                      }} style={{ ...btnGhost({ T, size: 'sm' }), marginTop: SPACING.xs + 2, ...TYPO.caption, fontWeight: 600, letterSpacing: 0, padding: '4px 10px', background: T.accentBg, color: T.accent, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
                        <Icon name="ai" size={11} /> AIアドバイス
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 右中: タスク + AIタスク提案 */}
            <div style={{ ...sectionStyle, maxHeight: isMobile ? 'none' : 260 }}>
              {sH(<Icon name="workspace" size={14} />, `タスク（${tasks.length}件）`,
                <button onClick={proposeTasksFromAI} disabled={proposingTasks}
                  style={{ ...btnGhost({ T, size: 'sm' }), marginLeft: 'auto', ...TYPO.caption, fontWeight: 600, letterSpacing: 0, padding: '3px 10px', border: `1px solid ${T.info}4d`, background: T.infoBg, color: T.info, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
                  {proposingTasks ? '検討中...' : (<><Icon name="ai" size={11} /> AIでタスク検討</>)}
                </button>
              )}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* AI提案タスク */}
                {proposedTasks.length > 0 && (
                  <div style={{ marginBottom: SPACING.sm }}>
                    <div style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 700, color: T.accent, marginBottom: 3 }}>AI提案</div>
                    {proposedTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, padding: '4px 8px', borderRadius: RADIUS.xs, background: T.accentBg, border: `1px solid ${T.accent}33`, marginBottom: 2, ...TYPO.footnote, fontWeight: 500 }}>
                        <span style={{ color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        {t.accepted ? (
                          <span style={{ ...TYPO.caption, letterSpacing: 0, color: T.success, fontWeight: 700, flexShrink: 0 }}>登録済</span>
                        ) : (
                          <button onClick={() => acceptTask(t)} style={{ ...TYPO.caption, letterSpacing: 0, padding: '2px 8px', borderRadius: RADIUS.xs, border: `1px solid ${T.success}66`, background: T.doneBg, color: T.success, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, flexShrink: 0 }}>採用</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setProposedTasks([])} style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.textFaint, background: 'none', border: 'none', cursor: 'pointer', marginTop: 2, fontFamily: 'inherit' }}>提案を閉じる</button>
                  </div>
                )}
                {(() => {
                  const STATUS_CFG = taskStatusConfig(T)
                  const taskRow = (t, bgStyle) => {
                    const status = t.status || 'not_started'
                    const cfg = STATUS_CFG[status] || STATUS_CFG.not_started
                    const nextStatus = TASK_STATUS_ORDER[(TASK_STATUS_ORDER.indexOf(status) + 1) % TASK_STATUS_ORDER.length]
                    return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs, padding: '3px 6px', borderRadius: RADIUS.xs, ...bgStyle, marginBottom: 2 }}>
                      <button onClick={() => changeTaskStatus(t, nextStatus)} title={`クリックで「${STATUS_CFG[nextStatus].label}」に変更`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: RADIUS.xs, border: `1px solid ${cfg.border}`, background: cfg.bg, color: cfg.color, ...TYPO.caption, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: cfg.dot === 'filled' ? cfg.color : 'transparent', border: cfg.dot === 'filled' ? 'none' : `1.5px solid ${cfg.color}`, boxShadow: cfg.dot === 'half' ? `inset 4px 0 0 ${cfg.color}` : 'none' }} /> {cfg.label}
                      </button>
                      <input value={t.title} onChange={e => setTasks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                        onBlur={e => updateTaskField(t.id, 'title', e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: T.text, ...TYPO.footnote, fontWeight: 500, outline: 'none', fontFamily: 'inherit', padding: '1px 2px', minWidth: 0 }} />
                      <input type="date" value={t.due_date || ''} onChange={e => updateTaskField(t.id, 'due_date', e.target.value)}
                        style={{ width: 85, background: 'transparent', border: 'none', color: t.due_date && t.due_date < today ? T.danger : T.textMuted, ...TYPO.caption, fontWeight: 600, letterSpacing: 0, outline: 'none', fontFamily: 'inherit', flexShrink: 0 }} />
                      <button onClick={() => deleteTask(t.id)} title="削除" style={{ width: 16, height: 16, borderRadius: RADIUS.xs, border: 'none', background: 'transparent', color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.6 }}><Icon name="cross" size={11} /></button>
                    </div>
                    )
                  }
                  return (
                    <>
                      {overdueTasks.length > 0 && (
                        <div style={{ marginBottom: SPACING.xs + 2 }}>
                          <div style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 700, color: T.danger, marginBottom: 3 }}>期限超過 ({overdueTasks.length})</div>
                          {overdueTasks.map(t => taskRow(t, { background: T.overdueBg, border: `1px solid ${T.overdueBorder}` }))}
                        </div>
                      )}
                      {thisWeekTasks.length > 0 && (
                        <div style={{ marginBottom: SPACING.xs + 2 }}>
                          <div style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 700, color: T.warn, marginBottom: 3 }}>今週 ({thisWeekTasks.length})</div>
                          {thisWeekTasks.map(t => taskRow(t, { background: T.sectionBg, border: `1px solid ${T.border}` }))}
                        </div>
                      )}
                      {otherTasks.length > 0 && (
                        <div>
                          <div style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 700, color: T.textMuted, marginBottom: 3 }}>その他 ({otherTasks.length})</div>
                          {otherTasks.map(t => taskRow(t, { background: T.sectionBg, border: `1px solid ${T.border}` }))}
                        </div>
                      )}
                      {tasks.length === 0 && proposedTasks.length === 0 && <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textFaint, textAlign: 'center', padding: '10px 0' }}>未完了タスクなし</div>}
                    </>
                  )
                })()}
              </div>
            </div>

            {/* 下段: 過去の努力（横幅いっぱい） */}
            <div style={{ ...sectionStyle, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.lg }}>
                {sH(<Icon name="star" size={14} />, '過去の努力')}
                <div style={{ display: 'flex', gap: SPACING.lg, marginLeft: 'auto', marginBottom: SPACING.sm }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ ...TYPO.title3, fontWeight: 700, color: T.success }}>{Object.values(doneTasksByWeek).reduce((a, b) => a + b, 0)}</span>
                    <span style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.textMuted, marginLeft: SPACING.xs }}>完了タスク(4週)</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ ...TYPO.title3, fontWeight: 700, color: T.accent }}>{doneKACount}</span>
                    <span style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.textMuted, marginLeft: SPACING.xs }}>完了KA</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ ...TYPO.title3, fontWeight: 700, color: T.accent }}>{focusKAs.length}</span>
                    <span style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.textMuted, marginLeft: SPACING.xs }}>Focus KA</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: SPACING.sm, height: 40 }}>
                {weeks4.map(w => {
                  const count = doneTasksByWeek[w] || 0
                  const h = Math.max(3, (count / maxDone) * 36)
                  return (
                    <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 700, color: T.textMuted }}>{count}</div>
                      <div style={{ width: '100%', height: h, borderRadius: 3, background: `linear-gradient(180deg, ${T.accent}, ${T.accent}99)`, opacity: w === thisMonday ? 1 : 0.5 }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.xs }}>
                {weeks4.map(w => (
                  <div key={w} style={{ flex: 1, textAlign: 'center', fontSize: 8, fontWeight: 700, color: T.textFaint }}>{formatDate(w)}~</div>
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
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.chatBorder}`, display: 'flex', alignItems: 'center', gap: SPACING.sm, background: T.accentBg, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, ${T.accent}99)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="ai" size={15} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYPO.subhead, fontWeight: 700, color: T.text }}>OKR AIコーチ</div>
            <div style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.accent }}>
              パーソナルコーチング
              {messages.length > 1 && ` ・ 履歴 ${messages.length - 1} 件`}
            </div>
          </div>
          {messages.length > 1 && (
            <button
              onClick={clearChatHistory}
              title="履歴をクリア"
              style={{
                background: 'transparent', border: `1px solid ${T.chatBorder}`,
                color: T.textMuted, padding: '4px 8px', borderRadius: RADIUS.xs,
                cursor: 'pointer', ...TYPO.caption, letterSpacing: 0, fontWeight: 600, fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}
            ><Icon name="trash" size={11} /> 履歴</button>
          )}
          {isMobileOrTablet && <button onClick={() => setShowChat(false)} style={{ background: 'transparent', border: `1px solid ${T.chatBorder}`, color: T.textMuted, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cross" size={14} /></button>}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: SPACING.sm + 2, display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: SPACING.xs + 2, alignItems: 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg, ${T.accent}, ${T.accent}99)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="ai" size={12} /></div>
              )}
              <div style={{
                maxWidth: '84%',
                background: m.role === 'user' ? T.accent : T.sectionBg,
                border: m.role === 'user' ? 'none' : `1px solid ${T.chatBorder}`,
                borderRadius: m.role === 'user' ? '11px 11px 3px 11px' : '11px 11px 11px 3px',
                padding: '8px 11px', ...TYPO.footnote, fontWeight: 500, lineHeight: 1.6,
                color: m.role === 'user' ? '#fff' : T.textSub, whiteSpace: 'pre-wrap',
              }}>{m.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: 'flex', gap: SPACING.xs + 2, alignItems: 'flex-start', marginBottom: SPACING.sm + 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, ${T.accent}99)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="ai" size={12} /></div>
              <div style={{ background: T.sectionBg, border: `1px solid ${T.chatBorder}`, borderRadius: '11px 11px 11px 3px', padding: '9px 13px', display: 'flex', gap: SPACING.xs }}>
                {[0,1,2].map(i => (<div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent, animation: 'coachBounce 1.2s infinite', animationDelay: `${i*0.2}s` }} />))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div style={{ padding: '0 12px 6px' }}>
            <div style={{ ...TYPO.caption, color: T.textFaint, marginBottom: SPACING.xs, letterSpacing: '0.1em' }}>おすすめ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => sendToAI(s)} style={{
                  background: T.accentBg, border: `1px solid ${T.accent}33`,
                  borderRadius: RADIUS.xs, padding: '6px 9px', color: T.accentText,
                  ...TYPO.caption, letterSpacing: 0, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${T.chatBorder}`, display: 'flex', gap: SPACING.xs + 2, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAI() } }}
            placeholder="何でも聞いてください..." rows={2}
            style={{ ...inputStyle({ T }), flex: 1, background: T.sectionBg, border: `1px solid ${T.chatBorder}`, borderRadius: RADIUS.sm, padding: '7px 9px', ...TYPO.footnote, fontWeight: 500, resize: 'none', lineHeight: 1.4 }}
          />
          <button onClick={() => sendToAI()} disabled={!chatInput.trim() || chatLoading} style={{
            ...(chatInput.trim() && !chatLoading ? btnBrand({ size: 'md' }) : {}),
            width: 32, height: 32, borderRadius: RADIUS.sm, border: 'none', padding: 0,
            background: chatInput.trim() && !chatLoading ? BRAND_GRADIENT.cta : T.border,
            color: '#fff', cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}><Icon name="arrowUp" size={16} /></button>
        </div>
        <style>{`@keyframes coachBounce { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-5px) } }`}</style>
      </div>

      {/* AI前提設定モーダル */}
      {showPremises && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPremises(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...cardStyle({ T, padding: SPACING.xl }), borderRadius: RADIUS.lg, width: 500, maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ ...TYPO.title3, color: T.text, marginBottom: SPACING.md + 2 }}>AI前提設定</div>
            <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, marginBottom: SPACING.md }}>AIコーチが守るべきルール・前提知識を設定できます</div>
            {premises.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                <div style={{ flex: 1, ...TYPO.subhead, fontWeight: 500, color: T.textSub, padding: '6px 10px', background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: RADIUS.xs, lineHeight: 1.5 }}>{p.content}</div>
                <button onClick={async () => {
                  await supabase.from('ai_premises').delete().eq('id', p.id)
                  setPremises(prev => prev.filter(x => x.id !== p.id))
                }} style={{ padding: '4px 8px', borderRadius: RADIUS.xs, border: `1px solid ${T.overdueBorder}`, background: T.overdueBg, color: T.danger, cursor: 'pointer', ...TYPO.footnote, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}>削除</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.md }}>
              <textarea value={premiseEdit} onChange={e => setPremiseEdit(e.target.value)} placeholder="新しい前提を入力..." rows={2}
                style={{ ...inputStyle({ T }), flex: 1, background: T.sectionBg, borderRadius: RADIUS.xs, padding: '6px 10px', ...TYPO.subhead, fontWeight: 500, resize: 'none' }}
              />
              <button onClick={async () => {
                if (!premiseEdit.trim()) return
                const { data } = await supabase.from('ai_premises').insert({ content: premiseEdit.trim(), sort_order: premises.length, created_by: myName }).select()
                if (data?.[0]) setPremises(prev => [...prev, data[0]])
                setPremiseEdit('')
              }} style={{ ...btnBrand({ size: 'sm' }), padding: '6px 14px', flexShrink: 0, alignSelf: 'flex-end' }}>追加</button>
            </div>
            <button onClick={() => setShowPremises(false)} style={{ ...btnSecondary({ T, size: 'sm' }), marginTop: SPACING.md + 2, padding: '6px 16px', width: '100%' }}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
