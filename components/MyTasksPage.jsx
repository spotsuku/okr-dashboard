'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import { computeKAKey } from '../lib/kaKey'

const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// JST基準のYYYY-MM-DDを返す
function toDateStr(d) {
  if (typeof d === 'string') return d
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}
// JST基準で「入力日時を含む週の月曜日」のYYYY-MM-DDを返す
function getMondayOf(date) {
  const dt = typeof date === 'string' ? new Date(date) : (date || new Date())
  const jst = new Date(dt.getTime() + 9 * 3600 * 1000)
  const jstDay = jst.getUTCDay()
  const diff = jstDay === 0 ? -6 : 1 - jstDay
  const mon = new Date(Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + diff
  ))
  return mon.toISOString().split('T')[0]
}
function formatDate(ds) {
  if (!ds) return ''
  const d = new Date(ds + 'T00:00:00')
  return `${d.getMonth()+1}/${d.getDate()}`
}

// ステータス定義
const STATUS_CONFIG = {
  not_started: { label: '未着手', color: '#7a8599', bg: 'rgba(122,133,153,0.08)', border: 'rgba(122,133,153,0.2)', icon: '○' },
  in_progress: { label: '進行中', color: '#4d9fff', bg: 'rgba(77,159,255,0.08)', border: 'rgba(77,159,255,0.2)', icon: '◐' },
  done:        { label: '完了',   color: '#00d68f', bg: 'rgba(0,214,143,0.08)', border: 'rgba(0,214,143,0.2)', icon: '●' },
}
const STATUS_ORDER = ['not_started', 'in_progress', 'done']

// iOS/iPadOS 風のシステムカラー
const THEMES = {
  dark: {
    bg:'#000000', bgCard:'#1C1C1E', border:'rgba(255,255,255,0.10)', borderMid:'rgba(255,255,255,0.16)',
    text:'#F5F5F7', textSub:'#C7C7CC', textMuted:'#8E8E93', textFaint:'#48484A',
    accent:'#0A84FF', accentBg:'rgba(10,132,255,0.16)', sectionBg:'rgba(255,255,255,0.04)',
    doneBg:'rgba(48,209,88,0.10)', doneBorder:'rgba(48,209,88,0.20)',
    overdueBg:'rgba(255,69,58,0.10)', overdueBorder:'rgba(255,69,58,0.30)',
    sidebarBg:'#1C1C1E', sidebarActive:'rgba(10,132,255,0.18)', sidebarHover:'rgba(255,255,255,0.04)',
  },
  light: {
    bg:'#F2F2F7', bgCard:'#FFFFFF', border:'rgba(0,0,0,0.06)', borderMid:'rgba(0,0,0,0.12)',
    text:'#1C1C1E', textSub:'#3A3A3C', textMuted:'#8E8E93', textFaint:'#C7C7CC',
    accent:'#007AFF', accentBg:'rgba(0,122,255,0.10)', sectionBg:'rgba(0,0,0,0.03)',
    doneBg:'rgba(52,199,89,0.10)', doneBorder:'rgba(52,199,89,0.30)',
    overdueBg:'rgba(255,59,48,0.08)', overdueBorder:'rgba(255,59,48,0.30)',
    sidebarBg:'#FFFFFF', sidebarActive:'rgba(0,122,255,0.10)', sidebarHover:'rgba(0,0,0,0.03)',
  },
}

// ─── ステータスバッジ ──────────────────────────────────
function StatusBadge({ status, onChange, T }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_started

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(p => !p)} style={{
        padding: '2px 8px', borderRadius: 4, border: `1px solid ${cfg.border}`,
        background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}>
        {cfg.icon} {cfg.label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 100, marginTop: 4,
          background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 8,
          padding: 4, minWidth: 120, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {STATUS_ORDER.map(s => {
            const c = STATUS_CONFIG[s]
            return (
              <button key={s} onClick={() => { onChange(s); setOpen(false) }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: s === status ? c.bg : 'transparent',
                color: s === status ? c.color : T.text, fontSize: 11, fontWeight: 600,
              }}>
                {c.icon} {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
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

// ─── タスク作成モーダル ──────────────────────────────────
export function TaskCreateModal({ onClose, onCreated, members, myName, T, defaultDueDate = '', defaultNoKaLink = false, fiscalYear = '2026' }) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(myName)
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [reportId, setReportId] = useState('')
  const [noKaLink, setNoKaLink] = useState(defaultNoKaLink)
  const [allKAs, setAllKAs] = useState([])
  const [objMap, setObjMap] = useState({})
  const [levels, setLevels] = useState([])
  const [loadingKAs, setLoadingKAs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [kaSearch, setKaSearch] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')

  useEffect(() => {
    ;(async () => {
      const [kasRes, levelsRes] = await Promise.all([
        supabase.from('weekly_reports')
          .select('id,ka_title,kr_id,objective_id,level_id,owner,status,week_start')
          .neq('status', 'done').order('week_start', { ascending: false }).order('ka_title'),
        supabase.from('levels').select('id,name,parent_id,icon,color,fiscal_year'),
      ])
      const seen = new Set()
      const uniqueKAs = (kasRes?.data || []).filter(ka => {
        const key = `${ka.ka_title}_${ka.owner}_${ka.objective_id}`
        if (seen.has(key)) return false
        seen.add(key); return true
      })
      setAllKAs(uniqueKAs)
      // 今年度の levels のみ使用 (2024/2025/2026 で名前が同じ「全社」が並ぶのを防ぐ)
      setLevels((levelsRes?.data || []).filter(l => !l.fiscal_year || l.fiscal_year === fiscalYear))
      const objIds = [...new Set(uniqueKAs.map(k => k.objective_id).filter(Boolean))]
      if (objIds.length > 0) {
        const { data: objs } = await supabase.from('objectives').select('id,title,owner,period,level_id').in('id', objIds)
        const m = {}; (objs || []).forEach(o => { m[o.id] = o }); setObjMap(m)
      }
      setLoadingKAs(false)
    })()
  }, [fiscalYear])

  // 部署/チーム階層を構築
  // 部署ドロップダウンは depth-1 (事業部) を直接表示する
  //   - depth-0 = 全社 (root) は選択肢として表示しない (= 「全部署」と同等なので冗長)
  const rootLevelIds = new Set(levels.filter(l => !l.parent_id).map(l => String(l.id)))
  const departmentLevels = levels.filter(l => l.parent_id && rootLevelIds.has(String(l.parent_id)))
  const childLevels = selectedDept ? levels.filter(l => String(l.parent_id) === String(selectedDept)) : []

  // KA検索フィルタ + 部署/チーム絞り込み
  const q = kaSearch.toLowerCase()
  const filteredKAs = allKAs.filter(ka => {
    // テキスト検索
    if (q) {
      const obj = objMap[ka.objective_id]
      const match = (ka.ka_title||'').toLowerCase().includes(q)
        || (ka.owner||'').toLowerCase().includes(q)
        || (obj?.title||'').toLowerCase().includes(q)
      if (!match) return false
    }
    // 部署/チーム絞り込み
    if (selectedDept || selectedTeam) {
      const obj = objMap[ka.objective_id]
      const kaLevelId = ka.level_id || obj?.level_id
      if (selectedTeam) {
        if (String(kaLevelId) !== String(selectedTeam)) return false
      } else if (selectedDept) {
        const deptAndChildren = [String(selectedDept), ...levels.filter(l => String(l.parent_id) === String(selectedDept)).map(l => String(l.id))]
        if (!deptAndChildren.includes(String(kaLevelId))) return false
      }
    }
    return true
  })
  const myKAs = filteredKAs.filter(ka => ka.owner === myName)
  const otherKAs = filteredKAs.filter(ka => ka.owner !== myName)
  const grouped = {}
  otherKAs.forEach(ka => {
    const objId = ka.objective_id || 0
    const obj = objMap[objId]
    const label = obj ? obj.title : 'OKR未設定'
    if (!grouped[objId]) grouped[objId] = { label, kas: [] }
    grouped[objId].kas.push(ka)
  })

  const canSave = title.trim() && (noKaLink || reportId)

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const selectedKA = noKaLink ? null : allKAs.find(k => String(k.id) === String(reportId))
    const payload = {
      title: title.trim(), assignee: assignee || null,
      due_date: dueDate || null, done: false,
      report_id: noKaLink ? null : parseInt(reportId),
      ka_key: computeKAKey(selectedKA),
    }
    const { error } = await supabase.from('ka_tasks').insert(payload)
    setSaving(false)
    if (error) { alert('タスクの作成に失敗しました: ' + error.message); return }
    onCreated()
    onClose()
  }

  const inputSt = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: '24px 22px', boxSizing: 'border-box', width: '92%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 20 }}>タスクを追加</div>

        {/* タイトル */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>タイトル <span style={{ color: '#ff6b6b' }}>*</span></div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タスク内容を入力" style={inputSt} autoFocus />
        </div>

        {/* 担当者 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>担当者</div>
          <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
            <option value="">-- 未設定 --</option>
            {(members || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>

        {/* 期日 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>期日</div>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputSt} />
        </div>

        {/* KA紐付け */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>KA紐付け <span style={{ color: '#ff6b6b' }}>*</span></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: noKaLink ? 'rgba(255,209,102,0.10)' : 'transparent', border: `1px solid ${noKaLink ? 'rgba(255,209,102,0.4)' : T.border}` }}>
            <input type="checkbox" checked={noKaLink} onChange={e => { setNoKaLink(e.target.checked); if (e.target.checked) setReportId('') }} />
            <span style={{ fontSize: 12, color: noKaLink ? '#ffd166' : T.textSub, fontWeight: 600 }}>⚠ KA紐付けなし（OKRに直結しないタスク）</span>
          </label>
          {!noKaLink && (
            loadingKAs ? (
              <div style={{ fontSize: 12, color: T.textMuted, padding: 8 }}>KA一覧を読み込み中...</div>
            ) : (
              <>
                {/* 部署・チーム絞り込み */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <select value={selectedDept} onChange={e => { setSelectedDept(e.target.value); setSelectedTeam(''); setReportId('') }} style={{ ...inputSt, fontSize: 12, flex: 1 }}>
                    <option value="">全部署</option>
                    {departmentLevels.map(l => (
                      <option key={l.id} value={l.id}>{l.icon || '📁'} {l.name}</option>
                    ))}
                  </select>
                  {childLevels.length > 0 && (
                    <select value={selectedTeam} onChange={e => { setSelectedTeam(e.target.value); setReportId('') }} style={{ ...inputSt, fontSize: 12, flex: 1 }}>
                      <option value="">全チーム</option>
                      {childLevels.map(l => (
                        <option key={l.id} value={l.id}>{l.icon || '📁'} {l.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <input value={kaSearch} onChange={e => setKaSearch(e.target.value)} placeholder="🔍 KAを検索（タイトル・担当者・OKR名）" style={{ ...inputSt, marginBottom: 6, fontSize: 12 }} />
                {(kaSearch || selectedDept) && <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>{filteredKAs.length}件のKAが見つかりました</div>}
                <select value={reportId} onChange={e => setReportId(e.target.value)} style={{ ...inputSt, cursor: 'pointer', borderColor: !reportId ? 'rgba(255,107,107,0.4)' : T.border }} size={Math.min(filteredKAs.length + 2, 10)}>
                  <option value="">-- KAを選択してください --</option>
                  {myKAs.length > 0 && (
                    <optgroup label={`⭐ 自分のKA (${myKAs.length}件)`}>
                      {myKAs.map(ka => {
                        const obj = objMap[ka.objective_id]
                        return <option key={ka.id} value={ka.id}>{ka.ka_title || '(無題)'}{obj ? ` [${obj.title.slice(0,20)}]` : ''}</option>
                      })}
                    </optgroup>
                  )}
                  {Object.entries(grouped).map(([objId, group]) => (
                    <optgroup key={objId} label={`OBJ: ${group.label}`}>
                      {group.kas.map(ka => (
                        <option key={ka.id} value={ka.id}>{ka.ka_title || '(無題)'}{ka.owner ? ` (${ka.owner})` : ''}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </>
            )
          )}
        </div>

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={save} disabled={!canSave || saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: canSave && !saving ? '#00d68f' : T.border, color: canSave && !saving ? '#fff' : T.textFaint, fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {saving ? '保存中...' : '作成する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ヘルパー: タスクのステータスを取得 ───────────────
function getTaskStatus(task) {
  if (task.status && STATUS_CONFIG[task.status]) return task.status
  return task.done ? 'done' : 'not_started'
}

// ─── タスクカード（リスト・ボード共通）─────────────────
function TaskCard({ task, kaMap, objMap, T, onStatusChange, onUpdateTask, onDeleteTask, myName, compact }) {
  const today = toDateStr(new Date())
  const thisMonday = getMondayOf(new Date())
  const thisSunday = toDateStr(new Date(new Date(thisMonday + 'T00:00:00').getTime() + 6 * 86400000))
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const editRef = useRef(null)

  const status = getTaskStatus(task)
  const isDone = status === 'done'
  const ka = kaMap[task.report_id]
  const obj = ka ? objMap[ka.objective_id] : null
  const isOverdue = !isDone && task.due_date && task.due_date < today
  const isEditing = editingId === task.id

  const startEdit = () => { setEditingId(task.id); setEditTitle(task.title || ''); setEditDue(task.due_date || '') }
  const saveEdit = async () => {
    if (!editingId) return
    await onUpdateTask(editingId, { title: editTitle, due_date: editDue || null })
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)

  useEffect(() => { if (editingId && editRef.current) editRef.current.focus() }, [editingId])

  return (
    <div style={{
      display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: 10,
      padding: compact ? '8px 12px' : '10px 14px',
      background: isDone ? T.doneBg : isOverdue ? T.overdueBg : T.bgCard,
      border: `1px solid ${isDone ? T.doneBorder : isOverdue ? T.overdueBorder : T.border}`,
      borderRadius: 10, marginBottom: 6, opacity: isDone ? 0.7 : 1,
    }}>
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
              <span onClick={() => !isDone && startEdit()} style={{ fontSize: 13, fontWeight: 600, color: isDone ? T.textMuted : T.text, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, cursor: isDone ? 'default' : 'pointer' }} title={isDone ? '' : 'クリックして編集'}>
                {task.title || '(未入力)'}
              </span>
              {task.assignee && (
                <span style={{ fontSize: 10, color: avatarColor(task.assignee), fontWeight: 600 }}>
                  @{task.assignee}
                </span>
              )}
            </div>
            {!compact && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                {ka ? (
                  <>
                    <span style={{ fontSize: 10, color: T.textMuted, background: T.sectionBg, padding: '1px 6px', borderRadius: 4, border: `1px solid ${T.border}` }}>
                      KA: {ka.ka_title || '(無題)'}
                    </span>
                    {obj && (
                      <span style={{ fontSize: 10, color: T.textFaint }}>
                        OKR: {obj.title}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: '#ffd166', fontWeight: 600, background: 'rgba(255,209,102,0.10)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(255,209,102,0.25)' }}>
                    ⚠ KA紐付けなし
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {!isEditing && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusBadge status={status} onChange={(s) => onStatusChange(task.id, s)} T={T} />
          {!isDone && (
            <span onClick={startEdit} style={{ fontSize: 11, color: T.textFaint, cursor: 'pointer', padding: '2px 4px' }} title="編集">✏️</span>
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

// ─── リストビュー ──────────────────────────────────────
function ListView({ tasks, kaMap, objMap, T, onStatusChange, onUpdateTask, onDeleteTask, myName }) {
  const today = toDateStr(new Date())
  const thisMonday = getMondayOf(new Date())
  const thisSunday = toDateStr(new Date(new Date(thisMonday + 'T00:00:00').getTime() + 6 * 86400000))
  const [showDone, setShowDone] = useState(false)

  const sortByDue = (a, b) => {
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  }

  const active = tasks.filter(t => getTaskStatus(t) !== 'done')
  const overdue = active.filter(t => t.due_date && t.due_date < today).sort(sortByDue)
  const thisWeek = active.filter(t => t.due_date && t.due_date >= today && t.due_date <= thisSunday).sort(sortByDue)
  const upcoming = active.filter(t => t.due_date && t.due_date > thisSunday).sort(sortByDue)
  const noDue = active.filter(t => !t.due_date)
  const done = tasks.filter(t => getTaskStatus(t) === 'done')
  const totalIncomplete = active.length

  const renderSection = (title, icon, items, color) => {
    if (items.length === 0) return null
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: color || T.text }}>{title}</span>
          <span style={{ fontSize: 11, color: T.textFaint, fontWeight: 600, background: T.sectionBg, padding: '1px 8px', borderRadius: 99, border: `1px solid ${T.border}` }}>{items.length}件</span>
        </div>
        {items.map(t => <TaskCard key={t.id} task={t} kaMap={kaMap} objMap={objMap} T={T} onStatusChange={onStatusChange} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} myName={myName} />)}
      </div>
    )
  }

  return (
    <>
      {/* サマリーバー */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_ORDER.map(s => {
          const cfg = STATUS_CONFIG[s]
          const count = s === 'done' ? done.length : tasks.filter(t => getTaskStatus(t) === s).length
          return (
            <div key={s} style={{ padding: '8px 16px', borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.border}`, fontSize: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: cfg.color }}>{count}</span>
              <span style={{ color: cfg.color, marginLeft: 6, opacity: 0.8 }}>{cfg.label}</span>
            </div>
          )
        })}
        {overdue.length > 0 && (
          <div style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', fontSize: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#ff6b6b' }}>{overdue.length}</span>
            <span style={{ color: '#ff6b6b', marginLeft: 6 }}>期限超過</span>
          </div>
        )}
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
          {showDone && done.map(t => <TaskCard key={t.id} task={t} kaMap={kaMap} objMap={objMap} T={T} onStatusChange={onStatusChange} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} myName={myName} />)}
        </div>
      )}
    </>
  )
}

// ─── ボードビュー ──────────────────────────────────────
function BoardView({ tasks, kaMap, objMap, T, onStatusChange, onUpdateTask, onDeleteTask, myName }) {
  const [dragOverCol, setDragOverCol] = useState(null)
  const dragTaskRef = useRef(null)

  const handleDragStart = (e, taskId) => {
    dragTaskRef.current = taskId
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, col) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(col)
  }
  const handleDragLeave = () => setDragOverCol(null)
  const handleDrop = (e, targetStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    if (dragTaskRef.current != null) {
      onStatusChange(dragTaskRef.current, targetStatus)
      dragTaskRef.current = null
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 400, overflowX: 'auto', paddingBottom: 8 }}>
      {STATUS_ORDER.map(s => {
        const cfg = STATUS_CONFIG[s]
        const colTasks = tasks.filter(t => getTaskStatus(t) === s)
        const isOver = dragOverCol === s
        return (
          <div key={s}
            onDragOver={(e) => handleDragOver(e, s)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, s)}
            style={{
              flex: 1, minWidth: 240, maxWidth: 400, display: 'flex', flexDirection: 'column',
              background: isOver ? cfg.bg : T.sectionBg,
              border: `1px solid ${isOver ? cfg.border : T.border}`,
              borderRadius: 12, padding: 12, transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {/* カラムヘッダー */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${cfg.border}` }}>
              <span style={{ fontSize: 14, color: cfg.color }}>{cfg.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, background: T.bgCard, padding: '1px 8px', borderRadius: 99, border: `1px solid ${T.border}` }}>
                {colTasks.length}
              </span>
            </div>
            {/* カード */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {colTasks.length === 0 && (
                <div style={{ padding: '20px 8px', textAlign: 'center', color: T.textFaint, fontSize: 12 }}>
                  ここにドラッグ
                </div>
              )}
              {colTasks.map(t => (
                <div key={t.id} draggable onDragStart={(e) => handleDragStart(e, t.id)}
                  style={{ cursor: 'grab' }}>
                  <TaskCard task={t} kaMap={kaMap} objMap={objMap} T={T} onStatusChange={onStatusChange} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} myName={myName} compact />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── ガントビュー ────────────────────────────────────
function GanttView({ tasks, kaMap, objMap, T, onStatusChange, onUpdateTask, onDeleteTask, myName }) {
  // ───── 日付ユーティリティ ─────
  const toYMD = (d) => {
    const jst = new Date(d.getTime() + 9 * 3600 * 1000)
    return jst.toISOString().split('T')[0]
  }
  const parseYMD = (s) => {
    if (!s) return null
    const str = typeof s === 'string' ? s.split('T')[0] : ''
    if (!str || !str.includes('-')) return null
    const [y, m, d] = str.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(Date.UTC(y, m - 1, d))
  }
  const addDays = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r }
  const diffDays = (a, b) => Math.round((b - a) / 86400000)

  const today = parseYMD(toYMD(new Date()))

  // ───── 表示密度 ─────
  const [zoom, setZoom] = useState('day') // 'day' | 'week'
  const dayWidth = zoom === 'day' ? 32 : 14

  // ───── タスクのバー範囲を計算。due_date無しは分離 ─────
  const taskBars = []
  const tasksNoDue = []
  tasks.forEach(t => {
    const dueDate = parseYMD(t.due_date)
    const createdDate = parseYMD(t.created_at)
    if (!dueDate && !createdDate) {
      tasksNoDue.push(t); return
    }
    if (!dueDate) {
      taskBars.push({ task: t, start: createdDate, end: addDays(createdDate, 1), noDue: true })
      return
    }
    let start
    if (createdDate && createdDate < dueDate) start = createdDate
    else start = addDays(dueDate, -2)
    taskBars.push({ task: t, start, end: dueDate, noDue: false })
  })

  // ───── ビュー範囲 ─────
  const allStarts = taskBars.map(b => b.start)
  const allEnds = taskBars.map(b => b.end)
  const rawMin = allStarts.length ? new Date(Math.min(...allStarts.map(d => d.getTime()))) : addDays(today, -14)
  const rawMax = allEnds.length   ? new Date(Math.max(...allEnds.map(d => d.getTime())))   : addDays(today, 14)
  const minForView = rawMin < addDays(today, -60) ? rawMin : addDays(today, -14)
  const maxForView = rawMax > addDays(today, 60)  ? rawMax : addDays(today, 60)
  const rangeStart = addDays(minForView, -3)
  const rangeEnd = addDays(maxForView, 3)
  const totalDays = Math.max(diffDays(rangeStart, rangeEnd) + 1, 30)

  const sorted = [...taskBars].sort((a, b) => {
    if (a.noDue && !b.noDue) return 1
    if (!a.noDue && b.noDue) return -1
    return a.end - b.end
  })

  const LABEL_W = 260
  const ROW_H = 34
  const HEADER_H = 52

  const days = []
  for (let i = 0; i < totalDays; i++) days.push(addDays(rangeStart, i))

  const weekdayJa = ['日','月','火','水','木','金','土']
  const todayLeft = Math.max(0, diffDays(rangeStart, today)) * dayWidth
  const rightWidth = totalDays * dayWidth

  // ───── 左右のスクロール同期 ─────
  const leftScrollRef = useRef(null)
  const rightScrollRef = useRef(null)
  const syncing = useRef(false)
  const onLeftScroll = () => {
    if (syncing.current) return
    syncing.current = true
    if (rightScrollRef.current) rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop
    syncing.current = false
  }
  const onRightScroll = () => {
    if (syncing.current) return
    syncing.current = true
    if (leftScrollRef.current) leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop
    syncing.current = false
  }

  // ───── 初期スクロール位置を「今日」に ─────
  useEffect(() => {
    if (rightScrollRef.current) {
      rightScrollRef.current.scrollLeft = Math.max(0, todayLeft - 120)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, sorted.length])

  if (tasks.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: 60, color: T.textMuted, fontSize: 13,
        background: T.bgCard, borderRadius: 10, border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
        <div>タスクがありません</div>
      </div>
    )
  }

  const PANEL_HEIGHT = 520 // ガント本体の固定高さ

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 操作バー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: T.textMuted }}>表示密度</div>
        <div style={{ display: 'flex', background: T.sectionBg, borderRadius: 7, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
          {[
            { key: 'day',  label: '日単位' },
            { key: 'week', label: '週単位(圧縮)' },
          ].map(z => (
            <button key={z.key} onClick={() => setZoom(z.key)} style={{
              padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 11,
              background: zoom === z.key ? T.accent : 'transparent',
              color: zoom === z.key ? '#fff' : T.textMuted,
              fontWeight: 600, fontFamily: 'inherit',
            }}>{z.label}</button>
          ))}
        </div>
        <button
          onClick={() => {
            if (rightScrollRef.current) {
              rightScrollRef.current.scrollTo({ left: Math.max(0, todayLeft - 120), behavior: 'smooth' })
            }
          }}
          style={{
            padding: '4px 10px', border: `1px solid ${T.border}`, cursor: 'pointer',
            background: T.sectionBg, color: T.textSub, fontSize: 11, fontWeight: 600,
            borderRadius: 7, fontFamily: 'inherit',
          }}
        >📍 今日へ</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10, color: T.textMuted }}>
          凡例: <span style={{ color: '#7a8599' }}>■未着手</span> <span style={{ color: '#4d9fff', marginLeft: 6 }}>■進行中</span> <span style={{ color: '#00d68f', marginLeft: 6 }}>■完了</span> <span style={{ color: '#ff6b6b', marginLeft: 6 }}>│今日</span>
        </div>
      </div>

      {/* ガント本体：左右2パネル構成 */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
        overflow: 'hidden', display: 'flex', height: PANEL_HEIGHT,
      }}>
        {/* ─── 左パネル：タスク名（縦スクロール連動） ─── */}
        <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.borderMid}`, background: T.bgCard }}>
          {/* 左ヘッダー */}
          <div style={{
            height: HEADER_H, flexShrink: 0,
            display: 'flex', alignItems: 'center', padding: '0 12px',
            background: T.sectionBg, borderBottom: `1px solid ${T.border}`,
            fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5,
          }}>
            タスク ({sorted.length})
          </div>
          {/* 左ボディ */}
          <div
            ref={leftScrollRef}
            onScroll={onLeftScroll}
            style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
          >
            {sorted.map(({ task }, idx) => {
              const st = getTaskStatus(task)
              const cfg = STATUS_CONFIG[st]
              const ka = kaMap[task.report_id]
              return (
                <div key={task.id} style={{
                  height: ROW_H, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0 12px', borderBottom: `1px solid ${T.border}`,
                  background: idx % 2 === 0 ? T.bgCard : T.sectionBg,
                  opacity: st === 'done' ? 0.6 : 1,
                }}>
                  <span style={{ color: cfg.color, fontSize: 12, flexShrink: 0 }}>{cfg.icon}</span>
                  <div style={{
                    flex: 1, minWidth: 0, fontSize: 12, color: T.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    textDecoration: st === 'done' ? 'line-through' : 'none',
                  }} title={task.title || ka?.ka_title || ''}>
                    {task.title || ka?.ka_title || '(無題)'}
                  </div>
                  {task.assignee && (
                    <span style={{ fontSize: 10, color: T.textMuted, flexShrink: 0 }}>
                      {task.assignee}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── 右パネル：時間軸（横・縦スクロール） ─── */}
        <div
          ref={rightScrollRef}
          onScroll={onRightScroll}
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
        >
          <div style={{ width: rightWidth, position: 'relative' }}>
            {/* 右ヘッダー（sticky top） */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 3,
              display: 'flex', height: HEADER_H,
              background: T.sectionBg, borderBottom: `1px solid ${T.border}`,
            }}>
              {days.map((d, i) => {
                const ymd = toYMD(d)
                const isToday = ymd === toYMD(today)
                const wd = d.getUTCDay()
                const isWeekend = wd === 0 || wd === 6
                const isMonthStart = d.getUTCDate() === 1
                return (
                  <div key={ymd} style={{
                    width: dayWidth, flexShrink: 0, textAlign: 'center',
                    borderRight: isMonthStart ? `1px solid ${T.borderMid}` : `1px solid ${T.border}`,
                    background: isToday ? 'rgba(255,107,107,0.08)' : isWeekend ? T.sectionBg : 'transparent',
                    color: isToday ? '#ff6b6b' : isWeekend ? T.textFaint : T.textMuted,
                    fontSize: 9, fontWeight: isToday ? 700 : 500,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    padding: '4px 0',
                  }}>
                    {(isMonthStart || i === 0) && (
                      <div style={{ fontSize: 9, color: T.text, fontWeight: 700 }}>
                        {d.getUTCMonth() + 1}月
                      </div>
                    )}
                    {zoom === 'day' && (
                      <>
                        <div>{d.getUTCDate()}</div>
                        <div style={{ fontSize: 8 }}>{weekdayJa[wd]}</div>
                      </>
                    )}
                    {zoom === 'week' && wd === 1 && (
                      <div style={{ fontSize: 8 }}>{d.getUTCDate()}日</div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 今日の縦線 */}
            <div style={{
              position: 'absolute',
              left: todayLeft + dayWidth / 2 - 1,
              top: 0, bottom: 0, width: 2,
              background: '#ff6b6b', opacity: 0.55,
              pointerEvents: 'none', zIndex: 2,
            }} />

            {/* 右ボディ：タスクバー行 */}
            {sorted.map(({ task, start, end, noDue }, idx) => {
              const st = getTaskStatus(task)
              const cfg = STATUS_CONFIG[st]
              const startOffset = Math.max(0, diffDays(rangeStart, start))
              const duration = Math.max(1, diffDays(start, end) + 1)
              const left = startOffset * dayWidth
              const width = duration * dayWidth - 4
              const isOverdue = end < today && st !== 'done'
              return (
                <div key={task.id} style={{
                  height: ROW_H, borderBottom: `1px solid ${T.border}`,
                  position: 'relative',
                  background: idx % 2 === 0 ? T.bgCard : T.sectionBg,
                }}>
                  {/* 背景: 週末セル */}
                  {days.map((d, i) => {
                    const wd = d.getUTCDay()
                    if (wd !== 0 && wd !== 6) return null
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: i * dayWidth, top: 0, bottom: 0, width: dayWidth,
                        background: T.sectionBg, opacity: 0.5, pointerEvents: 'none',
                      }} />
                    )
                  })}
                  {/* バー */}
                  <div
                    title={`${task.title || '(無題)'}\n${toYMD(start)} 〜 ${task.due_date || '期限未設定'} (${duration}日)\n状態: ${cfg.label}${isOverdue ? ' · 期限超過' : ''}${noDue ? ' · 期限未設定' : ''}`}
                    style={{
                      position: 'absolute',
                      left: left + 2, top: 6,
                      width: Math.max(width, 8),
                      height: ROW_H - 12,
                      background: isOverdue ? '#ff6b6b' : cfg.color,
                      borderRadius: 5,
                      opacity: st === 'done' ? 0.5 : noDue ? 0.4 : 0.85,
                      border: isOverdue ? '2px solid #ff6b6b' : noDue ? `1px dashed ${cfg.color}` : `1px solid ${cfg.color}`,
                      display: 'flex', alignItems: 'center',
                      padding: '0 6px',
                      fontSize: 10, fontWeight: 700, color: '#fff',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      zIndex: 2,
                    }}
                  >
                    {width > 40 && <span>{task.title || ''}</span>}
                    {isOverdue && <span style={{ marginLeft: 'auto' }}>🚨</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 期限未設定タスク一覧（バーに出せないので下部リスト） */}
      {tasksNoDue.length > 0 && (
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: '10px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 6 }}>
            📝 期限未設定 ({tasksNoDue.length}件) — ガントに表示できないタスク
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tasksNoDue.map(t => {
              const st = getTaskStatus(t)
              const cfg = STATUS_CONFIG[st]
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 6,
                  background: T.sectionBg, border: `1px solid ${T.border}`,
                  fontSize: 11, color: T.text,
                  opacity: st === 'done' ? 0.5 : 1,
                }}>
                  <span style={{ color: cfg.color }}>{cfg.icon}</span>
                  <span>{t.title || '(無題)'}</span>
                  {t.assignee && <span style={{ color: T.textMuted, fontSize: 10 }}>· {t.assignee}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── メイン ─────────────────────────────────────────
export default function MyTasksPage({ user, members, themeKey = 'dark', initialViewMode = 'my', onViewModeChange, fiscalYear = '2026' }) {
  const T = THEMES[themeKey] || THEMES.dark
  const { isMobile } = useResponsive()
  const myName = members?.find(m => m.email === user?.email)?.name || user?.email || ''
  const [viewMode, setViewMode] = useState(initialViewMode)
  const [displayMode, setDisplayMode] = useState('list') // 'list' | 'board' | 'gantt'
  // モバイルは常に list ビューに強制
  useEffect(() => { if (isMobile && displayMode !== 'list') setDisplayMode('list') }, [isMobile, displayMode])
  const [selectedMember, setSelectedMember] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const [allTasks, setAllTasks] = useState([])
  const [kaMap, setKaMap] = useState({})
  const [objMap, setObjMap] = useState({})
  const [loading, setLoading] = useState(true)

  const oneWeekAgo = toDateStr(new Date(Date.now() - 7 * 86400000))

  // ヘッダードロップダウンから viewMode が変わったら同期
  useEffect(() => { setViewMode(initialViewMode) }, [initialViewMode])

  const load = useCallback(async () => {
    setLoading(true)
    // done boolean で取得（status カラムの有無に依存しない）
    // 完了タスク: created_atではなく全完了タスクを直近制限なしで取得
    const [{ data: incompleteTasks }, { data: recentDoneTasks }] = await Promise.all([
      supabase.from('ka_tasks').select('*').eq('done', false).order('due_date').order('id'),
      supabase.from('ka_tasks').select('*').eq('done', true).order('id', { ascending: false }).limit(100),
    ])

    const tasks = [...(incompleteTasks || []), ...(recentDoneTasks || [])]
    // ID重複排除
    const seenId = new Set()
    const uniqueTasks = tasks.filter(t => { if (seenId.has(t.id)) return false; seenId.add(t.id); return true })

    // ka_tasks は ka_key で週を跨いで一意化されるため、表示層 dedup は不要
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

  const changeStatus = async (taskId, newStatus) => {
    const newDone = newStatus === 'done'
    // まずdoneのみ更新（確実に成功する）
    const { error: doneErr } = await supabase.from('ka_tasks').update({ done: newDone }).eq('id', taskId)
    if (doneErr) { alert('更新に失敗しました: ' + doneErr.message); return }
    // statusカラムがあれば更新（エラーは無視）
    await supabase.from('ka_tasks').update({ status: newStatus }).eq('id', taskId).then(() => {}).catch(() => {})
    setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, done: newDone } : t))
  }

  const updateTask = async (taskId, fields) => {
    await supabase.from('ka_tasks').update(fields).eq('id', taskId)
    setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...fields } : t))
  }

  const deleteTask = async (id) => {
    await supabase.from('ka_tasks').delete().eq('id', id)
    load()
  }

  // メンバーリスト
  const assigneeSet = new Set(allTasks.map(t => t.assignee).filter(Boolean))
  const membersWithTasks = (members || []).filter(m => assigneeSet.has(m.name))
  const taskCountByMember = {}
  allTasks.forEach(t => {
    if (t.assignee && getTaskStatus(t) !== 'done') {
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

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    if (onViewModeChange) onViewModeChange(mode)
  }

  if (loading) return <div style={{ padding: 40, color: T.accent, fontSize: 14 }}>読み込み中...</div>

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif' }}>
      {/* 全社モード時のサイドバー (モバイル非表示 - マイタスクに限定) */}
      {viewMode === 'all' && !isMobile && (
        <div style={{
          width: 200, flexShrink: 0, overflowY: 'auto', background: T.sidebarBg,
          borderRight: `1px solid ${T.border}`, padding: '12px 0',
        }}>
          <div style={{ padding: '4px 12px 10px', fontSize: 10, fontWeight: 700, color: T.textFaint, letterSpacing: 1 }}>メンバー</div>
          <div onClick={() => setSelectedMember(null)} style={{
            padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: !selectedMember ? T.sidebarActive : 'transparent',
            color: !selectedMember ? T.accent : T.textSub,
            borderLeft: !selectedMember ? `3px solid ${T.accent}` : '3px solid transparent',
          }}>
            全員
            <span style={{ fontSize: 10, color: T.textFaint, marginLeft: 6 }}>{allTasks.filter(t => getTaskStatus(t) !== 'done').length}</span>
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
        <div style={{ maxWidth: displayMode === 'list' ? 800 : displayMode === 'board' ? 1200 : '100%', margin: '0 auto', padding: isMobile ? '12px' : '24px 24px' }}>
          {/* ヘッダー */}
          <div style={{ marginBottom: isMobile ? 14 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              {targetMember?.avatar_url ? (
                <img src={targetMember.avatar_url} alt={targetName} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${avatarColor(targetName)}60` }} />
              ) : targetName ? (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${avatarColor(targetName)}25`, border: `2px solid ${avatarColor(targetName)}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: avatarColor(targetName) }}>
                  {targetName.slice(0, 2)}
                </div>
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700 }}>
                  {viewMode === 'my' ? 'マイタスク' : selectedMember ? `${selectedMember} のタスク` : '全社タスク'}
                </div>
                {!isMobile && (
                  <div style={{ fontSize: 12, color: T.textMuted }}>
                    {viewMode === 'my' ? `${myName} さんに割り当てられたタスク` : selectedMember ? `${selectedMember} さんに割り当てられたタスク` : '全メンバーのタスク一覧'}
                  </div>
                )}
              </div>
              {/* タスク追加 */}
              <button onClick={() => setShowCreateModal(true)} style={{
                padding: isMobile ? '10px 14px' : '6px 14px', borderRadius: 8, border: 'none',
                background: '#00d68f', color: '#fff',
                fontSize: isMobile ? 14 : 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 4,
                minHeight: isMobile ? 44 : 'auto',
              }}>＋ タスク追加</button>
              {/* マイ/全社 切替 (モバイルはマイタスクに固定、切替不可) */}
              {!isMobile && (
                <div style={{ display: 'flex', background: T.sectionBg, borderRadius: 8, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                  <button onClick={() => handleViewModeChange('my')} style={{
                    padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    background: viewMode === 'my' ? T.accent : 'transparent',
                    color: viewMode === 'my' ? '#fff' : T.textMuted,
                  }}>マイタスク</button>
                  <button onClick={() => handleViewModeChange('all')} style={{
                    padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    background: viewMode === 'all' ? T.accent : 'transparent',
                    color: viewMode === 'all' ? '#fff' : T.textMuted,
                  }}>全社タスク</button>
                </div>
              )}
              {/* リスト/カード/ガント切替 (モバイルはリスト固定) */}
              <div style={{ display: isMobile ? 'none' : 'flex', background: T.sectionBg, borderRadius: 8, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {[
                  { key: 'list',  icon: '📋', label: 'リスト', title: 'リスト: 期限でグルーピング' },
                  { key: 'board', icon: '🗂',  label: 'カード', title: 'カード: ステータス別カンバン' },
                  { key: 'gantt', icon: '📊', label: 'ガント', title: 'ガント: 時間軸で可視化' },
                ].map(v => (
                  <button
                    key={v.key}
                    onClick={() => setDisplayMode(v.key)}
                    title={v.title}
                    style={{
                      padding: '6px 12px', border: 'none', cursor: 'pointer',
                      fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: displayMode === v.key ? T.accent : 'transparent',
                      color: displayMode === v.key ? '#fff' : T.textMuted,
                    }}
                  >
                    <span>{v.icon}</span>
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {displayMode === 'list' && (
            <ListView tasks={filteredTasks} kaMap={kaMap} objMap={objMap} T={T} onStatusChange={changeStatus} onUpdateTask={updateTask} onDeleteTask={deleteTask} myName={myName} />
          )}
          {displayMode === 'board' && (
            <BoardView tasks={filteredTasks} kaMap={kaMap} objMap={objMap} T={T} onStatusChange={changeStatus} onUpdateTask={updateTask} onDeleteTask={deleteTask} myName={myName} />
          )}
          {displayMode === 'gantt' && (
            <GanttView tasks={filteredTasks} kaMap={kaMap} objMap={objMap} T={T} onStatusChange={changeStatus} onUpdateTask={updateTask} onDeleteTask={deleteTask} myName={myName} />
          )}
        </div>
      </div>
      {showCreateModal && (
        <TaskCreateModal onClose={() => setShowCreateModal(false)} onCreated={load} members={members} myName={myName} T={T} fiscalYear={fiscalYear} />
      )}
    </div>
  )
}
