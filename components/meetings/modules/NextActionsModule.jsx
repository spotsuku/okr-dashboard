'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { TYPO, RADIUS, SPACING } from '../../../lib/themeTokens'

// ネクストアクションモジュール
// 会議で出たアクションを ka_tasks に INSERT (= ka_key/report_id null の思いつきタスク扱い)。
// 会議中に追加 → 直後に一覧で見えるシンプル UI。
export default function NextActionsModule({ meeting, config, weekStart, T, members = [], myName }) {
  const [title, setTitle]       = useState('')
  const [assignee, setAssignee] = useState(myName || '')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [recent, setRecent]     = useState([])
  const [loadErr, setLoadErr]   = useState(null)

  // 直近 (今日 + 昨日) 追加されたタスクを取得
  const reload = async () => {
    const since = new Date()
    since.setDate(since.getDate() - 1)
    const sinceISO = since.toISOString()
    const { data, error } = await supabase
      .from('ka_tasks')
      .select('id, title, assignee, due_date, done, created_at, ka_key')
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) { setLoadErr(error.message); return }
    setRecent(data || [])
  }

  useEffect(() => { reload() }, [])

  // リアルタイム購読 (他参加者が追加したタスクも即時反映)
  useEffect(() => {
    const ch = supabase.channel(`next_actions_${meeting?.key || 'default'}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ka_tasks' },
          () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [meeting?.key])

  const handleAdd = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    const payload = {
      title:     title.trim(),
      assignee:  assignee || null,
      due_date:  dueDate || null,
      done:      false,
      report_id: null,
      ka_key:    null,
    }
    const { error } = await supabase.from('ka_tasks').insert(payload)
    setSaving(false)
    if (error) { alert('追加失敗: ' + error.message); return }
    setTitle('')
    setDueDate('')
    reload()
  }

  const handleToggle = async (task) => {
    const { error } = await supabase
      .from('ka_tasks')
      .update({ done: !task.done })
      .eq('id', task.id)
    if (error) { alert('更新失敗: ' + error.message); return }
    reload()
  }

  const inputSt = {
    padding: '8px 12px',
    borderRadius: RADIUS.sm,
    border: `1px solid ${T?.border}`,
    background: T?.bg,
    color: T?.text,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: SPACING.lg, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <span style={{ fontSize: 22 }}>➡️</span>
        <span style={{ ...TYPO.title2, color: T?.text }}>ネクストアクション</span>
      </div>

      {/* 入力欄 */}
      <div style={{
        padding: SPACING.md,
        background: T?.bgCard,
        borderRadius: RADIUS.md,
        marginBottom: SPACING.md,
        display: 'flex',
        gap: SPACING.sm,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="アクションを入力 (Enter で追加)"
          style={{ ...inputSt, flex: 1, minWidth: 200 }}
        />
        <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
          <option value="">担当未定</option>
          {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          style={{ ...inputSt, cursor: 'pointer' }}
        />
        <button
          onClick={handleAdd}
          disabled={!title.trim() || saving}
          style={{
            padding: '8px 16px',
            borderRadius: RADIUS.sm,
            border: 'none',
            background: title.trim() && !saving ? (meeting?.color || T?.accent) : T?.border,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: title.trim() && !saving ? 'pointer' : 'not-allowed',
          }}
        >{saving ? '追加中…' : '+ 追加'}</button>
      </div>

      {/* 直近のタスク */}
      <div style={{ ...TYPO.caption, color: T?.textMuted, marginBottom: SPACING.xs }}>
        直近のタスク ({recent.length}件 / 24時間以内に追加)
      </div>
      {loadErr && (
        <div style={{ ...TYPO.caption, color: T?.danger, marginBottom: SPACING.sm }}>
          読み込み失敗: {loadErr}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {recent.map(t => (
          <div key={t.id} style={{
            padding: '8px 12px',
            background: T?.bgCard,
            borderRadius: RADIUS.sm,
            fontSize: 13,
            color: T?.text,
            display: 'flex',
            alignItems: 'center',
            gap: SPACING.sm,
            opacity: t.done ? 0.5 : 1,
            textDecoration: t.done ? 'line-through' : 'none',
          }}>
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => handleToggle(t)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ flex: 1 }}>{t.title}</span>
            {t.assignee && <span style={{ fontSize: 11, color: T?.textMuted }}>👤 {t.assignee}</span>}
            {t.due_date && <span style={{ fontSize: 11, color: T?.textMuted }}>📅 {t.due_date}</span>}
            {!t.ka_key && <span style={{ fontSize: 10, color: '#FFA500', padding: '1px 6px', background: 'rgba(255,165,0,0.1)', borderRadius: 4 }}>KA紐付なし</span>}
          </div>
        ))}
        {recent.length === 0 && !loadErr && (
          <div style={{ ...TYPO.caption, color: T?.textFaint, textAlign: 'center', padding: SPACING.md }}>
            まだタスクが追加されていません。上の入力欄から追加してください。
          </div>
        )}
      </div>
    </div>
  )
}
