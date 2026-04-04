'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

function toDateStr(d) { return d.toISOString().split('T')[0] }
function getMonday(d) {
  const dt = new Date(d); const day = dt.getDay()
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1))
  dt.setHours(0,0,0,0); return dt
}
function formatDate(ds) {
  if (!ds) return ''
  const d = new Date(ds + 'T00:00:00')
  return `${d.getMonth()+1}/${d.getDate()}`
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

export default function MyCoachPage({ user, members, themeKey = 'dark' }) {
  const T = THEMES[themeKey] || THEMES.dark
  const myName = members?.find(m => m.email === user?.email)?.name || user?.email || ''

  // Data state
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [weekKAs, setWeekKAs] = useState([])
  const [tasks, setTasks] = useState([])
  const [doneTasksByWeek, setDoneTasksByWeek] = useState({})
  const [doneKACount, setDoneKACount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [kaMap, setKaMap] = useState({})

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

    const [objRes, taskRes, doneRes, kaRes, doneKARes] = await Promise.all([
      supabase.from('objectives').select('*').eq('owner', myName),
      supabase.from('ka_tasks').select('*').eq('assignee', myName).eq('done', false).order('due_date').order('id'),
      supabase.from('ka_tasks').select('id,created_at,done').eq('assignee', myName).eq('done', true).gte('created_at', fourWeeksAgo),
      supabase.from('weekly_reports').select('*').eq('owner', myName).eq('week_start', thisMonday),
      supabase.from('weekly_reports').select('id').eq('owner', myName).eq('status', 'done'),
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

    setWeekKAs(kaRes.data || [])
    setTasks(taskRes.data || [])

    // 親KA情報
    const reportIds = [...new Set((taskRes.data || []).map(t => t.report_id).filter(Boolean))]
    if (reportIds.length > 0) {
      const { data: kas } = await supabase.from('weekly_reports').select('id,ka_title,objective_id').in('id', reportIds)
      const km = {}; (kas || []).forEach(k => { km[k.id] = k })
      setKaMap(km)
    }

    // 週ごとの完了タスク数
    const byWeek = {}
    for (const t of (doneRes.data || [])) {
      const w = toDateStr(getMonday(new Date(t.created_at)))
      byWeek[w] = (byWeek[w] || 0) + 1
    }
    setDoneTasksByWeek(byWeek)

    setLoading(false)
  }, [myName, thisMonday])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // AI context
  const buildContext = () => ({
    user: myName,
    objectives: objectives.map(o => ({ title: o.title, period: o.period })),
    keyResults: keyResults.map(kr => ({
      title: kr.title, current: kr.current, target: kr.target, unit: kr.unit,
      pct: kr.target ? Math.round((kr.current / kr.target) * 100) : 0,
    })),
    thisWeekKAs: weekKAs.map(ka => ({ title: ka.ka_title, status: ka.status, good: ka.good, more: ka.more })),
    incompleteTasks: tasks.slice(0, 20).map(t => ({ title: t.title, due: t.due_date })),
    stats: { doneKAs: doneKACount, totalIncompleteTasks: tasks.length },
  })

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

  // Weekly coaching auto-generate
  const generateWeeklyCoaching = useCallback(async () => {
    if (loading || tasks.length === 0 && weekKAs.length === 0 && keyResults.length === 0) return
    setCoachingLoading(true)
    const prompt = `${myName}さんの今週のアクションプランを作成してください。

今週のKA: ${weekKAs.map(ka => ka.ka_title).join(', ') || 'なし'}
未完了タスク: ${tasks.slice(0, 10).map(t => `${t.title}${t.due_date ? '(期限:'+formatDate(t.due_date)+')' : ''}`).join(', ') || 'なし'}
KR進捗: ${keyResults.map(kr => `${kr.title}: ${kr.target ? Math.round((kr.current/kr.target)*100) : 0}%`).join(', ') || 'なし'}

優先順位をつけて、具体的な行動を3-5つ提案してください。簡潔にお願いします。`

    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: buildContext() }),
      })
      const data = await res.json()
      setWeeklyCoaching(data.error ? `エラー: ${data.error}` : data.content)
    } catch (e) {
      setWeeklyCoaching(`エラー: ${e.message}`)
    } finally {
      setCoachingLoading(false)
    }
  }, [loading, myName, tasks, weekKAs, keyResults]) // eslint-disable-line

  useEffect(() => {
    if (!loading && !coachingGenerated.current && myName) {
      coachingGenerated.current = true
      generateWeeklyCoaching()
    }
  }, [loading, myName]) // eslint-disable-line

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

  const sectionStyle = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }
  const sectionTitle = (icon, text) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{text}</span>
    </div>
  )

  if (loading) return <div style={{ padding: 40, color: T.accent, fontSize: 14, background: T.bg, height: '100%' }}>読み込み中...</div>

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif' }}>
      {/* Left: Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>マイページ</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{myName} さんのOKRコーチング</div>
          </div>

          {/* Section 3: Weekly Coaching */}
          <div style={{ ...sectionStyle, borderColor: 'rgba(168,85,247,0.3)', background: themeKey === 'dark' ? 'rgba(168,85,247,0.04)' : 'rgba(168,85,247,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🎯</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#a855f7' }}>今週のアクションプラン</span>
              </div>
              <button onClick={() => { coachingGenerated.current = false; generateWeeklyCoaching() }} disabled={coachingLoading}
                style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid rgba(168,85,247,0.3)`, background: 'transparent', color: '#a855f7', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                {coachingLoading ? '生成中...' : '更新'}
              </button>
            </div>
            {coachingLoading ? (
              <div style={{ fontSize: 13, color: T.textMuted, padding: '20px 0', textAlign: 'center' }}>AIが今週のプランを生成中...</div>
            ) : weeklyCoaching ? (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: T.textSub, whiteSpace: 'pre-wrap' }}>{weeklyCoaching}</div>
            ) : (
              <div style={{ fontSize: 13, color: T.textFaint, padding: '10px 0' }}>データを読み込んでいます...</div>
            )}
          </div>

          {/* Section 1: Tasks */}
          <div style={sectionStyle}>
            {sectionTitle('📋', `タスク（${tasks.length}件未完了）`)}
            {overdueTasks.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ff6b6b', marginBottom: 4 }}>期限超過 ({overdueTasks.length})</div>
                {overdueTasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: T.overdueBg, border: `1px solid ${T.overdueBorder}`, marginBottom: 3, fontSize: 12 }}>
                    <span style={{ color: T.text }}>{t.title}</span>
                    <span style={{ color: '#ff6b6b', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>⚠ {formatDate(t.due_date)}</span>
                  </div>
                ))}
              </div>
            )}
            {thisWeekTasks.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ffd166', marginBottom: 4 }}>今週 ({thisWeekTasks.length})</div>
                {thisWeekTasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: T.sectionBg, border: `1px solid ${T.border}`, marginBottom: 3, fontSize: 12 }}>
                    <div>
                      <span style={{ color: T.text }}>{t.title}</span>
                      {kaMap[t.report_id] && <span style={{ fontSize: 10, color: T.textFaint, marginLeft: 6 }}>KA: {kaMap[t.report_id].ka_title}</span>}
                    </div>
                    <span style={{ color: T.textMuted, flexShrink: 0, marginLeft: 8 }}>{formatDate(t.due_date)}</span>
                  </div>
                ))}
              </div>
            )}
            {otherTasks.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 4 }}>その他 ({otherTasks.length})</div>
                {otherTasks.slice(0, 5).map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: T.sectionBg, border: `1px solid ${T.border}`, marginBottom: 3, fontSize: 12 }}>
                    <span style={{ color: T.text }}>{t.title}</span>
                    <span style={{ color: T.textFaint, flexShrink: 0, marginLeft: 8 }}>{t.due_date ? formatDate(t.due_date) : '期限なし'}</span>
                  </div>
                ))}
                {otherTasks.length > 5 && <div style={{ fontSize: 11, color: T.textFaint, marginTop: 4 }}>...他 {otherTasks.length - 5}件</div>}
              </div>
            )}
            {tasks.length === 0 && <div style={{ fontSize: 13, color: T.textFaint, padding: '10px 0', textAlign: 'center' }}>未完了タスクなし</div>}
          </div>

          {/* Section 2: My OKR Advice */}
          <div style={sectionStyle}>
            {sectionTitle('📊', 'マイOKR')}
            {objectives.length === 0 && <div style={{ fontSize: 13, color: T.textFaint }}>担当Objectiveがありません</div>}
            {objectives.map(obj => {
              const krs = keyResults.filter(kr => kr.objective_id === obj.id)
              return (
                <div key={obj.id} style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: T.sectionBg, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>{obj.title}</div>
                  {krs.map(kr => {
                    const pct = kr.target ? Math.round((kr.current / kr.target) * 100) : 0
                    return (
                      <div key={kr.id} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: T.textSub }}>{kr.title}</span>
                          <span style={{ fontWeight: 700, color: pct >= 70 ? '#00d68f' : pct >= 40 ? '#ffd166' : '#ff6b6b' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: T.border }}>
                          <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, pct)}%`, background: pct >= 70 ? '#00d68f' : pct >= 40 ? '#ffd166' : '#ff6b6b', transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    )
                  })}
                  <button onClick={() => {
                    const krInfo = krs.map(kr => `${kr.title}: ${kr.target ? Math.round((kr.current/kr.target)*100) : 0}% (${kr.current}${kr.unit}/${kr.target}${kr.unit})`).join('\n')
                    sendToAI(`以下のOKRについて具体的なアドバイスをください。\n\nObjective: ${obj.title}\n${krInfo}\n\n達成率を上げるための具体的なアクションを提案してください。`)
                  }} style={{ marginTop: 8, fontSize: 11, padding: '5px 12px', borderRadius: 6, border: `1px solid rgba(168,85,247,0.3)`, background: 'rgba(168,85,247,0.06)', color: '#a855f7', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    🤖 AIにアドバイスをもらう
                  </button>
                </div>
              )
            })}
          </div>

          {/* Section 4: Effort Visualization */}
          <div style={sectionStyle}>
            {sectionTitle('🏆', '過去の努力')}
            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#00d68f' }}>{Object.values(doneTasksByWeek).reduce((a, b) => a + b, 0)}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>完了タスク (4週)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: T.accent }}>{doneKACount}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>完了KA (累計)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#a855f7' }}>{weekKAs.length}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>今週のKA</div>
              </div>
            </div>
            {/* Bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 60, marginBottom: 8 }}>
              {weeks4.map(w => {
                const count = doneTasksByWeek[w] || 0
                const h = Math.max(4, (count / maxDone) * 56)
                return (
                  <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>{count}</div>
                    <div style={{ width: '100%', height: h, borderRadius: 4, background: `linear-gradient(180deg, #4d9fff, #a855f7)`, opacity: w === thisMonday ? 1 : 0.5 }} />
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {weeks4.map(w => (
                <div key={w} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: T.textFaint }}>{formatDate(w)}~</div>
              ))}
            </div>
            <button onClick={() => {
              const total = Object.values(doneTasksByWeek).reduce((a, b) => a + b, 0)
              sendToAI(`最近4週間で${total}件のタスクを完了し、${doneKACount}件のKAを達成しました。${weekKAs.length}件のKAに今週取り組んでいます。この頑張りを褒めて、さらにモチベーションを上げてください！`)
            }} style={{ marginTop: 12, fontSize: 11, padding: '6px 14px', borderRadius: 6, border: `1px solid ${T.doneBorder}`, background: T.doneBg, color: '#00d68f', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, width: '100%' }}>
              🎉 AIに褒めてもらう
            </button>
          </div>
        </div>
      </div>

      {/* Right: AI Chat */}
      <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column', background: T.chatBg, borderLeft: `1px solid ${T.chatBorder}` }}>
        {/* Chat Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.chatBorder}`, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(77,159,255,0.04)' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #4d9fff, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤖</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>OKR AIコーチ</div>
            <div style={{ fontSize: 10, color: '#4d9fff' }}>パーソナルコーチング</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #4d9fff, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🤖</div>
              )}
              <div style={{
                maxWidth: '82%',
                background: m.role === 'user' ? '#4d9fff' : themeKey === 'dark' ? 'rgba(255,255,255,0.05)' : T.sectionBg,
                border: m.role === 'user' ? 'none' : `1px solid ${T.chatBorder}`,
                borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '9px 12px', fontSize: 12, lineHeight: 1.65,
                color: m.role === 'user' ? '#fff' : T.textSub, whiteSpace: 'pre-wrap',
              }}>{m.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #4d9fff, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🤖</div>
              <div style={{ background: themeKey === 'dark' ? 'rgba(255,255,255,0.05)' : T.sectionBg, border: `1px solid ${T.chatBorder}`, borderRadius: '12px 12px 12px 4px', padding: '10px 14px', display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (<div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#4d9fff', animation: 'coachBounce 1.2s infinite', animationDelay: `${i*0.2}s` }} />))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div style={{ padding: '0 14px 8px' }}>
            <div style={{ fontSize: 9, color: T.textFaint, marginBottom: 6, letterSpacing: '0.1em' }}>おすすめ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => sendToAI(s)} style={{
                  background: 'rgba(77,159,255,0.06)', border: `1px solid rgba(77,159,255,0.2)`,
                  borderRadius: 7, padding: '7px 10px', color: '#8ab4ff',
                  fontSize: 11, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '8px 12px 12px', borderTop: `1px solid ${T.chatBorder}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAI() } }}
            placeholder="何でも聞いてください..." rows={2}
            style={{ flex: 1, background: themeKey === 'dark' ? 'rgba(255,255,255,0.05)' : T.sectionBg, border: `1px solid ${T.chatBorder}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'none', lineHeight: 1.5 }}
          />
          <button onClick={() => sendToAI()} disabled={!chatInput.trim() || chatLoading} style={{
            width: 34, height: 34, borderRadius: 8, border: 'none',
            background: chatInput.trim() && !chatLoading ? 'linear-gradient(135deg, #4d9fff, #a855f7)' : themeKey === 'dark' ? 'rgba(255,255,255,0.08)' : T.border,
            color: '#fff', cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed',
            fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>↑</button>
        </div>
        <style>{`@keyframes coachBounce { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-5px) } }`}</style>
      </div>
    </div>
  )
}
