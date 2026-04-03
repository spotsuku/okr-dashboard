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
  const { title, due_date, focus_level, status, owner, start_month, end_month } = milestone
  const { text: daysText, style: daysStyle } = getDaysLeftInfo(due_date)
  const isDone = status === 'done'
  const isDelayed = status === 'delayed'
  const statusLabel = isDone ? '完了' : isDelayed ? '遅延' : '進行中'
  const statusColor = isDone ? '#22c55e' : isDelayed ? '#dc2626' : '#3b82f6'
  const startLabel = MONTHS_SELECT.find(m => m.value === start_month)?.label || ''
  const endLabel = MONTHS_SELECT.find(m => m.value === end_month)?.label || ''

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
function MilestoneDot({ milestone, orgColor, isChild, onEdit, isAdmin, T, colIndex, allMilestones, visibleMonthOrder }) {
  const { title, theme, due_date, focus_level, status, owner, start_month, end_month } = milestone
  const [hovered, setHovered] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const dotRef = React.useRef(null)

  const { text: daysText, style: daysStyle } = getDaysLeftInfo(due_date)
  const isDone    = status === 'done'
  const isDelayed = status === 'delayed'
  const isStar    = focus_level === 'star' && !isDone
  const isFocus   = focus_level === 'focus' && !isDone

  // バーの開始・終了colIndex
  const n = visibleMonthOrder ? visibleMonthOrder.length : 12
  const mo = visibleMonthOrder || MONTH_ORDER
  const barStartIdx = mo.indexOf(start_month)
  const barEndIdx   = mo.indexOf(end_month)
  const barLeft  = barStartIdx !== -1 ? barStartIdx / n * 100 : null
  const barRight = barEndIdx   !== -1 ? (barEndIdx + 1) / n * 100 : null

  const dotSize = isStar ? (isChild ? 14 : 18) : (isChild ? 10 : 14)
  const dotColor = isDone ? '#22c55e' : isDelayed ? '#dc2626' : isStar ? '#f59e0b' : isFocus ? orgColor : hexWithAlpha(orgColor, 0.65)

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipW = 300
    let x = rect.left + rect.width / 2 - tooltipW / 2
    let y = rect.bottom + 10
    if (x + tooltipW > window.innerWidth - 8) x = window.innerWidth - tooltipW - 8
    if (x < 8) x = 8
    if (y + 220 > window.innerHeight) y = rect.top - 220 - 6
    setTooltipPos({ x, y })
    setHovered(true)
  }

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: `${colIndex * 100}%`,
      transform: 'translate(-50%, -50%)',
      zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* バー背景（start_month〜end_month） */}
      {barLeft !== null && barRight !== null && (
        <div style={{
          position: 'absolute',
          top: '50%', transform: 'translateY(-50%)',
          left: `${(barLeft - colIndex * 100)}%`,
          width: `${barRight - barLeft}%`,
          height: isChild ? 20 : 24,
          background: hexWithAlpha(dotColor, isDone ? 0.08 : 0.12),
          border: `1px solid ${hexWithAlpha(dotColor, 0.25)}`,
          borderRadius: 4,
          zIndex: -1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {theme && (
            <span style={{
              fontSize: 9, color: dotColor, fontWeight: 600,
              padding: '0 6px', opacity: 0.85,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{theme}</span>
          )}
        </div>
      )}

      {/* 点（または⭐） */}
      <div
        ref={dotRef}
        onClick={isAdmin ? () => onEdit(milestone) : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: dotSize, height: dotSize,
          borderRadius: isStar ? '0' : '50%',
          backgroundColor: isStar ? 'transparent' : dotColor,
          fontSize: isStar ? dotSize + 2 : undefined,
          lineHeight: isStar ? '1' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: isStar ? 'none' : isDone ? '2px solid #22c55e' : `2px solid ${hexWithAlpha(dotColor, 0.5)}`,
          boxShadow: (isFocus || isStar) && !isDone ? `0 0 0 3px ${hexWithAlpha(dotColor, 0.25)}` : 'none',
          cursor: isAdmin ? 'pointer' : 'default',
          transition: 'transform 0.15s, box-shadow 0.15s',
          userSelect: 'none',
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.35)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {isStar ? '⭐' : isDone ? '✓' : ''}
      </div>

      {/* ツールチップ（position:fixed で確実に表示） */}
      {hovered && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x, top: tooltipPos.y,
          zIndex: 9999,
          pointerEvents: 'none',
          background: T.bgCard,
          border: `1px solid ${T.borderMid}`,
          borderRadius: 10, padding: '14px 16px',
          minWidth: 220, maxWidth: 300,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8, lineHeight: 1.4 }}>
            {isStar ? '⭐ ' : isDone ? '✓ ' : ''}{title}
          </div>
          {theme && (
            <div style={{ fontSize: 11, color: dotColor, fontWeight: 600, marginBottom: 8, padding: '2px 8px', background: hexWithAlpha(dotColor, 0.1), borderRadius: 4, display: 'inline-block' }}>
              {theme}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {due_date && (
              <div style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'center' }}>
                <span style={{ color: T.textMuted, minWidth: 48 }}>期日</span>
                <span style={{ color: T.textSub }}>{due_date}</span>
                {daysText && !isDone && <span style={{ fontSize: 10, fontWeight: 700, ...daysStyle }}>{daysText}</span>}
              </div>
            )}
            {(start_month || end_month) && (
              <div style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'center' }}>
                <span style={{ color: T.textMuted, minWidth: 48 }}>期間</span>
                <span style={{ color: T.textSub }}>
                  {MONTHS_SELECT.find(m => m.value === start_month)?.label || ''}〜{MONTHS_SELECT.find(m => m.value === end_month)?.label || ''}
                </span>
              </div>
            )}
            {owner && (
              <div style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'center' }}>
                <span style={{ color: T.textMuted, minWidth: 48 }}>責任者</span>
                <span style={{ color: T.textSub }}>{owner}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'center' }}>
              <span style={{ color: T.textMuted, minWidth: 48 }}>状態</span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
                color: isDone ? '#22c55e' : isDelayed ? '#dc2626' : '#3b82f6',
                background: isDone ? '#22c55e18' : isDelayed ? '#dc262618' : '#3b82f618',
              }}>
                {isDone ? '完了' : isDelayed ? '遅延' : '進行中'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// MilestoneBar は後方互換のため残す（未使用）
function MilestoneBar({ milestone, orgColor, isChild, onEdit, isAdmin, T, visibleMonthOrder = MONTH_ORDER }) {
  return null
}

// ─── OrgRow ──────────────────────────────────────────────────────────────────
function OrgRow({ org, isChild, onEdit, onAddMilestone, isAdmin, T, visibleMonthOrder = MONTH_ORDER }) {
  const { name, color, milestones } = org
  const n = visibleMonthOrder.length

  // due_dateから月を取得しcolIndex（0〜n-1）に変換
  const getColIndex = (ms) => {
    if (ms.due_date) {
      const m = parseInt(ms.due_date.split('-')[1])
      const idx = visibleMonthOrder.indexOf(m)
      if (idx !== -1) return idx / n + 1 / (n * 2)
    }
    // due_dateがない場合はend_monthを使用
    const idx = visibleMonthOrder.indexOf(ms.end_month)
    return idx !== -1 ? idx / n + 1 / (n * 2) : null
  }

  // sort: 左から右に並べる
  const sorted = [...milestones].sort((a, b) => {
    const ai = getColIndex(a), bi = getColIndex(b)
    return (ai ?? 99) - (bi ?? 99)
  })

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `120px repeat(${n}, minmax(0, 1fr))`,
      gap: 0, borderBottom: `0.5px solid ${T.borderLight}`,
      minHeight: isChild ? 48 : 56, alignItems: 'center',
    }}>
      {/* ラベル列 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: isChild ? '4px 6px 4px 16px' : '4px 8px 4px 0',
        fontSize: isChild ? 10 : 11, fontWeight: 500, color: T.textSub,
        overflow: 'hidden', minWidth: 0,
      }}>
        <span style={{
          width: isChild ? 5 : 7, height: isChild ? 5 : 7,
          borderRadius: '50%', backgroundColor: color || '#888', flexShrink: 0,
        }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
        {isAdmin && (
          <button
            onClick={() => onAddMilestone(org.id)}
            title="マイルストーンを追加"
            style={{
              flexShrink: 0, width: 16, height: 16, borderRadius: '50%',
              border: `1px solid ${T.borderMid}`, background: 'transparent',
              color: T.textMuted, fontSize: 11, lineHeight: '14px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, opacity: 0.5, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
          >+</button>
        )}
      </div>

      {/* タイムライン列（全12列を1つのrelativeコンテナで覆う） */}
      <div style={{
        gridColumn: `2 / ${n + 2}`,
        position: 'relative',
        height: '100%',
        display: 'flex', alignItems: 'center',
      }}>
        {/* 連結ライン（点と点を結ぶ） */}
        {sorted.length >= 2 && sorted.map((ms, i) => {
          if (i === sorted.length - 1) return null
          const x1 = (getColIndex(ms) ?? 0) * 100
          const x2 = (getColIndex(sorted[i+1]) ?? 0) * 100
          return (
            <div key={`line-${ms.id}`} style={{
              position: 'absolute',
              left: `${x1}%`, width: `${x2 - x1}%`,
              top: '50%', height: 1,
              background: hexWithAlpha(color || '#888', 0.3),
              pointerEvents: 'none',
            }} />
          )
        })}

        {/* 各マイルストーンの点 */}
        {sorted.map(ms => {
          const ci = getColIndex(ms)
          if (ci === null) return null
          return (
            <MilestoneDot
              key={ms.id}
              milestone={ms}
              orgColor={color || '#888'}
              isChild={isChild}
              onEdit={onEdit}
              isAdmin={isAdmin}
              T={T}
              colIndex={ci}
              visibleMonthOrder={visibleMonthOrder}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── MilestoneEditModal ──────────────────────────────────────────────────────
function MilestoneEditModal({ milestone, onClose, onSaved, onDeleted, T, members = [] }) {
  const isNew = !milestone.id
  const [form, setForm] = useState({
    title:       milestone.title || '',
    theme:       milestone.theme || '',
    start_month: milestone.start_month || 4,
    end_month:   milestone.end_month || 6,
    start_date:  milestone.start_date || '',
    due_date:    milestone.due_date || '',
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
        const { error } = await supabase.from('milestones').insert({
          ...form,
          org_id: milestone.org_id,
          fiscal_year: milestone.fiscal_year,
          sort_order: milestone.sort_order || 0,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('milestones').update(form).eq('id', milestone.id)
        if (error) throw error
      }
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
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
      const { error } = await supabase.from('milestones').delete().eq('id', milestone.id)
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
          {isNew ? 'マイルストーンを追加' : 'マイルストーンを編集'}
        </p>

        <label style={labelSt}>タイトル</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputSt} placeholder="マイルストーン名を入力" autoFocus />

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>開始月</label>
            <select value={form.start_month} onChange={e => setForm(f => ({ ...f, start_month: Number(e.target.value) }))} style={inputSt}>
              {MONTHS_SELECT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>終了月</label>
            <select value={form.end_month} onChange={e => setForm(f => ({ ...f, end_month: Number(e.target.value) }))} style={inputSt}>
              {MONTHS_SELECT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>開始日</label>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>期日（カウントダウン用）</label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }} />
          </div>
        </div>

        <label style={{ ...labelSt, marginTop: 12 }}>注力レベル</label>
        <select value={form.focus_level} onChange={e => setForm(f => ({ ...f, focus_level: e.target.value }))} style={inputSt}>
          <option value="star">⭐ 最重要（星マーク）</option>
          <option value="focus">focus（濃色・最注力）</option>
          <option value="normal">normal（薄色・進行中）</option>
        </select>

        <label style={labelSt}>テーマ（取り組み内容）</label>
        <input value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} style={inputSt} placeholder="例：二期生集客、AI研修販売" />

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

  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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
      const { data, error: err } = await supabase
        .from('milestones')
        .select('*')
        .eq('fiscal_year', fy)
        .order('sort_order', { ascending: true })
      if (err) throw err
      setMilestones(data || [])
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

    return parentLevels.map(parent => ({
      id: parent.id,
      name: parent.name,
      color: parent.color || '#888888',
      milestones: milestones.filter(m => Number(m.org_id) === Number(parent.id)),
      children: childLevels
        .filter(c => Number(c.parent_id) === Number(parent.id))
        .map(child => ({
          id: child.id,
          name: child.name,
          color: child.color || '#888888',
          milestones: milestones.filter(m => Number(m.org_id) === Number(child.id)),
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
      start_month: 4,
      end_month: 6,
      due_date: '',
      focus_level: 'normal',
      status: 'pending',
      owner: '',
      sort_order: milestones.length,
    })
  }, [fiscalYear, milestones.length])

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
        const visibleGridCols = `120px repeat(${visibleMonthOrder.length}, minmax(0, 1fr))`
        // 四半期表示時はそのQ内のマイルストーンのみ表示
        const filterMs = (ms) => {
          if (!qMonths) return ms
          return ms.filter(m => {
            const sm = m.start_month || m.end_month
            const em = m.end_month
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
          borderRadius: 12, padding: 16, overflow: 'hidden', width: '100%',
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
              <div key={org.id} style={{ display: 'contents' }}>
                <OrgRow org={org} isChild={false} onEdit={handleEdit} onAddMilestone={handleAddMilestone} isAdmin={isAdmin} T={T} />
                {org.children.map(child => (
                  <OrgRow key={child.id} org={{ ...child, milestones: filterMs(child.milestones) }} isChild={true} onEdit={handleEdit} onAddMilestone={handleAddMilestone} isAdmin={isAdmin} T={T} />
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

      {/* 編集/追加モーダル */}
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
