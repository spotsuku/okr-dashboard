'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── テーマ ──────────────────────────────────────────────────────────────────
const DARK_T = {
  bg:'#090d18', bgCard:'#0e1420', bgCard2:'#111828',
  border:'rgba(255,255,255,0.07)', borderLight:'rgba(255,255,255,0.04)',
  borderMid:'rgba(255,255,255,0.1)', text:'#e8eaf0', textSub:'#a0a8be',
  textMuted:'#606880', textFaint:'#404660', textFaintest:'#303450',
}
const LIGHT_T = {
  bg:'#f0f2f7', bgCard:'#ffffff', bgCard2:'#f7f8fc',
  border:'rgba(0,0,0,0.08)', borderLight:'rgba(0,0,0,0.05)',
  borderMid:'rgba(0,0,0,0.12)', text:'#1a1f36', textSub:'#4a5270',
  textMuted:'#7080a0', textFaint:'#90a0bc', textFaintest:'#b0bcd0',
}
const W_THEMES = { dark: DARK_T, light: LIGHT_T }

// ─── 定数 ──────────────────────────────────────────────────────────────────
const MONTH_ORDER  = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
const MONTH_LABELS = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月']
const QUARTERS = [
  { label: 'Q1', span: 3, months: '4〜6月' },
  { label: 'Q2', span: 3, months: '7〜9月' },
  { label: 'Q3', span: 3, months: '10〜12月' },
  { label: 'Q4', span: 3, months: '1〜3月' },
]
const MONTHS_SELECT = [
  { value: 4,  label: '4月' }, { value: 5,  label: '5月' },
  { value: 6,  label: '6月' }, { value: 7,  label: '7月' },
  { value: 8,  label: '8月' }, { value: 9,  label: '9月' },
  { value: 10, label: '10月'}, { value: 11, label: '11月'},
  { value: 12, label: '12月'}, { value: 1,  label: '1月' },
  { value: 2,  label: '2月' }, { value: 3,  label: '3月' },
]

const GRID_COLS = '120px repeat(12, minmax(0, 1fr))'

// ─── ユーティリティ ──────────────────────────────────────────────────────────
function getDaysLeftInfo(dueDate) {
  if (!dueDate) return { text: null, style: {} }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24))

  if (diff < 0) return { text: `${Math.abs(diff)}日超過`, style: { color: '#dc2626', fontWeight: '600' } }
  if (diff === 0) return { text: '今日', style: { color: '#dc2626', fontWeight: '600' } }
  if (diff <= 14) return { text: `残${diff}日`, style: { color: '#ea580c', fontWeight: '600' } }
  if (diff <= 30) return { text: `残${diff}日`, style: { color: '#7080a0', fontWeight: '500' } }
  return { text: null, style: {} }
}

function hexWithAlpha(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(136,136,136,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ─── MilestoneHoverTooltip ───────────────────────────────────────────────────
function MilestoneHoverTooltip({ milestone, orgColor, T, position }) {
  const { title, due_date, focus_level, status, owner } = milestone
  const { text: daysText, style: daysStyle } = getDaysLeftInfo(due_date)
  const isDone = status === 'done'
  const isDelayed = status === 'delayed'
  const statusLabel = isDone ? '完了' : isDelayed ? '遅延' : '進行中'
  const statusColor = isDone ? '#22c55e' : isDelayed ? '#dc2626' : '#3b82f6'


  return (
    <div style={{
      position: 'fixed', zIndex: 100,
      left: position.x, top: position.y,
      pointerEvents: 'none',
    }}>
      <div style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`,
        borderRadius: 10, padding: '14px 16px', minWidth: 220, maxWidth: 320,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8, lineHeight: 1.4 }}>
          {isDone ? '✓ ' : ''}{title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ color: T.textMuted, minWidth: 52 }}>期間</span>
            <span style={{ color: T.textSub }}>{startLabel}〜{endLabel}</span>
          </div>
          {due_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ color: T.textMuted, minWidth: 52 }}>期日</span>
              <span style={{ color: T.textSub }}>{due_date}</span>
              {daysText && !isDone && (
                <span style={{ fontSize: 10, fontWeight: 600, ...daysStyle }}>{daysText}</span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ color: T.textMuted, minWidth: 52 }}>ステータス</span>
            <span style={{
              fontSize: 10, fontWeight: 500, color: statusColor,
              backgroundColor: hexWithAlpha(statusColor, 0.1),
              padding: '1px 6px', borderRadius: 4,
            }}>{statusLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ color: T.textMuted, minWidth: 52 }}>注力</span>
            <span style={{ color: T.textSub }}>{focus_level === 'focus' ? '最注力' : '進行中'}</span>
          </div>
          {owner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ color: T.textMuted, minWidth: 52 }}>責任者</span>
              <span style={{ color: T.textSub }}>{owner}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MilestoneBar ────────────────────────────────────────────────────────────
// MilestoneDot: due_dateの月列に点を表示する新実装
function MilestoneDot({ milestone, orgColor, isChild, onEdit, isAdmin, T, colIndex, visibleMonthOrder }) {
  const { title, due_date, focus_level, status, owner } = milestone
  const [hovered, setHovered] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const { text: daysText, style: daysStyle } = getDaysLeftInfo(due_date)
  const isDone    = status === 'done'
  const isDelayed = status === 'delayed'
  const isStar    = focus_level === 'star' && !isDone
  const isFocus   = focus_level === 'focus' && !isDone

  const dotSize = isStar ? (isChild ? 18 : 22) : (isChild ? 14 : 18)
  const dotColor = isDone    ? '#22c55e'
    : isDelayed              ? '#dc2626'
    : isStar                 ? '#f59e0b'
    : isFocus                ? orgColor
    :                          hexWithAlpha(orgColor, 0.7)

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipW = 300, tooltipH = 200
    let x = rect.left + rect.width / 2 - tooltipW / 2
    let y = rect.top - tooltipH - 10
    if (y < 8) y = rect.bottom + 10
    if (x + tooltipW > window.innerWidth - 8) x = window.innerWidth - tooltipW - 8
    if (x < 8) x = 8
    setTooltipPos({ x, y })
    setHovered(true)
  }

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: `${colIndex * 100}%`,
      transform: 'translate(-50%, -50%)',
      zIndex: 30,
    }}>
      <div
        onClick={isAdmin ? () => onEdit(milestone) : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: dotSize, height: dotSize,
          borderRadius: '50%',
          backgroundColor: dotColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2.5px solid ${isDone ? '#16a34a' : isStar ? '#d97706' : isFocus ? orgColor : hexWithAlpha(orgColor, 0.9)}`,
          boxShadow: isDone
            ? `0 0 0 3px ${hexWithAlpha('#22c55e', 0.2)}`
            : isStar
            ? `0 0 0 4px ${hexWithAlpha('#f59e0b', 0.25)}, 0 2px 8px rgba(0,0,0,0.2)`
            : isFocus
            ? `0 0 0 3px ${hexWithAlpha(orgColor, 0.2)}, 0 2px 8px rgba(0,0,0,0.15)`
            : `0 1px 4px rgba(0,0,0,0.15)`,
          cursor: isAdmin ? 'pointer' : 'default',
          transition: 'transform 0.12s',
          userSelect: 'none',
          fontSize: dotSize * 0.55,
          color: '#fff', fontWeight: 700,
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.25)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {isStar ? '⭐' : isDone ? '✓' : isDelayed ? '!' : ''}
      </div>

      {hovered && (
        <div style={{
          position: 'fixed', left: tooltipPos.x, top: tooltipPos.y,
          zIndex: 9999, pointerEvents: 'none',
          background: T.bgCard, border: `1px solid ${T.borderMid}`,
          borderRadius: 10, padding: '14px 16px',
          minWidth: 230, maxWidth: 300,
          boxShadow: '0 8px 28px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{title}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {due_date && (
              <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                <span style={{ color: T.textMuted, minWidth: 44 }}>期日</span>
                <span style={{ color: T.textSub }}>{due_date}</span>
                {daysText && !isDone && <span style={{ fontSize: 10, fontWeight: 700, ...daysStyle }}>{daysText}</span>}
              </div>
            )}
            {owner && (
              <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                <span style={{ color: T.textMuted, minWidth: 44 }}>責任者</span>
                <span style={{ color: T.textSub }}>{owner}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: T.textMuted, minWidth: 44 }}>状態</span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                color: isDone ? '#16a34a' : isDelayed ? '#dc2626' : '#3b82f6',
                background: isDone ? '#16a34a18' : isDelayed ? '#dc262618' : '#3b82f618',
              }}>{isDone ? '完了' : isDelayed ? '遅延' : '進行中'}</span>
              {isStar && <span style={{ fontSize: 10, fontWeight: 600, color: '#d97706' }}>⭐ 最重要</span>}
              {isFocus && !isStar && <span style={{ fontSize: 10, fontWeight: 600, color: orgColor }}>重要</span>}
            </div>
          </div>
          {isAdmin && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `0.5px solid ${T.borderLight}`, fontSize: 10, color: T.textMuted }}>
              クリックして編集
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ─── OrgRow ──────────────────────────────────────────────────────────────────
// テーマが複数あるとき → 1テーマ1行で縦積み
// display:contentsでグリッドの子として振る舞う
function OrgRow({ org, isChild, onEdit, onEditDot, onAddMilestone, onAddDot, isAdmin, T, visibleMonthOrder = MONTH_ORDER }) {
  const { name, color, milestones } = org
  const n = visibleMonthOrder.length
  const rowH = isChild ? 30 : 36

  // due_date の月 → タイムライン列の左端からの割合（0〜1）
  const dotLeft = (dot) => {
    if (!dot.due_date) return null
    const m = parseInt(dot.due_date.split('-')[1], 10)
    const idx = visibleMonthOrder.indexOf(m)
    if (idx === -1) return null
    return (idx + 0.5) / n  // 列の中央
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `120px 1fr 32px`,
      borderBottom: `0.5px solid ${T.borderLight}`,
    }}>
      {/* ── 左列: 組織名ラベル ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 5,
        padding: isChild ? '6px 6px 6px 16px' : '6px 8px 6px 0',
        fontSize: isChild ? 10 : 11, fontWeight: 500, color: T.textSub,
        overflow: 'hidden', minWidth: 0,
        gridRow: `1 / ${Math.max(milestones.length, 1) + 1}`,
      }}>
        <span style={{
          width: isChild ? 5 : 7, height: isChild ? 5 : 7,
          borderRadius: '50%', backgroundColor: color || '#888', flexShrink: 0, marginTop: 3,
        }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
        {isAdmin && (
          <button
            onClick={() => onAddMilestone(org.id)}
            title="テーマを追加"
            style={{
              flexShrink: 0, width: 16, height: 16, borderRadius: '50%',
              border: `1px solid ${T.borderMid}`, background: 'transparent',
              color: T.textMuted, fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, opacity: 0.5, transition: 'opacity 0.15s', marginTop: 1,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
          >+</button>
        )}
      </div>

      {/* ── 中央列: タイムライン（テーマごとに1行） ── */}
      {milestones.length === 0 ? (
        <div style={{ height: rowH }} />
      ) : milestones.map((theme, ti) => {
        const isDone    = theme.status === 'done'
        const isDelayed = theme.status === 'delayed'
        const isStar    = theme.focus_level === 'star' && !isDone
        const isFocus   = theme.focus_level === 'focus' && !isDone
        const dc = isDone ? '#22c55e'
          : isDelayed     ? '#dc2626'
          : isStar        ? '#f59e0b'
          : isFocus       ? (color || '#888')
          :                 hexWithAlpha(color || '#888', 0.65)

        // start_date/end_date → バーの左端・幅（%）
        const parseMonth = (d) => d ? parseInt(d.split('-')[1], 10) : null
        const sm = parseMonth(theme.start_date)
        const em = parseMonth(theme.end_date)
        const si = sm !== null ? visibleMonthOrder.indexOf(sm) : -1
        const ei = em !== null ? visibleMonthOrder.indexOf(em) : -1
        const hasBar = si !== -1 && ei !== -1
        const barLeft  = hasBar ? si / n * 100 : 0
        const barWidth = hasBar ? (ei - si + 1) / n * 100 : 0

        // この テーマの達成点
        const themeDots = (theme.dots || [])
          .filter(d => d.due_date)
          .sort((a, b) => a.due_date.localeCompare(b.due_date))

        const isLast = ti === milestones.length - 1

        return (
          <div
            key={theme.id}
            style={{
              position: 'relative',
              height: rowH,
              borderBottom: isLast ? 'none' : `0.5px solid ${hexWithAlpha(color || '#888', 0.1)}`,
              overflow: 'visible',
            }}
          >
            {/* バー（z-index低め・テキスト表示） */}
            {hasBar && (
              <div
                onClick={() => isAdmin && onEdit(theme)}
                title={isAdmin ? 'クリックしてテーマを編集' : theme.title}
                style={{
                  position: 'absolute',
                  left: `${barLeft}%`,
                  width: `${Math.max(barWidth, 1)}%`,
                  top: '50%', transform: 'translateY(-50%)',
                  height: isChild ? 18 : 22,
                  background: hexWithAlpha(dc, isDone ? 0.15 : 0.1),
                  border: `1px solid ${hexWithAlpha(dc, 0.3)}`,
                  borderRadius: 5,
                  display: 'flex', alignItems: 'center',
                  overflow: 'hidden',
                  cursor: isAdmin ? 'pointer' : 'default',
                  boxSizing: 'border-box',
                  zIndex: 1,
                }}
              >
                {/* 丸が被らないようにパディングで左右を空ける */}
                <span style={{
                  padding: '0 14px',
                  fontSize: 9, fontWeight: 600,
                  color: dc, opacity: 0.9,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  flex: 1,
                  pointerEvents: 'none',
                }}>
                  {isStar ? '⭐ ' : isDone ? '✓ ' : ''}{theme.title}
                </span>
              </div>
            )}

            {/* 達成点の連結ライン */}
            {themeDots.length >= 2 && themeDots.map((dot, di) => {
              if (di === themeDots.length - 1) return null
              const x1 = dotLeft(dot)
              const x2 = dotLeft(themeDots[di + 1])
              if (x1 === null || x2 === null) return null
              return (
                <div key={`ln-${dot.id}`} style={{
                  position: 'absolute',
                  left: `${x1 * 100}%`, width: `${(x2 - x1) * 100}%`,
                  top: '50%', height: 1.5,
                  background: hexWithAlpha(color || '#888', 0.3),
                  pointerEvents: 'none',
                  zIndex: 1,
                }} />
              )
            })}

            {/* 達成点（●） */}
            {themeDots.map(dot => {
              const lf = dotLeft(dot)
              if (lf === null) return null
              return (
                <MilestoneDot
                  key={dot.id}
                  milestone={dot}
                  orgColor={color || '#888'}
                  isChild={isChild}
                  onEdit={onEditDot}
                  isAdmin={isAdmin}
                  T={T}
                  colIndex={lf}
                  visibleMonthOrder={visibleMonthOrder}
                />
              )
            })}
          </div>
        )
      })}

      {/* ── 右列: 達成点追加ボタン（テーマごとに1行） ── */}
      {milestones.length === 0 ? (
        <div style={{ height: rowH }} />
      ) : milestones.map((theme, ti) => {
        const isDone    = theme.status === 'done'
        const isDelayed = theme.status === 'delayed'
        const isStar    = theme.focus_level === 'star' && !isDone
        const isFocus   = theme.focus_level === 'focus' && !isDone
        const dc = isDone ? '#22c55e'
          : isDelayed     ? '#dc2626'
          : isStar        ? '#f59e0b'
          : isFocus       ? (color || '#888')
          :                 hexWithAlpha(color || '#888', 0.65)
        const isLast = ti === milestones.length - 1
        return (
          <div key={`btn-${theme.id}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: rowH,
            borderBottom: isLast ? 'none' : `0.5px solid ${hexWithAlpha(color || '#888', 0.1)}`,
          }}>
            {isAdmin && (
              <button
                onClick={() => onAddDot && onAddDot(theme.id)}
                title="達成点を追加"
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `1.5px solid ${dc}`,
                  background: hexWithAlpha(dc, 0.08),
                  color: dc, fontSize: 14, fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, lineHeight: 1,
                  opacity: 0.65, transition: 'opacity 0.15s, transform 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.transform = 'scale(1.15)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = 0.65; e.currentTarget.style.transform = 'scale(1)' }}
              >＋</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── DotEditModal（達成点の追加・編集）──────────────────────────────────────
function DotEditModal({ dot, onClose, onSaved, onDeleted, T }) {
  const isNew = !dot.id
  const [form, setForm] = useState({
    title:       dot.title || '',
    due_date:    dot.due_date || '',
    status:      dot.status || 'pending',
    focus_level: dot.focus_level || 'normal',
    sort_order:  dot.sort_order || 0,
  })
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (isNew) {
        const { error } = await supabase.from('milestones').insert({
          ...form,
          theme_id: dot.theme_id,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('milestones').update(form).eq('id', dot.id)
        if (error) throw error
      }
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      alert('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      const { error } = await supabase.from('milestones').delete().eq('id', dot.id)
      if (error) throw error
      if (onDeleted) onDeleted()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(false)
    }
  }

  const labelSt = { display: 'block', fontSize: 11, color: T.textSub, marginBottom: 4 }
  const inputSt = {
    width: '100%', marginBottom: 12, fontSize: 13, padding: '6px 8px',
    border: `0.5px solid ${T.borderMid}`, borderRadius: 6,
    background: T.bgCard, color: T.text, fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `0.5px solid ${T.borderMid}`,
        borderRadius: 12, padding: 24, width: 380, maxWidth: '90vw',
      }}>
        <p style={{ fontWeight: 500, marginBottom: 16, fontSize: 14, color: T.text }}>
          {isNew ? '● 達成点を追加' : '● 達成点を編集'}
        </p>

        <label style={labelSt}>達成目標</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputSt} placeholder="例：応募100件達成" autoFocus />

        <label style={labelSt}>期日</label>
        <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputSt} />

        <label style={labelSt}>重要度</label>
        <select value={form.focus_level} onChange={e => setForm(f => ({ ...f, focus_level: e.target.value }))} style={inputSt}>
          <option value="normal">通常</option>
          <option value="focus">重要</option>
          <option value="star">⭐ 最重要</option>
        </select>

        <label style={labelSt}>ステータス</label>
        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputSt}>
          <option value="pending">進行中</option>
          <option value="done">完了</option>
          <option value="delayed">遅延</option>
        </select>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {!isNew && (
            <button onClick={handleDelete} disabled={deleting} style={{
              padding: '8px 12px', border: `1px solid ${confirmDelete ? '#dc2626' : T.borderMid}`, borderRadius: 6,
              cursor: 'pointer', background: confirmDelete ? '#dc2626' : 'transparent',
              fontSize: 12, color: confirmDelete ? '#fff' : '#dc2626', fontFamily: 'inherit',
            }}>{deleting ? '削除中...' : confirmDelete ? '本当に削除' : '削除'}</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            padding: '8px 16px', border: `0.5px solid ${T.borderMid}`, borderRadius: 6,
            cursor: 'pointer', background: 'transparent', fontSize: 13, color: T.textSub, fontFamily: 'inherit',
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()} style={{
            padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer',
            background: T.text, color: T.bgCard, fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            opacity: !form.title.trim() ? 0.5 : 1,
          }}>{saving ? '保存中...' : isNew ? '追加' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── MilestoneEditModal ──────────────────────────────────────────────────────
function MilestoneEditModal({ milestone, onClose, onSaved, onDeleted, T, members = [] }) {
  const isNew = !milestone.id
  const [form, setForm] = useState({
    title:       milestone.title || '',
    start_date:  milestone.start_date || '',
    end_date:    milestone.end_date   || '',
    focus_level: milestone.focus_level || 'normal',
    status:      milestone.status || 'pending',
    owner:       milestone.owner || '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (isNew) {
        const { error } = await supabase.from('milestone_themes').insert({
          ...form,
          org_id: milestone.org_id,
          fiscal_year: milestone.fiscal_year,
          sort_order: milestone.sort_order || 0,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('milestone_themes').update(form).eq('id', milestone.id)
        if (error) throw error
      }
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      alert('保存に失敗しました: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      const { error } = await supabase.from('milestone_themes').delete().eq('id', milestone.id)
      if (error) throw error
      if (onDeleted) onDeleted()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(false)
    }
  }

  const labelSt = { display: 'block', fontSize: 11, color: T.textSub, marginBottom: 4 }
  const inputSt = {
    width: '100%', marginBottom: 12, fontSize: 13, padding: '6px 8px',
    border: `0.5px solid ${T.borderMid}`, borderRadius: 6,
    background: T.bgCard, color: T.text, fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `0.5px solid ${T.borderMid}`,
        borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw',
      }}>
        <p style={{ fontWeight: 500, marginBottom: 16, fontSize: 14, color: T.text }}>
          {isNew ? 'テーマを追加' : 'テーマを編集'}
        </p>

        <label style={labelSt}>テーマ名</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputSt} placeholder="例：二期生集客、AI研修販売" autoFocus />

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>開始日</label>
            <input
              type="date"
              value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              style={{ ...inputSt, marginBottom: 0 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>終了日</label>
            <input
              type="date"
              value={form.end_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              style={{ ...inputSt, marginBottom: 0 }}
            />
          </div>
        </div>

        <label style={labelSt}>注力レベル</label>
        <select value={form.focus_level} onChange={e => setForm(f => ({ ...f, focus_level: e.target.value }))} style={inputSt}>
          <option value="star">⭐ 最重要（星マーク）</option>
          <option value="focus">focus（濃色・最注力）</option>
          <option value="normal">normal（薄色・進行中）</option>
        </select>

        <label style={labelSt}>ステータス</label>
        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputSt}>
          <option value="pending">進行中</option>
          <option value="done">完了</option>
          <option value="delayed">遅延</option>
        </select>

        <label style={labelSt}>責任者</label>
        <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} style={inputSt}>
          <option value="">（未設定）</option>
          {members.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {!isNew && (
            <button onClick={handleDelete} disabled={deleting} style={{
              padding: '8px 12px', border: `1px solid ${confirmDelete ? '#dc2626' : T.borderMid}`, borderRadius: 6,
              cursor: 'pointer', background: confirmDelete ? '#dc2626' : 'transparent',
              fontSize: 12, color: confirmDelete ? '#fff' : '#dc2626', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}>{deleting ? '削除中...' : confirmDelete ? '本当に削除' : '削除'}</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            padding: '8px 16px', border: `0.5px solid ${T.borderMid}`, borderRadius: 6,
            cursor: 'pointer', background: 'transparent', fontSize: 13, color: T.textSub, fontFamily: 'inherit',
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()} style={{
            padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer',
            background: T.text, color: T.bgCard, fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            opacity: !form.title.trim() ? 0.5 : 1,
          }}>{saving ? '保存中...' : isNew ? '追加' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── AddOrgModal（事業部追加モーダル）─────────────────────────────────────────
function AddOrgModal({ levels, fiscalYear, onClose, onSaved, T }) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)

  const parentLevels = levels.filter(l => !l.parent_id)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('levels').insert({
        name: name.trim(),
        parent_id: parentId ? Number(parentId) : null,
        icon: '📁',
        color: '#4d9fff',
        fiscal_year: fiscalYear,
      })
      if (error) throw error
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const labelSt = { display: 'block', fontSize: 11, color: T.textSub, marginBottom: 4 }
  const inputSt = {
    width: '100%', marginBottom: 12, fontSize: 13, padding: '6px 8px',
    border: `0.5px solid ${T.borderMid}`, borderRadius: 6,
    background: T.bgCard, color: T.text, fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `0.5px solid ${T.borderMid}`,
        borderRadius: 12, padding: 24, width: 380, maxWidth: '90vw',
      }}>
        <p style={{ fontWeight: 500, marginBottom: 16, fontSize: 14, color: T.text }}>事業部・部署を追加</p>

        <label style={labelSt}>親組織（空で最上位に追加）</label>
        <select value={parentId} onChange={e => setParentId(e.target.value)} style={inputSt}>
          <option value="">（最上位の事業部として追加）</option>
          {parentLevels.map(l => (
            <option key={l.id} value={l.id}>{l.name}の配下に追加</option>
          ))}
        </select>

        <label style={labelSt}>名前</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputSt} placeholder="例：新規事業部" autoFocus />

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', border: `0.5px solid ${T.borderMid}`, borderRadius: 6,
            cursor: 'pointer', background: 'transparent', fontSize: 13, color: T.textSub, fontFamily: 'inherit',
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} style={{
            padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer',
            background: T.text, color: T.bgCard, fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            opacity: !name.trim() ? 0.5 : 1,
          }}>{saving ? '追加中...' : '追加'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── MilestonePage（メインコンポーネント）────────────────────────────────────
export default function MilestonePage({ levels, themeKey, fiscalYear, user, onLevelsChanged, members = [] }) {
  const T = W_THEMES[themeKey] || DARK_T

  const [themes, setThemes] = useState([])        // milestone_themes
  const [dots, setDots] = useState([])            // milestones（達成点）
  const [milestones, setMilestones] = useState([]) // 後方互換（削除予定）
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editDot, setEditDot] = useState(null)    // 達成点の編集対象
  const [isAdmin, setIsAdmin] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [showAddOrg, setShowAddOrg] = useState(false)
  const [showAllOrgs, setShowAllOrgs] = useState(false)
  const [viewMode, setViewMode] = useState('annual') // 'annual' | 'q1' | 'q2' | 'q3' | 'q4'

  // admin判定
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.email) return
      const { data } = await supabase.from('members').select('is_admin').eq('email', user.email).single()
      if (data?.is_admin) setIsAdmin(true)
    }
    checkAdmin()
  }, [user])

  // マイルストーン取得
  const loadMilestones = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fy = Number(fiscalYear) || 2026
      // テーマ取得
      const { data: themeData, error: te } = await supabase
        .from('milestone_themes')
        .select('*')
        .eq('fiscal_year', fy)
        .order('sort_order', { ascending: true })
      if (te) throw te
      setThemes(themeData || [])
      setMilestones(themeData || []) // 後方互換

      // 達成点取得（theme_idでjoin）
      if (themeData && themeData.length > 0) {
        const themeIds = themeData.map(t => t.id)
        const { data: dotData, error: de } = await supabase
          .from('milestones')
          .select('*')
          .in('theme_id', themeIds)
          .order('sort_order', { ascending: true })
        if (de) throw de
        setDots(dotData || [])
      } else {
        setDots([])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [fiscalYear])

  useEffect(() => { loadMilestones() }, [loadMilestones])

  // levels を親・子に分けてツリー構造を作成
  const orgTree = (() => {
    if (!levels?.length) return []
    const parentLevels = levels.filter(l => !l.parent_id)
    const childLevels  = levels.filter(l => l.parent_id)

    // テーマにdotsを紐付け
    const themesWithDots = themes.map(t => ({
      ...t,
      dots: dots.filter(d => Number(d.theme_id) === Number(t.id))
    }))

    return parentLevels.map(parent => ({
      id: parent.id,
      name: parent.name,
      color: parent.color || '#888888',
      milestones: themesWithDots.filter(m => Number(m.org_id) === Number(parent.id)),
      children: childLevels
        .filter(c => Number(c.parent_id) === Number(parent.id))
        .map(child => ({
          id: child.id,
          name: child.name,
          color: child.color || '#888888',
          milestones: themesWithDots.filter(m => Number(m.org_id) === Number(child.id)),
          children: [],
        })),
    }))
  })()

  // マイルストーンを持つ組織のみ表示（showAllOrgs時は全表示）
  const filteredTree = showAllOrgs ? orgTree : orgTree.filter(org =>
    org.milestones.length > 0 || org.children.some(c => c.milestones.length > 0)
  ).map(org => ({
    ...org,
    children: showAllOrgs ? org.children : org.children.filter(c => c.milestones.length > 0),
  }))

  const handleEdit = useCallback((ms) => {
    if (isAdmin) setEditTarget(ms)
  }, [isAdmin])

  const handleAddMilestone = useCallback((orgId) => {
    setEditTarget({
      org_id: orgId,
      fiscal_year: Number(fiscalYear) || 2026,
      title: '',
      start_date: '',
      end_date: '',
      focus_level: 'normal',
      status: 'pending',
      owner: '',
      sort_order: themes.filter(t => Number(t.org_id) === Number(orgId)).length,
    })
  }, [fiscalYear, themes.length])

  // 達成点の追加
  const handleAddDot = useCallback((themeId) => {
    setEditDot({
      theme_id: themeId,
      title: '',
      due_date: '',
      status: 'pending',
      sort_order: dots.filter(d => d.theme_id === themeId).length,
    })
  }, [dots])

  const currentMonth = new Date().getMonth() + 1
  const currentColIndex = MONTH_ORDER.indexOf(currentMonth)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: T.text, margin: 0 }}>年間マイルストーン</h1>
        <span style={{ fontSize: 12, color: T.textMuted }}>{fiscalYear}年度（4月〜翌3月）</span>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button
              onClick={() => setShowAllOrgs(v => !v)}
              style={{
                padding: '5px 12px', border: `1px solid ${T.borderMid}`, borderRadius: 6,
                cursor: 'pointer', background: showAllOrgs ? hexWithAlpha('#4d9fff', 0.12) : 'transparent',
                fontSize: 12, color: T.textSub, fontFamily: 'inherit',
              }}
            >{showAllOrgs ? '全組織表示中' : '全組織を表示'}</button>
            <button
              onClick={() => setShowAddOrg(true)}
              style={{
                padding: '5px 12px', border: `1px solid ${T.borderMid}`, borderRadius: 6,
                cursor: 'pointer', background: 'transparent',
                fontSize: 12, color: T.textSub, fontFamily: 'inherit',
              }}
            >+ 事業部を追加</button>
          </div>
        )}
      </div>

      {/* ビュー切替タブ */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9, border: `1px solid ${T.borderMid}`, alignSelf: 'flex-start', width: 'fit-content' }}>
        {[
          { key: 'annual', label: '年間' },
          { key: 'q1',     label: 'Q1（4〜6月）' },
          { key: 'q2',     label: 'Q2（7〜9月）' },
          { key: 'q3',     label: 'Q3（10〜12月）' },
          { key: 'q4',     label: 'Q4（1〜3月）' },
        ].map(v => (
          <button key={v.key} onClick={() => setViewMode(v.key)} style={{
            padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: viewMode === v.key ? '#4d9fff22' : 'transparent',
            color: viewMode === v.key ? '#4d9fff' : T.textMuted,
            fontSize: 12, fontWeight: viewMode === v.key ? 700 : 500,
            fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s',
            borderBottom: viewMode === v.key ? '2px solid #4d9fff' : '2px solid transparent',
          }}>{v.label}</button>
        ))}
      </div>

      {/* ローディング / エラー */}
      {loading && <div style={{ color: T.textMuted, fontSize: 13 }}>読み込み中...</div>}
      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>エラー: {error}</div>}

      {/* タイムライン本体 */}
      {!loading && !error && (() => {
        // 四半期フィルタ
        const Q_MONTH_RANGES = {
          q1: [4,5,6], q2: [7,8,9], q3: [10,11,12], q4: [1,2,3]
        }
        const qMonths = viewMode !== 'annual' ? Q_MONTH_RANGES[viewMode] : null
        const visibleMonthOrder  = qMonths ? MONTH_ORDER.filter(m => qMonths.includes(m)) : MONTH_ORDER
        const visibleMonthLabels = qMonths ? MONTH_LABELS.filter((_, i) => qMonths.includes(MONTH_ORDER[i])) : MONTH_LABELS
        const visibleGridCols = `120px repeat(${visibleMonthOrder.length}, minmax(0, 1fr)) 32px`
        // 四半期表示時はそのQ内のマイルストーンのみ表示
        const filterMs = (ms) => {
          if (!qMonths) return ms
          return ms.filter(m => {
            const sm = m.start_date ? parseInt(m.start_date.split('-')[1], 10) : null
            const em = m.end_date   ? parseInt(m.end_date.split('-')[1],   10) : null
            if (!sm || !em) return true // 日付なければ表示
            return qMonths.some(mo => {
              const idx = MONTH_ORDER.indexOf(mo)
              const smIdx = MONTH_ORDER.indexOf(sm)
              const emIdx = MONTH_ORDER.indexOf(em)
              return idx >= smIdx && idx <= emIdx
            })
          })
        }
        return (
        <div style={{
          background: T.bgCard, border: `0.5px solid ${T.borderLight}`,
          borderRadius: 12, padding: 16, overflow: 'visible', width: '100%',
          boxSizing: 'border-box',
        }}>
          <div style={{ width: '100%', minWidth: 0 }}>
            {/* Q ヘッダー行（年間表示のみ） */}
            {viewMode === 'annual' && (
            <div style={{ display: 'grid', gridTemplateColumns: visibleGridCols, gap: 0 }}>
              <div />
              {QUARTERS.map((q, i) => (
                <div key={q.label} style={{
                  gridColumn: `span ${q.span}`, textAlign: 'center',
                  fontSize: 11, fontWeight: 500, color: T.textSub,
                  padding: '4px 2px 2px', borderBottom: `0.5px solid ${T.borderLight}`,
                  borderLeft: i > 0 ? `0.5px solid ${T.borderLight}` : 'none',
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>
                  {q.label}
                  <span style={{ fontWeight: 400, color: T.textMuted, marginLeft: 4 }}>{q.months}</span>
                </div>
              ))}
            </div>
            )}

            {/* 月ヘッダー行 */}
            <div style={{ display: 'grid', gridTemplateColumns: visibleGridCols, gap: 0 }}>
              <div style={{ borderBottom: `0.5px solid ${T.borderLight}` }} />
              {visibleMonthLabels.map((label, i) => {
                const monthVal = visibleMonthOrder[i]
                const isCurrent = monthVal === currentMonth
                const isQStart = viewMode === 'annual' ? i % 3 === 0 : i === 0
                return (
                  <div key={label} style={{
                    textAlign: 'center',
                    fontSize: viewMode === 'annual' ? 10 : 14,
                    color: isCurrent ? T.text : T.textMuted,
                    fontWeight: isCurrent ? 700 : 400,
                    padding: viewMode === 'annual' ? '3px 2px 6px' : '8px 2px 10px',
                    borderBottom: `0.5px solid ${T.borderLight}`,
                    borderLeft: isQStart ? `0.5px solid ${T.borderLight}` : 'none',
                    backgroundColor: isCurrent ? 'rgba(220, 50, 50, 0.06)' : 'transparent',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {label}
                    {isCurrent && (
                      <div style={{
                        position: 'absolute', bottom: 0, left: '50%',
                        transform: 'translateX(-50%)',
                        width: 4, height: 4, borderRadius: '50%',
                        backgroundColor: '#dc2626', opacity: 0.6,
                      }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* 事業部行 */}
            {filteredTree.map(org => (
              <div key={org.id}>
                <OrgRow org={{ ...org, milestones: filterMs(org.milestones) }} isChild={false} onEdit={handleEdit} onEditDot={ms => setEditDot(ms)} onAddMilestone={handleAddMilestone} onAddDot={handleAddDot} isAdmin={isAdmin} T={T} visibleMonthOrder={visibleMonthOrder} />
                {org.children.map(child => (
                  <OrgRow key={child.id} org={{ ...child, milestones: filterMs(child.milestones) }} isChild={true} onEdit={handleEdit} onEditDot={ms => setEditDot(ms)} onAddMilestone={handleAddMilestone} onAddDot={handleAddDot} isAdmin={isAdmin} T={T} visibleMonthOrder={visibleMonthOrder} />
                ))}
              </div>
            ))}

            {filteredTree.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
                マイルストーンがありません
                {isAdmin && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => setShowAllOrgs(true)}
                      style={{
                        padding: '5px 12px', border: `1px solid ${T.borderMid}`, borderRadius: 6,
                        cursor: 'pointer', background: 'transparent',
                        fontSize: 12, color: T.textSub, fontFamily: 'inherit',
                      }}
                    >全組織を表示してマイルストーンを追加</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 凡例 */}
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16,
            paddingTop: 12, borderTop: `0.5px solid ${T.borderLight}`,
            fontSize: 11, color: T.textMuted, alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: 8, borderRadius: 3, backgroundColor: '#1A5C3A' }} />
              <span>濃色 = 最注力</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: 8, borderRadius: 3, backgroundColor: 'rgba(26,92,58,0.15)', border: '0.5px solid rgba(26,92,58,0.3)' }} />
              <span>薄色 = 進行中</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#ea580c', fontWeight: 600 }}>残14日</span>
              <span>= 期日が近い</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>3日超過</span>
              <span>= 期日超過</span>
            </div>
            {isAdmin && (
              <span style={{ marginLeft: 'auto' }}>バーをクリックして編集 ・ 組織名の＋で追加</span>
            )}
          </div>
        </div>
        )
      })()}

      {/* テーマ編集モーダル */}
      {editTarget && (
        <MilestoneEditModal
          milestone={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={loadMilestones}
          onDeleted={loadMilestones}
          T={T}
          members={members}
        />
      )}

      {/* 達成点編集モーダル */}
      {editDot && (
        <DotEditModal
          dot={editDot}
          onClose={() => setEditDot(null)}
          onSaved={loadMilestones}
          onDeleted={loadMilestones}
          T={T}
        />
      )}

      {/* 事業部追加モーダル */}
      {showAddOrg && (
        <AddOrgModal
          levels={levels}
          fiscalYear={fiscalYear}
          onClose={() => setShowAddOrg(false)}
          onSaved={() => { if (onLevelsChanged) onLevelsChanged() }}
          T={T}
        />
      )}
    </div>
  )
}
