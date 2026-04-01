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

// ─── MilestoneBar ────────────────────────────────────────────────────────────
function MilestoneBar({ milestone, orgColor, isChild, onEdit, isAdmin, T }) {
  const { title, due_date, focus_level, status } = milestone

  const startCol = MONTH_ORDER.indexOf(milestone.start_month) + 2
  const endCol   = MONTH_ORDER.indexOf(milestone.end_month) + 3

  const { text: daysText, style: daysStyle } = getDaysLeftInfo(due_date)

  const isDone    = status === 'done'
  const isDelayed = status === 'delayed'
  const isFocus   = focus_level === 'focus' && !isDone

  const barBg = isDone
    ? { backgroundColor: T.textFaintest, color: T.textMuted, opacity: 0.7 }
    : isFocus
    ? { backgroundColor: orgColor, color: '#ffffff',
        outline: isDelayed ? '2px solid #dc2626' : 'none', outlineOffset: '1px' }
    : { backgroundColor: hexWithAlpha(orgColor, 0.12), color: orgColor,
        border: `0.5px solid ${hexWithAlpha(orgColor, 0.35)}`,
        outline: isDelayed ? '2px solid #dc2626' : 'none', outlineOffset: '1px' }

  return (
    <div style={{ gridColumn: `${startCol} / ${endCol}`, padding: isChild ? '2px 4px' : '4px', alignSelf: 'center' }}>
      <div
        onClick={isAdmin ? () => onEdit(milestone) : undefined}
        style={{
          ...barBg, borderRadius: 4, padding: '4px 7px',
          fontSize: isChild ? 9 : 10, fontWeight: 500, lineHeight: '1.3',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          overflow: 'hidden', whiteSpace: 'nowrap',
          cursor: isAdmin ? 'pointer' : 'default', transition: 'opacity 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {isDone ? '✓ ' : ''}{title}
        </span>
        {daysText && !isDone && (
          <span style={{ flexShrink: 0, fontSize: 9, ...daysStyle }}>{daysText}</span>
        )}
      </div>
    </div>
  )
}

// ─── OrgRow ──────────────────────────────────────────────────────────────────
function OrgRow({ org, isChild, onEdit, isAdmin, T }) {
  const { name, color, milestones } = org
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${isChild ? '72px' : '88px'} repeat(12, 1fr)`,
      gap: 0, borderBottom: `0.5px solid ${T.borderLight}`,
      minHeight: isChild ? 36 : 44, alignItems: 'center', position: 'relative',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: isChild ? '4px 6px 4px 16px' : '4px 8px 4px 0',
        fontSize: isChild ? 10 : 11, fontWeight: 500, color: T.textSub,
      }}>
        <span style={{
          width: isChild ? 5 : 7, height: isChild ? 5 : 7,
          borderRadius: '50%', backgroundColor: color || '#888', flexShrink: 0,
        }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </div>
      {milestones.map(ms => (
        <MilestoneBar key={ms.id} milestone={ms} orgColor={color || '#888'} isChild={isChild} onEdit={onEdit} isAdmin={isAdmin} T={T} />
      ))}
    </div>
  )
}

// ─── MilestoneEditModal ──────────────────────────────────────────────────────
function MilestoneEditModal({ milestone, onClose, onSaved, T }) {
  const [form, setForm] = useState({
    title:       milestone.title,
    start_month: milestone.start_month,
    end_month:   milestone.end_month,
    due_date:    milestone.due_date || '',
    focus_level: milestone.focus_level,
    status:      milestone.status,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase.from('milestones').update(form).eq('id', milestone.id)
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
        <p style={{ fontWeight: 500, marginBottom: 16, fontSize: 14, color: T.text }}>マイルストーンを編集</p>

        <label style={labelSt}>タイトル</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputSt} />

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

        <label style={labelSt}>期日（残日数カウントダウン用）</label>
        <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputSt} />

        <label style={labelSt}>注力レベル</label>
        <select value={form.focus_level} onChange={e => setForm(f => ({ ...f, focus_level: e.target.value }))} style={inputSt}>
          <option value="focus">focus（濃色・最注力）</option>
          <option value="normal">normal（薄色・進行中）</option>
        </select>

        <label style={labelSt}>ステータス</label>
        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputSt}>
          <option value="pending">進行中</option>
          <option value="done">完了</option>
          <option value="delayed">遅延</option>
        </select>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 8, border: `0.5px solid ${T.borderMid}`, borderRadius: 6,
            cursor: 'pointer', background: 'transparent', fontSize: 13, color: T.textSub, fontFamily: 'inherit',
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: 8, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: T.text, color: T.bgCard, fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          }}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── MilestonePage（メインコンポーネント）────────────────────────────────────
export default function MilestonePage({ levels, themeKey, fiscalYear, user }) {
  const T = W_THEMES[themeKey] || DARK_T

  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

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

  // マイルストーンを持つ組織のみ表示
  const filteredTree = orgTree.filter(org =>
    org.milestones.length > 0 || org.children.some(c => c.milestones.length > 0)
  ).map(org => ({
    ...org,
    children: org.children.filter(c => c.milestones.length > 0),
  }))

  const handleEdit = useCallback((ms) => {
    if (isAdmin) setEditTarget(ms)
  }, [isAdmin])

  const currentMonth = new Date().getMonth() + 1
  const currentColIndex = MONTH_ORDER.indexOf(currentMonth)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: T.text, margin: 0 }}>年間マイルストーン</h1>
        <span style={{ fontSize: 12, color: T.textMuted }}>{fiscalYear}年度（4月〜翌3月）</span>
      </div>

      {/* ローディング / エラー */}
      {loading && <div style={{ color: T.textMuted, fontSize: 13 }}>読み込み中...</div>}
      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>エラー: {error}</div>}

      {/* タイムライン本体 */}
      {!loading && !error && (
        <div style={{
          background: T.bgCard, border: `0.5px solid ${T.borderLight}`,
          borderRadius: 12, padding: 16, overflowX: 'auto', minWidth: 0,
        }}>
          <div style={{ minWidth: 700 }}>
            {/* Q ヘッダー行 */}
            <div style={{ display: 'grid', gridTemplateColumns: '88px repeat(12, 1fr)', gap: 0 }}>
              <div />
              {QUARTERS.map((q, i) => (
                <div key={q.label} style={{
                  gridColumn: `span ${q.span}`, textAlign: 'center',
                  fontSize: 11, fontWeight: 500, color: T.textSub,
                  padding: '4px 2px 2px', borderBottom: `0.5px solid ${T.borderLight}`,
                  borderLeft: i > 0 ? `0.5px solid ${T.borderLight}` : 'none',
                }}>
                  {q.label}
                  <span style={{ fontWeight: 400, color: T.textMuted, marginLeft: 4 }}>{q.months}</span>
                </div>
              ))}
            </div>

            {/* 月ヘッダー行 */}
            <div style={{ display: 'grid', gridTemplateColumns: '88px repeat(12, 1fr)', gap: 0 }}>
              <div style={{ borderBottom: `0.5px solid ${T.borderLight}` }} />
              {MONTH_LABELS.map((label, i) => {
                const isCurrent = i === currentColIndex
                const isQStart = i % 3 === 0
                return (
                  <div key={label} style={{
                    textAlign: 'center', fontSize: 10,
                    color: isCurrent ? T.text : T.textMuted,
                    fontWeight: isCurrent ? 600 : 400,
                    padding: '3px 2px 6px',
                    borderBottom: `0.5px solid ${T.borderLight}`,
                    borderLeft: isQStart ? `0.5px solid ${T.borderLight}` : 'none',
                    backgroundColor: isCurrent ? 'rgba(220, 50, 50, 0.04)' : 'transparent',
                    position: 'relative',
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
                <OrgRow org={org} isChild={false} onEdit={handleEdit} isAdmin={isAdmin} T={T} />
                {org.children.map(child => (
                  <OrgRow key={child.id} org={child} isChild={true} onEdit={handleEdit} isAdmin={isAdmin} T={T} />
                ))}
              </div>
            ))}

            {filteredTree.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
                マイルストーンがありません
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
              <span style={{ marginLeft: 'auto' }}>バーをクリックして編集</span>
            )}
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <MilestoneEditModal
          milestone={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={loadMilestones}
          T={T}
        />
      )}
    </div>
  )
}
