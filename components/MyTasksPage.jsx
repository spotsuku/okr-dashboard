'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function toDateStr(d) { return d.toISOString().split('T')[0] }
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return toDateStr(d)
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
  },
  light: {
    bg:'#EEF2F5', bgCard:'#FFFFFF', border:'#E2E8F0', borderMid:'#CBD5E0',
    text:'#2D3748', textSub:'#4A5568', textMuted:'#718096', textFaint:'#A0AEC0',
    accent:'#3B82C4', accentBg:'rgba(59,130,196,0.1)', sectionBg:'#F8FAFC',
    doneBg:'rgba(0,214,143,0.06)', doneBorder:'rgba(0,214,143,0.2)',
    overdueBg:'rgba(255,107,107,0.06)', overdueBorder:'rgba(255,107,107,0.2)',
  },
}

export default function MyTasksPage({ user, members, themeKey = 'dark' }) {
  const T = THEMES[themeKey] || THEMES.dark
  const myName = members?.find(m => m.email === user?.email)?.name || user?.email || ''
  const myMember = members?.find(m => m.name === myName)

  const [tasks, setTasks] = useState([])
  const [kaMap, setKaMap] = useState({})   // reportId -> weekly_report
  const [objMap, setObjMap] = useState({}) // objectiveId -> objective
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)

  const today = toDateStr(new Date())
  const oneWeekAgo = toDateStr(new Date(Date.now() - 7 * 86400000))
  const thisMonday = getMondayOf(new Date())
  const thisSunday = toDateStr(new Date(new Date(thisMonday + 'T00:00:00').getTime() + 6 * 86400000))

  const load = useCallback(async () => {
    if (!myName) return
    setLoading(true)

    // 未完了タスク + 直近1週間の完了タスク
    const [{ data: incompleteTasks }, { data: recentDoneTasks }] = await Promise.all([
      supabase.from('ka_tasks').select('*').eq('assignee', myName).eq('done', false).order('due_date,id'),
      supabase.from('ka_tasks').select('*').eq('assignee', myName).eq('done', true).gte('created_at', oneWeekAgo).order('id', { ascending: false }),
    ])

    const allTasks = [...(incompleteTasks || []), ...(recentDoneTasks || [])]
    if (allTasks.length === 0) { setTasks([]); setKaMap({}); setObjMap({}); setLoading(false); return }

    // 親KA情報を取得
    const reportIds = [...new Set(allTasks.map(t => t.report_id).filter(Boolean))]
    let kas = []
    if (reportIds.length > 0) {
      const { data } = await supabase.from('weekly_reports').select('id,ka_title,objective_id,kr_id,owner,status').in('id', reportIds)
      kas = data || []
    }
    const kaMapNew = {}
    kas.forEach(ka => { kaMapNew[ka.id] = ka })

    // 親Objective情報を取得
    const objIds = [...new Set(kas.map(ka => ka.objective_id).filter(Boolean))]
    let objs = []
    if (objIds.length > 0) {
      const { data } = await supabase.from('objectives').select('id,title,owner,period').in('id', objIds)
      objs = data || []
    }
    const objMapNew = {}
    objs.forEach(o => { objMapNew[o.id] = o })

    setTasks(allTasks)
    setKaMap(kaMapNew)
    setObjMap(objMapNew)
    setLoading(false)
  }, [myName, oneWeekAgo])

  useEffect(() => { load() }, [load])

  const toggleDone = async (taskId, currentDone) => {
    const newDone = !currentDone
    await supabase.from('ka_tasks').update({ done: newDone }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: newDone } : t))

    // Slack通知（完了時のみ、バックグラウンド）
    if (newDone) {
      const task = tasks.find(t => t.id === taskId)
      const ka = task ? kaMap[task.report_id] : null
      const obj = ka ? objMap[ka.objective_id] : null
      fetch('/api/slack-task-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId, taskTitle: task?.title, kaTitle: ka?.ka_title,
          objectiveTitle: obj?.title, completedBy: myName,
        }),
      }).catch(() => {})
    }
  }

  // タスクをグループ分け
  const overdue = tasks.filter(t => !t.done && t.due_date && t.due_date < today)
  const thisWeek = tasks.filter(t => !t.done && t.due_date && t.due_date >= today && t.due_date <= thisSunday)
  const upcoming = tasks.filter(t => !t.done && t.due_date && t.due_date > thisSunday)
  const noDue = tasks.filter(t => !t.done && !t.due_date)
  const done = tasks.filter(t => t.done)

  const renderTask = (task) => {
    const ka = kaMap[task.report_id]
    const obj = ka ? objMap[ka.objective_id] : null
    const isOverdue = !task.done && task.due_date && task.due_date < today
    return (
      <div key={task.id} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: task.done ? T.doneBg : isOverdue ? T.overdueBg : T.bgCard,
        border: `1px solid ${task.done ? T.doneBorder : isOverdue ? T.overdueBorder : T.border}`,
        borderRadius: 10, marginBottom: 6, opacity: task.done ? 0.7 : 1,
      }}>
        {/* チェックボックス */}
        <div onClick={() => toggleDone(task.id, task.done)} style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
          border: `2px solid ${task.done ? '#00d68f' : T.borderMid}`,
          background: task.done ? '#00d68f' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {task.done && <span style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>✓</span>}
        </div>

        {/* タスク情報 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: task.done ? T.textMuted : T.text, textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.4 }}>
            {task.title || '(未入力)'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
            {ka && (
              <span style={{ fontSize: 10, color: T.textMuted, background: T.sectionBg, padding: '1px 6px', borderRadius: 4, border: `1px solid ${T.border}` }}>
                KA: {ka.ka_title || '(無題)'}
              </span>
            )}
            {obj && (
              <span style={{ fontSize: 10, color: T.textFaint }}>
                OKR: {obj.title}
              </span>
            )}
          </div>
        </div>

        {/* 期限 */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          {task.due_date ? (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              color: isOverdue ? '#ff6b6b' : task.due_date <= thisSunday ? '#ffd166' : T.textMuted,
              background: isOverdue ? 'rgba(255,107,107,0.12)' : 'transparent',
            }}>
              {isOverdue && '⚠ '}{formatDate(task.due_date)}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: T.textFaint }}>期限なし</span>
          )}
        </div>
      </div>
    )
  }

  const renderSection = (title, icon, items, color) => {
    if (items.length === 0) return null
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: color || T.text }}>{title}</span>
          <span style={{ fontSize: 11, color: T.textFaint, fontWeight: 600, background: T.sectionBg, padding: '1px 8px', borderRadius: 99, border: `1px solid ${T.border}` }}>{items.length}件</span>
        </div>
        {items.map(renderTask)}
      </div>
    )
  }

  if (loading) return <div style={{ padding: 40, color: T.accent, fontSize: 14 }}>読み込み中...</div>

  const totalIncomplete = overdue.length + thisWeek.length + upcoming.length + noDue.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px' }}>
        {/* ヘッダー */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            {myMember?.avatar_url ? (
              <img src={myMember.avatar_url} alt={myName} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${avatarColor(myName)}60` }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${avatarColor(myName)}25`, border: `2px solid ${avatarColor(myName)}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: avatarColor(myName) }}>
                {myName.slice(0, 2)}
              </div>
            )}
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>マイタスク</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{myName} さんに割り当てられたタスク</div>
            </div>
          </div>

          {/* サマリーバー */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ padding: '8px 16px', borderRadius: 8, background: T.sectionBg, border: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: T.accent }}>{totalIncomplete}</span>
              <span style={{ color: T.textMuted, marginLeft: 6 }}>未完了</span>
            </div>
            {overdue.length > 0 && (
              <div style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', fontSize: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 18, color: '#ff6b6b' }}>{overdue.length}</span>
                <span style={{ color: '#ff6b6b', marginLeft: 6 }}>期限超過</span>
              </div>
            )}
            <div style={{ padding: '8px 16px', borderRadius: 8, background: T.doneBg, border: `1px solid ${T.doneBorder}`, fontSize: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: '#00d68f' }}>{done.length}</span>
              <span style={{ color: T.textMuted, marginLeft: 6 }}>完了済み（1週間）</span>
            </div>
          </div>
        </div>

        {totalIncomplete === 0 && done.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: T.textFaint }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, color: T.text }}>タスクがありません</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>割り当てられたタスクがここに表示されます</div>
          </div>
        )}

        {renderSection('期限超過', '🔴', overdue, '#ff6b6b')}
        {renderSection('今週', '📅', thisWeek, '#ffd166')}
        {renderSection('来週以降', '📋', upcoming)}
        {renderSection('期限なし', '📌', noDue)}

        {/* 完了済み（折りたたみ） */}
        {done.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div onClick={() => setShowDone(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#00d68f' }}>完了済み（直近1週間）</span>
              <span style={{ fontSize: 11, color: T.textFaint, fontWeight: 600, background: T.sectionBg, padding: '1px 8px', borderRadius: 99, border: `1px solid ${T.border}` }}>{done.length}件</span>
              <span style={{ fontSize: 10, color: T.textFaint, marginLeft: 4 }}>{showDone ? '▼' : '▶'}</span>
            </div>
            {showDone && done.map(renderTask)}
          </div>
        )}
      </div>
    </div>
  )
}
