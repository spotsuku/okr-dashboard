'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { cardStyle, pillStyle, btnPrimary, btnSecondary, btnGhost, btnDanger, inputStyle, sectionHeaderStyle, largeTitle, btnBrand } from '../lib/iosStyles'
import Icon from './Icon'
import { SheetModal } from './iosUI'
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
// iOS システムカラー
const STATUS_CONFIG = {
  not_started: { label: '未着手', color: '#8E8E93', bg: 'rgba(142,142,147,0.10)', border: 'rgba(142,142,147,0.25)', icon: 'circle' },
  in_progress: { label: '進行中', color: '#007AFF', bg: 'rgba(0,122,255,0.10)',   border: 'rgba(0,122,255,0.30)',   icon: 'half' },
  done:        { label: '完了',   color: '#34C759', bg: 'rgba(52,199,89,0.10)',   border: 'rgba(52,199,89,0.30)',   icon: 'check' },
}
const STATUS_ORDER = ['not_started', 'in_progress', 'done']

// テーマは lib/themeTokens.js で一元管理。固有フィールドだけ上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    doneBg:'rgba(48,209,88,0.10)', doneBorder:'rgba(48,209,88,0.20)',
    overdueBg:'rgba(255,69,58,0.10)', overdueBorder:'rgba(255,69,58,0.30)',
    sidebarBg:'#1C1C1E', sidebarActive:'rgba(10,132,255,0.18)', sidebarHover:'rgba(255,255,255,0.04)',
  },
  light: {
    ...COMMON_TOKENS.light,
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
        padding: '2px 8px', borderRadius: RADIUS.xs, border: `1px solid ${cfg.border}`,
        background: cfg.bg, color: cfg.color, ...TYPO.caption,
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        <Icon name={cfg.icon} size={11} /> {cfg.label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 100, marginTop: SPACING.xs,
          background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.sm,
          padding: SPACING.xs, minWidth: 120, boxShadow: SHADOWS.md,
        }}>
          {STATUS_ORDER.map(s => {
            const c = STATUS_CONFIG[s]
            return (
              <button key={s} onClick={() => { onChange(s); setOpen(false) }} style={{
                display: 'flex', alignItems: 'center', gap: 4, width: '100%', textAlign: 'left', padding: '6px 10px',
                borderRadius: RADIUS.xs, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: s === status ? c.bg : 'transparent',
                color: s === status ? c.color : T.text, ...TYPO.footnote,
              }}>
                <Icon name={c.icon} size={12} /> {c.label}
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
      <div onClick={e => e.stopPropagation()} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '24px 28px', minWidth: 320, maxWidth: 420, boxShadow: SHADOWS.xl }}>
        <div style={{ ...TYPO.headline, fontWeight: 600, color: T.text, marginBottom: 18, lineHeight: 1.6 }}>{message}</div>
        <div style={{ display: 'flex', gap: SPACING.sm + 2, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ ...btnSecondary({ T }), color: T.textMuted }}>キャンセル</button>
          <button onClick={onConfirm} style={btnPrimary({ T, color: T.success })}>完了にする</button>
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
  const titleInputRef = useRef(null)

  // 期日プリセット (JST 基準で計算)
  const datePresets = (() => {
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    // 今週金曜
    const fri = new Date(today)
    const diffFri = (5 - today.getDay() + 7) % 7
    fri.setDate(today.getDate() + diffFri)
    // 来週同曜日
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7)
    return [
      { label: '今日',   v: fmt(today) },
      { label: '明日',   v: fmt(tomorrow) },
      { label: '今週末', v: fmt(fri) },
      { label: '来週',   v: fmt(nextWeek) },
    ]
  })()

  // keep=true で「作成して続ける」モード (= モーダル閉じずにタイトルだけクリア)
  const save = async (keep = false) => {
    if (!canSave || saving) return
    setSaving(true)
    const selectedKA = noKaLink ? null : allKAs.find(k => String(k.id) === String(reportId))
    const payload = {
      title: title.trim(), assignee: assignee || null,
      due_date: dueDate || null, done: false,
      report_id: noKaLink ? null : parseInt(reportId),
      ka_key: computeKAKey(selectedKA),
    }
    // 突合用の安定キー (担当の email)。列が無い環境では付けずに再挿入。
    const assigneeEmail = (members?.find(m => m.name === assignee)?.email || '').toLowerCase()
    let { error } = await supabase.from('ka_tasks').insert({ ...payload, ...(assigneeEmail ? { assignee_email: assigneeEmail } : {}) })
    if (error && /assignee_email|column/i.test(error.message || '')) {
      ;({ error } = await supabase.from('ka_tasks').insert(payload))
    }
    setSaving(false)
    if (error) { alert('タスクの作成に失敗しました: ' + error.message); return }
    onCreated()
    if (keep) {
      // 連続追加モード: タイトルクリア + フォーカス戻す。担当/期日/KA は維持
      setTitle('')
      setTimeout(() => titleInputRef.current?.focus(), 0)
    } else {
      onClose()
    }
  }

  const handleTitleKeyDown = (e) => {
    // IME (日本語変換) 中の Enter は変換確定なので無視する
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' && !e.shiftKey) {
      if ((e.metaKey || e.ctrlKey) && canSave) {
        // Cmd+Enter = 作成して続ける
        e.preventDefault()
        save(true)
      } else if (canSave) {
        // Enter = 作成 (= モーダル閉じる)
        e.preventDefault()
        save(false)
      }
    }
  }

  const inputSt = { ...inputStyle({ T }), padding: '9px 12px', fontSize: TYPO.body.fontSize, background: T.bg, borderRadius: RADIUS.sm }
  const presetBtnSt = (active) => ({
    padding: '5px 10px', borderRadius: RADIUS.xs + 1,
    border: `1px solid ${active ? T.accent : T.border}`,
    background: active ? T.accentBg : T.bg,
    color: active ? T.accent : T.textSub,
    ...TYPO.footnote, fontWeight: 700, fontFamily: 'inherit',
    cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <SheetModal T={T} open onClose={onClose} title="タスクを追加" maxWidth={560}
      footer={<>
        <span style={{ flex: 1, ...TYPO.caption, fontWeight: 600, color: T.textFaint }}>
          Enter = 作成 / ⌘ + Enter = 作成して続ける
        </span>
        <button onClick={onClose} style={{ ...btnSecondary({ T }), color: T.textMuted }}>キャンセル</button>
        <button onClick={() => save(true)} disabled={!canSave || saving} title="保存してフォームをクリア、次のタスクを連続入力"
          style={{ ...btnSecondary({ T }),
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: canSave && !saving ? T.bgCard : 'transparent',
            color: canSave && !saving ? T.text : T.textFaint,
            cursor: canSave && !saving ? 'pointer' : 'default' }}>
          <Icon name="plus" size={13} /> 作成して続ける
        </button>
        <button onClick={() => save(false)} disabled={!canSave || saving} style={{ ...btnPrimary({ T, size: 'lg' }), opacity: canSave && !saving ? 1 : 0.5, cursor: canSave ? 'pointer' : 'default' }}>
          {saving ? '保存中...' : '作成する'}
        </button>
      </>}
    >
      <>
        {/* タイトル */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginBottom: 5 }}>タイトル <span style={{ color: T.danger }}>*</span></div>
          <input ref={titleInputRef} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={handleTitleKeyDown} placeholder="タスク内容を入力 (Enter で作成)" style={inputSt} autoFocus />
        </div>

        {/* 担当者 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginBottom: 5 }}>担当者</div>
          <select value={assignee} onChange={e => setAssignee(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
            <option value="">-- 未設定 --</option>
            {(members || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>

        {/* 期日 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginBottom: 5 }}>期日</div>
          {/* プリセット (ワンクリックで設定) */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {datePresets.map(p => (
              <button key={p.label} onClick={() => setDueDate(dueDate === p.v ? '' : p.v)} style={presetBtnSt(dueDate === p.v)}>
                {p.label}
              </button>
            ))}
            {dueDate && (
              <button onClick={() => setDueDate('')} title="期日をクリア" style={{ ...presetBtnSt(false), display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="cross" size={11} /> クリア</button>
            )}
          </div>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputSt} />
        </div>

        {/* KA紐付け */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginBottom: 5 }}>KA紐付け <span style={{ color: T.danger }}>*</span></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm, cursor: 'pointer', padding: '8px 12px', borderRadius: RADIUS.sm, background: noKaLink ? T.warnBg : 'transparent', border: `1px solid ${noKaLink ? T.warn : T.border}` }}>
            <input type="checkbox" checked={noKaLink} onChange={e => { setNoKaLink(e.target.checked); if (e.target.checked) setReportId('') }} />
            <span style={{ ...TYPO.subhead, display: 'inline-flex', alignItems: 'center', gap: 4, color: noKaLink ? T.warn : T.textSub }}><Icon name="alert" size={12} /> KA紐付けなし（OKRに直結しないタスク）</span>
          </label>
          {!noKaLink && (
            loadingKAs ? (
              <div style={{ ...TYPO.subhead, color: T.textMuted, padding: SPACING.sm }}>KA一覧を読み込み中...</div>
            ) : (
              <>
                {/* 部署・チーム絞り込み */}
                <div style={{ display: 'flex', gap: SPACING.xs + 2, marginBottom: SPACING.xs + 2 }}>
                  <select value={selectedDept} onChange={e => { setSelectedDept(e.target.value); setSelectedTeam(''); setReportId('') }} style={{ ...inputSt, fontSize: TYPO.subhead.fontSize, flex: 1 }}>
                    <option value="">全部署</option>
                    {departmentLevels.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  {childLevels.length > 0 && (
                    <select value={selectedTeam} onChange={e => { setSelectedTeam(e.target.value); setReportId('') }} style={{ ...inputSt, fontSize: TYPO.subhead.fontSize, flex: 1 }}>
                      <option value="">全チーム</option>
                      {childLevels.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <input value={kaSearch} onChange={e => setKaSearch(e.target.value)} placeholder="🔍 KAを検索（タイトル・担当者・OKR名）" style={{ ...inputSt, marginBottom: SPACING.xs + 2, fontSize: TYPO.subhead.fontSize }} />
                {(kaSearch || selectedDept) && <div style={{ ...TYPO.caption, fontWeight: 600, color: T.textMuted, marginBottom: SPACING.xs }}>{filteredKAs.length}件のKAが見つかりました</div>}
                <select value={reportId} onChange={e => setReportId(e.target.value)} style={{ ...inputSt, cursor: 'pointer', borderColor: !reportId ? T.danger : T.border }} size={Math.min(filteredKAs.length + 2, 10)}>
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

      </>
    </SheetModal>
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
      display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: SPACING.sm + 2,
      padding: compact ? '10px 12px' : '12px 14px',
      background: isDone ? T.doneBg : isOverdue ? T.overdueBg : T.bgCard,
      border: `1px solid ${isDone ? T.doneBorder : isOverdue ? T.overdueBorder : T.border}`,
      borderRadius: RADIUS.md, marginBottom: SPACING.sm, opacity: isDone ? 0.6 : 1,
      boxShadow: isDone ? SHADOWS.none : SHADOWS.xs,
      transition: 'all 0.2s ease',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input ref={editRef} value={editTitle} onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => {
                // IME 変換中の Enter は変換確定なので無視
                if (e.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: RADIUS.xs, border: `1px solid ${T.accent}`, background: T.bg, color: T.text, ...TYPO.body, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
              <span style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted }}>期日:</span>
              <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: RADIUS.xs, border: `1px solid ${T.border}`, background: T.bg, color: T.text, ...TYPO.subhead, fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={saveEdit} style={{ ...btnPrimary({ T, size: 'sm', color: T.success }), padding: '4px 12px' }}>保存</button>
              <button onClick={cancelEdit} style={{ ...btnSecondary({ T, size: 'sm' }), padding: '4px 12px', color: T.textMuted }}>取消</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
              <span onClick={() => !isDone && startEdit()} style={{ ...TYPO.body, fontWeight: 600, color: isDone ? T.textMuted : T.text, textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, cursor: isDone ? 'default' : 'pointer' }} title={isDone ? '' : 'クリックして編集'}>
                {task.title || '(未入力)'}
              </span>
              {task.assignee && (
                <span style={{ ...TYPO.caption, letterSpacing: 0, color: avatarColor(task.assignee), fontWeight: 600 }}>
                  @{task.assignee}
                </span>
              )}
            </div>
            {!compact && (
              <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap', marginTop: 3 }}>
                {ka ? (
                  <>
                    <span style={{ ...TYPO.caption, letterSpacing: 0, color: T.textMuted, background: T.sectionBg, padding: '1px 6px', borderRadius: RADIUS.xs, border: `1px solid ${T.border}` }}>
                      KA: {ka.ka_title || '(無題)'}
                    </span>
                    {obj && (
                      <span style={{ ...TYPO.caption, letterSpacing: 0, color: T.textFaint }}>
                        OKR: {obj.title}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ ...TYPO.caption, letterSpacing: 0, display: 'inline-flex', alignItems: 'center', gap: 3, color: T.warn, fontWeight: 600, background: T.warnBg, padding: '1px 6px', borderRadius: RADIUS.xs, border: `1px solid ${T.warn}` }}>
                    <Icon name="alert" size={10} /> KA紐付けなし
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {!isEditing && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
          <StatusBadge status={status} onChange={(s) => onStatusChange(task.id, s)} T={T} />
          {!isDone && (
            <span onClick={startEdit} style={{ display: 'inline-flex', color: T.textFaint, cursor: 'pointer', padding: '2px 4px' }} title="編集"><Icon name="pencil" size={13} /></span>
          )}
          <span onClick={() => { if (window.confirm(`「${task.title}」を削除しますか？`)) onDeleteTask(task.id) }} style={{ display: 'inline-flex', color: T.danger, cursor: 'pointer', padding: '2px 4px', opacity: 0.6 }} title="削除"><Icon name="trash" size={13} /></span>
          {task.due_date ? (
            <span style={{
              ...TYPO.footnote, fontWeight: 600, padding: '2px 8px', borderRadius: RADIUS.xs,
              display: 'inline-flex', alignItems: 'center', gap: 3,
              color: isOverdue ? T.danger : task.due_date <= thisSunday ? T.warn : T.textMuted,
              background: isOverdue ? T.dangerBg : 'transparent',
            }}>
              {isOverdue && <Icon name="alert" size={11} />}{formatDate(task.due_date)}
            </span>
          ) : (
            <span style={{ ...TYPO.footnote, fontWeight: 600, color: T.textFaint }}>期限なし</span>
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
      <div style={{ marginBottom: SPACING.xl }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
          <span style={{ display: 'inline-flex', color: color || T.text }}><Icon name={icon} size={14} /></span>
          <span style={{ ...TYPO.callout, color: color || T.text }}>{title}</span>
          <span style={{ ...TYPO.footnote, color: T.textFaint, fontWeight: 600, background: T.sectionBg, padding: '1px 8px', borderRadius: RADIUS.pill, border: `1px solid ${T.border}` }}>{items.length}件</span>
        </div>
        {items.map(t => <TaskCard key={t.id} task={t} kaMap={kaMap} objMap={objMap} T={T} onStatusChange={onStatusChange} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} myName={myName} />)}
      </div>
    )
  }

  return (
    <>
      {/* サマリーバー */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.xl, flexWrap: 'wrap' }}>
        {STATUS_ORDER.map(s => {
          const cfg = STATUS_CONFIG[s]
          const count = s === 'done' ? done.length : tasks.filter(t => getTaskStatus(t) === s).length
          return (
            <div key={s} style={{ padding: '8px 16px', borderRadius: RADIUS.sm, background: cfg.bg, border: `1px solid ${cfg.border}`, fontSize: TYPO.subhead.fontSize }}>
              <span style={{ fontWeight: 700, fontSize: 18, color: cfg.color }}>{count}</span>
              <span style={{ color: cfg.color, marginLeft: 6, opacity: 0.8 }}>{cfg.label}</span>
            </div>
          )
        })}
        {overdue.length > 0 && (
          <div style={{ padding: '8px 16px', borderRadius: RADIUS.sm, background: T.dangerBg, border: `1px solid ${T.danger}`, fontSize: TYPO.subhead.fontSize }}>
            <span style={{ fontWeight: 700, fontSize: 18, color: T.danger }}>{overdue.length}</span>
            <span style={{ color: T.danger, marginLeft: 6 }}>期限超過</span>
          </div>
        )}
      </div>

      {totalIncomplete === 0 && done.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: T.textFaint }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SPACING.md, color: T.success }}><Icon name="check" size={36} /></div>
          <div style={{ ...TYPO.headline, color: T.text }}>タスクがありません</div>
          <div style={{ ...TYPO.body, marginTop: 6 }}>割り当てられたタスクがここに表示されます</div>
        </div>
      )}

      {renderSection('期限超過', 'alert', overdue, T.danger)}
      {renderSection('今週', 'calendar', thisWeek, T.warn)}
      {renderSection('来週以降', 'note', upcoming)}
      {renderSection('期限なし', 'pin', noDue)}

      {done.length > 0 && (
        <div style={{ marginTop: SPACING.sm }}>
          <div onClick={() => setShowDone(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm, cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ display: 'inline-flex', color: T.success }}><Icon name="check" size={14} /></span>
            <span style={{ ...TYPO.callout, color: T.success }}>完了済み（直近1週間）</span>
            <span style={{ ...TYPO.footnote, color: T.textFaint, fontWeight: 600, background: T.sectionBg, padding: '1px 8px', borderRadius: RADIUS.pill, border: `1px solid ${T.border}` }}>{done.length}件</span>
            <span style={{ display: 'inline-flex', color: T.textFaint, marginLeft: SPACING.xs }}><Icon name={showDone ? 'chevronD' : 'chevronR'} size={12} /></span>
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
    <div style={{ display: 'flex', gap: SPACING.lg, minHeight: 400, overflowX: 'auto', paddingBottom: SPACING.sm }}>
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
              background: isOver
                ? `linear-gradient(180deg, ${cfg.bg} 0%, ${cfg.color}10 100%)`
                : `linear-gradient(180deg, ${T.bgCard} 0%, ${cfg.color}06 100%)`,
              border: `1px solid ${isOver ? cfg.color + '60' : cfg.color + '1a'}`,
              borderRadius: RADIUS.xl, padding: SPACING.lg - 2,
              boxShadow: SHADOWS.sm,
              transition: 'all 0.2s ease',
            }}
          >
            {/* カラムヘッダー (iOS 風) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.lg - 2, paddingBottom: SPACING.sm + 2,
              borderBottom: `1px solid ${cfg.color}26`,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: RADIUS.sm,
                background: `linear-gradient(135deg, ${cfg.color} 0%, ${cfg.color}c0 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800,
                boxShadow: `0 2px 4px ${cfg.color}55`,
              }}><Icon name={cfg.icon} size={14} /></div>
              <span style={{ ...TYPO.headline, fontWeight: 800, color: cfg.color, letterSpacing: '-0.01em' }}>{cfg.label}</span>
              <span style={{
                marginLeft: 'auto',
                ...TYPO.footnote, fontWeight: 800, color: cfg.color,
                background: `${cfg.color}1f`, padding: '2px 10px', borderRadius: RADIUS.pill,
              }}>{colTasks.length}</span>
            </div>
            {/* カード */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {colTasks.length === 0 && (
                <div style={{ padding: '20px 8px', textAlign: 'center', color: T.textFaint, fontSize: TYPO.subhead.fontSize }}>
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
        textAlign: 'center', padding: 60, color: T.textMuted, fontSize: TYPO.body.fontSize,
        background: T.bgCard, borderRadius: RADIUS.md, border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SPACING.md, color: T.textMuted }}><Icon name="chart" size={36} /></div>
        <div>タスクがありません</div>
      </div>
    )
  }

  const PANEL_HEIGHT = 520 // ガント本体の固定高さ

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2 }}>
      {/* 操作バー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
        <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted }}>表示密度</div>
        <div style={{ display: 'flex', background: T.sectionBg, borderRadius: RADIUS.xs + 1, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
          {[
            { key: 'day',  label: '日単位' },
            { key: 'week', label: '週単位(圧縮)' },
          ].map(z => (
            <button key={z.key} onClick={() => setZoom(z.key)} style={{
              padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: TYPO.footnote.fontSize,
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
            background: T.sectionBg, color: T.textSub, ...TYPO.footnote, fontWeight: 600,
            borderRadius: RADIUS.xs + 1, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}
        ><Icon name="pin" size={11} /> 今日へ</button>
        <div style={{ flex: 1 }} />
        <div style={{ ...TYPO.caption, letterSpacing: 0, color: T.textMuted }}>
          凡例: <span style={{ color: STATUS_CONFIG.not_started.color }}>■未着手</span> <span style={{ color: STATUS_CONFIG.in_progress.color, marginLeft: 6 }}>■進行中</span> <span style={{ color: STATUS_CONFIG.done.color, marginLeft: 6 }}>■完了</span> <span style={{ color: T.danger, marginLeft: 6 }}>│今日</span>
        </div>
      </div>

      {/* ガント本体：左右2パネル構成 */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
        overflow: 'hidden', display: 'flex', height: PANEL_HEIGHT,
      }}>
        {/* ─── 左パネル：タスク名（縦スクロール連動） ─── */}
        <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.borderMid}`, background: T.bgCard }}>
          {/* 左ヘッダー */}
          <div style={{
            height: HEADER_H, flexShrink: 0,
            display: 'flex', alignItems: 'center', padding: '0 12px',
            background: T.sectionBg, borderBottom: `1px solid ${T.border}`,
            ...TYPO.footnote, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5,
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
                  <span style={{ display: 'inline-flex', color: cfg.color, flexShrink: 0 }}><Icon name={cfg.icon} size={12} /></span>
                  <div style={{
                    flex: 1, minWidth: 0, fontSize: TYPO.subhead.fontSize, color: T.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    textDecoration: st === 'done' ? 'line-through' : 'none',
                  }} title={task.title || ka?.ka_title || ''}>
                    {task.title || ka?.ka_title || '(無題)'}
                  </div>
                  {task.assignee && (
                    <span style={{ ...TYPO.caption, letterSpacing: 0, color: T.textMuted, flexShrink: 0 }}>
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
                    background: isToday ? T.dangerBg : isWeekend ? T.sectionBg : 'transparent',
                    color: isToday ? T.danger : isWeekend ? T.textFaint : T.textMuted,
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
              background: T.danger, opacity: 0.55,
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
                      background: isOverdue ? T.danger : cfg.color,
                      borderRadius: RADIUS.xs - 1,
                      opacity: st === 'done' ? 0.5 : noDue ? 0.4 : 0.85,
                      border: isOverdue ? `2px solid ${T.danger}` : noDue ? `1px dashed ${cfg.color}` : `1px solid ${cfg.color}`,
                      display: 'flex', alignItems: 'center',
                      padding: '0 6px',
                      ...TYPO.caption, letterSpacing: 0, color: '#fff',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      zIndex: 2,
                    }}
                  >
                    {width > 40 && <span>{task.title || ''}</span>}
                    {isOverdue && <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><Icon name="alert" size={10} /></span>}
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
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
          padding: '10px 14px',
        }}>
          <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.textMuted, marginBottom: SPACING.xs + 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="note" size={11} /> 期限未設定 ({tasksNoDue.length}件) — ガントに表示できないタスク
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs + 2 }}>
            {tasksNoDue.map(t => {
              const st = getTaskStatus(t)
              const cfg = STATUS_CONFIG[st]
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: SPACING.xs + 2,
                  padding: '4px 10px', borderRadius: RADIUS.xs,
                  background: T.sectionBg, border: `1px solid ${T.border}`,
                  ...TYPO.footnote, fontWeight: 600, color: T.text,
                  opacity: st === 'done' ? 0.5 : 1,
                }}>
                  <span style={{ display: 'inline-flex', color: cfg.color }}><Icon name={cfg.icon} size={11} /></span>
                  <span>{t.title || '(無題)'}</span>
                  {t.assignee && <span style={{ color: T.textMuted, ...TYPO.caption, letterSpacing: 0 }}>· {t.assignee}</span>}
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
  // グローバルショートカット: ⌘ + N (Ctrl + N) でタスク追加モーダルを開く
  useEffect(() => {
    const handleKey = (e) => {
      // input / textarea / contenteditable にフォーカス中は通常の N 入力を妨げない
      const tag = e.target?.tagName?.toLowerCase()
      const editable = e.target?.isContentEditable
      if (tag === 'input' || tag === 'textarea' || editable) return
      if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setShowCreateModal(true)
      }
    }
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

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

  // フィルタ済みタスク (email を持つタスクは email 主、無いタスクのみ表示名フォールバック)
  const myEmail = (user?.email || '').toLowerCase()
  const selEmail = (members?.find(m => m.name === selectedMember)?.email || '').toLowerCase()
  const matchSelf = (t) => {
    const te = (t.assignee_email || '').toLowerCase()
    return te ? te === myEmail : t.assignee === myName
  }
  const matchSel = (t) => {
    const te = (t.assignee_email || '').toLowerCase()
    return te ? (!!selEmail && te === selEmail) : t.assignee === selectedMember
  }
  const filteredTasks = viewMode === 'my'
    ? allTasks.filter(matchSelf)
    : selectedMember
      ? allTasks.filter(matchSel)
      : allTasks

  const targetName = viewMode === 'my' ? myName : selectedMember
  const targetMember = members?.find(m => m.name === targetName)

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    if (onViewModeChange) onViewModeChange(mode)
  }

  if (loading) return <div style={{ padding: SPACING['3xl'] + 8, color: T.accent, ...TYPO.headline }}>読み込み中...</div>

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.bg, color: T.text, fontFamily: 'system-ui,sans-serif' }}>
      {/* 全社モード時のサイドバー (モバイル非表示 - マイタスクに限定) */}
      {viewMode === 'all' && !isMobile && (
        <div style={{
          width: 200, flexShrink: 0, overflowY: 'auto', background: T.sidebarBg,
          borderRight: `1px solid ${T.border}`, padding: '12px 0',
        }}>
          <div style={{ padding: '4px 12px 10px', ...TYPO.caption, color: T.textFaint, letterSpacing: 1 }}>メンバー</div>
          <div onClick={() => setSelectedMember(null)} style={{
            padding: '8px 14px', cursor: 'pointer', ...TYPO.subhead,
            background: !selectedMember ? T.sidebarActive : 'transparent',
            color: !selectedMember ? T.accent : T.textSub,
            borderLeft: !selectedMember ? `3px solid ${T.accent}` : '3px solid transparent',
          }}>
            全員
            <span style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.textFaint, marginLeft: 6 }}>{allTasks.filter(t => getTaskStatus(t) !== 'done').length}</span>
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
                <span style={{ fontSize: TYPO.subhead.fontSize, fontWeight: isActive ? 700 : 500, color: isActive ? T.accent : T.textSub, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}
                </span>
                {count > 0 && (
                  <span style={{ ...TYPO.caption, letterSpacing: 0, color: T.textFaint, background: T.sectionBg, padding: '1px 6px', borderRadius: RADIUS.pill, border: `1px solid ${T.border}` }}>{count}</span>
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
          <div style={{ marginBottom: isMobile ? 14 : SPACING['2xl'] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              {targetMember?.avatar_url ? (
                <img src={targetMember.avatar_url} alt={targetName} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${avatarColor(targetName)}60` }} />
              ) : targetName ? (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${avatarColor(targetName)}25`, border: `2px solid ${avatarColor(targetName)}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: avatarColor(targetName) }}>
                  {targetName.slice(0, 2)}
                </div>
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...(isMobile ? TYPO.title2 : TYPO.title1) }}>
                  {viewMode === 'my' ? 'マイタスク' : selectedMember ? `${selectedMember} のタスク` : '全社タスク'}
                </div>
                {!isMobile && (
                  <div style={{ ...TYPO.subhead, color: T.textMuted }}>
                    {viewMode === 'my' ? `${myName} さんに割り当てられたタスク` : selectedMember ? `${selectedMember} さんに割り当てられたタスク` : '全メンバーのタスク一覧'}
                  </div>
                )}
              </div>
              {/* タスク追加 */}
              <button onClick={() => setShowCreateModal(true)} style={{
                ...btnPrimary({ T, size: isMobile ? 'lg' : 'md' }),
                whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 4,
                minHeight: isMobile ? 44 : 'auto',
              }} title="⌘ + N でも追加できます"><Icon name="plus" size={isMobile ? 16 : 14} /> タスク追加</button>
              {/* マイ/全社 切替 (モバイルはマイタスクに固定、切替不可) */}
              {!isMobile && (
                <div style={{ display: 'flex', background: T.sectionBg, borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                  <button onClick={() => handleViewModeChange('my')} style={{
                    padding: '6px 14px', border: 'none', cursor: 'pointer', ...TYPO.subhead, fontFamily: 'inherit',
                    background: viewMode === 'my' ? T.accent : 'transparent',
                    color: viewMode === 'my' ? '#fff' : T.textMuted,
                  }}>マイタスク</button>
                  <button onClick={() => handleViewModeChange('all')} style={{
                    padding: '6px 14px', border: 'none', cursor: 'pointer', ...TYPO.subhead, fontFamily: 'inherit',
                    background: viewMode === 'all' ? T.accent : 'transparent',
                    color: viewMode === 'all' ? '#fff' : T.textMuted,
                  }}>全社タスク</button>
                </div>
              )}
              {/* リスト/カード/ガント切替 (モバイルはリスト固定) */}
              <div style={{ display: isMobile ? 'none' : 'flex', background: T.sectionBg, borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {[
                  { key: 'list',  icon: 'note',  label: 'リスト', title: 'リスト: 期限でグルーピング' },
                  { key: 'board', icon: 'workspace', label: 'カード', title: 'カード: ステータス別カンバン' },
                  { key: 'gantt', icon: 'chart', label: 'ガント', title: 'ガント: 時間軸で可視化' },
                ].map(v => (
                  <button
                    key={v.key}
                    onClick={() => setDisplayMode(v.key)}
                    title={v.title}
                    style={{
                      padding: '6px 12px', border: 'none', cursor: 'pointer',
                      ...TYPO.subhead, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: displayMode === v.key ? T.accent : 'transparent',
                      color: displayMode === v.key ? '#fff' : T.textMuted,
                    }}
                  >
                    <Icon name={v.icon} size={13} />
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
        <TaskCreateModal onClose={() => setShowCreateModal(false)} onCreated={load} members={members} myName={myName} T={T} fiscalYear={fiscalYear} defaultNoKaLink={true} />
      )}
    </div>
  )
}
