'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
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
    sidebarBg:'#141620', sidebarActive:'rgba(77,159,255,0.15)', sidebarHover:'rgba(255,255,255,0.04)',
  },
  light: {
    bg:'#EEF2F5', bgCard:'#FFFFFF', border:'#E2E8F0', borderMid:'#CBD5E0',
    text:'#2D3748', textSub:'#4A5568', textMuted:'#718096', textFaint:'#A0AEC0',
    accent:'#3B82C4', accentBg:'rgba(59,130,196,0.1)', sectionBg:'#F8FAFC',
    doneBg:'rgba(0,214,143,0.06)', doneBorder:'rgba(0,214,143,0.2)',
    overdueBg:'rgba(255,107,107,0.06)', overdueBorder:'rgba(255,107,107,0.2)',
    sidebarBg:'#F7F9FB', sidebarActive:'rgba(59,130,196,0.12)', sidebarHover:'rgba(0,0,0,0.03)',
  },
}

// ─── 確認ダイアログ ──────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel, T }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: '24px 28px', minWidth: 320, maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 18, lineHeight: 1.6 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '7px 18px', borderRadius: 7, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={onConfirm} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#00d68f', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>完了にする</button>
        </div>
      </div>
    </div>
  )
}

// ─── TaskList: 共通タスク表示コンポーネント ───────────
function TaskList({ tasks, kaMap, objMap, T, onToggleDone, onUpdateTask, onDeleteTask, myName }) {
  const today = toDateStr(new Date())
  const thisMonday = getMondayOf(new Date())
  const thisSunday = toDateStr(new Date(new Date(thisMonday + 'T00:00:00').getTime() + 6 * 86400000))
  const [showDone, setShowDone] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const [confirm, setConfirm] = useState(null) // { taskId, done, assignee }
  const editRef = useRef(null)

  // 期日が早い順にソート（null期日は最後）
  const sortByDue = (a, b) => {
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  }

  const overdue = tasks.filter(t => !t.done && t.due_date && t.due_date < today).sort(sortByDue)
  const thisWeek = tasks.filter(t => !t.done && t.due_date && t.due_date >= today && t.due_date <= thisSunday).sort(sortByDue)
  const upcoming = tasks.filter(t => !t.done && t.due_date && t.due_date > thisSunday).sort(sortByDue)
  const noDue = tasks.filter(t => !t.done && !t.due_date)
  const done = tasks.filter(t => t.done)
  const totalIncomplete = overdue.length + thisWeek.length + upcoming.length + noDue.length

  const startEdit = (task) => {
    setEditingId(task.id)
    setEditTitle(task.title || '')
    setEditDue(task.due_date || '')
  }
  const saveEdit = async () => {
    if (!editingId) return
    await onUpdateTask(editingId, { title: editTitle, due_date: editDue || null })
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)

  const handleToggle = (taskId, currentDone, assignee) => {
    // 他人のタスクを完了にする場合は確認ダイアログ
    if (!currentDone && assignee && assignee !== myName) {
      setConfirm({ taskId, done: currentDone, assignee })
    } else {
      onToggleDone(taskId, currentDone)
    }
  }

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  const renderTask = (task) => {
    const ka = kaMap[task.report_id]
    const obj = ka ? objMap[ka.objective_id] : null
    const isOverdue = !task.done && task.due_date && task.due_date < today
    const isEditing = editingId === task.id

    return (
      <div key={task.id} style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
        background: task.done ? T.doneBg : isOverdue ? T.overdueBg : T.bgCard,
        border: `1px solid ${task.done ? T.doneBorder : isOverdue ? T.overdueBorder : T.border}`,
        borderRadius: 10, marginBottom: 6, opacity: task.done ? 0.7 : 1,
      }}>
        <div onClick={() => handleToggle(task.id, task.done, task.assignee)} style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0, cursor: 'pointer', marginTop: 2,
          border: `2px solid ${task.done ? '#00d68f' : T.borderMid}`,
          background: task.done ? '#00d68f' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {task.done && <span style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>✓</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input ref={editRef} value={editTitle} onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.accent}`, background: T.bg, color: T.text, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: T.textMuted }}>期日:</span>
                <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                />
                <button onClick={saveEdit} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#00d68f', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>保存</button>
                <button onClick={cancelEdit} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span onClick={() => !task.done && startEdit(task)} style={{ fontSize: 13, fontWeight: 600, color: task.done ? T.textMuted : T.text, textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.4, cursor: task.done ? 'default' : 'pointer' }} title={task.done ? '' : 'クリックして編集'}>
                  {task.title || '(未入力)'}
                </span>
                {task.assignee && (
                  <span style={{ fontSize: 10, color: avatarColor(task.assignee), fontWeight: 600 }}>
                    @{task.assignee}
                  </span>
                )}
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
            </>
          )}
        </div>
        {!isEditing && (
          <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>
            {!task.done && (
              <span onClick={() => startEdit(task)} style={{ fontSize: 11, color: T.textFaint, cursor: 'pointer', padding: '2px 4px' }} title="編集">✏️</span>
            )}
            <span onClick={() => { if (window.confirm(`「${task.title}」を削除しますか？`)) onDeleteTask(task.id) }} style={{ fontSize: 11, color: '#ff6b6b', cursor: 'pointer', padding: '2px 4px', opacity: 0.6 }} title="削除">🗑</span>
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
        )}
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

  return (
    <>
      {/* 確認ダイアログ */}
      {confirm && (
        <ConfirmDialog
          T={T}
          message={`「${confirm.assignee}」さんのタスクを完了にしますか？`}
          onConfirm={() => { onToggleDone(confirm.taskId, confirm.done); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* サマリーバー */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
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
    </>
  )
}

// ─── メイン ─────────────────────────────────────────
export default function MyTasksPage({ user, members, themeKey = 'dark' }) {
  const T = THEMES[themeKey] || THEMES.dark
  const myName = members?.find(m => m.email === user?.email)?.name || user?.email || ''
  const [viewMode, setViewMode] = useState('my') // 'my' | 'all'
  const [selectedMember, setSelectedMember] = useState(null) // 全社タスク用

  const [allTasks, setAllTasks] = useState([])
  const [kaMap, setKaMap] = useState({})
  const [objMap, setObjMap] = useState({})
  const [loading, setLoading] = useState(true)

  const oneWeekAgo = toDateStr(new Date(Date.now() - 7 * 86400000))

  const load = useCallback(async () => {
    setLoading(true)
    // 全タスクを取得（全社モード用にフィルタなし）
    const [{ data: incompleteTasks }, { data: recentDoneTasks }] = await Promise.all([
      supabase.from('ka_tasks').select('*').eq('done', false).order('due_date').order('id'),
      supabase.from('ka_tasks').select('*').eq('done', true).gte('created_at', oneWeekAgo).order('id', { ascending: false }),
    ])

    const tasks = [...(incompleteTasks || []), ...(recentDoneTasks || [])]
    // 重複排除: IDで重複排除 + 同じtitle+assigneeの組み合わせは最新のものだけ残す
    const seenId = new Set()
    const byId = tasks.filter(t => { if (seenId.has(t.id)) return false; seenId.add(t.id); return true })
    const byKey = {}
    for (const t of byId) {
      const key = `${t.title}_${t.assignee}_${t.done}`
      if (!byKey[key] || t.id > byKey[key].id) byKey[key] = t
    }
    const uniqueTasks = Object.values(byKey)

    if (uniqueTasks.length === 0) { setAllTasks([]); setKaMap({}); setObjMap({}); setLoading(false); return }

    const reportIds = [...new Set(uniqueTasks.map(t => t.report_id).filter(Boolean))]
    let kas = []
    if (reportIds.length > 0) {
      const { data } = await supabase.from('weekly_reports').select('id,ka_title,objective_id,kr_id,owner,status').in('id', reportIds)
      kas = data || []
    }
    const kaMapNew = {}
    kas.forEach(ka => { kaMapNew[ka.id] = ka })

    const objIds = [...new Set(kas.map(ka => ka.objective_id).filter(Boolean))]
    let objs = []
    if (objIds.length > 0) {
      const { data } = await supabase.from('objectives').select('id,title,owner,period').in('id', objIds)
      objs = data || []
    }
    const objMapNew = {}
    objs.forEach(o => { objMapNew[o.id] = o })

    setAllTasks(uniqueTasks)
    setKaMap(kaMapNew)
    setObjMap(objMapNew)
    setLoading(false)
  }, [oneWeekAgo])

  useEffect(() => { load() }, [load])

  const toggleDone = async (taskId, currentDone) => {
    const newDone = !currentDone
    await supabase.from('ka_tasks').update({ done: newDone }).eq('id', taskId)
    setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: newDone } : t))
    if (newDone) {
      const task = allTasks.find(t => t.id === taskId)
      const ka = task ? kaMap[task.report_id] : null
      const obj = ka ? objMap[ka.objective_id] : null
      fetch('/api/slack-task-done', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, taskTitle: task?.title, kaTitle: ka?.ka_title, objectiveTitle: obj?.title, completedBy: task?.assignee || myName }),
      }).catch(() => {})
    }
  }

  const updateTask = async (taskId, fields) => {
    await supabase.from('ka_tasks').update(fields).eq('id', taskId)
    setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...fields } : t))
  }

  // メンバーリスト（タスクがあるメンバーのみ + 全員）
  const assigneeSet = new Set(allTasks.map(t => t.assignee).filter(Boolean))
  const membersWithTasks = (members || []).filter(m => assigneeSet.has(m.name))
  // タスク数を計算
  const taskCountByMember = {}
  allTasks.forEach(t => {
    if (t.assignee && !t.done) {
      taskCountByMember[t.assignee] = (taskCountByMember[t.assignee] || 0) + 1
    }
  })

  // フィルタ済みタスク
  const filteredTasks = viewMode === 'my'
    ? allTasks.filter(t => t.assignee === myName)
    : selectedMember
      ? allTasks.filter(t => t.assignee === selectedMember)
      : allTasks

  const targetName = viewMode === 'my' ? myName : selectedMember
  const targetMember = members?.find(m => m.name === targetName)

  if (loading) return <div style={{ padding: 40, color: T.accent, fontSize: 14 }}>読み込み中...</div>

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif' }}>
      {/* 全社モード時のサイドバー */}
      {viewMode === 'all' && (
        <div style={{
          width: 200, flexShrink: 0, overflowY: 'auto', background: T.sidebarBg,
          borderRight: `1px solid ${T.border}`, padding: '12px 0',
        }}>
          <div style={{ padding: '4px 12px 10px', fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: 1 }}>メンバー</div>
          {/* 全員ボタン */}
          <div onClick={() => setSelectedMember(null)} style={{
            padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: !selectedMember ? T.sidebarActive : 'transparent',
            color: !selectedMember ? T.accent : T.textSub,
            borderLeft: !selectedMember ? `3px solid ${T.accent}` : '3px solid transparent',
          }}>
            全員
            <span style={{ fontSize: 10, color: T.textFaint, marginLeft: 6 }}>{allTasks.filter(t => !t.done).length}</span>
          </div>
          {membersWithTasks.map(m => {
            const isActive = selectedMember === m.name
            const count = taskCountByMember[m.name] || 0
            return (
              <div key={m.name} onClick={() => setSelectedMember(m.name)} style={{
                padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                background: isActive ? T.sidebarActive : 'transparent',
                borderLeft: isActive ? `3px solid ${T.accent}` : '3px solid transparent',
              }}>
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt={m.name} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${avatarColor(m.name)}25`, border: `1.5px solid ${avatarColor(m.name)}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: avatarColor(m.name) }}>
                    {m.name.slice(0, 2)}
                  </div>
                )}
                <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? T.accent : T.textSub, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}
                </span>
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, background: T.sectionBg, padding: '1px 6px', borderRadius: 99, border: `1px solid ${T.border}` }}>{count}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* メインコンテンツ */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px' }}>
          {/* ヘッダー */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {targetMember?.avatar_url ? (
                <img src={targetMember.avatar_url} alt={targetName} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${avatarColor(targetName)}60` }} />
              ) : targetName ? (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${avatarColor(targetName)}25`, border: `2px solid ${avatarColor(targetName)}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: avatarColor(targetName) }}>
                  {targetName.slice(0, 2)}
                </div>
              ) : null}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {viewMode === 'my' ? 'マイタスク' : selectedMember ? `${selectedMember} のタスク` : '全社タスク'}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted }}>
                  {viewMode === 'my' ? `${myName} さんに割り当てられたタスク` : selectedMember ? `${selectedMember} さんに割り当てられたタスク` : '全メンバーのタスク一覧'}
                </div>
              </div>
              {/* ビュー切替 */}
              <div style={{ display: 'flex', background: T.sectionBg, borderRadius: 8, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                <button onClick={() => setViewMode('my')} style={{
                  padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  background: viewMode === 'my' ? T.accent : 'transparent',
                  color: viewMode === 'my' ? '#fff' : T.textMuted,
                }}>マイタスク</button>
                <button onClick={() => setViewMode('all')} style={{
                  padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  background: viewMode === 'all' ? T.accent : 'transparent',
                  color: viewMode === 'all' ? '#fff' : T.textMuted,
                }}>全社タスク</button>
              </div>
            </div>
          </div>

          <TaskList tasks={filteredTasks} kaMap={kaMap} objMap={objMap} T={T} onToggleDone={toggleDone} onUpdateTask={updateTask} onDeleteTask={async (id) => { await supabase.from('ka_tasks').delete().eq('id', id); load() }} myName={myName} />
        </div>
      </div>
    </div>
  )
}
